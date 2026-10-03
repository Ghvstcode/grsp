#!/usr/bin/env node
/**
 * Materialises every fixture under evals/fixtures/<name>/ as a real git
 * repository under evals/.repos/<name>:
 *
 *   main  one commit containing base/
 *   pr    one commit on top of main that turns the tree into head/
 *
 * Author, committer and dates are fixed, and the user's git config is
 * ignored, so the commit SHAs are the same on every machine. That keeps
 * grsp's headSha-keyed cache comparable between eval runs.
 *
 * Usage: node evals/build-fixtures.mjs [--fixture <name>] [--out <dir>]
 */
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const EVALS_DIR = path.dirname(fileURLToPath(import.meta.url));

export const FIXTURES_DIR = path.join(EVALS_DIR, "fixtures");
export const REPOS_DIR = path.join(EVALS_DIR, ".repos");

export const BASE_BRANCH = "main";
export const HEAD_BRANCH = "pr";

const BASE_DATE = "2025-01-06T09:00:00Z";
const HEAD_DATE = "2025-01-07T09:00:00Z";
const BASE_AUTHOR = { name: "grsp evals", email: "evals@grsp.app" };

/** Names of every fixture that has both a base/ and a head/ tree. */
export function listFixtures(fixturesDir = FIXTURES_DIR) {
    if (!fs.existsSync(fixturesDir)) return [];
    return fs
        .readdirSync(fixturesDir, { withFileTypes: true })
        .filter((entry) => entry.isDirectory())
        .map((entry) => entry.name)
        .filter(
            (name) =>
                fs.existsSync(path.join(fixturesDir, name, "base")) &&
                fs.existsSync(path.join(fixturesDir, name, "head")),
        )
        .sort();
}

/** Reads pr.json and expected.json for one fixture. */
export function readFixture(name, fixturesDir = FIXTURES_DIR) {
    const dir = path.join(fixturesDir, name);
    const readJson = (file) =>
        JSON.parse(fs.readFileSync(path.join(dir, file), "utf8"));
    const pr = readJson("pr.json");
    if (typeof pr.title !== "string" || pr.title.trim() === "") {
        throw new Error(`${name}/pr.json needs a "title"`);
    }
    return {
        name,
        dir,
        pr: {
            title: pr.title,
            description: pr.description ?? "",
            author: pr.author ?? "author",
            ask: Array.isArray(pr.ask) ? pr.ask : [],
        },
        expected: readJson("expected.json"),
    };
}

function git(cwd, args, extraEnv = {}) {
    return execFileSync(
        "git",
        [
            "-c",
            "core.autocrlf=false",
            "-c",
            "commit.gpgsign=false",
            "-c",
            "core.hooksPath=/dev/null",
            "-c",
            "init.defaultBranch=main",
            ...args,
        ],
        {
            cwd,
            encoding: "utf8",
            stdio: ["ignore", "pipe", "pipe"],
            env: {
                ...process.env,
                // Ignore the user's and the system's git config.
                GIT_CONFIG_GLOBAL: "/dev/null",
                GIT_CONFIG_SYSTEM: "/dev/null",
                GIT_CONFIG_NOSYSTEM: "1",
                GIT_TERMINAL_PROMPT: "0",
                ...extraEnv,
            },
        },
    ).trim();
}

function identity(author, date) {
    return {
        GIT_AUTHOR_NAME: author.name,
        GIT_AUTHOR_EMAIL: author.email,
        GIT_AUTHOR_DATE: date,
        GIT_COMMITTER_NAME: author.name,
        GIT_COMMITTER_EMAIL: author.email,
        GIT_COMMITTER_DATE: date,
    };
}

/** Removes everything in the work tree except .git. */
function clearWorkTree(repoDir) {
    for (const entry of fs.readdirSync(repoDir)) {
        if (entry === ".git") continue;
        fs.rmSync(path.join(repoDir, entry), { recursive: true, force: true });
    }
}

