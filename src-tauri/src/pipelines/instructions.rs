//! The pipeline instructions (prompt layer 2, SPEC §4.2 and §5).
//!
//! These are the product. They are language-agnostic on purpose: nothing here
//! may name a framework, a file layout or a naming convention as if every
//! repository had it. Examples inside schemas are illustrative shapes only.

/// SPEC §5.1. One pass on session open; the backbone of the Gist.
pub const DISCOVERY: &str = r#"## Discovery: what does this pull request change about how the software behaves?

A reviewer is about to open this pull request. Before they read any code they want to know, in plain language: what behaves differently now, which ways into the system are affected, whether the change is applied everywhere it needs to be, and whether the description is accurate. Work that out by reading the repository, not by summarising the diff.

### Required investigation

Do all five steps, in this order. Each one is required even if the pull request looks small.

1. **Read the change.** Read every changed file's hunks (the diff is in the context below) and open the files to read enough of the surrounding code to understand what each hunk does. If a diff in the context is marked as truncated, read the file itself.

2. **Find the entry points whose behaviour this pull request changes.** An entry point is a place where work starts from outside the code: an HTTP route, a UI page or a user action in the UI, a background job, a queue or event consumer, a scheduled task, a CLI command, or a public API of a library. For each piece of changed code, search the repository for its callers, then for their callers, and keep going until you reach entry points. Include UI actions that call a changed endpoint. An entry point belongs in the list only if its observable behaviour changes; if only the timing or ordering of something it already did changes, set `timingOnly` to true.

3. **Look for gaps.** For every write target the pull request changes (a database table or model, a file, a cache key, an external resource, a state or status field), search the whole repository for other code that writes to the same target. For each one you find, decide whether it goes through the new behaviour or bypasses it. Code that writes to the same target but skips the new rule, check or step is a gap. Typical places: bulk or batch paths, importers, admin tools, migrations and backfills, scripts, other services in the same repository, and older duplicate code paths. A gap must be code this pull request did not touch. Only report a gap you have read and can point to.

4. **Compare the description with the code.** List the checkable claims the description makes ("all X now require Y", "no behaviour change for Z", "adds a retry"). For each, decide from the code whether it is true, partly true or false. Report a mismatch only when the description makes a checkable claim that the code contradicts or does not fully implement. A gap from step 3 that contradicts a claim such as "all" or "every" is a mismatch. If the description is empty or makes no checkable claims, report no mismatches.

5. **Note external effects.** Note calls to systems outside this code that the change introduces, removes or moves: payments, email or notifications, HTTP calls to other services, queue or event publishes. Mention them in the behaviour summary and in the affected entry point's `effect`.

### What to return

    {
      "behaviourSummary": "2 to 4 sentences, plain language, about behaviour rather than files",
      "mismatches": [
        { "claim": "what the description says", "reality": "what the code does", "refs": [CodeRef], "entryPointId": "ep3" }
      ],
      "entryPoints": [
        { "id": "ep1", "label": "how a person would name this entry point", "kind": "http | ui | job | consumer | schedule | cli | api | other",
          "ref": CodeRef, "effect": "one line on what changes for this entry point", "risk": "high | medium | low", "timingOnly": false }
      ],
      "gaps": [
        { "ref": CodeRef, "writeTarget": "what is written, in the repository's own words", "explanation": "how this code bypasses the change", "entryPointId": "ep3" }
      ],
      "removed": [ { "ref": CodeRef, "name": "what was removed" } ],
      "askSuggestions": ["three short questions a reviewer would ask about this change"]
    }

Rules for each part:

