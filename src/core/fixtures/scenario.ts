/**
 * The prototype scenario (design/prototype.html) as typed fixtures:
 * PR #482 "Require second approval for orders over €10k" in acme/orders-api.
 */
import type {
    AskAnswer,
    BlockKind,
    BranchList,
    ChangeStatus,
    DiscoveryResult,
    DiscussionResult,
    Excerpt,
    OpenPr,
    QuestionsResult,
    Repo,
    ReviewResult,
    ReviewSession,
    VerificationReport,
    WalkBlock,
    WalkDecision,
    WalkthroughResult,
} from "@core/types/grsp";
import {
    emptyExcerpt,
    excerpt,
    ref,
    registerLines,
    type Row,
} from "./excerpts";

export const HEAD_SHA = "3f2a91c8d1e4b7a09c5512fe0a6d3b48c7e9f210";
export const OLD_HEAD_SHA = "9b1c04e77a2d4f6c8e3051ab9d2f7c6e5a4b3c21";
export const REFRESHED_HEAD_SHA = "c81d5e02f9a34b6d7e8f9012a3b4c5d6e7f80912";
export const BASE_SHA = "a40f7d2c19b3e5f6a7b8c9d0e1f2a3b4c5d6e7f8";
export const VIEWER_LOGIN = "tobi";
export const PRIMARY_SESSION_ID = "s482";

const HOUR = 3_600_000;

export function ago(hours: number): string {
    return new Date(Date.now() - hours * HOUR).toISOString();
}

// ── Repos (the three sidebar folders) ──────────────────────

export const FIXTURE_REPOS: Repo[] = [
    {
        id: "orders",
        name: "orders-api",
        path: "~/code/acme/orders-api",
        defaultBranch: "main",
        remote: { host: "github", owner: "acme", name: "orders-api" },
        language: "Python",
        sidebarOpen: true,
    },
    {
        id: "payments",
        name: "payments-service",
        path: "~/code/acme/payments",
        defaultBranch: "main",
        remote: { host: "github", owner: "acme", name: "payments-service" },
        language: "Python",
        sidebarOpen: true,
    },
    {
        id: "web",
        name: "web-dashboard",
        path: "~/code/acme/web",
        defaultBranch: "main",
        remote: { host: "github", owner: "acme", name: "web-dashboard" },
        language: "TypeScript",
        sidebarOpen: false,
    },
];

export function repoSlug(repoId: string): string {
    const repo = FIXTURE_REPOS.find((r) => r.id === repoId);
    return repo?.remote
        ? `${repo.remote.owner}/${repo.remote.name}`
        : "acme/orders-api";
}

export function prUrl(repoId: string, number: number): string {
    return `https://github.com/${repoSlug(repoId)}/pull/${number}`;
}

// ── Sessions ───────────────────────────────────────────────

export const PR_DESCRIPTION = `## Context

Finance asked for a four-eyes check on large orders after an incident where a high-value order was placed against the wrong customer account and charged before anyone noticed. This PR makes orders over €10,000 wait for a second person with the finance approver role before they're confirmed and the card is charged.

## Changes

- New ApprovalPolicy: orders over €10,000 are saved as PENDING_APPROVAL.
- New POST /orders/:id/approve, restricted to finance_approver; creators can't approve their own orders.
- Approvers get an email when an order needs them.
- Payment capture now happens on order.created, after approval.
- Migration 0042 adds the status value plus approved_by and approved_at.

## Testing

Unit tests for the policy boundaries and self-approval. Manually tested the approve flow on staging.

## Rollout

Behind the \`order_approvals\` flag, EU tenants first.
`;

interface SessionSeed {
    id: string;
    repoId: string;
    number: number;
    title: string;
    author: string;
    headRef: string;
    prState: ReviewSession["prState"];
    posted?: ReviewSession["postedReview"];
    openedHoursAgo: number;
    description?: string;
    filesChanged: number;
    linesAdded: number;
    linesRemoved: number;
}

function seedSession(seed: SessionSeed): ReviewSession {
    return {
        id: seed.id,
        repoId: seed.repoId,
        source: {
            kind: "pr",
            number: seed.number,
            url: prUrl(seed.repoId, seed.number),
        },
        title: seed.title,
        description: seed.description ?? "",
        author: seed.author,
        baseRef: "main",
        headRef: seed.headRef,
        baseSha: BASE_SHA,
        headSha: HEAD_SHA,
        mergeBaseSha: BASE_SHA,
        status: "ready",
        prState: seed.prState,
        isOwnPr: false,
        ci: { state: "passing", passed: 12, total: 12 },
        filesChanged: seed.filesChanged,
        linesAdded: seed.linesAdded,
        linesRemoved: seed.linesRemoved,
        newCommits: 0,
        agentPasses: 4,
        postedReview: seed.posted,
        createdAt: ago(seed.openedHoursAgo + 30),
        lastOpenedAt: ago(seed.openedHoursAgo),
    };
}

