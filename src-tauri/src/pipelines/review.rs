//! AI review (SPEC §5.6): findings, anchoring, the review body and posting rules.

use super::context::{discovery_brief, Outcome, PassCtx};
use super::instructions;
use crate::agent::{AgentError, JsonPass, RunHooks, Runner};
use crate::github::{ReviewComment, ReviewPayload};
use crate::model::*;
use crate::verify::{self, Verifier};

/// Heading for findings whose line isn't part of the PR diff.
pub const NOT_IN_DIFF_HEADING: &str = "### Not in this diff";

fn check(raw: &RawReview) -> Result<(), String> {
    if raw.summary.trim().is_empty() && raw.findings.is_empty() {
        return Err("both `findings` and `summary` are missing".to_string());
    }
    Ok(())
}

/// The discussion as the review agent sees it, so it doesn't repeat points
/// already raised and resolved.
pub fn discussion_brief(d: &DiscussionResult) -> String {
    if d.comment_count == 0 {
        return String::new();
    }
    let mut out = String::from("## Existing discussion on this pull request\n\n");
    if !d.digest.trim().is_empty() {
        out.push_str(d.digest.trim());
        out.push_str("\n\n");
    }
    for t in d.threads.iter().take(60) {
        let place = match (&t.path, t.line) {
            (Some(p), Some(l)) => format!("{p}:{l}"),
            (Some(p), None) => p.clone(),
            _ => "general".to_string(),
        };
        let what = t.gist.clone().unwrap_or_else(|| {
            t.comments
                .first()
                .map(|c| {
                    c.body
                        .split_whitespace()
                        .take(24)
                        .collect::<Vec<_>>()
                        .join(" ")
                })
                .unwrap_or_default()
        });
        out.push_str(&format!(
            "- [{}] {} — {}\n",
            if t.resolved { "resolved" } else { "open" },
            place,
            what
        ));
    }
    out
}

/// Inputs: the user's review prompt and any repo override, the context pack,
/// the discovery result and the discussion.
pub async fn run(
    runner: &Runner,
    ctx: &PassCtx,
    discovery: Option<&DiscoveryResult>,
    discussion: Option<&DiscussionResult>,
    review_prompt: &str,
    hooks: &RunHooks,
) -> Result<Outcome<ReviewResult>, AgentError> {
    let mut layers = ctx.layers(instructions::REVIEW.to_string());
    let mut pack = layers.context_pack.clone();
    if let Some(d) = discovery {
        pack.push('\n');
        pack.push_str(&discovery_brief(d));
    }
    if let Some(d) = discussion {
        let brief = discussion_brief(d);
        if !brief.is_empty() {
            pack.push('\n');
            pack.push_str(&brief);
        }
    }
    layers.context_pack = pack;
    let prompt = review_prompt.trim();
    layers.review_prompt = Some(if prompt.is_empty() {
        DEFAULT_REVIEW_PROMPT.to_string()
    } else {
        prompt.to_string()
    });

    let pass: JsonPass<RawReview> = runner
        .run_output(&ctx.request(&layers), hooks, check)
        .await?;

    let src = ctx.source();
    let mut v = Verifier::new(&src, ctx.map());
    let result = verify::shape_review(pass.value, ctx.repo_prompt.is_some(), &mut v);
    let mut report = v.into_report();
    report.files_explored = Some(pass.files_explored.len() as u32);
    Ok(Outcome { result, report })
}

fn location(r: &CodeRef) -> String {
    format!("{}:{}", r.file, r.start_line)
}

fn comment_text(f: &Finding) -> String {
    let c = f.comment.trim();
    if c.is_empty() {
        // The user cleared the comment but kept the finding included.
        if f.why.trim().is_empty() {
            f.title.trim().to_string()
        } else {
            format!("{}: {}", f.title.trim(), f.why.trim())
        }
    } else {
        c.to_string()
    }
}

/// The review body: the user's summary, then a "Not in this diff" section for
/// included findings GitHub won't accept inline, with `file:line` written out.
pub fn build_body(summary: &str, findings: &[Finding]) -> String {
    let mut body = summary.trim().to_string();
    let off_diff: Vec<&Finding> = findings
        .iter()
        .filter(|f| f.included && f.anchoring == Anchoring::Summary)
        .collect();
    if off_diff.is_empty() {
        return body;
    }
    if !body.is_empty() {
        body.push_str("\n\n");
    }
    body.push_str(NOT_IN_DIFF_HEADING);
    body.push_str("\n\n");
    for f in off_diff {
        let text = comment_text(f).replace('\n', "\n  ");
        body.push_str(&format!("- `{}` — {}\n", location(&f.code_ref), text));
    }
    body.trim_end().to_string()
}

