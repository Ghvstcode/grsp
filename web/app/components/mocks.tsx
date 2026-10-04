"use client";

/**
 * Product visuals for the landing page, drawn in HTML/CSS with the app's own
 * tokens (design/DESIGN.md) instead of screenshots: strict black and white,
 * Geist and Geist Mono. The scenario is the one from the design prototype.
 */

import { useState, type ReactNode } from "react";
import { Logo, Wordmark } from "./logo";

/* ─── Primitives ─── */

type Change = "new" | "changed" | "unchanged" | "gap";

const CHANGE_LABEL: Record<Change, string> = {
    new: "New",
    changed: "Changed",
    unchanged: "Unchanged",
    gap: "Not covered",
};

function ChangeChip({
    change,
    inverted = false,
}: {
    change: Change;
    inverted?: boolean;
}) {
    const style = inverted
        ? "border border-white text-white"
        : change === "new"
          ? "bg-ink text-white border border-ink"
          : change === "changed"
            ? "border border-ink text-ink"
            : change === "gap"
              ? "border border-dashed border-ink text-ink"
              : "border border-line text-text-3";
    return (
        <span
            className={`font-mono text-[9.5px] uppercase tracking-[0.05em] px-1.5 py-0.5 rounded shrink-0 whitespace-nowrap ${style}`}
        >
            {CHANGE_LABEL[change]}
        </span>
    );
}

function SectionLabel({ children }: { children: ReactNode }) {
    return (
        <span className="text-[10.5px] font-medium uppercase tracking-[0.06em] text-text-3">
            {children}
        </span>
    );
}

type CodeRow = [kind: "add" | "del" | "ctx", text: string];

function CodeBlock({
    file,
    start,
    rows,
    highlight,
}: {
    file: string;
    start: number;
    rows: CodeRow[];
    highlight?: number;
}) {
    let n = start;
    let adds = 0;
    let dels = 0;
    const lines = rows.map(([kind, text]) => {
        const num = kind === "del" ? undefined : n++;
        if (kind === "add") adds++;
        if (kind === "del") dels++;
        return { kind, text, num };
    });
    const stat =
        adds > 0 || dels > 0 ? `+${adds} −${dels}` : `lines ${start}–${n - 1}`;

    return (
        <div className="rounded-lg border border-line overflow-hidden bg-white">
            <div className="flex items-center justify-between gap-3 px-3 py-1.5 bg-panel border-b border-line font-mono text-[11px]">
                <span className="text-ink truncate">{file}</span>
                <span className="text-text-3 shrink-0">{stat}</span>
            </div>
            <div className="overflow-x-auto py-1">
                {lines.map((line, i) => {
                    const isHighlight =
                        highlight !== undefined && line.num === highlight;
                    const tone = isHighlight
                        ? "bg-code-hl text-ink font-medium"
                        : line.kind === "add"
                          ? "bg-code-add text-ink"
                          : line.kind === "del"
                            ? "bg-panel text-[#6b6b6b]"
                            : "text-[#262626]";
                    return (
                        <div
                            key={i}
                            className={`flex font-mono text-[11.5px] leading-[19px] whitespace-pre pr-4 min-w-max ${tone}`}
                        >
                            <span className="w-9 shrink-0 text-right pr-2.5 text-[#8a8a8a] select-none">
                                {line.num ?? ""}
                            </span>
                            <span className="w-4 shrink-0 select-none">
                                {line.kind === "add"
                                    ? "+"
                                    : line.kind === "del"
                                      ? "−"
                                      : ""}
                            </span>
                            <span>{line.text}</span>
                        </div>
                    );
                })}
            </div>
        </div>
    );
}

/** A macOS-style window around a mock. */
export function AppFrame({
    children,
    className = "",
}: {
    children: ReactNode;
    className?: string;
}) {
    return (
        <div
            className={`rounded-xl border border-line bg-white text-ink text-left overflow-hidden shadow-[0_24px_60px_-28px_rgba(0,0,0,0.28)] ${className}`}
        >
            <div className="h-9 flex items-center gap-1.5 px-3.5 bg-panel border-b border-line">
                <span className="w-2.5 h-2.5 rounded-full bg-line-strong" />
                <span className="w-2.5 h-2.5 rounded-full bg-line-strong" />
                <span className="w-2.5 h-2.5 rounded-full bg-line-strong" />
            </div>
            {children}
        </div>
    );
}