function posted(
    repoId: string,
    number: number,
    event: "COMMENT" | "APPROVE" | "REQUEST_CHANGES",
) {
    return {
        id: `r${number}`,
        url: `${prUrl(repoId, number)}#pullrequestreview-${number}001`,
        event,
    };
}

export function seedSessions(): ReviewSession[] {
    return [
        seedSession({
            id: PRIMARY_SESSION_ID,
            repoId: "orders",
            number: 482,
            title: "Require second approval for orders over €10k",
            author: "kemi.a",
            headRef: "feat/order-approval",
            prState: "open",
            openedHoursAgo: 0,
            description: PR_DESCRIPTION,
            filesChanged: 9,
            linesAdded: 212,
            linesRemoved: 38,
        }),
        seedSession({
            id: "s479",
            repoId: "orders",
            number: 479,
            title: "Migrate invoices to v2 schema",
            author: "dayo.b",
            headRef: "chore/invoices-v2",
            prState: "open",
            posted: posted("orders", 479, "APPROVE"),
            openedHoursAgo: 26,
            filesChanged: 14,
            linesAdded: 301,
            linesRemoved: 164,
        }),
        seedSession({
            id: "s471",
            repoId: "payments",
            number: 471,
            title: "Rate-limit webhook retries",
            author: "funmi.o",
            headRef: "fix/webhook-retries",
            prState: "merged",
            posted: posted("payments", 471, "COMMENT"),
            openedHoursAgo: 50,
            filesChanged: 4,
            linesAdded: 88,
            linesRemoved: 12,
        }),
        seedSession({
            id: "s466",
            repoId: "payments",
            number: 466,
            title: "Idempotency keys for refunds",
            author: "kemi.a",
            headRef: "feat/refund-idempotency",
            prState: "open",
            posted: posted("payments", 466, "REQUEST_CHANGES"),
            openedHoursAgo: 75,
            filesChanged: 7,
            linesAdded: 140,
            linesRemoved: 22,
        }),
        seedSession({
            id: "s468",
            repoId: "web",
            number: 468,
            title: "Approvals inbox for finance",
            author: "funmi.o",
            headRef: "feat/approvals-inbox",
            prState: "open",
            posted: posted("web", 468, "COMMENT"),
            openedHoursAgo: 98,
            filesChanged: 11,
            linesAdded: 420,
            linesRemoved: 35,
        }),
        seedSession({
            id: "s455",
            repoId: "web",
            number: 455,
            title: "Dark mode tokens",
            author: "dayo.b",
            headRef: "chore/dark-tokens",
            prState: "merged",
            openedHoursAgo: 190,
            filesChanged: 3,
            linesAdded: 61,
            linesRemoved: 48,
        }),
    ];
}

// ── Code ───────────────────────────────────────────────────

const SVC_CREATE: readonly Row[] = [
    ["ctx", "def create(self, data):"],
    ["ctx", "    order = Order.from_input(data)"],
    ["del", "    order.status = Status.CONFIRMED"],
    ["add", "    decision = ApprovalPolicy.check(order)"],
    ["add", "    if decision is Decision.REQUIRES_APPROVAL:"],
    ["add", "        order.status = Status.PENDING_APPROVAL"],
    ["add", "    else:"],
    ["add", "        order.status = Status.CONFIRMED"],
    ["ctx", "    self.repo.insert(order)"],
];

const POLICY: readonly Row[] = [
    ["add", 'THRESHOLD = Money("10000.00", "EUR")'],
    ["add", ""],
    ["add", "class ApprovalPolicy:"],
    ["add", "    @staticmethod"],
    ["add", "    def check(order):"],
    ["add", "        if order.total > THRESHOLD:"],
    ["add", "            return Decision.REQUIRES_APPROVAL"],
    ["add", "        return Decision.OK"],
];

const NOTIFY: readonly Row[] = [
    ["add", "def notify_approvers(order):"],
    ["add", '    approvers = User.objects.with_role("finance_approver")'],
    ["add", "    for user in approvers:"],
    ["add", "        try:"],
    ["add", "            mailer.send(user.email, approval_email(order))"],
    ["add", "        except MailerError:"],
    ["add", '            log.warning("approval email failed", order=order.id)'],
];

const APPROVE: readonly Row[] = [
    ["add", "def approve(self, order_id, approver):"],
    ["add", "    order = self.repo.get(order_id)"],
    ["add", "    if order.status != Status.PENDING_APPROVAL:"],
    ["add", "        raise InvalidState()"],
    ["add", "    if approver.id == order.created_by:"],
    ["add", '        raise Forbidden("cannot approve own order")'],
    ["add", "    order.confirm(approved_by=approver.id)"],
];

