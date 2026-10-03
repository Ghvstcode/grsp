import { useMemo } from "react";
import { useRepositories } from "@core/api/useRepositories";
import { useAppStore } from "@core/store/app-store";
import { ProjectItem } from "./ProjectItem";
import { ScrollArea } from "@ui/components/ui/scroll-area";

interface ProjectListProps {
    search: string;
}

export function ProjectList({ search }: ProjectListProps) {
    const { data: repositories } = useRepositories();
    const selectedRepositoryId = useAppStore((s) => s.selectedRepositoryId);
    const setSelectedRepository = useAppStore((s) => s.setSelectedRepository);

    const filtered = useMemo(() => {
        if (!repositories) return [];
        if (!search.trim()) return repositories;
        const q = search.toLowerCase();
        return repositories.filter((r) => r.name.toLowerCase().includes(q));
    }, [repositories, search]);

    if (!repositories || repositories.length === 0) {
        return (
            <p className="px-4 py-2 text-xs text-sidebar-foreground">
                No projects yet
            </p>
        );
    }

    if (filtered.length === 0) {
        return (
            <p className="px-4 py-2 text-xs text-sidebar-foreground/50">
                No matches
            </p>
        );
    }

    return (
        <ScrollArea className="flex-1">
            <div className="space-y-1 px-3">
                {filtered.map((repo) => (
                    <ProjectItem
                        key={repo.id}
                        repository={repo}
                        isSelected={selectedRepositoryId === repo.id}
                        onSelect={() => setSelectedRepository(repo.id)}
                    />
                ))}
            </div>
        </ScrollArea>
    );
}
