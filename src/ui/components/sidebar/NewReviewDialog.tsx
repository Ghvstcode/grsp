import { useEffect, useState } from "react";
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
    Select,
    SelectContent,
    SelectGroup,
    SelectItem,
    SelectLabel,
    SelectTrigger,
    SelectValue,
} from "@ui/components/ui/select";
import { Segmented } from "@ui/components/ui/segmented";
import {
    useBranches,
    useCloneRepo,
    useOpenPrs,
    useRepos,
} from "@core/api/useRepos";
import { useCommits } from "@core/api/useCommits";
import { useCreateSession, useSessions } from "@core/api/useSessions";
import { useAppStore } from "@core/store/app-store";
import type {
    NewSessionInput,
    Repo,
    RepoNotAddedError,
} from "@core/types/grsp";
import { commitsInput } from "@core/utils/commits";
import {
    errorMessage,
    looksLikePrUrl,
    parseRepoNotAdded,
} from "@core/utils/sessions";
import { AddFolderDialog } from "./AddFolderDialog";
import { CommitList } from "./CommitList";
import { PrList } from "./PrList";

type Mode = "url" | "pr" | "branches" | "commits";

const MODES: { value: Mode; label: string }[] = [
    { value: "url", label: "Paste a URL" },
    { value: "pr", label: "Open pull requests" },
    { value: "branches", label: "Two branches" },
    { value: "commits", label: "Commits" },
];

interface NewReviewDialogProps {
    open: boolean;
    onOpenChange: (open: boolean) => void;
}

