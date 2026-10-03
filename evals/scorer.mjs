/**
 * Scores the JSON document printed by `grsp-eval` against a fixture's
 * expected.json. Pure functions, no I/O; see evals/README.md for the
 * expectation format.
 *
 * The output document is produced by another process and may be partial
 * (a pipeline can fail or be skipped), so everything here is defensive:
 * a missing section fails its expectations instead of throwing.
 */

export const SECTIONS = [
    "discovery",
    "questions",
    "walkthrough",
    "ask",
    "review",
];

// ── Small helpers ──────────────────────────────────────────

const isObject = (value) =>
    typeof value === "object" && value !== null && !Array.isArray(value);

const asArray = (value) =>
    Array.isArray(value)
        ? value
        : value === undefined || value === null
          ? []
          : [value];

const text = (value) => (typeof value === "string" ? value : "");

/** Patterns are case-insensitive regular expressions; ^ and $ match per field. */
export function toRegExp(pattern) {
    try {
        return new RegExp(pattern, "im");
    } catch {
        return new RegExp(pattern.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "im");
    }
}

const matchesAny = (pattern, fields) => {
    const re = toRegExp(pattern);
    return fields.some((field) => typeof field === "string" && re.test(field));
};

const inRange = (n, range = {}) =>
    (range.min === undefined || n >= range.min) &&
    (range.max === undefined || n <= range.max);

const rangeLabel = (range = {}) =>
    `${range.min ?? 0}–${range.max === undefined ? "∞" : range.max}`;

const refFields = (ref) =>
    isObject(ref) ? [text(ref.file), text(ref.anchor)] : [];

const refLabel = (ref) =>
    isObject(ref) ? `${ref.file ?? "?"}:${ref.startLine ?? "?"}` : "(no ref)";

/** A ref counts as verified unless Rust marked it otherwise. */
const isVerified = (ref) =>
    isObject(ref) && text(ref.file) !== "" && ref.verified !== false;

/**
 * Accepts either an Analysis wrapper ({ status, result, verification, error })
 * or a bare result object.
 */
export function unwrapAnalysis(value) {
    if (!isObject(value)) {
        return { present: false, status: "missing", result: undefined };
    }
    const looksWrapped =
        typeof value.status === "string" &&
        ("result" in value ||
            "kind" in value ||
            "error" in value ||
            "verification" in value);
    if (!looksWrapped) {
        return { present: true, status: "done", result: value };
    }
    return {
        present: true,
        status: value.status,
        result: isObject(value.result) ? value.result : undefined,
        verification: isObject(value.verification)
            ? value.verification
            : undefined,
        error: text(value.error) || undefined,
    };
}

function createRecorder(section) {
    const checks = [];
    return {
        checks,
        pass: (name, detail) =>
            checks.push({ section, name, status: "pass", detail }),
        fail: (name, detail) =>
            checks.push({ section, name, status: "fail", detail }),
        skip: (name, detail) =>
            checks.push({ section, name, status: "skip", detail }),
        check(name, ok, detail) {
            checks.push({
                section,
                name,
                status: ok ? "pass" : "fail",
                detail,
            });
            return ok;
        },
    };
}

/** Records the "pipeline finished" check; returns the result when it did. */
function requireDone(rec, label, analysis) {
    if (!analysis.present) {
        rec.fail(`${label} ran`, "missing from the eval output");
        return undefined;
    }
    if (analysis.status !== "done" || !analysis.result) {
        rec.fail(
            `${label} ran`,
            `status ${analysis.status}${analysis.error ? `: ${analysis.error}` : ""}`,
        );
        return undefined;
    }
    rec.pass(`${label} ran`);
    return analysis.result;
}

