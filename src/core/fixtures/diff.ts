/**
 * The whole diff of the prototype scenario, file by file: what `diff_read`
 * serves. Built from the same rows as the scenario's excerpts, so a
 * `file:line` shown elsewhere lands on the same line here.
 */
import type { DiffFilePatch, SessionDiff } from "@core/types/grsp";
import type { Row } from "./excerpts";
import { fakeSha } from "./commits";
import { APPROVE, NOTIFY, POLICY, SVC_CREATE } from "./scenario";

interface Hunk {
    /** First line of the hunk in the old and new file. */
    oldStart: number;
    newStart: number;
    /** The text git prints after the second `@@`. */
    section?: string;
    rows: readonly Row[];
}

const add = (lines: string[]): Row[] => lines.map((text) => ["add", text]);
const del = (lines: string[]): Row[] => lines.map((text) => ["del", text]);
const ctx = (lines: string[]): Row[] => lines.map((text) => ["ctx", text]);

function count(rows: readonly Row[], kind: Row[0]): number {
    return rows.filter(([k]) => k === kind).length;
}

function hunkText(hunk: Hunk): string {
    const context = count(hunk.rows, "ctx");
    const oldCount = context + count(hunk.rows, "del");
    const newCount = context + count(hunk.rows, "add");
    // git writes start 0 for the empty side of an added or deleted file.
    const oldStart = oldCount === 0 ? 0 : hunk.oldStart;
    const newStart = newCount === 0 ? 0 : hunk.newStart;
    const header = `@@ -${oldStart},${oldCount} +${newStart},${newCount} @@${
        hunk.section ? ` ${hunk.section}` : ""
    }`;
    const body = hunk.rows.map(
        ([kind, text]) =>
            `${kind === "add" ? "+" : kind === "del" ? "-" : " "}${text}`,
    );
    return [header, ...body].join("\n");
}

interface FileSeed {
    path: string;
    oldPath?: string;
    status: DiffFilePatch["status"];
    hunks: Hunk[];
    /** Rename similarity, e.g. 88. */
    similarity?: number;
}

function blob(seed: string): string {
    return fakeSha(seed).slice(0, 7);
}

function filePatch(seed: FileSeed): DiffFilePatch {
    const from = seed.oldPath ?? seed.path;
    const lines = [`diff --git a/${from} b/${seed.path}`];
    if (seed.status === "added") lines.push("new file mode 100644");
    if (seed.status === "deleted") lines.push("deleted file mode 100644");
    if (seed.status === "renamed") {
        lines.push(
            `similarity index ${seed.similarity ?? 100}%`,
            `rename from ${from}`,
            `rename to ${seed.path}`,
        );
    }
    if (seed.hunks.length > 0) {
        const before =
            seed.status === "added" ? "0000000" : blob(`old:${from}`);
        const after =
            seed.status === "deleted" ? "0000000" : blob(`new:${seed.path}`);
        lines.push(
            `index ${before}..${after}${
                seed.status === "added" || seed.status === "deleted"
                    ? ""
                    : " 100644"
            }`,
            seed.status === "added" ? "--- /dev/null" : `--- a/${from}`,
            seed.status === "deleted" ? "+++ /dev/null" : `+++ b/${seed.path}`,
            ...seed.hunks.map(hunkText),
        );
    }
    const rows = seed.hunks.flatMap((h) => h.rows);
    return {
        path: seed.path,
        oldPath: seed.oldPath,
        status: seed.status,
        added: count(rows, "add"),
        removed: count(rows, "del"),
        binary: false,
        patch: `${lines.join("\n")}\n`,
        truncated: false,
    };
}

// ── The files ──────────────────────────────────────────────

const SERVICES: FileSeed = {
    path: "orders/services.py",
    status: "modified",
    hunks: [
        {
            oldStart: 1,
            newStart: 1,
            rows: [
                ...ctx(["from orders import events"]),
                ...ctx(["from orders.models import Order, Status"]),
                ...add([
                    "from orders.policies import ApprovalPolicy, Decision",
                ]),
                ...ctx(["from orders.repository import OrderRepository"]),
                ...del(["from payments.service import PaymentService"]),
                ...ctx([""]),
            ],
        },
        {
            oldStart: 18,
            newStart: 18,
            section: "class OrderService:",
            rows: [
                ...SVC_CREATE,
                ...add([
                    "    if order.status is Status.PENDING_APPROVAL:",
                    '        events.emit("approval.requested", order.id)',
                    "        return order",
                ]),
                ...ctx(['    events.emit("order.created", order.id)']),
                ...del(["    PaymentService.capture(order)"]),
                ...ctx(["    return order"]),
            ],
        },
    ],
};

