//! Contract tests (SPEC §8): recorded agent replies, including deliberately
//! bad ones, go through each pipeline's parse → verify → shape against a real
//! temp git repo, and the UI-ready output is asserted.
//!
//! No agent CLI is spawned: a scripted backend replays the replies.

mod common;

use common::*;
use grsp_lib::agent::{AgentError, RunHooks};
use grsp_lib::model::*;
use grsp_lib::pipelines::{ask, discovery, discussion, questions, review, walkthrough};

async fn good_discovery(fx: &Fixture) -> DiscoveryResult {
    let (runner, _) = scripted([GOOD_DISCOVERY]);
    discovery::run(&runner, &ctx(fx, DESCRIPTION), &RunHooks::silent())
        .await
        .expect("discovery")
        .result
}

// ── Discovery ──────────────────────────────────────────────

#[tokio::test]
async fn discovery_good_reply_is_shaped_for_the_gist() {
    let fx = order_repo();
    let (runner, backend) = scripted([GOOD_DISCOVERY]);
    let out = discovery::run(&runner, &ctx(&fx, DESCRIPTION), &RunHooks::silent())
        .await
        .unwrap();
    let d = out.result;

    assert!(d.behaviour_summary.starts_with("Orders over 10,000"));
    assert!(!d.description_empty);
    assert_eq!(d.shards, None);

    // Order: the entry point with the gap first, then by risk.
    let ids: Vec<&str> = d.entry_points.iter().map(|e| e.id.as_str()).collect();
    assert_eq!(ids, vec!["ep2", "ep1"]);
    let import = &d.entry_points[0];
    assert!(import.has_gap);
    assert_eq!(import.tag, AffectedTag::NotCovered);
    assert!(import.code_ref.verified);
    let create = &d.entry_points[1];
    assert_eq!(create.label, "POST /orders");
    assert_eq!(create.kind, EntryPointKind::Http);
    assert_eq!(create.risk, Level::High);
    // The handler itself is untouched; the tag is derived by Rust.
    assert_eq!(create.tag, AffectedTag::Changed);
    assert!(!create.has_gap);

    assert_eq!(d.gaps.len(), 1);
    assert_eq!(d.gaps[0].code_ref.file, "orders/imports.py");
    assert_eq!(d.gaps[0].code_ref.start_line, 6);
    assert_eq!(d.gaps[0].entry_point_id.as_deref(), Some("ep2"));

    assert_eq!(d.mismatches.len(), 1);
    assert_eq!(d.mismatches[0].id, "m1");
    assert_eq!(d.mismatches[0].entry_point_id.as_deref(), Some("ep2"));
    assert!(d.mismatches[0].refs.iter().all(|r| r.verified));

    // Removed code is resolved at the merge base.
    assert_eq!(d.removed.len(), 1);
    assert_eq!(d.removed[0].name, "auto_approve");
    assert_eq!(d.removed[0].code_ref.at_base, Some(true));

    assert_eq!(d.ask_suggestions.len(), 3);
    assert_eq!(out.report.verified, 5);
    assert_eq!(out.report.dropped, 0);
    assert_eq!(out.report.files_explored, Some(0));
    assert_eq!(backend.calls(), 1);
}

#[tokio::test]
async fn discovery_prompt_is_layered_in_spec_order() {
    let fx =
        order_repo_with(|dir| write(dir, ".grsp/prompt.md", "Money paths matter most here.\n"));
    let (runner, backend) = scripted([GOOD_DISCOVERY]);
    discovery::run(&runner, &ctx(&fx, DESCRIPTION), &RunHooks::silent())
        .await
        .unwrap();
    let prompts = backend.prompts.lock().unwrap();
    let p = &prompts[0];
    let pos = |needle: &str| {
        p.find(needle)
            .unwrap_or_else(|| panic!("prompt is missing {needle:?}"))
    };
    // 1 preamble → 2 pipeline instruction → 3 context pack → 5 repo prompt.
    assert!(pos("Every claim about the code needs a CodeRef") < pos("### Required investigation"));
    assert!(pos("### Required investigation") < pos("Require approval for large orders"));
    assert!(pos("Require approval for large orders") < pos(DESCRIPTION));
    assert!(pos(DESCRIPTION) < pos("## Changed files"));
    assert!(pos("## Changed files") < pos("+    if requires_approval(order):"));
    // (The repo prompt file is itself part of this diff, so look at its last occurrence.)
    assert!(
        pos("+    if requires_approval(order):")
            < p.rfind("Money paths matter most here.").unwrap()
    );
    assert!(pos("# Instructions from this repository (.grsp/prompt.md)") > pos("## Diff"));
    // The lock file is excluded from the DiffMap and so from the prompt's diff.
    assert!(!p.contains("### package-lock.json"));
    assert!(p.contains("generated, vendored or lock files"));
    // No review-prompt layer outside the review pipeline.
    assert!(!p.contains("The reviewer's own review instructions"));
}