function checkVerificationBudget(rec, expected, verification) {
    const wantsRatio = expected.maxUnverifiedRatio !== undefined;
    const wantsDropped = expected.maxDropped !== undefined;
    if (!wantsRatio && !wantsDropped) return;
    if (!verification) {
        rec.fail(
            "verification report present",
            "no VerificationReport on the analysis",
        );
        return;
    }
    const verified = Number(verification.verified) || 0;
    const dropped = Number(verification.dropped) || 0;
    const unverified = Number(verification.unverified) || 0;
    const total = verified + dropped + unverified;
    if (wantsRatio) {
        const ratio = total === 0 ? 0 : (dropped + unverified) / total;
        rec.check(
            `unverified ratio ≤ ${expected.maxUnverifiedRatio}`,
            ratio <= expected.maxUnverifiedRatio,
            `${dropped} dropped + ${unverified} unverified of ${total} references (${ratio.toFixed(2)})`,
        );
    }
    if (wantsDropped) {
        rec.check(
            `dropped references ≤ ${expected.maxDropped}`,
            dropped <= expected.maxDropped,
            `${dropped} dropped`,
        );
    }
}

// ── Discovery ──────────────────────────────────────────────

const entryPointFields = (ep) => [
    text(ep.label),
    text(ep.effect),
    ...refFields(ep.ref),
];

const gapFields = (gap) => [
    text(gap.writeTarget),
    text(gap.explanation),
    ...refFields(gap.ref),
];

const mismatchFields = (m) => [
    text(m.claim),
    text(m.reality),
    ...asArray(m.refs).flatMap(refFields),
];

const normaliseMatcher = (item) =>
    typeof item === "string" ? { match: item } : item;

const oneOf = (actual, wanted) => asArray(wanted).includes(actual);

export function findEntryPoints(discoveryResult, pattern) {
    return asArray(discoveryResult?.entryPoints).filter(
        (ep) => isObject(ep) && matchesAny(pattern, entryPointFields(ep)),
    );
}

