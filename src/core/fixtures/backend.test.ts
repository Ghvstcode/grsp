import { describe, expect, it } from "vitest";
import {
    GRSP_EVENTS,
    type AnalysisEvent,
    type AskEvent,
    type DiscoveryResult,
    type ReviewResult,
    type SessionEvent,
} from "@core/types/grsp";
import { createFixtureBackend, type FixtureOptions } from "./backend";

const fast = (options: FixtureOptions = {}) =>
    createFixtureBackend({ tick: 1, latency: 0, ...options });

async function until(check: () => Promise<boolean> | boolean) {
    for (let i = 0; i < 400; i += 1) {
        if (await check()) return;
        await new Promise((resolve) => setTimeout(resolve, 2));
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
});
