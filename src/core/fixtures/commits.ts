/**
 * Commit history for the fixture repos: what `repo_list_commits` serves.
 * The orders-api branches tell the story of PR #482 commit by commit.
 */
import type { CommitInfo } from "@core/types/grsp";
import { ago, HEAD_SHA } from "./scenario";

/** A stable 40-character hex string for a seed; not a real hash. */
export function fakeSha(seed: string): string {
    let hash = 0x811c9dc5;
    let out = "";
    for (let round = 0; out.length < 40; round += 1) {
        for (const char of `${seed}:${round}`) {
            hash ^= char.charCodeAt(0);
            hash = Math.imul(hash, 0x01000193) >>> 0;
        }
        out += hash.toString(16).padStart(8, "0");
    }
    return out.slice(0, 40);
}

interface CommitSeed {
    subject: string;
    body?: string;
    author: string;
    hours: number;
    files: number;
    added: number;
    removed: number;
    merge?: boolean;
    sha?: string;
}

function commits(branch: string, seeds: CommitSeed[]): CommitInfo[] {
    return seeds.map((seed) => {
        const sha = seed.sha ?? fakeSha(`${branch}:${seed.subject}`);
        return {
            sha,
            shortSha: sha.slice(0, 7),
            subject: seed.subject,
            body: seed.body ?? "",
            author: seed.author,
            authoredAt: ago(seed.hours),
            filesChanged: seed.files,
            added: seed.added,
            removed: seed.removed,
            isMerge: seed.merge ?? false,
        };
    });
}

const AGENT_TRAILER = "Co-Authored-By: Claude <noreply@anthropic.com>";

const ORDERS_MAIN: CommitSeed[] = [
    {
        subject: "Merge pull request #476 from acme/fix/vat-rounding",
        body: "fix(invoices): round VAT per line, not per invoice",
        author: "Dayo Bello",
        hours: 21,
        files: 3,
        added: 18,
        removed: 9,
        merge: true,
    },
    {
        subject: "fix(invoices): round VAT per line, not per invoice",
        body: `Rounding the invoice total once drifted by a cent against the\nline items for invoices with more than a handful of lines.\n\n- Round each line's VAT to two places before summing\n- Add a regression test with the 37-line invoice from support\n\n${AGENT_TRAILER}`,
        author: "Dayo Bello",
        hours: 23,
        files: 3,
        added: 18,
        removed: 9,
    },
    {
        subject: "chore: bump ruff to 0.6.9",
        author: "Dayo Bello",
        hours: 49,
        files: 2,
        added: 2,
        removed: 2,
    },
    {
        subject:
            "feat(api): expose order status history on GET /orders/:id so the dashboard can show who moved an order and when without a second request",
        body: "Adds `history` to the order serializer, ordered oldest first.",
        author: "Funmi Okafor",
        hours: 74,
        files: 5,
        added: 96,
        removed: 11,
    },
    {
        subject: "test(orders): cover currency mismatch on create",
        author: "Funmi Okafor",
        hours: 98,
        files: 1,
        added: 41,
        removed: 0,
    },
    {
        subject: "Fix flaky timezone assertion in invoice tests",
        author: "Kemi Adeyemi",
        hours: 120,
        files: 1,
        added: 1,
        removed: 1,
    },
    {
        subject: "refactor(orders): move Money into its own module",
        body: `Money was defined inside orders.models and imported from four\nother packages. No behaviour change.\n\n${AGENT_TRAILER}`,
        author: "Kemi Adeyemi",
        hours: 146,
        files: 9,
        added: 74,
        removed: 68,
    },
    {
        subject: "docs: how to run the nightly import locally",
        author: "Dayo Bello",
        hours: 170,
        files: 1,
        added: 23,
        removed: 0,
    },
];

