import { useState } from "react";
import { ChevronRight } from "lucide-react";
import {
    Collapsible,
    CollapsibleContent,
    CollapsibleTrigger,
} from "@ui/components/ui/collapsible";
import type { Task } from "@core/types/task";
import { TaskRow } from "./TaskRow";

interface DoneTasksCollapsibleProps {
    tasks: Task[];
    onTaskClick: (taskId: string) => void;
}

export function DoneTasksCollapsible({
    tasks,
    onTaskClick,
}: DoneTasksCollapsibleProps) {
    const [isOpen, setIsOpen] = useState(false);

    if (tasks.length === 0) return null;

    return (
        <Collapsible open={isOpen} onOpenChange={setIsOpen} className="mt-2">
            <CollapsibleTrigger className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-sm text-muted-foreground hover:bg-accent/50 transition-colors">
                <ChevronRight
                    className={`h-3.5 w-3.5 transition-transform ${
                        isOpen ? "rotate-90" : ""
                    }`}
                />
                <span>Done ({tasks.length})</span>
            </CollapsibleTrigger>
            <CollapsibleContent>
                <div className="space-y-0.5">
                    {tasks.map((task) => (
                        <TaskRow
                            key={task.id}
                            task={task}
                            onClick={() => onTaskClick(task.id)}
                        />
                    ))}
                </div>
            </CollapsibleContent>
        </Collapsible>
    );
}