- `behaviourSummary`: what the software does differently after this change, as a user or operator would notice it. Don't list files.
- `entryPoints`: at most 12, the riskiest first. `id` is `ep1`, `ep2`, … `label` is how the entry point is addressed from outside (a route with its method, a command name, a job name, a screen and action). `ref` points at the handler's definition: `startLine` is the line where the handler is declared, `endLine` is the end of its body, and `anchor` is the handler's name as written on `startLine`. `risk` is high when the change can lose or corrupt data, move money, change permissions or break the entry point; low when it is cosmetic.
- If a gap is reachable from an entry point (for example a bulk import route that bypasses the new check), list that entry point too and put its id in the gap's `entryPointId`. Its `effect` says that it is not covered by the change.
- `gaps`: `ref` covers the code that performs the bypassing write, with the write call's own text as the anchor. `explanation` says, in one or two sentences, what rule is skipped and what goes wrong as a result.
- `mismatches`: `refs` point at the code that proves the claim wrong; if a gap proves it, use the gap's location. `entryPointId` is the entry point where a reviewer should start looking.
- `removed`: functions, routes, checks or behaviours the pull request deleted. The ref uses the file and line numbers from before the change.
- `askSuggestions`: exactly three, each under 12 words, specific to this change.

If the pull request changes only configuration, data, schema or documentation and no code path, say what the configuration change does, return the entry points it genuinely affects if you can find where the configuration is read, and otherwise return an empty list. Never invent a code path to fill the list. Empty lists are a correct answer when there is nothing to report."#;

/// SPEC §4.3. Discovery over one shard of a large pull request.
pub const DISCOVERY_SHARD_NOTE: &str = r#"### This is one part of a large pull request

The pull request is too large to analyse in one pass, so it has been split into parts. You are analysing only the part named below. The context lists every changed file in the pull request, but includes the diff only for the files in your part. Do the five investigation steps for the changes in your part. You may read any file in the repository, including changed files outside your part, when you need to follow a call or find a writer. Entry points and gaps you report must be affected by the changes in your part. Another pass will merge the parts, so don't try to cover the rest."#;

/// SPEC §4.3. The short merge pass after sharded discovery.
pub const DISCOVERY_MERGE: &str = r#"## Merge the parts of a large pull request analysis

A large pull request was analysed in several parts. Each part produced a discovery result in the schema below; they are listed after this instruction. Combine them into one result in the same schema.

- Write one `behaviourSummary` of 2 to 4 sentences covering the whole pull request.
- Merge entry points that are the same entry point (same handler location or same label) into one, keeping the higher risk and combining the effects into one line. Renumber ids as `ep1`, `ep2`, … and update every `entryPointId` in mismatches and gaps to the new ids. Keep at most 12, the riskiest first.
- Merge duplicate gaps, mismatches and removed items. Don't drop any that aren't duplicates.
- Choose the three best `askSuggestions`.
- Copy every CodeRef exactly as given, including its anchor. Don't invent new references and don't change line numbers. You don't need to explore the repository for this task; only open a file if two parts disagree about the same code.

Schema:

    { "behaviourSummary": "...",
      "mismatches": [{ "claim": "...", "reality": "...", "refs": [CodeRef], "entryPointId": "ep1" }],
      "entryPoints": [{ "id": "ep1", "label": "...", "kind": "http | ui | job | consumer | schedule | cli | api | other", "ref": CodeRef, "effect": "...", "risk": "high | medium | low", "timingOnly": false }],
      "gaps": [{ "ref": CodeRef, "writeTarget": "...", "explanation": "...", "entryPointId": "ep1" }],
      "removed": [{ "ref": CodeRef, "name": "..." }],
      "askSuggestions": ["...", "...", "..."] }"#;

/// SPEC §5.2.
pub const QUESTIONS: &str = r#"## Comprehension questions: what should a reviewer be able to answer before approving?

Write 3 to 6 questions that test whether someone really understands what this pull request does. A reviewer who can answer all of them has understood the change; one who can't should look again. The discovery result below tells you what the change affects; read the code to write the answers.

Each question must be about behaviour a reviewer should verify:

- edge cases and boundaries (what happens exactly at a limit, with empty or missing input),
- failure modes (what happens when a step fails halfway, on retry, on timeout),
- permissions and who is allowed to do what,
- existing data and migration (what happens to records created before this change),
- concurrency and ordering (two requests at once, events arriving out of order),
- paths that are not covered by the change.

No trivia: don't ask what a function is called, which file something is in, or anything answerable without understanding the behaviour. Don't ask about things the code doesn't determine.

