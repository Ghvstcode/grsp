# Changelog — Internal Guide

How the `/changelog` page works and how to add new entries.

## Architecture

```
app/changelog/
  data.ts       # All changelog entries (typed array)
  page.tsx      # Renders the page (static, no client JS)

public/changelog/
  *.png / *.jpg  # Images referenced by entries
```

The page is statically exported at build time (`output: "export"` in next.config.js). No CMS, no API — just a TypeScript array.

## Adding a new release

1. **Drop images** into `public/changelog/`. Use the naming convention `{version}-{slug}.png` (e.g. `0.3.0-dashboard.png`).

2. **Add an entry** at the **top** of the `changelog` array in `app/changelog/data.ts`:

```ts
{
    version: "0.3.0",
    date: "Mar 5th, 2026",
    title: "Short headline for this release",
    description: "One or two sentences summarizing the release.",
    image: {
        src: "/changelog/0.3.0-dashboard.png",
        alt: "Description of the screenshot",
    },
    features: [
        "New thing one",
        "Inline code works with backticks: `someFunction()`",
    ],
    improvements: [
        "Made X faster",
    ],
    fixes: [
        "Fixed bug in Y",
    ],
}
```

3. **Build** to verify: `pnpm build`

## Entry fields

| Field          | Required | Description                                          |
| -------------- | -------- | ---------------------------------------------------- |
| `version`      | Yes      | Semver string (e.g. `"0.3.0"`)                       |
| `date`         | Yes      | Human-readable date (e.g. `"Mar 5th, 2026"`)         |
| `title`        | Yes      | Short headline                                       |
| `description`  | No       | 1-2 sentence summary                                 |
| `image`        | No       | `{ src, alt }` — path relative to `public/`          |
| `features`     | No       | Array of strings (new capabilities)                  |
| `improvements` | No       | Array of strings (enhancements to existing features) |
| `fixes`        | No       | Array of strings (bug fixes)                         |

All string arrays support inline code with backticks (rendered as `<code>` tags).

## Images

- Place in `public/changelog/`
- Referenced as `/changelog/filename.png` (no `public/` prefix)
- Displayed full-width inside a rounded container with a subtle border
- Recommended: 1200px+ wide, PNG or JPG, < 500KB
- Multiple images per entry are not currently supported (add a second `image` field to the type if needed)

## Where it's linked

- Main nav (top bar on homepage + changelog page)
- Footer (homepage + changelog page)