const INSERT_MANY: readonly Row[] = [
    ["ctx", "def insert_many(self, rows):"],
    ["ctx", "    orders = [Order.from_row(r) for r in rows]"],
    ["ctx", "    for o in orders:"],
    ["ctx", "        o.status = Status.CONFIRMED"],
    ["ctx", "    Order.objects.bulk_create(orders)"],
];

const BULK_RUN: readonly Row[] = [
    ["ctx", "def run(self):"],
    ["ctx", "    rows = self.portal.fetch_csv()"],
    ["ctx", "    valid = [r for r in rows if r.is_valid()]"],
    ["ctx", '    log.info("importing %d orders", len(valid))'],
    ["ctx", "    OrderRepository().insert_many(valid)"],
    ["ctx", "    for row in valid:"],
    ["ctx", '        events.emit("order.created", row.order_id)'],
];

const CONSUMER: readonly Row[] = [
    ["ctx", '@consumer("order.created", retries=3, backoff="exp")'],
    ["ctx", "def on_order_created(event):"],
    ["ctx", "    order = Order.objects.get(id=event.order_id)"],
    ["ctx", "    if order.status != Status.CONFIRMED:"],
    ["ctx", "        return"],
    ["ctx", "    PaymentService.capture(order)  # raises on timeout"],
];

// The rest of ApprovalService.approve, behind "Show all" on that block.
registerLines("approvals/service.py", 42, [
    ["add", "    self.repo.update(order)"],
    ["add", '    events.emit("order.created", order.id)'],
    ["add", "    return order"],
]);

// ── Discovery ──────────────────────────────────────────────

export const DISCOVERY_VERIFICATION: VerificationReport = {
    verified: 41,
    dropped: 3,
    unverified: 2,
    notes: [],
    filesExplored: 23,
};

export function discoveryResult(): DiscoveryResult {
    return {
        behaviourSummary:
            "Orders created through `POST /orders` with a total strictly above €10,000 are saved as PENDING_APPROVAL and approvers are emailed. A new endpoint lets a finance approver, who isn't the creator, confirm them. Payment capture moves to after approval.",
        descriptionEmpty: false,
        mismatches: [
            {
                id: "m1",
                claim: "The description says *all* orders over €10k need approval.",
                reality:
                    "The nightly `BulkImportJob` creates orders without going through the approval check.",
                refs: [
                    ref("jobs/bulk_import.py", 57, "insert_many"),
                    ref("orders/repository.py", 104, "Status.CONFIRMED"),
                ],
                entryPointId: "ep_bulk",
            },
        ],
        entryPoints: [
            {
                id: "ep_bulk",
                label: "BulkImportJob (nightly)",
                kind: "job",
                ref: ref("jobs/bulk_import.py", 53, "def run"),
                effect: "Still creates orders as CONFIRMED, no approval",
                risk: "high",
                tag: "not_covered",
                hasGap: true,
            },
            {
                id: "ep_orders",
                label: "POST /orders",
                kind: "http",
                ref: ref("api/views/orders.py", 12, "def post"),
                effect: "New pending state, emails approvers, defers payment",
                risk: "high",
                tag: "changed",
                hasGap: false,
            },
            {
                id: "ep_approve",
                label: "POST /orders/:id/approve",
                kind: "http",
                ref: ref("api/views/approvals.py", 9, "def post"),
                effect: "New endpoint: confirms order, then charges card",
                risk: "medium",
                tag: "new",
                hasGap: false,
            },
            {
                id: "ep_consumer",
                label: "order.created consumer",
                kind: "consumer",
                ref: ref("orders/consumers.py", 31, "on_order_created"),
                effect: "Now fires later for large orders, after approval",
                risk: "low",
                tag: "timing",
                hasGap: false,
            },
        ],
        gaps: [
            {
                ref: ref("orders/repository.py", 101, "insert_many"),
                writeTarget: "orders table",
                explanation:
                    "insert_many writes orders as CONFIRMED without calling OrderService, so ApprovalPolicy never runs.",
                entryPointId: "ep_bulk",
            },
        ],
        removed: [],
        askSuggestions: [
            "Which tests cover the new flow?",
            "Where is the €10k threshold defined?",
            "Can bulk imports skip approval?",
        ],
    };
}

// ── Questions ──────────────────────────────────────────────

