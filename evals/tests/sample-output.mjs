/**
 * A hand-written grsp-eval output for the orders-approval fixture, in the
 * UI-ready shapes of src/core/types/grsp.ts. It is what a good run looks
 * like; the scorer tests mutate copies of it to model bad runs.
 */

const ref = (file, startLine, anchor, extra = {}) => ({
    file,
    startLine,
    anchor,
    verified: true,
    ...extra,
});

const excerpt = (file, startLine) => ({
    file,
    startLine,
    endLine: startLine,
    lines: [{ n: startLine, text: "…", sign: " " }],
    added: 0,
    removed: 0,
    truncated: false,
    totalLines: 1,
});

const analysis = (kind, result, verification) => ({
    sessionId: "s1",
    kind,
    headSha: "84afda2",
    status: "done",
    result,
    verification,
});

const block = (id, label, kind, file, line, status, next) => ({
    id,
    label,
    kind,
    ref: ref(file, line, label),
    note: "",
    next,
    status,
    excerpt: excerpt(file, line),
    unconfirmedEdges: [],
});

export function sampleOutput() {
    return {
        session: { id: "s1", headSha: "84afda2", agentPasses: 7 },
        passes: 7,
        discovery: analysis(
            "discovery",
            {
                behaviourSummary:
                    "Orders created through POST /orders with a total strictly above €10,000 are saved as PENDING_APPROVAL and approvers are emailed. A new endpoint lets a finance approver, who isn't the creator, confirm them.",
                descriptionEmpty: false,
                mismatches: [
                    {
                        id: "m1",
                        claim: "All orders over €10k need approval.",
                        reality:
                            "The nightly BulkImportJob creates orders without going through the approval check.",
                        refs: [ref("orders/repository.py", 20, "bulk_create")],
                        entryPointId: "ep3",
                    },
                ],
                entryPoints: [
                    {
                        id: "ep3",
                        label: "BulkImportJob (nightly)",
                        kind: "job",
                        ref: ref("jobs/bulk_import.py", 19, "def run"),
                        effect: "Still creates orders as CONFIRMED, no approval",
                        risk: "high",
                        tag: "not_covered",
                        hasGap: true,
                    },
                    {
                        id: "ep1",
                        label: "POST /orders",
                        kind: "http",
                        ref: ref("api/views/orders.py", 14, "create_order"),
                        effect: "New pending state, emails approvers, defers payment",
                        risk: "high",
                        tag: "changed",
                        hasGap: false,
                    },
                    {
                        id: "ep2",
                        label: "POST /orders/:id/approve",
                        kind: "http",
                        ref: ref("api/views/approvals.py", 10, "approve_order"),
                        effect: "New endpoint: confirms order, then charges card",
                        risk: "medium",
                        tag: "new",
                        hasGap: false,
                    },
                    {
                        id: "ep4",
                        label: "order.created consumer",
                        kind: "consumer",
                        ref: ref("orders/consumers.py", 7, "on_order_created"),
                        effect: "Now fires later for large orders",
                        risk: "low",
                        tag: "timing",
                        hasGap: false,
                    },
                ],
                gaps: [
                    {
                        ref: ref("orders/repository.py", 20, "bulk_create"),
                        writeTarget: "orders table",
                        explanation:
                            "insert_many hard-codes CONFIRMED and skips OrderService, so ApprovalPolicy never runs.",
                        entryPointId: "ep3",
                    },
                ],
                removed: [],
                askSuggestions: [
                    "Which tests cover the new flow?",
                    "Where is the €10k threshold defined?",
                    "Can bulk imports skip approval?",
                ],
            },
            {
                verified: 12,
                dropped: 1,
                unverified: 0,
                notes: [],
                filesExplored: 23,
            },
        ),
        questions: analysis(
            "questions",
            {
                questions: [
                    {
                        id: "q1",
                        question:
                            "Can the person who created an order also approve it?",
                        answer: "No.",
                        refs: [ref("approvals/service.py", 22, "created_by")],
                        opened: false,
                    },
                    {
                        id: "q2",
                        question:
                            "Is there any way a €10k+ order gets confirmed without approval?",
                        answer: "Yes, BulkImportJob.",
                        refs: [ref("jobs/bulk_import.py", 23, "insert_many")],
                        opened: false,
                    },
                    {
                        id: "q3",
                        question:
                            "What happens if the approver email fails to send?",
                        answer: "Logged, not retried.",
                        refs: [ref("approvals/notify.py", 22, "MailerError")],
                        opened: false,
                    },
                ],
            },
            { verified: 3, dropped: 0, unverified: 0, notes: [] },
        ),
        walkthroughs: {
            ep1: analysis(
                "walkthrough:ep1",
                {
                    entryPointId: "ep1",
                    blocks: [
                        block(
                            "b1",
                            "POST /orders",
                            "route",
                            "api/views/orders.py",
                            14,
                            "unchanged",
                            ["b2"],
                        ),
                        block(
                            "b2",
                            "CreateOrderSchema.validate",
                            "validation",
                            "orders/schemas.py",
                            10,
                            "unchanged",
                            ["b3"],
                        ),
                        block(
                            "b3",
                            "OrderService.create",
                            "service",
                            "orders/services.py",
                            11,
                            "changed",
                            ["b4"],
                        ),
                        {
                            ...block(
                                "b4",
                                "ApprovalPolicy.check",
                                "policy",
                                "orders/policies.py",
                                15,
                                "new",
                                ["b5", "b5c"],
                            ),
                            decision: {
                                condition: "order.total > €10,000",
                                yes: "REQUIRES_APPROVAL",
                                no: "OK",
                            },
                        },
                        block(
                            "b5",
                            "orders.insert (PENDING_APPROVAL)",
                            "db_write",
                            "orders/repository.py",
                            8,
                            "unchanged",
                            ["b6"],
                        ),
                        block(
                            "b6",
                            "emit approval.requested",
                            "event",
                            "orders/events.py",
                            11,
                            "new",
                            ["b7"],
                        ),
                        block(
                            "b7",
                            "Mailer.send → approvers",
                            "external",
                            "approvals/notify.py",
                            17,
                            "new",
                            [],
                        ),
                        block(
                            "b5c",
                            "orders.insert (CONFIRMED)",
                            "db_write",
                            "orders/repository.py",
                            8,
                            "unchanged",
                            ["b6c"],
                        ),
                        block(
                            "b6c",
                            "emit order.created",
                            "event",
                            "orders/events.py",
                            7,
                            "unchanged",
                            ["b7c"],
                        ),
                        block(
                            "b7c",
                            "PaymentService.capture",
                            "external",
                            "payments/service.py",
                            10,
                            "unchanged",
                            [],
                        ),
                    ],
                    path: ["b1", "b2", "b3", "b4", "b5", "b6", "b7"],
                    whatIf: {
                        variable: "order total",
                        options: [
                            {
                                label: "€9,999",
                                path: [
                                    "b1",
                                    "b2",
                                    "b3",
                                    "b4",
                                    "b5c",
                                    "b6c",
                                    "b7c",
                                ],
                                taken: { b4: "no" },
                            },
                            {
                                label: "€10,000",
                                path: [
                                    "b1",
                                    "b2",
                                    "b3",
                                    "b4",
                                    "b5c",
                                    "b6c",
                                    "b7c",
                                ],
                                taken: { b4: "no" },
                                note: "Exactly €10,000 is not greater than €10,000.",
                            },
                            {
                                label: "€25,000",
                                path: [
                                    "b1",
                                    "b2",
                                    "b3",
                                    "b4",
                                    "b5",
                                    "b6",
                                    "b7",
                                ],
                                taken: { b4: "yes" },
                            },
                        ],
                    },
                },
                { verified: 10, dropped: 0, unverified: 0, notes: [] },
            ),
        },
        ask: [
            {
                id: "a1",
                sessionId: "s1",
                question: "Can bulk imports skip approval?",
                status: "done",
                answer: {
                    paragraphs: [
                        "Yes. BulkImportJob calls OrderRepository.insert_many directly, which hard-codes CONFIRMED and never goes through OrderService, so the policy never runs.",
                    ],
                    excerpt: excerpt("orders/repository.py", 16),
                    refs: [
                        ref("jobs/bulk_import.py", 23, "insert_many"),
                        ref("orders/repository.py", 19, "Status.CONFIRMED"),
                    ],
                    confidence: "high",
                    grounded: true,
                },
                verification: {
                    verified: 2,
                    dropped: 0,
                    unverified: 0,
                    notes: [],
                    filesExplored: 2,
                },
                headSha: "84afda2",
                createdAt: "2025-01-07T10:00:00Z",
            },
            {
                id: "a2",
                sessionId: "s1",
                question: "Where is the €10k threshold defined?",
                status: "done",
                answer: {
                    paragraphs: [
                        "It is a module constant in orders/policies.py, in EUR, compared with a strict greater-than.",
                    ],
                    refs: [ref("orders/policies.py", 5, "THRESHOLD")],
                    confidence: "high",
                    grounded: true,
                },
                verification: {
                    verified: 1,
                    dropped: 0,
                    unverified: 0,
                    notes: [],
                },
                headSha: "84afda2",
                createdAt: "2025-01-07T10:01:00Z",
            },
            {
                id: "a3",
                sessionId: "s1",
                question:
                    "How does this PR change the Kubernetes autoscaling configuration?",
                status: "done",
                answer: {
                    paragraphs: [
                        "Nothing in this repository configures Kubernetes autoscaling. The closest changed code is OrderService.create.",
                    ],
                    refs: [],
                    confidence: "low",
                    grounded: false,
                },
                verification: {
                    verified: 0,
                    dropped: 0,
                    unverified: 0,
                    notes: [],
                },
                headSha: "84afda2",
                createdAt: "2025-01-07T10:02:00Z",
            },
        ],
        review: analysis(
            "review",
            {
                findings: [
                    {
                        id: "f1",
                        severity: "blocking",
                        title: "Bulk imports bypass the approval check",
                        why: "BulkImportJob writes through insert_many, which hard-codes CONFIRMED.",
                        ref: ref("jobs/bulk_import.py", 23, "insert_many"),
                        excerpt: excerpt("jobs/bulk_import.py", 23),
                        comment: "This path skips ApprovalPolicy.",
                        included: true,
                        anchoring: "summary",
                    },
                    {
                        id: "f2",
                        severity: "should_fix",
                        title: "Failed approver emails are dropped",
                        why: "A mailer error is logged and swallowed.",
                        ref: ref("approvals/notify.py", 22, "MailerError"),
                        excerpt: excerpt("approvals/notify.py", 22),
                        comment: "Retry via the task queue.",
                        included: true,
                        anchoring: "inline",
                    },
                ],
                summary: "Blocking: bulk imports skip the new approval check.",
                repoPromptActive: false,
            },
            { verified: 2, dropped: 0, unverified: 0, notes: [] },
        ),
    };
}
