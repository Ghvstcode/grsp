import { useState, useEffect, useRef, useCallback } from "react";
import { useRepositories, useGitBranches } from "@core/api/useRepositories";
import {
    useGlobalSettings,
    useProjectOverrides,
    useUpdateProjectOverride,
    useClearProjectOverride,
    useRemoveProject,
} from "@core/api/useSettings";
import { useAgentConfig, useUpdateAgentConfig } from "@core/api/useEngine";
import {
    useLinearTeams,
    useLinearProjects,
    useLinearSyncConfigs,
    useCreateLinearSyncConfig,
    useDeleteLinearSyncConfig,
    useUpdateSyncSchedule,
    useSyncLinear,
} from "@core/api/useLinear";
import type { LinearSyncSchedule } from "@core/types/linear";
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from "@ui/components/ui/select";
import { Button } from "@ui/components/ui/button";
import { Slider } from "@ui/components/ui/slider";
import { Switch } from "@ui/components/ui/switch";
import type { BranchPrefixMode } from "@core/types/settings";
import type { ScheduleMode } from "@core/types/agent";
import { Trash2, Clock, Zap, Hand, RefreshCw, Loader2, X } from "lucide-react";

interface ProjectSectionProps {
    repositoryId: string;
    onRemoved?: () => void;
}

