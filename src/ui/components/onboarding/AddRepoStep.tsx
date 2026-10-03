import { useState } from "react";
import { Button } from "@ui/components/ui/button";
import { Alert, AlertDescription } from "@ui/components/ui/alert";
import { FolderOpen, ChevronRight } from "lucide-react";
import { useAddRepo } from "@core/api/useRepos";
import { pickFolder } from "@core/services/platform";
import { errorMessage } from "@core/utils/sessions";
import type { Repo } from "@core/types/grsp";

interface AddRepoStepProps {
    onAdded: (repo: Repo) => void;
    onSkip: () => void;
}

export function AddRepoStep({ onAdded, onSkip }: AddRepoStepProps) {
    const [error, setError] = useState<string | undefined>(undefined);
    const addRepo = useAddRepo();

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
                onSuccess: (repo) => onAdded(repo),
                onError: (err: unknown) => setError(errorMessage(err)),
            },
        );
    }

    return (
        <div className="animate-fade-in-up">
            <h2 className="text-2xl font-bold tracking-tight text-foreground text-center mb-1">
                Add your first repository
            </h2>
            <p className="text-sm text-muted-foreground text-center mb-6">
                Choose the local folder of a repo whose pull requests you
                review.
            </p>

            <div className="grid gap-3 animate-fade-in-up delay-200">
                <button
                    type="button"
                    className="group flex items-center gap-5 rounded-xl border border-border p-5 text-left transition-all duration-200 hover:border-foreground/25 hover:shadow-[0_1px_6px_rgba(0,0,0,0.06)] disabled:opacity-60"
                    onClick={() => void handleChooseFolder()}
                    disabled={addRepo.isPending}
                >
                    <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg border border-border">
                        <FolderOpen className="h-5 w-5" />
                    </div>
                    <div className="flex-1 min-w-0">
                        <p className="text-sm font-semibold text-foreground">
                            {addRepo.isPending
                                ? "Checking folder…"
                                : "Choose a folder"}
                        </p>
                        <p className="text-xs text-muted-foreground mt-0.5">
                            It must be a git repository. grsp only reads from
                            it.
                        </p>
                    </div>
                    <ChevronRight className="h-4 w-4 text-muted-foreground/50 transition-all duration-200 group-hover:text-foreground group-hover:translate-x-1" />
                </button>
            </div>

            {error && (
                <Alert variant="destructive" className="mt-4">
                    <AlertDescription className="select-text">
                        {error}
                    </AlertDescription>
                </Alert>
            )}

            <div className="mt-8 flex justify-center">
                <Button
                    variant="ghost"
                    size="sm"
                    onClick={onSkip}
                    className="text-xs text-muted-foreground/50 hover:text-muted-foreground"
                >
                    Skip for now
                </Button>
            </div>
        </div>
    );
}