function PrHeader({ tab }: { tab: "Gist" | "Walkthrough" | "Review" }) {
    return (
        <header className="px-5 pt-4 border-b border-line flex flex-col gap-2">
            <div className="flex items-baseline gap-2.5">
                <span className="font-mono text-[12px] text-text-3">#482</span>
                <h3 className="text-[15px] sm:text-[17px] font-semibold tracking-[-0.02em] leading-snug">
                    Require second approval for orders over €10k
                </h3>
            </div>
            <div className="flex items-center gap-x-3.5 gap-y-1 flex-wrap text-[11.5px] text-text-2">
                <span>@kemi.a</span>
                <span className="font-mono text-[11px]">
                    feat/order-approval → main
                </span>
                <span className="flex items-center gap-1.5">
                    <span className="w-1.5 h-1.5 rounded-full bg-ink" />
                    12/12 checks passing
                </span>
                <span className="px-2 py-px rounded-full bg-ink text-white text-[11px]">
                    1 mismatch
                </span>
            </div>
            <nav className="flex gap-6 mt-1">
                {(["Gist", "Walkthrough", "Review"] as const).map((t) => (
                    <span
                        key={t}
                        className={`h-8 text-[12.5px] ${
                            t === tab
                                ? "text-ink font-semibold shadow-[inset_0_-2px_0_#0a0a0a]"
                                : "text-text-3"
                        }`}
                    >
                        {t}
                    </span>
                ))}
            </nav>
        </header>
    );
}

/* ─── Gist ─── */

const AFFECTED: [name: string, effect: string, change: Change, tag?: string][] =
    [
        [
            "BulkImportJob (nightly)",
            "Still creates orders as CONFIRMED, no approval",
            "gap",
        ],
        [
            "POST /orders",
            "New pending state, emails approvers, defers payment",
            "changed",
        ],
        [
            "POST /orders/:id/approve",
            "New endpoint: confirms order, then charges card",
            "new",
        ],
        [
            "order.created consumer",
            "Now fires later for large orders, after approval",
            "changed",
            "Timing",
        ],
    ];

function Sidebar() {
    const session = (
        num: number,
        status: string,
        title: string,
        active = false,
    ) => (
        <div
            className={`px-2.5 py-1.5 rounded-lg flex flex-col gap-px border ${
                active ? "bg-white border-line" : "border-transparent"
            }`}
        >
            <span className="font-mono text-[10px] text-text-3">
                #{num} · {status}
            </span>
            <span className="text-[11.5px] leading-snug truncate">{title}</span>
        </div>
    );
    const folder = (name: string, count: number) => (
        <div className="flex items-center gap-1.5 px-1 text-[11.5px] font-medium">
            <svg
                width="9"
                height="9"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2.5"
                strokeLinecap="round"
                strokeLinejoin="round"
                className="rotate-90 shrink-0"
            >
                <path d="M9 6l6 6-6 6" />
            </svg>
            <span className="flex-1 truncate">{name}</span>
            <span className="text-text-3 font-normal">{count}</span>
        </div>
    );
    return (
        <aside className="hidden xl:flex w-[196px] shrink-0 flex-col gap-3 bg-panel border-r border-line p-3">
            <div className="flex items-center gap-2 px-1 pt-0.5">
                <Logo size={14} />
                <Wordmark className="text-[1.05em]" />
            </div>
            <div className="h-8 rounded-lg bg-ink text-white text-[12px] font-medium flex items-center justify-center">
                New review
            </div>
            <div className="flex flex-col gap-1">
                {folder("orders-api", 2)}
                {session(
                    482,
                    "In progress",
                    "Require second approval for orders over €10k",
                    true,
                )}
                {session(479, "Reviewed", "Migrate invoices to v2 schema")}
            </div>
            <div className="flex flex-col gap-1">
                {folder("payments-service", 2)}
                {session(471, "Merged", "Rate-limit webhook retries")}
                {session(466, "Reviewed", "Idempotency keys for refunds")}
            </div>
            <div className="mt-auto px-1 text-[11.5px] text-text-2">
                Settings
            </div>
        </aside>
    );
}

