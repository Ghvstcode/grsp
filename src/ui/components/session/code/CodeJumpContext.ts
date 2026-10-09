import { createContext, useContext } from "react";

/** A place in the Code tab: a file, optionally one of its lines. */
export interface CodeTarget {
    file: string;
    line?: number;
    /** `old` = the version before the change. Defaults to `new`. */
    side?: "old" | "new";
}

/**
 * Opens the Code tab at a target. Provided by the session view; undefined
 * where there is no Code tab to jump to (previews, tests).
 */
export const CodeJumpContext = createContext<
    ((target: CodeTarget) => void) | undefined
>(undefined);

export function useCodeJump() {
    return useContext(CodeJumpContext);
}
