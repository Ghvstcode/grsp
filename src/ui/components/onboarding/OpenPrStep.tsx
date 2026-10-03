import { useState } from "react";
import { Button } from "@ui/components/ui/button";
import { Alert, AlertDescription } from "@ui/components/ui/alert";
import { useOpenPrs } from "@core/api/useRepos";
import { useCreateSession } from "@core/api/useSessions";
import { errorMessage } from "@core/utils/sessions";
import type { Repo } from "@core/types/grsp";
import { PrList } from "@ui/components/sidebar/PrList";

interface OpenPrStepProps {
    repo: Repo;
    onNext: () => void;
    /** Called when a review session was created from a PR. */
    onOpened: () => void;
}

/** Optional: start the first review straight from the new repo's open PRs. */
export function OpenPrStep({ repo, onNext, onOpened }: OpenPrStepProps) {
    const openPrs = useOpenPrs(repo.id);
    const createSession = useCreateSession();
    const [pendingNumber, setPendingNumber] = useState<number | undefined>(
        undefined,
    );
    const [error, setError] = useState<string | undefined>(undefined);

    return (
        <div className="animate-fade-in-up">
            <h2 className="text-2xl font-bold tracking-tight text-foreground text-center mb-1">
                Open a pull request
            </h2>
            <p className="text-sm text-muted-foreground text-center mb-6">
                Pick one from{" "}
                <span className="font-mono text-[13px]">{repo.name}</span> to
                start your first review, or do it later.
            </p>

            <PrList
                className="bg-card text-left animate-fade-in-up delay-200"
                prs={openPrs.data}
                isLoading={openPrs.isLoading}
                error={openPrs.error}
                onRetry={() => void openPrs.refetch()}
                pendingNumber={pendingNumber}
                onPick={(pr) => {
                    setError(undefined);
                    setPendingNumber(pr.number);
                    createSession.mutate(
                        { kind: "pr", repoId: repo.id, number: pr.number },
                        {
                            onSuccess: () => {
                                onOpened();
                                onNext();
                            },
                            onError: (err: unknown) =>
                                setError(errorMessage(err)),
                            onSettled: () => setPendingNumber(undefined),
                        },
                    );
                }}
            />

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
                    onClick={onNext}
                    disabled={createSession.isPending}
                    className="text-xs text-muted-foreground/50 hover:text-muted-foreground"
                >
                    Skip for now
                </Button>
            </div>
        </div>
    );
}
