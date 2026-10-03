import { useRef, useEffect } from "react";
import { List, Kanban, Search, SlidersHorizontal, X } from "lucide-react";
import { Button } from "@ui/components/ui/button";
import {
    Popover,
    PopoverContent,
    PopoverTrigger,
} from "@ui/components/ui/popover";
import type { TaskCategory, TaskState, TaskSource } from "@core/types/task";

export type ViewMode = "list" | "board";

export interface ActiveFilters {
    categories: TaskCategory[];
    states: TaskState[];
    sources: TaskSource[];
}

interface TaskToolbarProps {
    viewMode: ViewMode;
    onViewModeChange: (mode: ViewMode) => void;
    filters: ActiveFilters;
    onFiltersChange: (filters: ActiveFilters) => void;
    stateCounts: Record<TaskState, number>;
    searchQuery: string;
    onSearchChange: (query: string) => void;
}

const stateLabels: { value: TaskState; label: string }[] = [
    { value: "pending", label: "Pending" },
    { value: "in_progress", label: "In Progress" },
    { value: "review", label: "Review" },
    { value: "failed", label: "Failed" },
    { value: "done", label: "Done" },
    { value: "dismissed", label: "Dismissed" },
];

const categoryLabels: { value: TaskCategory; label: string }[] = [
    { value: "feature", label: "Feature" },
    { value: "tech_debt", label: "Tech Debt" },
    { value: "tests", label: "Tests" },
    { value: "docs", label: "Docs" },
    { value: "security", label: "Security" },
    { value: "performance", label: "Performance" },
    { value: "dx", label: "DX" },
    { value: "observability", label: "Observability" },
];

const sourceLabels: { value: TaskSource; label: string }[] = [
    { value: "manual", label: "Manual" },
    { value: "scan", label: "AI Scan" },
    { value: "linear", label: "Linear" },
];