export function ProjectSection({
    repositoryId,
    onRemoved,
}: ProjectSectionProps) {
    const { data: repositories } = useRepositories();
    const { data: globalSettings } = useGlobalSettings();
    const { data: overrides } = useProjectOverrides(repositoryId);
    const { data: agentConfig } = useAgentConfig(repositoryId);
    const { mutate: updateOverride } = useUpdateProjectOverride();
    const { mutate: clearOverride } = useClearProjectOverride();
    const { mutate: updateAgentConfig } = useUpdateAgentConfig();
    const { mutate: doRemoveProject, isPending: isRemoving } =
        useRemoveProject();

    // Linear sync
    const { data: linearSyncConfigs } = useLinearSyncConfigs(repositoryId);
    const { data: linearTeams } = useLinearTeams();
    const { mutate: createSyncConfig, isPending: isCreatingSync } =
        useCreateLinearSyncConfig();
    const { mutate: deleteSyncConfig } = useDeleteLinearSyncConfig();
    const { mutate: updateSchedule } = useUpdateSyncSchedule();
    const { mutate: syncLinear, isPending: isSyncing } = useSyncLinear();
    const [selectedTeamId, setSelectedTeamId] = useState<string>("");
    const [selectedProjectId, setSelectedProjectId] = useState<string>("");
    const { data: linearProjects } = useLinearProjects(
        selectedTeamId || undefined,
    );

    const [showConfirmRemove, setShowConfirmRemove] = useState(false);

    // Debounced text areas
    const [agentPrefs, setAgentPrefs] = useState("");
    const [scanPrefs, setScanPrefs] = useState("");
    const agentPrefsDebounce = useRef<
        ReturnType<typeof setTimeout> | undefined
    >(undefined);
    const scanPrefsDebounce = useRef<ReturnType<typeof setTimeout> | undefined>(
        undefined,
    );
    const agentPrefsDirty = useRef(false);
    const scanPrefsDirty = useRef(false);

    const repo = repositories?.find((r) => r.id === repositoryId);
    const { data: branches } = useGitBranches(repo?.path);

    useEffect(() => {
        if (overrides) {
            if (!agentPrefsDirty.current) {
                setAgentPrefs(overrides.agentPreferences ?? "");
            }
            if (!scanPrefsDirty.current) {
                setScanPrefs(overrides.scanPreferences ?? "");
            }
        }
    }, [overrides]);

    // Cleanup debounce timers on unmount
    useEffect(() => {
        return () => {
            clearTimeout(agentPrefsDebounce.current);
            clearTimeout(scanPrefsDebounce.current);
        };
    }, []);

    const handleAgentPrefsChange = useCallback(
        (value: string) => {
            agentPrefsDirty.current = true;
            setAgentPrefs(value);
            clearTimeout(agentPrefsDebounce.current);
            agentPrefsDebounce.current = setTimeout(() => {
                agentPrefsDirty.current = false;
                updateOverride({
                    repositoryId,
                    field: "agentPreferences",
                    value: value || null,
                });
            }, 500);
        },
        [repositoryId, updateOverride],
    );

    const handleScanPrefsChange = useCallback(
        (value: string) => {
            scanPrefsDirty.current = true;
            setScanPrefs(value);
            clearTimeout(scanPrefsDebounce.current);
            scanPrefsDebounce.current = setTimeout(() => {
                scanPrefsDirty.current = false;
                updateOverride({
                    repositoryId,
                    field: "scanPreferences",
                    value: value || null,
                });
            }, 500);
        },
        [repositoryId, updateOverride],
    );

    if (!repo || !globalSettings || !overrides) return null;

    // ── Effective values ──
    const effectiveBaseBranch =
        overrides.overrideBaseBranch ?? globalSettings.defaultBaseBranch;
    const effectiveRemote =
        overrides.overrideRemoteOrigin ?? globalSettings.remoteOrigin;
    const effectivePrefixMode =
        overrides.overrideBranchPrefixMode ?? globalSettings.branchPrefixMode;
    const effectivePrefixCustom =
        overrides.overrideBranchPrefixCustom ??
        globalSettings.branchPrefixCustom;
    const effectiveSchedule =
        agentConfig?.scheduleMode ?? (globalSettings.agentMode as ScheduleMode);
    const effectiveBudget =
        overrides.overrideBudgetCeilingPercent ??
        globalSettings.budgetCeilingPercent;

    // ── Customization flags ──
    const isBaseBranchCustom = overrides.overrideBaseBranch !== undefined;
    const isRemoteCustom = overrides.overrideRemoteOrigin !== undefined;
    const isPrefixCustom = overrides.overrideBranchPrefixMode !== undefined;
    const isScheduleCustom =
        agentConfig !== undefined &&
        agentConfig.scheduleMode !== globalSettings.agentMode;
    const isBudgetCustom = overrides.overrideBudgetCeilingPercent !== undefined;
    const effectivePrAutoReply =
        overrides.overridePrAutoReply ?? globalSettings.prLifecycleEnabled;
    const isPrAutoReplyCustom = overrides.overridePrAutoReply !== undefined;

    // ── Branch preview ──
    const prefixStr =
        effectivePrefixMode === "sustn"
            ? "sustn/"
            : effectivePrefixMode === "custom"
              ? `${effectivePrefixCustom || "prefix"}/`
              : "";

    return (
        <div>
            {/* ── Header ── */}
            <div
                className="animate-fade-in-up"
                style={{ animationDelay: "0ms" }}
            >
                <h1 className="text-lg font-semibold text-foreground">
                    {repo.name}
                </h1>
                <p className="mt-1 text-[13px] text-muted-foreground">
                    Settings for this project. Changes here take precedence over
                    your global defaults.
                </p>
            </div>

            {/* ── Source Control ── */}
            <div
                className="mt-8 animate-fade-in-up"
                style={{ animationDelay: "50ms" }}
            >
                <p className="mb-1 text-[11px] font-medium uppercase tracking-wider text-muted-foreground/50">
                    Source Control
                </p>

                {/* Base branch */}
                <div className="flex items-start justify-between gap-8 border-b border-border py-5">
                    <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-foreground">
                            Base branch
                        </p>
                        <p className="mt-1 text-[13px] leading-relaxed text-muted-foreground">
                            New work branches off from here.
                        </p>
                    </div>
                    <div className="flex shrink-0 items-center gap-3">
                        {branches && branches.length > 0 ? (
                            <Select
                                value={effectiveBaseBranch}
                                onValueChange={(value) =>
                                    updateOverride({
                                        repositoryId,
                                        field: "overrideBaseBranch",
                                        value,
                                    })
                                }
                            >
                                <SelectTrigger
                                    className={`w-[180px] h-8 text-xs font-mono ${
                                        isBaseBranchCustom
                                            ? "text-foreground"
                                            : "text-muted-foreground"
                                    }`}
                                >
                                    <SelectValue />
                                </SelectTrigger>
                                <SelectContent>
                                    {branches.map((b) => (
                                        <SelectItem key={b.name} value={b.name}>
                                            {b.name}
                                            {b.isCurrent ? " (current)" : ""}
                                        </SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>
                        ) : (
                            <span className="text-xs font-mono text-muted-foreground">
                                {effectiveBaseBranch || "No branches found"}
                            </span>
                        )}
                        {isBaseBranchCustom && (
                            <button
                                type="button"
                                onClick={() =>
                                    clearOverride({
                                        repositoryId,
                                        field: "overrideBaseBranch",
                                    })
                                }
                                className="text-[11px] text-muted-foreground/50 hover:text-foreground transition-colors"
                            >
                                Reset
                            </button>
                        )}
                    </div>
                </div>

                {/* Git remote */}
                <div className="flex items-start justify-between gap-8 border-b border-border py-5">
                    <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-foreground">
                            Git remote
                        </p>
                        <p className="mt-1 text-[13px] leading-relaxed text-muted-foreground">
                            Where branches get pushed.
                        </p>
                    </div>
                    <div className="flex shrink-0 items-center gap-3">
                        <input
                            value={effectiveRemote}
                            onChange={(e) =>
                                updateOverride({
                                    repositoryId,
                                    field: "overrideRemoteOrigin",
                                    value: e.target.value,
                                })
                            }
                            placeholder="origin"
                            className={`w-32 rounded-md border border-input bg-transparent px-3 py-1.5 text-sm font-mono outline-none focus:ring-1 focus:ring-ring transition-colors ${
                                isRemoteCustom
                                    ? "text-foreground"
                                    : "text-muted-foreground"
                            }`}
                        />
                        {isRemoteCustom && (
                            <button
                                type="button"
                                onClick={() =>
                                    clearOverride({
                                        repositoryId,
                                        field: "overrideRemoteOrigin",
                                    })
                                }
                                className="text-[11px] text-muted-foreground/50 hover:text-foreground transition-colors"
                            >
                                Reset
                            </button>
                        )}
                    </div>
                </div>

                {/* Branch prefix */}
                <div className="py-5">
                    <div className="flex items-center justify-between">
                        <p className="text-sm font-medium text-foreground">
                            Branch prefix
                        </p>
                        {isPrefixCustom && (
                            <button
                                type="button"
                                onClick={() => {
                                    clearOverride({
                                        repositoryId,
                                        field: "overrideBranchPrefixMode",
                                    });
                                    clearOverride({
                                        repositoryId,
                                        field: "overrideBranchPrefixCustom",
                                    });
                                }}
                                className="text-[11px] text-muted-foreground/50 hover:text-foreground transition-colors"
                            >
                                Reset
                            </button>
                        )}
                    </div>

                    <div className="mt-3 flex flex-wrap gap-1.5">
                        {(
                            [
                                { value: "sustn", label: "sustn/" },
                                { value: "custom", label: "Custom" },
                                { value: "none", label: "None" },
                            ] as const
                        ).map((opt) => {
                            const isSelected =
                                effectivePrefixMode === opt.value;
                            return (
                                <button
                                    key={opt.value}
                                    type="button"
                                    onClick={() =>
                                        updateOverride({
                                            repositoryId,
                                            field: "overrideBranchPrefixMode",
                                            value: opt.value as BranchPrefixMode,
                                        })
                                    }
                                    className={`rounded-md px-2.5 py-1.5 text-xs transition-all duration-200 ${
                                        isSelected
                                            ? "bg-foreground text-background shadow-sm"
                                            : "bg-muted/50 text-muted-foreground hover:bg-muted hover:text-foreground"
                                    }`}
                                >
                                    {opt.label}
                                </button>
                            );
                        })}
                    </div>

                    {effectivePrefixMode === "custom" && (
                        <input
                            value={effectivePrefixCustom ?? ""}
                            onChange={(e) =>
                                updateOverride({
                                    repositoryId,
                                    field: "overrideBranchPrefixCustom",
                                    value: e.target.value,
                                })
                            }
                            placeholder="my-prefix"
                            className="mt-2 w-40 rounded-md border border-input bg-transparent px-3 py-1.5 text-sm font-mono outline-none focus:ring-1 focus:ring-ring"
                        />
                    )}

                    <p className="mt-2 text-[12px] text-muted-foreground/60">
                        Preview:{" "}
                        <code className="rounded bg-muted px-1.5 py-0.5 text-[11px] font-mono">
                            {prefixStr}fix-auth-bug
                        </code>
                    </p>
                </div>
            </div>

            {/* ── Automation ── */}
            <div
                className="mt-8 animate-fade-in-up"
                style={{ animationDelay: "100ms" }}
            >
                <p className="mb-1 text-[11px] font-medium uppercase tracking-wider text-muted-foreground/50">
                    Automation
                </p>

                {/* Schedule */}
                <div className="border-b border-border py-5">
                    <div className="flex items-center justify-between">
                        <div>
                            <p className="text-sm font-medium text-foreground">
                                Schedule
                            </p>
                            <p className="mt-1 text-[13px] leading-relaxed text-muted-foreground">
                                When the agent works on this project.
                            </p>
                        </div>
                        {isScheduleCustom && (
                            <button
                                type="button"
                                onClick={() =>
                                    updateAgentConfig({
                                        repositoryId,
                                        scheduleMode:
                                            globalSettings.agentMode as ScheduleMode,
                                    })
                                }
                                className="text-[11px] text-muted-foreground/50 hover:text-foreground transition-colors"
                            >
                                Reset
                            </button>
                        )}
                    </div>

                    <div className="mt-3 flex gap-1.5">
                        {(
                            [
                                {
                                    value: "scheduled",
                                    label: "Scheduled",
                                    icon: Clock,
                                },
                                {
                                    value: "always",
                                    label: "Always on",
                                    icon: Zap,
                                },
                                {
                                    value: "manual",
                                    label: "Off",
                                    icon: Hand,
                                },
                            ] as const
                        ).map((mode) => {
                            const Icon = mode.icon;
                            const isSelected = effectiveSchedule === mode.value;
                            return (
                                <button
                                    key={mode.value}
                                    type="button"
                                    onClick={() =>
                                        updateAgentConfig({
                                            repositoryId,
                                            scheduleMode:
                                                mode.value as ScheduleMode,
                                        })
                                    }
                                    className={`group flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-xs transition-all duration-200 ${
                                        isSelected
                                            ? "bg-foreground text-background shadow-sm"
                                            : "bg-muted/50 text-muted-foreground hover:bg-muted hover:text-foreground"
                                    }`}
                                >
                                    <Icon
                                        className={`h-3 w-3 transition-transform duration-200 ${
                                            isSelected
                                                ? ""
                                                : "group-hover:scale-110"
                                        }`}
                                    />
                                    {mode.label}
                                </button>
                            );
                        })}
                    </div>

                    {effectiveSchedule === "scheduled" && (
                        <div className="mt-3 flex items-center gap-2">
                            <input
                                type="time"
                                value={
                                    agentConfig?.scheduleWindowStart ?? "00:00"
                                }
                                onChange={(e) =>
                                    updateAgentConfig({
                                        repositoryId,
                                        scheduleWindowStart: e.target.value,
                                    })
                                }
                                className="rounded-md border border-input bg-transparent px-2 py-1.5 text-xs outline-none focus:ring-1 focus:ring-ring"
                            />
                            <span className="text-xs text-muted-foreground/50">
                                to
                            </span>
                            <input
                                type="time"
                                value={
                                    agentConfig?.scheduleWindowEnd ?? "06:00"
                                }
                                onChange={(e) =>
                                    updateAgentConfig({
                                        repositoryId,
                                        scheduleWindowEnd: e.target.value,
                                    })
                                }
                                className="rounded-md border border-input bg-transparent px-2 py-1.5 text-xs outline-none focus:ring-1 focus:ring-ring"
                            />
                        </div>
                    )}
                </div>

                {/* Budget limit */}
                <div className="flex items-start justify-between gap-8 py-5">
                    <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-foreground">
                            Budget limit
                        </p>
                        <p className="mt-1 text-[13px] leading-relaxed text-muted-foreground">
                            Max share of your weekly budget.
                        </p>
                    </div>
                    <div className="flex shrink-0 items-center gap-3">
                        <Slider
                            value={[effectiveBudget]}
                            onValueChange={([value]) =>
                                updateOverride({
                                    repositoryId,
                                    field: "overrideBudgetCeilingPercent",
                                    value,
                                })
                            }
                            min={10}
                            max={100}
                            step={5}
                            className="w-28"
                        />
                        <span className="w-9 text-right text-sm tabular-nums text-muted-foreground">
                            {effectiveBudget}%
                        </span>
                        {isBudgetCustom && (
                            <button
                                type="button"
                                onClick={() =>
                                    clearOverride({
                                        repositoryId,
                                        field: "overrideBudgetCeilingPercent",
                                    })
                                }
                                className="text-[11px] text-muted-foreground/50 hover:text-foreground transition-colors"
                            >
                                Reset
                            </button>
                        )}
                    </div>
                </div>

                {/* Scan for tasks */}
                <div className="flex items-start justify-between gap-8 border-b border-border py-5">
                    <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-foreground">
                            Scan for tasks
                        </p>
                        <p className="mt-1 text-[13px] leading-relaxed text-muted-foreground">
                            Let the agent analyze this repo and suggest
                            improvements. Turn off for projects where you only
                            want to handle imported PRs.
                        </p>
                    </div>
                    <div className="flex shrink-0 items-center gap-3">
                        <Switch
                            checked={agentConfig?.scanEnabled !== false}
                            onCheckedChange={(checked) =>
                                updateAgentConfig({
                                    repositoryId,
                                    scanEnabled: checked,
                                })
                            }
                        />
                    </div>
                </div>

                {/* PR auto-reply */}
                <div className="flex items-start justify-between gap-8 py-5">
                    <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-foreground">
                            PR auto-reply
                        </p>
                        <p className="mt-1 text-[13px] leading-relaxed text-muted-foreground">
                            Automatically address PR review comments and
                            re-request review.
                        </p>
                    </div>
                    <div className="flex shrink-0 items-center gap-3">
                        <Switch
                            checked={effectivePrAutoReply}
                            onCheckedChange={(checked) =>
                                updateOverride({
                                    repositoryId,
                                    field: "overridePrAutoReply",
                                    value: checked,
                                })
                            }
                        />
                        {isPrAutoReplyCustom && (
                            <button
                                type="button"
                                onClick={() =>
                                    clearOverride({
                                        repositoryId,
                                        field: "overridePrAutoReply",
                                    })
                                }
                                className="text-[11px] text-muted-foreground/50 hover:text-foreground transition-colors"
                            >
                                Reset
                            </button>
                        )}
                    </div>
                </div>
            </div>

            {/* ── Linear Sync ── */}
            {globalSettings.linearEnabled && globalSettings.linearApiKey && (
                <div
                    className="mt-8 animate-fade-in-up"
                    style={{ animationDelay: "125ms" }}
                >
                    <p className="mb-1 text-[11px] font-medium uppercase tracking-wider text-muted-foreground/50">
                        Linear Sync
                    </p>

                    {/* Existing sync configs */}
                    {linearSyncConfigs && linearSyncConfigs.length > 0 && (
                        <div className="space-y-2 border-b border-border pb-5 pt-3">
                            {linearSyncConfigs.map((sc) => (
                                <div
                                    key={sc.id}
                                    className="rounded-md bg-muted/50 px-3 py-2.5"
                                >
                                    <div className="flex items-center justify-between">
                                        <div className="min-w-0 flex-1">
                                            <p className="text-sm font-medium text-foreground truncate">
                                                {sc.linearTeamName}
                                                {sc.linearProjectName
                                                    ? ` / ${sc.linearProjectName}`
                                                    : ""}
                                            </p>
                                            {sc.lastSyncAt && (
                                                <p className="text-[11px] text-muted-foreground/60">
                                                    Last synced{" "}
                                                    {new Date(
                                                        sc.lastSyncAt,
                                                    ).toLocaleString()}
                                                </p>
                                            )}
                                        </div>
                                        <div className="flex items-center gap-1.5 shrink-0">
                                            <Button
                                                size="sm"
                                                variant="ghost"
                                                onClick={() =>
                                                    syncLinear({
                                                        syncConfig: sc,
                                                        repositoryId,
                                                        baseBranch:
                                                            repo.defaultBranch,
                                                    })
                                                }
                                                disabled={isSyncing}
                                                className="h-7 px-2"
                                            >
                                                {isSyncing ? (
                                                    <Loader2 className="h-3 w-3 animate-spin" />
                                                ) : (
                                                    <RefreshCw className="h-3 w-3" />
                                                )}
                                            </Button>
                                            <Button
                                                size="sm"
                                                variant="ghost"
                                                onClick={() =>
                                                    deleteSyncConfig({
                                                        id: sc.id,
                                                        repositoryId,
                                                    })
                                                }
                                                className="h-7 px-2 text-muted-foreground/50 hover:text-destructive"
                                            >
                                                <X className="h-3 w-3" />
                                            </Button>
                                        </div>
                                    </div>
                                    {/* Schedule selector */}
                                    <div className="mt-2 flex items-center gap-1">
                                        {(
                                            [
                                                {
                                                    value: "manual",
                                                    label: "Manual",
                                                },
                                                {
                                                    value: "on_start",
                                                    label: "On launch",
                                                },
                                                {
                                                    value: "6h",
                                                    label: "Every 6h",
                                                },
                                                {
                                                    value: "12h",
                                                    label: "Every 12h",
                                                },
                                                {
                                                    value: "daily",
                                                    label: "Daily",
                                                },
                                            ] as const
                                        ).map((opt) => {
                                            const isSelected =
                                                sc.syncSchedule === opt.value;
                                            return (
                                                <button
                                                    key={opt.value}
                                                    type="button"
                                                    onClick={() =>
                                                        updateSchedule({
                                                            id: sc.id,
                                                            schedule:
                                                                opt.value as LinearSyncSchedule,
                                                            repositoryId,
                                                        })
                                                    }
                                                    className={`rounded px-2 py-0.5 text-[11px] transition-all duration-200 ${
                                                        isSelected
                                                            ? "bg-foreground text-background font-medium shadow-sm"
                                                            : "text-muted-foreground/60 hover:text-foreground hover:bg-muted"
                                                    }`}
                                                >
                                                    {opt.label}
                                                </button>
                                            );
                                        })}
                                    </div>
                                </div>
                            ))}
                        </div>
                    )}

                    {/* Add new sync */}
                    <div className="py-5">
                        <p className="text-sm font-medium text-foreground">
                            Add Linear team
                        </p>
                        <p className="mt-1 text-[13px] leading-relaxed text-muted-foreground">
                            Import issues from a Linear team into this project.
                        </p>
                        <div className="mt-3 flex flex-wrap gap-2">
                            <Select
                                value={selectedTeamId}
                                onValueChange={(v) => {
                                    setSelectedTeamId(v);
                                    setSelectedProjectId("");
                                }}
                            >
                                <SelectTrigger className="w-[160px] h-8 text-xs">
                                    <SelectValue placeholder="Select team" />
                                </SelectTrigger>
                                <SelectContent>
                                    {linearTeams?.map((t) => (
                                        <SelectItem key={t.id} value={t.id}>
                                            {t.name} ({t.key})
                                        </SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>

                            {selectedTeamId &&
                                linearProjects &&
                                linearProjects.length > 0 && (
                                    <Select
                                        value={selectedProjectId}
                                        onValueChange={setSelectedProjectId}
                                    >
                                        <SelectTrigger className="w-[160px] h-8 text-xs">
                                            <SelectValue placeholder="All issues" />
                                        </SelectTrigger>
                                        <SelectContent>
                                            <SelectItem value="__all__">
                                                All issues
                                            </SelectItem>
                                            {linearProjects.map((p) => (
                                                <SelectItem
                                                    key={p.id}
                                                    value={p.id}
                                                >
                                                    {p.name}
                                                </SelectItem>
                                            ))}
                                        </SelectContent>
                                    </Select>
                                )}

                            <Button
                                size="sm"
                                variant="outline"
                                onClick={() => {
                                    const team = linearTeams?.find(
                                        (t) => t.id === selectedTeamId,
                                    );
                                    if (!team) return;
                                    const project = linearProjects?.find(
                                        (p) => p.id === selectedProjectId,
                                    );
                                    createSyncConfig(
                                        {
                                            repositoryId,
                                            linearTeamId: team.id,
                                            linearTeamName: team.name,
                                            linearProjectId:
                                                selectedProjectId === "__all__"
                                                    ? undefined
                                                    : selectedProjectId ||
                                                      undefined,
                                            linearProjectName: project?.name,
                                        },
                                        {
                                            onSuccess: () => {
                                                setSelectedTeamId("");
                                                setSelectedProjectId("");
                                            },
                                        },
                                    );
                                }}
                                disabled={!selectedTeamId || isCreatingSync}
                                className="h-8 text-xs"
                            >
                                {isCreatingSync ? (
                                    <Loader2 className="h-3 w-3 animate-spin mr-1" />
                                ) : null}
                                Add
                            </Button>
                        </div>
                    </div>
                </div>
            )}

            {/* ── Instructions ── */}
            <div
                className="mt-8 animate-fade-in-up"
                style={{ animationDelay: "150ms" }}
            >
                <p className="mb-1 text-[11px] font-medium uppercase tracking-wider text-muted-foreground/50">
                    Instructions
                </p>

                {/* Agent instructions */}
                <div className="border-b border-border py-5">
                    <div className="flex items-center justify-between">
                        <div>
                            <p className="text-sm font-medium text-foreground">
                                Agent instructions
                            </p>
                            <p className="mt-1 text-[13px] leading-relaxed text-muted-foreground">
                                Tell the agent how to approach this project.
                            </p>
                        </div>
                        {!!agentPrefs && (
                            <button
                                type="button"
                                onClick={() => handleAgentPrefsChange("")}
                                className="text-[11px] text-muted-foreground/50 hover:text-foreground transition-colors"
                            >
                                Clear
                            </button>
                        )}
                    </div>
                    <textarea
                        value={agentPrefs}
                        onChange={(e) => handleAgentPrefsChange(e.target.value)}
                        placeholder="e.g., Always use the new auth module. Don't modify files in legacy/."
                        rows={3}
                        className="mt-3 w-full resize-none rounded-md border border-input bg-transparent px-3 py-2 text-sm leading-relaxed text-foreground placeholder:text-muted-foreground/30 outline-none focus:ring-1 focus:ring-ring"
                    />
                </div>

                {/* Scan focus */}
                <div className="py-5">
                    <div className="flex items-center justify-between">
                        <div>
                            <p className="text-sm font-medium text-foreground">
                                Scan focus
                            </p>
                            <p className="mt-1 text-[13px] leading-relaxed text-muted-foreground">
                                Guide what the scanner pays attention to.
                            </p>
                        </div>
                        {!!scanPrefs && (
                            <button
                                type="button"
                                onClick={() => handleScanPrefsChange("")}
                                className="text-[11px] text-muted-foreground/50 hover:text-foreground transition-colors"
                            >
                                Clear
                            </button>
                        )}
                    </div>
                    <textarea
                        value={scanPrefs}
                        onChange={(e) => handleScanPrefsChange(e.target.value)}
                        placeholder="e.g., Focus on api/ and services/. Ignore test fixtures."
                        rows={3}
                        className="mt-3 w-full resize-none rounded-md border border-input bg-transparent px-3 py-2 text-sm leading-relaxed text-foreground placeholder:text-muted-foreground/30 outline-none focus:ring-1 focus:ring-ring"
                    />
                </div>
            </div>

            {/* ── Danger zone ── */}
            <div
                className="mt-8 border-t border-border pt-8 animate-fade-in-up"
                style={{ animationDelay: "200ms" }}
            >
                {!showConfirmRemove ? (
                    <button
                        type="button"
                        onClick={() => setShowConfirmRemove(true)}
                        className="flex items-center gap-2 text-sm text-muted-foreground/50 hover:text-destructive transition-colors"
                    >
                        <Trash2 className="h-3.5 w-3.5" />
                        Remove project
                    </button>
                ) : (
                    <div className="space-y-3">
                        <p className="text-[13px] leading-relaxed text-muted-foreground">
                            This will delete all tasks and history for{" "}
                            <span className="font-medium text-foreground">
                                {repo.name}
                            </span>
                            . This cannot be undone.
                        </p>
                        <div className="flex gap-2">
                            <button
                                type="button"
                                onClick={() =>
                                    doRemoveProject(repositoryId, {
                                        onSuccess: () => onRemoved?.(),
                                    })
                                }
                                disabled={isRemoving}
                                className="flex items-center gap-1.5 rounded-md bg-destructive px-3.5 py-2 text-xs font-medium text-destructive-foreground transition-colors hover:bg-destructive/90"
                            >
                                <Trash2 className="h-3 w-3" />
                                {isRemoving ? "Removing..." : "Yes, remove"}
                            </button>
                            <button
                                type="button"
                                onClick={() => setShowConfirmRemove(false)}
                                className="rounded-md px-3.5 py-2 text-xs font-medium text-muted-foreground hover:text-foreground transition-colors"
                            >
                                Cancel
                            </button>
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
}
