import { describe, expect, it } from "vitest";
import { walkthroughResult } from "@core/fixtures/scenario";
import type { WalkthroughResult } from "@core/types/grsp";
import {
    clampStep,
    defaultOptionIndex,
    mostRelevantStep,
    noteFor,
    routeSteps,
    selectedOption,
    takenBranch,
} from "./walk";

function load(entryPointId: string): WalkthroughResult {
    const result = walkthroughResult(entryPointId);
    if (!result) throw new Error(`no fixture for ${entryPointId}`);
    return result;
}

const ids = (result: WalkthroughResult, option: number, unchanged = true) =>
    routeSteps(result, option, unchanged).map((s) => s.block.id);

describe("what-if routing (SPEC §5.5 acceptance)", () => {
    const orders = load("ep_orders");
    const head = ["route_orders", "validate", "svc_create", "policy"];
    const under = [...head, "insert_conf", "emit_created", "capture"];
    const over = [...head, "insert_pending", "emit_req", "notify"];

    it("routes €9,999 and €10,000 to the confirmed path", () => {
        expect(ids(orders, 0)).toEqual(under);
        expect(ids(orders, 1)).toEqual(under);
    });

    it("routes €25,000 to the pending-approval path", () => {
        expect(ids(orders, 2)).toEqual(over);
    });

    it("starts on the option that runs through the most changed blocks", () => {
        expect(defaultOptionIndex(orders)).toBe(2);
        expect(selectedOption(orders, 2)?.label).toBe("€25,000");
    });

    it("fills the taken branch and swaps the note per input", () => {
        const policy = orders.blocks.find((b) => b.id === "policy");
        if (!policy) throw new Error("policy block missing");
        expect(takenBranch(policy, selectedOption(orders, 0))).toBe("no");
        expect(takenBranch(policy, selectedOption(orders, 2))).toBe("yes");
        expect(noteFor(policy, selectedOption(orders, 1))).toMatch(/Boundary/);
        expect(noteFor(policy, undefined)).toBe(policy.note);
    });

    it("leaves the taken branch unknown without a what-if", () => {
        const approve = load("ep_approve");
        const svc = approve.blocks.find((b) => b.id === "approve_svc");
        if (!svc) throw new Error("approve_svc missing");
        expect(takenBranch(svc, selectedOption(approve, 0))).toBeUndefined();
    });
});

describe("routeSteps", () => {
    it("uses the default path when there is no what-if", () => {
        expect(ids(load("ep_bulk"), 0)).toEqual([
            "job",
            "insert_many",
            "insert_conf",
            "emit_created",
        ]);
    });

    it("hides unchanged blocks without renumbering the rest", () => {
        const steps = routeSteps(load("ep_orders"), 2, false);
        expect(steps.map((s) => s.block.id)).toEqual([
            "svc_create",
            "policy",
            "insert_pending",
            "emit_req",
            "notify",
        ]);
        expect(steps.map((s) => s.number)).toEqual([3, 4, 5, 6, 7]);
    });

    it("keeps not-covered blocks when unchanged ones are hidden", () => {
        expect(ids(load("ep_bulk"), 0, false)).toEqual(["insert_many"]);
    });

    it("skips ids that don't exist and clamps the option index", () => {
        const result = load("ep_bulk");
        const broken = { ...result, path: ["job", "ghost", "insert_many"] };
        expect(ids(broken, 9)).toEqual(["job", "insert_many"]);
    });

    it("marks connectors whose edge failed the spot-check", () => {
        const steps = routeSteps(load("ep_approve"), 0, true);
        const flags = Object.fromEntries(
            steps.map((s) => [s.block.id, s.unconfirmedNext]),
        );
        expect(flags.approve_svc).toBe(true);
        expect(flags.auth).toBe(false);
        expect(flags.capture).toBe(false);
    });
});

describe("mostRelevantStep", () => {
    const refs = [
        { file: "jobs/bulk_import.py", startLine: 57, verified: true },
        { file: "orders/repository.py", startLine: 104, verified: true },
    ];

    it("lands on the not-covered block the mismatch points at", () => {
        const steps = routeSteps(load("ep_bulk"), 0, true);
        expect(mostRelevantStep(steps, refs)).toBe(1);
    });

    it("falls back to the first matching block, then to the start", () => {
        const steps = routeSteps(load("ep_bulk"), 0, true);
        expect(mostRelevantStep(steps, [refs[0]])).toBe(0);
        expect(mostRelevantStep(steps, [])).toBe(0);
        expect(
            mostRelevantStep(steps, [
                { file: "nowhere.py", startLine: 1, verified: true },
            ]),
        ).toBe(0);
    });
});

describe("clampStep", () => {
    it("keeps the step inside the path", () => {
        expect(clampStep(-1, 4)).toBe(0);
        expect(clampStep(9, 4)).toBe(3);
        expect(clampStep(2, 4)).toBe(2);
        expect(clampStep(3, 0)).toBe(0);
    });
});
