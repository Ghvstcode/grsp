//! Discussion (SPEC §5.3). PR sessions only.
//!
//! Threads, comments, authors and resolved state are facts from the GitHub
//! API. The agent only writes the digest and a short gist per thread.
//! Suggestion blocks stay in the comment bodies; the UI renders them.

use std::collections::HashMap;

use super::context::{Outcome, PassCtx};
use super::instructions;
use crate::agent::{AgentError, JsonPass, PromptLayers, RunHooks, Runner};
use crate::github;
use crate::model::*;
use crate::verify;

const COMMENT_MAX_CHARS: usize = 1_500;
const THREADS_MAX: usize = 80;

fn check(raw: &RawDiscussion) -> Result<(), String> {
    if raw.digest.trim().is_empty() {
        return Err("`digest` is missing or empty".to_string());
    }
    Ok(())
}

fn clip(text: &str) -> String {
    let t = text.trim();
    if t.chars().count() <= COMMENT_MAX_CHARS {
        t.to_string()
    } else {
        let head: String = t.chars().take(COMMENT_MAX_CHARS).collect();
        format!("{head} … (comment truncated)")
    }
}

/// The threads as the agent sees them.
pub fn threads_section(threads: &[DiscussionThread]) -> String {
    let mut out = String::from("## Threads\n\n");
    for t in threads.iter().take(THREADS_MAX) {
        let place = match (&t.path, t.line) {
            (Some(p), Some(l)) => format!("on {p} line {l}"),
            (Some(p), None) => format!("on {p}"),
            _ => "general comment".to_string(),
        };
        out.push_str(&format!(
            "### Thread id: {}\n{}; {}\n\n",
            t.id,
            place,
            if t.resolved {
                "resolved"
            } else {
                "not resolved"
            }
        ));
        for c in &t.comments {
            out.push_str(&format!(
                "{} ({}):\n{}\n\n",
                c.author,
                c.created_at,
                clip(&c.body)
            ));
        }
    }
    if threads.len() > THREADS_MAX {
        out.push_str(&format!(
            "({} more threads are not shown.)\n",
            threads.len() - THREADS_MAX
        ));
    }
    out
}

/// "No discussion yet": the result when there are no comments. No agent runs.
pub fn without_digest(threads: Vec<DiscussionThread>) -> DiscussionResult {
    DiscussionResult {
        digest: String::new(),
        comment_count: github::comment_count(&threads),
        threads,
    }
}

/// Refetched threads with the previous digest and gists carried over.
/// `None` when the comment count changed, which means the digest must be
/// re-run (SPEC §5.3).
pub fn carry_over(
    previous: &DiscussionResult,
    mut threads: Vec<DiscussionThread>,
) -> Option<DiscussionResult> {
    let count = github::comment_count(&threads);
    if count != previous.comment_count {
        return None;
    }
    let gists: HashMap<&str, &str> = previous
        .threads
        .iter()
        .filter_map(|t| t.gist.as_deref().map(|g| (t.id.as_str(), g)))
        .collect();
    for t in &mut threads {
        t.gist = gists.get(t.id.as_str()).map(|g| g.to_string());
    }
    Some(DiscussionResult {
        digest: previous.digest.clone(),
        threads,
        comment_count: count,
    })
}

/// Digest the given threads. With zero comments the agent isn't run.
pub async fn run(
    runner: &Runner,
    ctx: &PassCtx,
    threads: Vec<DiscussionThread>,
    hooks: &RunHooks,
) -> Result<Outcome<DiscussionResult>, AgentError> {
    if github::comment_count(&threads) == 0 {
        return Ok(Outcome {
            result: without_digest(threads),
            report: VerificationReport::default(),
        });
    }
    // The digest is about the conversation, so the diff is left out.
    let layers = PromptLayers {
        instruction: instructions::DISCUSSION.to_string(),
        context_pack: format!(
            "{}\n{}\n{}",
            ctx.header(),
            ctx.file_list(),
            threads_section(&threads)
        ),
        review_prompt: None,
        repo_prompt: ctx.repo_prompt.clone(),
    };
    let pass: JsonPass<RawDiscussion> = runner
        .run_output(&ctx.request(&layers), hooks, check)
        .await?;
    let mut result = verify::shape_discussion(pass.value, threads);
    result.comment_count = github::comment_count(&result.threads);
    Ok(Outcome {
        result,
        report: VerificationReport::default(),
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    fn thread(id: &str, resolved: bool, bodies: &[&str], gist: Option<&str>) -> DiscussionThread {
        DiscussionThread {
            id: id.into(),
            path: Some("a/b.txt".into()),
            line: Some(4),
            resolved,
            gist: gist.map(String::from),
            comments: bodies
                .iter()
                .enumerate()
                .map(|(i, b)| DiscussionComment {
                    id: format!("{id}-{i}"),
                    author: "ana".into(),
                    body: b.to_string(),
                    created_at: "t".into(),
                })
                .collect(),
        }
    }

    #[test]
    fn threads_section_lists_ids_state_and_comments() {
        let s = threads_section(&[thread(
            "T_1",
            true,
            &["Why?", "```suggestion\nx\n```"],
            None,
        )]);
        assert!(s.contains("### Thread id: T_1"));
        assert!(s.contains("on a/b.txt line 4; resolved"));
        assert!(s.contains("```suggestion"));
    }

    #[test]
    fn same_comment_count_keeps_digest_and_gists() {
        let prev = DiscussionResult {
            digest: "Two threads, one open.".into(),
            threads: vec![
                thread("T_1", false, &["a"], Some("Asks about the limit")),
                thread("T_2", false, &["b"], None),
            ],
            comment_count: 2,
        };
        // T_1 was resolved since; count unchanged.
        let fresh = vec![
            thread("T_1", true, &["a"], None),
            thread("T_2", false, &["b"], None),
        ];
        let kept = carry_over(&prev, fresh).unwrap();
        assert_eq!(kept.digest, "Two threads, one open.");
        assert!(kept.threads[0].resolved);
        assert_eq!(
            kept.threads[0].gist.as_deref(),
            Some("Asks about the limit")
        );
        assert_eq!(kept.comment_count, 2);
    }

    #[test]
    fn changed_comment_count_requires_a_new_digest() {
        let prev = DiscussionResult {
            digest: "d".into(),
            threads: vec![thread("T_1", false, &["a"], None)],
            comment_count: 1,
        };
        assert!(carry_over(&prev, vec![thread("T_1", false, &["a", "b"], None)]).is_none());
    }

    #[test]
    fn long_comments_are_clipped() {
        let long = "x".repeat(5_000);
        assert!(clip(&long).ends_with("(comment truncated)"));
        assert!(clip(&long).chars().count() < 1_600);
    }
}