const BAD_DISCOVERY: &str = r#"{
  "behaviourSummary": "Orders over the threshold need approval.",
  "entryPoints": [
    { "id": "ghost", "label": "DELETE /orders", "kind": "http",
      "ref": { "file": "orders/ghost.py", "startLine": 3, "anchor": "def delete_orders" }, "effect": "x", "risk": "high" },
    { "id": "ep1", "label": "POST /orders", "kind": "http", "status": "new", "tag": "new",
      "ref": { "file": "orders/api.py", "startLine": 2, "anchor": "def post_orders(request)" }, "effect": "x", "risk": "high" },
    { "id": "ep3", "label": "PUT /orders", "kind": "http",
      "ref": { "file": "orders/api.py", "startLine": 10, "anchor": "def totally_made_up(request)" }, "effect": "x", "risk": "low" },
    { "id": "ep4", "label": "nightly job", "kind": "job",
      "ref": { "file": "orders/api.py", "startLine": 400 }, "effect": "x", "risk": "low" },
    { "id": "ep5", "label": "no ref at all", "kind": "cli", "effect": "x", "risk": "low" }
  ],
  "gaps": [
    { "ref": { "file": "orders/services.py", "startLine": 7, "endLine": 10, "anchor": "if requires_approval(order):" },
      "writeTarget": "orders", "explanation": "claims changed code is a gap", "entryPointId": "ep1" },
    { "ref": { "file": "orders/imports.py", "startLine": 6, "anchor": "Order.objects.bulk_create(orders)" },
      "writeTarget": "orders", "explanation": "real gap, but points at an entry point that doesn't exist", "entryPointId": "ep-nowhere" }
  ],
  "mismatches": [
    { "claim": "All orders need approval", "reality": "Refunds don't",
      "refs": [ { "file": "orders/refunds.py", "startLine": 1, "anchor": "def refund" } ] }
  ],
  "removed": [
    { "ref": { "file": "orders/api.py", "startLine": 5, "anchor": "def post_orders(request)" }, "name": "post_orders" }
  ],
  "askSuggestions": ["a?", "a?", "b?", "c?", "d?"]
}"#;

#[tokio::test]
async fn discovery_bad_reply_is_dropped_snapped_or_flagged() {
    let fx = order_repo();
    let (runner, _) = scripted([BAD_DISCOVERY]);
    let out = discovery::run(&runner, &ctx(&fx, DESCRIPTION), &RunHooks::silent())
        .await
        .unwrap();
    let d = out.result;

    // Hallucinated file, wrong anchor, out-of-range line and missing ref are
    // all dropped. Only the entry point whose anchor could be found survives.
    assert_eq!(d.entry_points.len(), 1, "{:?}", d.entry_points);
    let ep = &d.entry_points[0];
    assert_eq!(ep.id, "ep1");
    // Wrong line number, right anchor: snapped to where the anchor really is.
    assert_eq!(ep.code_ref.start_line, 5);
    assert_eq!(ep.code_ref.snapped, Some(true));
    assert!(ep.code_ref.verified);
    // The agent said "new" about unchanged code. Ignored: Rust derives the tag.
    assert_eq!(ep.tag, AffectedTag::Changed);
    assert!(!ep.has_gap);

    // A "gap" inside the diff isn't a gap. The real one stays, without the
    // dangling entry point id.
    assert_eq!(d.gaps.len(), 1);
    assert_eq!(d.gaps[0].code_ref.file, "orders/imports.py");
    assert_eq!(d.gaps[0].entry_point_id, None);

    // A mismatch with no verified ref is never shown.
    assert!(d.mismatches.is_empty());
    // "Removed" code that still exists isn't listed.
    assert!(d.removed.is_empty());
    assert_eq!(d.ask_suggestions, vec!["a?", "b?", "c?"]);

    assert!(out.report.dropped >= 5, "{:?}", out.report);
    assert!(
        out.report
            .notes
            .iter()
            .any(|n| n.contains("part of this diff")),
        "{:?}",
        out.report.notes
    );
}

#[tokio::test]
async fn discovery_without_a_description_reports_no_mismatches() {
    let fx = order_repo();
    let (runner, _) = scripted([GOOD_DISCOVERY]);
    let out = discovery::run(&runner, &ctx(&fx, "   "), &RunHooks::silent())
        .await
        .unwrap();
    assert!(out.result.description_empty);
    assert!(out.result.mismatches.is_empty());
    // The gap itself is a code fact and is still shown.
    assert_eq!(out.result.gaps.len(), 1);
}

#[tokio::test]
async fn malformed_json_is_repaired_by_one_retry() {
    let fx = order_repo();
    let truncated = &GOOD_DISCOVERY[..GOOD_DISCOVERY.len() / 2];
    let (runner, backend) = scripted([
        format!("Here is the analysis:\n```json\n{truncated}"),
        GOOD_DISCOVERY.to_string(),
    ]);
    let out = discovery::run(&runner, &ctx(&fx, DESCRIPTION), &RunHooks::silent())
        .await
        .unwrap();
    assert_eq!(out.result.entry_points.len(), 2);
    assert_eq!(backend.calls(), 2);
    let prompts = backend.prompts.lock().unwrap();
    assert!(prompts[1].starts_with(prompts[0].as_str()));
    assert!(prompts[1].contains("Your previous reply could not be used"));
    assert!(prompts[1].contains("Here is the analysis:"));
}

#[tokio::test]
async fn malformed_json_twice_is_an_error_with_a_raw_excerpt() {
    let fx = order_repo();
    let (runner, backend) = scripted([
        "I looked around and it seems fine.",
        "Sorry, still thinking { not json",
    ]);
    let err = discovery::run(&runner, &ctx(&fx, DESCRIPTION), &RunHooks::silent())
        .await
        .unwrap_err();
    match &err {
        AgentError::BadOutput { message, details } => {
            assert!(message.contains("couldn't be read"), "{message}");
            assert!(details.contains("still thinking"));
        }
        other => panic!("expected BadOutput, got {other:?}"),
    }
    assert!(err.details().is_some());
    assert_eq!(backend.calls(), 2);
}

