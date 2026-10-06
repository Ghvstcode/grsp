#!/usr/bin/env node
/**
 * pnpm eval — runs the real grsp pipelines against the fixture repos and
 * scores what comes back. Uses your Claude Code or Codex subscription, so
 * it is local and on demand, never part of CI.
 *
 *   pnpm eval                                  all fixtures, default agent
 *   pnpm eval --fixture orders-approval        one fixture (repeatable)
 *   pnpm eval --agent codex                    claude | codex
 *   pnpm eval --pipelines discovery,walkthrough
 *   pnpm eval --replay evals/reports/<file>    re-score a saved report, no agent
 *
 * For each fixture it builds evals/.repos/<name> (main = base, pr = head),
 * runs the headless `grsp-eval` binary, scores the JSON document it prints
 * against expected.json, and prints one PASS/FAIL line per expectation plus
 * verification stats. Exit code is non-zero when anything failed. A
 * timestamped report is written to evals/reports/.
 */
import { spawn } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

import {
    BASE_BRANCH,
    HEAD_BRANCH,
    REPOS_DIR,
    buildFixture,
    listFixtures,
    readFixture,
} from "./build-fixtures.mjs";
import { SECTIONS, formatScore, scoreFixture } from "./scorer.mjs";

const EVALS_DIR = path.dirname(fileURLToPath(import.meta.url));
const ROOT_DIR = path.dirname(EVALS_DIR);
const REPORTS_DIR = path.join(EVALS_DIR, "reports");
const MANIFEST = path.join(ROOT_DIR, "src-tauri", "Cargo.toml");
const AGENTS = ["claude", "codex"];
/** Pipelines grsp-eval understands; "walkthrough" etc. double as scorer sections. */
const PIPELINES = SECTIONS;

const HELP = `Usage: pnpm eval [options]

  --fixture <name>      Run one fixture (repeatable, or comma-separated). Default: all.
  --agent <name>        claude | codex. Default: the eval binary's default.
  --pipelines <list>    Comma-separated subset of: ${PIPELINES.join(", ")}.
  --timeout <minutes>   Give up on a fixture after this long. Default: 30.
  --bin <path>          Use a prebuilt grsp-eval binary instead of \`cargo run\`
                        (also: GRSP_EVAL_BIN).
  --replay <report>     Re-score the outputs saved in a report; runs no agent.
  --list                List the fixtures and exit.
  -h, --help            Show this help.
`;

export function parseArgs(argv) {
    const options = {
        fixtures: [],
        agent: undefined,
        pipelines: undefined,
        timeoutMinutes: 30,
        bin: process.env.GRSP_EVAL_BIN || undefined,
        replay: undefined,
        list: false,
        help: false,
    };
    const value = (i, flag) => {
        if (argv[i + 1] === undefined) throw new Error(`${flag} needs a value`);
        return argv[i + 1];
    };
    for (let i = 0; i < argv.length; i++) {
        const arg = argv[i];
        if (arg === "--") continue;
        if (arg === "--fixture")
            options.fixtures.push(
                ...value(i++, arg).split(",").filter(Boolean),
            );
        else if (arg === "--agent") options.agent = value(i++, arg);
        else if (arg === "--pipelines")
            options.pipelines = value(i++, arg)
                .split(",")
                .map((p) => p.trim())
                .filter(Boolean);
        else if (arg === "--timeout")
            options.timeoutMinutes = Number(value(i++, arg));
        else if (arg === "--bin") options.bin = value(i++, arg);
        else if (arg === "--replay") options.replay = value(i++, arg);
        else if (arg === "--list") options.list = true;
        else if (arg === "--help" || arg === "-h") options.help = true;
        else throw new Error(`Unknown argument: ${arg}\n\n${HELP}`);
    }
    if (options.agent !== undefined && !AGENTS.includes(options.agent)) {
        throw new Error(`--agent must be one of: ${AGENTS.join(", ")}`);
    }
    for (const pipeline of options.pipelines ?? []) {
        if (!PIPELINES.includes(pipeline)) {
            throw new Error(
                `Unknown pipeline "${pipeline}". Use: ${PIPELINES.join(", ")}`,
            );
        }
    }
    if (
        !Number.isFinite(options.timeoutMinutes) ||
        options.timeoutMinutes <= 0
    ) {
        throw new Error("--timeout must be a positive number of minutes");
    }
    return options;
}

