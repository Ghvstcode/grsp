import { cn } from "@ui/lib/utils";

interface LogoMarkProps {
    size?: number;
    className?: string;
}

type Dot = readonly [cx: number, cy: number, r: number];

const grid = (positions: number[], small: number, big: number): Dot[] =>
    positions.flatMap((cy, row) =>
        positions.map(
            (cx, col): Dot => [cx, cy, row === 1 && col === 2 ? big : small],
        ),
    );

/**
 * Three optical sizes, because nine dots blur into a grey square when small.
 * Source of truth: design/brand/build.mjs.
 */
const REGULAR = grid([28, 60, 92], 6.5, 17);
const SMALL = grid([26, 60, 94], 8.5, 20);
const TINY: Dot[] = [
    [26, 22, 11],
    [26, 60, 11],
    [26, 98, 11],
    [80, 60, 31],
];

function dotsFor(size: number): Dot[] {
    if (size < 20) return TINY;
    if (size < 48) return SMALL;
    return REGULAR;
}

/**
 * The grsp mark: a field of dots with one grown large. Nine changes, one of
 * them matters.
 */
export function LogoMark({ size = 16, className }: LogoMarkProps) {
    return (
        <svg
            width={size}
            height={size}
            viewBox="0 0 120 120"
            fill="currentColor"
            xmlns="http://www.w3.org/2000/svg"
            className={cn("shrink-0", className)}
            aria-hidden="true"
        >
            {dotsFor(size).map(([cx, cy, r]) => (
                <circle key={`${cx}-${cy}`} cx={cx} cy={cy} r={r} />
            ))}
        </svg>
    );
}