export function questionsResult(): QuestionsResult {
    return {
        questions: [
            {
                id: "q1",
                question:
                    "What happens to orders already pending payment when this deploys?",
                answer: "Nothing changes for them. Migration 0042 only adds the PENDING_APPROVAL value and two nullable columns; existing rows keep their status. The policy runs on create only.",
                refs: [
                    ref("orders/migrations/0042.py", 1),
                    ref("orders/services.py", 22, "ApprovalPolicy.check"),
                ],
                opened: false,
            },
            {
                id: "q2",
                question:
                    "Can the person who created an order also approve it?",
                answer: "No. ApprovalService.approve rejects with 403 when the approver created the order, and a test covers it.",
                refs: [
                    ref("approvals/service.py", 39, "order.created_by"),
                    ref("tests/test_approvals.py", 88),
                ],
                opened: false,
            },
            {
                id: "q3",
                question:
                    "Is there any way a €10k+ order gets confirmed without approval?",
                answer: "Yes. BulkImportJob writes through OrderRepository.insert_many and never touches OrderService, so the policy is skipped.",
                refs: [
                    ref("jobs/bulk_import.py", 57, "insert_many"),
                    ref("orders/repository.py", 104, "Status.CONFIRMED"),
                ],
                opened: false,
            },
            {
                id: "q4",
                question: "What happens if the approver email fails to send?",
                answer: "The error is logged and not retried. The order stays PENDING_APPROVAL with nobody notified. No test covers this path.",
                refs: [ref("approvals/notify.py", 19, "except MailerError")],
                opened: false,
            },
        ],
    };
}

// ── Discussion ─────────────────────────────────────────────

export function discussionResult(): DiscussionResult {
    return {
        digest: "The author agreed to move the €10k threshold into settings as a follow-up. Nobody has answered whether delegated approvers could approve their own orders, and that's the one that could matter before merge. The two resolved threads were a rename and a boundary test, both done.",
        commentCount: 9,
        threads: [
            {
                id: "t1",
                path: "orders/policies.py",
                line: 1,
                resolved: false,
                gist: "Move the €10k threshold into settings?",
                comments: [
                    {
                        id: "c1",
                        author: "dayo.b",
                        createdAt: ago(48),
                        body: "Should the threshold live in settings? Finance will want to change it without a deploy, and different tenants probably want different limits. We've been burned by hard-coded money values before, the VAT rounding one took a week to unwind because it was copied into three services and nobody remembered all of them.",
                    },
                    {
                        id: "c2",
                        author: "kemi.a",
                        createdAt: ago(46),
                        body: "Fair. Can I do it as a follow-up? I'd like the flow merged before quarter close.",
                    },
                    {
                        id: "c3",
                        author: "dayo.b",
                        createdAt: ago(25),
                        body: "Fine by me if there's a ticket.",
                    },
                ],
            },
            {
                id: "t2",
                path: "approvals/service.py",
                line: 39,
                resolved: false,
                gist: "Delegated approvers could approve their own orders",
                comments: [
                    {
                        id: "c4",
                        author: "funmi.o",
                        createdAt: ago(20),
                        body: "What about delegated approvers? When someone is on leave, their approvals get routed to a delegate. If the creator is themselves a delegate for the approver, they could end up approving their own order through the delegation path. I don't think we need to solve all of delegation in this PR, but we should check whether delegation applies to finance_approver at all. I believe it was added for the expense flow last year and may apply here automatically, in which case the self-approval check is easy to get around.\n\n```suggestion\n    if approver.id in {order.created_by, *delegates_of(order.created_by)}:\n```",
                    },
                ],
            },
            {
                id: "t3",
                path: "orders/services.py",
                line: 21,
                resolved: true,
                gist: "nit: rename decision → approval_decision",
                comments: [
                    {
                        id: "c5",
                        author: "dayo.b",
                        createdAt: ago(72),
                        body: "nit: approval_decision reads clearer here.",
                    },
                    {
                        id: "c6",
                        author: "kemi.a",
                        createdAt: ago(70),
                        body: "Done.",
                    },
                ],
            },
            {
                id: "t4",
                path: "tests/test_policy.py",
                resolved: true,
                gist: "Add a test for exactly €10,000",
                comments: [
                    {
                        id: "c7",
                        author: "funmi.o",
                        createdAt: ago(74),
                        body: "Can we pin the boundary with a test at exactly €10,000?",
                    },
                    {
                        id: "c8",
                        author: "kemi.a",
                        createdAt: ago(50),
                        body: "Added in 3f2a91c.",
                    },
                ],
            },
            {
                id: "t5",
                resolved: false,
                gist: "CI bot reports the smoke E2E tier was selected.",
                comments: [
                    {
                        id: "c9",
                        author: "github-actions[bot]",
                        createdAt: ago(45),
                        body: '<!-- smart-e2e-selection -->\n## Smart E2E Selection — Smoke tier selected\n\n<details>\n<summary><a href="https://example.com/runs/482">Why this tier</a></summary>\n\n- Only `orders/` and `approvals/` changed\n- No migration touches a shared table\n\n</details>\n\n| Suite | Tests |\n| --- | --- |\n| smoke | 14 |',
                    },
                ],
            },
        ],
    };
}