Return:

    { "questions": [
        { "id": "q1", "question": "one sentence, answerable from the code", "answer": "2 to 4 sentences giving the answer and why, in plain language", "refs": [CodeRef] }
    ] }

Every question needs at least one CodeRef pointing at the code that determines the answer. A question without a verifiable reference is discarded, so only ask what you can point to. If the answer is "the code doesn't handle this", point at the place where the handling would have to be."#;

/// SPEC §5.3. `threadGists` keys are the thread ids given in the context.
pub const DISCUSSION: &str = r#"## Discussion digest: where does the conversation on this pull request stand?

The existing review conversation on this pull request is listed below as threads, each with an id, whether it is resolved, where it is attached and its comments in order. These are facts from the code host; you don't need to verify them and you don't need to explore the repository for this task.

Return:

    { "digest": "2 to 4 sentences on where things stand and what is unresolved",
      "threadGists": { "<thread id>": "at most 12 words saying what this thread is about and how it ended" } }

- `digest`: what reviewers have asked for, what the author has agreed to or pushed back on, and what is still open. Name people by their login when it matters who is waiting on whom. If everything is resolved, say so.
- `threadGists`: one entry for every thread id listed, using the ids exactly as given. Each gist is at most 12 words, for example "Asks why the limit is hard-coded; author moved it to config." Don't quote the comments at length.
- Report only what the comments say. Don't add your own review opinions."#;

/// SPEC §5.4.
pub const ASK: &str = r#"## Answer a reviewer's question about this pull request

A reviewer is reading this pull request in grsp and has asked the question below. Answer it from the code in this repository. You may read anything in the checkout. The discovery result and the last few questions and answers are included so you can resolve follow-ups such as "and what about retries?".

Return:

    { "paragraphs": ["1 to 3 short paragraphs answering the question directly"],
      "excerpt": CodeRef or null,
      "highlight": CodeRef or null,
      "refs": [CodeRef],
      "confidence": "high | medium | low",
      "grounded": true }

- `paragraphs`: lead with the answer, then the reasoning. Plain language, no markdown. Mention function or file names only where they help the reviewer find the code.
- `excerpt`: the one block of code that best shows the answer, covering whole statements (`startLine` to `endLine`, at most about 30 lines). grsp reads the code itself; never paste code into the paragraphs.
- `highlight`: the single most important line inside the excerpt (same file, `startLine` only, with its anchor), or null.
- `refs`: every other place the answer relies on.
- `confidence`: high when you read the code that decides the answer; medium when you inferred part of it; low when the code is ambiguous or you couldn't find everything.
- `grounded`: true when the answer comes from code you read in this repository.

When the question can't be answered from this repository (the thing asked about doesn't exist here, or it depends on systems, configuration or data you can't see), set `grounded` to false, say plainly in the first paragraph that there is no direct match in this repository, and name the closest relevant code you did find with a CodeRef. Never answer from general knowledge as if it described this repository, and never describe what code "usually" does. If the question isn't about this repository or pull request at all, set `grounded` to false and say that grsp answers questions about this change."#;

/// SPEC §5.5. `{depth}` is replaced with the trace-depth guidance.
pub const WALKTHROUGH: &str = r#"## Walkthrough: trace one entry point step by step

A reviewer wants to step through what happens when the entry point named below is used, the way they would in a debugger, but reading behaviour instead of stack frames. Trace the path from the entry point through the code to the effects it causes, and return it as a chain of blocks.

### How to trace

1. Start at the entry point's handler (its location is given below) and read it.
2. Follow the calls it makes, in execution order, into the code that matters for this pull request. Read each function before you add it as a block.
3. Only follow branches that reach changed code, a gap from the discovery result, or an external effect (a database write, an event or queue publish, a call to another system). Skip logging, metrics, serialisation and plumbing unless the pull request changed them.
4. Stop a branch when it reaches an external effect or returns to the caller with nothing further of interest.
{depth}

### Blocks