function scoreDiscovery(expected, output) {
    const rec = createRecorder("discovery");
    const analysis = unwrapAnalysis(output.discovery);
    const result = requireDone(rec, "discovery", analysis);
    if (!result) return rec.checks;

    const entryPoints = asArray(result.entryPoints).filter(isObject);
    const gaps = asArray(result.gaps).filter(isObject);
    const mismatches = asArray(result.mismatches).filter(isObject);
    const removed = asArray(result.removed).filter(isObject);

    for (const pattern of asArray(expected.summaryMentions)) {
        rec.check(
            `summary mentions /${pattern}/`,
            matchesAny(pattern, [text(result.behaviourSummary)]),
            text(result.behaviourSummary).slice(0, 160),
        );
    }

    for (const raw of asArray(expected.entryPointsInclude)) {
        const want = normaliseMatcher(raw);
        const found = findEntryPoints(result, want.match);
        const labels = found
            .map((ep) => `${ep.label} [${ep.kind}/${ep.tag}]`)
            .join(", ");
        if (
            !rec.check(
                `entry point /${want.match}/ found`,
                found.length > 0,
                labels || listLabels(entryPoints),
            )
        ) {
            continue;
        }
        if (want.kind !== undefined) {
            rec.check(
                `entry point /${want.match}/ has kind ${asArray(want.kind).join("|")}`,
                found.some((ep) => oneOf(ep.kind, want.kind)),
                labels,
            );
        }
        if (want.tag !== undefined) {
            rec.check(
                `entry point /${want.match}/ is tagged ${asArray(want.tag).join("|")}`,
                found.some((ep) => oneOf(ep.tag, want.tag)),
                labels,
            );
        }
    }

    for (const raw of asArray(expected.entryPointsExclude)) {
        const want = normaliseMatcher(raw);
        const found = findEntryPoints(result, want.match);
        rec.check(
            `no entry point matches /${want.match}/`,
            found.length === 0,
            found.map((ep) => ep.label).join(", "),
        );
    }

    // "What's affected" rows: an entry point, or a gap shown as "Not covered".
    for (const raw of asArray(expected.affectedInclude)) {
        const want = normaliseMatcher(raw);
        const eps = findEntryPoints(result, want.match);
        const matchingGaps = gaps.filter((gap) =>
            matchesAny(want.match, gapFields(gap)),
        );
        let ok = eps.length > 0 || matchingGaps.length > 0;
        if (ok && want.tag !== undefined) {
            const tags = asArray(want.tag);
            ok =
                eps.some(
                    (ep) =>
                        tags.includes(ep.tag) ||
                        (tags.includes("not_covered") && ep.hasGap === true),
                ) ||
                (tags.includes("not_covered") && matchingGaps.length > 0);
        }
        rec.check(
            `what's affected includes /${want.match}/${want.tag ? ` as ${asArray(want.tag).join("|")}` : ""}`,
            ok,
            [
                ...eps.map((ep) => `${ep.label} [${ep.tag}]`),
                ...matchingGaps.map((g) => `gap ${refLabel(g.ref)}`),
            ].join(", ") || listLabels(entryPoints),
        );
    }

    if (expected.entryPointCount) {
        rec.check(
            `entry point count in ${rangeLabel(expected.entryPointCount)}`,
            inRange(entryPoints.length, expected.entryPointCount),
            `${entryPoints.length}: ${listLabels(entryPoints)}`,
        );
    }

    for (const pattern of asArray(expected.gapMentions)) {
        const found = gaps.filter((gap) => matchesAny(pattern, gapFields(gap)));
        rec.check(
            `gap /${pattern}/ found`,
            found.length > 0,
            found.map((g) => refLabel(g.ref)).join(", ") ||
                `${gaps.length} gaps reported`,
        );
    }

    if (expected.gapCount) {
        rec.check(
            `gap count in ${rangeLabel(expected.gapCount)}`,
            inRange(gaps.length, expected.gapCount),
            `${gaps.length}: ${gaps.map((g) => refLabel(g.ref)).join(", ")}`,
        );
    }

    if (expected.mismatchCount) {
        rec.check(
            `mismatch count in ${rangeLabel(expected.mismatchCount)}`,
            inRange(mismatches.length, expected.mismatchCount),
            `${mismatches.length}: ${mismatches.map((m) => text(m.reality).slice(0, 80)).join(" | ")}`,
        );
    }

    for (const pattern of asArray(expected.mismatchMentions)) {
        rec.check(
            `mismatch mentions /${pattern}/`,
            mismatches.some((m) => matchesAny(pattern, mismatchFields(m))),
            mismatches.map((m) => text(m.reality).slice(0, 80)).join(" | ") ||
                "no mismatches",
        );
    }

    if (expected.allRefsVerified) {
        const problems = [];
        for (const ep of entryPoints) {
            if (!isVerified(ep.ref)) problems.push(`entry point ${ep.label}`);
        }
        for (const gap of gaps) {
            if (!isVerified(gap.ref)) problems.push(`gap ${refLabel(gap.ref)}`);
        }
        for (const m of mismatches) {
            if (!asArray(m.refs).some(isVerified))
                problems.push(`mismatch "${text(m.claim).slice(0, 40)}"`);
        }
        for (const r of removed) {
            if (!isVerified(r.ref)) problems.push(`removed ${r.name}`);
        }
        rec.check(
            "every shown item carries a verified ref",
            problems.length === 0,
            problems.join(", "),
        );
    }

    checkVerificationBudget(rec, expected, analysis.verification);
    return rec.checks;
}

const listLabels = (entryPoints) =>
    entryPoints.map((ep) => text(ep.label)).join(", ") || "(none)";

// ── Questions ──────────────────────────────────────────────

function scoreQuestions(expected, output) {
    const rec = createRecorder("questions");
    const analysis = unwrapAnalysis(output.questions);
    const result = requireDone(rec, "questions", analysis);
    if (!result) return rec.checks;

    // QuestionsResult is { questions: [...] }; tolerate a bare array too.
    const questions = asArray(
        Array.isArray(result) ? result : result.questions,
    ).filter(isObject);

    if (expected.count) {
        rec.check(
            `question count in ${rangeLabel(expected.count)}`,
            inRange(questions.length, expected.count),
            `${questions.length}`,
        );
    }
    for (const pattern of asArray(expected.mentions)) {
        rec.check(
            `a question mentions /${pattern}/`,
            questions.some((q) =>
                matchesAny(pattern, [text(q.question), text(q.answer)]),
            ),
        );
    }
    if (expected.allRefsVerified) {
        const bad = questions.filter((q) => !asArray(q.refs).some(isVerified));
        rec.check(
            "every question has a verified ref",
            bad.length === 0,
            bad.map((q) => text(q.question).slice(0, 60)).join(" | "),
        );
    }
    checkVerificationBudget(rec, expected, analysis.verification);
    return rec.checks;
}

