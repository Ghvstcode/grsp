import { useState, useMemo, useCallback, useRef, useEffect } from "react";
import {
    DndContext,
    closestCenter,
    KeyboardSensor,
    PointerSensor,
    useSensor,
    useSensors,
    type DragEndEvent,
} from "@dnd-kit/core";
import {
    SortableContext,
    sortableKeyboardCoordinates,
    verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import {
    useTasks,
    useCreateTask,
    useReorderTask,
    useDeleteTask,
} from "@core/api/useTasks";
import { useRepositories } from "@core/api/useRepositories";
import { useScanNow, useDeepScanListener } from "@core/api/useEngine";
import { listen } from "@tauri-apps/api/event";
import { useAppStore } from "@core/store/app-store";
import { useQueueStore } from "@core/store/queue-store";
import type {
    TaskCategory,
    TaskState,
    EstimatedEffort,
} from "@core/types/task";
import { TaskListHeader } from "./TaskListHeader";
import { TaskRow } from "./TaskRow";
import { AddTaskDialog } from "./AddTaskDialog";
import { DiscoveryBanner } from "@ui/components/main/DiscoveryBanner";
import { TaskToolbar, type ViewMode, type ActiveFilters } from "./TaskToolbar";
import { KanbanBoard } from "./KanbanBoard";

interface TaskListViewProps {
    repositoryId: string;
}

export function TaskListView({ repositoryId }: TaskListViewProps) {
    const { data: repositories } = useRepositories();
    const repo = repositories?.find((r) => r.id === repositoryId);
    const defaultBranch = repo?.defaultBranch ?? "main";

    const { data: tasks } = useTasks(repositoryId, defaultBranch);
    const setSelectedTask = useAppStore((s) => s.setSelectedTask);
    const queue = useQueueStore((s) => s.queue);
    const createTask = useCreateTask();
    const reorderTask = useReorderTask();
    const deleteTask = useDeleteTask();
    const scanNow = useScanNow();
    useDeepScanListener(repositoryId);
    const [isAddDialogOpen, setIsAddDialogOpen] = useState(false);
    const [hoveredTaskId, setHoveredTaskId] = useState<string | null>(null);
    const [viewMode, setViewMode] = useState<ViewMode>("list");
    const [searchQuery, setSearchQuery] = useState("");
    const [filters, setFilters] = useState<ActiveFilters>({
        states: [],
        categories: [],
        sources: [],
    });

    // Track deep scan (pass 2) via Tauri events
    const [isDeepScanning, setIsDeepScanning] = useState(false);
    useEffect(() => {
        const unlistenStart = listen<{ repositoryId: string }>(
            "agent:scan-deep-started",
            (event) => {
                if (event.payload.repositoryId === repositoryId) {
                    setIsDeepScanning(true);
                }
            },
        );
        const unlistenEnd = listen<{ repositoryId: string }>(
            "agent:scan-deep-completed",
            (event) => {
                if (event.payload.repositoryId === repositoryId) {
                    setIsDeepScanning(false);
                }
            },
        );
        const unlistenFail = listen<{ repositoryId: string }>(
            "agent:scan-deep-failed",
            (event) => {
                if (event.payload.repositoryId === repositoryId) {
                    setIsDeepScanning(false);
                }
            },
        );
        return () => {
            void unlistenStart.then((fn) => fn());
            void unlistenEnd.then((fn) => fn());
            void unlistenFail.then((fn) => fn());
        };
    }, [repositoryId]);

    // Track new tasks found during scan
    const [scanTasksFound, setScanTasksFound] = useState(0);
    const taskCountBeforeScan = useRef(0);

    // When scan starts, snapshot current task count
    useEffect(() => {
        if (scanNow.isPending) {
            taskCountBeforeScan.current = tasks?.length ?? 0;
        }
    }, [scanNow.isPending, tasks?.length]);

    // Update tasks found count during scan
    useEffect(() => {
        if (scanNow.isPending && tasks) {
            const newCount = Math.max(
                0,
                tasks.length - taskCountBeforeScan.current,
            );
            setScanTasksFound(newCount);
        }
    }, [scanNow.isPending, tasks]);

    // Reset count when scan finishes
    useEffect(() => {
        if (!scanNow.isPending && scanTasksFound > 0) {
            // Keep count for the "complete" banner, it auto-dismisses
        }
    }, [scanNow.isPending, scanTasksFound]);

    // State counts for filter chips (computed from all tasks, before filtering)
    const stateCounts = useMemo(() => {
        const counts: Record<TaskState, number> = {
            pending: 0,
            in_progress: 0,
            review: 0,
            done: 0,
            failed: 0,
            dismissed: 0,
        };
        for (const t of tasks ?? []) {
            counts[t.state]++;
        }
        return counts;
    }, [tasks]);

    // Apply filters + search to all tasks
    const filteredTasks = useMemo(() => {
        if (!tasks) return [];
        const query = searchQuery.toLowerCase().trim();
        return tasks.filter((t) => {
            if (filters.states.length > 0 && !filters.states.includes(t.state))
                return false;
            if (
                filters.categories.length > 0 &&
                !filters.categories.includes(t.category)
            )
                return false;
            if (
                filters.sources.length > 0 &&
                !filters.sources.includes(t.source)
            )
                return false;
            if (
                query &&
                !t.title.toLowerCase().includes(query) &&
                !(t.description ?? "").toLowerCase().includes(query)
            )
                return false;
            return true;
        });
    }, [tasks, filters, searchQuery]);

    // Queue position lookup map
    const queuedTaskIds = useMemo(() => {
        const map = new Map<string, number>();
        queue.forEach((q, idx) => map.set(q.taskId, idx));
        return map;
    }, [queue]);

    const activeTasks = useMemo(() => {
        const active = filteredTasks.filter(
            (t) => t.state !== "done" && t.state !== "dismissed",
        );

        const statePriority: Record<string, number> = {
            in_progress: 0,
            failed: 1,
            pending: 2,
            review: 3,
        };

        return [...active].sort((a, b) => {
            const aPri = statePriority[a.state] ?? 2;
            const bPri = statePriority[b.state] ?? 2;

            if (aPri !== bPri) return aPri - bPri;

            // Within pending: queued tasks come before non-queued
            if (a.state === "pending" && b.state === "pending") {
                const aQIdx = queue.findIndex((q) => q.taskId === a.id);
                const bQIdx = queue.findIndex((q) => q.taskId === b.id);
                const aQueued = aQIdx !== -1;
                const bQueued = bQIdx !== -1;

                if (aQueued && !bQueued) return -1;
                if (!aQueued && bQueued) return 1;
                if (aQueued && bQueued) return aQIdx - bQIdx;
            }

            return a.sortOrder - b.sortOrder;
        });
    }, [filteredTasks, queue]);

    const doneTasks = useMemo(
        () =>
            filteredTasks.filter(
                (t) => t.state === "done" || t.state === "dismissed",
            ),
        [filteredTasks],
    );

    const sensors = useSensors(
        useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
        useSensor(KeyboardSensor, {
            coordinateGetter: sortableKeyboardCoordinates,
        }),
    );

    const handleDragEnd = useCallback(
        (event: DragEndEvent) => {
            const { active, over } = event;
            if (!over || active.id === over.id || !activeTasks.length) return;

            const oldIndex = activeTasks.findIndex((t) => t.id === active.id);
            const newIndex = activeTasks.findIndex((t) => t.id === over.id);
            if (oldIndex === -1 || newIndex === -1) return;

            let newSortOrder: number;
            if (newIndex === 0) {
                newSortOrder = activeTasks[0].sortOrder - 1;
            } else if (newIndex === activeTasks.length - 1) {
                newSortOrder =
                    activeTasks[activeTasks.length - 1].sortOrder + 1;
            } else {
                const before =
                    newIndex > oldIndex
                        ? activeTasks[newIndex]
                        : activeTasks[newIndex - 1];
                const after =
                    newIndex > oldIndex
                        ? activeTasks[newIndex + 1]
                        : activeTasks[newIndex];
                newSortOrder = (before.sortOrder + after.sortOrder) / 2;
            }

            reorderTask.mutate({
                id: active.id as string,
                repositoryId,
                newSortOrder,
            });
        },
        [activeTasks, repositoryId, reorderTask],
    );

    function handleAddTask(task: {
        title: string;
        description?: string;
        category: TaskCategory;
        estimatedEffort?: EstimatedEffort;
    }) {
        const maxSortOrder =
            tasks && tasks.length > 0
                ? Math.max(...tasks.map((t) => t.sortOrder))
                : 0;

        createTask.mutate(
            {
                repositoryId,
                title: task.title,
                description: task.description,
                category: task.category,
                estimatedEffort: task.estimatedEffort,
                sortOrder: maxSortOrder + 1,
                baseBranch: defaultBranch,
            },
            {
                onSuccess: () => setIsAddDialogOpen(false),
            },
        );
    }

    function handleMoveUp(taskId: string) {
        const idx = activeTasks.findIndex((t) => t.id === taskId);
        if (idx <= 0) return;
        const prev = activeTasks[idx - 1];
        const beforePrev = idx >= 2 ? activeTasks[idx - 2] : null;
        const newSort = beforePrev
            ? (beforePrev.sortOrder + prev.sortOrder) / 2
            : prev.sortOrder - 1;
        reorderTask.mutate({
            id: taskId,
            repositoryId,
            newSortOrder: newSort,
        });
    }

    function handleMoveDown(taskId: string) {
        const idx = activeTasks.findIndex((t) => t.id === taskId);
        if (idx === -1 || idx >= activeTasks.length - 1) return;
        const next = activeTasks[idx + 1];
        const afterNext =
            idx + 2 < activeTasks.length ? activeTasks[idx + 2] : null;
        const newSort = afterNext
            ? (next.sortOrder + afterNext.sortOrder) / 2
            : next.sortOrder + 1;
        reorderTask.mutate({
            id: taskId,
            repositoryId,
            newSortOrder: newSort,
        });
    }

    function handleDeleteTask(taskId: string) {
        deleteTask.mutate({ id: taskId, repositoryId });
    }

    function handleScan() {
        if (!repo) return;
        setScanTasksFound(0);
        console.log("handleScan");
        taskCountBeforeScan.current = tasks?.length ?? 0;
        scanNow.mutate({
            repoPath: repo.path,
            repositoryId,
            baseBranch: defaultBranch,
        });
    }

    const hasTasks = (tasks?.length ?? 0) > 0;

    return (
        <div className="flex h-full flex-col">
            <TaskListHeader
                projectName={repo?.name ?? "Project"}
                repositoryId={repositoryId}
                repositoryPath={repo?.path ?? ""}
                lastPulledAt={repo?.lastPulledAt}
                defaultBranch={defaultBranch}
                isScanning={scanNow.isPending}
                onAddTask={() => setIsAddDialogOpen(true)}
                onScan={handleScan}
            />

            {/* Toolbar with view toggle + filters (only when tasks exist) */}
            {hasTasks && (
                <TaskToolbar
                    viewMode={viewMode}
                    onViewModeChange={setViewMode}
                    filters={filters}
                    onFiltersChange={setFilters}
                    stateCounts={stateCounts}
                    searchQuery={searchQuery}
                    onSearchChange={setSearchQuery}
                />
            )}

            {/* Discovery banner */}
            <DiscoveryBanner
                isScanning={scanNow.isPending}
                isDeepScanning={isDeepScanning}
                tasksFound={scanTasksFound}
            />

            {!hasTasks ? (
                <div className="flex flex-1 flex-col items-center pt-[28vh] text-center px-6">
                    {/* Spinning logo */}
                    <div className="animate-fade-in-up">
                        <svg
                            width="36"
                            height="36"
                            viewBox="0 0 42 42"
                            fill="none"
                            xmlns="http://www.w3.org/2000/svg"
                            className="animate-slow-spin text-foreground/15"
                        >
                            <path
                                d="M24.3012 1.73511V19.0934M24.3012 36.4518V19.0934M36.5754 6.81925L12.027 31.3676M24.3012 19.0934L6.94287 19.0934M36.5754 31.3676L12.027 6.81925"
                                stroke="currentColor"
                                strokeWidth="3"
                                strokeLinecap="round"
                                strokeLinejoin="round"
                            />
                        </svg>
                    </div>

                    <p className="mt-5 text-sm font-medium text-foreground animate-fade-in-up delay-100">
                        Scanning your codebase
                    </p>

                    {/* Scanning steps */}
                    <div className="mt-5 flex flex-col items-start gap-2.5 text-left">
                        <div
                            className="flex items-center gap-2 animate-fade-in-up"
                            style={{ animationDelay: "300ms" }}
                        >
                            <span className="h-1 w-1 rounded-full bg-foreground/40" />
                            <span className="text-xs text-muted-foreground">
                                Reading project structure
                            </span>
                        </div>
                        <div
                            className="flex items-center gap-2 animate-fade-in-up"
                            style={{ animationDelay: "600ms" }}
                        >
                            <span className="h-1 w-1 rounded-full bg-foreground/40" />
                            <span className="text-xs text-muted-foreground">
                                Analyzing recent commits
                            </span>
                        </div>
                        <div
                            className="flex items-center gap-2 animate-fade-in-up"
                            style={{ animationDelay: "900ms" }}
                        >
                            <span className="h-1 w-1 rounded-full bg-foreground/40" />
                            <span className="text-xs text-muted-foreground">
                                Identifying improvements
                            </span>
                        </div>
                        <div
                            className="flex items-center gap-2 animate-fade-in-up"
                            style={{ animationDelay: "1200ms" }}
                        >
                            <span className="h-1 w-1 rounded-full bg-foreground/40" />
                            <span className="text-xs text-muted-foreground">
                                Generating tasks...
                            </span>
                        </div>
                    </div>

                    {/* Indeterminate progress */}
                    <div
                        className="w-36 h-px bg-border rounded-full overflow-hidden mt-6 animate-fade-in-up"
                        style={{ animationDelay: "1500ms" }}
                    >
                        <div className="h-full w-1/3 bg-foreground/30 rounded-full animate-slide-indeterminate" />
                    </div>
                </div>
            ) : viewMode === "board" ? (
                /* ---- Board / Kanban view ---- */
                <div className="flex-1 min-h-0">
                    <KanbanBoard
                        tasks={filteredTasks}
                        onTaskClick={setSelectedTask}
                        queuedTaskIds={queuedTaskIds}
                    />
                </div>
            ) : (
                /* ---- List view (original) ---- */
                <div
                    className="flex-1 overflow-y-auto"
                    onMouseLeave={() => setHoveredTaskId(null)}
                >
                    <div className="mx-auto w-full max-w-2xl px-6 pt-[5vh] pb-8">
                        <DndContext
                            sensors={sensors}
                            collisionDetection={closestCenter}
                            onDragEnd={handleDragEnd}
                        >
                            <SortableContext
                                items={activeTasks.map((t) => t.id)}
                                strategy={verticalListSortingStrategy}
                            >
                                {activeTasks.map((task, idx) => {
                                    const qIdx = queue.findIndex(
                                        (q) => q.taskId === task.id,
                                    );
                                    return (
                                        <TaskRow
                                            key={task.id}
                                            task={task}
                                            onClick={() =>
                                                setSelectedTask(task.id)
                                            }
                                            onMoveUp={() =>
                                                handleMoveUp(task.id)
                                            }
                                            onMoveDown={() =>
                                                handleMoveDown(task.id)
                                            }
                                            onDelete={() =>
                                                handleDeleteTask(task.id)
                                            }
                                            canMoveUp={idx > 0}
                                            canMoveDown={
                                                idx < activeTasks.length - 1
                                            }
                                            isActive={hoveredTaskId === task.id}
                                            onHover={() =>
                                                setHoveredTaskId(task.id)
                                            }
                                            isQueued={qIdx !== -1}
                                            queuePosition={qIdx}
                                        />
                                    );
                                })}
                            </SortableContext>
                        </DndContext>

                        {doneTasks.map((task) => (
                            <TaskRow
                                key={task.id}
                                task={task}
                                onClick={() => setSelectedTask(task.id)}
                                onDelete={() => handleDeleteTask(task.id)}
                                isActive={hoveredTaskId === task.id}
                                onHover={() => setHoveredTaskId(task.id)}
                            />
                        ))}
                    </div>
                </div>
            )}

            <AddTaskDialog
                open={isAddDialogOpen}
                onOpenChange={setIsAddDialogOpen}
                onSubmit={handleAddTask}
                isPending={createTask.isPending}
            />
        </div>
    );
}