const POLICIES: FileSeed = {
    path: "orders/policies.py",
    status: "added",
    hunks: [{ oldStart: 0, newStart: 1, rows: POLICY }],
};

const REPOSITORY: FileSeed = {
    path: "orders/repository.py",
    status: "modified",
    hunks: [
        {
            oldStart: 38,
            newStart: 38,
            section: "class OrderRepository:",
            rows: [
                ...ctx(["", "def insert(self, order):"]),
                ...del([
                    '    row = OrderRow(id=order.id, total=order.total, status="CONFIRMED")',
                ]),
                ...add([
                    "    row = OrderRow(",
                    "        id=order.id,",
                    "        total=order.total,",
                    "        status=order.status.value,",
                    "        created_by=order.created_by,",
                    "    )",
                ]),
                ...ctx(["    self.session.add(row)", "    return row.id"]),
            ],
        },
        {
            oldStart: 55,
            newStart: 60,
            section: "def get(self, order_id):",
            rows: [
                ...ctx([
                    "        raise NotFound(order_id)",
                    "    return Order.from_row(row)",
                    "",
                ]),
                ...add([
                    "def update(self, order):",
                    "    self.session.query(OrderRow).filter_by(id=order.id).update({",
                    '        "status": order.status.value,',
                    '        "approved_by": order.approved_by,',
                    '        "approved_at": order.approved_at,',
                    "    })",
                    "",
                ]),
                ...ctx([
                    "def find_by_customer(self, customer_id):",
                    "    rows = self.session.query(OrderRow).filter_by(",
                    "        customer_id=customer_id,",
                ]),
            ],
        },
    ],
};

const APPROVAL_SERVICE: FileSeed = {
    path: "approvals/service.py",
    status: "added",
    hunks: [
        {
            oldStart: 0,
            newStart: 1,
            rows: [
                ...add([
                    '"""Second-person approval for large orders."""',
                    "",
                    "import logging",
                    "",
                    "from api.errors import Forbidden, InvalidState",
                    "from orders import events",
                    "from orders.models import Status",
                    "from orders.repository import OrderRepository",
                    "",
                    "log = logging.getLogger(__name__)",
                    "",
                    "",
                    "class ApprovalService:",
                    '    """Confirms orders that are waiting on a finance approver."""',
                    "",
                    "    def __init__(self, repo=None):",
                    "        self.repo = repo or OrderRepository()",
                    "",
                    "    def pending(self, tenant_id):",
                    '        """Orders waiting for approval, oldest first."""',
                    "        return self.repo.find_by_status(",
                    "            tenant_id,",
                    "            Status.PENDING_APPROVAL,",
                    '            order_by="created_at",',
                    "        )",
                    "",
                    "    def reject(self, order_id, approver, reason):",
                    "        order = self.repo.get(order_id)",
                    "        if order.status != Status.PENDING_APPROVAL:",
                    "            raise InvalidState()",
                    "        order.cancel(rejected_by=approver.id, reason=reason)",
                    "        self.repo.update(order)",
                    '        log.info("order rejected", order=order.id)',
                    "",
                ]),
                // Lines 35–41, as the walkthrough shows them.
                ...APPROVE,
                ...add([
                    "    self.repo.update(order)",
                    '    events.emit("order.created", order.id)',
                    "    return order",
                ]),
            ],
        },
    ],
};

const APPROVAL_NOTIFY: FileSeed = {
    path: "approvals/notify.py",
    status: "added",
    hunks: [
        {
            oldStart: 0,
            newStart: 1,
            rows: [
                ...add([
                    '"""Tell finance approvers that an order is waiting for them."""',
                    "",
                    "import logging",
                    "",
                    "from accounts.models import User",
                    "from approvals.templates import approval_email",
                    "from db.hooks import after_commit",
                    "from mailer import MailerError, mailer",
                    "",
                    "log = logging.getLogger(__name__)",
                    "",
                    "",
                    "@after_commit",
                ]),
                // Lines 14–20.
                ...NOTIFY,
            ],
        },
    ],
};

