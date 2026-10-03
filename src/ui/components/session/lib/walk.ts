import type {
    CodeRef,
    WalkBlock,
    WalkthroughResult,
    WhatIfOption,
} from "@core/types/grsp";

/** One block on the current path, with its position before filtering. */
export interface WalkStep {
    block: WalkBlock;
    /** 1-based position on the full path; stable when blocks are hidden. */
    number: number;
    /** The connector to the next step failed the edge spot-check. */
    unconfirmedNext: boolean;
}

function isTouched(block: WalkBlock): boolean {
    return block.status !== "unchanged";
}

/**
 * The option a what-if starts on: the one whose path runs through the most
 * blocks this PR touches (ties go to the first).
 */
export function defaultOptionIndex(result: WalkthroughResult): number {
    const options = result.whatIf?.options ?? [];
    const byId = new Map(result.blocks.map((b) => [b.id, b]));
    let best = 0;
    let bestScore = -1;
    options.forEach((option, index) => {
        const score = option.path.filter((id) => {
            const block = byId.get(id);
            return block !== undefined && isTouched(block);
        }).length;
        if (score > bestScore) {
            best = index;
            bestScore = score;
        }
    });
    return best;
}

export function selectedOption(
    result: WalkthroughResult,
    optionIndex: number,
): WhatIfOption | undefined {
    const options = result.whatIf?.options;
    if (!options || options.length === 0) return undefined;
    return options[Math.min(Math.max(optionIndex, 0), options.length - 1)];
}

/**
 * The ordered steps for an input. Unknown block ids are skipped; hiding
 * unchanged blocks filters the list but keeps each block's number.
 */
export function routeSteps(
    result: WalkthroughResult,
    optionIndex: number,
    showUnchanged: boolean,
): WalkStep[] {
    const byId = new Map(result.blocks.map((b) => [b.id, b]));
    const ids = selectedOption(result, optionIndex)?.path ?? result.path;
    const blocks = ids.flatMap((id) => {
        const block = byId.get(id);
        return block ? [block] : [];
    });
    const steps = blocks.map((block, index) => {
        const next = blocks[index + 1];
        return {
            block,
            number: index + 1,
            unconfirmedNext:
                next !== undefined && block.unconfirmedEdges.includes(next.id),
        };
    });
    return showUnchanged ? steps : steps.filter((s) => isTouched(s.block));
}

export function clampStep(index: number, count: number): number {
    if (count <= 0) return 0;
    return Math.min(Math.max(index, 0), count - 1);
}

/** The note for a block under the selected input. */
export function noteFor(
    block: WalkBlock,
    option: WhatIfOption | undefined,
): string {
    return option?.notes?.[block.id] ?? block.note;
}

/** Which branch of a block's decision the selected input takes, if known. */
export function takenBranch(
    block: WalkBlock,
    option: WhatIfOption | undefined,
): "yes" | "no" | undefined {
    if (!block.decision) return undefined;
    return option?.taken?.[block.id];
}

function refHitsBlock(ref: CodeRef, block: WalkBlock): boolean {
    if (ref.file !== block.ref.file) return false;
    const start = Math.min(block.ref.startLine, block.excerpt.startLine);
    const end = Math.max(
        block.ref.endLine ?? block.ref.startLine,
        block.excerpt.endLine,
    );
    return ref.startLine >= start && ref.startLine <= end;
}

/**
 * Where "Walk through it" lands: the step a mismatch's refs point at,
 * preferring a not-covered block, else the first step.
 */
export function mostRelevantStep(steps: WalkStep[], refs: CodeRef[]): number {
    const hits = steps
        .map((step, index) => ({ step, index }))
        .filter(({ step }) => refs.some((r) => refHitsBlock(r, step.block)));
    const gap = hits.find(({ step }) => step.block.status === "not_covered");
    return gap?.index ?? hits[0]?.index ?? 0;
}