export function emptyDiscussion(): DiscussionResult {
    return { digest: "", commentCount: 0, threads: [] };
}

// ── Walkthroughs ───────────────────────────────────────────

interface BlockSeed {
    label: string;
    kind: BlockKind;
    status: ChangeStatus;
    file: string;
    line: number;
    note: string;
    decision?: WalkDecision;
    excerpt?: Excerpt;
}

function blockSeeds(): Record<string, BlockSeed> {
    return {
        route_orders: {
            label: "POST /orders",
            kind: "route",
            status: "unchanged",
            file: "api/views/orders.py",
            line: 12,
            note: "Request enters and the body is parsed into CreateOrderInput. Nothing changed here.",
        },
        validate: {
            label: "CreateOrderSchema.validate",
            kind: "validation",
            status: "unchanged",
            file: "orders/schemas.py",
            line: 8,
            note: "Checks line items and currency. Unchanged.",
        },
        svc_create: {
            label: "OrderService.create",
            kind: "service",
            status: "changed",
            file: "orders/services.py",
            line: 18,
            note: "Now asks ApprovalPolicy before saving. Previously every valid order was saved straight to CONFIRMED.",
            excerpt: excerpt("orders/services.py", 18, SVC_CREATE),
        },
        policy: {
            label: "ApprovalPolicy.check",
            kind: "policy",
            status: "new",
            file: "orders/policies.py",
            line: 5,
            note: "Compares the order total with the €10,000 threshold and decides whether a second approval is needed.",
            decision: {
                condition: "order.total > €10,000",
                yes: "REQUIRES_APPROVAL",
                no: "OK",
                ref: ref("orders/policies.py", 6, "order.total > THRESHOLD"),
            },
            excerpt: excerpt("orders/policies.py", 1, POLICY),
        },
        insert_pending: {
            label: "orders.insert",
            kind: "db_write",
            status: "changed",
            file: "orders/repository.py",
            line: 41,
            note: "Row is saved with status = PENDING_APPROVAL, a new value added in migration 0042. No payment is taken yet.",
        },
        emit_req: {
            label: "emit approval.requested",
            kind: "event",
            status: "new",
            file: "orders/events.py",
            line: 22,
            note: "New event. Only the approvals worker consumes it.",
        },
        notify: {
            label: "Mailer.send → approvers",
            kind: "external",
            status: "new",
            file: "approvals/notify.py",
            line: 14,
            note: "Emails everyone with the finance_approver role. Runs after commit; failures are logged but not retried.",
            excerpt: excerpt("approvals/notify.py", 14, NOTIFY),
        },
        insert_conf: {
            label: "orders.insert",
            kind: "db_write",
            status: "unchanged",
            file: "orders/repository.py",
            line: 41,
            note: "Row is saved with status = CONFIRMED, same as before this PR.",
        },
        emit_created: {
            label: "emit order.created",
            kind: "event",
            status: "unchanged",
            file: "orders/events.py",
            line: 14,
            note: "Fulfilment starts downstream. Unchanged.",
        },
        capture: {
            label: "PaymentService.capture",
            kind: "external",
            status: "unchanged",
            file: "payments/service.py",
            line: 88,
            note: "Card is charged. Unchanged, but it now runs only for confirmed orders.",
        },
        route_approve: {
            label: "POST /orders/:id/approve",
            kind: "route",
            status: "new",
            file: "api/views/approvals.py",
            line: 9,
            note: "New endpoint the finance dashboard calls to approve a pending order.",
        },
        auth: {
            label: "requires_role('finance_approver')",
            kind: "auth",
            status: "new",
            file: "api/permissions.py",
            line: 31,
            note: "Anyone without the finance_approver role gets a 403.",
        },
        approve_svc: {
            label: "ApprovalService.approve",
            kind: "service",
            status: "new",
            file: "approvals/service.py",
            line: 35,
            note: "Rejects the request if the order is not pending, or if the approver is the person who created it.",
            decision: {
                condition: "approver == order.created_by",
                yes: "403 Forbidden",
                no: "continue",
                ref: ref("approvals/service.py", 39, "order.created_by"),
            },
            excerpt: excerpt("approvals/service.py", 35, APPROVE, {
                totalLines: 10,
            }),
        },
        update: {
            label: "orders.update",
            kind: "db_write",
            status: "new",
            file: "orders/repository.py",
            line: 63,
            note: "Sets status = CONFIRMED and records approved_by and approved_at.",
        },
        job: {
            label: "BulkImportJob.run",
            kind: "job",
            status: "unchanged",
            file: "jobs/bulk_import.py",
            line: 53,
            note: "Nightly CSV import from the B2B portal. Not touched by this PR.",
            excerpt: excerpt("jobs/bulk_import.py", 53, BULK_RUN),
        },
        insert_many: {
            label: "OrderRepository.insert_many",
            kind: "data_access",
            status: "not_covered",
            file: "orders/repository.py",
            line: 101,
            note: "Writes orders directly and skips OrderService, so ApprovalPolicy never runs. A €25,000 imported order lands CONFIRMED with no approval.",
            excerpt: excerpt("orders/repository.py", 101, INSERT_MANY, {
                highlight: 104,
            }),
        },
        consumer: {
            label: "on_order_created",
            kind: "job",
            status: "unchanged",
            file: "orders/consumers.py",
            line: 31,
            note: "Consumes order.created and charges the card. The code is unchanged, but for large orders the event now arrives only after approval.",
            excerpt: excerpt("orders/consumers.py", 30, CONSUMER),
        },
    };
}

