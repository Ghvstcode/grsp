import { describe, expect, it } from "vitest";
import {
    GRSP_EVENTS,
    type AnalysisEvent,
    type AskEvent,
    type DiscoveryResult,
    type ReviewResult,
    type SessionEvent,
} from "@core/types/grsp";
import { getSingularPatch } from "@pierre/diffs";
import { createFixtureBackend, type FixtureOptions } from "./backend";

const fast = (options: FixtureOptions = {}) =>
    createFixtureBackend({ tick: 1, latency: 0, ...options });

// Up to ~4s: loaded CI runners stretch the fixture backend's timers.
async function until(check: () => Promise<boolean> | boolean) {
    for (let i = 0; i < 800; i += 1) {
        if (await check()) return;
        await new Promise((resolve) => setTimeout(resolve, 5));
    }
    throw new Error("condition not reached");
}

describe("fixture backend", () => {
    it("serves the prototype sessions and their analyses", async () => {
        const backend = fast();
        const sessions = await backend.call("session_list", {});
        expect(sessions.map((s) => s.id)).toEqual([
            "s482",
            "s479",
            "s471",
            "s466",
            "s468",
            "s455",
        ]);
        const analyses = await backend.call("analysis_list", {
            sessionId: "s482",
        });
        expect(analyses.map((a) => [a.kind, a.status])).toEqual([
            ["discovery", "done"],
            ["questions", "done"],
            ["discussion", "done"],
        ]);
    });

    it("streams a lazy walkthrough: running with progress, then done", async () => {
        const backend = fast();
        const events: AnalysisEvent[] = [];
        backend.listen<AnalysisEvent>(GRSP_EVENTS.analysis, (e) =>
            events.push(e),
        );
        await backend.call("analysis_run", {
            sessionId: "s482",
            kind: "walkthrough:ep_bulk",
        });
        await until(() => events.at(-1)?.status === "done");
        expect(events[0]).toMatchObject({
            kind: "walkthrough:ep_bulk",
            status: "running",
        });
        expect(events.filter((e) => e.progress).length).toBeGreaterThan(1);
        const list = await backend.call("analysis_list", { sessionId: "s482" });
        const walk = list.find((a) => a.kind === "walkthrough:ep_bulk");
        expect(walk?.status).toBe("done");
    });

    it("cancels a running analysis", async () => {
        const backend = fast({ tick: 50 });
        await backend.call("analysis_run", {
            sessionId: "s482",
            kind: "review",
        });
        await backend.call("analysis_cancel", {
            sessionId: "s482",
            kind: "review",
        });
        const list = await backend.call("analysis_list", { sessionId: "s482" });
        expect(list.find((a) => a.kind === "review")).toMatchObject({
            status: "error",
            error: "Cancelled.",
        });
    });

    it("answers a suggestion chip through the ask event", async () => {
        const backend = fast();
        const events: AskEvent[] = [];
        backend.listen<AskEvent>(GRSP_EVENTS.ask, (e) => events.push(e));
        const sent = await backend.call("ask_send", {
            sessionId: "s482",
            question: "Can bulk imports skip approval?",
        });
        expect(sent.status).toBe("running");
        await until(() => events.at(-1)?.status === "done");
        const [latest] = await backend.call("ask_list", { sessionId: "s482" });
        expect(latest.id).toBe(sent.id);
        expect(latest.answer?.grounded).toBe(true);
        expect(latest.answer?.excerpt?.file).toBe("orders/repository.py");
    });

    it("gives an ungrounded answer for something not in the repo", async () => {
        const backend = fast();
        const sent = await backend.call("ask_send", {
            sessionId: "s482",
            question: "How is the kubernetes ingress set up?",
        });
        await until(async () => {
            const [latest] = await backend.call("ask_list", {
                sessionId: "s482",
            });
            return latest.id === sent.id && latest.status === "done";
        });
        const [latest] = await backend.call("ask_list", { sessionId: "s482" });
        expect(latest.answer?.grounded).toBe(false);
        expect(latest.answer?.refs).toEqual([]);
    });

    it("runs a review, edits a finding and posts it", async () => {
        const backend = fast();
        await backend.call("analysis_run", {
            sessionId: "s482",
            kind: "review",
        });
        await until(async () => {
            const list = await backend.call("analysis_list", {
                sessionId: "s482",
            });
            return list.find((a) => a.kind === "review")?.status === "done";
        });
        await backend.call("review_update_finding", {
            sessionId: "s482",
            findingId: "f3",
            included: false,
        });
        const list = await backend.call("analysis_list", { sessionId: "s482" });
        // Stored under "review", so the result is a ReviewResult.
        const result = list.find((a) => a.kind === "review")
            ?.result as ReviewResult;
        expect(result.findings.map((f) => f.included)).toEqual([
            true,
            true,
            false,
        ]);
        const posted = await backend.call("review_post", {
            sessionId: "s482",
            input: { event: "REQUEST_CHANGES", body: "Summary" },
        });
        expect(posted.event).toBe("REQUEST_CHANGES");
        const session = await backend.call("session_get", {
            sessionId: "s482",
        });
        expect(session.postedReview?.url).toBe(posted.url);
    });

    it("rejects Approve on your own PR", async () => {
        const backend = fast({ variants: ["ownpr"] });
        await expect(
            backend.call("review_post", {
                sessionId: "s482",
                input: { event: "APPROVE", body: "" },
            }),
        ).rejects.toMatch(/your own pull request/);
    });

    it("creates a session that goes preparing → ready and analyses it", async () => {
        const backend = fast();
        const progress: string[] = [];
        backend.listen<SessionEvent>(GRSP_EVENTS.session, (e) => {
            if (e.progress) progress.push(e.progress);
        });
        const created = await backend.call("session_create", {
            input: {
                kind: "url",
                url: "https://github.com/acme/orders-api/pull/485/files",
            },
        });
        expect(created.status).toBe("preparing");
        expect(created.title).toBe("Expose order status history in the API");
        await until(async () => {
            const list = await backend.call("analysis_list", {
                sessionId: created.id,
            });
            return list.length === 3 && list.every((a) => a.status === "done");
        });
        expect(progress[0]).toBe("Fetching pull/485/head");
        const session = await backend.call("session_get", {
            sessionId: created.id,
        });
        expect(session.status).toBe("ready");
        expect(session.agentPasses).toBe(3);
    });

    it("rejects a PR URL for a repo that hasn't been added", async () => {
        const backend = fast();
        const error: unknown = await backend
            .call("session_create", {
                input: {
                    kind: "url",
                    url: "https://github.com/other/thing/pull/7",
                },
            })
            .catch((e: unknown) => e);
        expect(typeof error).toBe("string");
        expect(JSON.parse(String(error))).toEqual({
            code: "repo_not_added",
            owner: "other",
            name: "thing",
        });
    });

    it("supports the fixture variants", async () => {
        const stale = await fast({ variants: ["stale"] }).call("session_get", {
            sessionId: "s482",
        });
        expect(stale).toMatchObject({ status: "stale", newCommits: 3 });

        const failing = await fast({ variants: ["error"] }).call(
            "analysis_list",
            { sessionId: "s482" },
        );
        const questions = failing.find((a) => a.kind === "questions");
        expect(questions?.status).toBe("error");
        expect(questions?.errorDetails).toBeTruthy();

        const branches = fast({ variants: ["branches"] });
        const pair = await branches.call("session_get", { sessionId: "s482" });
        expect(pair.source.kind).toBe("branches");
        const kinds = (
            await branches.call("analysis_list", { sessionId: "s482" })
        ).map((a) => a.kind);
        expect(kinds).not.toContain("discussion");

        const large = await fast({ variants: ["large", "nodesc"] }).call(
            "analysis_list",
            { sessionId: "s482" },
        );
        // Stored under "discovery", so the result is a DiscoveryResult.
        const discovery = large.find((a) => a.kind === "discovery")
            ?.result as DiscoveryResult;
        expect(discovery.shards).toBe(4);
        expect(discovery.descriptionEmpty).toBe(true);
        expect(discovery.mismatches).toEqual([]);
    });

    it("refreshes a stale session onto the new head", async () => {
        const backend = fast({ variants: ["stale"] });
        const refreshing = await backend.call("session_refresh", {
            sessionId: "s482",
        });
        expect(refreshing.status).toBe("preparing");
        await until(async () => {
            const list = await backend.call("analysis_list", {
                sessionId: "s482",
            });
            return list.length === 3 && list.every((a) => a.status === "done");
        });
        const session = await backend.call("session_get", {
            sessionId: "s482",
        });
        expect(session).toMatchObject({ status: "ready", newCommits: 0 });
        const [ask] = await backend.call("ask_list", { sessionId: "s482" });
        expect(ask.headSha).not.toBe(session.headSha);
    });

    it("lists commits newest first with the last reviewed one marked", async () => {
        const backend = fast();
        const feature = await backend.call("repo_list_commits", {
            repoId: "orders",
            branch: "feat/order-approval",
        });
        expect(feature.commits).toHaveLength(12);
        expect(feature.commits[0].sha).toBe(
            (await backend.call("session_get", { sessionId: "s482" })).headSha,
        );
        expect(feature.commits.some((c) => c.isMerge)).toBe(true);
        expect(feature.commits.some((c) => c.added + c.removed <= 10)).toBe(
            true,
        );
        expect(feature.commits.some((c) => c.subject.length > 120)).toBe(true);
        expect(feature.lastReviewedSha).toBe(feature.commits[4].sha);
        expect(feature.offline).toBeUndefined();
        for (const c of feature.commits) {
            expect(c.sha).toMatch(/^[0-9a-f]{40}$/);
            expect(c.shortSha).toBe(c.sha.slice(0, 7));
        }

        const main = await backend.call("repo_list_commits", {
            repoId: "orders",
            branch: "origin/main",
            limit: 3,
        });
        expect(main.commits).toHaveLength(3);
        expect(main.lastReviewedSha).toBeUndefined();
        // The branch shares its oldest commits with main.
        const shared = await backend.call("repo_list_commits", {
            repoId: "orders",
            branch: "main",
        });
        expect(shared.commits.map((c) => c.sha)).toContain(
            feature.commits[11].sha,
        );

        const empty = await backend.call("repo_list_commits", {
            repoId: "orders",
            branch: "chore/invoices-v2",
        });
        expect(empty.commits).toEqual([]);
        const offline = await fast({ variants: ["offline"] }).call(
            "repo_list_commits",
            { repoId: "orders", branch: "main" },
        );
        expect(offline.offline).toBe(true);
    });

    it("creates a commit session for a range and remembers it as reviewed", async () => {
        const backend = fast();
        const { commits } = await backend.call("repo_list_commits", {
            repoId: "orders",
            branch: "feat/order-approval",
        });
        const created = await backend.call("session_create", {
            input: {
                kind: "commits",
                repoId: "orders",
                branch: "feat/order-approval",
                head: commits[0].sha,
                from: commits[2].sha,
            },
        });
        expect(created.status).toBe("preparing");
        expect(created.source).toEqual({
            kind: "commits",
            branch: "feat/order-approval",
            base: commits[3].sha,
            head: commits[0].sha,
            count: 3,
        });
        expect(created.linesAdded).toBe(64 + 1 + 38);
        expect(created.ci).toBeUndefined();
        expect(created.description).toContain(commits[2].subject);
        await until(async () => {
            const list = await backend.call("analysis_list", {
                sessionId: created.id,
            });
            return list.length === 2 && list.every((a) => a.status === "done");
        });
        const ready = await backend.call("session_get", {
            sessionId: created.id,
        });
        expect(ready.status).toBe("ready");
        // No pull request: no discussion pass, and nothing can be posted.
        const kinds = (
            await backend.call("analysis_list", { sessionId: created.id })
        ).map((a) => a.kind);
        expect(kinds).toEqual(["discovery", "questions"]);
        await backend.call("analysis_run", {
            sessionId: created.id,
            kind: "review",
        });
        await until(async () =>
            (
                await backend.call("analysis_list", { sessionId: created.id })
            ).some((a) => a.kind === "review" && a.status === "done"),
        );
        await expect(
            backend.call("review_post", {
                sessionId: created.id,
                input: { event: "COMMENT", body: "" },
            }),
        ).rejects.toMatch(/isn't available for commits/);

        // The same pick opens the same session; the branch is now caught up.
        const again = await backend.call("session_create", {
            input: {
                kind: "commits",
                repoId: "orders",
                branch: "feat/order-approval",
                head: commits[0].sha,
                from: commits[2].sha,
            },
        });
        expect(again.id).toBe(created.id);
        const after = await backend.call("repo_list_commits", {
            repoId: "orders",
            branch: "feat/order-approval",
        });
        expect(after.lastReviewedSha).toBe(commits[0].sha);
    });

    it("reviews one commit alone and serves a tiny diff for a tiny commit", async () => {
        const backend = fast();
        const { commits } = await backend.call("repo_list_commits", {
            repoId: "orders",
            branch: "feat/order-approval",
        });
        const tiny = commits[1];
        const created = await backend.call("session_create", {
            input: {
                kind: "commits",
                repoId: "orders",
                branch: "feat/order-approval",
                head: tiny.sha,
            },
        });
        expect(created.title).toBe(tiny.subject);
        expect(created.source).toMatchObject({
            base: commits[2].sha,
            head: tiny.sha,
            count: 1,
        });
        expect(created.headSha).toBe(tiny.sha);
        const diff = await backend.call("diff_read", { sessionId: created.id });
        expect(diff.files).toHaveLength(1);
        expect([diff.files[0].added, diff.files[0].removed]).toEqual([1, 1]);

        await expect(
            backend.call("session_create", {
                input: {
                    kind: "commits",
                    repoId: "orders",
                    branch: "main",
                    head: tiny.sha,
                },
            }),
        ).rejects.toMatch(/isn't on this branch/);
    });

    it("serves a whole diff the diff library can parse", async () => {
        const backend = fast();
        const diff = await backend.call("diff_read", { sessionId: "s482" });
        expect(diff.excludedFiles).toBe(2);
        expect(diff.files).toHaveLength(9);
        const statuses = diff.files.map((f) => f.status);
        for (const status of ["added", "modified", "deleted", "renamed"]) {
            expect(statuses).toContain(status);
        }
        const binary = diff.files.filter((f) => f.binary);
        expect(binary).toHaveLength(1);
        expect(binary[0].patch).toBe("");
        expect(diff.files.filter((f) => f.truncated)).toHaveLength(1);
        const renamed = diff.files.find((f) => f.status === "renamed");
        expect(renamed?.oldPath).toBe("tests/test_orders.py");

        for (const file of diff.files) {
            if (file.binary || file.truncated) continue;
            expect(file.patch.startsWith("diff --git ")).toBe(true);
            const parsed = getSingularPatch(file.patch);
            expect(parsed.name).toBe(file.path);
            expect(parsed.prevName).toBe(file.oldPath);
            const counted = file.patch
                .split("\n")
                .filter((l) => /^[+-](?![+-]{2} )/.test(l));
            expect(counted.filter((l) => l.startsWith("+"))).toHaveLength(
                file.added,
            );
            expect(counted.filter((l) => l.startsWith("-"))).toHaveLength(
                file.removed,
            );
        }

        // Lines shown elsewhere in the scenario sit on the same line here.
        const policies = diff.files.find(
            (f) => f.path === "orders/policies.py",
        );
        expect(policies?.patch.split("\n")[11]).toBe(
            "+        if order.total > THRESHOLD:",
        );
        // Sessions outside the scenario have nothing recorded.
        const other = await backend.call("diff_read", { sessionId: "s479" });
        expect(other.files).toEqual([]);
        await expect(
            backend.call("diff_read", { sessionId: "nope" }),
        ).rejects.toBe("Session not found.");
    });

    it("keeps notes: create, edit, delete", async () => {
        const backend = fast();
        const seeded = await backend.call("note_list", { sessionId: "s482" });
        expect(seeded.map((n) => n.anchor?.kind)).toEqual([undefined, "line"]);
        expect(await backend.call("note_list", { sessionId: "s479" })).toEqual(
            [],
        );

        const anchor = {
            kind: "block",
            entryPointId: "ep_orders",
            blockId: "policy",
            label: "ApprovalPolicy.check",
        } as const;
        const created = await backend.call("note_save", {
            sessionId: "s482",
            body: "Why static?",
            anchor,
        });
        expect(created).toMatchObject({
            sessionId: "s482",
            body: "Why static?",
            anchor,
        });
        expect(created.headSha).toMatch(/^3f2a91c/);
        expect(created.createdAt).toBe(created.updatedAt);

        await new Promise((resolve) => setTimeout(resolve, 5));
        const edited = await backend.call("note_save", {
            sessionId: "s482",
            id: created.id,
            body: "Why a static method?",
        });
        expect(edited).toMatchObject({
            id: created.id,
            body: "Why a static method?",
            anchor,
            createdAt: created.createdAt,
        });
        expect(edited.updatedAt > created.updatedAt).toBe(true);

        const listed = await backend.call("note_list", { sessionId: "s482" });
        expect(listed.map((n) => n.id)).toEqual(["n1", "n2", created.id]);
        expect(await backend.call("note_delete", { noteId: "n1" })).toBeNull();
        expect(
            (await backend.call("note_list", { sessionId: "s482" })).map(
                (n) => n.id,
            ),
        ).toEqual(["n2", created.id]);
        await expect(
            backend.call("note_delete", { noteId: "n1" }),
        ).rejects.toBe("Note not found.");
        await expect(
            backend.call("note_save", {
                sessionId: "s482",
                id: "gone",
                body: "x",
            }),
        ).rejects.toBe("Note not found.");
    });

    it("turns the default session into a commit session with ?fx=commit(s)", async () => {
        const one = fast({ variants: ["commit", "tiny"] });
        const single = await one.call("session_get", { sessionId: "s482" });
        expect(single.source).toMatchObject({ kind: "commits", count: 1 });
        expect(single.ci).toBeUndefined();
        expect(single.linesAdded + single.linesRemoved).toBe(2);
        expect(
            (await one.call("diff_read", { sessionId: "s482" })).files,
        ).toHaveLength(1);
        expect(
            (await one.call("analysis_list", { sessionId: "s482" })).map(
                (a) => a.kind,
            ),
        ).toEqual(["discovery", "questions"]);

        const range = await fast({ variants: ["commits"] }).call(
            "session_get",
            { sessionId: "s482" },
        );
        expect(range.source).toMatchObject({
            kind: "commits",
            branch: "feat/order-approval",
            count: 4,
        });
        expect(range.source.kind === "commits" && range.source.base).not.toBe(
            range.headSha,
        );
    });
});