function AskPanel() {
    return (
        <aside className="hidden lg:flex w-[292px] shrink-0 flex-col gap-3 border-l border-line p-4">
            <SectionLabel>Ask</SectionLabel>
            <div className="h-9 rounded-lg border border-line-strong px-3 flex items-center text-[12px] text-text-3">
                Ask anything about this change…
            </div>
            <div className="self-end max-w-[92%] rounded-lg bg-ink text-white text-[12px] leading-snug px-3 py-2">
                Can bulk imports skip approval?
            </div>
            <span className="text-[10.5px] text-text-3">
                Explored 2 files · 2 references verified
            </span>
            <p className="text-[12px] leading-relaxed text-[#262626]">
                Yes. BulkImportJob calls OrderRepository.insert_many directly,
                which hard-codes CONFIRMED and never goes through OrderService,
                so the policy never runs.
            </p>
            <CodeBlock
                file="orders/repository.py"
                start={101}
                highlight={104}
                rows={[
                    ["ctx", "def insert_many(self, rows):"],
                    ["ctx", "    orders = [Order.from_row(r) for r in rows]"],
                    ["ctx", "    for o in orders:"],
                    ["ctx", "        o.status = Status.CONFIRMED"],
                    ["ctx", "    Order.objects.bulk_create(orders)"],
                ]}
            />
            <div className="flex flex-wrap gap-1.5">
                {["jobs/bulk_import.py:57", "orders/repository.py:104"].map(
                    (r) => (
                        <span
                            key={r}
                            className="font-mono text-[10.5px] px-2 py-0.5 rounded border border-line text-text-2"
                        >
                            {r}
                        </span>
                    ),
                )}
            </div>
        </aside>
    );
}

export function GistMock() {
    return (
        <AppFrame>
            <div className="flex">
                <Sidebar />
                <div className="flex-1 min-w-0 flex flex-col">
                    <PrHeader tab="Gist" />
                    <div className="flex flex-1 min-h-0">
                        <div className="flex-1 min-w-0 p-5 flex flex-col gap-5 text-[12.5px] leading-relaxed">
                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5 items-start">
                                <div className="rounded-[10px] border border-line p-4 flex flex-col gap-2">
                                    <SectionLabel>Author says</SectionLabel>
                                    <p className="text-[#262626] line-clamp-5">
                                        Finance asked for a four-eyes check on
                                        large orders. This PR makes all orders
                                        over €10,000 wait for a second person
                                        with the finance approver role before
                                        they&apos;re confirmed and the card is
                                        charged.
                                    </p>
                                </div>
                                <div className="rounded-[10px] border border-ink p-4 flex flex-col gap-2">
                                    <span className="text-[10.5px] font-medium uppercase tracking-[0.06em]">
                                        Code does
                                    </span>
                                    <p className="text-[#262626]">
                                        Orders created through{" "}
                                        <span className="font-mono text-[11.5px]">
                                            POST /orders
                                        </span>{" "}
                                        with a total strictly above €10,000 are
                                        saved as PENDING_APPROVAL and approvers
                                        are emailed. Payment capture moves to
                                        after approval.
                                    </p>
                                    <span className="text-[10.5px] text-text-3">
                                        Agent explored 23 files · 41 references
                                        verified · 2 unverified
                                    </span>
                                </div>
                            </div>

                            <div className="rounded-[10px] border-[1.5px] border-ink bg-panel px-4 py-3.5 flex flex-col sm:flex-row sm:items-center gap-3">
                                <span className="self-start sm:self-auto text-[10.5px] font-semibold uppercase tracking-[0.06em] bg-ink text-white px-2 py-1 rounded-[5px] shrink-0">
                                    Mismatch
                                </span>
                                <p className="flex-1">
                                    The description says <em>all</em> orders
                                    over €10k need approval. The nightly{" "}
                                    <span className="font-mono text-[11.5px]">
                                        BulkImportJob
                                    </span>{" "}
                                    creates orders without going through the
                                    approval check.
                                </p>
                                <span className="self-start sm:self-auto shrink-0 h-8 px-3 rounded-lg border border-ink bg-white text-[12px] font-medium flex items-center">
                                    Walk through it →
                                </span>
                            </div>

                            <div className="flex flex-col gap-2.5">
                                <h4 className="text-[13.5px] font-semibold">
                                    What&apos;s affected
                                </h4>
                                <div className="rounded-[10px] border border-line overflow-hidden">
                                    {AFFECTED.map(
                                        ([name, effect, change, tag], i) => (
                                            <div
                                                key={name}
                                                className={`flex items-center gap-3 px-3.5 py-2 ${
                                                    i < AFFECTED.length - 1
                                                        ? "border-b border-[#f0f0f0]"
                                                        : ""
                                                }`}
                                            >
                                                <span className="font-mono text-[11.5px] sm:w-[178px] shrink-0 truncate">
                                                    {name}
                                                </span>
                                                <span className="hidden sm:block flex-1 text-text-2 text-[12px] truncate">
                                                    {effect}
                                                </span>
                                                <span
                                                    className={`ml-auto text-[10.5px] w-[84px] text-center py-0.5 rounded shrink-0 ${
                                                        change === "new"
                                                            ? "bg-ink text-white border border-ink"
                                                            : change === "gap"
                                                              ? "border border-dashed border-ink"
                                                              : "border border-ink"
                                                    }`}
                                                >
                                                    {tag ??
                                                        CHANGE_LABEL[change]}
                                                </span>
                                            </div>
                                        ),
                                    )}
                                </div>
                            </div>
                        </div>
                        <AskPanel />
                    </div>
                </div>
            </div>
        </AppFrame>
    );
}

