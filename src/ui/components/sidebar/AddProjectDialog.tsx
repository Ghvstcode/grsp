import { useState } from "react";
import { open as openFileDialog } from "@tauri-apps/plugin-dialog";
import { FolderOpen, GitBranch, ChevronRight } from "lucide-react";
import {
    Dialog,
    DialogContent,
    DialogHeader,
    DialogTitle,
    DialogDescription,
} from "@ui/components/ui/dialog";
import { Button } from "@ui/components/ui/button";
import { Input } from "@ui/components/ui/input";
import { Alert, AlertDescription } from "@ui/components/ui/alert";
import {
    useAddRepository,
    useCloneRepository,
    useDefaultCloneDir,
} from "@core/api/useRepositories";

interface AddProjectDialogProps {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    onSuccess: (repoId: string, repoPath: string) => void;
}

type Mode = "choose" | "clone";

export function AddProjectDialog({
    open,
    onOpenChange,
    onSuccess,
}: AddProjectDialogProps) {
    const [mode, setMode] = useState<Mode>("choose");
    const [cloneUrl, setCloneUrl] = useState("");
    const [cloneDir, setCloneDir] = useState("");
    const [error, setError] = useState<string | undefined>(undefined);

    const addRepo = useAddRepository();
    const cloneRepo = useCloneRepository();
    const { data: defaultCloneDir } = useDefaultCloneDir();

    function handleClose() {
        onOpenChange(false);
        // Reset state after close animation
        setTimeout(() => {
            setMode("choose");
            setCloneUrl("");
            setCloneDir("");
            setError(undefined);
        }, 200);
    }

    async function handleOpenProject() {
        setError(undefined);

        const selected = await openFileDialog({
            directory: true,
            multiple: false,
            title: "Select a project directory",
        });

        if (!selected) return;

        const path = typeof selected === "string" ? selected : selected[0];
        if (!path) return;

        const name = path.split("/").pop() ?? "unknown";

        addRepo.mutate(
            { path, name },
            {
                onSuccess: (repo) => {
                    onSuccess(repo.id, repo.path);
                    handleClose();
                },
                onError: (err: Error) => setError(err.message),
            },
        );
    }

    function handleStartClone() {
        setMode("clone");
        if (defaultCloneDir && !cloneDir) {
            setCloneDir(defaultCloneDir);
        }
    }

    async function handleBrowseDestination() {
        const selected = await openFileDialog({
            directory: true,
            multiple: false,
            title: "Choose clone destination",
        });

        if (selected) {
            const path = typeof selected === "string" ? selected : selected[0];
            if (path) setCloneDir(path);
        }
    }

    function handleClone() {
        if (!cloneUrl.trim()) {
            setError("Please enter a Git URL");
            return;
        }

        setError(undefined);

        const repoName = cloneUrl
            .replace(/\.git$/, "")
            .split("/")
            .pop();
        const destination = cloneDir
            ? `${cloneDir}/${repoName}`
            : `${defaultCloneDir ?? ""}/${repoName}`;

        cloneRepo.mutate(
            { url: cloneUrl.trim(), destination },
            {
                onSuccess: (repo) => {
                    onSuccess(repo.id, repo.path);
                    handleClose();
                },
                onError: (err: Error) => setError(err.message),
            },
        );
    }

    const isPending = addRepo.isPending || cloneRepo.isPending;

    const repoDisplayName = cloneUrl
        .replace(/\.git$/, "")
        .split("/")
        .pop();

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="sm:max-w-xl">
                {/* Cloning state */}
                {mode === "clone" && cloneRepo.isPending ? (
                    <div className="flex flex-col items-center text-center py-8">
                        <svg
                            width="36"
                            height="36"
                            viewBox="0 0 42 42"
                            fill="none"
                            xmlns="http://www.w3.org/2000/svg"
                            className="animate-slow-spin"
                        >
                            <path
                                d="M24.3012 1.73511V19.0934M24.3012 36.4518V19.0934M36.5754 6.81925L12.027 31.3676M24.3012 19.0934L6.94287 19.0934M36.5754 31.3676L12.027 6.81925"
                                stroke="currentColor"
                                strokeWidth="3"
                                strokeLinecap="round"
                                strokeLinejoin="round"
                            />
                        </svg>

                        <p className="text-sm font-medium text-foreground mt-5">
                            Cloning repository...
                        </p>

                        {repoDisplayName && (
                            <p className="text-xs font-mono text-muted-foreground mt-1">
                                {repoDisplayName}
                            </p>
                        )}

                        <div className="w-36 h-px bg-border rounded-full overflow-hidden mt-5">
                            <div className="h-full w-1/3 bg-foreground rounded-full animate-slide-indeterminate" />
                        </div>
                    </div>
                ) : mode === "clone" ? (
                    /* Clone form */
                    <>
                        <DialogHeader>
                            <DialogTitle>Clone from URL</DialogTitle>
                            <DialogDescription>
                                Enter a Git repository URL to clone.
                            </DialogDescription>
                        </DialogHeader>

                        <div className="space-y-4 mt-2">
                            <div>
                                <label className="text-xs font-medium uppercase tracking-wider text-muted-foreground mb-1.5 block">
                                    Repository URL
                                </label>
                                <Input
                                    placeholder="https://github.com/user/repo.git"
                                    value={cloneUrl}
                                    onChange={(e) =>
                                        setCloneUrl(e.target.value)
                                    }
                                    className="font-mono text-sm"
                                />
                            </div>
                            <div>
                                <label className="text-xs font-medium uppercase tracking-wider text-muted-foreground mb-1.5 block">
                                    Destination
                                </label>
                                <div className="flex gap-2">
                                    <Input
                                        value={cloneDir}
                                        onChange={(e) =>
                                            setCloneDir(e.target.value)
                                        }
                                        placeholder={defaultCloneDir ?? ""}
                                        className="flex-1 font-mono text-sm"
                                    />
                                    <Button
                                        variant="outline"
                                        onClick={() =>
                                            void handleBrowseDestination()
                                        }
                                    >
                                        Browse...
                                    </Button>
                                </div>
                            </div>

                            {error && (
                                <Alert variant="destructive">
                                    <AlertDescription>{error}</AlertDescription>
                                </Alert>
                            )}

                            <div className="flex justify-between pt-1">
                                <Button
                                    variant="outline"
                                    onClick={() => {
                                        setMode("choose");
                                        setError(undefined);
                                    }}
                                >
                                    Back
                                </Button>
                                <Button
                                    onClick={handleClone}
                                    disabled={!cloneUrl.trim()}
                                >
                                    Clone repository
                                </Button>
                            </div>
                        </div>
                    </>
                ) : (
                    /* Choose mode */
                    <>
                        <DialogHeader>
                            <DialogTitle>Add project</DialogTitle>
                            <DialogDescription>
                                Choose a repository for sustn to work on.
                            </DialogDescription>
                        </DialogHeader>

                        <div className="grid gap-3 mt-2">
                            <button
                                type="button"
                                className="group flex items-center gap-4 rounded-xl border border-border p-4 text-left transition-all duration-200 hover:border-foreground/25 hover:shadow-[0_1px_6px_rgba(0,0,0,0.06)]"
                                onClick={() => void handleOpenProject()}
                                disabled={isPending}
                            >
                                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border border-border">
                                    <FolderOpen className="h-4 w-4" />
                                </div>
                                <div className="flex-1 min-w-0">
                                    <p className="text-sm font-semibold text-foreground">
                                        Open existing project
                                    </p>
                                    <p className="text-xs text-muted-foreground mt-0.5">
                                        Select a local git repository.
                                    </p>
                                </div>
                                <ChevronRight className="h-4 w-4 text-muted-foreground/50 transition-all duration-200 group-hover:text-foreground group-hover:translate-x-1" />
                            </button>

                            <div className="relative">
                                <div className="absolute inset-0 flex items-center">
                                    <div className="w-full border-t border-border/50" />
                                </div>
                                <div className="relative flex justify-center">
                                    <span className="bg-background px-3 text-[10px] uppercase tracking-[0.2em] text-muted-foreground">
                                        or
                                    </span>
                                </div>
                            </div>

                            <button
                                type="button"
                                className="group flex items-center gap-4 rounded-xl border border-border p-4 text-left transition-all duration-200 hover:border-foreground/25 hover:shadow-[0_1px_6px_rgba(0,0,0,0.06)]"
                                onClick={handleStartClone}
                                disabled={isPending}
                            >
                                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border border-border">
                                    <GitBranch className="h-4 w-4" />
                                </div>
                                <div className="flex-1 min-w-0">
                                    <p className="text-sm font-semibold text-foreground">
                                        Clone from URL
                                    </p>
                                    <p className="text-xs text-muted-foreground mt-0.5">
                                        Pull down a repo from GitHub or any Git
                                        host.
                                    </p>
                                </div>
                                <ChevronRight className="h-4 w-4 text-muted-foreground/50 transition-all duration-200 group-hover:text-foreground group-hover:translate-x-1" />
                            </button>
                        </div>

                        {error && (
                            <Alert variant="destructive" className="mt-3">
                                <AlertDescription>{error}</AlertDescription>
                            </Alert>
                        )}
                    </>
                )}
            </DialogContent>
        </Dialog>
    );
}
