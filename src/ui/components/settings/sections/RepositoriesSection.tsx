import { useState } from "react";
import { Trash2 } from "lucide-react";
import { Button } from "@ui/components/ui/button";
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
} from "@ui/components/ui/dialog";
import { AddFolderDialog } from "@ui/components/sidebar/AddFolderDialog";
import { useRemoveRepo, useRepos } from "@core/api/useRepos";
import { errorMessage } from "@core/utils/sessions";
import type { Repo } from "@core/types/grsp";
import { errorToast, successToast } from "@ui/lib/toast";
import { SectionHeader } from "../SectionHeader";

export function RepositoriesSection() {
    const { data: repos, isLoading } = useRepos();
    const removeRepo = useRemoveRepo();
    const [isAddOpen, setIsAddOpen] = useState(false);
    const [toRemove, setToRemove] = useState<Repo | undefined>(undefined);

    function handleRemove() {
        if (!toRemove) return;
        const repo = toRemove;
        removeRepo.mutate(repo.id, {
            onSuccess: () => {
                setToRemove(undefined);
                successToast(`Removed ${repo.name}`);
            },
            onError: (err) => {
                setToRemove(undefined);
                errorToast(
                    `Couldn't remove ${repo.name}: ${errorMessage(err)}`,
                );
            },
        });
    }

    return (
        <div>
            <SectionHeader
                title="Repositories"
                description="Local folders grsp reads pull requests from. Reviews in the sidebar are grouped by folder."
                action={
                    <Button
                        variant="outline"
                        onClick={() => setIsAddOpen(true)}
                    >
                        Add folder
                    </Button>
                }
            />

            <div
                className="mt-6 animate-fade-in-up"
                style={{ animationDelay: "50ms" }}
            >
                {!isLoading && (repos?.length ?? 0) === 0 && (
                    <div className="rounded-lg border border-dashed border-line-strong px-4 py-6 text-center">
                        <p className="text-sm">No folders yet</p>
                        <p className="mt-1 text-[13px] text-muted-foreground">
                            Add the local clone of a repository to start
                            reviewing its pull requests.
                        </p>
                    </div>
                )}

                {repos?.map((repo) => (
                    <div
                        key={repo.id}
                        className="group flex items-center gap-4 border-b border-border py-4 last:border-b-0"
                    >
                        <div className="w-[180px] shrink-0">
                            <p className="truncate text-sm font-medium">
                                {repo.name}
                            </p>
                            <p className="mt-0.5 truncate text-xs text-text-3">
                                {repo.remote
                                    ? `${repo.remote.owner}/${repo.remote.name}`
                                    : "No GitHub remote · branches only"}
                            </p>
                        </div>
                        <span
                            className="min-w-0 flex-1 select-text truncate font-mono text-xs text-text-2"
                            title={repo.path}
                        >
                            {repo.path}
                        </span>
                        {repo.language && (
                            <span className="shrink-0 text-xs text-text-3">
                                {repo.language}
                            </span>
                        )}
                        <button
                            type="button"
                            onClick={() => setToRemove(repo)}
                            className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md text-text-3 opacity-0 transition-opacity hover:bg-wash hover:text-ink focus-visible:opacity-100 group-hover:opacity-100"
                            title={`Remove ${repo.name}`}
                            aria-label={`Remove ${repo.name}`}
                        >
                            <Trash2 className="h-3.5 w-3.5" />
                        </button>
                    </div>
                ))}
            </div>

            <AddFolderDialog open={isAddOpen} onOpenChange={setIsAddOpen} />

            <Dialog
                open={!!toRemove}
                onOpenChange={(open) => {
                    if (!open && !removeRepo.isPending) setToRemove(undefined);
                }}
            >
                <DialogContent className="max-w-md">
                    <DialogHeader>
                        <DialogTitle>Remove {toRemove?.name}?</DialogTitle>
                        <DialogDescription className="pt-1">
                            Its reviews are archived and leave the sidebar. The
                            folder on disk isn't touched.
                        </DialogDescription>
                    </DialogHeader>
                    <DialogFooter>
                        <Button
                            variant="outline"
                            onClick={() => setToRemove(undefined)}
                            disabled={removeRepo.isPending}
                        >
                            Cancel
                        </Button>
                        <Button
                            onClick={handleRemove}
                            disabled={removeRepo.isPending}
                        >
                            {removeRepo.isPending
                                ? "Removing…"
                                : "Remove folder"}
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>
        </div>
    );
}