#[tokio::test]
async fn valid_json_of_the_wrong_shape_is_a_schema_failure() {
    let fx = order_repo();
    // Parses as JSON, but isn't a discovery result.
    let (runner, backend) = scripted([r#"{"result": "looks fine", "files": 3}"#, GOOD_DISCOVERY]);
    let out = discovery::run(&runner, &ctx(&fx, DESCRIPTION), &RunHooks::silent())
        .await
        .unwrap();
    assert_eq!(out.result.entry_points.len(), 2);
    assert_eq!(backend.calls(), 2);
    assert!(backend.prompts.lock().unwrap()[1].contains("behaviourSummary"));
}

#[tokio::test]
async fn a_cancelled_run_never_reaches_the_agent() {
    let fx = order_repo();
    let (runner, backend) = scripted([GOOD_DISCOVERY]);
    let hooks = RunHooks::silent();
    hooks.cancel.cancel();
    let err = discovery::run(&runner, &ctx(&fx, DESCRIPTION), &hooks)
        .await
        .unwrap_err();
    assert_eq!(err, AgentError::Cancelled);
    assert_eq!(backend.calls(), 0);
}

// ── Sharded discovery (SPEC §4.3) ──────────────────────────

fn large_repo() -> Fixture {
    order_repo_with(|dir| {
        for pkg in ["billing", "shipping", "search"] {
            for i in 0..22 {
                write(
                    dir,
                    &format!("{pkg}/mod{i}.py"),
                    &format!("def handler_{i}():\n    return {i}\n"),
                );
            }
        }
    })
}

fn shard_reply(label: &str, file: &str) -> String {
    format!(
        r#"{{ "behaviourSummary": "Part about {label}.",
             "entryPoints": [
               {{ "id": "ep1", "label": "{label} handler", "kind": "api",
                  "ref": {{ "file": "{file}", "startLine": 1, "endLine": 2, "anchor": "def handler_0()" }}, "effect": "new", "risk": "low" }},
               {{ "id": "ep2", "label": "POST /orders", "kind": "http",
                  "ref": {{ "file": "orders/api.py", "startLine": 5, "endLine": 7, "anchor": "def post_orders(request)" }}, "effect": "held", "risk": "high" }}
             ],
             "askSuggestions": ["{label}?"] }}"#
    )
}

#[tokio::test]
async fn large_prs_are_analysed_in_parts_and_merged() {
    let fx = large_repo();
    let c = ctx(&fx, DESCRIPTION);
    assert!(c.bundle.stats.files > 60);
    let merged = r#"{ "behaviourSummary": "Three new packages and an approval rule.",
        "entryPoints": [
          { "id": "ep1", "label": "POST /orders", "kind": "http",
            "ref": { "file": "orders/api.py", "startLine": 5, "endLine": 7, "anchor": "def post_orders(request)" }, "effect": "held", "risk": "high" },
          { "id": "ep2", "label": "billing handler", "kind": "api",
            "ref": { "file": "billing/mod0.py", "startLine": 1, "endLine": 2, "anchor": "def handler_0()" }, "effect": "new", "risk": "low" }
        ],
        "askSuggestions": ["a?", "b?", "c?"] }"#;
    let shard = shard_reply("billing", "billing/mod0.py");
    let (runner, backend) = scripted([
        shard.clone(),
        shard.clone(),
        shard.clone(),
        shard,
        merged.to_string(),
    ]);

    let progress = std::sync::Arc::new(std::sync::Mutex::new(Vec::<String>::new()));
    let sink = progress.clone();
    let mut hooks = RunHooks::silent();
    hooks.progress = std::sync::Arc::new(move |l| sink.lock().unwrap().push(l));

    let out = discovery::run(&runner, &c, &hooks).await.unwrap();
    let shards = out.result.shards.expect("sharded");
    assert!((2..=4).contains(&shards), "{shards}");
    // One pass per part plus the merge pass.
    assert_eq!(backend.calls() as u32, shards + 1);
    assert_eq!(
        out.result.behaviour_summary,
        "Three new packages and an approval rule."
    );
    assert_eq!(out.result.entry_points.len(), 2);
    // A handler in a file the PR adds is New; that comes from git.
    let billing = out
        .result
        .entry_points
        .iter()
        .find(|e| e.label == "billing handler")
        .unwrap();
    assert_eq!(billing.tag, AffectedTag::New);
    assert!(out
        .report
        .notes
        .iter()
        .any(|n| n == &format!("Large PR: analysed in {shards} parts.")));
    assert!(progress
        .lock()
        .unwrap()
        .iter()
        .any(|l| l.starts_with("Large PR: analysing in")));

    // Each part's prompt has the whole file list but only its own diffs.
    let prompts = backend.prompts.lock().unwrap();
    let part_prompts: Vec<&String> = prompts
        .iter()
        .filter(|p| p.contains("This is one part of a large pull request"))
        .collect();
    assert_eq!(part_prompts.len() as u32, shards);
    for p in &part_prompts {
        assert!(p.contains("- search/mod0.py"));
        assert!(p.contains("- billing/mod0.py"));
    }
    assert!(part_prompts
        .iter()
        .any(|p| !p.contains("### search/mod0.py")));
    assert!(prompts.last().unwrap().contains("Merge the parts"));
}

