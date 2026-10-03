interface OverrideToggleProps {
    label: string;
    sublabel?: string;
    isOverridden: boolean;
    onToggle: (override: boolean) => void;
    globalPreview: string;
    children: React.ReactNode;
}

export function OverrideToggle({
    label,
    sublabel,
    isOverridden,
    onToggle,
    globalPreview,
    children,
}: OverrideToggleProps) {
    return (
        <div className="border-b border-border py-5 last:border-b-0">
            <div className="flex items-start justify-between gap-8">
                <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-foreground">
                        {label}
                    </p>
                    {sublabel && (
                        <p className="mt-1 text-[13px] leading-relaxed text-muted-foreground">
                            {sublabel}
                        </p>
                    )}
                </div>
                <div className="flex shrink-0 items-center gap-1.5">
                    <button
                        type="button"
                        onClick={() => onToggle(false)}
                        className={`rounded-md px-2.5 py-1.5 text-xs transition-all duration-200 ${
                            !isOverridden
                                ? "bg-foreground text-background shadow-sm"
                                : "bg-muted/50 text-muted-foreground hover:bg-muted hover:text-foreground"
                        }`}
                    >
                        Global
                    </button>
                    <button
                        type="button"
                        onClick={() => onToggle(true)}
                        className={`rounded-md px-2.5 py-1.5 text-xs transition-all duration-200 ${
                            isOverridden
                                ? "bg-foreground text-background shadow-sm"
                                : "bg-muted/50 text-muted-foreground hover:bg-muted hover:text-foreground"
                        }`}
                    >
                        Custom
                    </button>
                </div>
            </div>

            {!isOverridden ? (
                <p className="mt-2 text-[13px] text-muted-foreground/60">
                    Using global: {globalPreview}
                </p>
            ) : (
                <div className="mt-3">{children}</div>
            )}
        </div>
    );
}