/* ─── New review ─── */

export function NewReviewMock() {
    const steps: [done: boolean, text: string][] = [
        [true, "Fetched pull/482/head"],
        [true, "Read-only worktree at 84afda2"],
        [true, "9 files changed against the merge base"],
        [false, "Reading orders/services.py"],
    ];
    return (
        <div className="rounded-xl border border-line bg-white p-4 sm:p-5 flex flex-col gap-3.5 text-[12.5px]">
            <div className="flex gap-1.5">
                {["Paste a URL", "Open PRs", "Two branches"].map((t, i) => (
                    <span
                        key={t}
                        className={`h-8 px-3 rounded-lg flex items-center text-[12px] ${
                            i === 0
                                ? "bg-ink text-white border border-ink"
                                : "border border-line text-ink"
                        }`}
                    >
                        {t}
                    </span>
                ))}
            </div>
            <div className="h-10 rounded-lg border border-line-strong px-3 flex items-center font-mono text-[11.5px] text-ink overflow-hidden whitespace-nowrap">
                https://github.com/acme/orders-api/pull/482
                <span className="ml-0.5 w-px h-4 bg-ink animate-pulse-soft" />
            </div>
            <div className="flex flex-col gap-1.5">
                {steps.map(([done, text]) => (
                    <div
                        key={text}
                        className={`flex items-center gap-2 font-mono text-[11.5px] ${
                            done ? "text-text-3" : "text-ink"
                        }`}
                    >
                        <span className="w-3 text-center">
                            {done ? "✓" : "→"}
                        </span>
                        <span className={done ? "" : "animate-pulse-soft"}>
                            {text}
                        </span>
                    </div>
                ))}
            </div>
        </div>
    );
}

/* ─── Walkthrough ─── */

interface Block {
    name: string;
    kind: string;
    change: Change;
    file: string;
    note: string;
}