#[tokio::test]
async fn a_failed_merge_pass_falls_back_to_a_deterministic_merge() {
    let fx = large_repo();
    let c = ctx(&fx, DESCRIPTION);
    let shard = shard_reply("billing", "billing/mod0.py");
    // Four parts at most; the merge pass and its repair retry both fail.
    let mut replies = vec![shard.clone(), shard.clone(), shard.clone(), shard];
    let n = grsp_lib::git::plan_shards(c.map(), 4).len();
    replies.truncate(n);
    replies.push("not json".to_string());
    replies.push("still not json".to_string());
    let (runner, _) = scripted(replies);
    let out = discovery::run(&runner, &c, &RunHooks::silent())
        .await
        .unwrap();
    assert_eq!(out.result.shards, Some(n as u32));
    // The duplicate entry points across parts were merged.
    assert_eq!(out.result.entry_points.len(), 2);
    assert_eq!(out.result.entry_points[0].label, "POST /orders");
}

// ── Questions ──────────────────────────────────────────────

#[tokio::test]
async fn questions_without_a_verified_ref_are_dropped() {
    let fx = order_repo();
    let d = good_discovery(&fx).await;
    let reply = r#"{ "questions": [
        { "id": "q1", "question": "What happens to an order of exactly 10,000?", "answer": "It is not held: the check is strictly greater than.",
          "refs": [ { "file": "orders/policy.py", "startLine": 5, "anchor": "order.total > APPROVAL_THRESHOLD" } ] },
        { "id": "q2", "question": "Are refunds held too?", "answer": "Yes.",
          "refs": [ { "file": "orders/refunds.py", "startLine": 10, "anchor": "def refund" } ] },
        { "id": "q3", "question": "Do imported orders get checked?", "answer": "No, bulk_create bypasses it.",
          "refs": [ { "file": "orders/imports.py", "startLine": 1, "anchor": "Order.objects.bulk_create(orders)" } ] },
        { "id": "q4", "question": "Trivia with no refs?", "answer": "n/a", "refs": [] }
    ] }"#;
    let (runner, backend) = scripted([reply]);
    let out = questions::run(&runner, &ctx(&fx, DESCRIPTION), &d, &RunHooks::silent())
        .await
        .unwrap();
    let qs = out.result.questions;
    assert_eq!(
        qs.iter().map(|q| q.id.as_str()).collect::<Vec<_>>(),
        vec!["q1", "q3"]
    );
    assert!(qs.iter().all(|q| !q.opened));
    // q3's line was wrong but its anchor is five lines down: snapped.
    assert_eq!(qs[1].refs[0].start_line, 6);
    assert_eq!(qs[1].refs[0].snapped, Some(true));
    assert_eq!(out.report.dropped, 1);
    // The discovery result is part of the prompt.
    let prompts = backend.prompts.lock().unwrap();
    assert!(prompts[0].contains("Discovery result"));
    assert!(prompts[0].contains("POST /orders/import"));
}

