import { useState, useRef, useEffect } from "react";
import { Tag } from "lucide-react";
import { Button } from "@ui/components/ui/button";
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from "@ui/components/ui/select";
import type { Task, TaskCategory } from "@core/types/task";

interface InlineTaskEditorProps {
    task: Task;
    onSave: (fields: {
        title: string;
        description?: string;
        category: TaskCategory;
    }) => void;
    onCancel: () => void;
}

const categoryLabels: Record<TaskCategory, string> = {
    tech_debt: "Tech Debt",
    tests: "Tests",
    docs: "Docs",
    security: "Security",
    feature: "Feature",
    performance: "Performance",
    dx: "DX",
    observability: "Observability",
    general: "General",
};

export function InlineTaskEditor({
    task,
    onSave,
    onCancel,
}: InlineTaskEditorProps) {
    const [title, setTitle] = useState(task.title);
    const [description, setDescription] = useState(task.description ?? "");
    const [category, setCategory] = useState<TaskCategory>(task.category);
    const titleRef = useRef<HTMLInputElement>(null);

    useEffect(() => {
        titleRef.current?.focus();
        titleRef.current?.select();
    }, []);

    function handleSubmit() {
        const trimmedTitle = title.trim();
        if (!trimmedTitle) return;

        const changed =
            trimmedTitle !== task.title ||
            description.trim() !== (task.description ?? "") ||
            category !== task.category;

        if (changed) {
            onSave({
                title: trimmedTitle,
                description: description.trim() || undefined,
                category,
            });
        } else {
            onCancel();
        }
    }

    function handleKeyDown(e: React.KeyboardEvent) {
        if (e.key === "Escape") {
            e.preventDefault();
            onCancel();
        }
        if (e.key === "Enter" && !e.shiftKey) {
            e.preventDefault();
            handleSubmit();
        }
    }

    return (
        <div
            className="rounded-lg border border-border bg-background shadow-sm"
            onClick={(e) => e.stopPropagation()}
        >
            {/* Title */}
            <div className="px-3 pt-3">
                <input
                    ref={titleRef}
                    value={title}
                    onChange={(e) => setTitle(e.target.value)}
                    onKeyDown={handleKeyDown}
                    placeholder="Task name"
                    className="w-full bg-transparent text-sm font-medium text-foreground placeholder:text-muted-foreground/50 outline-none"
                />
            </div>

            {/* Description */}
            <div className="px-3 pt-1 pb-2">
                <input
                    value={description}
                    onChange={(e) => setDescription(e.target.value)}
                    onKeyDown={handleKeyDown}
                    placeholder="Description"
                    className="w-full bg-transparent text-xs text-muted-foreground placeholder:text-muted-foreground/40 outline-none"
                />
            </div>

            {/* Action chips */}
            <div className="flex items-center gap-1.5 px-3 pb-2">
                <Select
                    value={category}
                    onValueChange={(v) => setCategory(v as TaskCategory)}
                >
                    <SelectTrigger className="h-7 w-auto gap-1.5 rounded-md border-border px-2 text-xs text-muted-foreground">
                        <Tag className="h-3 w-3" />
                        <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                        {Object.entries(categoryLabels).map(
                            ([value, label]) => (
                                <SelectItem key={value} value={value}>
                                    {label}
                                </SelectItem>
                            ),
                        )}
                    </SelectContent>
                </Select>
            </div>

            {/* Footer — Cancel / Save */}
            <div className="flex items-center justify-end gap-2 border-t border-border px-3 py-2">
                <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={onCancel}
                >
                    Cancel
                </Button>
                <Button
                    type="button"
                    size="sm"
                    disabled={!title.trim()}
                    onClick={handleSubmit}
                    className="bg-primary text-primary-foreground"
                >
                    Save
                </Button>
            </div>
        </div>
    );
}