// ── Walkthrough ────────────────────────────────────────────

const blockFields = (block) => [text(block.label), ...refFields(block.ref)];

const digitsAndLetters = (s) =>
    text(s)
        .toLowerCase()
        .replace(/[^\p{L}\p{N}]/gu, "");

/**
 * Finds the what-if option an expectation key refers to. Keys wrapped in
 * slashes are regular expressions. Anything else is compared with
 * punctuation and currency signs removed ("€9,999" matches "9999 EUR"),
 * preferring an exact match, then the shortest label that contains it.
 */
export function findWhatIfOption(options, key) {
    const list = asArray(options).filter(isObject);
    const regex = /^\/(.+)\/$/.exec(key);
    if (regex) {
        const re = toRegExp(regex[1]);
        return list.find((option) => re.test(text(option.label)));
    }
    const wanted = digitsAndLetters(key);
    if (wanted === "") return undefined;
    const exact = list.find(
        (option) => digitsAndLetters(option.label) === wanted,
    );
    if (exact) return exact;
    return list
        .filter((option) => digitsAndLetters(option.label).includes(wanted))
        .sort((a, b) => text(a.label).length - text(b.label).length)[0];
}

/** True when `patterns` match blocks along `path` in the given order. */
function matchesInOrder(patterns, pathBlocks) {
    let from = 0;
    for (const pattern of patterns) {
        const index = pathBlocks.findIndex(
            (block, i) => i >= from && matchesAny(pattern, blockFields(block)),
        );
        if (index === -1) return { ok: false, missing: pattern };
        from = index + 1;
    }
    return { ok: true };
}