#[tokio::test]
async fn questions_accept_the_spec_bare_array_and_reject_an_empty_reply() {
    let fx = order_repo();
    let d = good_discovery(&fx).await;
    let array = r#"[ { "id": "q1", "question": "Q?", "answer": "A.", "refs": [ { "file": "orders/policy.py", "startLine": 4, "anchor": "def requires_approval(order)" } ] } ]"#;
    let (runner, _) = scripted([array]);
    let out = questions::run(&runner, &ctx(&fx, DESCRIPTION), &d, &RunHooks::silent())
        .await
        .unwrap();
    assert_eq!(out.result.questions.len(), 1);

    let (runner, backend) = scripted([r#"{"questions": []}"#, r#"{"questions": []}"#]);
    let err = questions::run(&runner, &ctx(&fx, DESCRIPTION), &d, &RunHooks::silent())
        .await
        .unwrap_err();
    assert!(matches!(err, AgentError::BadOutput { .. }));
    assert_eq!(backend.calls(), 2);
}

// ── Walkthrough ────────────────────────────────────────────

const WALKTHROUGH: &str = r#"{
  "blocks": [
    { "id": "b1", "label": "post_orders", "kind": "route", "status": "changed",
      "ref": { "file": "orders/api.py", "startLine": 5, "endLine": 7, "anchor": "def post_orders(request)" },
      "note": "Receives the request.", "next": ["b2"], "decision": null },
    { "id": "b2", "label": "create_order", "kind": "service",
      "ref": { "file": "orders/services.py", "startLine": 5, "endLine": 13, "anchor": "def create_order(data)" },
      "note": "Now asks the policy before saving.", "next": ["b3"],
      "decision": { "condition": "order total over 10,000", "yes": "REQUIRES_APPROVAL", "no": "OK",
                    "ref": { "file": "orders/services.py", "startLine": 7, "anchor": "if requires_approval(order):" } } },
    { "id": "b3", "label": "requires_approval", "kind": "policy",
      "ref": { "file": "orders/policy.py", "startLine": 4, "endLine": 5, "anchor": "def requires_approval(order)" },
      "note": "New rule.", "next": ["b4"], "decision": null },
    { "id": "b4", "label": "ApprovalQueue.enqueue", "kind": "db_write",
      "ref": { "file": "orders/approvals.py", "startLine": 12, "anchor": "def enqueue" },
      "note": "Invented block.", "next": ["b5"], "decision": null },
    { "id": "b5", "label": "notify_created", "kind": "event",
      "ref": { "file": "orders/services.py", "startLine": 16, "endLine": 17, "anchor": "def notify_created(order)" },
      "note": "Publishes order.created.", "next": [], "decision": null }
  ],
  "whatIf": {
    "variable": "order total",
    "options": [
      { "label": "€1", "path": ["b1", "b2", "b99"] },
      { "label": "€9,999", "path": ["b1", "b2", "b3", "b5"], "taken": { "b2": "no", "b3": "no" }, "notes": { "b2": "Saved as OK." } },
      { "label": "€10,000", "path": ["b1", "b2", "b3", "b5"], "taken": { "b2": "no" } },
      { "label": "€25,000", "path": ["b1", "b2", "b3", "b4", "b5"], "taken": { "b2": "yes" }, "notes": { "b2": "Held for approval.", "b4": "Queued." } }
    ],
    "notes": { "€10,000": "Exactly the threshold is not over it." }
  }
}"#;

#[tokio::test]
async fn walkthrough_blocks_get_status_excerpts_and_checked_edges() {
    let fx = order_repo();
    let d = good_discovery(&fx).await;
    let (runner, backend) = scripted([WALKTHROUGH]);
    let out = walkthrough::run(
        &runner,
        &ctx(&fx, DESCRIPTION),
        &d,
        "ep1",
        2,
        &RunHooks::silent(),
    )
    .await
    .unwrap();
    let w = out.result;
    assert_eq!(w.entry_point_id, "ep1");

    // The invented block is removed and the path re-linked around it.
    let ids: Vec<&str> = w.blocks.iter().map(|b| b.id.as_str()).collect();
    assert_eq!(ids, vec!["b1", "b2", "b3", "b5"]);
    let b = |id: &str| w.blocks.iter().find(|b| b.id == id).unwrap();
    assert_eq!(b("b3").next, vec!["b5"]);
    assert_eq!(w.path, vec!["b1", "b2", "b3", "b5"]);

    // Change chips come from the DiffMap, whatever the agent claimed.
    assert_eq!(b("b1").status, ChangeStatus::Unchanged);
    assert_eq!(b("b2").status, ChangeStatus::Changed);
    assert_eq!(b("b3").status, ChangeStatus::New);
    assert_eq!(b("b5").status, ChangeStatus::Unchanged);

    // Code is read by Rust, with diff markers from the DiffMap.
    let ex = &b("b2").excerpt;
    assert_eq!((ex.start_line, ex.end_line), (5, 13));
    let line7 = ex.lines.iter().find(|l| l.n == 7).unwrap();
    assert_eq!(line7.text, "    if requires_approval(order):");
    assert_eq!(line7.sign, "+");
    assert_eq!(ex.lines.iter().find(|l| l.n == 6).unwrap().sign, " ");

    // Edge spot-check: api → create_order and create_order → requires_approval
    // are visible in the caller's text. The re-linked policy → notify edge isn't.
    assert!(b("b1").unconfirmed_edges.is_empty());
    assert!(b("b2").unconfirmed_edges.is_empty());
    assert_eq!(b("b3").unconfirmed_edges, vec!["b5"]);

    let dec = b("b2").decision.as_ref().unwrap();
    assert_eq!(dec.condition, "order total over 10,000");
    assert_eq!(dec.code_ref.as_ref().unwrap().start_line, 7);

    // What if: the option with an invented block id is discarded; the others
    // keep paths made only of blocks that exist.
    let wi = w.what_if.expect("what-if");
    assert_eq!(wi.variable, "order total");
    let labels: Vec<&str> = wi.options.iter().map(|o| o.label.as_str()).collect();
    assert_eq!(labels, vec!["€9,999", "€10,000", "€25,000"]);
    for o in &wi.options {
        assert_eq!(o.path, vec!["b1", "b2", "b3", "b5"]);
    }
    let low = &wi.options[0];
    // `taken` only for blocks that have a decision.
    assert_eq!(
        low.taken.as_ref().unwrap().get("b2").map(String::as_str),
        Some("no")
    );
    assert!(!low.taken.as_ref().unwrap().contains_key("b3"));
    assert_eq!(
        low.notes.as_ref().unwrap().get("b2").map(String::as_str),
        Some("Saved as OK.")
    );
    assert_eq!(
        wi.options[1].note.as_deref(),
        Some("Exactly the threshold is not over it.")
    );
    let high = &wi.options[2];
    assert_eq!(
        high.taken.as_ref().unwrap().get("b2").map(String::as_str),
        Some("yes")
    );
    assert!(!high.notes.as_ref().unwrap().contains_key("b4"));

    assert!(out.report.dropped >= 1);
    let prompts = backend.prompts.lock().unwrap();
    assert!(prompts[0].contains("## The entry point to trace"));
    assert!(prompts[0].contains("- label: POST /orders\n"));
    assert!(prompts[0].contains("handler: orders/api.py lines 5-7"));
}

#[tokio::test]
async fn walkthrough_marks_a_confirmed_gap_as_not_covered() {
    let fx = order_repo();
    let d = good_discovery(&fx).await;
    let reply = r#"{ "blocks": [
        { "id": "b1", "label": "post_orders_import", "kind": "route",
          "ref": { "file": "orders/api.py", "startLine": 10, "endLine": 12, "anchor": "def post_orders_import(request)" }, "note": "n", "next": ["b2"] },
        { "id": "b2", "label": "import_orders", "kind": "db_write",
          "ref": { "file": "orders/imports.py", "startLine": 4, "endLine": 7, "anchor": "def import_orders(rows)" }, "note": "n", "next": [] }
      ], "whatIf": null }"#;
    let (runner, _) = scripted([reply]);
    let out = walkthrough::run(
        &runner,
        &ctx(&fx, DESCRIPTION),
        &d,
        "ep2",
        2,
        &RunHooks::silent(),
    )
    .await
    .unwrap();
    assert_eq!(out.result.blocks[0].status, ChangeStatus::Unchanged);
    assert_eq!(out.result.blocks[1].status, ChangeStatus::NotCovered);
    assert!(out.result.what_if.is_none());
}

