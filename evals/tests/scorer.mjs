import assert from "node:assert/strict";
import { test } from "node:test";

import { listFixtures, readFixture } from "../build-fixtures.mjs";
import { evalArgs, parseArgs, parseEvalOutput } from "../run.mjs";
import {
    collectStats,
    findWhatIfOption,
    formatScore,
    scoreFixture,
    toRegExp,
    unwrapAnalysis,
} from "../scorer.mjs";
import { sampleOutput } from "./sample-output.mjs";

const expected = readFixture("orders-approval").expected;

const failures = (score) =>
    score.checks.filter((c) => c.status === "fail").map((c) => c.name);

test("a good run of the prototype scenario passes every expectation", () => {
    const score = scoreFixture(expected, sampleOutput());
    assert.deepEqual(failures(score), []);
    assert.ok(
        score.passed > 30,
        `expected a meaningful number of checks, got ${score.passed}`,
    );
    assert.equal(score.skipped, 0);
});

test("verification stats are summed across analyses and ask messages", () => {
    const stats = collectStats(sampleOutput());
    assert.deepEqual(stats, {
        verified: 30,
        dropped: 1,
        unverified: 0,
        filesExplored: 23,
        agentPasses: 7,
    });
});

test("missing the bulk-import gap fails the gap and mismatch expectations", () => {
    const output = sampleOutput();
    output.discovery.result.gaps = [];
    output.discovery.result.mismatches = [];
    output.discovery.result.entryPoints =
        output.discovery.result.entryPoints.filter((ep) => ep.id !== "ep3");
    const failed = failures(scoreFixture(expected, output));
    assert.ok(failed.some((name) => name.startsWith("gap /BulkImportJob")));
    assert.ok(failed.some((name) => name.startsWith("gap count")));
    assert.ok(failed.some((name) => name.startsWith("mismatch count")));
    assert.ok(
        failed.some((name) => name.startsWith("what's affected includes")),
    );
});

test("an invented second mismatch fails the mismatch count", () => {
    const output = sampleOutput();
    output.discovery.result.mismatches.push({
        id: "m2",
        claim: "Approvers get an email.",
        reality: "No email is sent.",
        refs: [{ file: "approvals/notify.py", startLine: 17, verified: true }],
    });
    assert.deepEqual(failures(scoreFixture(expected, output)), [
        "mismatch count in 1–1",
    ]);
});

test("a gap shown without an entry point still counts as a Not covered row", () => {
    const output = sampleOutput();
    output.discovery.result.entryPoints =
        output.discovery.result.entryPoints.filter((ep) => ep.id !== "ep3");
    assert.deepEqual(failures(scoreFixture(expected, output)), []);
});

test("unverified refs and a poor verification report are caught", () => {
    const output = sampleOutput();
    output.discovery.result.entryPoints[1].ref.verified = false;
    output.discovery.verification = {
        verified: 6,
        dropped: 3,
        unverified: 1,
        notes: [],
    };
    const failed = failures(scoreFixture(expected, output));
    assert.ok(failed.includes("every shown item carries a verified ref"));
    assert.ok(failed.includes("unverified ratio ≤ 0.2"));
});

test("what-if paths: the €9,999 option must not reach the approval branch", () => {
    const output = sampleOutput();
    const options = output.walkthroughs.ep1.result.whatIf.options;
    options[0].path = options[2].path;
    const failed = failures(scoreFixture(expected, output));
    assert.ok(
        failed.some((name) => name.includes("what-if €9,999 goes through")),
    );
    assert.ok(failed.some((name) => name.includes("what-if €9,999 avoids")));
});

test("what-if: the optional €10,000 option is skipped when the agent offers two options", () => {
    const output = sampleOutput();
    const whatIf = output.walkthroughs.ep1.result.whatIf;
    whatIf.options = whatIf.options.filter(
        (option) => option.label !== "€10,000",
    );
    const score = scoreFixture(expected, output);
    assert.deepEqual(failures(score), []);
    assert.equal(score.skipped, 1);
});