function buildBlocks(
    ids: readonly string[],
    edges: Record<string, string[]>,
    unconfirmed: Record<string, string[]> = {},
): WalkBlock[] {
    const seeds = blockSeeds();
    return ids.map((id) => {
        const seed = seeds[id];
        return {
            id,
            label: seed.label,
            kind: seed.kind,
            ref: ref(seed.file, seed.line),
            note: seed.note,
            next: edges[id] ?? [],
            decision: seed.decision,
            status: seed.status,
            excerpt: seed.excerpt ?? emptyExcerpt(seed.file, seed.line),
            unconfirmedEdges: unconfirmed[id] ?? [],
        };
    });
}

const ORDERS_HEAD = ["route_orders", "validate", "svc_create", "policy"];
const ORDERS_UNDER = [...ORDERS_HEAD, "insert_conf", "emit_created", "capture"];
const ORDERS_OVER = [...ORDERS_HEAD, "insert_pending", "emit_req", "notify"];

export function walkthroughResult(
    entryPointId: string,
): WalkthroughResult | undefined {
    switch (entryPointId) {
        case "ep_orders":
            return {
                entryPointId,
                blocks: buildBlocks(
                    [
                        ...ORDERS_HEAD,
                        "insert_pending",
                        "emit_req",
                        "notify",
                        "insert_conf",
                        "emit_created",
                        "capture",
                    ],
                    {
                        route_orders: ["validate"],
                        validate: ["svc_create"],
                        svc_create: ["policy"],
                        policy: ["insert_pending", "insert_conf"],
                        insert_pending: ["emit_req"],
                        emit_req: ["notify"],
                        insert_conf: ["emit_created"],
                        emit_created: ["capture"],
                    },
                ),
                path: ORDERS_OVER,
                whatIf: {
                    variable: "total",
                    options: [
                        {
                            label: "€9,999",
                            path: ORDERS_UNDER,
                            taken: { policy: "no" },
                            notes: {
                                policy: "Total is €9,999, under the threshold, so it returns OK and the order is confirmed as before.",
                            },
                        },
                        {
                            label: "€10,000",
                            path: ORDERS_UNDER,
                            taken: { policy: "no" },
                            notes: {
                                policy: 'Boundary case: exactly €10,000 is not greater than €10,000, so this order skips approval. That matches "over €10k" in the description, but it is worth confirming with the author.',
                            },
                            note: "Exactly €10,000 is not over the threshold.",
                        },
                        {
                            label: "€25,000",
                            path: ORDERS_OVER,
                            taken: { policy: "yes" },
                            notes: {
                                policy: "Total is €25,000, above the threshold, so it returns REQUIRES_APPROVAL and the order goes to pending.",
                            },
                        },
                    ],
                },
            };
        case "ep_approve": {
            const path = [
                "route_approve",
                "auth",
                "approve_svc",
                "update",
                "emit_created",
                "capture",
            ];
            return {
                entryPointId,
                blocks: buildBlocks(
                    path,
                    {
                        route_approve: ["auth"],
                        auth: ["approve_svc"],
                        approve_svc: ["update"],
                        update: ["emit_created"],
                        emit_created: ["capture"],
                    },
                    // order.confirm(...) doesn't name orders.update directly.
                    { approve_svc: ["update"] },
                ),
                path,
            };
        }
        case "ep_bulk": {
            const path = ["job", "insert_many", "insert_conf", "emit_created"];
            return {
                entryPointId,
                blocks: buildBlocks(path, {
                    job: ["insert_many"],
                    insert_many: ["insert_conf"],
                    insert_conf: ["emit_created"],
                }),
                path,
            };
        }
        case "ep_consumer": {
            const path = ["emit_created", "consumer", "capture"];
            return {
                entryPointId,
                blocks: buildBlocks(path, {
                    emit_created: ["consumer"],
                    consumer: ["capture"],
                }),
                path,
            };
        }
        default:
            return undefined;
    }
}

// ── Review ─────────────────────────────────────────────────

