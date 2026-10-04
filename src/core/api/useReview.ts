import { metrics } from "@core/services/metrics";
import { useCallback, useRef } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { call } from "@core/services/client";
import type {
    Analysis,
    PostReviewInput,
    PostedReview,
    ReviewResult,
    ReviewSession,
} from "@core/types/grsp";
import { sessionKeys } from "@core/api/useSession";
import {
    useAnalysesQuery,
    useCancelAnalysis,
    useRunAnalysis,
} from "@core/api/useAnalysis";

export interface FindingPatch {
    comment?: string;
    included?: boolean;
}

/** Apply a finding edit to the cached analyses list. */
export function patchFinding(
    list: Analysis[],
    findingId: string,
    patch: FindingPatch,
): Analysis[] {
    return list.map((analysis) => {
        if (analysis.kind !== "review" || !analysis.result) return analysis;
        // "review" rows always carry a ReviewResult (grsp.ts).
        const result = analysis.result as ReviewResult;
        return {
            ...analysis,
            result: {
                ...result,
                findings: result.findings.map((finding) =>
                    finding.id === findingId
                        ? {
                              ...finding,
                              comment: patch.comment ?? finding.comment,
                              included: patch.included ?? finding.included,
                          }
                        : finding,
                ),
            },
        };
    });
}

/**
 * The AI review of a session: the analysis, run / cancel, finding edits
 * (optimistic) and posting.
 */
export function useReview(sessionId: string) {
    const queryClient = useQueryClient();
    const analysesKey = sessionKeys.analyses(sessionId);
    const analyses = useAnalysesQuery(sessionId);
    const runAnalysis = useRunAnalysis(sessionId);
    const cancelAnalysis = useCancelAnalysis(sessionId);
    /** Finding edits still on their way; posting waits for them. */
    const pending = useRef(new Set<Promise<unknown>>());

    const github = useQuery({
        queryKey: sessionKeys.githubStatus,
        queryFn: () => call("github_status", {}),
        refetchOnWindowFocus: false,
        staleTime: Infinity,
    });

    const updateFinding = useMutation({
        mutationFn: ({
            findingId,
            ...patch
        }: FindingPatch & { findingId: string }) => {
            const request = call("review_update_finding", {
                sessionId,
                findingId,
                ...patch,
            });
            pending.current.add(request);
            const forget = () => pending.current.delete(request);
            request.then(forget, forget);
            return request;
        },
        onMutate: ({ findingId, ...patch }) => {
            const previous = queryClient.getQueryData<Analysis[]>(analysesKey);
            if (previous) {
                queryClient.setQueryData(
                    analysesKey,
                    patchFinding(previous, findingId, patch),
                );
            }
            return { previous };
        },
        onError: (_error, _variables, context) => {
            if (context?.previous) {
                queryClient.setQueryData(analysesKey, context.previous);
            }
            void queryClient.invalidateQueries({ queryKey: analysesKey });
        },
    });

    const post = useMutation({
        mutationFn: async (input: PostReviewInput) => {
            await Promise.allSettled([...pending.current]);
            return call("review_post", { sessionId, input });
        },
        onSuccess: (postedReview: PostedReview) => {
            metrics.track("review_posted", { event: postedReview.event });
            queryClient.setQueryData<ReviewSession>(
                sessionKeys.session(sessionId),
                (session) => (session ? { ...session, postedReview } : session),
            );
            void queryClient.invalidateQueries({
                queryKey: sessionKeys.session(sessionId),
            });
        },
    });

    const run = useCallback(() => runAnalysis.mutate("review"), [runAnalysis]);
    const cancel = useCallback(
        () => cancelAnalysis.mutate("review"),
        [cancelAnalysis],
    );

    return {
        analysis: analyses.data?.review,
        isLoading: analyses.isLoading,
        run,
        cancel,
        updateFinding,
        post,
        githubLogin: github.data?.authenticated ? github.data.login : undefined,
    };
}