test("what-if: a path id that is not a block fails the invariant", () => {
    const output = sampleOutput();
    output.walkthroughs.ep1.result.whatIf.options[2].path.push("b99");
    assert.ok(
        failures(scoreFixture(expected, output)).some((name) =>
            name.includes("every path id exists"),
        ),
    );
});

test("a missing or failed walkthrough fails instead of throwing", () => {
    const output = sampleOutput();
    output.walkthroughs = {};
    assert.ok(
        failures(scoreFixture(expected, output)).some((name) =>
            name.includes("walkthrough for"),
        ),
    );
    output.walkthroughs = {
        ep1: {
            sessionId: "s1",
            kind: "walkthrough:ep1",
            status: "error",
            error: "timed out",
        },
    };
    const score = scoreFixture(expected, output);
    const check = score.checks.find((c) => c.name.includes("walkthrough for"));
    assert.equal(check.status, "fail");
    assert.match(check.detail, /timed out/);
});

test("ask: answering an off-repo question as if grounded fails", () => {
    const output = sampleOutput();
    output.ask[2].answer.grounded = true;
    assert.deepEqual(failures(scoreFixture(expected, output)), [
        '"How does this PR change the Kubernetes autoscali" grounded = false',
    ]);
});

test("ask: a question that was never asked fails", () => {
    const output = sampleOutput();
    output.ask = output.ask.slice(1);
    assert.ok(
        failures(scoreFixture(expected, output)).some((name) =>
            name.endsWith("was asked"),
        ),
    );
});

test("review: the bulk-import finding must be blocking", () => {
    const output = sampleOutput();
    output.review.result.findings[0].severity = "nit";
    assert.deepEqual(failures(scoreFixture(expected, output)), [
        "finding /bulk|import/ is blocking",
    ]);
});

test("--pipelines limits which sections are scored", () => {
    const output = { discovery: sampleOutput().discovery };
    const score = scoreFixture(expected, output, { pipelines: ["discovery"] });
    assert.deepEqual(failures(score), []);
    assert.equal(score.skipped, 4);
});

test("garbage output fails cleanly", () => {
    for (const output of [undefined, null, "nope", [], {}]) {
        const score = scoreFixture(expected, output);
        assert.ok(score.failed > 0);
    }
    const partial = scoreFixture(expected, {
        discovery: { status: "done", result: { entryPoints: "x", gaps: null } },
        ask: "?",
        review: 4,
    });
    assert.ok(partial.failed > 0);
});

test("unwrapAnalysis accepts wrapped and bare results", () => {
    assert.equal(unwrapAnalysis(undefined).present, false);
    assert.equal(unwrapAnalysis({ behaviourSummary: "x" }).status, "done");
    assert.equal(
        unwrapAnalysis({ status: "error", error: "boom" }).error,
        "boom",
    );
    assert.deepEqual(
        unwrapAnalysis({ status: "done", result: { a: 1 } }).result,
        { a: 1 },
    );
});

test("findWhatIfOption matches labels loosely but prefers the closest", () => {
    const options = [
        { label: "€10,000.01" },
        { label: "10000 EUR" },
        { label: "Total: €9,999" },
    ];
    assert.equal(findWhatIfOption(options, "€9,999").label, "Total: €9,999");
    assert.equal(findWhatIfOption(options, "€10,000").label, "10000 EUR");
    assert.equal(findWhatIfOption(options, "/01$/").label, "€10,000.01");
    assert.equal(findWhatIfOption(options, "€25,000"), undefined);
});

test("patterns are case-insensitive and anchor per field", () => {
    assert.ok(toRegExp("POST /orders/?$").test("POST /orders"));
    assert.ok(!toRegExp("POST /orders/?$").test("POST /orders/:id/approve"));
    assert.ok(toRegExp("bulkimportjob").test("BulkImportJob"));
    assert.ok(toRegExp("a(b").test("xa(b"));
});

