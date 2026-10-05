import { describe, expect, it } from "vitest";
import { PR_DESCRIPTION } from "@core/fixtures/scenario";
import {
    authorName,
    cleanGithubMarkdown,
    commentPreview,
    descriptionPreview,
    isBot,
    initialOf,
    isLongComment,
    plural,
    relativeTime,
    shortPath,
    splitSuggestions,
    wordCount,
    wordCountLabel,
} from "./text";

describe("isLongComment", () => {
    it("clamps only comments over ~200 characters", () => {
        expect(isLongComment("Done.")).toBe(false);
        expect(isLongComment("x".repeat(200))).toBe(false);
        expect(isLongComment("x".repeat(201))).toBe(true);
    });
});

describe("splitSuggestions", () => {
    it("separates prose from suggestion blocks", () => {
        const body =
            "What about delegates?\n\n```suggestion\n    if a in b:\n```\nThanks";
        expect(splitSuggestions(body)).toEqual([
            { kind: "text", text: "What about delegates?" },
            { kind: "suggestion", text: "    if a in b:" },
            { kind: "text", text: "Thanks" },
        ]);
    });

    it("keeps multi-line suggestions and plain comments intact", () => {
        expect(splitSuggestions("```suggestion\na\nb\n```")).toEqual([
            { kind: "suggestion", text: "a\nb" },
        ]);
        expect(splitSuggestions("Fine by me.")).toEqual([
            { kind: "text", text: "Fine by me." },
        ]);
        expect(splitSuggestions("")).toEqual([]);
    });
});

describe("descriptionPreview", () => {
    it("drops headings and list markers and joins paragraphs", () => {
        const preview = descriptionPreview(PR_DESCRIPTION);
        expect(preview.startsWith("Finance asked for a four-eyes check")).toBe(
            true,
        );
        expect(preview).not.toMatch(/#|Context|^- /);
        expect(preview).toContain("order_approvals flag");
    });

    it("is empty for an empty description", () => {
        expect(descriptionPreview("  \n")).toBe("");
        expect(wordCount("")).toBe(0);
    });
});

describe("wordCountLabel", () => {
    it("rounds long descriptions and counts short ones exactly", () => {
        expect(wordCountLabel("one two three")).toBe("3 words");
        expect(wordCountLabel("word")).toBe("1 word");
        expect(wordCountLabel(Array(318).fill("w").join(" "))).toBe(
            "~320 words",
        );
    });
});

describe("relativeTime", () => {
    const now = Date.parse("2026-10-03T12:00:00Z");
    it("formats hours and days like GitHub", () => {
        expect(relativeTime("2026-10-03T11:59:50Z", now)).toBe("just now");
        expect(relativeTime("2026-10-03T11:20:00Z", now)).toBe("40m ago");
        expect(relativeTime("2026-10-02T16:00:00Z", now)).toBe("20h ago");
        expect(relativeTime("2026-10-01T12:00:00Z", now)).toBe("2d ago");
        expect(relativeTime("not a date", now)).toBe("");
    });
});

describe("small helpers", () => {
    it("pluralises and takes initials", () => {
        expect(plural(1, "comment")).toBe("1 comment");
        expect(plural(3, "person", "people")).toBe("3 people");
        expect(initialOf("@dayo.b")).toBe("D");
    });
});

describe("cleanGithubMarkdown", () => {
    it("drops hidden markers and unwraps details blocks", () => {
        const body = [
            "<!-- linear-linkback -->",
            "<details>",
            '<summary><a href="https://linear.app/x/SHP-1083">SHP-1083 Add documents</a></summary>',
            "<p>Body text</p>",
            "</details>",
        ].join("\n");
        expect(cleanGithubMarkdown(body)).toBe(
            "**[SHP-1083 Add documents](https://linear.app/x/SHP-1083)**\n\nBody text",
        );
    });

    it("keeps markdown and leaves code untouched", () => {
        const body =
            "<!-- smart-e2e-selection -->\n## Smoke tier selected\n\nUse `<details>` here.\n\n```html\n<!-- kept -->\n<b>kept</b>\n```";
        expect(cleanGithubMarkdown(body)).toBe(
            "## Smoke tier selected\n\nUse `<details>` here.\n\n```html\n<!-- kept -->\n<b>kept</b>\n```",
        );
    });

    it("converts simple inline tags and entities", () => {
        expect(
            cleanGithubMarkdown(
                "<b>Note</b>: a &lt; b<br>next <sub>small</sub>",
            ),
        ).toBe("**Note**: a < b\nnext small");
    });
});

describe("commentPreview", () => {
    it("is plain text with no markup", () => {
        expect(
            commentPreview(
                "<!-- auto-generated -->\n<details><summary>Summary</summary>\n\n- one\n- two\n</details>",
            ),
        ).toBe("Summary one two");
    });
});

describe("isBot / authorName", () => {
    it("recognises GitHub app accounts", () => {
        expect(isBot("coderabbitai[bot]")).toBe(true);
        expect(isBot("kemi.a")).toBe(false);
        expect(authorName("github-actions[bot]")).toBe("github-actions");
    });
});

describe("shortPath", () => {
    it("leaves short paths alone", () => {
        expect(shortPath("orders/policies.py")).toBe("orders/policies.py");
    });

    it("keeps the end of long paths", () => {
        expect(
            shortPath(
                "spa-frontend/src/views/app/cases/case-detail/CaseDetailDocumentsView.vue",
            ),
        ).toBe("…/case-detail/CaseDetailDocumentsView.vue");
    });

    it("always keeps the file name, however long", () => {
        const name = "a".repeat(60) + ".ts";
        expect(shortPath(`src/${name}`)).toBe(`…/${name}`);
    });
});