function scoreOneWalkthrough(expected, output, rec) {
    const prefix = `[${expected.entryPoint}]`;
    const discovery = unwrapAnalysis(output.discovery).result;
    const candidates = findEntryPoints(discovery, expected.entryPoint);
    if (candidates.length === 0) {
        rec.fail(
            `${prefix} entry point found by discovery`,
            listLabels(asArray(discovery?.entryPoints).filter(isObject)),
        );
        return;
    }

    const walkthroughs = isObject(output.walkthroughs)
        ? output.walkthroughs
        : {};
    const entryPoint =
        candidates.find((ep) => walkthroughs[ep.id] !== undefined) ??
        candidates[0];
    const analysis = unwrapAnalysis(walkthroughs[entryPoint.id]);
    const result = requireDone(
        rec,
        `${prefix} walkthrough for "${entryPoint.label}"`,
        analysis,
    );
    if (!result) return;

    const blocks = asArray(result.blocks).filter(isObject);
    const byId = new Map(blocks.map((block) => [block.id, block]));
    const options = asArray(result.whatIf?.options).filter(isObject);
    const paths = [
        { label: "default path", ids: asArray(result.path) },
        ...options.map((option) => ({
            label: `what-if ${option.label}`,
            ids: asArray(option.path),
        })),
    ];

    // Invariants from SPEC §5.5, checked for every walkthrough.
    const unknownIds = paths.flatMap((p) =>
        p.ids.filter((id) => !byId.has(id)).map((id) => `${p.label}: ${id}`),
    );
    rec.check(
        `${prefix} every path id exists in blocks`,
        unknownIds.length === 0,
        unknownIds.join(", "),
    );
    const unverified = blocks.filter((block) => !isVerified(block.ref));
    rec.check(
        `${prefix} every block has a verified ref`,
        unverified.length === 0,
        unverified.map((block) => text(block.label)).join(", "),
    );

    if (expected.maxPathLength !== undefined) {
        const tooLong = paths.filter(
            (p) => p.ids.length > expected.maxPathLength,
        );
        rec.check(
            `${prefix} paths have at most ${expected.maxPathLength} blocks`,
            tooLong.length === 0,
            tooLong.map((p) => `${p.label}: ${p.ids.length}`).join(", "),
        );
    }

    for (const pattern of asArray(expected.blocksInclude)) {
        rec.check(
            `${prefix} a block matches /${pattern}/`,
            blocks.some((block) => matchesAny(pattern, blockFields(block))),
            blocks.map((block) => text(block.label)).join(" → "),
        );
    }

    for (const want of asArray(expected.blockStatus)) {
        const found = blocks.filter((block) =>
            matchesAny(want.match, blockFields(block)),
        );
        const name = `${prefix} block /${want.match}/ is ${asArray(want.status).join("|")}`;
        if (found.length === 0) {
            if (want.optional)
                rec.skip(name, "no such block in this walkthrough");
            else rec.fail(name, "no block matches");
            continue;
        }
        rec.check(
            name,
            found.some((block) => oneOf(block.status, want.status)),
            found.map((block) => `${block.label} [${block.status}]`).join(", "),
        );
    }

    if (isObject(expected.whatIf)) {
        const entries = Object.entries(expected.whatIf);
        if (!result.whatIf) {
            const required = entries.filter(([, want]) => !want.optional);
            if (required.length > 0)
                rec.fail(
                    `${prefix} what-if offered`,
                    "the walkthrough has no whatIf",
                );
            else
                rec.skip(
                    `${prefix} what-if offered`,
                    "none offered; all expectations optional",
                );
            return;
        }
        rec.check(
            `${prefix} what-if has 2–3 options`,
            options.length >= 2 && options.length <= 3,
            options.map((option) => text(option.label)).join(", "),
        );
        for (const [key, want] of entries) {
            const option = findWhatIfOption(options, key);
            if (!option) {
                const detail = `options: ${options.map((o) => text(o.label)).join(", ")}`;
                if (want.optional) rec.skip(`${prefix} what-if ${key}`, detail);
                else rec.fail(`${prefix} what-if ${key} offered`, detail);
                continue;
            }
            const pathBlocks = asArray(option.path)
                .map((id) => byId.get(id))
                .filter(isObject);
            const trail = pathBlocks
                .map((block) => text(block.label))
                .join(" → ");
            if (asArray(want.mustInclude).length > 0) {
                const ordered = matchesInOrder(
                    asArray(want.mustInclude),
                    pathBlocks,
                );
                rec.check(
                    `${prefix} what-if ${key} goes through ${asArray(
                        want.mustInclude,
                    )
                        .map((p) => `/${p}/`)
                        .join(" → ")}`,
                    ordered.ok,
                    ordered.ok
                        ? trail
                        : `missing /${ordered.missing}/ in: ${trail}`,
                );
            }
            for (const pattern of asArray(want.mustNotInclude)) {
                const hit = pathBlocks.filter((block) =>
                    matchesAny(pattern, blockFields(block)),
                );
                rec.check(
                    `${prefix} what-if ${key} avoids /${pattern}/`,
                    hit.length === 0,
                    hit.length === 0
                        ? trail
                        : `hit: ${hit.map((block) => text(block.label)).join(", ")}`,
                );
            }
        }
    }
}

function scoreWalkthrough(expected, output) {
    const rec = createRecorder("walkthrough");
    for (const one of asArray(expected)) {
        if (!isObject(one) || typeof one.entryPoint !== "string") {
            rec.fail(
                "walkthrough expectation is well-formed",
                'needs an "entryPoint" pattern',
            );
            continue;
        }
        scoreOneWalkthrough(one, output, rec);
    }
    return rec.checks;
}

// ── Ask ────────────────────────────────────────────────────

const normaliseQuestion = (s) =>
    text(s).trim().toLowerCase().replace(/\s+/g, " ");