test("formatScore prints one line per expectation and the stats", () => {
    const output = sampleOutput();
    output.review.result.findings = [];
    const report = formatScore(
        "orders-approval",
        scoreFixture(expected, output),
    );
    assert.match(report, /PASS {2}discovery {3}mismatch count in 1–1/);
    assert.match(report, /FAIL {2}review {6}finding \/bulk\|import\//);
    assert.match(
        report,
        /30 references verified, 1 dropped, 0 unverified · 23 files explored · 7 agent passes/,
    );
});

test("every fixture has a well-formed pr.json and expected.json", () => {
    const names = listFixtures();
    assert.deepEqual(names, [
        "config-only",
        "go-service",
        "orders-approval",
        "ts-fullstack",
    ]);
    for (const name of names) {
        const fixture = readFixture(name);
        assert.ok(fixture.pr.title.length > 0);
        assert.ok(fixture.pr.description.length > 0);
        // Every ask expectation must be a question the runner actually asks.
        for (const want of fixture.expected.ask ?? []) {
            assert.ok(
                fixture.pr.ask.includes(want.question),
                `${name}: "${want.question}" is not in pr.json`,
            );
        }
        // Every pattern must be a valid regular expression.
        const patterns = [];
        JSON.stringify(fixture.expected, (key, value) => {
            const patternKeys = ["match", "entryPoint", "file"];
            const listKeys = [
                "summaryMentions",
                "gapMentions",
                "mismatchMentions",
                "mentions",
                "refsInclude",
                "blocksInclude",
                "mustInclude",
                "mustNotInclude",
            ];
            if (patternKeys.includes(key) && typeof value === "string")
                patterns.push(value);
            if (listKeys.includes(key) && Array.isArray(value))
                patterns.push(...value);
            return value;
        });
        assert.ok(patterns.length > 0, `${name}: no patterns found`);
        for (const pattern of patterns)
            assert.doesNotThrow(
                () => new RegExp(pattern, "im"),
                `${name}: ${pattern}`,
            );
        // An empty output must fail, never pass vacuously.
        assert.ok(scoreFixture(fixture.expected, {}).failed > 0);
    }
});

test("run.mjs builds the grsp-eval command line", () => {
    const args = evalArgs({
        repoDir: "/r",
        title: "T",
        descriptionFile: "/d.md",
        agent: "codex",
        pipelines: ["discovery", "ask"],
        questions: ["Q1?", "Q2?"],
    });
    assert.deepEqual(args, [
        "--repo",
        "/r",
        "--base",
        "main",
        "--head",
        "pr",
        "--title",
        "T",
        "--description-file",
        "/d.md",
        "--agent",
        "codex",
        "--pipelines",
        "discovery,ask",
        "--ask",
        "Q1?",
        "--ask",
        "Q2?",
    ]);
    const noAsk = evalArgs({
        repoDir: "/r",
        title: "T",
        descriptionFile: "/d.md",
        pipelines: ["discovery"],
        questions: ["Q1?"],
    });
    assert.ok(!noAsk.includes("--ask"));
    assert.ok(!noAsk.includes("--agent"));
});

test("run.mjs parses its arguments", () => {
    const options = parseArgs([
        "--fixture",
        "go-service,config-only",
        "--agent",
        "claude",
        "--pipelines",
        "discovery, review",
    ]);
    assert.deepEqual(options.fixtures, ["go-service", "config-only"]);
    assert.equal(options.agent, "claude");
    assert.deepEqual(options.pipelines, ["discovery", "review"]);
    assert.throws(() => parseArgs(["--agent", "gpt"]), /claude, codex/);
    assert.throws(() => parseArgs(["--pipelines", "nope"]), /Unknown pipeline/);
    assert.throws(() => parseArgs(["--wat"]), /Unknown argument/);
});

test("run.mjs tolerates log lines around the JSON document", () => {
    assert.deepEqual(parseEvalOutput('{"a":1}\n'), { a: 1 });
    assert.deepEqual(
        parseEvalOutput('warning: something\n{\n  "a": {"b": 2}\n}\ndone\n'),
        { a: { b: 2 } },
    );
    assert.throws(() => parseEvalOutput(""), /nothing/);
    assert.throws(() => parseEvalOutput("error: no agent"), /not JSON/);
});
