import type { Repository } from "@core/db/repositories";
import { useTasks } from "@core/api/useTasks";
import { useAppStore } from "@core/store/app-store";

const EMPTY: string[] = [];

interface ProjectItemProps {
    repository: Repository;
    isSelected: boolean;
    onSelect: () => void;
}

export function ProjectItem({
    repository,
    isSelected,
    onSelect,
}: ProjectItemProps) {
    const { data: tasks } = useTasks(repository.id);
    const seenIds = useAppStore(
        (s) => s.seenReviewTaskIds[repository.id] ?? EMPTY,
    );
    const markSeen = useAppStore((s) => s.markReviewTasksSeen);
    const initial = repository.name.charAt(0).toUpperCase();
    const activeCount =
        tasks?.filter((t) => t.state !== "done" && t.state !== "dismissed")
            .length ?? 0;

    // Show a red dot if there are review tasks the user hasn't seen yet.
    const reviewTasks = tasks?.filter((t) => t.state === "review") ?? [];
    const hasUnseenReview = reviewTasks.some((t) => !seenIds.includes(t.id));

    function handleSelect() {
        onSelect();
        // Mark all current review tasks as seen when user clicks this project
        if (reviewTasks.length > 0) {
            markSeen(
                repository.id,
                reviewTasks.map((t) => t.id),
            );
        }
    }

    return (
        <button
            type="button"
            onClick={handleSelect}
            className={`flex w-full items-center gap-3 rounded-lg px-2.5 py-2 text-left transition-all ${
                isSelected
                    ? "bg-sidebar-accent text-sidebar-accent-foreground"
                    : "text-sidebar-foreground hover:bg-sidebar-accent/50"
            }`}
        >
            <span className="relative">
                <span
                    className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-md text-[11px] font-semibold transition-colors ${
                        isSelected
                            ? "bg-sidebar-foreground text-sidebar"
                            : "bg-sidebar-accent text-sidebar-foreground"
                    }`}
                >
                    {initial}
                </span>
                {hasUnseenReview && (
                    <span className="absolute -right-0.5 -top-0.5 h-2 w-2 rounded-full bg-red-500 ring-2 ring-sidebar" />
                )}
            </span>
            <span className="flex-1 truncate text-[13px] font-medium">
                {repository.name}
            </span>
            {activeCount > 0 && (
                <span
                    className={`shrink-0 text-[10px] tabular-nums ${
                        isSelected
                            ? "text-sidebar-accent-foreground"
                            : "text-sidebar-foreground"
                    }`}
                >
                    {activeCount}
                </span>
            )}
        </button>
    );
}