export function TaskToolbar({
    viewMode,
    onViewModeChange,
    filters,
    onFiltersChange,
    stateCounts,
    searchQuery,
    onSearchChange,
}: TaskToolbarProps) {
    const inputRef = useRef<HTMLInputElement>(null);

    // Cmd/Ctrl+F to focus search
    useEffect(() => {
        function handleKeyDown(e: KeyboardEvent) {
            if ((e.metaKey || e.ctrlKey) && e.key === "f") {
                e.preventDefault();
                inputRef.current?.focus();
            }
        }
        window.addEventListener("keydown", handleKeyDown);
        return () => window.removeEventListener("keydown", handleKeyDown);
    }, []);

    function toggleState(state: TaskState) {
        const current = filters.states;
        const next = current.includes(state)
            ? current.filter((s) => s !== state)
            : [...current, state];
        onFiltersChange({ ...filters, states: next });
    }

    function toggleCategory(category: TaskCategory) {
        const current = filters.categories;
        const next = current.includes(category)
            ? current.filter((c) => c !== category)
            : [...current, category];
        onFiltersChange({ ...filters, categories: next });
    }

    function toggleSource(source: TaskSource) {
        const current = filters.sources;
        const next = current.includes(source)
            ? current.filter((s) => s !== source)
            : [...current, source];
        onFiltersChange({ ...filters, sources: next });
    }

    const activeFilterCount =
        filters.states.length +
        filters.categories.length +
        filters.sources.length;

    return (
        <div className="flex items-center gap-2 border-b border-border px-4 py-1.5">
            {/* View toggle */}
            <div className="flex items-center gap-0.5 rounded-md bg-muted p-0.5">
                <Button
                    variant="ghost"
                    size="sm"
                    className={`h-6 w-6 p-0 ${viewMode === "list" ? "bg-background shadow-sm" : "hover:bg-transparent"}`}
                    onClick={() => onViewModeChange("list")}
                    title="List view"
                >
                    <List className="h-3.5 w-3.5" />
                </Button>
                <Button
                    variant="ghost"
                    size="sm"
                    className={`h-6 w-6 p-0 ${viewMode === "board" ? "bg-background shadow-sm" : "hover:bg-transparent"}`}
                    onClick={() => onViewModeChange("board")}
                    title="Board view"
                >
                    <Kanban className="h-3.5 w-3.5" />
                </Button>
            </div>

            {/* Separator */}
            <div className="h-4 w-px bg-border" />

            {/* Search */}
            <div className="relative flex-1 max-w-xs">
                <Search className="absolute left-2 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground/50" />
                <input
                    ref={inputRef}
                    type="text"
                    value={searchQuery}
                    onChange={(e) => onSearchChange(e.target.value)}
                    placeholder="Search tasks..."
                    className="h-7 w-full rounded-md bg-muted/50 pl-7 pr-7 text-xs text-foreground placeholder:text-muted-foreground/40 outline-none focus:bg-muted focus:ring-1 focus:ring-ring transition-colors"
                />
                {searchQuery && (
                    <button
                        type="button"
                        onClick={() => onSearchChange("")}
                        className="absolute right-1.5 top-1/2 -translate-y-1/2 rounded p-0.5 text-muted-foreground/40 hover:text-foreground transition-colors"
                    >
                        <X className="h-3 w-3" />
                    </button>
                )}
            </div>

            {/* Spacer */}
            <div className="flex-1" />

            {/* Filter popover */}
            <Popover>
                <PopoverTrigger asChild>
                    <Button
                        variant="outline"
                        size="sm"
                        className={`h-7 gap-1.5 text-xs ${activeFilterCount > 0 ? "border-foreground/30" : ""}`}
                    >
                        <SlidersHorizontal className="h-3 w-3" />
                        Filter
                        {activeFilterCount > 0 && (
                            <span className="flex h-4 min-w-[16px] items-center justify-center rounded-full bg-foreground px-1 text-[10px] font-medium text-background">
                                {activeFilterCount}
                            </span>
                        )}
                    </Button>
                </PopoverTrigger>
                <PopoverContent align="end" className="w-56 p-3" sideOffset={4}>
                    {/* Status section */}
                    <div className="mb-3">
                        <p className="mb-1.5 text-[11px] font-medium text-muted-foreground uppercase tracking-wider">
                            Status
                        </p>
                        <div className="flex flex-col gap-0.5">
                            {stateLabels.map((s) => {
                                const isActive = filters.states.includes(
                                    s.value,
                                );
                                const count = stateCounts[s.value];
                                return (
                                    <button
                                        key={s.value}
                                        type="button"
                                        onClick={() => toggleState(s.value)}
                                        className={`flex items-center justify-between rounded-md px-2 py-1 text-xs transition-colors ${
                                            isActive
                                                ? "bg-accent text-accent-foreground"
                                                : "text-foreground hover:bg-muted"
                                        }`}
                                    >
                                        <span>{s.label}</span>
                                        <span className="text-[10px] tabular-nums text-muted-foreground">
                                            {count}
                                        </span>
                                    </button>
                                );
                            })}
                        </div>
                    </div>

                    {/* Category section */}
                    <div className="mb-3">
                        <p className="mb-1.5 text-[11px] font-medium text-muted-foreground uppercase tracking-wider">
                            Category
                        </p>
                        <div className="flex flex-col gap-0.5">
                            {categoryLabels.map((c) => {
                                const isActive = filters.categories.includes(
                                    c.value,
                                );
                                return (
                                    <button
                                        key={c.value}
                                        type="button"
                                        onClick={() => toggleCategory(c.value)}
                                        className={`flex items-center rounded-md px-2 py-1 text-xs transition-colors text-left ${
                                            isActive
                                                ? "bg-accent text-accent-foreground"
                                                : "text-foreground hover:bg-muted"
                                        }`}
                                    >
                                        {c.label}
                                    </button>
                                );
                            })}
                        </div>
                    </div>

                    {/* Source section */}
                    <div className="mb-3">
                        <p className="mb-1.5 text-[11px] font-medium text-muted-foreground uppercase tracking-wider">
                            Source
                        </p>
                        <div className="flex flex-col gap-0.5">
                            {sourceLabels.map((s) => {
                                const isActive = filters.sources.includes(
                                    s.value,
                                );
                                return (
                                    <button
                                        key={s.value}
                                        type="button"
                                        onClick={() => toggleSource(s.value)}
                                        className={`flex items-center rounded-md px-2 py-1 text-xs transition-colors text-left ${
                                            isActive
                                                ? "bg-accent text-accent-foreground"
                                                : "text-foreground hover:bg-muted"
                                        }`}
                                    >
                                        {s.label}
                                    </button>
                                );
                            })}
                        </div>
                    </div>

                    {/* Clear */}
                    {activeFilterCount > 0 && (
                        <button
                            type="button"
                            onClick={() =>
                                onFiltersChange({
                                    states: [],
                                    categories: [],
                                    sources: [],
                                })
                            }
                            className="w-full rounded-md px-2 py-1 text-xs text-muted-foreground hover:text-foreground hover:bg-muted transition-colors text-center"
                        >
                            Clear all filters
                        </button>
                    )}
                </PopoverContent>
            </Popover>
        </div>
    );
}