#[tokio::test]
async fn walkthrough_with_nothing_verifiable_is_an_error_not_an_empty_view() {
    let fx = order_repo();
    let d = good_discovery(&fx).await;
    let reply = r#"{ "blocks": [ { "id": "b1", "label": "x", "kind": "route",
        "ref": { "file": "nope/missing.py", "startLine": 1, "anchor": "def x" }, "note": "n", "next": [] } ] }"#;
    let (runner, _) = scripted([reply]);
    let err = walkthrough::run(
        &runner,
        &ctx(&fx, DESCRIPTION),
        &d,
        "ep1",
        2,
        &RunHooks::silent(),
    )
    .await
    .unwrap_err();
    assert!(matches!(err, AgentError::BadOutput { .. }));

    // An entry point id that isn't in the discovery result never reaches the agent.
    let (runner, backend) = scripted([reply]);
    let err = walkthrough::run(
        &runner,
        &ctx(&fx, DESCRIPTION),
        &d,
        "ep9",
        2,
        &RunHooks::silent(),
    )
    .await
    .unwrap_err();
    assert!(matches!(err, AgentError::Failed { .. }));
    assert_eq!(backend.calls(), 0);
}

// ── Ask ────────────────────────────────────────────────────

#[tokio::test]
async fn ask_answer_has_a_verified_excerpt_and_refs() {
    let fx = order_repo();
    let d = good_discovery(&fx).await;
    let reply = r#"{ "paragraphs": ["An order of exactly 10,000 is not held.", "The comparison is strictly greater than."],
        "excerpt": { "file": "orders/services.py", "startLine": 5, "endLine": 13, "anchor": "def create_order(data)" },
        "highlight": { "file": "orders/services.py", "startLine": 7, "anchor": "if requires_approval(order):" },
        "refs": [ { "file": "orders/policy.py", "startLine": 5, "anchor": "order.total > APPROVAL_THRESHOLD" },
                  { "file": "orders/limits.py", "startLine": 2, "anchor": "LIMIT" } ],
        "confidence": "high", "grounded": true }"#;
    let (runner, backend) = scripted([reply]);
    let earlier = AskMessage {
        id: "m0".into(),
        question: "Who can approve?".into(),
        answer: Some(AskAnswer {
            paragraphs: vec!["Nothing in this change says.".into()],
            grounded: false,
            ..Default::default()
        }),
        ..Default::default()
    };
    let out = ask::run(
        &runner,
        &ctx(&fx, DESCRIPTION),
        Some(&d),
        &[earlier],
        "What about exactly 10,000?",
        &RunHooks::silent(),
    )
    .await
    .unwrap();
    let a = out.result;
    assert_eq!(a.paragraphs.len(), 2);
    assert!(a.grounded);
    assert_eq!(a.confidence, Level::High);
    let ex = a.excerpt.expect("excerpt");
    assert_eq!(ex.file, "orders/services.py");
    assert_eq!(
        ex.lines
            .iter()
            .filter(|l| l.highlight == Some(true))
            .map(|l| l.n)
            .collect::<Vec<_>>(),
        vec![7]
    );
    // The hallucinated ref is dropped; the real one stays.
    assert_eq!(a.refs.len(), 1);
    assert_eq!(a.refs[0].file, "orders/policy.py");
    assert_eq!(out.report.dropped, 1);
    assert_eq!(out.report.verified, 3);

    let prompts = backend.prompts.lock().unwrap();
    assert!(prompts[0].contains("## The reviewer's question\n\nWhat about exactly 10,000?"));
    assert!(prompts[0].contains("Q: Who can approve?\nA: Nothing in this change says."));
}

#[tokio::test]
async fn ask_about_something_absent_is_ungrounded() {
    let fx = order_repo();
    let reply = r#"{ "paragraphs": ["There is no direct match in this repository: nothing here handles refunds.", "The closest code is the order import."],
        "excerpt": null, "highlight": null,
        "refs": [ { "file": "orders/imports.py", "startLine": 4, "anchor": "def import_orders(rows)" } ],
        "confidence": "low", "grounded": false }"#;
    let (runner, _) = scripted([reply]);
    // Works without a discovery result too.
    let out = ask::run(
        &runner,
        &ctx(&fx, DESCRIPTION),
        None,
        &[],
        "How are refunds approved?",
        &RunHooks::silent(),
    )
    .await
    .unwrap();
    assert!(!out.result.grounded);
    assert!(out.result.excerpt.is_none());
    assert_eq!(out.result.confidence, Level::Low);
    assert_eq!(out.result.refs.len(), 1);
    assert!(out.result.paragraphs[0].contains("no direct match"));
}

