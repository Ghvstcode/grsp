/**
 * Debug switch for fixture states. Add `?fx=stale,ownpr` to the URL (kept in
 * sessionStorage for the tab, so it survives client-side navigation and
 * reloads); `?fx=none` clears it.
 */
export const FIXTURE_VARIANTS = [
    /** The questions section fails; Retry succeeds. */
    "error",
    /** 3 new commits on the PR head: stale bar, stale warning on Review. */
    "stale",
    /** Discovery was sharded: "Large PR: analysed in 4 parts". */
    "large",
    /** The PR has no description. */
    "nodesc",
    /** The PR has no comments. */
    "nodiscussion",
    /** Branch-pair session: no PR number, CI, discussion or posting. */
    "branches",
    /** The viewer wrote the PR: Approve / Request changes are disabled. */
    "ownpr",
    /** Nothing has been analysed yet; sections stream in on open. */
    "fresh",
    /** The session is still preparing when opened. */
    "preparing",
    /** The AI review has already run. */
    "reviewed",
    /** The AI review has run and been posted. */
    "posted",
    /** CI is failing. */
    "cifail",
    /** Neither agent is installed (onboarding / settings). */
    "noagent",
    /** GitHub isn't connected. */
    "nogithub",
    /** Agent passes take about three times longer. */
    "slow",
] as const;

export type FixtureVariant = (typeof FIXTURE_VARIANTS)[number];

const STORAGE_KEY = "grsp:fx";

function isVariant(value: string): value is FixtureVariant {
    return FIXTURE_VARIANTS.some((v) => v === value);
}

export function parseVariants(raw: string | null | undefined) {
    const out = new Set<FixtureVariant>();
    for (const part of (raw ?? "").split(",")) {
        const name = part.trim().toLowerCase();
        if (isVariant(name)) out.add(name);
    }
    return out;
}

/** Variants for this tab, from `?fx=` or the value remembered earlier. */
export function readVariants(): Set<FixtureVariant> {
    if (typeof window === "undefined") return new Set();
    try {
        const fromUrl = new URLSearchParams(window.location.search).get("fx");
        if (fromUrl !== null) {
            if (fromUrl === "" || fromUrl === "none") {
                window.sessionStorage.removeItem(STORAGE_KEY);
                return new Set();
            }
            window.sessionStorage.setItem(STORAGE_KEY, fromUrl);
            return parseVariants(fromUrl);
        }
        return parseVariants(window.sessionStorage.getItem(STORAGE_KEY));
    } catch {
        // sessionStorage can be unavailable (private mode, tests).
        return new Set();
    }
}