function copyTree(from, to) {
    fs.cpSync(from, to, {
        recursive: true,
        filter: (src) => path.basename(src) !== ".DS_Store",
    });
}

/**
 * Builds one fixture repo from scratch and returns where it is and which
 * commits it contains.
 */
export function buildFixture(
    name,
    { fixturesDir = FIXTURES_DIR, reposDir = REPOS_DIR } = {},
) {
    const fixture = readFixture(name, fixturesDir);
    const repoDir = path.join(reposDir, name);

    fs.rmSync(repoDir, { recursive: true, force: true });
    fs.mkdirSync(repoDir, { recursive: true });

    git(repoDir, ["init", "--quiet", "--initial-branch", BASE_BRANCH]);

    copyTree(path.join(fixture.dir, "base"), repoDir);
    git(repoDir, ["add", "--all"]);
    git(
        repoDir,
        ["commit", "--quiet", "--message", "Initial commit"],
        identity(BASE_AUTHOR, BASE_DATE),
    );
    const baseSha = git(repoDir, ["rev-parse", "HEAD"]);

    git(repoDir, ["checkout", "--quiet", "-b", HEAD_BRANCH]);
    clearWorkTree(repoDir);
    copyTree(path.join(fixture.dir, "head"), repoDir);
    git(repoDir, ["add", "--all"]);
    const message = fixture.pr.description
        ? `${fixture.pr.title}\n\n${fixture.pr.description.trim()}\n`
        : fixture.pr.title;
    git(
        repoDir,
        ["commit", "--quiet", "--message", message],
        identity(
            {
                name: fixture.pr.author,
                email: `${fixture.pr.author}@users.noreply.example.com`,
            },
            HEAD_DATE,
        ),
    );
    const headSha = git(repoDir, ["rev-parse", "HEAD"]);

    // Leave the repo on main so `pr` is free for a worktree checkout.
    git(repoDir, ["checkout", "--quiet", BASE_BRANCH]);

    const changedFiles = git(repoDir, [
        "diff",
        "--name-status",
        "--find-renames",
        `${BASE_BRANCH}..${HEAD_BRANCH}`,
    ])
        .split("\n")
        .filter(Boolean);

    return {
        name,
        repoDir,
        baseRef: BASE_BRANCH,
        headRef: HEAD_BRANCH,
        baseSha,
        headSha,
        changedFiles,
    };
}

/** Builds the named fixtures (all of them when `names` is empty). */
export function buildFixtures(names = [], options = {}) {
    const all = listFixtures(options.fixturesDir);
    const wanted = names.length > 0 ? names : all;
    for (const name of wanted) {
        if (!all.includes(name)) {
            throw new Error(
                `Unknown fixture "${name}". Available: ${all.join(", ") || "(none)"}`,
            );
        }
    }
    return wanted.map((name) => buildFixture(name, options));
}

function main(argv) {
    const names = [];
    const options = {};
    for (let i = 0; i < argv.length; i++) {
        if (argv[i] === "--fixture") names.push(...argv[++i].split(","));
        else if (argv[i] === "--out")
            options.reposDir = path.resolve(argv[++i]);
        else if (argv[i] === "--help" || argv[i] === "-h") {
            console.log(
                "Usage: node evals/build-fixtures.mjs [--fixture <name>] [--out <dir>]",
            );
            return;
        } else throw new Error(`Unknown argument: ${argv[i]}`);
    }
    for (const built of buildFixtures(names, options)) {
        console.log(
            `${built.name}: ${path.relative(process.cwd(), built.repoDir)}  ` +
                `main ${built.baseSha.slice(0, 7)}  pr ${built.headSha.slice(0, 7)}  ` +
                `(${built.changedFiles.length} files changed)`,
        );
    }
}

if (
    process.argv[1] &&
    path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
    try {
        main(process.argv.slice(2));
    } catch (error) {
        console.error(error instanceof Error ? error.message : error);
        process.exit(1);
    }
}
