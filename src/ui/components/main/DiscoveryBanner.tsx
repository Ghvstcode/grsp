import { useEffect, useState } from "react";
import { X, Check } from "lucide-react";

interface DiscoveryBannerProps {
    isScanning: boolean;
    isDeepScanning: boolean;
    tasksFound: number;
}

export function DiscoveryBanner({
    isScanning,
    isDeepScanning,
    tasksFound,
}: DiscoveryBannerProps) {
    const [dismissed, setDismissed] = useState(false);
    const [showComplete, setShowComplete] = useState(false);

    // When scanning completes, show "complete" message briefly
    useEffect(() => {
        if (!isScanning && !isDeepScanning && tasksFound > 0 && !dismissed) {
            setShowComplete(true);
            const timer = setTimeout(() => {
                setShowComplete(false);
                setDismissed(true);
            }, 4000);
            return () => clearTimeout(timer);
        }
    }, [isScanning, isDeepScanning, tasksFound, dismissed]);

    // Reset dismissed state when a new scan starts
    useEffect(() => {
        if (isScanning) {
            setDismissed(false);
            setShowComplete(false);
        }
    }, [isScanning]);

    const anyScanning = isScanning || isDeepScanning;

    if (!anyScanning && !showComplete) return null;
    if (dismissed) return null;

    return (
        <div className="relative overflow-hidden animate-fade-in-up">
            {/* Subtle shimmer overlay during scanning */}
            {anyScanning && (
                <div className="absolute inset-0 animate-banner-shimmer bg-[length:200%_100%] bg-gradient-to-r from-transparent via-foreground/[0.03] to-transparent pointer-events-none" />
            )}

            <div className="flex items-center gap-3 px-6 py-2.5">
                {anyScanning ? (
                    <>
                        {/* Pulsing dot indicator */}
                        <div className="relative flex h-4 w-4 shrink-0 items-center justify-center">
                            <span className="absolute h-2.5 w-2.5 rounded-full bg-foreground/10 animate-ping" />
                            <span className="relative h-1.5 w-1.5 rounded-full bg-foreground/50" />
                        </div>
                        <span className="flex-1 text-xs tracking-wide text-foreground/50">
                            {isDeepScanning && !isScanning
                                ? "Deep analysis — examining cross-module patterns"
                                : "Scanning for improvements"}
                            {tasksFound > 0 && (
                                <span className="ml-2 font-medium text-foreground/80 animate-fade-in-up">
                                    &middot; {tasksFound}{" "}
                                    {tasksFound === 1 ? "issue" : "issues"}{" "}
                                    found
                                </span>
                            )}
                        </span>
                    </>
                ) : (
                    <>
                        <div className="flex h-4 w-4 shrink-0 items-center justify-center animate-pop-in">
                            <Check
                                className="h-3.5 w-3.5 text-foreground/40"
                                strokeWidth={2.5}
                            />
                        </div>
                        <span className="flex-1 text-xs tracking-wide text-foreground/50">
                            Analysis complete
                            {tasksFound > 0 && (
                                <span className="ml-1.5 font-medium text-foreground/80">
                                    — {tasksFound}{" "}
                                    {tasksFound === 1
                                        ? "improvement"
                                        : "improvements"}{" "}
                                    discovered
                                </span>
                            )}
                        </span>
                    </>
                )}
                <button
                    type="button"
                    onClick={() => setDismissed(true)}
                    className="shrink-0 rounded p-0.5 text-foreground/15 hover:text-foreground/40 transition-colors"
                >
                    <X className="h-3 w-3" />
                </button>
            </div>

            {/* Indeterminate progress bar */}
            {anyScanning && (
                <div className="h-px w-full bg-border/40 overflow-hidden">
                    <div className="h-full w-1/3 bg-foreground/15 rounded-full animate-slide-indeterminate" />
                </div>
            )}
        </div>
    );
}
