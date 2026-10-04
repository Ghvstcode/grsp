// Generates the grsp brand SVGs and the 1024px app-icon PNG that
// `pnpm tauri icon` turns into every platform size.
// Run: node design/brand/build.mjs (run `pnpm install` in web/ first).
import { writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const here = dirname(fileURLToPath(import.meta.url));
// sharp ships with Next, so resolve it from there rather than adding a dep.
const webRequire = createRequire(join(here, "../../web/package.json"));
const sharp = createRequire(webRequire.resolve("next/package.json"))("sharp");

/**
 * The mark: a 3×3 field of dots with one grown large ("nine changes, one of
 * them matters"). Three optical sizes, because nine dots blur into a grey
 * square when small:
 *   regular  ≥ 48px  the full grid
 *   small    20–47px the full grid with heavier small dots
 *   tiny     < 20px  one column of three dots beside the large one
 * Keep in sync with LogoMark.tsx (app) and logo.tsx (web).
 */
export const MARK = {
    regular: [
        ...[28, 60, 92].flatMap((cy) =>
            [28, 60, 92].map((cx) => [
                cx,
                cy,
                cx === 92 && cy === 60 ? 17 : 6.5,
            ]),
        ),
    ],
    small: [
        ...[26, 60, 94].flatMap((cy) =>
            [26, 60, 94].map((cx) => [
                cx,
                cy,
                cx === 94 && cy === 60 ? 20 : 8.5,
            ]),
        ),
    ],
    tiny: [
        [26, 22, 11],
        [26, 60, 11],
        [26, 98, 11],
        [80, 60, 31],
    ],
};

export function markCircles(dots, fill) {
    return dots
        .map(
            ([cx, cy, r]) =>
                `<circle cx="${cx}" cy="${cy}" r="${r}" fill="${fill}"/>`,
        )
        .join("");
}

const svg = (body, size = 120) =>
    `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 120 120" fill="none">${body}</svg>\n`;

const INK = "#0a0a0a";
const PAPER = "#ffffff";

writeFileSync(join(here, "mark.svg"), svg(markCircles(MARK.regular, INK)));
writeFileSync(
    join(here, "mark-small.svg"),
    svg(markCircles(MARK.small, INK), 32),
);
writeFileSync(
    join(here, "mark-tiny.svg"),
    svg(markCircles(MARK.tiny, INK), 16),
);

// macOS app icon: 824px rounded square centred on a 1024px canvas.
const appIcon = `<svg xmlns="http://www.w3.org/2000/svg" width="1024" height="1024" viewBox="0 0 1024 1024" fill="none"><rect x="100" y="100" width="824" height="824" rx="186" fill="${INK}"/><g transform="translate(212 212) scale(5)">${markCircles(MARK.regular, PAPER)}</g></svg>\n`;
writeFileSync(join(here, "app-icon.svg"), appIcon);
await sharp(Buffer.from(appIcon)).png().toFile(join(here, "app-icon.png"));

// Favicon: full-bleed rounded square, small optical size.
const favicon = `<svg xmlns="http://www.w3.org/2000/svg" width="32" height="32" viewBox="0 0 120 120" fill="none"><rect width="120" height="120" rx="26" fill="${INK}"/><g transform="translate(15 15) scale(0.75)">${markCircles(MARK.tiny, PAPER)}</g></svg>\n`;
writeFileSync(join(here, "favicon.svg"), favicon);

// Size tests, for eyeballing.
if (process.argv.includes("--test")) {
    const out = process.argv[process.argv.indexOf("--test") + 1];
    const tiles = [];
    let x = 20;
    for (const [variant, px] of [
        ["tiny", 12],
        ["tiny", 16],
        ["small", 20],
        ["small", 24],
        ["small", 32],
        ["regular", 48],
        ["regular", 64],
    ]) {
        const s = px / 120;
        tiles.push(
            `<g transform="translate(${x} 20) scale(${s})">${markCircles(MARK[variant], INK)}</g>`,
        );
        tiles.push(
            `<g transform="translate(${x} 110)"><rect width="${px}" height="${px}" rx="${px * 0.22}" fill="${INK}"/><g transform="translate(${px * 0.125} ${px * 0.125}) scale(${s * 0.75})">${markCircles(MARK[variant], PAPER)}</g></g>`,
        );
        x += px + 30;
    }
    const sheet = `<svg xmlns="http://www.w3.org/2000/svg" width="${x}" height="200" viewBox="0 0 ${x} 200"><rect width="100%" height="100%" fill="#fff"/>${tiles.join("")}</svg>`;
    await sharp(Buffer.from(sheet), { density: 72 })
        .png()
        .toFile(join(out, "sizes-1x.png"));
    await sharp(Buffer.from(sheet), { density: 72 })
        .resize({ width: x * 4, kernel: "nearest" })
        .png()
        .toFile(join(out, "sizes-4x.png"));
}
