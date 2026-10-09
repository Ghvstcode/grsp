import { useCallback, useState } from "react";
import type { CodeRef } from "@core/types/grsp";

export interface WalkState {
    /** Selected entry point; undefined = the first one. */
    entryId?: string;
    /** Index into the current path's visible steps. */
    step: number;
    /** Chosen what-if option per entry point; absent = the default. */
    options: Record<string, number>;
    showCode: boolean;
    /** Refs to land on once that entry point's walkthrough has loaded. */
    jump?: { entryId: string; refs: CodeRef[] };
    /** A block to land on (from a note pinned to it), same idea. */
    jumpBlock?: { entryId: string; blockId: string };
}

/**
 * Walkthrough position. It lives in the session view rather than the tab so
 * switching to Gist or Review and back doesn't lose the reader's place.
 */
export function useWalkState() {
    const [state, setState] = useState<WalkState>({
        step: 0,
        options: {},
        showCode: true,
    });

    const openEntry = useCallback((entryId: string, refs?: CodeRef[]) => {
        setState((s) => ({
            ...s,
            entryId,
            step: 0,
            jump: refs && refs.length > 0 ? { entryId, refs } : undefined,
            jumpBlock: undefined,
        }));
    }, []);
    const openBlock = useCallback((entryId: string, blockId: string) => {
        setState((s) => ({
            ...s,
            entryId,
            step: 0,
            jump: undefined,
            jumpBlock: { entryId, blockId },
        }));
    }, []);
    const setStep = useCallback((step: number) => {
        setState((s) => ({
            ...s,
            step,
            jump: undefined,
            jumpBlock: undefined,
        }));
    }, []);
    const setOption = useCallback((entryId: string, option: number) => {
        setState((s) => ({
            ...s,
            options: { ...s.options, [entryId]: option },
        }));
    }, []);
    const toggleCode = useCallback(() => {
        setState((s) => ({ ...s, showCode: !s.showCode }));
    }, []);

    return { state, openEntry, openBlock, setStep, setOption, toggleCode };
}

export type WalkController = ReturnType<typeof useWalkState>;
