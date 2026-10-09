/**
 * In-memory implementation of every grsp command over the prototype
 * scenario. Used outside Tauri and with VITE_GRSP_FIXTURES=1 so the whole UI
 * can be exercised in a browser. Behaves like the Rust core: commands return
 * quickly, long work streams progress through events.
 */
import { readStore } from "@core/db/browser-store";
import type { Repo } from "@core/types/grsp";
import {
    GRSP_EVENTS,
    type AgentStatus,
    type Analysis,
    type AnalysisEvent,
    type AnalysisKind,
    type AskEvent,
    type AskMessage,
    type CommitInfo,
    type DiscoveryResult,
    type GrspCommands,
    type NewSessionInput,
    type Note,
    type QuestionsResult,
    type RepoNotAddedError,
    type ReviewResult,
    type ReviewSession,
    type SessionDiff,
    type SessionEvent,
    type VerificationReport,
} from "@core/types/grsp";
import {
    fakeSha,
    fixtureCommits,
    localBranchName,
    SEEDED_LAST_REVIEWED_INDEX,
} from "./commits";
import { emptyFixtureDiff, fixtureDiff, tinyFixtureDiff } from "./diff";
import { readRange } from "./excerpts";
import {
    answerFor,
    BRANCHES,
    discoveryResult,
    discussionResult,
    DISCOVERY_VERIFICATION,
    emptyDiscussion,
    FIXTURE_REPOS,
    HEAD_SHA,
    INITIAL_QUESTION,
    OPEN_PRS,
    PR_DESCRIPTION,
    PRIMARY_SESSION_ID,
    PROGRESS,
    prUrl,
    questionsResult,
    REFRESHED_HEAD_SHA,
    reviewResult,
    seedSessions,
    VIEWER_LOGIN,
    walkthroughResult,
    ago,
} from "./scenario";
import { readVariants, type FixtureVariant } from "./variants";

export interface FixtureOptions {
    variants?: Iterable<FixtureVariant>;
    /** Milliseconds between progress lines of a running pass. */
    tick?: number;
    /** Milliseconds every command takes to answer. */
    latency?: number;
}

type Handlers = {
    [K in keyof GrspCommands]: (
        args: GrspCommands[K]["args"],
    ) => GrspCommands[K]["result"];
};

type Outcome =
    | { result: unknown; verification: VerificationReport }
    | { error: string; errorDetails?: string };

export interface FixtureBackend {
    call<K extends keyof GrspCommands>(
        name: K,
        args: GrspCommands[K]["args"],
    ): Promise<GrspCommands[K]["result"]>;
    listen<T>(event: string, handler: (payload: T) => void): () => void;
}

/** Tauri commands reject with a plain string; fixtures do the same. */
function reject(message: string): never {
    // eslint-disable-next-line @typescript-eslint/only-throw-error
    throw message;
}

function clone<T>(value: T): T {
    return structuredClone(value);
}

const EMPTY_REPORT: VerificationReport = {
    verified: 0,
    dropped: 0,
    unverified: 0,
    notes: [],
};

const QUESTIONS_FAILURE = {
    error: "The agent's answer wasn't valid JSON, even after one retry.",
    errorDetails:
        'Here are the questions a reviewer should be able to answer:\n\n1. What happens to orders already pending payment when this deploys?\n2. Can the person who created an order also approve it?\n\n{"questions": [{"id": "q1", "question": "What happens to orders already pend',
};

