type Dot = readonly [cx: number, cy: number, r: number];

const grid = (positions: number[], small: number, big: number): Dot[] =>
    positions.flatMap((cy, row) =>
        positions.map(
            (cx, col): Dot => [cx, cy, row === 1 && col === 2 ? big : small],
        ),
    );

// Three optical sizes; source of truth is design/brand/build.mjs.
const REGULAR = grid([28, 60, 92], 6.5, 17);
const SMALL = grid([26, 60, 94], 8.5, 20);
const TINY: Dot[] = [
    [26, 22, 11],
    [26, 60, 11],
    [26, 98, 11],
    [80, 60, 31],
];

/** The grsp mark: a field of dots with one grown large. */
export function Logo({
    size = 20,
    className = "",
}: {
    size?: number;
    className?: string;
}) {
    const dots = size < 20 ? TINY : size < 48 ? SMALL : REGULAR;
    return (
        <svg
            width={size}
            height={size}
            viewBox="0 0 120 120"
            fill="currentColor"
            className={className}
            aria-hidden="true"
        >
            {dots.map(([cx, cy, r]) => (
                <circle key={`${cx}-${cy}`} cx={cx} cy={cy} r={r} />
            ))}
        </svg>
    );
}

/** The wordmark: the dropped "a" is a solid dot. Sized by font-size. */
export function Wordmark({ className = "" }: { className?: string }) {
    return (
        <span
            role="img"
            aria-label="grsp"
            className={`inline-flex items-baseline font-bold tracking-[-0.05em] ${className}`}
        >
            <span aria-hidden="true">gr</span>
            <span
                aria-hidden="true"
                className="mx-[0.05em] inline-block h-[0.42em] w-[0.42em] translate-y-[-0.06em] rounded-full bg-current"
            />
            <span aria-hidden="true">sp</span>
        </span>
    );
}

export const GITHUB_URL = "https://github.com/ghvstcode/grsp";

export function GitHubIcon({ size = 18 }: { size?: number }) {
    return (
        <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor">
            <path d="M12 0C5.37 0 0 5.37 0 12c0 5.31 3.435 9.795 8.205 11.385.6.105.825-.255.825-.57 0-.285-.015-1.23-.015-2.235-3.015.555-3.795-.735-4.035-1.41-.135-.345-.72-1.41-1.23-1.695-.42-.225-1.02-.78-.015-.795.945-.015 1.62.87 1.845 1.23 1.08 1.815 2.805 1.305 3.495.99.105-.78.42-1.305.765-1.605-2.67-.3-5.46-1.335-5.46-5.925 0-1.305.465-2.385 1.23-3.225-.12-.3-.54-1.53.12-3.18 0 0 1.005-.315 3.3 1.23.96-.27 1.98-.405 3-.405s2.04.135 3 .405c2.295-1.56 3.3-1.23 3.3-1.23.66 1.65.24 2.88.12 3.18.765.84 1.23 1.905 1.23 3.225 0 4.605-2.805 5.625-5.475 5.925.435.375.81 1.095.81 2.22 0 1.605-.015 2.895-.015 3.3 0 .315.225.69.825.57A12.02 12.02 0 0024 12c0-6.63-5.37-12-12-12z" />
        </svg>
    );
}