/// One "create a review" payload: `commit_id = headSha`, the verdict, the
/// body and inline comments (`side: RIGHT`) for included in-diff findings.
pub fn build_payload(
    head_sha: &str,
    event: ReviewEvent,
    summary: &str,
    findings: &[Finding],
) -> Result<ReviewPayload, String> {
    let comments: Vec<ReviewComment> = findings
        .iter()
        .filter(|f| f.included && f.anchoring == Anchoring::Inline)
        .map(|f| ReviewComment::new(&f.code_ref.file, f.code_ref.start_line, &comment_text(f)))
        .collect();
    let body = build_body(summary, findings);
    // GitHub rejects a Comment or Request changes review with nothing in it.
    if body.is_empty() && comments.is_empty() && event != ReviewEvent::Approve {
        return Err(
            "There's nothing to post. Write a summary or include at least one finding.".to_string(),
        );
    }
    if body.is_empty() && event == ReviewEvent::RequestChanges {
        return Err("Request changes needs a summary.".to_string());
    }
    Ok(ReviewPayload {
        commit_id: head_sha.to_string(),
        event,
        body,
        comments,
    })
}

/// Rules checked before any network call (SPEC §5.6 "Errors").
pub fn check_can_post(session: &ReviewSession, event: ReviewEvent) -> Result<(), String> {
    if session.source.is_commits() {
        return Err(
            "Posting is only available for pull requests. This session reviews commits, so there is no pull request to post to."
                .to_string(),
        );
    }
    if !session.source.is_pr() {
        return Err(
            "Posting is only available for pull requests. This session compares two branches."
                .to_string(),
        );
    }
    if session.head_sha.is_none() {
        return Err("The session isn't ready yet.".to_string());
    }
    if session.is_own_pr && event != ReviewEvent::Comment {
        return Err("GitHub doesn't let you approve or request changes on your own pull request. Post it as a comment instead.".to_string());
    }
    Ok(())
}

fn normalise_body(s: &str) -> String {
    s.replace("\r\n", "\n")
        .split_whitespace()
        .collect::<Vec<_>>()
        .join(" ")
}

