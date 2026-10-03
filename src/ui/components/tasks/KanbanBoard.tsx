import { useState, useCallback, useMemo } from "react";
import {
    DndContext,
    DragOverlay,
    closestCorners,
    PointerSensor,
    KeyboardSensor,
    useSensor,
    useSensors,
    type DragStartEvent,
    type DragEndEvent,
    type DragOverEvent,
} from "@dnd-kit/core";
import { useUpdateTask } from "@core/api/useTasks";
import type { Task, TaskState } from "@core/types/task";
import { KanbanColumn } from "./KanbanColumn";
import { KanbanCard } from "./KanbanCard";

/** The columns to show in the board, in display order */
const BOARD_COLUMNS: TaskState[] = [
    "pending",
    "in_progress",
    "review",
    "done",
    "failed",
    "dismissed",
];

interface KanbanBoardProps {
    tasks: Task[];
    onTaskClick: (taskId: string) => void;
    queuedTaskIds: Map<string, number>;
    /** Optional: only show these states */
    visibleStates?: TaskState[];
}

export function KanbanBoard({
    tasks,
    onTaskClick,
    queuedTaskIds,
    visibleStates,
}: KanbanBoardProps) {
    const updateTask = useUpdateTask();
    const [activeTask, setActiveTask] = useState<Task | null>(null);

    // Track which column a dragged card is hovering over (for optimistic preview)
    const [overColumn, setOverColumn] = useState<TaskState | null>(null);

    const sensors = useSensors(
        useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
        useSensor(KeyboardSensor),
    );

    const columns = visibleStates ?? BOARD_COLUMNS;

    // Group tasks by state
    const tasksByState = useMemo(() => {
        const map: Record<TaskState, Task[]> = {
            pending: [],
            in_progress: [],
            review: [],
            done: [],
            failed: [],
            dismissed: [],
        };
        for (const task of tasks) {
            // If dragging and hovering over a different column, show the
            // card in the target column instead of its original column
            if (
                activeTask?.id === task.id &&
                overColumn &&
                overColumn !== task.state
            ) {
                map[overColumn].push(task);
            } else {
                map[task.state].push(task);
            }
        }
        return map;
    }, [tasks, activeTask, overColumn]);

    const handleDragStart = useCallback(
        (event: DragStartEvent) => {
            const task = tasks.find((t) => t.id === event.active.id);
            if (task) setActiveTask(task);
        },
        [tasks],
    );

    const handleDragOver = useCallback(
        (event: DragOverEvent) => {
            const { over } = event;
            if (!over || !activeTask) {
                setOverColumn(null);
                return;
            }

            // Determine target column — could be dropping over another card or a column
            let targetState: TaskState | undefined;

            const overData = over.data.current;
            if (overData?.type === "column") {
                targetState = overData.state as TaskState;
            } else if (overData?.type === "task") {
                targetState = (overData.task as Task).state;
            } else {
                // Fallback: check if the over id starts with "column-"
                const overId = String(over.id);
                if (overId.startsWith("column-")) {
                    targetState = overId.replace("column-", "") as TaskState;
                }
            }

            setOverColumn(targetState ?? null);
        },
        [activeTask],
    );

    const handleDragEnd = useCallback(
        (event: DragEndEvent) => {
            const { active, over } = event;

            setActiveTask(null);
            setOverColumn(null);

            if (!over) return;

            const taskId = active.id as string;
            const task = tasks.find((t) => t.id === taskId);
            if (!task) return;

            // Determine target column
            let targetState: TaskState | undefined;
            const overData = over.data.current;

            if (overData?.type === "column") {
                targetState = overData.state as TaskState;
            } else if (overData?.type === "task") {
                targetState = (overData.task as Task).state;
            } else {
                const overId = String(over.id);
                if (overId.startsWith("column-")) {
                    targetState = overId.replace("column-", "") as TaskState;
                }
            }

            // Only update if the state actually changed
            if (targetState && targetState !== task.state) {
                updateTask.mutate({ id: taskId, state: targetState });
            }
        },
        [tasks, updateTask],
    );

    const handleDragCancel = useCallback(() => {
        setActiveTask(null);
        setOverColumn(null);
    }, []);

    return (
        <DndContext
            sensors={sensors}
            collisionDetection={closestCorners}
            onDragStart={handleDragStart}
            onDragOver={handleDragOver}
            onDragEnd={handleDragEnd}
            onDragCancel={handleDragCancel}
        >
            <div className="flex h-full min-h-0 gap-4 overflow-x-auto p-4">
                {columns.map((state) => (
                    <KanbanColumn
                        key={state}
                        state={state}
                        tasks={tasksByState[state]}
                        onTaskClick={onTaskClick}
                        queuedTaskIds={queuedTaskIds}
                    />
                ))}
            </div>

            {/* Drag overlay — follows the cursor with a preview of the card */}
            <DragOverlay dropAnimation={null}>
                {activeTask ? (
                    <div className="w-[280px] rotate-2 opacity-90">
                        <KanbanCard
                            task={activeTask}
                            onClick={() => {}}
                            isQueued={queuedTaskIds.has(activeTask.id)}
                            queuePosition={
                                queuedTaskIds.get(activeTask.id) ?? -1
                            }
                        />
                    </div>
                ) : null}
            </DragOverlay>
        </DndContext>
    );
}