export function createFixtureBackend(
    options: FixtureOptions = {},
): FixtureBackend {
    const variants = new Set(options.variants ?? []);
    const tick = options.tick ?? (variants.has("slow") ? 1400 : 450);
    const latency = options.latency ?? 60;

    const sessions = new Map<string, ReviewSession>();
    const analyses = new Map<string, Map<AnalysisKind, Analysis>>();
    const asks = new Map<string, AskMessage[]>();
    /** Sessions that carry the full prototype scenario. */
    const scenarioSessions = new Set<string>();
    /** Commit sessions whose diff is a one-line fix. */
    const tinySessions = new Set<string>();
    const notes = new Map<string, Note[]>();
    /** `repoId:branch` → head of the latest commit review on that branch. */
    const lastReviewed = new Map<string, string>();
    const timers = new Map<string, ReturnType<typeof setTimeout>[]>();
    const listeners = new Map<string, Set<(payload: unknown) => void>>();
    let counter = 0;

    // ── Plumbing ───────────────────────────────────────────

    function emit(event: string, payload: unknown) {
        for (const handler of listeners.get(event) ?? []) handler(payload);
    }

    function emitSession(sessionId: string, progress?: string) {
        const payload: SessionEvent = { sessionId, progress };
        emit(GRSP_EVENTS.session, payload);
    }

    function cancelTimers(key: string) {
        for (const timer of timers.get(key) ?? []) clearTimeout(timer);
        timers.delete(key);
    }

    /** Run `steps` one tick apart; a later call with the same key replaces it. */
    function sequence(key: string, steps: (() => void)[]) {
        cancelTimers(key);
        const handles = steps.map((step, i) =>
            setTimeout(
                () => {
                    if (i === steps.length - 1) timers.delete(key);
                    step();
                },
                tick * (i + 1),
            ),
        );
        timers.set(key, handles);
    }

    function getSession(sessionId: string): ReviewSession {
        return sessions.get(sessionId) ?? reject("Session not found.");
    }

    function sessionAnalyses(sessionId: string) {
        let map = analyses.get(sessionId);
        if (!map) {
            map = new Map();
            analyses.set(sessionId, map);
        }
        return map;
    }

    function bumpPasses(session: ReviewSession) {
        session.agentPasses += 1;
        emitSession(session.id);
    }

    // ── Analyses ───────────────────────────────────────────

    function outcomeFor(session: ReviewSession, kind: AnalysisKind): Outcome {
        const full = scenarioSessions.has(session.id);
        if (kind === "discovery") {
            const noDescription = session.description.trim() === "";
            const result: DiscoveryResult = full
                ? discoveryResult()
                : {
                      behaviourSummary:
                          "This fixture session has no recorded analysis. Open #482 for the full prototype scenario.",
                      descriptionEmpty: noDescription,
                      mismatches: [],
                      entryPoints: [],
                      gaps: [],
                      removed: [],
                      askSuggestions: [],
                  };
            if (noDescription) {
                result.descriptionEmpty = true;
                result.mismatches = [];
            }
            if (full && variants.has("large")) result.shards = 4;
            return {
                result,
                verification: full ? DISCOVERY_VERIFICATION : EMPTY_REPORT,
            };
        }
        if (kind === "questions") {
            const result: QuestionsResult = full
                ? questionsResult()
                : { questions: [] };
            return {
                result,
                verification: { ...EMPTY_REPORT, verified: 7 },
            };
        }
        if (kind === "discussion") {
            if (session.source.kind !== "pr") {
                return {
                    error:
                        session.source.kind === "commits"
                            ? "Commits have no discussion."
                            : "Branch comparisons have no discussion.",
                };
            }
            const result =
                full && !variants.has("nodiscussion")
                    ? discussionResult()
                    : emptyDiscussion();
            return { result, verification: EMPTY_REPORT };
        }
        if (kind === "review") {
            const result: ReviewResult = full
                ? reviewResult()
                : { findings: [], summary: "", repoPromptActive: false };
            return {
                result,
                verification: {
                    ...EMPTY_REPORT,
                    verified: 3,
                    dropped: 1,
                    filesExplored: 11,
                },
            };
        }
        const entryPointId = kind.slice("walkthrough:".length);
        const result = full ? walkthroughResult(entryPointId) : undefined;
        if (!result) {
            return {
                error: "The agent couldn't trace this entry point.",
                errorDetails: `No recorded walkthrough for "${entryPointId}".`,
            };
        }
        return {
            result,
            verification: {
                ...EMPTY_REPORT,
                verified: result.blocks.length,
                filesExplored: 6,
            },
        };
    }

    function settle(
        session: ReviewSession,
        kind: AnalysisKind,
        startedAt: string | undefined,
    ): Analysis {
        const outcome = outcomeFor(session, kind);
        const base = {
            sessionId: session.id,
            kind,
            headSha: session.headSha ?? HEAD_SHA,
            startedAt,
            finishedAt: new Date().toISOString(),
        };
        const analysis: Analysis =
            "error" in outcome
                ? { ...base, status: "error", ...outcome }
                : { ...base, status: "done", ...outcome };
        sessionAnalyses(session.id).set(kind, analysis);
        return analysis;
    }

    function progressLines(kind: AnalysisKind): string[] {
        const key = kind.startsWith("walkthrough:") ? "walkthrough" : kind;
        return PROGRESS[key] ?? ["Reading the diff"];
    }

    function runAnalysis(
        sessionId: string,
        kind: AnalysisKind,
        onDone?: () => void,
    ) {
        const session = getSession(sessionId);
        const lines = progressLines(kind);
        const startedAt = new Date().toISOString();
        const announce = (progress: string) => {
            sessionAnalyses(sessionId).set(kind, {
                sessionId,
                kind,
                headSha: session.headSha ?? HEAD_SHA,
                status: "running",
                progress,
                startedAt,
            });
            const payload: AnalysisEvent = {
                sessionId,
                kind,
                status: "running",
                progress,
            };
            emit(GRSP_EVENTS.analysis, payload);
        };
        announce(lines[0]);
        sequence(`analysis:${sessionId}:${kind}`, [
            ...lines.slice(1).map((line) => () => announce(line)),
            () => {
                const analysis = settle(session, kind, startedAt);
                const payload: AnalysisEvent = {
                    sessionId,
                    kind,
                    status: analysis.status,
                };
                emit(GRSP_EVENTS.analysis, payload);
                bumpPasses(session);
                onDone?.();
            },
        ]);
    }

    /** SPEC §2.2 step 4: discovery, then questions and discussion. */
    function runPipeline(sessionId: string, alsoRun: AnalysisKind[] = []) {
        runAnalysis(sessionId, "discovery", () => {
            const session = getSession(sessionId);
            runAnalysis(sessionId, "questions");
            if (session.source.kind === "pr") {
                runAnalysis(sessionId, "discussion");
            }
            for (const kind of alsoRun) runAnalysis(sessionId, kind);
        });
    }

    function prepare(
        session: ReviewSession,
        steps: string[],
        onReady: () => void,
    ) {
        session.status = "preparing";
        emitSession(session.id, steps[0]);
        sequence(`prepare:${session.id}`, [
            ...steps
                .slice(1)
                .map((line) => () => emitSession(session.id, line)),
            () => {
                session.status = "ready";
                session.newCommits = 0;
                emitSession(session.id);
                onReady();
            },
        ]);
    }

    function preparingSteps(session: ReviewSession): string[] {
        const source = session.source;
        const fetching =
            source.kind === "pr"
                ? `Fetching pull/${source.number}/head`
                : source.kind === "commits"
                  ? `Fetching ${source.branch ?? source.head.slice(0, 7)}`
                  : `Fetching ${source.base} and ${source.head}`;
        return [
            fetching,
            `Creating a read-only worktree at ${(session.headSha ?? HEAD_SHA).slice(0, 7)}`,
            `Reading the diff: ${session.filesChanged} files changed`,
        ];
    }

    // ── Seed ───────────────────────────────────────────────

    function seed() {
        for (const session of seedSessions()) {
            sessions.set(session.id, session);
            asks.set(session.id, []);
        }
        scenarioSessions.add(PRIMARY_SESSION_ID);
        const primary = getSession(PRIMARY_SESSION_ID);

        if (variants.has("branches")) {
            primary.source = {
                kind: "branches",
                base: "main",
                head: "feat/order-approval",
            };
            primary.title = "feat/order-approval";
            primary.description = "";
            primary.author = "";
            primary.ci = undefined;
        }
        if (variants.has("commit") || variants.has("commits")) {
            const branch = "feat/order-approval";
            const history = fixtureCommits("orders", branch);
            const count = variants.has("commits") ? 4 : 1;
            const picked = history.slice(0, count);
            primary.source = {
                kind: "commits",
                branch,
                base: history[count].sha,
                head: picked[0].sha,
                count,
            };
            primary.title = commitsTitle(picked, branch);
            primary.description = commitsDescription(picked);
            primary.author = commitsAuthor(picked);
            primary.baseRef = branch;
            primary.ci = undefined;
        }
        if (variants.has("tiny")) {
            tinySessions.add(primary.id);
            primary.filesChanged = 1;
            primary.linesAdded = 1;
            primary.linesRemoved = 1;
        }
        if (variants.has("nodesc")) primary.description = "";
        if (variants.has("ownpr")) {
            primary.isOwnPr = true;
            primary.author = VIEWER_LOGIN;
        }
        if (variants.has("cifail")) {
            primary.ci = { state: "failing", passed: 10, total: 12 };
        }
        if (variants.has("stale")) {
            primary.status = "stale";
            primary.newCommits = 3;
        }
        if (variants.has("preparing")) primary.status = "preparing";

        lastReviewed.set(
            "orders:feat/order-approval",
            fixtureCommits("orders", "feat/order-approval")[
                SEEDED_LAST_REVIEWED_INDEX
            ].sha,
        );
        notes.set(PRIMARY_SESSION_ID, seedNotes());

        const fresh = variants.has("fresh") || variants.has("preparing");
        for (const session of sessions.values()) {
            if (session.id === PRIMARY_SESSION_ID && fresh) continue;
            settle(session, "discovery", ago(1));
            settle(session, "questions", ago(1));
            if (session.source.kind === "pr") {
                settle(session, "discussion", ago(1));
            }
        }
        if (fresh) {
            primary.agentPasses = 0;
            return;
        }

        if (variants.has("error")) {
            sessionAnalyses(primary.id).set("questions", {
                sessionId: primary.id,
                kind: "questions",
                headSha: HEAD_SHA,
                status: "error",
                ...QUESTIONS_FAILURE,
                startedAt: ago(1),
                finishedAt: ago(1),
            });
        }
        if (variants.has("reviewed") || variants.has("posted")) {
            settle(primary, "review", ago(1));
            primary.agentPasses += 1;
        }
        if (variants.has("posted") && primary.source.kind === "pr") {
            primary.postedReview = {
                id: "r482",
                url: `${primary.source.url}#pullrequestreview-482001`,
                event: "REQUEST_CHANGES",
            };
        }

        const canned = answerFor(INITIAL_QUESTION);
        asks.set(primary.id, [
            {
                id: "a0",
                sessionId: primary.id,
                question: INITIAL_QUESTION,
                status: "done",
                answer: canned.answer,
                verification: canned.verification,
                headSha: HEAD_SHA,
                createdAt: ago(0.5),
            },
        ]);
    }

    // ── Sessions ───────────────────────────────────────────

    function commitsTitle(picked: CommitInfo[], branch: string): string {
        return picked.length === 1
            ? picked[0].subject
            : `Commits on ${localBranchName(branch)}`;
    }

    /** One commit: its body. A run: every message, oldest first. */
    function commitsDescription(picked: CommitInfo[]): string {
        if (picked.length === 1) return picked[0].body;
        return [...picked]
            .reverse()
            .map((c) =>
                [`**${c.subject}** (\`${c.shortSha}\`)`, c.body]
                    .filter(Boolean)
                    .join("\n\n"),
            )
            .join("\n\n");
    }

    function commitsAuthor(picked: CommitInfo[]): string {
        const authors = [...new Set(picked.map((c) => c.author))];
        return authors.length > 2
            ? `${authors[0]} and ${authors.length - 1} others`
            : authors.join(" and ");
    }

    function createCommitSession(
        input: Extract<NewSessionInput, { kind: "commits" }>,
    ): ReviewSession {
        const branch = input.branch ?? "main";
        const history = fixtureCommits(input.repoId, branch);
        const headIndex = history.findIndex((c) => c.sha === input.head);
        if (headIndex < 0) reject("That commit isn't on this branch.");
        const fromIndex = input.from
            ? history.findIndex((c) => c.sha === input.from)
            : headIndex;
        if (fromIndex < headIndex) {
            reject("The first commit of the range isn't behind its head.");
        }
        const picked = history.slice(headIndex, fromIndex + 1);
        const base =
            history.at(fromIndex + 1)?.sha ??
            fakeSha(`parent:${history[fromIndex].sha}`);
        lastReviewed.set(
            `${input.repoId}:${localBranchName(branch)}`,
            input.head,
        );

        const existing = [...sessions.values()].find(
            (s) =>
                s.repoId === input.repoId &&
                s.status !== "closed" &&
                s.source.kind === "commits" &&
                s.source.base === base &&
                s.source.head === input.head,
        );
        if (existing) return existing;

        counter += 1;
        const now = new Date().toISOString();
        const linesAdded = picked.reduce((n, c) => n + c.added, 0);
        const linesRemoved = picked.reduce((n, c) => n + c.removed, 0);
        const session: ReviewSession = {
            id: `c${counter}`,
            repoId: input.repoId,
            source: {
                kind: "commits",
                branch: input.branch,
                base,
                head: input.head,
                count: picked.length,
            },
            title: commitsTitle(picked, branch),
            description: commitsDescription(picked),
            author: commitsAuthor(picked),
            baseRef: branch,
            headRef: branch,
            baseSha: base,
            headSha: input.head,
            mergeBaseSha: base,
            status: "preparing",
            prState: "open",
            isOwnPr: false,
            filesChanged: Math.max(...picked.map((c) => c.filesChanged)),
            linesAdded,
            linesRemoved,
            newCommits: 0,
            agentPasses: 0,
            createdAt: now,
            lastOpenedAt: now,
        };
        sessions.set(session.id, session);
        asks.set(session.id, []);
        scenarioSessions.add(session.id);
        if (linesAdded + linesRemoved <= 10) tinySessions.add(session.id);
        prepare(session, preparingSteps(session), () =>
            runPipeline(session.id),
        );
        return session;
    }

    function createSession(input: NewSessionInput): ReviewSession {
        if (input.kind === "commits") return createCommitSession(input);
        counter += 1;
        let repoId: string;
        let source: ReviewSession["source"];
        if (input.kind === "branches") {
            repoId = input.repoId;
            source = { kind: "branches", base: input.base, head: input.head };
        } else {
            let number: number;
            if (input.kind === "url") {
                const match =
                    /github\.com\/([^/\s]+)\/([^/\s]+)\/pull\/(\d+)/.exec(
                        input.url,
                    );
                if (!match) reject("That doesn't look like a GitHub PR URL.");
                const [, owner, name] = match;
                // Includes folders added or cloned in this browser.
                const repo = readStore(
                    "repos",
                    () => FIXTURE_REPOS,
                    (v): v is Repo[] => Array.isArray(v),
                ).find(
                    (r) => r.remote?.owner === owner && r.remote?.name === name,
                );
                if (!repo) {
                    const notAdded: RepoNotAddedError = {
                        code: "repo_not_added",
                        owner,
                        name,
                    };
                    reject(JSON.stringify(notAdded));
                }
                repoId = repo.id;
                number = Number(match[3]);
            } else {
                repoId = input.repoId;
                number = input.number;
            }
            const existing = [...sessions.values()].find(
                (s) =>
                    s.repoId === repoId &&
                    s.status !== "closed" &&
                    s.source.kind === "pr" &&
                    s.source.number === number,
            );
            if (existing) return existing;
            source = { kind: "pr", number, url: prUrl(repoId, number) };
        }

        const pr =
            source.kind === "pr"
                ? OPEN_PRS[repoId]?.find((p) => p.number === source.number)
                : undefined;
        const now = new Date().toISOString();
        const session: ReviewSession = {
            id:
                source.kind === "pr"
                    ? `s${source.number}-${counter}`
                    : `b${counter}`,
            repoId,
            source,
            title:
                source.kind === "pr"
                    ? (pr?.title ?? `Pull request #${source.number}`)
                    : source.head,
            description: source.kind === "pr" ? PR_DESCRIPTION : "",
            author: pr?.author ?? (source.kind === "pr" ? "kemi.a" : ""),
            baseRef:
                source.kind === "pr" ? (pr?.baseRef ?? "main") : source.base,
            headRef:
                source.kind === "pr"
                    ? (pr?.headRef ?? "feat/order-approval")
                    : source.head,
            baseSha: undefined,
            headSha: HEAD_SHA,
            mergeBaseSha: undefined,
            status: "preparing",
            prState: "open",
            isOwnPr: false,
            ci:
                source.kind === "pr"
                    ? { state: "passing", passed: 12, total: 12 }
                    : undefined,
            filesChanged: 9,
            linesAdded: 212,
            linesRemoved: 38,
            newCommits: 0,
            agentPasses: 0,
            createdAt: now,
            lastOpenedAt: now,
        };
        sessions.set(session.id, session);
        asks.set(session.id, []);
        scenarioSessions.add(session.id);
        prepare(session, preparingSteps(session), () =>
            runPipeline(session.id),
        );
        return session;
    }

    function openSession(sessionId: string): ReviewSession {
        const session = getSession(sessionId);
        session.lastOpenedAt = new Date().toISOString();
        const idle = !timers.has(`prepare:${sessionId}`);
        if (session.status === "preparing" && idle) {
            prepare(session, preparingSteps(session), () =>
                runPipeline(sessionId),
            );
        } else if (
            session.status === "ready" &&
            !sessionAnalyses(sessionId).has("discovery")
        ) {
            runPipeline(sessionId);
        }
        return session;
    }

    function refreshSession(sessionId: string): ReviewSession {
        const session = getSession(sessionId);
        const ran = [...sessionAnalyses(sessionId).keys()];
        for (const kind of ran) cancelTimers(`analysis:${sessionId}:${kind}`);
        analyses.delete(sessionId);
        const commits = session.newCommits;
        session.headSha = REFRESHED_HEAD_SHA;
        const steps = preparingSteps(session);
        if (commits > 0) {
            steps[0] = `Fetching ${commits} new commits`;
        }
        prepare(session, steps, () =>
            runPipeline(
                sessionId,
                ran.filter(
                    (kind) =>
                        kind === "review" || kind.startsWith("walkthrough:"),
                ),
            ),
        );
        return session;
    }

    // ── Diff and notes ─────────────────────────────────────

    function diffOf(sessionId: string): SessionDiff {
        getSession(sessionId);
        if (!scenarioSessions.has(sessionId)) return emptyFixtureDiff();
        return tinySessions.has(sessionId) ? tinyFixtureDiff() : fixtureDiff();
    }

    function seedNotes(): Note[] {
        const base = {
            sessionId: PRIMARY_SESSION_ID,
            headSha: HEAD_SHA,
        };
        return [
            {
                ...base,
                id: "n1",
                body: "Check with Kemi whether the nightly import is **meant** to skip approval. If it is, the description should say so.",
                createdAt: ago(0.4),
                updatedAt: ago(0.4),
            },
            {
                ...base,
                id: "n2",
                body: "`>` not `>=`: an order of exactly €10,000 goes straight through. Matches the tests, worth confirming with finance.",
                anchor: {
                    kind: "line",
                    file: "orders/policies.py",
                    line: 6,
                    side: "new",
                },
                createdAt: ago(0.3),
                updatedAt: ago(0.3),
            },
        ];
    }

    function findNote(noteId: string): Note | undefined {
        for (const list of notes.values()) {
            const found = list.find((n) => n.id === noteId);
            if (found) return found;
        }
        return undefined;
    }

    // ── Ask ────────────────────────────────────────────────

    function sendAsk(sessionId: string, question: string): AskMessage {
        const session = getSession(sessionId);
        counter += 1;
        const canned = answerFor(question);
        const message: AskMessage = {
            id: `a${counter}`,
            sessionId,
            question,
            status: "running",
            progress: canned.progress[0],
            headSha: session.headSha ?? HEAD_SHA,
            createdAt: new Date().toISOString(),
        };
        asks.set(sessionId, [message, ...(asks.get(sessionId) ?? [])]);
        const notify = () => {
            const payload: AskEvent = {
                sessionId,
                messageId: message.id,
                status: message.status,
                progress: message.progress,
            };
            emit(GRSP_EVENTS.ask, payload);
        };
        sequence(`ask:${message.id}`, [
            ...canned.progress.slice(1).map((line) => () => {
                message.progress = line;
                notify();
            }),
            () => {
                message.status = "done";
                message.progress = undefined;
                message.answer = canned.answer;
                message.verification = canned.verification;
                notify();
                bumpPasses(session);
            },
        ]);
        return message;
    }

    function findAsk(messageId: string): AskMessage | undefined {
        for (const list of asks.values()) {
            const found = list.find((m) => m.id === messageId);
            if (found) return found;
        }
        return undefined;
    }

    // ── Review ─────────────────────────────────────────────

    function reviewOf(sessionId: string): ReviewResult | undefined {
        const analysis = sessionAnalyses(sessionId).get("review");
        if (analysis?.status !== "done") return undefined;
        // The fixture only ever stores a ReviewResult under "review".
        return analysis.result as ReviewResult;
    }

    // ── Agents ─────────────────────────────────────────────

    function agents(): AgentStatus[] {
        const missing = variants.has("noagent");
        return [
            {
                kind: "claude",
                installed: !missing,
                path: missing ? undefined : "~/.local/bin/claude",
                version: missing ? undefined : "2.1.4",
                signedIn: missing ? undefined : true,
                command: "claude -p (headless, read-only tools)",
            },
            {
                kind: "codex",
                installed: !missing,
                path: missing ? undefined : "/opt/homebrew/bin/codex",
                version: missing ? undefined : "0.48.0",
                signedIn: undefined,
                command: "codex exec (read-only sandbox)",
            },
        ];
    }

    // ── Commands ───────────────────────────────────────────

    const handlers: Handlers = {
        agent_detect: () => agents(),
        agent_recheck: ({ kind }) => {
            const status =
                agents().find((a) => a.kind === kind) ??
                reject("Unknown agent.");
            return { ...status, signedIn: status.installed ? true : undefined };
        },

        github_status: () =>
            variants.has("nogithub")
                ? { ghInstalled: true, authenticated: false }
                : {
                      ghInstalled: true,
                      authenticated: true,
                      login: VIEWER_LOGIN,
                  },
        github_list_open_prs: ({ repoId }) => {
            if (variants.has("nogithub")) reject("GitHub isn't connected.");
            return OPEN_PRS[repoId] ?? [];
        },

        repo_inspect: ({ path }) => {
            const name = path.split("/").filter(Boolean).pop() ?? path;
            const known = FIXTURE_REPOS.find(
                (r) => r.path === path || r.name === name,
            );
            if (/not-a-repo|downloads|desktop$/i.test(path)) {
                return {
                    isGitRepo: false,
                    name,
                    defaultBranch: "",
                    error: "This folder isn't a git repository.",
                };
            }
            return {
                isGitRepo: true,
                name: known?.name ?? name,
                defaultBranch: "main",
                remote: known?.remote ?? {
                    host: "github",
                    // Clones made by repo_clone live in …/repos/{owner}/{name}.
                    owner: /\/repos\/([^/]+)\/[^/]+$/.exec(path)?.[1] ?? "acme",
                    name,
                },
                language: known?.language ?? "TypeScript",
            };
        },
        repo_list_branches: () => BRANCHES,
        repo_list_commits: ({ repoId, branch, limit }) => {
            const name = localBranchName(branch);
            if (name === "broken") reject("fatal: bad revision 'broken'");
            const commits = fixtureCommits(repoId, branch).slice(
                0,
                limit ?? 50,
            );
            const reviewed = lastReviewed.get(`${repoId}:${name}`);
            return {
                branch,
                commits,
                lastReviewedSha: commits.some((c) => c.sha === reviewed)
                    ? reviewed
                    : undefined,
                offline: variants.has("offline") ? true : undefined,
            };
        },
        repo_clone: ({ owner, name }) => ({
            path: `/Users/you/Library/Application Support/grsp/repos/${owner}/${name}`,
        }),

        session_create: ({ input }) => createSession(input),
        session_list: () =>
            [...sessions.values()].filter((s) => s.status !== "closed"),
        session_get: ({ sessionId }) => getSession(sessionId),
        session_open: ({ sessionId }) => openSession(sessionId),
        session_refresh: ({ sessionId }) => refreshSession(sessionId),
        session_archive: ({ sessionId }) => {
            getSession(sessionId).status = "closed";
            emitSession(sessionId);
            return null;
        },

        analysis_list: ({ sessionId }) => [
            ...sessionAnalyses(sessionId).values(),
        ],
        analysis_run: ({ sessionId, kind }) => {
            runAnalysis(sessionId, kind);
            return null;
        },
        analysis_cancel: ({ sessionId, kind }) => {
            const key = `analysis:${sessionId}:${kind}`;
            if (!timers.has(key)) return null;
            cancelTimers(key);
            const current = sessionAnalyses(sessionId).get(kind);
            sessionAnalyses(sessionId).set(kind, {
                sessionId,
                kind,
                headSha: current?.headSha ?? HEAD_SHA,
                status: "error",
                error: "Cancelled.",
                startedAt: current?.startedAt,
                finishedAt: new Date().toISOString(),
            });
            const payload: AnalysisEvent = { sessionId, kind, status: "error" };
            emit(GRSP_EVENTS.analysis, payload);
            return null;
        },

        question_set_opened: ({ sessionId, questionId }) => {
            const analysis = sessionAnalyses(sessionId).get("questions");
            if (analysis?.status === "done") {
                // The fixture only ever stores a QuestionsResult here.
                const result = analysis.result as QuestionsResult;
                const question = result.questions.find(
                    (q) => q.id === questionId,
                );
                if (question) question.opened = true;
            }
            return null;
        },

        ask_list: ({ sessionId }) => asks.get(sessionId) ?? [],
        ask_send: ({ sessionId, question }) => sendAsk(sessionId, question),
        ask_cancel: ({ messageId }) => {
            const message = findAsk(messageId);
            if (message?.status === "running") {
                cancelTimers(`ask:${messageId}`);
                message.status = "error";
                message.error = "Cancelled.";
                message.progress = undefined;
                const payload: AskEvent = {
                    sessionId: message.sessionId,
                    messageId,
                    status: "error",
                };
                emit(GRSP_EVENTS.ask, payload);
            }
            return null;
        },

        excerpt_read: ({ file, startLine, endLine }) =>
            readRange(file, startLine, endLine),

        diff_read: ({ sessionId }) => diffOf(sessionId),

        note_list: ({ sessionId }) => notes.get(sessionId) ?? [],
        note_save: ({ sessionId, id, body, anchor }) => {
            const session = getSession(sessionId);
            const now = new Date().toISOString();
            if (id !== undefined) {
                const existing =
                    notes.get(sessionId)?.find((n) => n.id === id) ??
                    reject("Note not found.");
                existing.body = body;
                existing.updatedAt = now;
                return existing;
            }
            counter += 1;
            const note: Note = {
                id: `n${counter}-${Date.now().toString(36)}`,
                sessionId,
                body,
                anchor,
                headSha: session.headSha ?? HEAD_SHA,
                createdAt: now,
                updatedAt: now,
            };
            notes.set(sessionId, [...(notes.get(sessionId) ?? []), note]);
            return note;
        },
        note_delete: ({ noteId }) => {
            const note = findNote(noteId);
            if (!note) reject("Note not found.");
            notes.set(
                note.sessionId,
                (notes.get(note.sessionId) ?? []).filter(
                    (n) => n.id !== noteId,
                ),
            );
            return null;
        },

        review_update_finding: ({
            sessionId,
            findingId,
            comment,
            included,
        }) => {
            const finding = reviewOf(sessionId)?.findings.find(
                (f) => f.id === findingId,
            );
            if (!finding) reject("Finding not found.");
            if (comment !== undefined) finding.comment = comment;
            if (included !== undefined) finding.included = included;
            return null;
        },
        review_post: ({ sessionId, input }) => {
            const session = getSession(sessionId);
            if (session.source.kind !== "pr") {
                reject(
                    session.source.kind === "commits"
                        ? "Posting isn't available for commits."
                        : "Posting isn't available for branch comparisons.",
                );
            }
            if (session.isOwnPr && input.event !== "COMMENT") {
                reject(
                    "GitHub doesn't allow approving or requesting changes on your own pull request.",
                );
            }
            counter += 1;
            session.postedReview = {
                id: `r${counter}`,
                url: `${session.source.url}#pullrequestreview-${482000 + counter}`,
                event: input.event,
            };
            emitSession(sessionId);
            return session.postedReview;
        },
    };

    seed();

    return {
        async call(name, args) {
            if (latency > 0) {
                await new Promise((resolve) => setTimeout(resolve, latency));
            }
            // Clone on the way out, like crossing the Tauri IPC boundary.
            return clone(handlers[name](args));
        },
        listen<T>(event: string, handler: (payload: T) => void) {
            // The event name fixes the payload type, as with Tauri's listen<T>.
            const wrapped = (payload: unknown) => handler(payload as T);
            let set = listeners.get(event);
            if (!set) {
                set = new Set();
                listeners.set(event, set);
            }
            set.add(wrapped);
            return () => {
                set.delete(wrapped);
            };
        },
    };
}

let shared: FixtureBackend | undefined;

function backend(): FixtureBackend {
    shared ??= createFixtureBackend({ variants: readVariants() });
    return shared;
}

export function fixtureCall<K extends keyof GrspCommands>(
    name: K,
    args: GrspCommands[K]["args"],
): Promise<GrspCommands[K]["result"]> {
    return backend().call(name, args);
}

export function fixtureListen<T>(
    event: string,
    handler: (payload: T) => void,
): () => void {
    return backend().listen(event, handler);
}
