import { useState, useRef, useEffect, useCallback } from "react";
import {
    Wrench,
    FlaskConical,
    FileText,
    Shield,
    Sparkles,
    Zap,
    Code,
    Activity,
    Layers,
    CornerDownLeft,
    Gauge,
} from "lucide-react";
import { Dialog, DialogContent, DialogTitle } from "@ui/components/ui/dialog";
import { VisuallyHidden } from "@radix-ui/react-visually-hidden";
import type { TaskCategory, EstimatedEffort } from "@core/types/task";

interface AddTaskDialogProps {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    onSubmit: (task: {
        title: string;
        description?: string;
        category: TaskCategory;
        estimatedEffort?: EstimatedEffort;
    }) => void;
    isPending: boolean;
}

const categories: {
    value: TaskCategory;
    label: string;
    icon: React.ElementType;
}[] = [
    { value: "general", label: "General", icon: Layers },
    { value: "feature", label: "Feature", icon: Sparkles },
    { value: "tech_debt", label: "Tech Debt", icon: Wrench },
    { value: "tests", label: "Tests", icon: FlaskConical },
    { value: "docs", label: "Docs", icon: FileText },
    { value: "security", label: "Security", icon: Shield },
    { value: "performance", label: "Perf", icon: Zap },
    { value: "dx", label: "DX", icon: Code },
    { value: "observability", label: "Observability", icon: Activity },
];

const efforts: { value: EstimatedEffort; label: string; hint: string }[] = [
    { value: "low", label: "Low", hint: "Quick fix" },
    { value: "medium", label: "Medium", hint: "A few hours" },
    { value: "high", label: "High", hint: "Significant work" },
];

