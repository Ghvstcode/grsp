const COLS = 14;
const ROWS = 9;
/** The dot that matters: third row, so the callout has room below it. */
const TARGET_ROW = 2;
const TARGET_COL = 9;
const TARGET = TARGET_ROW * COLS + TARGET_COL;

/**
 * The hero visual: every dot is a change in the PR. A scan passes over them
 * and the one that matters grows, with the mismatch it stands for.
 */
export function DotField() {
    return (
        <div className="relative select-none" aria-hidden="true">
            <div className="flex items-center justify-between mono text-[11px] tracking-[0.08em] text-text-3 pb-3 border-b border-line">
                <span>PR #482 · FEAT/ORDER-APPROVAL</span>
                <span>9 FILES · +212 −38</span>
            </div>

            <div className="relative py-3">
                <div
                    className="dot-field"
                    style={{ "--cols": COLS } as React.CSSProperties}
                >
                    {Array.from({ length: COLS * ROWS }, (_, i) => (
                        <span
                            key={i}
                            className="dot"
                            data-target={i === TARGET ? "" : undefined}
                            style={{ "--i": i } as React.CSSProperties}
                        />
                    ))}
                </div>

                <div
                    className="dot-field-callout absolute w-[272px] rounded-xl border-[1.5px] border-ink bg-white p-4 text-left shadow-[0_18px_40px_-22px_rgba(0,0,0,0.35)]"
                    style={{
                        top: `calc(${(((TARGET_ROW + 0.5) / ROWS) * 100).toFixed(2)}% + 26px)`,
                        // 24px past the target dot's column.
                        right: `calc(${(100 - ((TARGET_COL + 0.5) / COLS) * 100).toFixed(2)}% - 24px)`,
                    }}
                >
                    <div className="inline-flex items-center gap-1.5 rounded-full bg-ink px-2.5 py-[3px] text-[10px] font-semibold tracking-[0.08em] text-white">
                        <span className="h-1.5 w-1.5 rounded-full bg-white" />
                        MISMATCH
                    </div>
                    <p className="mt-2.5 text-[13.5px] leading-[1.5] text-ink">
                        The description says <em>all</em> orders over €10k need
                        approval. The nightly import creates them without the
                        check.
                    </p>
                    <div className="mt-2.5 mono text-[11.5px] text-text-3">
                        jobs/bulk_import.py:53
                    </div>
                </div>
            </div>

            <div className="pt-3 border-t border-line mono text-[11px] tracking-[0.08em] text-text-3">
                126 CHANGES READ · 1 WORTH YOUR ATTENTION
            </div>
        </div>
    );
}
