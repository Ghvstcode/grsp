import { Button } from "@ui/components/ui/button";
import { Segmented } from "@ui/components/ui/segmented";
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
import { SectionHeader } from "../SectionHeader";

const AGENT_OPTIONS: { value: AgentKind; label: string }[] = [
    { value: "claude", label: AGENT_LABELS.claude },
    { value: "codex", label: AGENT_LABELS.codex },
];

/** What grsp runs when Rust hasn't reported the command (not installed). */
const FALLBACK_COMMAND: Record<AgentKind, string> = {
    claude: "claude -p (headless, read-only tools)",
    codex: "codex exec (read-only sandbox)",
};

export function AgentSection() {
    const { data: settings } = useSettings();
    const { mutate: updateSetting } = useUpdateSetting();
    const {
        data: agents,
        isLoading,
        isFetching,
        error,
        refetch,
    } = useAgentStatuses();
    const recheck = useRecheckAgent();

    if (!settings) return null;

    const kind = settings.agent;
    const status = agents?.find((a) => a.kind === kind);
    const checking = isLoading || isFetching || recheck.isPending;

    function handleRecheck() {
        // Re-detect the binary, then run the sign-in ping if it's there.
        void refetch().then((result) => {
            if (result.data?.find((a) => a.kind === kind)?.installed) {
                recheck.mutate(kind);
            }
        });
    }

    return (
        <div>
            <SectionHeader
                title="Agent"
                description="grsp runs on the coding agent you already have installed and uses your existing subscription. No API keys."
            />

            <div
                className="mt-6 animate-fade-in-up"
                style={{ animationDelay: "50ms" }}
            >
                <Segmented
                    label="Agent"
                    value={kind}
                    onValueChange={(value) =>
                        updateSetting({ key: "agent", value })
                    }
                    options={AGENT_OPTIONS}
                />
                <p className="mt-2 text-xs text-muted-foreground">
                    Switching agents takes effect on the next analysis.
                </p>
            </div>

            <div
                className="mt-5 animate-fade-in-up"
                style={{ animationDelay: "100ms" }}
            >
                <AgentStatusCard
                    kind={kind}
                    status={status}
                    checking={checking}
                    error={error ?? recheck.error}
                    onRecheck={handleRecheck}
                />
                <p className="mt-3 text-xs text-muted-foreground">
                    The agent runs in a read-only worktree of the PR. grsp never
                    stores credentials.
                </p>
            </div>
        </div>
    );
}

interface AgentStatusCardProps {
    kind: AgentKind;
    status: AgentStatus | undefined;
    checking: boolean;
    error: unknown;
    onRecheck: () => void;
}

function AgentStatusCard({
    kind,
    status,
    checking,
    error,
    onRecheck,
}: AgentStatusCardProps) {
    const name = AGENT_LABELS[kind];
    const installed = !!status?.installed;
    const headline = checking
        ? `Checking ${name}…`
        : error && !status
          ? `Couldn't check ${name}`
          : installed
            ? `${name} detected`
            : `${name} not found`;

    return (
        <div className="overflow-hidden rounded-lg border border-line">
            <div className="flex items-center gap-3 px-4 py-3">
                <span
                    className={cn(
                        "h-2 w-2 shrink-0 rounded-full border border-ink",
                        installed && !checking ? "bg-ink" : "bg-transparent",
                        checking && "animate-pulse",
                    )}
                />
                <span className="flex-1 text-sm">{headline}</span>
                <Button
                    variant="outline"
                    size="sm"
                    onClick={onRecheck}
                    disabled={checking}
                >
                    Re-check
                </Button>
            </div>

            {error !== null && error !== undefined && !checking && (
                <Row label="Error">
                    <span className="select-text text-text-2">
                        {errorMessage(error)}
                    </span>
                </Row>
            )}

            {installed ? (
                <>
                    <Row label="Binary">
                        <span className="select-text break-all font-mono text-[12.5px]">
                            {status?.path ?? "on PATH"}
                        </span>
                        {status?.version && (
                            <span className="ml-2 text-xs text-text-3">
                                {status.version}
                            </span>
                        )}
                    </Row>
                    <Row label="Account">
                        {status?.signedIn === true && (
                            <span>Signed in · subscription</span>
                        )}
                        {status?.signedIn === false && (
                            <span>
                                Not signed in.{" "}
                                <span className="text-text-2">
                                    {AGENT_INSTALL[kind].signIn} Then press
                                    Re-check.
                                </span>
                            </span>
                        )}
                        {status?.signedIn === undefined && (
                            <span className="text-text-2">
                                Not checked yet. Press Re-check to verify
                                sign-in.
                            </span>
                        )}
                    </Row>
                </>
            ) : (
                !checking && (
                    <Row label="Install">
                        <span>
                            <code className="select-text font-mono text-[12.5px]">
                                {AGENT_INSTALL[kind].command}
                            </code>
                            <span className="mt-1 block text-text-2">
                                Then sign in and press Re-check.{" "}
                                <button
                                    type="button"
                                    className="font-medium text-ink underline underline-offset-[3px]"
                                    onClick={() =>
                                        void openExternal(
                                            AGENT_INSTALL[kind].url,
                                        )
                                    }
                                >
                                    Install guide
                                </button>
                            </span>
                        </span>
                    </Row>
                )
            )}
            <Row label="Runs as">
                <span className="select-text font-mono text-[12.5px]">
                    {status?.command || FALLBACK_COMMAND[kind]}
                </span>
            </Row>
        </div>
    );
}

function Row({
    label,
    children,
}: {
    label: string;
    children: React.ReactNode;
}) {
    return (
        <div className="flex gap-4 border-t border-line-soft px-4 py-2.5 text-[13px]">
            <span className="w-[90px] shrink-0 text-text-3">{label}</span>
            <span className="min-w-0 flex-1">{children}</span>
        </div>
    );
}