/// Double-post guard: among this user's submitted reviews on this commit,
/// the one whose body matches what we're about to post. That is exactly the
/// case of a retry after a network error; a different earlier review on the
/// same commit doesn't block a new one.
pub fn find_duplicate(
    reviews_json: &str,
    login: &str,
    payload: &ReviewPayload,
) -> Result<Option<PostedReview>, String> {
    let v: serde_json::Value = serde_json::from_str(reviews_json)
        .map_err(|e| format!("Unexpected response from GitHub: {e}"))?;
    let pages: Vec<&serde_json::Value> = match v.as_array() {
        Some(a) if !a.is_empty() && a.iter().all(|x| x.is_array()) => {
            a.iter().filter_map(|x| x.as_array()).flatten().collect()
        }
        Some(a) => a.iter().collect(),
        None => Vec::new(),
    };
    let want = normalise_body(&payload.body);
    let matching: Vec<&serde_json::Value> = pages
        .into_iter()
        .filter(|r| {
            let s = |k: &str| r.get(k).and_then(|x| x.as_str()).unwrap_or("");
            let who = r
                .get("user")
                .and_then(|u| u.get("login"))
                .and_then(|l| l.as_str())
                .unwrap_or("");
            who.eq_ignore_ascii_case(login)
                && s("commit_id") == payload.commit_id
                && s("state") != "PENDING"
                && normalise_body(s("body")) == want
        })
        .collect();
    match matching.last() {
        Some(r) => {
            let one = serde_json::Value::Array(vec![(*r).clone()]).to_string();
            crate::github::find_existing_review(&one, login, &payload.commit_id)
        }
        None => Ok(None),
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::pipelines::context::testutil::session;
    use serde_json::json;

    fn finding(
        id: &str,
        file: &str,
        line: u32,
        anchoring: Anchoring,
        included: bool,
        comment: &str,
    ) -> Finding {
        Finding {
            id: id.into(),
            severity: Severity::Blocking,
            title: format!("Title {id}"),
            why: "Because.".into(),
            code_ref: CodeRef {
                file: file.into(),
                start_line: line,
                verified: true,
                ..Default::default()
            },
            excerpt: Excerpt::default(),
            comment: comment.into(),
            included,
            anchoring,
        }
    }

    #[test]
    fn inline_findings_become_right_side_comments() {
        let fs = vec![
            finding(
                "f1",
                "orders/services.x",
                42,
                Anchoring::Inline,
                true,
                "Check the limit here.",
            ),
            finding(
                "f2",
                "orders/imports.x",
                9,
                Anchoring::Summary,
                true,
                "This path skips approval.",
            ),
            finding(
                "f3",
                "orders/api.x",
                7,
                Anchoring::Inline,
                false,
                "Excluded.",
            ),
        ];
        let p = build_payload("abc123", ReviewEvent::RequestChanges, "Needs work.", &fs).unwrap();
        assert_eq!(p.commit_id, "abc123");
        assert_eq!(p.event, ReviewEvent::RequestChanges);
        assert_eq!(
            p.comments,
            vec![ReviewComment::new(
                "orders/services.x",
                42,
                "Check the limit here."
            )]
        );
        assert_eq!(p.comments[0].side, "RIGHT");
        assert_eq!(
            p.body,
            "Needs work.\n\n### Not in this diff\n\n- `orders/imports.x:9` — This path skips approval."
        );
    }

    #[test]
    fn body_without_summary_findings_is_just_the_summary() {
        let fs = vec![finding("f1", "a.x", 1, Anchoring::Inline, true, "c")];
        assert_eq!(build_body("  Looks good.  ", &fs), "Looks good.");
        // An excluded summary finding adds no section.
        let fs = vec![finding("f2", "a.x", 1, Anchoring::Summary, false, "c")];
        assert_eq!(build_body("S", &fs), "S");
    }

    #[test]
    fn not_in_diff_section_stands_alone_when_the_summary_is_empty() {
        let fs = vec![finding(
            "f2",
            "b.x",
            3,
            Anchoring::Summary,
            true,
            "line one\nline two",
        )];
        assert_eq!(
            build_body("", &fs),
            "### Not in this diff\n\n- `b.x:3` — line one\n  line two"
        );
    }

    #[test]
    fn cleared_comment_falls_back_to_title_and_why() {
        let fs = vec![finding("f1", "a.x", 1, Anchoring::Inline, true, "   ")];
        let p = build_payload("h", ReviewEvent::Comment, "", &fs).unwrap();
        assert_eq!(p.comments[0].body, "Title f1: Because.");
    }

    #[test]
    fn empty_reviews_are_rejected_before_the_network() {
        assert!(build_payload("h", ReviewEvent::Comment, " ", &[]).is_err());
        assert!(build_payload(
            "h",
            ReviewEvent::RequestChanges,
            "",
            &[finding("f", "a", 1, Anchoring::Inline, true, "c")]
        )
        .is_err());
        // An approval with nothing else is fine.
        let p = build_payload("h", ReviewEvent::Approve, "", &[]).unwrap();
        assert!(p.body.is_empty() && p.comments.is_empty());
    }

    #[test]
    fn own_pr_and_branch_rules() {
        let mut s = session("t", "d");
        // Branch-pair sessions can't post.
        assert!(check_can_post(&s, ReviewEvent::Comment).is_err());
        // Neither can commit sessions, and the message says why.
        s.source = SessionSource::Commits {
            branch: Some("main".into()),
            base: "b".repeat(40),
            head: "a".repeat(40),
            count: 1,
        };
        let err = check_can_post(&s, ReviewEvent::Comment).unwrap_err();
        assert!(err.contains("only available for pull requests"), "{err}");
        assert!(err.contains("reviews commits"), "{err}");
        s.source = SessionSource::Pr {
            number: 4,
            url: "u".into(),
        };
        assert!(check_can_post(&s, ReviewEvent::Approve).is_ok());
        s.is_own_pr = true;
        assert!(check_can_post(&s, ReviewEvent::Comment).is_ok());
        assert!(check_can_post(&s, ReviewEvent::Approve)
            .unwrap_err()
            .contains("own pull request"));
        assert!(check_can_post(&s, ReviewEvent::RequestChanges).is_err());
    }

    #[test]
    fn duplicate_guard_matches_user_commit_and_body() {
        let payload = ReviewPayload {
            commit_id: "head".into(),
            event: ReviewEvent::Comment,
            body: "Needs work.\n\nSee notes.".into(),
            comments: vec![],
        };
        let reviews = json!([[
            {"id": 1, "user": {"login": "me"}, "commit_id": "head", "state": "COMMENTED", "body": "An earlier, different review", "html_url": "u1"},
            {"id": 2, "user": {"login": "me"}, "commit_id": "old", "state": "COMMENTED", "body": "Needs work.\n\nSee notes.", "html_url": "u2"},
            {"id": 3, "user": {"login": "other"}, "commit_id": "head", "state": "COMMENTED", "body": "Needs work.\n\nSee notes.", "html_url": "u3"}
        ]])
        .to_string();
        assert_eq!(find_duplicate(&reviews, "me", &payload).unwrap(), None);

        let with_dup = json!([
            {"id": 9, "user": {"login": "me"}, "commit_id": "head", "state": "COMMENTED", "body": "Needs work.\r\n\r\nSee notes.", "html_url": "u9"}
        ])
        .to_string();
        let found = find_duplicate(&with_dup, "me", &payload).unwrap().unwrap();
        assert_eq!(found.id, "9");
        assert_eq!(found.url, "u9");
    }

    #[test]
    fn discussion_brief_marks_resolved_threads() {
        let d = DiscussionResult {
            digest: "One open point.".into(),
            comment_count: 2,
            threads: vec![
                DiscussionThread {
                    id: "a".into(),
                    path: Some("f.x".into()),
                    line: Some(3),
                    resolved: true,
                    gist: Some("Limit moved to config".into()),
                    comments: vec![],
                },
                DiscussionThread {
                    id: "b".into(),
                    path: None,
                    line: None,
                    resolved: false,
                    gist: None,
                    comments: vec![DiscussionComment {
                        id: "1".into(),
                        author: "z".into(),
                        body: "What about imports?".into(),
                        created_at: "t".into(),
                    }],
                },
            ],
        };
        let b = discussion_brief(&d);
        assert!(b.contains("- [resolved] f.x:3 — Limit moved to config"));
        assert!(b.contains("- [open] general — What about imports?"));
        assert_eq!(discussion_brief(&DiscussionResult::default()), "");
    }
}
