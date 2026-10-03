interface SettingsRowProps {
    label: string;
    sublabel?: string;
    children: React.ReactNode;
    vertical?: boolean;
}

export function SettingsRow({
    label,
    sublabel,
    children,
    vertical,
}: SettingsRowProps) {
    return (
        <div className="flex items-start justify-between gap-8 border-b border-border py-5 last:border-b-0">
            <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-foreground">{label}</p>
                {sublabel && (
                    <p className="mt-1 text-[13px] leading-relaxed text-muted-foreground">
                        {sublabel}
                    </p>
                )}
                {vertical && <div className="mt-3">{children}</div>}
            </div>
            {!vertical && (
                <div className="flex shrink-0 items-center">{children}</div>
            )}
        </div>
    );
}