const ORDERS_FEATURE: CommitSeed[] = [
    {
        sha: HEAD_SHA,
        subject:
            "test(approvals): cover the threshold boundary and self-approval",
        body: `Exactly €10,000 must not need approval; one cent more must.\nA creator approving their own order gets a 403.\n\n${AGENT_TRAILER}`,
        author: "Kemi Adeyemi",
        hours: 3,
        files: 2,
        added: 64,
        removed: 0,
    },
    {
        subject: "Fix typo in approval email subject",
        author: "Kemi Adeyemi",
        hours: 5,
        files: 1,
        added: 1,
        removed: 1,
    },
    {
        subject:
            "feat(approvals): email finance approvers when an order needs them",
        body: `Everyone with the finance_approver role gets an email once the\norder's transaction commits. A failed send is logged and skipped\nso one bad address can't block the rest.\n\n- Add approvals.notify.notify_approvers\n- Emit approval.requested from OrderService.create\n\n${AGENT_TRAILER}`,
        author: "Kemi Adeyemi",
        hours: 7,
        files: 3,
        added: 38,
        removed: 2,
    },
    {
        subject: "Merge branch 'main' into feat/order-approval",
        author: "Kemi Adeyemi",
        hours: 20,
        files: 3,
        added: 18,
        removed: 9,
        merge: true,
    },
    {
        subject:
            "feat(api): add POST /orders/:id/approve for finance approvers",
        body: `Restricted to finance_approver. The person who created an order\ncan't approve it.\n\n${AGENT_TRAILER}`,
        author: "Kemi Adeyemi",
        hours: 26,
        files: 4,
        added: 57,
        removed: 3,
    },
    {
        subject:
            "refactor(payments): capture on order.created instead of inside OrderService.create, so the card is only charged once an order is confirmed and never while it is still waiting on a second approver",
        body: "The consumer already ignored unconfirmed orders; this makes it the only place a capture starts.",
        author: "Kemi Adeyemi",
        hours: 28,
        files: 3,
        added: 21,
        removed: 17,
    },
    {
        subject: "feat(orders): save orders over €10k as PENDING_APPROVAL",
        body: `OrderService.create asks ApprovalPolicy before saving.\n\n${AGENT_TRAILER}`,
        author: "Kemi Adeyemi",
        hours: 30,
        files: 2,
        added: 31,
        removed: 6,
    },
    {
        subject: "feat(orders): add ApprovalPolicy with a €10,000 threshold",
        author: "Kemi Adeyemi",
        hours: 31,
        files: 1,
        added: 8,
        removed: 0,
    },
    {
        subject:
            "chore(db): migration 0042 adds PENDING_APPROVAL and approver columns",
        body: "approved_by and approved_at are nullable; existing rows are untouched.",
        author: "Kemi Adeyemi",
        hours: 50,
        files: 2,
        added: 22,
        removed: 0,
    },
    {
        subject: "docs: describe the four-eyes check in the orders README",
        author: "Kemi Adeyemi",
        hours: 52,
        files: 1,
        added: 12,
        removed: 1,
    },
    // Where the branch left main.
    ...ORDERS_MAIN.slice(2, 4),
];

const GENERIC: CommitSeed[] = [
    {
        subject: "chore: update dependencies",
        author: "Dayo Bello",
        hours: 30,
        files: 2,
        added: 14,
        removed: 14,
    },
    {
        subject: "fix: handle empty responses from the provider",
        author: "Funmi Okafor",
        hours: 80,
        files: 2,
        added: 19,
        removed: 4,
    },
    {
        subject: "Initial commit",
        author: "Kemi Adeyemi",
        hours: 900,
        files: 12,
        added: 420,
        removed: 0,
    },
];

/** "origin/main" and "main" are the same history in the fixtures. */
export function localBranchName(branch: string): string {
    return branch.replace(/^origin\//, "");
}

/** Index of the commit a reviewer "last looked at" on the feature branch. */
export const SEEDED_LAST_REVIEWED_INDEX = 4;

/** Newest first. Unknown branches of the orders repo have no commits. */
export function fixtureCommits(repoId: string, branch: string): CommitInfo[] {
    const name = localBranchName(branch);
    if (repoId !== "orders") return commits(`${repoId}:${name}`, GENERIC);
    // Shared history keeps the SHAs it has on main.
    if (name === "main") return commits("main", ORDERS_MAIN);
    if (name === "feat/order-approval") {
        const own = ORDERS_FEATURE.length - 2;
        return [
            ...commits(name, ORDERS_FEATURE.slice(0, own)),
            ...commits("main", ORDERS_FEATURE.slice(own)),
        ];
    }
    return [];
}