#[tokio::test]
async fn ask_claiming_grounding_with_nothing_verified_is_flagged() {
    let fx = order_repo();
    let reply = r#"{ "paragraphs": ["Refunds are approved by managers."],
        "excerpt": { "file": "orders/refunds.py", "startLine": 3, "endLine": 9, "anchor": "def approve_refund" },
        "refs": [ { "file": "orders/refunds.py", "startLine": 3, "anchor": "def approve_refund" } ],
        "confidence": "high", "grounded": true }"#;
    let (runner, _) = scripted([reply]);
    let out = ask::run(
        &runner,
        &ctx(&fx, DESCRIPTION),
        None,
        &[],
        "How are refunds approved?",
        &RunHooks::silent(),
    )
    .await
    .unwrap();
    assert!(out.result.excerpt.is_none());
    assert!(out.result.refs.is_empty());
    assert_eq!(out.result.confidence, Level::Low);
    assert_eq!(out.report.unverified, 1);
    assert_eq!(out.report.dropped, 2);
}

// ── Discussion ─────────────────────────────────────────────

fn threads() -> Vec<DiscussionThread> {
    let c = |id: &str, author: &str, body: &str| DiscussionComment {
        id: id.into(),
        author: author.into(),
        body: body.into(),
        created_at: "2026-05-01T10:00:00Z".into(),
    };
    vec![
        DiscussionThread {
            id: "T_1".into(),
            path: Some("orders/policy.py".into()),
            line: Some(1),
            resolved: true,
            gist: None,
            comments: vec![
                c("1", "ana", "Why hard-code it?"),
                c(
                    "2",
                    "maya",
                    "```suggestion\nAPPROVAL_THRESHOLD = settings.LIMIT\n```",
                ),
            ],
        },
        DiscussionThread {
            id: "issue-9".into(),
            path: None,
            line: None,
            resolved: false,
            gist: None,
            comments: vec![c("9", "zed", "What about imports?")],
        },
    ]
}

#[tokio::test]
async fn discussion_with_no_comments_never_runs_the_agent() {
    let fx = order_repo();
    let (runner, backend) = scripted(["{}"]);
    let out = discussion::run(
        &runner,
        &ctx(&fx, DESCRIPTION),
        Vec::new(),
        &RunHooks::silent(),
    )
    .await
    .unwrap();
    assert_eq!(out.result.comment_count, 0);
    assert!(out.result.digest.is_empty());
    assert!(out.result.threads.is_empty());
    assert_eq!(backend.calls(), 0);
}

#[tokio::test]
async fn discussion_threads_are_api_facts_with_agent_gists_attached() {
    let fx = order_repo();
    let reply = r#"{ "digest": "ana asked for the limit to be configurable and maya agreed. zed's question about imports is unanswered.",
        "threadGists": { "T_1": "Limit should be configurable; author applied a suggestion to read it from settings instead of a constant",
                         "issue-9": "Asks whether imports are covered; unanswered",
                         "T_invented": "A thread that doesn't exist" } }"#;
    let (runner, backend) = scripted([reply]);
    let out = discussion::run(
        &runner,
        &ctx(&fx, DESCRIPTION),
        threads(),
        &RunHooks::silent(),
    )
    .await
    .unwrap();
    let r = out.result;
    assert!(r.digest.starts_with("ana asked"));
    assert_eq!(r.comment_count, 3);
    assert_eq!(r.threads.len(), 2);
    // Facts pass through untouched: authors, resolved state, suggestion blocks.
    assert!(r.threads[0].resolved);
    assert!(r.threads[0].comments[1].body.starts_with("```suggestion"));
    // Gists are capped at 12 words.
    let gist = r.threads[0].gist.as_deref().unwrap();
    assert_eq!(gist.trim_end_matches('…').split_whitespace().count(), 12);
    assert!(gist.ends_with('…'));
    assert_eq!(
        r.threads[1].gist.as_deref(),
        Some("Asks whether imports are covered; unanswered")
    );

    let prompts = backend.prompts.lock().unwrap();
    assert!(prompts[0].contains("### Thread id: T_1"));
    assert!(prompts[0].contains("on orders/policy.py line 1; resolved"));
    // The digest is about the conversation: no raw diff in this prompt.
    assert!(!prompts[0].contains("```diff"));
}

// ── Review ─────────────────────────────────────────────────

const REVIEW: &str = r#"{
  "findings": [
    { "id": "f1", "severity": "should_fix", "title": "Threshold is hard-coded", "why": "Changing the limit needs a deploy.",
      "ref": { "file": "orders/policy.py", "startLine": 1, "anchor": "APPROVAL_THRESHOLD = 10000" }, "suggestedComment": "Could this come from settings?" },
    { "id": "f2", "severity": "blocking", "title": "Bulk import skips approval", "why": "Imported orders over the limit are never held.",
      "ref": { "file": "orders/imports.py", "startLine": 6, "anchor": "Order.objects.bulk_create(orders)" }, "suggestedComment": "This path writes orders without the approval check." },
    { "id": "f3", "severity": "blocking", "title": "Refunds are unchecked", "why": "x",
      "ref": { "file": "orders/refunds.py", "startLine": 4, "anchor": "def refund" }, "suggestedComment": "x" },
    { "id": "f4", "severity": "nit", "title": "Status string is duplicated", "why": "Use a constant.",
      "ref": { "file": "orders/services.py", "startLine": 3, "anchor": "order.status = \"REQUIRES_APPROVAL\"" }, "suggestedComment": "Pull this into a constant." },
    { "id": "f5", "severity": "nit", "title": "Unchanged line in a changed file", "why": "Far from any hunk.",
      "ref": { "file": "orders/services.py", "startLine": 17, "anchor": "publish(\"order.created\", order.id)" }, "suggestedComment": "Consider logging here." }
  ],
  "summary": "The rule is right, but the bulk import bypasses it."
}"#;