export function reviewResult(): ReviewResult {
    return {
        summary:
            "Blocking: bulk imports skip the new approval check. Two smaller notes inline.",
        repoPromptActive: true,
        findings: [
            {
                id: "f1",
                severity: "blocking",
                title: "Bulk imports bypass the approval check",
                why: "BulkImportJob writes through OrderRepository.insert_many, which hard-codes CONFIRMED. Imported orders over €10,000 are confirmed and charged with no approval, which contradicts the PR description.",
                ref: ref("jobs/bulk_import.py", 57, "insert_many"),
                excerpt: excerpt("jobs/bulk_import.py", 53, BULK_RUN, {
                    highlight: 57,
                }),
                comment:
                    "This path skips ApprovalPolicy, so imported orders over €10k are confirmed and charged without approval. Could insert_many go through OrderService.create, or apply the policy per row before saving?",
                included: true,
                // jobs/bulk_import.py isn't part of the PR diff.
                anchoring: "summary",
            },
            {
                id: "f2",
                severity: "should_fix",
                title: "Failed approver emails are dropped",
                why: "A mailer error is logged and swallowed. The order then sits in PENDING_APPROVAL with nobody told, and the customer waits indefinitely.",
                ref: ref("approvals/notify.py", 19, "except MailerError"),
                excerpt: excerpt("approvals/notify.py", 14, NOTIFY, {
                    highlight: 19,
                }),
                comment:
                    "If every send fails, this order is stuck with nobody notified. Suggest retrying via the task queue and surfacing stale pending orders in the approvals inbox.",
                included: true,
                anchoring: "inline",
            },
            {
                id: "f3",
                severity: "nit",
                title: "Threshold is a hard-coded constant",
                why: "Already raised in the discussion and agreed as a follow-up. Worth linking the ticket so it is not lost.",
                ref: ref("orders/policies.py", 1, "THRESHOLD"),
                excerpt: excerpt("orders/policies.py", 1, POLICY.slice(0, 3), {
                    highlight: 1,
                }),
                comment:
                    "Agreed to handle in a follow-up. Could you link the ticket here?",
                included: true,
                anchoring: "inline",
            },
        ],
    };
}

// ── Ask ────────────────────────────────────────────────────

export interface CannedAnswer {
    answer: AskAnswer;
    verification: VerificationReport;
    progress: string[];
}

function report(verified: number, filesExplored: number): VerificationReport {
    return { verified, dropped: 0, unverified: 0, notes: [], filesExplored };
}

/** The prototype's canned answers, picked by keyword like `answerFor`. */
export function answerFor(question: string): CannedAnswer {
    const q = question.toLowerCase();
    if (/time|timeout|payment|capture|fail/.test(q)) {
        return {
            answer: {
                paragraphs: [
                    "Approval is saved before the charge. ApprovalService.approve commits status = CONFIRMED and emits order.created; the consumer then calls PaymentService.capture.",
                    "If capture times out, the consumer retries 3 times with exponential backoff, then sends the event to the dead-letter queue. The order stays CONFIRMED but unpaid, and nothing alerts finance. That gap existed before, but this PR makes it more likely for large orders, since they now sit pending and get charged later.",
                ],
                excerpt: excerpt("orders/consumers.py", 30, CONSUMER, {
                    highlight: 35,
                }),
                refs: [
                    ref("approvals/service.py", 43, "order.created"),
                    ref("orders/consumers.py", 35, "PaymentService.capture"),
                    ref("payments/service.py", 88, "def capture"),
                ],
                confidence: "high",
                grounded: true,
            },
            verification: report(3, 3),
            progress: [
                "Reading approvals/service.py",
                "Searching for order.created",
                "Reading orders/consumers.py",
                "Reading payments/service.py",
            ],
        };
    }
    if (/test/.test(q)) {
        return {
            answer: {
                paragraphs: [
                    "Tests cover the policy at €9,999, €10,000 and €10,000.01, the self-approval rejection, and the role check on the approve endpoint.",
                    "Nothing covers BulkImportJob or the path where the approver email fails.",
                ],
                refs: [
                    ref("tests/test_policy.py", 1),
                    ref("tests/test_approvals.py", 88, "test_self_approval"),
                ],
                confidence: "medium",
                grounded: true,
            },
            verification: report(2, 2),
            progress: [
                "Listing tests/",
                "Reading tests/test_policy.py",
                "Reading tests/test_approvals.py",
            ],
        };
    }
    if (/bulk|import|job|skip/.test(q)) {
        return {
            answer: {
                paragraphs: [
                    "Yes. BulkImportJob calls OrderRepository.insert_many directly, which hard-codes CONFIRMED and never goes through OrderService, so the policy never runs.",
                ],
                excerpt: excerpt("orders/repository.py", 101, INSERT_MANY, {
                    highlight: 104,
                }),
                refs: [
                    ref("jobs/bulk_import.py", 57, "insert_many"),
                    ref("orders/repository.py", 104, "Status.CONFIRMED"),
                ],
                confidence: "high",
                grounded: true,
            },
            verification: report(2, 2),
            progress: [
                "Searching for insert_many",
                "Reading jobs/bulk_import.py",
                "Reading orders/repository.py",
            ],
        };
    }
    if (/threshold|10k|10,000|limit|config|defined/.test(q)) {
        return {
            answer: {
                paragraphs: [
                    "It is a module constant in orders/policies.py, in EUR, compared with a strict greater-than. It is not tenant-specific and can only change with a deploy. There is an open review thread asking to move it into settings.",
                ],
                excerpt: excerpt("orders/policies.py", 1, POLICY.slice(0, 6), {
                    highlight: 1,
                }),
                refs: [ref("orders/policies.py", 1, "THRESHOLD")],
                confidence: "high",
                grounded: true,
            },
            verification: report(1, 1),
            progress: ["Searching for THRESHOLD", "Reading orders/policies.py"],
        };
    }
    return {
        answer: {
            paragraphs: [
                "Nothing changed in this PR matches that directly. The closest changed symbols are OrderService.create and ApprovalService.approve. Try asking about one of those, or about a specific behaviour.",
            ],
            refs: [],
            confidence: "low",
            grounded: false,
        },
        verification: report(0, 4),
        progress: [
            "Searching the worktree",
            "Reading orders/services.py",
            "Reading approvals/service.py",
        ],
    };
}

