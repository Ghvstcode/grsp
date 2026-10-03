import { ArrowRight } from "lucide-react";
import type { Analysis, DiscoveryResult } from "@core/types/grsp";
import { cn } from "@ui/lib/utils";
import { SkeletonLine } from "../shared/AnalysisSection";
import { ChangeChip } from "../shared/ChangeChip";
import { sectionState } from "../lib/status";

const row = "flex items-center gap-4 py-2.5 pl-[18px] pr-[14px]";

/** Entry points whose behaviour the PR changes, gaps first. */
export function AffectedList({
    discovery,
    onWalk,
}: {
    discovery: Analysis<DiscoveryResult> | undefined;
    onWalk: (entryPointId: string) => void;
}) {
    const state = sectionState(discovery);
    // The "Code does" card carries the error and Retry for discovery.
    if (state === "error") return null;
    const result = state === "done" ? discovery?.result : undefined;

    return (
        <div className="flex flex-col gap-3">
            <h2 className="m-0 text-[15px] font-semibold">What's affected</h2>
            {!result ? (
                <div
                    className="overflow-hidden rounded-[10px] border"
                    aria-busy
                >
                    {[0, 1, 2].map((i) => (
                        <div
                            key={i}
                            className={cn(
                                row,
                                "grsp-border-soft h-[57px]",
                                i < 2 && "border-b",
                            )}
                        >
                            <SkeletonLine className="w-[180px] shrink-0" />
                            <SkeletonLine className="grow" />
                            <SkeletonLine className="w-[92px] shrink-0" />
                        </div>
                    ))}
                </div>
            ) : result.entryPoints.length === 0 ? (
                <div className="grsp-border-strong rounded-[10px] border border-dashed px-[18px] py-3.5 text-[13px] text-muted-foreground">
                    The agent found no entry points whose behaviour this change
                    affects.
                </div>
            ) : (
                <div className="overflow-hidden rounded-[10px] border">
                    {result.entryPoints.map((entry, index) => (
                        <div
                            key={entry.id}
                            className={cn(
                                row,
                                "grsp-border-soft",
                                index < result.entryPoints.length - 1 &&
                                    "border-b",
                            )}
                        >
                            <span
                                className="w-[220px] shrink-0 truncate font-mono text-[13px]"
                                title={entry.label}
                            >
                                {entry.label}
                            </span>
                            <span className="grsp-text-2 grow text-[13px]">
                                {entry.effect}
                            </span>
                            <ChangeChip state={entry.tag} variant="tag" />
                            <button
                                type="button"
                                onClick={() => onWalk(entry.id)}
                                aria-label={`Walk through ${entry.label}`}
                                className="flex h-9 w-9 shrink-0 items-center justify-center rounded-[7px] border bg-background hover:border-foreground"
                            >
                                <ArrowRight size={14} strokeWidth={2} />
                            </button>
                        </div>
                    ))}
                </div>
            )}
            {result && result.removed.length > 0 && (
                <p className="m-0 text-xs text-muted-foreground">
                    Removed:{" "}
                    <span className="font-mono">
                        {result.removed.map((r) => r.name).join(", ")}
                    </span>
                </p>
            )}
        </div>
    );
}
