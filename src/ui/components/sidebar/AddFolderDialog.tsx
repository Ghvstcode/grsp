import { useState } from "react";
import { FolderOpen, ChevronRight } from "lucide-react";
import {
    Dialog,
    DialogContent,
    DialogHeader,
    DialogTitle,
    DialogDescription,
} from "@ui/components/ui/dialog";
import { Alert, AlertDescription } from "@ui/components/ui/alert";
import { useAddRepo } from "@core/api/useRepos";
import { pickFolder } from "@core/services/platform";
import { errorMessage } from "@core/utils/sessions";
import type { Repo } from "@core/types/grsp";

interface AddFolderDialogProps {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    onSuccess?: (repo: Repo) => void;
    /** Overrides the default description (e.g. "Add the folder for acme/api"). */
    description?: string;
}

export function AddFolderDialog({
    open,
    onOpenChange,
    onSuccess,
    description,
}: AddFolderDialogProps) {
    const [error, setError] = useState<string | undefined>(undefined);
    const addRepo = useAddRepo();

    function handleOpenChange(next: boolean) {
        if (!next) setError(undefined);
        onOpenChange(next);
    }

    async function handleChooseFolder() {
        setError(undefined);

        let path: string | undefined;
        try {
            path = await pickFolder("Select a repository folder");
        } catch (e) {
            setError(errorMessage(e));
            return;
        }
        if (!path) return;

        addRepo.mutate(
            { path },
            {
                onSuccess: (repo) => {
                    onSuccess?.(repo);
                    handleOpenChange(false);
                },
                onError: (err: unknown) => setError(errorMessage(err)),
            },
        );
    }

    return (
        <Dialog open={open} onOpenChange={handleOpenChange}>
            <DialogContent className="sm:max-w-xl">
                <DialogHeader>
                    <DialogTitle>Add folder</DialogTitle>
                    <DialogDescription>
                        {description ??
                            "Choose a local clone of the repository whose pull requests you want to understand."}
                    </DialogDescription>
                </DialogHeader>

                <div className="grid gap-3 mt-2">
                    <button
                        type="button"
                        className="group flex items-center gap-4 rounded-xl border border-border p-4 text-left transition-all duration-200 hover:border-foreground/25 hover:shadow-[0_1px_6px_rgba(0,0,0,0.06)] disabled:opacity-60"
                        onClick={() => void handleChooseFolder()}
                        disabled={addRepo.isPending}
                    >
                        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border border-border">
                            <FolderOpen className="h-4 w-4" />
                        </div>
                        <div className="flex-1 min-w-0">
                            <p className="text-sm font-semibold text-foreground">
                                {addRepo.isPending
                                    ? "Checking folder…"
                                    : "Choose a folder"}
                            </p>
                            <p className="text-xs text-muted-foreground mt-0.5">
                                It must be a git repository. grsp only reads
                                from it.
                            </p>
                        </div>
                        <ChevronRight className="h-4 w-4 text-muted-foreground/50 transition-all duration-200 group-hover:text-foreground group-hover:translate-x-1" />
                    </button>
                </div>

                {error && (
                    <Alert variant="destructive" className="mt-1">
                        <AlertDescription>{error}</AlertDescription>
                    </Alert>
                )}
            </DialogContent>
        </Dialog>
    );
}