A block is one function, method, handler or clearly delimited section of code that does one step: accepts the request, validates input, applies a rule, decides something, writes data, publishes an event, calls another system. Use at most 12 blocks along any single path, and about 16 in total.

    { "blocks": [
        { "id": "b1",
          "label": "the code's own name for this step",
          "kind": "route | validation | service | policy | auth | data_access | db_write | event | external | job | ui | other",
          "ref": CodeRef,
          "anchor": "the name other code uses to call this block",
          "note": "1 to 2 sentences: what happens here, and what this pull request changed if anything",
          "next": ["b2"],
          "decision": { "condition": "the condition in the reviewer's terms", "yes": "what happens when it holds", "no": "what happens when it doesn't", "ref": CodeRef } or null }
      ],
      "whatIf": { "variable": "the input that decides the path",
                  "options": [ { "label": "a concrete value", "path": ["b1", "b2", "b3"],
                                 "taken": { "b3": "yes" },
                                 "notes": { "b3": "what happens at this block for this value" } } ],
                  "notes": { "a concrete value": "why this value is interesting" } } or null }

- `id`: `b1`, `b2`, … in the order a typical request reaches them. Blocks that are alternatives at the same step share the number with a letter suffix (`b5a`, `b5b`).
- `label`: the function, method or handler name as written in the code, qualified the way the code qualifies it. Don't invent friendlier names.
- `ref`: the whole block. `startLine` is the line that declares it, `endLine` is the last line of its body, and `ref.anchor` is text copied from `startLine`.
- `anchor` (on the block): the bare name by which a caller refers to this block, exactly as it appears at the call site in the previous block (a function or method name, an event or queue name, a route path). grsp checks that the previous block's code contains it; if it doesn't, the connection is shown as unconfirmed.
- `note`: what this step does for the request, in plain language. If the pull request changed this block, say what is different now. Don't say whether the code is new or changed in any other field; grsp works that out from git.
- `next`: the ids of the blocks this one leads to. A block with a decision normally has two. The last block of a branch has an empty list.
- `decision`: include it when the block chooses between outcomes based on a condition. `condition` is phrased the way a reviewer would say it, using the real values and units from the code. `yes` and `no` are the outcomes in a few words. `decision.ref` points at the line holding the condition.
- A step from publishing an event or enqueueing a job to the code that consumes it is a valid link even though there is no direct call. Use kind `event` for the publishing block and `job` for the consumer.

### What if

Offer `whatIf` only when a decision that this pull request added or changed branches on an input the person using the entry point controls (an amount, a role, a flag, a size). Otherwise return null. Use at most one variable, with 2 or 3 options:

- Pick concrete values a reviewer would try, written with their unit as a person would write them. When the decision compares against a threshold, give a value just below it, the threshold itself, and a value clearly above it.
- `path`: the ids of the blocks that run for this value, in order, from the first block to the last. Every id must be a block you returned.
- `taken`: for each block on the path that has a decision, which branch this value takes: "yes" or "no".
- `notes` inside an option: for blocks whose behaviour depends on the value, one sentence saying what happens there for this value.
- `notes` at the top of `whatIf`: keyed by option label, one sentence for options that need explaining, especially the boundary value (does "greater than" include it?). Work the boundary out from the comparison operator in the code.

This is reasoning from reading the code, not from running it. Don't claim anything was executed."#;

/// Trace-depth guidance substituted into `WALKTHROUGH` (Settings → trace depth).
pub fn walkthrough_depth(depth: u8) -> &'static str {
    match depth {
        1 => "5. Keep the trace shallow: the handler, the changed code it reaches and the first effect of each branch. Don't descend into helpers.",
        3 => "5. Trace deeply: follow the path into helpers that affect the outcome, and across asynchronous hand-offs (events, queues, scheduled follow-ups) into the code that consumes them, while staying within the block limits.",
        _ => "5. Follow the path through the layers between the handler and its effects, and across one asynchronous hand-off (an event or queued job) if the pull request's change depends on it.",
    }
}

pub fn walkthrough(depth: u8) -> String {
    WALKTHROUGH.replace("{depth}", walkthrough_depth(depth))
}