const BLOCKS: Record<string, Block> = {
    route: {
        name: "POST /orders",
        kind: "Route",
        change: "unchanged",
        file: "api/views/orders.py",
        note: "Request enters and the body is parsed into CreateOrderInput. Nothing changed here.",
    },
    validate: {
        name: "CreateOrderSchema.validate",
        kind: "Validation",
        change: "unchanged",
        file: "orders/schemas.py",
        note: "Checks line items and currency. Unchanged.",
    },
    service: {
        name: "OrderService.create",
        kind: "Service",
        change: "changed",
        file: "orders/services.py",
        note: "Now asks ApprovalPolicy before saving. Previously every valid order was saved straight to CONFIRMED.",
    },
    policy: {
        name: "ApprovalPolicy.check",
        kind: "Policy",
        change: "new",
        file: "orders/policies.py",
        note: "",
    },
    insertPending: {
        name: "orders.insert",
        kind: "DB write",
        change: "changed",
        file: "orders/repository.py",
        note: "Row is saved with status = PENDING_APPROVAL. No payment is taken yet.",
    },
    emitRequested: {
        name: "emit approval.requested",
        kind: "Event",
        change: "new",
        file: "orders/events.py",
        note: "New event. Only the approvals worker consumes it.",
    },
    notify: {
        name: "Mailer.send → approvers",
        kind: "External",
        change: "new",
        file: "approvals/notify.py",
        note: "Emails everyone with the finance_approver role. Failures are logged but not retried.",
    },
    insertConfirmed: {
        name: "orders.insert",
        kind: "DB write",
        change: "unchanged",
        file: "orders/repository.py",
        note: "Row is saved with status = CONFIRMED, same as before this PR.",
    },
    emitCreated: {
        name: "emit order.created",
        kind: "Event",
        change: "unchanged",
        file: "orders/events.py",
        note: "Fulfilment starts downstream. Unchanged.",
    },
    capture: {
        name: "PaymentService.capture",
        kind: "External",
        change: "unchanged",
        file: "payments/service.py",
        note: "Card is charged. Unchanged, but it now runs only for confirmed orders.",
    },
};

const HEAD = ["route", "validate", "service", "policy"];
const TOTALS = [
    {
        label: "€9,999",
        over: false,
        note: "Total is €9,999, under the threshold, so it returns OK and the order is confirmed as before.",
    },
    {
        label: "€10,000",
        over: false,
        note: "Boundary case: exactly €10,000 is not greater than €10,000, so this order skips approval. Worth confirming with the author.",
    },
    {
        label: "€25,000",
        over: true,
        note: "Total is €25,000, above the threshold, so it returns REQUIRES_APPROVAL and the order goes to pending.",
    },
];

