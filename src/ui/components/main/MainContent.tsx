import { useAppStore } from "@core/store/app-store";
import { EmptyState } from "./EmptyState";
import { TaskListView } from "@ui/components/tasks/TaskListView";
import { TaskDetailView } from "@ui/components/tasks/TaskDetailView";
import { ErrorBoundary } from "@ui/components/ErrorBoundary";

export function MainContent() {
    const selectedRepositoryId = useAppStore((s) => s.selectedRepositoryId);
    const selectedTaskId = useAppStore((s) => s.selectedTaskId);

    if (!selectedRepositoryId) {
        return <EmptyState />;
    }

    if (selectedTaskId) {
        return (
            <ErrorBoundary
                key={selectedTaskId}
                level="route"
                heading="Task view crashed"
            >
                <TaskDetailView taskId={selectedTaskId} />
            </ErrorBoundary>
        );
    }

    return (
        <ErrorBoundary
            key={selectedRepositoryId}
            level="route"
            heading="Task list crashed"
        >
            <TaskListView repositoryId={selectedRepositoryId} />
        </ErrorBoundary>
    );
}