export function AddTaskDialog({
    open,
    onOpenChange,
    onSubmit,
    isPending,
}: AddTaskDialogProps) {
    const [title, setTitle] = useState("");
    const [description, setDescription] = useState("");
    const [category, setCategory] = useState<TaskCategory>("general");
    const [effort, setEffort] = useState<EstimatedEffort | undefined>(
        undefined,
    );
    const titleRef = useRef<HTMLInputElement>(null);
    const descRef = useRef<HTMLTextAreaElement>(null);

    // Auto-resize description textarea to fit content
    const autoResize = useCallback(() => {
        const el = descRef.current;
        if (!el) return;
        el.style.height = "auto";
        el.style.height = `${el.scrollHeight}px`;
    }, []);

    // Focus title input when dialog opens
    useEffect(() => {
        if (open) {
            // Small delay so the dialog animation starts first
            const timer = setTimeout(() => titleRef.current?.focus(), 150);
            return () => clearTimeout(timer);
        }
        // Reset form when closed
        setTitle("");
        setDescription("");
        setCategory("general");
        setEffort(undefined);
        if (descRef.current) descRef.current.style.height = "auto";
    }, [open]);

    function handleSubmit() {
        if (!title.trim() || isPending) return;

        onSubmit({
            title: title.trim(),
            description: description.trim() || undefined,
            category,
            estimatedEffort: effort,
        });
    }

    function handleKeyDown(e: React.KeyboardEvent) {
        if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
            e.preventDefault();
            handleSubmit();
        }
    }

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent
                className="sm:max-w-[560px] p-0 gap-0 overflow-hidden"
                onKeyDown={handleKeyDown}
            >
                <VisuallyHidden>
                    <DialogTitle>Add Task</DialogTitle>
                </VisuallyHidden>

                {/* Title input — the hero */}
                <div
                    className="px-6 pt-6 animate-fade-in-up"
                    style={{ animationDelay: "50ms" }}
                >
                    <input
                        ref={titleRef}
                        value={title}
                        onChange={(e) => setTitle(e.target.value)}
                        placeholder="What needs to be done?"
                        className="w-full bg-transparent text-lg font-medium text-foreground placeholder:text-muted-foreground/40 outline-none"
                        onKeyDown={(e) => {
                            if (
                                e.key === "Enter" &&
                                !e.shiftKey &&
                                !e.metaKey &&
                                !e.ctrlKey
                            ) {
                                e.preventDefault();
                                handleSubmit();
                            }
                        }}
                    />
                </div>

                {/* Description input — auto-expanding textarea */}
                <div
                    className="px-6 pt-2 pb-5 animate-fade-in-up"
                    style={{ animationDelay: "100ms" }}
                >
                    <textarea
                        ref={descRef}
                        value={description}
                        onChange={(e) => {
                            setDescription(e.target.value);
                            autoResize();
                        }}
                        placeholder="Add a description..."
                        rows={1}
                        className="w-full resize-none bg-transparent text-sm leading-relaxed text-muted-foreground placeholder:text-muted-foreground/30 outline-none transition-[height] duration-150"
                        style={{ maxHeight: 160 }}
                    />
                </div>

                {/* Category chips */}
                <div
                    className="px-6 pb-4 animate-fade-in-up"
                    style={{ animationDelay: "150ms" }}
                >
                    <p className="mb-2 text-[11px] font-medium uppercase tracking-wider text-muted-foreground/50">
                        Category
                    </p>
                    <div className="flex flex-wrap gap-1.5">
                        {categories.map((cat) => {
                            const Icon = cat.icon;
                            const isSelected = category === cat.value;
                            return (
                                <button
                                    key={cat.value}
                                    type="button"
                                    onClick={() => setCategory(cat.value)}
                                    className={`
                                        group flex items-center gap-1.5 rounded-md px-2.5 py-1.5
                                        text-xs transition-all duration-200
                                        ${
                                            isSelected
                                                ? "bg-foreground text-background shadow-sm"
                                                : "bg-muted/50 text-muted-foreground hover:bg-muted hover:text-foreground"
                                        }
                                    `}
                                >
                                    <Icon
                                        className={`h-3 w-3 transition-transform duration-200 ${
                                            isSelected
                                                ? ""
                                                : "group-hover:scale-110"
                                        }`}
                                    />
                                    {cat.label}
                                </button>
                            );
                        })}
                    </div>
                </div>

                {/* Effort chips */}
                <div
                    className="px-6 pb-5 animate-fade-in-up"
                    style={{ animationDelay: "200ms" }}
                >
                    <p className="mb-2 text-[11px] font-medium uppercase tracking-wider text-muted-foreground/50">
                        Effort
                    </p>
                    <div className="flex gap-2">
                        {efforts.map((e) => {
                            const isSelected = effort === e.value;
                            return (
                                <button
                                    key={e.value}
                                    type="button"
                                    onClick={() =>
                                        setEffort(
                                            isSelected ? undefined : e.value,
                                        )
                                    }
                                    className={`
                                        group flex items-center gap-2 rounded-md px-3 py-2
                                        text-xs transition-all duration-200
                                        ${
                                            isSelected
                                                ? "bg-foreground text-background shadow-sm"
                                                : "bg-muted/50 text-muted-foreground hover:bg-muted hover:text-foreground"
                                        }
                                    `}
                                >
                                    <Gauge
                                        className={`h-3 w-3 transition-transform duration-200 ${
                                            isSelected
                                                ? ""
                                                : "group-hover:scale-110"
                                        }`}
                                    />
                                    <span className="font-medium">
                                        {e.label}
                                    </span>
                                    <span
                                        className={`${isSelected ? "text-background/60" : "text-muted-foreground/40"}`}
                                    >
                                        {e.hint}
                                    </span>
                                </button>
                            );
                        })}
                    </div>
                </div>

                {/* Footer */}
                <div
                    className="flex items-center justify-between border-t border-border px-6 py-3.5 animate-fade-in-up"
                    style={{ animationDelay: "250ms" }}
                >
                    <span className="text-[11px] text-muted-foreground/40 select-none">
                        <kbd className="rounded border border-border px-1 py-0.5 text-[10px] font-mono">
                            {navigator.platform?.includes("Mac")
                                ? "Cmd"
                                : "Ctrl"}
                            +Enter
                        </kbd>{" "}
                        to create
                    </span>

                    <button
                        type="button"
                        onClick={handleSubmit}
                        disabled={!title.trim() || isPending}
                        className={`
                            group flex items-center gap-1.5 rounded-md px-3.5 py-2
                            text-xs font-medium transition-all duration-200
                            ${
                                title.trim() && !isPending
                                    ? "bg-foreground text-background hover:-translate-y-px hover:shadow-sm active:translate-y-0 active:shadow-none"
                                    : "bg-muted text-muted-foreground/40 cursor-not-allowed"
                            }
                        `}
                    >
                        {isPending ? (
                            <>
                                <span className="h-3 w-3 animate-spin rounded-full border-2 border-current border-t-transparent" />
                                Creating...
                            </>
                        ) : (
                            <>
                                Create task
                                <CornerDownLeft className="h-3 w-3 opacity-50 group-hover:opacity-100 transition-opacity" />
                            </>
                        )}
                    </button>
                </div>
            </DialogContent>
        </Dialog>
    );
}