export function NewReviewDialog({ open, onOpenChange }: NewReviewDialogProps) {
    const { data: repos } = useRepos();
    const { data: sessions } = useSessions();
    const selectedSessionId = useAppStore((s) => s.selectedSessionId);
    const createSession = useCreateSession();
    const cloneRepo = useCloneRepo();

    const [mode, setMode] = useState<Mode>("url");
    const [url, setUrl] = useState("");
    const [repoId, setRepoId] = useState<string | undefined>(undefined);
    const [base, setBase] = useState<string | undefined>(undefined);
    const [head, setHead] = useState<string | undefined>(undefined);
    const [commitBranch, setCommitBranch] = useState<string | undefined>(
        undefined,
    );
    const [error, setError] = useState<string | undefined>(undefined);
    const [repoNotAdded, setRepoNotAdded] = useState<
        RepoNotAddedError | undefined
    >(undefined);
    const [pendingInput, setPendingInput] = useState<
        NewSessionInput | undefined
    >(undefined);
    const [isAddFolderOpen, setIsAddFolderOpen] = useState(false);

    // Reset when the dialog opens; default to the current session's repo.
    useEffect(() => {
        if (!open) return;
        setUrl("");
        setError(undefined);
        setRepoNotAdded(undefined);
        setPendingInput(undefined);
        setBase(undefined);
        setHead(undefined);
        setCommitBranch(undefined);
        const current = sessions?.find((s) => s.id === selectedSessionId);
        setRepoId(current?.repoId);
        // Only on open: later session/selection changes must not reset the form.
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [open]);

    const repo: Repo | undefined =
        repos?.find((r) => r.id === repoId) ?? repos?.[0];

    const openPrs = useOpenPrs(
        repo?.id,
        open && mode === "pr" && !!repo?.remote,
    );
    const branches = useBranches(
        repo?.id,
        open && (mode === "branches" || mode === "commits"),
    );

    const effectiveBase =
        base ??
        (branches.data
            ? defaultBaseBranch(branches.data.defaultBranch, [
                  ...branches.data.local,
                  ...branches.data.remote,
              ])
            : undefined);

    // Commits default to the repo's default branch, where merged work lands.
    const effectiveCommitBranch = commitBranch ?? effectiveBase;
    const commits = useCommits(
        repo?.id,
        effectiveCommitBranch,
        open && mode === "commits",
    );

    function start(input: NewSessionInput) {
        setError(undefined);
        setRepoNotAdded(undefined);
        setPendingInput(input);
        createSession.mutate(input, {
            onSuccess: () => onOpenChange(false),
            onError: (err: unknown) => {
                const notAdded = parseRepoNotAdded(err);
                if (notAdded) setRepoNotAdded(notAdded);
                else setError(errorMessage(err));
            },
            onSettled: () => setPendingInput(undefined),
        });
    }

    function handleClone(target: RepoNotAddedError) {
        setError(undefined);
        cloneRepo.mutate(
            { owner: target.owner, name: target.name },
            {
                onSuccess: (added) => {
                    setRepoId(added.id);
                    if (trimmedUrl) start({ kind: "url", url: trimmedUrl });
                },
                onError: (err: unknown) => setError(errorMessage(err)),
            },
        );
    }

    function handleModeChange(next: Mode) {
        setMode(next);
        setError(undefined);
        setRepoNotAdded(undefined);
    }

    function handleRepoChange(id: string) {
        setRepoId(id);
        setBase(undefined);
        setHead(undefined);
        setCommitBranch(undefined);
        setError(undefined);
    }

    const isPending = createSession.isPending;
    const trimmedUrl = url.trim();
    const hasRepos = (repos?.length ?? 0) > 0;

    const repoPicker = (
        <div>
            <label className="section-label mb-2 block">Repository</label>
            <Select value={repo?.id} onValueChange={handleRepoChange}>
                <SelectTrigger className="h-10">
                    <SelectValue placeholder="Choose a repo folder" />
                </SelectTrigger>
                <SelectContent>
                    {repos?.map((r) => (
                        <SelectItem key={r.id} value={r.id}>
                            {r.name}
                        </SelectItem>
                    ))}
                </SelectContent>
            </Select>
        </div>
    );

    const noRepos = (
        <div className="rounded-lg border border-line px-4 py-3">
            <p className="text-[13px] text-text-2">
                Add a repo folder first. grsp reads pull requests from your
                local clone.
            </p>
            <Button
                variant="outline"
                size="sm"
                className="mt-3"
                onClick={() => setIsAddFolderOpen(true)}
            >
                Add folder
            </Button>
        </div>
    );

    return (
        <>
            <Dialog open={open} onOpenChange={onOpenChange}>
                <DialogContent className="sm:max-w-xl">
                    <DialogHeader>
                        <DialogTitle>New review</DialogTitle>
                        <DialogDescription>
                            Point grsp at a pull request, compare two branches,
                            or review commits without a pull request.
                        </DialogDescription>
                    </DialogHeader>

                    <Segmented
                        label="How to start"
                        value={mode}
                        onValueChange={handleModeChange}
                        options={MODES}
                    />

                    <div className="min-h-[188px] space-y-4">
                        {mode === "url" && (
                            <form
                                className="space-y-4"
                                onSubmit={(e) => {
                                    e.preventDefault();
                                    if (trimmedUrl && !isPending) {
                                        start({ kind: "url", url: trimmedUrl });
                                    }
                                }}
                            >
                                <div>
                                    <label
                                        htmlFor="new-review-url"
                                        className="section-label mb-2 block"
                                    >
                                        Pull request URL
                                    </label>
                                    <Input
                                        id="new-review-url"
                                        autoFocus
                                        placeholder="https://github.com/owner/repo/pull/123"
                                        value={url}
                                        onChange={(e) => {
                                            setUrl(e.target.value);
                                            setError(undefined);
                                            setRepoNotAdded(undefined);
                                        }}
                                        className="h-10 font-mono text-[12.5px]"
                                    />
                                    {trimmedUrl !== "" &&
                                        !looksLikePrUrl(trimmedUrl) && (
                                            <p className="mt-1.5 text-xs text-text-3">
                                                That doesn't look like a pull
                                                request link yet.
                                            </p>
                                        )}
                                </div>
                                <div className="flex justify-end">
                                    <Button
                                        type="submit"
                                        disabled={
                                            !looksLikePrUrl(trimmedUrl) ||
                                            isPending
                                        }
                                    >
                                        {isPending ? "Opening…" : "Open review"}
                                    </Button>
                                </div>
                            </form>
                        )}

                        {mode === "pr" &&
                            (!hasRepos ? (
                                noRepos
                            ) : (
                                <>
                                    {repoPicker}
                                    {repo && !repo.remote ? (
                                        <div className="rounded-lg border border-line px-4 py-3">
                                            <p className="text-[13px] text-text-2">
                                                This folder has no GitHub
                                                remote, so there are no pull
                                                requests to list. You can still
                                                compare two branches or review
                                                commits.
                                            </p>
                                        </div>
                                    ) : (
                                        <PrList
                                            prs={openPrs.data}
                                            isLoading={openPrs.isLoading}
                                            error={openPrs.error}
                                            onRetry={() =>
                                                void openPrs.refetch()
                                            }
                                            pendingNumber={
                                                pendingInput?.kind === "pr"
                                                    ? pendingInput.number
                                                    : undefined
                                            }
                                            onPick={(pr) => {
                                                if (!repo) return;
                                                start({
                                                    kind: "pr",
                                                    repoId: repo.id,
                                                    number: pr.number,
                                                });
                                            }}
                                        />
                                    )}
                                </>
                            ))}

                        {mode === "branches" &&
                            (!hasRepos ? (
                                noRepos
                            ) : (
                                <>
                                    {repoPicker}
                                    {branches.error ? (
                                        <div className="rounded-lg border border-line px-4 py-3">
                                            <p className="text-[13px] font-medium">
                                                Couldn't list branches
                                            </p>
                                            <p className="mt-0.5 select-text text-xs text-text-2">
                                                {errorMessage(branches.error)}
                                            </p>
                                            <button
                                                type="button"
                                                onClick={() =>
                                                    void branches.refetch()
                                                }
                                                className="mt-2 text-xs font-medium underline underline-offset-[3px]"
                                            >
                                                Retry
                                            </button>
                                        </div>
                                    ) : (
                                        <div className="grid grid-cols-2 gap-3">
                                            <BranchSelect
                                                label="Base"
                                                placeholder={
                                                    branches.isLoading
                                                        ? "Reading branches…"
                                                        : "Branch to compare against"
                                                }
                                                value={effectiveBase}
                                                onValueChange={setBase}
                                                local={branches.data?.local}
                                                remote={branches.data?.remote}
                                                disabled={branches.isLoading}
                                            />
                                            <BranchSelect
                                                label="Head"
                                                placeholder={
                                                    branches.isLoading
                                                        ? "Reading branches…"
                                                        : "Branch with the changes"
                                                }
                                                value={head}
                                                onValueChange={setHead}
                                                local={branches.data?.local}
                                                remote={branches.data?.remote}
                                                disabled={branches.isLoading}
                                            />
                                        </div>
                                    )}
                                    <div className="flex items-center justify-between gap-4">
                                        <p className="text-xs text-text-3">
                                            No discussion and no posting in this
                                            mode. Works with any git host.
                                        </p>
                                        <Button
                                            className="shrink-0"
                                            disabled={
                                                !repo ||
                                                !effectiveBase ||
                                                !head ||
                                                effectiveBase === head ||
                                                isPending
                                            }
                                            onClick={() => {
                                                if (
                                                    !repo ||
                                                    !effectiveBase ||
                                                    !head
                                                ) {
                                                    return;
                                                }
                                                start({
                                                    kind: "branches",
                                                    repoId: repo.id,
                                                    base: effectiveBase,
                                                    head,
                                                });
                                            }}
                                        >
                                            {isPending
                                                ? "Opening…"
                                                : "Start review"}
                                        </Button>
                                    </div>
                                    {effectiveBase &&
                                        head &&
                                        effectiveBase === head && (
                                            <p className="text-xs text-text-3">
                                                Base and head are the same
                                                branch.
                                            </p>
                                        )}
                                </>
                            ))}

                        {mode === "commits" &&
                            (!hasRepos ? (
                                noRepos
                            ) : (
                                <>
                                    <div className="grid grid-cols-2 gap-3">
                                        {repoPicker}
                                        <BranchSelect
                                            label="Branch"
                                            placeholder={
                                                branches.isLoading
                                                    ? "Reading branches…"
                                                    : "Branch to read commits from"
                                            }
                                            value={effectiveCommitBranch}
                                            onValueChange={(value) => {
                                                setCommitBranch(value);
                                                setError(undefined);
                                            }}
                                            local={branches.data?.local}
                                            remote={branches.data?.remote}
                                            disabled={
                                                branches.isLoading ||
                                                !!branches.error
                                            }
                                        />
                                    </div>
                                    {branches.error ? (
                                        <div className="rounded-lg border border-line px-4 py-3">
                                            <p className="text-[13px] font-medium">
                                                Couldn't list branches
                                            </p>
                                            <p className="mt-0.5 select-text text-xs text-text-2">
                                                {errorMessage(branches.error)}
                                            </p>
                                            <button
                                                type="button"
                                                onClick={() =>
                                                    void branches.refetch()
                                                }
                                                className="mt-2 text-xs font-medium underline underline-offset-[3px]"
                                            >
                                                Retry
                                            </button>
                                        </div>
                                    ) : !effectiveCommitBranch &&
                                      !branches.isLoading ? (
                                        <div className="rounded-lg border border-line px-4 py-3">
                                            <p className="text-[13px] text-text-2">
                                                Choose a branch to see its
                                                commits.
                                            </p>
                                        </div>
                                    ) : (
                                        <CommitList
                                            list={commits.data}
                                            isLoading={
                                                branches.isLoading ||
                                                commits.isLoading
                                            }
                                            error={commits.error}
                                            onRetry={() =>
                                                void commits.refetch()
                                            }
                                            pending={isPending}
                                            onPick={(pick) => {
                                                if (!repo || !commits.data) {
                                                    return;
                                                }
                                                const input = commitsInput(
                                                    repo.id,
                                                    commits.data,
                                                    pick,
                                                );
                                                if (input) start(input);
                                            }}
                                        />
                                    )}
                                </>
                            ))}

                        {repoNotAdded && (
                            <div className="rounded-lg border border-dashed border-ink px-4 py-3">
                                <p className="text-[13px]">
                                    grsp doesn't have{" "}
                                    <span className="font-mono text-[12.5px]">
                                        {repoNotAdded.owner}/{repoNotAdded.name}
                                    </span>{" "}
                                    yet.
                                </p>
                                <p className="mt-1 text-xs text-text-3">
                                    {cloneRepo.isPending
                                        ? "Cloning. Large repositories can take a minute."
                                        : "It can clone a read-only copy for you, or use a clone you already have."}
                                </p>
                                <div className="mt-3 flex items-center gap-2">
                                    <Button
                                        size="sm"
                                        disabled={cloneRepo.isPending}
                                        onClick={() =>
                                            handleClone(repoNotAdded)
                                        }
                                    >
                                        {cloneRepo.isPending
                                            ? "Cloning…"
                                            : "Clone it"}
                                    </Button>
                                    <Button
                                        size="sm"
                                        variant="outline"
                                        disabled={cloneRepo.isPending}
                                        onClick={() => setIsAddFolderOpen(true)}
                                    >
                                        I already have it
                                    </Button>
                                </div>
                            </div>
                        )}

                        {error && (
                            <Alert variant="destructive">
                                <AlertDescription className="select-text">
                                    {error}
                                </AlertDescription>
                            </Alert>
                        )}
                    </div>
                </DialogContent>
            </Dialog>

            <AddFolderDialog
                open={isAddFolderOpen}
                onOpenChange={setIsAddFolderOpen}
                description={
                    repoNotAdded
                        ? `Choose your local clone of ${repoNotAdded.owner}/${repoNotAdded.name}.`
                        : undefined
                }
                onSuccess={(added) => {
                    setRepoId(added.id);
                    // Came here from a pasted URL: try it again now that the
                    // folder exists.
                    if (repoNotAdded && mode === "url" && trimmedUrl) {
                        start({ kind: "url", url: trimmedUrl });
                    }
                }}
            />
        </>
    );
}

/** The repo's default branch when it is in the list, otherwise nothing. */
function defaultBaseBranch(
    defaultBranch: string,
    all: string[],
): string | undefined {
    if (all.includes(defaultBranch)) return defaultBranch;
    return all.find((b) => b === `origin/${defaultBranch}`);
}

interface BranchSelectProps {
    label: string;
    placeholder: string;
    value: string | undefined;
    onValueChange: (value: string) => void;
    local: string[] | undefined;
    remote: string[] | undefined;
    disabled?: boolean;
}

function BranchSelect({
    label,
    placeholder,
    value,
    onValueChange,
    local,
    remote,
    disabled,
}: BranchSelectProps) {
    return (
        <div className="min-w-0">
            <label className="section-label mb-2 block">{label}</label>
            <Select
                // Radix Select treats "" as "no value" and shows the placeholder.
                value={value ?? ""}
                onValueChange={onValueChange}
                disabled={disabled}
            >
                <SelectTrigger className="h-10 font-mono text-[12.5px]">
                    <SelectValue placeholder={placeholder} />
                </SelectTrigger>
                <SelectContent className="max-h-72">
                    {local && local.length > 0 && (
                        <SelectGroup>
                            <SelectLabel className="section-label py-2">
                                Local
                            </SelectLabel>
                            {local.map((b) => (
                                <SelectItem
                                    key={`local-${b}`}
                                    value={b}
                                    className="font-mono text-[12.5px]"
                                >
                                    {b}
                                </SelectItem>
                            ))}
                        </SelectGroup>
                    )}
                    {remote && remote.length > 0 && (
                        <SelectGroup>
                            <SelectLabel className="section-label py-2">
                                Remote
                            </SelectLabel>
                            {remote.map((b) => (
                                <SelectItem
                                    key={`remote-${b}`}
                                    value={b}
                                    className="font-mono text-[12.5px]"
                                >
                                    {b}
                                </SelectItem>
                            ))}
                        </SelectGroup>
                    )}
                </SelectContent>
            </Select>
        </div>
    );
}