function scoreAsk(expected, output) {
    const rec = createRecorder("ask");
    const messages = asArray(output.ask).filter(isObject);
    for (const want of asArray(expected)) {
        const prefix = `"${text(want.question).slice(0, 48)}"`;
        const wanted = normaliseQuestion(want.question);
        const message =
            messages.find((m) => normaliseQuestion(m.question) === wanted) ??
            messages.find((m) =>
                normaliseQuestion(m.question).includes(wanted),
            );
        if (!message) {
            rec.fail(
                `${prefix} was asked`,
                "no AskMessage with this question in the output",
            );
            continue;
        }
        const answer = isObject(message.answer) ? message.answer : undefined;
        if (message.status === "error" || !answer) {
            rec.fail(
                `${prefix} answered`,
                `status ${message.status}${message.error ? `: ${message.error}` : ""}`,
            );
            continue;
        }
        rec.pass(`${prefix} answered`);

        const body = asArray(answer.paragraphs).map(text).join("\n");
        const refs = asArray(answer.refs).filter(isObject);
        const refFiles = [
            ...refs.filter(isVerified).map((ref) => text(ref.file)),
            text(answer.excerpt?.file),
        ];

        if (want.grounded !== undefined) {
            rec.check(
                `${prefix} grounded = ${want.grounded}`,
                answer.grounded === want.grounded,
                `grounded ${answer.grounded}, confidence ${answer.confidence}`,
            );
        }
        for (const pattern of asArray(want.mentions)) {
            rec.check(
                `${prefix} mentions /${pattern}/`,
                matchesAny(pattern, [body]),
                body.slice(0, 160),
            );
        }
        for (const pattern of asArray(want.refsInclude)) {
            rec.check(
                `${prefix} cites /${pattern}/`,
                matchesAny(pattern, refFiles),
                refs.map(refLabel).join(", ") || "no refs",
            );
        }
        if (want.grounded !== false) {
            const bad = refs.filter((ref) => !isVerified(ref));
            rec.check(
                `${prefix} refs are verified`,
                bad.length === 0,
                bad.map(refLabel).join(", "),
            );
        }
    }
    return rec.checks;
}

// ── Review ─────────────────────────────────────────────────

const findingFields = (f) => [text(f.title), text(f.why), text(f.comment)];

function scoreReview(expected, output) {
    const rec = createRecorder("review");
    const analysis = unwrapAnalysis(output.review);
    const result = requireDone(rec, "review", analysis);
    if (!result) return rec.checks;

    const findings = asArray(result.findings).filter(isObject);

    for (const want of asArray(expected.findingsInclude).map(
        normaliseMatcher,
    )) {
        const found = findings.filter(
            (f) =>
                matchesAny(want.match, findingFields(f)) &&
                (want.file === undefined ||
                    matchesAny(want.file, [text(f.ref?.file)])),
        );
        const labels = found
            .map(
                (f) =>
                    `${f.title} [${f.severity}, ${refLabel(f.ref)}, ${f.anchoring}]`,
            )
            .join(", ");
        const where = want.file ? ` in /${want.file}/` : "";
        if (
            !rec.check(
                `finding /${want.match}/${where} reported`,
                found.length > 0,
                labels || findings.map((f) => text(f.title)).join(" | "),
            )
        ) {
            continue;
        }
        if (want.severity !== undefined) {
            rec.check(
                `finding /${want.match}/ is ${asArray(want.severity).join("|")}`,
                found.some((f) => oneOf(f.severity, want.severity)),
                labels,
            );
        }
        if (want.anchoring !== undefined) {
            rec.check(
                `finding /${want.match}/ posts ${want.anchoring}`,
                found.some((f) => f.anchoring === want.anchoring),
                labels,
            );
        }
    }

    if (expected.findingCount) {
        rec.check(
            `finding count in ${rangeLabel(expected.findingCount)}`,
            inRange(findings.length, expected.findingCount),
            `${findings.length}`,
        );
    }
    if (expected.allRefsVerified) {
        const bad = findings.filter((f) => !isVerified(f.ref));
        rec.check(
            "every finding has a verified ref",
            bad.length === 0,
            bad.map((f) => text(f.title)).join(" | "),
        );
    }
    checkVerificationBudget(rec, expected, analysis.verification);
    return rec.checks;
}

