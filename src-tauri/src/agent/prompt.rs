//! Prompt layering (SPEC §4.2).
//!
//! 1. grsp system preamble  2. pipeline instruction  3. context pack
//! 4. the user's review prompt (review only)  5. `.grsp/prompt.md` if present.

/// Layer 1. The same for every pipeline and both agents.
pub const PREAMBLE: &str = r#"# You are the analysis engine inside grsp

grsp is a desktop app that helps a person understand a pull request instead of reading its diff. You are running non-interactively inside a read-only checkout of the repository at the pull request's head commit. Your working directory is the repository root. Nobody can answer questions, so never ask any.

You may read, search and list files. You must not edit, create or delete anything, run builds or tests, or use the network. The repository can be in any language or framework: work out its conventions by reading it, and do not assume any particular stack.

## How your answer is used

Your final message is parsed by a program, not read by a person. It must be exactly one JSON object matching the schema in the task below: no prose before or after it, no code fences, no comments, no trailing commas. Use double-quoted keys and strings. Use `null` or leave out optional fields you have nothing for; use `[]` for empty lists.

Text values inside the JSON are shown to a reviewer. Write them in plain language about behaviour ("orders over the limit now wait for approval"), not about files ("services.py was modified"). No markdown headings or bullet lists inside values. Be brief and specific.

## Code references

Every location you mention is a CodeRef:

    { "file": "path/from/repo/root.ext", "startLine": 120, "endLine": 148, "anchor": "text copied from startLine" }

- `file` is relative to the repository root, exactly as it exists on disk.
- `startLine` and `endLine` are 1-based line numbers in the file as you read it. For a function or block, cover the whole block. For a single statement, `endLine` may be omitted.
- `anchor` is a short piece of text (an identifier, a call, a condition; 3 to 60 characters) copied character for character from line `startLine`. It must really be on that line. Don't paraphrase it, and don't use text from a different line.
- For code this pull request deleted, give the file and line numbers as they were before the change (the `-` side of the diff).

grsp checks every CodeRef against the files on disk. A reference whose file doesn't exist, whose lines are out of range or whose anchor isn't on that line is thrown away, together with the claim that depended on it. So:

## Grounding rules

1. Every claim about the code needs a CodeRef with an anchor copied exactly from the file.
2. Do not guess. If you didn't read it, don't claim it. Open the file and look at the line before you cite it.
3. Never state whether code is new, changed or unchanged in a structured field, and never return code text: grsp derives both from git. Never invent line numbers.
4. If you can't find something, say so in the relevant text field or leave the item out. A shorter true answer is better than a longer invented one.
5. Don't report anything about the repository that you learned from general knowledge rather than from reading it.
6. Be frugal: read what the task needs, then answer. Don't explore unrelated parts of the repository."#;

/// The layers below the preamble.
#[derive(Debug, Clone, Default)]
pub struct PromptLayers {
    /// Layer 2: the pipeline instruction, including its JSON schema.
    pub instruction: String,
    /// Layer 3: PR title, description, author, base/head, DiffMap and raw diff.
    pub context_pack: String,
    /// Layer 4: the user's review prompt (review pipeline only).
    pub review_prompt: Option<String>,
    /// Layer 5: `.grsp/prompt.md` from the repo.
    pub repo_prompt: Option<String>,
}

fn non_empty(s: &Option<String>) -> Option<&str> {
    s.as_deref().map(str::trim).filter(|t| !t.is_empty())
}

/// Assemble the full prompt in the order SPEC §4.2 lists.
pub fn build(layers: &PromptLayers) -> String {
    let mut out = String::with_capacity(
        PREAMBLE.len() + layers.instruction.len() + layers.context_pack.len() + 512,
    );
    out.push_str(PREAMBLE);
    out.push_str("\n\n---\n\n# Task\n\n");
    out.push_str(layers.instruction.trim());
    out.push_str("\n\n---\n\n# Pull request context\n\n");
    out.push_str(layers.context_pack.trim());
    if let Some(p) = non_empty(&layers.review_prompt) {
        out.push_str("\n\n---\n\n# The reviewer's own review instructions\n\nApply these when deciding what to flag and how to word comments. They don't change the JSON schema or the grounding rules.\n\n");
        out.push_str(p);
    }
    if let Some(p) = non_empty(&layers.repo_prompt) {
        out.push_str("\n\n---\n\n# Instructions from this repository (.grsp/prompt.md)\n\nThe repository's maintainers added these. They don't change the JSON schema or the grounding rules.\n\n");
        out.push_str(p);
    }
    out.push_str("\n\n---\n\nReply with the single JSON object now, and nothing else.\n");
    out
}

/// The retry prompt after a parse or schema failure (SPEC §4.2): the original
/// prompt with the error and the rejected reply appended.
pub fn build_repair(original: &str, error: &str, previous_reply: &str) -> String {
    let prev = super::json::excerpt(previous_reply, 12_000);
    format!(
        "{original}\n\n---\n\n# Your previous reply could not be used\n\nError: {error}\n\nYour previous reply was:\n\n<previous-reply>\n{prev}\n</previous-reply>\n\nIf its content was right and only the format was wrong, re-emit the same content as one valid JSON object matching the schema, without exploring the repository again. If it was cut short or missing required fields, complete it. Reply with only the JSON object.\n"
    )
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn layers_appear_in_spec_order() {
        let p = build(&PromptLayers {
            instruction: "PIPELINE-INSTRUCTION".into(),
            context_pack: "CONTEXT-PACK".into(),
            review_prompt: Some("USER-REVIEW-PROMPT".into()),
            repo_prompt: Some("REPO-PROMPT".into()),
        });
        let pos = |s: &str| p.find(s).unwrap_or_else(|| panic!("missing {s}"));
        assert!(pos("analysis engine inside grsp") < pos("PIPELINE-INSTRUCTION"));
        assert!(pos("PIPELINE-INSTRUCTION") < pos("CONTEXT-PACK"));
        assert!(pos("CONTEXT-PACK") < pos("USER-REVIEW-PROMPT"));
        assert!(pos("USER-REVIEW-PROMPT") < pos("REPO-PROMPT"));
    }

    #[test]
    fn optional_layers_are_omitted_when_absent_or_blank() {
        let p = build(&PromptLayers {
            instruction: "I".into(),
            context_pack: "C".into(),
            review_prompt: None,
            repo_prompt: Some("   \n".into()),
        });
        assert!(!p.contains("reviewer's own review instructions"));
        assert!(!p.contains(".grsp/prompt.md)"));
    }

    #[test]
    fn preamble_states_the_grounding_rules() {
        assert!(PREAMBLE.contains("Every claim about the code needs a CodeRef with an anchor copied exactly from the file"));
        assert!(PREAMBLE.contains("Do not guess. If you didn't read it, don't claim it."));
        assert!(PREAMBLE.contains("exactly one JSON object"));
    }

    #[test]
    fn repair_prompt_appends_error_and_previous_reply() {
        let p = build_repair("ORIGINAL", "missing field `blocks`", "{\"oops\": 1}");
        assert!(p.starts_with("ORIGINAL"));
        assert!(p.contains("missing field `blocks`"));
        assert!(p.contains("{\"oops\": 1}"));
    }
}