export function WalkthroughMock() {
    const [totalIndex, setTotalIndex] = useState(2);
    const [step, setStep] = useState(3);
    const total = TOTALS[totalIndex];
    const ids = total.over
        ? [...HEAD, "insertPending", "emitRequested", "notify"]
        : [...HEAD, "insertConfirmed", "emitCreated", "capture"];
    const current = BLOCKS[ids[step]];
    const isPolicy = ids[step] === "policy";

    const chip = (active: boolean) =>
        `h-8 px-3 rounded-full text-[12px] flex items-center border transition-colors ${
            active
                ? "bg-ink text-white border-ink"
                : "bg-white text-ink border-line hover:border-line-strong"
        }`;

    return (
        <AppFrame>
            <PrHeader tab="Walkthrough" />
            <div className="p-5 flex flex-col gap-4 text-[12.5px]">
                <div className="flex flex-wrap items-center gap-x-5 gap-y-2.5">
                    <div className="flex flex-wrap gap-1.5">
                        {[
                            "POST /orders",
                            "POST /orders/:id/approve",
                            "BulkImportJob",
                        ].map((e, i) => (
                            <span
                                key={e}
                                className={`${chip(i === 0)} font-mono !text-[11px] ${i === 2 ? "hidden sm:flex" : ""}`}
                            >
                                {e}
                            </span>
                        ))}
                    </div>
                    <div className="flex flex-wrap items-center gap-1.5">
                        <span className="text-text-3 text-[12px] mr-1">
                            What if the total is…
                        </span>
                        {TOTALS.map((t, i) => (
                            <button
                                key={t.label}
                                type="button"
                                onClick={() => setTotalIndex(i)}
                                className={chip(i === totalIndex)}
                                aria-pressed={i === totalIndex}
                            >
                                {t.label}
                            </button>
                        ))}
                    </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-[280px_1fr] gap-5 items-start">
                    <div className="flex flex-col">
                        {ids.map((id, i) => {
                            const block = BLOCKS[id];
                            const isCurrent = i === step;
                            const box = isCurrent
                                ? "bg-ink text-white border-[1.5px] border-ink"
                                : block.change === "unchanged"
                                  ? "bg-white text-text-3 border border-line"
                                  : "bg-white text-ink border-[1.5px] border-ink";
                            return (
                                <div key={id} className="flex flex-col">
                                    <button
                                        type="button"
                                        onClick={() => setStep(i)}
                                        className={`w-full min-h-[46px] px-3 py-1.5 rounded-[9px] flex items-center justify-between gap-2.5 text-left ${box}`}
                                    >
                                        <span className="flex flex-col min-w-0">
                                            <span
                                                className={`text-[10px] ${isCurrent ? "text-line-strong" : "text-text-3"}`}
                                            >
                                                {i + 1} · {block.kind}
                                            </span>
                                            <span className="font-mono text-[11.5px] truncate">
                                                {block.name}
                                            </span>
                                        </span>
                                        <ChangeChip
                                            change={block.change}
                                            inverted={isCurrent}
                                        />
                                    </button>
                                    {i < ids.length - 1 && (
                                        <span className="w-px h-3 bg-line-strong ml-6" />
                                    )}
                                </div>
                            );
                        })}
                    </div>

                    <div className="rounded-xl border border-line p-4 sm:p-5 flex flex-col gap-3.5 min-w-0">
                        <div className="flex items-center justify-between">
                            <span className="text-[11.5px] text-text-3">
                                Step {step + 1} of {ids.length}
                            </span>
                            <ChangeChip change={current.change} />
                        </div>
                        <div className="flex flex-col gap-0.5">
                            <span className="font-mono text-[15px] font-medium">
                                {current.name}
                            </span>
                            <span className="font-mono text-[11px] text-text-3">
                                {current.file}
                            </span>
                        </div>
                        <p className="text-[13px] leading-relaxed text-[#262626]">
                            {isPolicy ? total.note : current.note}
                        </p>
                        {isPolicy && (
                            <>
                                <div className="rounded-lg bg-wash p-3 flex flex-col gap-2">
                                    <SectionLabel>Decision</SectionLabel>
                                    <div className="flex flex-wrap items-center gap-2 font-mono text-[11.5px]">
                                        <span>order.total &gt; €10,000</span>
                                        <span className="text-text-3">→</span>
                                        <span
                                            className={`px-2.5 py-1 rounded-md border ${total.over ? "bg-ink text-white border-ink" : "border-line text-text-3 bg-white"}`}
                                        >
                                            yes · REQUIRES_APPROVAL
                                        </span>
                                        <span
                                            className={`px-2.5 py-1 rounded-md border ${total.over ? "border-line text-text-3 bg-white" : "bg-ink text-white border-ink"}`}
                                        >
                                            no · OK
                                        </span>
                                    </div>
                                </div>
                                <CodeBlock
                                    file="orders/policies.py"
                                    start={1}
                                    highlight={6}
                                    rows={[
                                        [
                                            "add",
                                            'THRESHOLD = Money("10000.00", "EUR")',
                                        ],
                                        ["add", ""],
                                        ["add", "class ApprovalPolicy:"],
                                        ["add", "    @staticmethod"],
                                        ["add", "    def check(order):"],
                                        [
                                            "add",
                                            "        if order.total > THRESHOLD:",
                                        ],
                                        [
                                            "add",
                                            "            return Decision.REQUIRES_APPROVAL",
                                        ],
                                        ["add", "        return Decision.OK"],
                                    ]}
                                />
                            </>
                        )}
                        <div className="flex items-center gap-2 pt-1">
                            <button
                                type="button"
                                onClick={() => setStep(Math.max(0, step - 1))}
                                className="h-8 px-3 rounded-lg border border-line text-[12px] hover:border-line-strong"
                            >
                                Back
                            </button>
                            <button
                                type="button"
                                onClick={() =>
                                    setStep(Math.min(ids.length - 1, step + 1))
                                }
                                className="h-8 px-3.5 rounded-lg bg-ink text-white text-[12px] font-medium"
                            >
                                Step →
                            </button>
                            <span className="ml-auto text-[10.5px] text-text-3 hidden sm:block">
                                Based on reading the code
                            </span>
                        </div>
                    </div>
                </div>
            </div>
        </AppFrame>
    );
}