export const INITIAL_QUESTION =
    "What happens if the payment provider times out after approval?";

// ── Progress lines (SPEC §4.4) ─────────────────────────────

export const PROGRESS: Record<string, string[]> = {
    discovery: [
        "Reading the diff: 9 files changed",
        "Reading orders/services.py",
        "Reading orders/policies.py",
        "Searching for callers of OrderService.create",
        "Searching for bulk_create",
        "Reading jobs/bulk_import.py",
        "Comparing the description with the code",
    ],
    questions: [
        "Reading orders/migrations/0042.py",
        "Reading approvals/service.py",
        "Reading approvals/notify.py",
    ],
    discussion: ["Reading 8 comments in 4 threads", "Summarising open threads"],
    review: [
        "Reading the review prompt",
        "Reading orders/services.py",
        "Reading jobs/bulk_import.py",
        "Searching for insert_many",
        "Reading approvals/notify.py",
        "Checking the discussion for points already raised",
        "Drafting comments",
    ],
    walkthrough: [
        "Reading the entry point",
        "Following calls into orders/services.py",
        "Reading orders/repository.py",
        "Checking each step against the diff",
    ],
};

// ── GitHub lists for the new-review dialog ─────────────────

export const OPEN_PRS: Record<string, OpenPr[]> = {
    orders: [
        openPr("orders", 482, "Require second approval for orders over €10k", {
            author: "kemi.a",
            headRef: "feat/order-approval",
            hours: 3,
        }),
        openPr("orders", 485, "Expose order status history in the API", {
            author: "funmi.o",
            headRef: "feat/status-history",
            hours: 9,
        }),
        openPr("orders", 479, "Migrate invoices to v2 schema", {
            author: "dayo.b",
            headRef: "chore/invoices-v2",
            hours: 28,
        }),
        openPr("orders", 477, "Draft: tenant-specific approval limits", {
            author: "kemi.a",
            headRef: "spike/tenant-limits",
            hours: 80,
            isDraft: true,
        }),
    ],
    payments: [
        openPr("payments", 474, "Retry captures on provider 5xx", {
            author: "funmi.o",
            headRef: "fix/capture-retry",
            hours: 5,
        }),
        openPr("payments", 466, "Idempotency keys for refunds", {
            author: "kemi.a",
            headRef: "feat/refund-idempotency",
            hours: 76,
        }),
    ],
    web: [
        openPr("web", 468, "Approvals inbox for finance", {
            author: "funmi.o",
            headRef: "feat/approvals-inbox",
            hours: 30,
        }),
    ],
};

function openPr(
    repoId: string,
    number: number,
    title: string,
    extra: {
        author: string;
        headRef: string;
        hours: number;
        isDraft?: boolean;
    },
): OpenPr {
    return {
        number,
        title,
        author: extra.author,
        updatedAt: ago(extra.hours),
        url: prUrl(repoId, number),
        headRef: extra.headRef,
        baseRef: "main",
        isDraft: extra.isDraft ?? false,
    };
}

export const BRANCHES: BranchList = {
    local: ["main", "feat/order-approval", "chore/invoices-v2"],
    remote: [
        "origin/main",
        "origin/feat/order-approval",
        "origin/feat/status-history",
        "origin/release/2026-10",
    ],
    defaultBranch: "main",
};
