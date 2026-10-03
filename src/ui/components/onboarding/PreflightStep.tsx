import { usePreflightChecks } from "@core/api/usePreflightChecks";
import { useAuthStore } from "@core/store/auth-store";
import { Button } from "@ui/components/ui/button";
import { Badge } from "@ui/components/ui/badge";
import {
    CheckCircledIcon,
    CrossCircledIcon,
    UpdateIcon,
} from "@radix-ui/react-icons";

interface PreflightStepProps {
    onNext: () => void;
}

interface CheckItemProps {
    label: string;
    status: "loading" | "pass" | "fail";
    detail?: string;
    helpUrl?: string;
    helpText?: string;
    required?: boolean;
}

function CheckItem({
    label,
    status,
    detail,
    helpUrl,
    helpText,
    required = true,
}: CheckItemProps) {
    return (
        <div className="flex items-start gap-3 py-3">
            <div className="mt-0.5">
                {status === "loading" && (
                    <UpdateIcon className="h-5 w-5 animate-spin text-muted-foreground" />
                )}
                {status === "pass" && (
                    <CheckCircledIcon className="h-5 w-5 text-green-500" />
                )}
                {status === "fail" && (
                    <CrossCircledIcon className="h-5 w-5 text-destructive" />
                )}
            </div>
            <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                    <span className="text-sm font-medium text-foreground">
                        {label}
                    </span>
                    {!required && (
                        <Badge variant="secondary" className="text-xs">
                            optional
                        </Badge>
                    )}
                </div>
                {detail && (
                    <p className="text-xs text-muted-foreground mt-0.5">
                        {detail}
                    </p>
                )}
                {status === "fail" && helpText && (
                    <p className="text-xs text-muted-foreground mt-1">
                        {helpText}{" "}
                        {helpUrl && (
                            <a
                                href={helpUrl}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="text-primary underline"
                            >
                                Install guide
                            </a>
                        )}
                    </p>
                )}
            </div>
        </div>
    );
}

export function PreflightStep({ onNext }: PreflightStepProps) {
    const isAuthenticated = useAuthStore((s) => s.isAuthenticated);
    const { data, isLoading, refetch, isFetching } = usePreflightChecks();

    const allRequiredPassed =
        isAuthenticated && (data?.allRequiredPassed ?? false);

    return (
        <div className="animate-fade-in-up">
            <h2 className="text-2xl font-bold tracking-tight text-foreground text-center mb-1">
                Preflight check
            </h2>
            <p className="text-sm text-muted-foreground text-center mb-6">
                Making sure your environment is ready.
            </p>

            <div className="divide-y divide-border rounded-lg border border-border bg-card px-4 animate-fade-in-up delay-200">
                <CheckItem
                    label="GitHub connected"
                    status={isAuthenticated ? "pass" : "fail"}
                    detail={
                        isAuthenticated ? "Signed in successfully" : undefined
                    }
                    required
                />
                <CheckItem
                    label="Claude Code installed"
                    status={
                        isLoading || isFetching
                            ? "loading"
                            : data?.claude.installed
                              ? "pass"
                              : "fail"
                    }
                    detail={data?.claude.version ?? undefined}
                    helpText="Claude Code CLI is required to run AI agents."
                    helpUrl="https://docs.anthropic.com/en/docs/claude-code/overview"
                    required
                />
                <CheckItem
                    label="Claude Code authenticated"
                    status={
                        isLoading || isFetching
                            ? "loading"
                            : data?.claudeAuth.authenticated
                              ? "pass"
                              : "fail"
                    }
                    helpText="Run 'claude' in your terminal to sign in."
                    required
                />
                <CheckItem
                    label="Git installed"
                    status={
                        isLoading || isFetching
                            ? "loading"
                            : data?.git.installed
                              ? "pass"
                              : "fail"
                    }
                    detail={data?.git.version ?? undefined}
                    helpText="Git is required for version control."
                    helpUrl="https://git-scm.com/downloads"
                    required
                />
                <CheckItem
                    label="GitHub CLI"
                    status={
                        isLoading || isFetching
                            ? "loading"
                            : data?.gh.installed
                              ? "pass"
                              : "fail"
                    }
                    detail={data?.gh.version ?? undefined}
                    helpText="Recommended for creating PRs automatically."
                    helpUrl="https://cli.github.com"
                    required={false}
                />
            </div>

            <div className="flex justify-between mt-6 animate-fade-in-up delay-300">
                <Button
                    variant="outline"
                    onClick={() => void refetch()}
                    disabled={isFetching}
                >
                    {isFetching ? (
                        <>
                            <UpdateIcon className="mr-2 h-4 w-4 animate-spin" />
                            Checking...
                        </>
                    ) : (
                        "Re-check"
                    )}
                </Button>
                <Button onClick={onNext} disabled={!allRequiredPassed}>
                    Continue
                </Button>
            </div>
        </div>
    );
}