#[tokio::test]
async fn review_findings_are_verified_anchored_and_ready_to_post() {
    let fx =
        order_repo_with(|dir| write(dir, ".grsp/prompt.md", "Flag anything touching money.\n"));
    let d = good_discovery(&fx).await;
    let disc = DiscussionResult {
        digest: "The limit question is settled.".into(),
        threads: threads(),
        comment_count: 3,
    };
    let (runner, backend) = scripted([REVIEW]);
    let c = ctx(&fx, DESCRIPTION);
    let out = review::run(
        &runner,
        &c,
        Some(&d),
        Some(&disc),
        "Be strict about data integrity.",
        &RunHooks::silent(),
    )
    .await
    .unwrap();
    let r = out.result;
    assert!(r.repo_prompt_active);
    assert_eq!(
        r.summary,
        "The rule is right, but the bulk import bypasses it."
    );

    // The finding on a file that doesn't exist is dropped; blocking sorts first.
    let ids: Vec<&str> = r.findings.iter().map(|f| f.id.as_str()).collect();
    assert_eq!(ids, vec!["f2", "f1", "f4", "f5"]);
    let f = |id: &str| r.findings.iter().find(|f| f.id == id).unwrap();

    // Anchoring comes from the DiffMap: added and context lines in a hunk
    // post inline; anything else goes in the summary.
    assert_eq!(f("f1").anchoring, Anchoring::Inline);
    assert_eq!(f("f2").anchoring, Anchoring::Summary);
    // Wrong line number, right anchor: snapped onto the added line.
    assert_eq!(f("f4").code_ref.start_line, 8);
    assert_eq!(f("f4").code_ref.snapped, Some(true));
    assert_eq!(f("f4").anchoring, Anchoring::Inline);
    assert_eq!(f("f5").anchoring, Anchoring::Summary);

    assert!(r.findings.iter().all(|f| f.included && f.code_ref.verified));
    assert_eq!(
        f("f2").comment,
        "This path writes orders without the approval check."
    );
    // Each finding's excerpt is read by Rust with its line highlighted.
    let ex = &f("f2").excerpt;
    let hl: Vec<&ExcerptLine> = ex
        .lines
        .iter()
        .filter(|l| l.highlight == Some(true))
        .collect();
    assert_eq!(hl.len(), 1);
    assert_eq!(hl[0].text, "    Order.objects.bulk_create(orders)");
    assert_eq!(out.report.dropped, 1);

    // The payload for GitHub: inline comments on the head side, the rest
    // under "Not in this diff" with file:line written out.
    let payload = review::build_payload(
        &fx.head_sha,
        ReviewEvent::RequestChanges,
        &r.summary,
        &r.findings,
    )
    .unwrap();
    assert_eq!(payload.commit_id, fx.head_sha);
    let inline: Vec<(&str, u32)> = payload
        .comments
        .iter()
        .map(|c| (c.path.as_str(), c.line))
        .collect();
    assert_eq!(
        inline,
        vec![("orders/policy.py", 1), ("orders/services.py", 8)]
    );
    assert!(payload.comments.iter().all(|c| c.side == "RIGHT"));
    assert!(payload.body.starts_with(
        "The rule is right, but the bulk import bypasses it.\n\n### Not in this diff\n\n"
    ));
    assert!(payload
        .body
        .contains("- `orders/imports.py:6` — This path writes orders without the approval check."));
    assert!(payload
        .body
        .contains("- `orders/services.py:17` — Consider logging here."));

    // Prompt layering for review: … context → user's review prompt → repo prompt.
    let prompts = backend.prompts.lock().unwrap();
    let p = &prompts[0];
    let pos = |needle: &str| {
        p.find(needle)
            .unwrap_or_else(|| panic!("prompt is missing {needle:?}"))
    };
    assert!(pos("## Review this pull request") < pos("## Changed files"));
    assert!(pos("## Changed files") < pos("## Existing discussion on this pull request"));
    assert!(pos("- [resolved] orders/policy.py:1") < pos("Be strict about data integrity."));
    assert!(
        pos("Be strict about data integrity.") < p.rfind("Flag anything touching money.").unwrap()
    );
    assert!(
        pos("# The reviewer's own review instructions")
            < pos("# Instructions from this repository (.grsp/prompt.md)")
    );
}

#[tokio::test]
async fn review_with_no_findings_is_a_valid_result() {
    let fx = order_repo();
    let (runner, _) = scripted([r#"{"findings": [], "summary": "Looks sound."}"#]);
    let out = review::run(
        &runner,
        &ctx(&fx, DESCRIPTION),
        None,
        None,
        "",
        &RunHooks::silent(),
    )
    .await
    .unwrap();
    assert!(out.result.findings.is_empty());
    assert!(!out.result.repo_prompt_active);
    assert_eq!(out.result.summary, "Looks sound.");
}