/** Arguments for grsp-eval (everything after `--` when run through cargo). */
export function evalArgs({
    repoDir,
    title,
    descriptionFile,
    agent,
    pipelines,
    questions,
}) {
    const args = [
        "--repo",
        repoDir,
        "--base",
        BASE_BRANCH,
        "--head",
        HEAD_BRANCH,
        "--title",
        title,
        "--description-file",
        descriptionFile,
    ];
    if (agent) args.push("--agent", agent);
    if (pipelines && pipelines.length > 0)
        args.push("--pipelines", pipelines.join(","));
    const askEnabled =
        !pipelines || pipelines.length === 0 || pipelines.includes("ask");
    if (askEnabled)
        for (const question of questions) args.push("--ask", question);
    return args;
}

/** cargo is often not on PATH in a GUI-launched shell; look in the usual places. */
function findCargo() {
    if (process.env.CARGO) return process.env.CARGO;
    const candidates = [path.join(os.homedir(), ".cargo", "bin", "cargo")];
    const toolchains = path.join(os.homedir(), ".rustup", "toolchains");
    if (fs.existsSync(toolchains)) {
        for (const name of fs.readdirSync(toolchains).sort().reverse()) {
            candidates.push(path.join(toolchains, name, "bin", "cargo"));
        }
    }
    const onPath = (process.env.PATH ?? "")
        .split(path.delimiter)
        .some((dir) => dir && fs.existsSync(path.join(dir, "cargo")));
    if (onPath) return "cargo";
    return candidates.find((candidate) => fs.existsSync(candidate)) ?? "cargo";
}

function runProcess(command, args, { timeoutMs, env }) {
    return new Promise((resolve) => {
        const child = spawn(command, args, {
            cwd: ROOT_DIR,
            env,
            stdio: ["ignore", "pipe", "inherit"],
        });
        let stdout = "";
        let timedOut = false;
        const timer = setTimeout(() => {
            timedOut = true;
            child.kill("SIGTERM");
        }, timeoutMs);
        child.stdout.setEncoding("utf8");
        child.stdout.on("data", (chunk) => (stdout += chunk));
        child.on("error", (error) => {
            clearTimeout(timer);
            resolve({
                stdout,
                exitCode: undefined,
                error: error.message,
                timedOut,
            });
        });
        child.on("close", (exitCode) => {
            clearTimeout(timer);
            resolve({ stdout, exitCode: exitCode ?? undefined, timedOut });
        });
    });
}

/**
 * grsp-eval prints one JSON document on stdout. Be forgiving about stray
 * log lines before or after it.
 */
