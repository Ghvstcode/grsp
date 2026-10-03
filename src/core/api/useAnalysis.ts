import { useEffect } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { call, onGrspEvent } from "@core/services/client";
import {
    GRSP_EVENTS,
    type Analysis,
    type AnalysisEvent,
    type AnalysisKind,
    type DiscoveryResult,
    type DiscussionResult,
    type QuestionsResult,
    type ReviewResult,
    type WalkthroughResult,
} from "@core/types/grsp";
import { sessionKeys } from "@core/api/useSession";

/** A session's analyses, indexed by kind with their result types. */
export interface SessionAnalyses {
    discovery?: Analysis<DiscoveryResult>;
    questions?: Analysis<QuestionsResult>;
    discussion?: Analysis<DiscussionResult>;
    review?: Analysis<ReviewResult>;
    /** By entry point id. */
    walkthroughs: Record<string, Analysis<WalkthroughResult>>;
}

const WALKTHROUGH_PREFIX = "walkthrough:";

export function walkthroughKind(entryPointId: string): AnalysisKind {
    return `${WALKTHROUGH_PREFIX}${entryPointId}`;
}

function typed<T>(analysis: Analysis): Analysis<T> {
    // The contract fixes the result shape per kind (grsp.ts); the list comes
    // back untyped because one command returns every kind.
    return analysis as Analysis<T>;
}

export function indexAnalyses(list: Analysis[]): SessionAnalyses {
    const out: SessionAnalyses = { walkthroughs: {} };
    for (const analysis of list) {
        const kind = analysis.kind;
        if (kind === "discovery") out.discovery = typed(analysis);
        else if (kind === "questions") out.questions = typed(analysis);
        else if (kind === "discussion") out.discussion = typed(analysis);
        else if (kind === "review") out.review = typed(analysis);
        else {
            out.walkthroughs[kind.slice(WALKTHROUGH_PREFIX.length)] =
                typed(analysis);
        }
    }
    return out;
}

export interface AnalysisPatch {
    /** The cached list with the event applied. */
    list: Analysis[];
    /** The status changed, so the row (result, error) must be refetched. */
    refetch: boolean;
}

/** Apply a progress / status event to the cached list (SPEC §4.4). */
export function applyAnalysisEvent(
    list: Analysis[],
    event: AnalysisEvent,
): AnalysisPatch {
    const current = list.find((a) => a.kind === event.kind);
    if (!current) {
        return {
            list: [
                ...list,
                {
                    sessionId: event.sessionId,
                    kind: event.kind,
                    headSha: "",
                    status: event.status,
                    progress: event.progress,
                },
            ],
            refetch: event.status === "done" || event.status === "error",
        };
    }
    const settled = event.status === "done" || event.status === "error";
    return {
        list: list.map((a) =>
            a.kind === event.kind
                ? {
                      ...a,
                      // A settled row keeps its old status until the refetch
                      // brings the result with it.
                      status: settled ? a.status : event.status,
                      progress: event.progress ?? a.progress,
                      error: settled ? a.error : undefined,
                  }
                : a,
        ),
        refetch: settled || current.status !== event.status,
    };
}

function analysesQuery(sessionId: string) {
    return {
        queryKey: sessionKeys.analyses(sessionId),
        queryFn: () => call("analysis_list", { sessionId }),
        // Never re-run or refetch on focus; events drive updates (SPEC §4.5).
        refetchOnWindowFocus: false,
        staleTime: Infinity,
    };
}

/** Read-only view of the cache, for components below the session view. */
export function useAnalysesQuery(sessionId: string) {
    return useQuery({ ...analysesQuery(sessionId), select: indexAnalyses });
}

/**
 * Analyses by kind with live progress. Subscribes to `grsp://analysis`, so
 * mount it once per session view and read with `useAnalysesQuery` elsewhere.
 */
export function useAnalyses(sessionId: string) {
    const queryClient = useQueryClient();

    useEffect(() => {
        const key = sessionKeys.analyses(sessionId);
        return onGrspEvent<AnalysisEvent>(GRSP_EVENTS.analysis, (event) => {
            if (event.sessionId !== sessionId) return;
            const cached = queryClient.getQueryData<Analysis[]>(key);
            const patch = applyAnalysisEvent(cached ?? [], event);
            if (cached) queryClient.setQueryData(key, patch.list);
            if (patch.refetch || !cached) {
                void queryClient.invalidateQueries({ queryKey: key });
                // The agent-pass count in the footer moved too.
                void queryClient.invalidateQueries({
                    queryKey: sessionKeys.session(sessionId),
                });
            }
        });
    }, [sessionId, queryClient]);

    return useAnalysesQuery(sessionId);
}

/** Start, retry or re-run one analysis. */
export function useRunAnalysis(sessionId: string) {
    const queryClient = useQueryClient();
    const key = sessionKeys.analyses(sessionId);
    return useMutation({
        mutationFn: (kind: AnalysisKind) =>
            call("analysis_run", { sessionId, kind }),
        onMutate: (kind) => {
            const cached = queryClient.getQueryData<Analysis[]>(key);
            if (!cached) return;
            const patch = applyAnalysisEvent(cached, {
                sessionId,
                kind,
                status: "running",
                progress: "Starting the agent",
            });
            queryClient.setQueryData(key, patch.list);
        },
        onError: () => {
            void queryClient.invalidateQueries({ queryKey: key });
        },
    });
}

export function useCancelAnalysis(sessionId: string) {
    const queryClient = useQueryClient();
    return useMutation({
        mutationFn: (kind: AnalysisKind) =>
            call("analysis_cancel", { sessionId, kind }),
        onSettled: () => {
            void queryClient.invalidateQueries({
                queryKey: sessionKeys.analyses(sessionId),
            });
        },
    });
}

/** Opening a question marks it checked, and that persists (SPEC §5.2). */
export function useSetQuestionOpened(sessionId: string) {
    const queryClient = useQueryClient();
    const key = sessionKeys.analyses(sessionId);
    return useMutation({
        mutationFn: (questionId: string) =>
            call("question_set_opened", { sessionId, questionId }),
        onMutate: (questionId) => {
            const cached = queryClient.getQueryData<Analysis[]>(key);
            if (!cached) return;
            queryClient.setQueryData(
                key,
                cached.map((analysis) => {
                    if (analysis.kind !== "questions" || !analysis.result) {
                        return analysis;
                    }
                    const { result } = typed<QuestionsResult>(analysis);
                    if (!result) return analysis;
                    return {
                        ...analysis,
                        result: {
                            questions: result.questions.map((q) =>
                                q.id === questionId
                                    ? { ...q, opened: true }
                                    : q,
                            ),
                        },
                    };
                }),
            );
        },
        onError: () => {
            void queryClient.invalidateQueries({ queryKey: key });
        },
    });
}

/** "Show all" on a capped code block. */
export function useExcerpt(
    sessionId: string,
    range: { file: string; startLine: number; endLine: number } | undefined,
) {
    return useQuery({
        queryKey: [
            "grsp",
            "excerpt",
            sessionId,
            range?.file,
            range?.startLine,
            range?.endLine,
        ],
        queryFn: () => {
            if (!range) throw new Error("No range to read.");
            return call("excerpt_read", { sessionId, ...range });
        },
        enabled: range !== undefined,
        refetchOnWindowFocus: false,
        staleTime: Infinity,
    });
}