/// SPEC §5.6. The user's review prompt and any repo override follow as
/// separate layers.
pub const REVIEW: &str = r#"## Review this pull request

Review the pull request as a careful senior engineer on this codebase would, following the reviewer's own review instructions given further below. The discovery result tells you what the change affects and where it has gaps; the discussion tells you what has already been said. Read the changed code and whatever surrounds it that you need.

Return:

    { "findings": [
        { "id": "f1",
          "severity": "blocking | should_fix | nit",
          "title": "under 10 words naming the problem",
          "why": "1 to 3 sentences: what goes wrong, when, and what it affects",
          "ref": CodeRef,
          "suggestedComment": "the comment to post on that line, ready to send" }
      ],
      "summary": "1 to 2 sentences giving the overall verdict" }

- Report real problems: incorrect behaviour, data that can be lost or left inconsistent, missing checks, paths the change doesn't cover, broken error handling, security and permission holes, and tests that don't test what they claim. Report style only as a nit, and only if the reviewer's instructions ask for it.
- `severity`: blocking when merging as-is would cause incorrect behaviour or data problems; should_fix for things that ought to change but aren't dangerous; nit for small improvements.
- `ref`: the single line the comment should be attached to: `startLine` only, with an anchor copied from that line. Prefer a line this pull request added or changed. When the problem is in code the pull request did not touch (for example a path that bypasses the change), point at that code anyway; grsp will place the comment in the review summary instead of inline.
- `suggestedComment`: written to the author, in the reviewer's voice, polite and specific. Say what to change, not only what is wrong. Follow the length and tone rules in the reviewer's instructions. Plain text or light markdown; a suggestion block is fine when the fix is a small edit to the referenced line.
- Don't repeat points that the discussion shows were already raised and resolved. If a point was raised and is still unresolved, you may include it, and say that it is still open.
- A finding without a reference grsp can verify is discarded, so read the line before you cite it. Order findings by severity, most serious first. At most 12.
- If the change is sound, return an empty `findings` list and say so in the summary. Don't invent findings to have something to say."#;

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn discovery_spells_out_the_five_required_steps() {
        for needle in [
            "1. **Read the change.**",
            "2. **Find the entry points",
            "3. **Look for gaps.**",
            "4. **Compare the description with the code.**",
            "5. **Note external effects.**",
            "search the whole repository for other code that writes to the same target",
            "keep going until you reach entry points",
        ] {
            assert!(
                DISCOVERY.contains(needle),
                "discovery instruction is missing: {needle}"
            );
        }
        assert!(DISCOVERY.contains("at most 12"));
    }

    #[test]
    fn walkthrough_asks_for_taken_and_per_option_notes() {
        let w = walkthrough(2);
        assert!(w.contains("\"taken\""));
        assert!(w.contains("\"notes\""));
        assert!(w.contains("at most 12 blocks"));
        assert!(!w.contains("{depth}"));
        assert_ne!(walkthrough(1), walkthrough(3));
    }

    #[test]
    fn ask_describes_the_ungrounded_behaviour() {
        assert!(ASK.contains("set `grounded` to false"));
        assert!(ASK.contains("no direct match"));
    }

    #[test]
    fn instructions_are_language_agnostic() {
        // Nothing may assume a stack. These names would be a smell.
        let all = [
            DISCOVERY,
            DISCOVERY_SHARD_NOTE,
            DISCOVERY_MERGE,
            QUESTIONS,
            DISCUSSION,
            ASK,
            WALKTHROUGH,
            REVIEW,
        ]
        .join("\n");
        let lower = all.to_lowercase();
        for banned in [
            "django",
            "rails",
            "react",
            "express",
            "spring",
            "laravel",
            "flask",
            "python",
            "javascript",
            "typescript",
            "java ",
            "golang",
            "rust",
            ".py",
            ".ts",
            ".go",
            ".rb",
            "views.py",
            "controller",
        ] {
            assert!(!lower.contains(banned), "instruction mentions `{banned}`");
        }
    }
}