const LEGACY: FileSeed = {
    path: "orders/legacy_confirm.py",
    status: "deleted",
    hunks: [
        {
            oldStart: 1,
            newStart: 0,
            rows: del([
                '"""Confirms an order straight after validation.',
                "",
                "Kept for the v1 checkout, which was removed in 2025.",
                '"""',
                "",
                "from orders.models import Status",
                "",
                "",
                "def confirm_now(order):",
                "    order.status = Status.CONFIRMED",
                "    return order",
            ]),
        },
    ],
};

const TESTS: FileSeed = {
    path: "tests/orders/test_create.py",
    oldPath: "tests/test_orders.py",
    status: "renamed",
    similarity: 88,
    hunks: [
        {
            oldStart: 21,
            newStart: 21,
            section: "def test_create_saves_order(service, repo):",
            rows: [
                ...ctx([
                    '    order = service.create(order_input(total="120.00"))',
                    "    assert repo.get(order.id) is not None",
                    "",
                ]),
                ...del([
                    "def test_create_confirms_order(service):",
                    '    order = service.create(order_input(total="25000.00"))',
                    "    assert order.status is Status.CONFIRMED",
                ]),
                ...add([
                    "def test_small_order_is_confirmed(service):",
                    '    order = service.create(order_input(total="9999.99"))',
                    "    assert order.status is Status.CONFIRMED",
                    "",
                    "",
                    "def test_large_order_waits_for_approval(service):",
                    '    order = service.create(order_input(total="10000.01"))',
                    "    assert order.status is Status.PENDING_APPROVAL",
                ]),
                ...ctx([
                    "",
                    "",
                    "def test_create_rejects_empty_cart(service):",
                ]),
            ],
        },
    ],
};

/** A flow diagram: binary files carry no patch. */
const DIAGRAM: DiffFilePatch = {
    path: "docs/approval-flow.png",
    status: "added",
    added: 0,
    removed: 0,
    binary: true,
    patch: "",
    truncated: false,
};

const BULK_TOTAL = 4812;

/** A big recorded fixture: the patch stops early and says so. */
function bulkFixture(): DiffFilePatch {
    const shown = add([
        "[",
        ...Array.from({ length: 6 }, (_, i) => [
            "  {",
            `    "order_id": "ord_${String(90210 + i)}",`,
            `    "total": "${String(8400 + i * 715)}.00",`,
            '    "currency": "EUR",',
            `    "status": "${i % 2 === 0 ? "CONFIRMED" : "PENDING_APPROVAL"}"`,
            "  },",
        ]).flat(),
    ]);
    const file = filePatch({
        path: "tests/fixtures/portal_orders.json",
        status: "added",
        hunks: [{ oldStart: 0, newStart: 1, rows: shown }],
    });
    return {
        ...file,
        added: BULK_TOTAL,
        // The hunk header still promises the whole file, as a cut-off patch does.
        patch: file.patch.replace(
            `+1,${shown.length} @@`,
            `+1,${BULK_TOTAL} @@`,
        ),
        truncated: true,
    };
}

/** The diff of every scenario session. */
export function fixtureDiff(): SessionDiff {
    return {
        files: [
            filePatch(APPROVAL_NOTIFY),
            filePatch(APPROVAL_SERVICE),
            DIAGRAM,
            filePatch(LEGACY),
            filePatch(POLICIES),
            filePatch(REPOSITORY),
            filePatch(SERVICES),
            bulkFixture(),
            filePatch(TESTS),
        ],
        excludedFiles: 2,
    };
}

/** A one-line fix, for the "this is tiny" state of a commit session. */
export function tinyFixtureDiff(): SessionDiff {
    return {
        files: [
            filePatch({
                path: "approvals/templates.py",
                status: "modified",
                hunks: [
                    {
                        oldStart: 8,
                        newStart: 8,
                        section: "def approval_email(order):",
                        rows: [
                            ...ctx([
                                "    return Email(",
                                '        template="approval_requested",',
                            ]),
                            ...del([
                                '        subject=f"Order {order.number} is waiting for you aproval",',
                            ]),
                            ...add([
                                '        subject=f"Order {order.number} is waiting for your approval",',
                            ]),
                            ...ctx([
                                "        context={",
                                '            "order": order,',
                            ]),
                        ],
                    },
                ],
            }),
        ],
        excludedFiles: 0,
    };
}

/** Sessions outside the scenario have nothing recorded. */
export function emptyFixtureDiff(): SessionDiff {
    return { files: [], excludedFiles: 0 };
}