/* ─── Review ─── */

export function ReviewMock() {
    return (
        <AppFrame>
            <PrHeader tab="Review" />
            <div className="p-5 flex flex-col gap-3.5 text-[12.5px]">
                <div className="rounded-xl border border-line p-4 sm:p-5 flex flex-col gap-3">
                    <div className="flex items-start gap-2.5 flex-wrap">
                        <span className="text-[10.5px] font-medium px-2 py-0.5 rounded bg-ink text-white shrink-0 mt-px">
                            Blocking
                        </span>
                        <span className="text-[14px] font-semibold flex-1 min-w-[200px]">
                            Bulk imports bypass the approval check
                        </span>
                        <span className="font-mono text-[11px] text-text-3 mt-0.5">
                            jobs/bulk_import.py:57
                        </span>
                    </div>
                    <p className="text-text-2 leading-relaxed">
                        BulkImportJob writes through
                        OrderRepository.insert_many, which hard-codes CONFIRMED.
                        Imported orders over €10,000 are confirmed and charged
                        with no approval, which contradicts the PR description.
                    </p>
                    <CodeBlock
                        file="jobs/bulk_import.py"
                        start={54}
                        highlight={57}
                        rows={[
                            ["ctx", "    rows = self.portal.fetch_csv()"],
                            [
                                "ctx",
                                "    valid = [r for r in rows if r.is_valid()]",
                            ],
                            [
                                "ctx",
                                '    log.info("importing %d orders", len(valid))',
                            ],
                            ["ctx", "    OrderRepository().insert_many(valid)"],
                        ]}
                    />
                    <div className="rounded-lg border border-line-strong px-3 py-2.5 leading-relaxed text-[#262626]">
                        This path skips ApprovalPolicy, so imported orders over
                        €10k are confirmed and charged without approval. Could
                        insert_many go through OrderService.create, or apply the
                        policy per row before saving?
                    </div>
                    <div className="flex items-center justify-between text-[11.5px] text-text-2">
                        <span className="flex items-center gap-2">
                            <span className="w-3.5 h-3.5 rounded-[3px] bg-ink text-white flex items-center justify-center text-[9px]">
                                ✓
                            </span>
                            Include in review
                        </span>
                        <span className="text-text-3">
                            Not in this diff · posts in summary
                        </span>
                    </div>
                </div>

                {(
                    [
                        [
                            "Should fix",
                            "Failed approver emails are dropped",
                            "approvals/notify.py:19",
                            "border border-ink",
                        ],
                        [
                            "Nit",
                            "Threshold is a hard-coded constant",
                            "orders/policies.py:1",
                            "border border-line text-text-2",
                        ],
                    ] as const
                ).map(([severity, title, loc, style]) => (
                    <div
                        key={title}
                        className="rounded-xl border border-line px-4 sm:px-5 py-3 flex items-center gap-2.5 flex-wrap"
                    >
                        <span
                            className={`text-[10.5px] font-medium px-2 py-0.5 rounded shrink-0 ${style}`}
                        >
                            {severity}
                        </span>
                        <span className="text-[13px] font-medium flex-1 min-w-[180px]">
                            {title}
                        </span>
                        <span className="font-mono text-[11px] text-text-3">
                            {loc}
                        </span>
                    </div>
                ))}

                <div className="rounded-xl bg-panel border border-line p-4 flex flex-col sm:flex-row sm:items-center gap-3">
                    <div className="flex gap-1.5 flex-wrap">
                        {["Comment", "Approve", "Request changes"].map(
                            (v, i) => (
                                <span
                                    key={v}
                                    className={`h-8 px-3 rounded-lg text-[12px] flex items-center border ${
                                        i === 2
                                            ? "bg-ink text-white border-ink"
                                            : "bg-white border-line"
                                    }`}
                                >
                                    {v}
                                </span>
                            ),
                        )}
                    </div>
                    <span className="sm:ml-auto h-8 px-3.5 rounded-lg bg-ink text-white text-[12px] font-medium flex items-center self-start sm:self-auto">
                        Post review · 3 comments
                    </span>
                </div>
            </div>
        </AppFrame>
    );
}
