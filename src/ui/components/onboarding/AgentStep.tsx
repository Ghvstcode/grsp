import { useEffect, useState } from "react";
import { UpdateIcon } from "@radix-ui/react-icons";
import { Button } from "@ui/components/ui/button";
import { Alert, AlertDescription } from "@ui/components/ui/alert";
import {
    AGENT_INSTALL,
    AGENT_LABELS,
    useAgentStatuses,
    useRecheckAgent,
} from "@core/api/useAgents";
import { useSettings, useUpdateSetting } from "@core/api/useSettings";
import { openExternal } from "@core/services/platform";
import { errorMessage } from "@core/utils/sessions";
import type { AgentKind, AgentStatus } from "@core/types/grsp";
import { cn } from "@ui/lib/utils";
import { CheckItem, Cmd } from "./CheckItem";

const KINDS: AgentKind[] = ["claude", "codex"];

interface AgentStepProps {
    onNext: () => void;
}

export function AgentStep({ onNext }: AgentStepProps) {
    const { data, isLoading, isFetching, error, refetch } = useAgentStatuses();
    const { data: settings } = useSettings();
    const updateSetting = useUpdateSetting();
    const recheck = useRecheckAgent();
    const [picked, setPicked] = useState<AgentKind | undefined>(undefined);

    const statusOf = (kind: AgentKind): AgentStatus | undefined =>
        data?.find((a) => a.kind === kind);

    // Default to the saved agent when it is installed, otherwise the first
    // one found.
    const saved = settings?.agent;
    const fallback =
        saved && statusOf(saved)?.installed
            ? saved
            : KINDS.find((k) => statusOf(k)?.installed);
    const selected = picked && statusOf(picked)?.installed ? picked : fallback;

    // If the user's pick disappears after a re-check, forget it.
    useEffect(() => {
        if (picked && data && !data.find((a) => a.kind === picked)?.installed) {
            setPicked(undefined);
        }
    }, [picked, data]);

    const checking = isLoading || isFetching;
    const noneFound = !!data && !KINDS.some((k) => statusOf(k)?.installed);
    const selectedStatus = selected ? statusOf(selected) : undefined;

    function handleContinue() {
        if (!selected) return;
        updateSetting.mutate(
            { key: "agent", value: selected, silent: true },
            { onSuccess: () => onNext() },
        );
    }

    return (
        <div className="animate-fade-in-up">
            <h2 className="text-2xl font-bold tracking-tight text-foreground text-center mb-1">
                Choose your agent
            </h2>
            <p className="text-sm text-muted-foreground text-center mb-6">
                grsp runs on the coding agent you already have, on your existing
                subscription. No API keys.
            </p>

            <div
                role="radiogroup"
                aria-label="Agent"
                className="divide-y divide-border rounded-lg border border-border bg-card px-4 animate-fade-in-up delay-200"
            >
                {KINDS.map((kind) => {
                    const status = statusOf(kind);
                    const installed = !!status?.installed;
                    const isSelected = selected === kind;
                    return (
                        <CheckItem
                            key={kind}
                            label={AGENT_LABELS[kind]}
                            status={
                                checking
                                    ? "loading"
                                    : installed
                                      ? "pass"
                                      : "fail"
                            }
                            detail={
                                installed ? (
                                    <>
                                        {status?.version && (
                                            <>{status.version} · </>
                                        )}
                                        <span className="select-text font-mono text-[11px]">
                                            {status?.path}
                                        </span>
                                        <br />
                                        <SignInLine
                                            kind={kind}
                                            status={status}
                                            isChecking={
                                                recheck.isPending &&
                                                recheck.variables === kind
                                            }
                                            onCheck={() => recheck.mutate(kind)}
                                        />
                                    </>
                                ) : undefined
                            }
                            help={
                                <>
                                    Not found on your PATH. Install it with{" "}
                                    <Cmd>{AGENT_INSTALL[kind].command}</Cmd>,
                                    sign in, then press Re-check.{" "}
                                    <button
                                        type="button"
                                        className="text-primary underline"
                                        onClick={() =>
                                            void openExternal(
                                                AGENT_INSTALL[kind].url,
                                            )
                                        }
                                    >
                                        Install guide
                                    </button>
                                </>
                            }
                            action={
                                <button
                                    type="button"
                                    role="radio"
                                    aria-checked={isSelected}
                                    aria-label={`Use ${AGENT_LABELS[kind]}`}
                                    disabled={!installed || checking}
                                    onClick={() => setPicked(kind)}
                                    className={cn(
                                        "flex h-8 items-center rounded-md border px-3 text-xs font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-40",
                                        isSelected
                                            ? "border-ink bg-ink text-paper"
                                            : "border-line bg-paper text-ink hover:bg-wash",
                                    )}
                                >
                                    {isSelected ? "Selected" : "Use this"}
                                </button>
                            }
                        />
                    );
                })}
            </div>

            {error && (
                <Alert variant="destructive" className="mt-4">
                    <AlertDescription className="select-text">
                        Couldn't check for agents: {errorMessage(error)}
                    </AlertDescription>
                </Alert>
            )}

            {noneFound && !checking && (
                <p className="mt-4 text-center text-xs text-muted-foreground animate-fade-in-up">
                    grsp needs Claude Code or Codex to read the code for you.
                    Install one, sign in, then press Re-check.
                </p>
            )}

            {selectedStatus?.signedIn === false && !checking && (
                <p className="mt-4 text-center text-xs text-muted-foreground animate-fade-in-up">
                    {AGENT_LABELS[selectedStatus.kind]} isn't signed in yet. You
                    can continue, but analyses will fail until you sign in.
                </p>
            )}

            <div className="flex justify-between mt-6 animate-fade-in-up delay-300">
                <Button
                    variant="outline"
                    onClick={() => void refetch()}
                    disabled={checking}
                >
                    {checking ? (
                        <>
                            <UpdateIcon className="mr-2 h-4 w-4 animate-spin" />
                            Checking...
                        </>
                    ) : (
                        "Re-check"
                    )}
                </Button>
                <Button
                    onClick={handleContinue}
                    disabled={!selected || checking || updateSetting.isPending}
                >
                    Continue
                </Button>
            </div>
        </div>
    );
}

interface SignInLineProps {
    kind: AgentKind;
    status: AgentStatus | undefined;
    isChecking: boolean;
    onCheck: () => void;
}

function SignInLine({ kind, status, isChecking, onCheck }: SignInLineProps) {
    if (isChecking) return <>Checking sign-in…</>;
    if (status?.signedIn === true) return <>Signed in</>;
    if (status?.signedIn === false) {
        return (
            <>
                Not signed in. {AGENT_INSTALL[kind].signIn}{" "}
                <button
                    type="button"
                    className="text-primary underline"
                    onClick={onCheck}
                >
                    Check again
                </button>
            </>
        );
    }
    return (
        <>
            Sign-in not checked.{" "}
            <button
                type="button"
                className="text-primary underline"
                onClick={onCheck}
            >
                Check sign-in
            </button>
        </>
    );
}
