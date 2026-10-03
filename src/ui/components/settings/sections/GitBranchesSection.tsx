import { useState, useEffect, useRef } from "react";
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from "@ui/components/ui/select";
import {
    useGlobalSettings,
    useUpdateGlobalSetting,
} from "@core/api/useSettings";
import { validateBranchName } from "@core/utils/branch";
import type { BranchNameStyle } from "@core/types/settings";

const NAME_EXAMPLES: Record<BranchNameStyle, string> = {
    slug: "fix-auth-middleware-error",
    "short-hash": "d23cd321",
    "task-id": "task-42",
};

export function GitBranchesSection() {
    const { data: settings } = useGlobalSettings();
    const { mutate: updateSetting } = useUpdateGlobalSetting();

    // Debounced custom prefix input
    const [customPrefix, setCustomPrefix] = useState("");
    const debounceRef = useRef<ReturnType<typeof setTimeout> | undefined>(
        undefined,
    );

    useEffect(() => {
        if (settings) setCustomPrefix(settings.branchPrefixCustom);
    }, [settings]);

    function handleCustomPrefixChange(value: string) {
        setCustomPrefix(value);
        clearTimeout(debounceRef.current);
        debounceRef.current = setTimeout(() => {
            updateSetting({ key: "branchPrefixCustom", value });
        }, 500);
    }

    // Debounced base branch input with validation
    const [baseBranch, setBaseBranch] = useState("");
    const [baseBranchError, setBaseBranchError] = useState<string>();
    const baseBranchDebounceRef = useRef<
        ReturnType<typeof setTimeout> | undefined
    >(undefined);

    useEffect(() => {
        if (settings) setBaseBranch(settings.defaultBaseBranch);
    }, [settings]);

    function handleBaseBranchChange(value: string) {
        setBaseBranch(value);
        const error = validateBranchName(value);
        setBaseBranchError(error);
        clearTimeout(baseBranchDebounceRef.current);
        if (!error) {
            baseBranchDebounceRef.current = setTimeout(() => {
                updateSetting({
                    key: "defaultBaseBranch",
                    value: value.trim(),
                });
            }, 500);
        }
    }

    // Debounced remote origin input
    const [remoteOrigin, setRemoteOrigin] = useState("");
    const remoteDebounceRef = useRef<ReturnType<typeof setTimeout> | undefined>(
        undefined,
    );

    useEffect(() => {
        if (settings) setRemoteOrigin(settings.remoteOrigin);
    }, [settings]);

    function handleRemoteOriginChange(value: string) {
        setRemoteOrigin(value);
        clearTimeout(remoteDebounceRef.current);
        remoteDebounceRef.current = setTimeout(() => {
            updateSetting({ key: "remoteOrigin", value });
        }, 500);
    }

    if (!settings) return null;

    const prefix =
        settings.branchPrefixMode === "sustn"
            ? "sustn/"
            : settings.branchPrefixMode === "custom"
              ? `${customPrefix || "my"}/`
              : "";

    return (
        <div>
            <div
                className="animate-fade-in-up"
                style={{ animationDelay: "0ms" }}
            >
                <h1 className="text-lg font-semibold text-foreground">
                    Git & Branches
                </h1>
                <p className="mt-1 text-[13px] text-muted-foreground">
                    Configure how SUSTN names branches and interacts with your
                    repositories.
                </p>
            </div>

            {/* Branch preview — prominent */}
            <div
                className="animate-fade-in-up mt-6"
                style={{ animationDelay: "50ms" }}
            >
                <div className="rounded-lg bg-muted/40 px-4 py-3.5">
                    <p className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground/50">
                        Branch preview
                    </p>
                    <p className="mt-1.5 font-mono text-[14px] text-foreground">
                        {prefix}
                        {NAME_EXAMPLES[settings.branchNameStyle]}
                    </p>
                </div>
            </div>

            {/* Branch naming */}
            <div
                className="animate-fade-in-up mt-6"
                style={{ animationDelay: "100ms" }}
            >
                <p className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground/50">
                    Branch naming
                </p>

                <div className="mt-3 flex items-start justify-between gap-8 border-b border-border py-4">
                    <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-foreground">
                            Prefix
                        </p>
                        <p className="mt-0.5 text-[13px] leading-relaxed text-muted-foreground">
                            Added before every branch name
                        </p>
                    </div>
                    <div className="flex shrink-0 flex-col items-end gap-2">
                        <div className="flex flex-wrap gap-1.5">
                            {(
                                [
                                    { value: "sustn", label: "sustn/" },
                                    { value: "custom", label: "Custom" },
                                    { value: "none", label: "None" },
                                ] as const
                            ).map((opt) => {
                                const isSelected =
                                    settings.branchPrefixMode === opt.value;
                                return (
                                    <button
                                        key={opt.value}
                                        type="button"
                                        onClick={() =>
                                            updateSetting({
                                                key: "branchPrefixMode",
                                                value: opt.value,
                                            })
                                        }
                                        className={`rounded-md px-3 py-1.5 text-xs transition-all duration-200 ${
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

                        {settings.branchPrefixMode === "custom" && (
                            <input
                                value={customPrefix}
                                onChange={(e) =>
                                    handleCustomPrefixChange(e.target.value)
                                }
                                placeholder="my-prefix"
                                className="w-36 rounded-md border border-input bg-transparent px-3 py-1.5 text-sm outline-none focus:ring-1 focus:ring-ring"
                            />
                        )}
                    </div>
                </div>

                <div className="flex items-start justify-between gap-8 py-4">
                    <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-foreground">
                            Name style
                        </p>
                        <p className="mt-0.5 text-[13px] leading-relaxed text-muted-foreground">
                            How the branch name is generated
                        </p>
                    </div>
                    <div className="flex shrink-0 items-center">
                        <Select
                            value={settings.branchNameStyle}
                            onValueChange={(value) =>
                                updateSetting({
                                    key: "branchNameStyle",
                                    value: value as BranchNameStyle,
                                })
                            }
                        >
                            <SelectTrigger className="w-[180px] h-8 text-xs">
                                <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                                <SelectItem value="slug">
                                    Slugified task title
                                </SelectItem>
                                <SelectItem value="short-hash">
                                    Short hash
                                </SelectItem>
                                <SelectItem value="task-id">Task ID</SelectItem>
                            </SelectContent>
                        </Select>
                    </div>
                </div>
            </div>

            {/* Repository defaults */}
            <div
                className="animate-fade-in-up mt-6"
                style={{ animationDelay: "150ms" }}
            >
                <p className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground/50">
                    Repository defaults
                </p>

                <div className="mt-3 grid grid-cols-2 gap-4">
                    <div>
                        <label className="text-sm font-medium text-foreground">
                            Base branch
                        </label>
                        <p className="mt-0.5 text-[12px] text-muted-foreground">
                            New work branches off from here
                        </p>
                        <input
                            value={baseBranch}
                            onChange={(e) =>
                                handleBaseBranchChange(e.target.value)
                            }
                            placeholder="main"
                            className={`mt-2 w-full rounded-md border bg-transparent px-3 py-1.5 text-sm outline-none focus:ring-1 ${
                                baseBranchError
                                    ? "border-destructive focus:ring-destructive"
                                    : "border-input focus:ring-ring"
                            }`}
                        />
                        {baseBranchError && (
                            <p className="mt-1 text-[11px] text-destructive">
                                {baseBranchError}
                            </p>
                        )}
                    </div>
                    <div>
                        <label className="text-sm font-medium text-foreground">
                            Git remote
                        </label>
                        <p className="mt-0.5 text-[12px] text-muted-foreground">
                            Where branches get pushed
                        </p>
                        <input
                            value={remoteOrigin}
                            onChange={(e) =>
                                handleRemoteOriginChange(e.target.value)
                            }
                            placeholder="origin"
                            className="mt-2 w-full rounded-md border border-input bg-transparent px-3 py-1.5 text-sm outline-none focus:ring-1 focus:ring-ring"
                        />
                    </div>
                </div>
            </div>
        </div>
    );
}