export function parseEvalOutput(stdout) {
    const trimmed = stdout.trim();
    if (trimmed === "") throw new Error("grsp-eval printed nothing on stdout");
    try {
        return JSON.parse(trimmed);
    } catch {
        const start = trimmed.search(/^\{/m);
        const end = trimmed.lastIndexOf("}");
        if (start !== -1 && end > start) {
            return JSON.parse(trimmed.slice(start, end + 1));
        }
        throw new Error(
            `grsp-eval output is not JSON: ${trimmed.slice(0, 200)}`,
        );
    }
}

async function runFixture(name, options) {
    const fixture = readFixture(name);
    const built = buildFixture(name);
    const descriptionFile = path.join(REPOS_DIR, `${name}.description.md`);
    fs.writeFileSync(descriptionFile, fixture.pr.description);

    const args = evalArgs({
        repoDir: built.repoDir,
        title: fixture.pr.title,
        descriptionFile,
        agent: options.agent,
        pipelines: options.pipelines,
        questions: fixture.pr.ask,
    });
    const [command, commandArgs] = options.bin
        ? [options.bin, args]
        : [
              findCargo(),
              [
                  "run",
                  "--quiet",
                  "--manifest-path",
                  MANIFEST,
                  "--example",
                  "grsp-eval",
                  "--",
                  ...args,
              ],
          ];

    console.error(
        `\n▸ ${name}: ${built.changedFiles.length} files changed, head ${built.headSha.slice(0, 7)}`,
    );
    const startedAt = Date.now();
    const run = await runProcess(command, commandArgs, {
        timeoutMs: options.timeoutMinutes * 60_000,
        env: process.env,
    });
    const durationMs = Date.now() - startedAt;

    let output;
    let runError;
    if (run.timedOut)
        runError = `timed out after ${options.timeoutMinutes} minutes`;
    else if (run.error) runError = `could not start ${command}: ${run.error}`;
    else {
        try {
            output = parseEvalOutput(run.stdout);
        } catch (error) {
            runError = `${error instanceof Error ? error.message : error} (exit code ${run.exitCode})`;
        }
    }

    return {
        name,
        headSha: built.headSha,
        durationMs,
        exitCode: run.exitCode,
        runError,
        output,
        expected: fixture.expected,
    };
}

function scoreRun(run, pipelines) {
    if (run.output === undefined) {
        return {
            checks: [
                {
                    section: "run",
                    name: "grsp-eval produced output",
                    status: "fail",
                    detail: run.runError,
                },
            ],
            stats: {
                verified: 0,
                dropped: 0,
                unverified: 0,
                filesExplored: 0,
                agentPasses: undefined,
            },
            passed: 0,
            failed: 1,
            skipped: 0,
        };
    }
    return scoreFixture(run.expected, run.output, { pipelines });
}

function timestamp(date) {
    const pad = (n) => String(n).padStart(2, "0");
    return (
        `${date.getFullYear()}${pad(date.getMonth() + 1)}${pad(date.getDate())}-` +
        `${pad(date.getHours())}${pad(date.getMinutes())}${pad(date.getSeconds())}`
    );
}

function summarise(results) {
    const totals = {
        passed: 0,
        failed: 0,
        skipped: 0,
        verified: 0,
        dropped: 0,
        unverified: 0,
    };
    for (const { score } of results) {
        totals.passed += score.passed;
        totals.failed += score.failed;
        totals.skipped += score.skipped;
        totals.verified += score.stats.verified;
        totals.dropped += score.stats.dropped;
        totals.unverified += score.stats.unverified;
    }
    return totals;
}

function printSummary(results, totals) {
    console.log("\nSummary");
    for (const { name, score, durationMs } of results) {
        const seconds =
            durationMs === undefined
                ? ""
                : `  ${(durationMs / 1000).toFixed(0)}s`;
        console.log(
            `  ${score.failed === 0 ? "PASS" : "FAIL"}  ${name.padEnd(18)} ` +
                `${score.passed}/${score.passed + score.failed} expectations` +
                (score.skipped ? `, ${score.skipped} skipped` : "") +
                seconds,
        );
    }
    console.log(
        `\n${totals.passed} passed, ${totals.failed} failed, ${totals.skipped} skipped · ` +
            `${totals.verified} references verified, ${totals.dropped} dropped, ${totals.unverified} unverified`,
    );
}

async function main(argv) {
    const options = parseArgs(argv);
    if (options.help) {
        console.log(HELP);
        return 0;
    }
    if (options.list) {
        for (const name of listFixtures()) console.log(name);
        return 0;
    }

    const results = [];
    let reportMeta;

    if (options.replay) {
        const saved = JSON.parse(
            fs.readFileSync(path.resolve(options.replay), "utf8"),
        );
        const pipelines = options.pipelines ?? saved.pipelines ?? undefined;
        for (const entry of saved.fixtures ?? []) {
            if (
                options.fixtures.length > 0 &&
                !options.fixtures.includes(entry.name)
            )
                continue;
            // Score against the current expected.json so expectations can be tuned offline.
            const run = {
                ...entry,
                expected: readFixture(entry.name).expected,
            };
            results.push({
                name: entry.name,
                durationMs: entry.durationMs,
                run,
                score: scoreRun(run, pipelines),
            });
        }
    } else {
        const all = listFixtures();
        const names = options.fixtures.length > 0 ? options.fixtures : all;
        for (const name of names) {
            if (!all.includes(name))
                throw new Error(
                    `Unknown fixture "${name}". Available: ${all.join(", ")}`,
                );
        }
        const startedAt = new Date();
        for (const name of names) {
            const run = await runFixture(name, options);
            const score = scoreRun(run, options.pipelines);
            results.push({ name, durationMs: run.durationMs, run, score });
            console.log(formatScore(name, score));
        }
        reportMeta = { startedAt };
    }

    if (options.replay)
        for (const { name, score } of results)
            console.log(formatScore(name, score));

    const totals = summarise(results);
    printSummary(results, totals);

    if (reportMeta) {
        fs.mkdirSync(REPORTS_DIR, { recursive: true });
        const file = path.join(
            REPORTS_DIR,
            `${timestamp(reportMeta.startedAt)}-${options.agent ?? "default"}.json`,
        );
        const report = {
            startedAt: reportMeta.startedAt.toISOString(),
            agent: options.agent ?? "default",
            pipelines: options.pipelines,
            totals,
            fixtures: results.map(({ name, run, score }) => ({
                name,
                headSha: run.headSha,
                durationMs: run.durationMs,
                exitCode: run.exitCode,
                runError: run.runError,
                passed: score.passed,
                failed: score.failed,
                skipped: score.skipped,
                stats: score.stats,
                checks: score.checks,
                output: run.output,
            })),
        };
        fs.writeFileSync(file, `${JSON.stringify(report, null, 2)}\n`);
        console.log(`\nReport: ${path.relative(process.cwd(), file)}`);
    }

    return totals.failed === 0 && results.length > 0 ? 0 : 1;
}

if (
    process.argv[1] &&
    path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
    main(process.argv.slice(2)).then(
        (code) => process.exit(code),
        (error) => {
            console.error(error instanceof Error ? error.message : error);
            process.exit(2);
        },
    );
}
