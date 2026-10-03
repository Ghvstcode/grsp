import {
    CheckCircledIcon,
    CrossCircledIcon,
    UpdateIcon,
} from "@radix-ui/react-icons";
import { Badge } from "@ui/components/ui/badge";

export type CheckStatus = "loading" | "pass" | "fail" | "unknown";

interface CheckItemProps {
    label: string;
    status: CheckStatus;
    detail?: React.ReactNode;
    /** Shown under the label when the check failed or is unknown. */
    help?: React.ReactNode;
    optional?: boolean;
    /** Right-aligned control (a radio, a button). */
    action?: React.ReactNode;
}

/** One row of an onboarding checklist (sustn's preflight row). */
export function CheckItem({
    label,
    status,
    detail,
    help,
    optional,
    action,
}: CheckItemProps) {
    return (
        <div className="flex items-start gap-3 py-3">
            <div className="mt-0.5">
                {status === "loading" && (
                    <UpdateIcon className="h-5 w-5 animate-spin text-muted-foreground" />
                )}
                {status === "pass" && (
                    <CheckCircledIcon className="h-5 w-5 text-foreground" />
                )}
                {status === "fail" && (
                    <CrossCircledIcon className="h-5 w-5 text-muted-foreground" />
                )}
                {status === "unknown" && (
                    <div className="m-[3px] h-3.5 w-3.5 rounded-full border border-dashed border-muted-foreground" />
                )}
            </div>
            <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                    <span className="text-sm font-medium text-foreground">
                        {label}
                    </span>
                    {optional && (
                        <Badge variant="secondary" className="text-xs">
                            optional
                        </Badge>
                    )}
                </div>
                {detail && (
                    <p className="text-xs text-muted-foreground mt-0.5 break-words">
                        {detail}
                    </p>
                )}
                {status !== "pass" && status !== "loading" && help && (
                    <div className="text-xs text-muted-foreground mt-1">
                        {help}
                    </div>
                )}
            </div>
            {action && <div className="shrink-0 self-center">{action}</div>}
        </div>
    );
}

/** Inline monospace command, selectable so it can be copied. */
export function Cmd({ children }: { children: React.ReactNode }) {
    return (
        <code className="select-text rounded bg-muted px-1 py-0.5 font-mono text-[11px] text-foreground">
            {children}
        </code>
    );
}