// ── Stats ──────────────────────────────────────────────────

/** Sums the VerificationReports of everything in the output. */
export function collectStats(output) {
    const stats = {
        verified: 0,
        dropped: 0,
        unverified: 0,
        filesExplored: 0,
        agentPasses: undefined,
    };
    const add = (verification) => {
        if (!isObject(verification)) return;
        stats.verified += Number(verification.verified) || 0;
        stats.dropped += Number(verification.dropped) || 0;
        stats.unverified += Number(verification.unverified) || 0;
        stats.filesExplored = Math.max(
            stats.filesExplored,
            Number(verification.filesExplored) || 0,
        );
    };
    if (!isObject(output)) return stats;
    for (const key of ["discovery", "questions", "review"])
        add(output[key]?.verification);
    if (isObject(output.walkthroughs)) {
        for (const analysis of Object.values(output.walkthroughs))
            add(analysis?.verification);
    }
    for (const message of asArray(output.ask)) add(message?.verification);
    const passes = output.passes ?? output.session?.agentPasses;
    if (typeof passes === "number") stats.agentPasses = passes;
    return stats;
}

// ── Entry point ────────────────────────────────────────────

const SCORERS = {
    discovery: scoreDiscovery,
    questions: scoreQuestions,
    walkthrough: scoreWalkthrough,
    ask: scoreAsk,
    review: scoreReview,
};

/**
 * @param expected  parsed expected.json
 * @param output    parsed JSON printed by grsp-eval
 * @param options   { pipelines?: string[] } — sections not listed are skipped
 * @returns {{ checks: {section,name,status,detail}[], stats, passed, failed, skipped }}
 */
export function scoreFixture(expected, output, options = {}) {
    const pipelines =
        options.pipelines && options.pipelines.length > 0
            ? options.pipelines
            : undefined;
    const checks = [];

    if (!isObject(output)) {
        checks.push({
            section: "run",
            name: "eval output is a JSON object",
            status: "fail",
            detail: typeof output,
        });
    } else {
        for (const section of SECTIONS) {
            const want = expected?.[section];
            if (want === undefined) continue;
            if (pipelines && !pipelines.includes(section)) {
                checks.push({
                    section,
                    name: `${section} expectations`,
                    status: "skip",
                    detail: "pipeline not run",
                });
                continue;
            }
            try {
                checks.push(...SCORERS[section](want, output));
            } catch (error) {
                checks.push({
                    section,
                    name: `${section} could be scored`,
                    status: "fail",
                    detail:
                        error instanceof Error ? error.message : String(error),
                });
            }
        }
    }

    const count = (status) => checks.filter((c) => c.status === status).length;
    return {
        checks,
        stats: collectStats(output),
        passed: count("pass"),
        failed: count("fail"),
        skipped: count("skip"),
    };
}

/** One line per expectation, plus the verification stats. */
export function formatScore(name, score) {
    const mark = { pass: "PASS", fail: "FAIL", skip: "SKIP" };
    const lines = [`\n${name}`];
    for (const c of score.checks) {
        const showDetail = c.detail && c.status !== "pass";
        lines.push(
            `  ${mark[c.status]}  ${c.section.padEnd(11)} ${c.name}${showDetail ? `\n          ${c.detail}` : ""}`,
        );
    }
    const s = score.stats;
    lines.push(
        `  ── ${score.passed} passed, ${score.failed} failed, ${score.skipped} skipped · ` +
            `${s.verified} references verified, ${s.dropped} dropped, ${s.unverified} unverified` +
            (s.filesExplored ? ` · ${s.filesExplored} files explored` : "") +
            (s.agentPasses !== undefined
                ? ` · ${s.agentPasses} agent passes`
                : ""),
    );
    return lines.join("\n");
}
