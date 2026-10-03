interface SectionHeaderProps {
    title: string;
    description: string;
    /** Right-aligned control next to the title. */
    action?: React.ReactNode;
}

/** Title + one-line description at the top of every settings section. */
export function SectionHeader({
    title,
    description,
    action,
}: SectionHeaderProps) {
    return (
        <div
            className="animate-fade-in-up flex items-start justify-between gap-6"
            style={{ animationDelay: "0ms" }}
        >
            <div>
                <h1 className="text-lg font-semibold text-foreground">
                    {title}
                </h1>
                <p className="mt-1 text-[13px] text-muted-foreground">
                    {description}
                </p>
            </div>
            {action && <div className="shrink-0">{action}</div>}
        </div>
    );
}
