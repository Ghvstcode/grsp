//! Engine tests: session lifecycle, persistence, events and cancellation in
//! branch-pair and commit mode, with a scripted agent, a temp database and a
//! temp repo. No network and no agent CLI.

mod common;

use std::collections::BTreeSet;
use std::path::PathBuf;
use std::sync::{Arc, Mutex};
use std::time::Duration;

use async_trait::async_trait;
use common::*;
use grsp_lib::agent::{
    AgentBackend, AgentError, AgentOutput, AgentRequest, RunHooks, Runner, ScriptedBackend,
};
use grsp_lib::db;
use grsp_lib::model::*;
use grsp_lib::pipelines::{Engine, EventSink};

#[derive(Default)]
struct Recorder {
    sessions: Mutex<Vec<SessionEvent>>,
    analyses: Mutex<Vec<AnalysisEvent>>,
    asks: Mutex<Vec<AskEvent>>,
}

impl EventSink for Recorder {
    fn session(&self, e: SessionEvent) {
        self.sessions.lock().unwrap().push(e);
    }
    fn analysis(&self, e: AnalysisEvent) {
        self.analyses.lock().unwrap().push(e);
    }
    fn ask(&self, e: AskEvent) {
        self.asks.lock().unwrap().push(e);
    }
}

struct Harness {
    engine: Arc<Engine>,
    events: Arc<Recorder>,
    fx: Fixture,
    data: PathBuf,
}

impl Drop for Harness {
    fn drop(&mut self) {
        let _ = std::fs::remove_dir_all(&self.data);
    }
}

fn harness_with(backend: Arc<dyn AgentBackend>) -> Harness {
    let fx = order_repo();
    let data = temp_dir("engine");
    let events = Arc::new(Recorder::default());
    let engine = Engine::new(
        data.clone(),
        data.clone(),
        Runner::new(backend),
        events.clone(),
    );
    // The frontend inserts repos through plugin-sql; Rust only reads them.
    let conn = engine.conn().unwrap();
    conn.execute(
        "INSERT INTO repos (id, name, path, default_branch) VALUES ('r1', 'orders', ?1, 'main')",
        [fx.dir.to_string_lossy().to_string()],
    )
    .unwrap();
    Harness {
        engine,
        events,
        fx,
        data,
    }
}

fn harness(replies: &[&str]) -> Harness {
    harness_with(Arc::new(ScriptedBackend::new(
        replies.iter().map(|s| s.to_string()),
    )))
}

const QUESTIONS: &str = r#"{ "questions": [ { "id": "q1", "question": "What happens at exactly 10,000?", "answer": "Not held.",
    "refs": [ { "file": "orders/policy.py", "startLine": 5, "anchor": "order.total > APPROVAL_THRESHOLD" } ] } ] }"#;

const WALK: &str = r#"{ "blocks": [ { "id": "b1", "label": "post_orders", "kind": "route",
    "ref": { "file": "orders/api.py", "startLine": 5, "endLine": 7, "anchor": "def post_orders(request)" }, "note": "n", "next": [] } ] }"#;

const REVIEW_REPLY: &str = r#"{ "findings": [ { "id": "f1", "severity": "blocking", "title": "Bulk import skips approval", "why": "w",
    "ref": { "file": "orders/imports.py", "startLine": 6, "anchor": "Order.objects.bulk_create(orders)" }, "suggestedComment": "Cover this path." } ],
    "summary": "One gap." }"#;

const ASK_REPLY: &str = r#"{ "paragraphs": ["Not held."], "excerpt": null,
    "refs": [ { "file": "orders/policy.py", "startLine": 5, "anchor": "order.total > APPROVAL_THRESHOLD" } ], "confidence": "high", "grounded": true }"#;

fn branches() -> NewSessionInput {
    NewSessionInput::Branches {
        repo_id: "r1".into(),
        base: "main".into(),
        head: "feature".into(),
    }
}

async fn wait_for<F: Fn() -> bool>(what: &str, f: F) {
    for _ in 0..600 {
        if f() {
            return;
        }
        tokio::time::sleep(Duration::from_millis(10)).await;
    }
    panic!("timed out waiting for {what}");
}

fn status_of(h: &Harness, sid: &str, kind: &str) -> Option<AnalysisStatus> {
    h.engine
        .list_analyses(sid)
        .ok()?
        .into_iter()
        .find(|a| a.kind == kind)
        .map(|a| a.status)
}

fn session(h: &Harness, sid: &str) -> ReviewSession {
    db::get_session(&h.engine.conn().unwrap(), sid)
        .unwrap()
        .unwrap()
        .session
}

/// Create a branch session and wait for discovery + questions.
async fn ready(h: &Harness) -> String {
    let s = h.engine.create_session(branches()).await.unwrap();
    assert_eq!(s.status, SessionStatus::Preparing);
    let sid = s.id.clone();
    wait_for("questions", || {
        status_of(h, &sid, "questions") == Some(AnalysisStatus::Done)
    })
    .await;
    sid
}

#[tokio::test]
async fn a_branch_session_prepares_then_runs_discovery_and_questions() {
    let h = harness(&[GOOD_DISCOVERY, QUESTIONS]);
    let sid = ready(&h).await;

    let s = session(&h, &sid);
    assert_eq!(s.status, SessionStatus::Ready);
    assert_eq!(s.head_sha.as_deref(), Some(h.fx.head_sha.as_str()));
    assert_eq!(s.merge_base_sha.as_deref(), Some(h.fx.base_sha.as_str()));
    // services.py, policy.py and legacy.py; the lock file is excluded.
    assert_eq!(s.files_changed, 3);
    assert_eq!(s.title, "feature");
    assert_eq!(s.author, "grsp-test");
    // One pass each for discovery and questions (SPEC §4.5).
    assert_eq!(s.agent_passes, 2);
    assert!(h
        .data
        .join("worktrees")
        .join(&sid)
        .join("orders/policy.py")
        .is_file());

    // Only kinds that have run are listed: no discussion in branch mode, no
    // review (auto-run is off), no walkthrough until one is opened.
    let list = h.engine.list_analyses(&sid).unwrap();
    let kinds: BTreeSet<&str> = list.iter().map(|a| a.kind.as_str()).collect();
    assert_eq!(kinds, BTreeSet::from(["discovery", "questions"]));
    for a in &list {
        assert_eq!(a.head_sha, h.fx.head_sha);
        assert!(a.verification.is_some());
    }
    let d: DiscoveryResult = serde_json::from_value(
        list.iter()
            .find(|a| a.kind == "discovery")
            .unwrap()
            .result
            .clone()
            .unwrap(),
    )
    .unwrap();
    assert_eq!(d.entry_points.len(), 2);

    // Plain-language preparing steps were emitted, in order.
    let steps: Vec<String> = h
        .events
        .sessions
        .lock()
        .unwrap()
        .iter()
        .filter_map(|e| e.progress.clone())
        .collect();
    assert_eq!(steps[0], "Resolving main and feature");
    assert!(steps[1].starts_with("Creating a read-only worktree at "));
    assert_eq!(steps[2], "Working out what changed");
    {
        let ev = h.events.analyses.lock().unwrap();
        assert!(ev
            .iter()
            .any(|e| e.kind == "discovery" && e.status == AnalysisStatus::Running));
        assert!(ev
            .iter()
            .any(|e| e.kind == "discovery" && e.status == AnalysisStatus::Done));
    }

    // Creating the same session again returns the existing one.
    let again = h.engine.create_session(branches()).await.unwrap();
    assert_eq!(again.id, sid);
}

#[tokio::test]
async fn opening_a_question_persists_and_shows_in_the_list() {
    let h = harness(&[GOOD_DISCOVERY, QUESTIONS]);
    let sid = ready(&h).await;
    h.engine.set_question_opened(&sid, "q1").unwrap();
    let list = h.engine.list_analyses(&sid).unwrap();
    let q: QuestionsResult = serde_json::from_value(
        list.iter()
            .find(|a| a.kind == "questions")
            .unwrap()
            .result
            .clone()
            .unwrap(),
    )
    .unwrap();
    assert!(q.questions[0].opened);
}

#[tokio::test]
async fn walkthroughs_run_lazily_and_are_cached_by_head() {
    let h = harness(&[GOOD_DISCOVERY, QUESTIONS, WALK]);
    let sid = ready(&h).await;
    assert_eq!(status_of(&h, &sid, "walkthrough:ep1"), None);
    h.engine.start_analysis(&sid, "walkthrough:ep1").unwrap();
    wait_for("walkthrough", || {
        status_of(&h, &sid, "walkthrough:ep1") == Some(AnalysisStatus::Done)
    })
    .await;
    assert_eq!(session(&h, &sid).agent_passes, 3);
    // The cache never serves another head.
    let conn = h.engine.conn().unwrap();
    assert!(
        db::get_analysis(&conn, &sid, "walkthrough:ep1", &h.fx.head_sha)
            .unwrap()
            .is_some()
    );
    assert!(
        db::get_analysis(&conn, &sid, "walkthrough:ep1", &h.fx.base_sha)
            .unwrap()
            .is_none()
    );
    assert!(h.engine.start_analysis(&sid, "nonsense").is_err());
    assert!(h
        .engine
        .start_analysis(&sid, "discussion")
        .unwrap_err()
        .contains("only available for pull requests"));
}

#[tokio::test]
async fn review_findings_get_fresh_ids_keep_edits_and_are_replaced_on_rerun() {
    let h = harness(&[GOOD_DISCOVERY, QUESTIONS, REVIEW_REPLY, REVIEW_REPLY]);
    let sid = ready(&h).await;
    h.engine.run_analysis(&sid, "review", true).await;
    let read = |h: &Harness| -> ReviewResult {
        let list = h.engine.list_analyses(&sid).unwrap();
        serde_json::from_value(
            list.iter()
                .find(|a| a.kind == "review")
                .unwrap()
                .result
                .clone()
                .unwrap(),
        )
        .unwrap()
    };
    let first = read(&h);
    assert_eq!(first.findings.len(), 1);
    let id = first.findings[0].id.clone();
    assert_ne!(id, "f1", "ids must be globally unique, not the agent's");
    assert_eq!(first.findings[0].anchoring, Anchoring::Summary);

    h.engine
        .update_finding(
            &sid,
            &id,
            Some("Please cover the import path."),
            Some(false),
        )
        .unwrap();
    let edited = read(&h);
    assert_eq!(edited.findings[0].comment, "Please cover the import path.");
    assert!(!edited.findings[0].included);

    // Re-running replaces unposted findings.
    h.engine.run_analysis(&sid, "review", true).await;
    let second = read(&h);
    assert_eq!(second.findings.len(), 1);
    assert_ne!(second.findings[0].id, id);
    assert!(second.findings[0].included);
    assert_eq!(
        db::list_findings(&h.engine.conn().unwrap(), &sid, &h.fx.head_sha)
            .unwrap()
            .len(),
        1
    );

    // Branch sessions can't post.
    let err = h
        .engine
        .post_review(
            &sid,
            PostReviewInput {
                event: ReviewEvent::Comment,
                body: "x".into(),
            },
        )
        .await
        .unwrap_err();
    assert!(err.contains("only available for pull requests"), "{err}");
}

#[tokio::test]
async fn ask_returns_a_running_message_then_completes_by_event() {
    let h = harness(&[GOOD_DISCOVERY, QUESTIONS, ASK_REPLY]);
    let sid = ready(&h).await;
    assert!(h.engine.ask_send(&sid, "   ").is_err());
    let msg = h
        .engine
        .ask_send(&sid, "What about exactly 10,000?")
        .unwrap();
    assert_eq!(msg.status, AskStatus::Running);
    assert_eq!(msg.head_sha, h.fx.head_sha);
    wait_for("ask", || {
        h.engine.list_asks(&sid).unwrap()[0].status == AskStatus::Done
    })
    .await;
    let done = &h.engine.list_asks(&sid).unwrap()[0];
    assert_eq!(done.id, msg.id);
    let answer = done.answer.as_ref().unwrap();
    assert!(answer.grounded);
    assert_eq!(answer.refs.len(), 1);
    assert_eq!(done.verification.as_ref().unwrap().verified, 1);
    let asks = h.events.asks.lock().unwrap();
    assert_eq!(asks.last().unwrap().status, AskStatus::Done);
    assert_eq!(asks.last().unwrap().message_id, msg.id);
}

/// Replays discovery and questions, then blocks until cancelled.
struct BlockingBackend {
    scripted: ScriptedBackend,
}

#[async_trait]
impl AgentBackend for BlockingBackend {
    async fn run(&self, req: &AgentRequest, hooks: &RunHooks) -> Result<AgentOutput, AgentError> {
        if self.scripted.calls() < 2 {
            return self.scripted.run(req, hooks).await;
        }
        (hooks.progress)("Reading orders/services.py".to_string());
        hooks.cancel.cancelled().await;
        Err(AgentError::Cancelled)
    }
}

#[tokio::test]
async fn a_cancelled_analysis_or_ask_is_an_error_reading_exactly_cancelled() {
    let h = harness_with(Arc::new(BlockingBackend {
        scripted: ScriptedBackend::new([GOOD_DISCOVERY, QUESTIONS]),
    }));
    let sid = ready(&h).await;

    h.engine.start_analysis(&sid, "walkthrough:ep1").unwrap();
    // While running, the row carries the latest progress line.
    wait_for("progress", || {
        h.engine.list_analyses(&sid).unwrap().iter().any(|a| {
            a.kind == "walkthrough:ep1"
                && a.status == AnalysisStatus::Running
                && a.progress.as_deref() == Some("Reading orders/services.py")
        })
    })
    .await;
    h.engine.cancel_analysis(&sid, "walkthrough:ep1");
    wait_for("cancel", || {
        status_of(&h, &sid, "walkthrough:ep1") == Some(AnalysisStatus::Error)
    })
    .await;
    let list = h.engine.list_analyses(&sid).unwrap();
    let a = list.iter().find(|a| a.kind == "walkthrough:ep1").unwrap();
    assert_eq!(a.error.as_deref(), Some("Cancelled."));
    assert_eq!(a.progress, None);

    let msg = h.engine.ask_send(&sid, "Anything?").unwrap();
    wait_for("ask progress", || {
        h.engine.list_asks(&sid).unwrap()[0].progress.is_some()
    })
    .await;
    h.engine.ask_cancel(&msg.id).unwrap();
    wait_for("ask cancel", || {
        h.engine.list_asks(&sid).unwrap()[0].status == AskStatus::Error
    })
    .await;
    assert_eq!(
        h.engine.list_asks(&sid).unwrap()[0].error.as_deref(),
        Some("Cancelled.")
    );
}

#[tokio::test]
async fn a_moved_head_makes_the_session_stale_and_refresh_reanalyses() {
    let h = harness(&[
        GOOD_DISCOVERY,
        QUESTIONS,
        ASK_REPLY,
        GOOD_DISCOVERY,
        QUESTIONS,
    ]);
    let sid = ready(&h).await;
    h.engine
        .ask_send(&sid, "What about exactly 10,000?")
        .unwrap();
    wait_for("ask", || {
        h.engine.list_asks(&sid).unwrap()[0].status == AskStatus::Done
    })
    .await;

    // A new commit lands on the head branch.
    write(&h.fx.dir, "orders/notes.py", "NOTE = 1\n");
    git_in(&h.fx.dir, &["add", "-A"]);
    git_in(&h.fx.dir, &["commit", "-q", "-m", "more"]);
    let new_head = git_in(&h.fx.dir, &["rev-parse", "HEAD"]);

    // Opening the session checks the head in the background; no agent runs.
    h.engine.open_session(&sid).await.unwrap();
    wait_for("stale", || session(&h, &sid).status == SessionStatus::Stale).await;
    let stale = session(&h, &sid);
    assert_eq!(stale.new_commits, 1);
    assert_eq!(
        stale.head_sha.as_deref(),
        Some(h.fx.head_sha.as_str()),
        "the analysed head stays until Refresh"
    );
    assert_eq!(stale.agent_passes, 3);
    // The old analyses are still served for the old head.
    assert_eq!(h.engine.list_analyses(&sid).unwrap().len(), 2);

    h.engine.refresh_session(&sid).await.unwrap();
    wait_for("refresh", || {
        let s = session(&h, &sid);
        s.status == SessionStatus::Ready
            && s.head_sha.as_deref() == Some(new_head.as_str())
            && status_of(&h, &sid, "questions") == Some(AnalysisStatus::Done)
    })
    .await;
    let fresh = session(&h, &sid);
    assert_eq!(fresh.new_commits, 0);
    assert_eq!(fresh.files_changed, 4);
    assert!(h
        .engine
        .list_analyses(&sid)
        .unwrap()
        .iter()
        .all(|a| a.head_sha == new_head));
    assert!(h
        .data
        .join("worktrees")
        .join(&sid)
        .join("orders/notes.py")
        .is_file());

    // Ask history is kept and distinguishable by the head it was answered at.
    let asks = h.engine.list_asks(&sid).unwrap();
    assert_eq!(asks.len(), 1);
    assert_eq!(asks[0].head_sha, h.fx.head_sha);
    assert_ne!(asks[0].head_sha, new_head);
}

#[tokio::test]
async fn excerpts_read_any_head_file_but_never_leave_the_worktree() {
    let h = harness(&[GOOD_DISCOVERY, QUESTIONS]);
    let sid = ready(&h).await;
    let ex = h
        .engine
        .read_excerpt(&sid, "orders/services.py", 7, 7)
        .unwrap();
    assert_eq!(ex.lines.len(), 1);
    assert_eq!(ex.lines[0].text, "    if requires_approval(order):");
    assert_eq!(ex.lines[0].sign, "+");
    // A file no agent ever referenced works too (suggested-change diffs).
    assert_eq!(
        h.engine
            .read_excerpt(&sid, "orders/models.py", 1, 2)
            .unwrap()
            .lines
            .len(),
        2
    );
    assert!(h
        .engine
        .read_excerpt(&sid, "../../etc/passwd", 1, 1)
        .is_err());
    assert!(h.engine.read_excerpt(&sid, "/etc/passwd", 1, 1).is_err());
}

#[tokio::test]
async fn archiving_removes_the_worktree_and_keeps_history() {
    let h = harness(&[GOOD_DISCOVERY, QUESTIONS]);
    let sid = ready(&h).await;
    let wt = h.data.join("worktrees").join(&sid);
    assert!(wt.is_dir());
    h.engine.archive_session(&sid).await.unwrap();
    assert!(!wt.exists());
    let conn = h.engine.conn().unwrap();
    assert!(db::list_sessions(&conn).unwrap().is_empty());
    let row = db::get_session(&conn, &sid).unwrap().unwrap();
    assert!(row.archived);
    assert_eq!(
        db::list_analyses(&conn, &sid, &h.fx.head_sha)
            .unwrap()
            .len(),
        2
    );
}

#[tokio::test]
async fn startup_resets_interrupted_work_and_recreates_worktrees_on_demand() {
    let h = harness(&[GOOD_DISCOVERY, QUESTIONS, WALK]);
    let sid = ready(&h).await;
    let conn = h.engine.conn().unwrap();
    // A previous process died mid-pass.
    db::upsert_analysis(
        &conn,
        &Analysis {
            session_id: sid.clone(),
            kind: "review".into(),
            head_sha: h.fx.head_sha.clone(),
            status: AnalysisStatus::Running,
            ..Default::default()
        },
    )
    .unwrap();
    // …and this session hasn't been opened for three weeks.
    conn.execute(
        "UPDATE review_sessions SET last_opened_at = '2020-01-01 00:00:00' WHERE id = ?1",
        [&sid],
    )
    .unwrap();

    h.engine.startup().unwrap();
    assert_eq!(status_of(&h, &sid, "review"), Some(AnalysisStatus::Error));
    let wt = h.data.join("worktrees").join(&sid);
    assert!(!wt.exists(), "stale worktree is pruned on start");
    assert_eq!(
        db::get_session(&conn, &sid).unwrap().unwrap().worktree_path,
        None
    );

    // The next pass recreates it.
    h.engine.run_analysis(&sid, "walkthrough:ep1", true).await;
    assert_eq!(
        status_of(&h, &sid, "walkthrough:ep1"),
        Some(AnalysisStatus::Done)
    );
    assert!(wt.join("orders/api.py").is_file());
}

#[tokio::test]
async fn a_url_for_a_repo_that_is_not_added_rejects_with_the_typed_error() {
    let h = harness(&[]);
    let err = h
        .engine
        .create_session(NewSessionInput::Url {
            url: "https://github.com/acme/widgets/pull/482/files?w=1".into(),
        })
        .await
        .unwrap_err();
    let parsed: RepoNotAddedError =
        serde_json::from_str(&err).expect("JSON-encoded RepoNotAddedError");
    assert_eq!(parsed, RepoNotAddedError::new("acme", "widgets"));

    let err = h
        .engine
        .create_session(NewSessionInput::Url {
            url: "https://example.com/nope".into(),
        })
        .await
        .unwrap_err();
    assert!(err.contains("pull request URL"));
    let err = h
        .engine
        .create_session(NewSessionInput::Branches {
            repo_id: "r1".into(),
            base: "main".into(),
            head: "main".into(),
        })
        .await
        .unwrap_err();
    assert!(err.contains("different branches"));
}

#[tokio::test]
async fn auto_run_review_starts_after_discovery_when_the_setting_is_on() {
    let h = harness(&[GOOD_DISCOVERY, QUESTIONS, REVIEW_REPLY]);
    h.engine
        .conn()
        .unwrap()
        .execute(
            "INSERT INTO settings (key, value) VALUES ('auto_run_review', 'true')",
            [],
        )
        .unwrap();
    let s = h.engine.create_session(branches()).await.unwrap();
    wait_for("review", || {
        status_of(&h, &s.id, "review") == Some(AnalysisStatus::Done)
    })
    .await;
    assert_eq!(session(&h, &s.id).agent_passes, 3);
}

#[tokio::test]
async fn a_failed_preparation_is_a_session_error_with_a_plain_message() {
    let h = harness(&[]);
    let s = h
        .engine
        .create_session(NewSessionInput::Branches {
            repo_id: "r1".into(),
            base: "main".into(),
            head: "no-such-branch".into(),
        })
        .await
        .unwrap();
    wait_for("error", || {
        session(&h, &s.id).status == SessionStatus::Error
    })
    .await;
    assert!(session(&h, &s.id).error.unwrap().contains("no-such-branch"));
    assert!(h.engine.list_analyses(&s.id).unwrap().is_empty());
}

// ── Commit reviews ─────────────────────────────────────────

fn commits(head: &str, from: Option<&str>) -> NewSessionInput {
    NewSessionInput::Commits {
        repo_id: "r1".into(),
        branch: Some("feature".into()),
        head: head.into(),
        from: from.map(String::from),
    }
}

fn discovery_of(h: &Harness, sid: &str) -> DiscoveryResult {
    let list = h.engine.list_analyses(sid).unwrap();
    serde_json::from_value(
        list.iter()
            .find(|a| a.kind == "discovery")
            .unwrap()
            .result
            .clone()
            .unwrap(),
    )
    .unwrap()
}

#[tokio::test]
async fn a_commit_session_prepares_then_runs_discovery_and_questions() {
    let h = harness(&[GOOD_DISCOVERY, QUESTIONS]);
    let head = h.fx.head_sha.clone();
    let s = h.engine.create_session(commits(&head, None)).await.unwrap();

    // Everything git knows is on the session before it is prepared.
    assert_eq!(s.status, SessionStatus::Preparing);
    assert_eq!(
        s.source,
        SessionSource::Commits {
            branch: Some("feature".into()),
            base: h.fx.base_sha.clone(),
            head: head.clone(),
            count: 1,
        }
    );
    assert_eq!(s.title, "require approval");
    assert_eq!(
        s.description, "",
        "a subject on its own is not a description"
    );
    assert_eq!(s.author, "grsp-test");
    assert_eq!(s.head_ref, "feature");
    assert_eq!(s.base_ref, &h.fx.base_sha[..7]);
    assert_eq!(s.head_sha.as_deref(), Some(head.as_str()));
    assert_eq!(s.merge_base_sha.as_deref(), Some(h.fx.base_sha.as_str()));

    let sid = s.id.clone();
    wait_for("questions", || {
        status_of(&h, &sid, "questions") == Some(AnalysisStatus::Done)
    })
    .await;
    let ready = session(&h, &sid);
    assert_eq!(ready.status, SessionStatus::Ready);
    assert_eq!(ready.error, None);
    assert_eq!(ready.source, s.source);
    // services.py, policy.py and legacy.py; the lock file is excluded.
    assert_eq!(ready.files_changed, 3);
    assert_eq!(ready.agent_passes, 2);
    assert!(h
        .data
        .join("worktrees")
        .join(&sid)
        .join("orders/policy.py")
        .is_file());

    // No discussion for commits; no review until asked.
    let list = h.engine.list_analyses(&sid).unwrap();
    let kinds: BTreeSet<&str> = list.iter().map(|a| a.kind.as_str()).collect();
    assert_eq!(kinds, BTreeSet::from(["discovery", "questions"]));
    assert!(list.iter().all(|a| a.head_sha == head));

    // The agent claimed a mismatch, but a bare subject line gives it nothing
    // to contradict.
    let d = discovery_of(&h, &sid);
    assert_eq!(d.entry_points.len(), 2);
    assert!(d.description_empty);
    assert!(d.mismatches.is_empty());

    let steps: Vec<String> = h
        .events
        .sessions
        .lock()
        .unwrap()
        .iter()
        .filter_map(|e| e.progress.clone())
        .collect();
    assert_eq!(steps[0], format!("Reading commit {}", &head[..7]));
    assert!(steps[1].starts_with("Creating a read-only worktree at "));
    assert_eq!(steps[2], "Working out what changed");

    // The same commit again is the same session, by SHA, short SHA or ref,
    // and whichever branch it is opened from.
    for input in [
        commits(&head, None),
        commits(&head[..10], None),
        commits("feature", Some(&head)),
        NewSessionInput::Commits {
            repo_id: "r1".into(),
            branch: None,
            head: head.clone(),
            from: None,
        },
    ] {
        assert_eq!(h.engine.create_session(input).await.unwrap().id, sid);
    }
    assert_eq!(
        db::list_sessions(&h.engine.conn().unwrap()).unwrap().len(),
        1
    );
}

#[tokio::test]
async fn a_commit_session_never_goes_stale_and_cannot_post_or_discuss() {
    let h = harness(&[GOOD_DISCOVERY, QUESTIONS, REVIEW_REPLY]);
    let head = h.fx.head_sha.clone();
    let sid = h
        .engine
        .create_session(commits(&head, None))
        .await
        .unwrap()
        .id;
    wait_for("questions", || {
        status_of(&h, &sid, "questions") == Some(AnalysisStatus::Done)
    })
    .await;

    // The branch moves on. The commits under review don't.
    write(&h.fx.dir, "orders/notes.py", "NOTE = 1\n");
    git_in(&h.fx.dir, &["add", "-A"]);
    git_in(&h.fx.dir, &["commit", "-q", "-m", "more"]);
    let (e, s) = (h.engine.clone(), sid.clone());
    h.engine.open_session(&sid).await.unwrap();
    tokio::time::sleep(Duration::from_millis(300)).await;
    let after = db::get_session(&e.conn().unwrap(), &s)
        .unwrap()
        .unwrap()
        .session;
    assert_eq!(after.status, SessionStatus::Ready);
    assert_eq!(after.new_commits, 0);
    assert_eq!(after.head_sha.as_deref(), Some(head.as_str()));
    assert_eq!(after.agent_passes, 2, "opening runs no agent");

    assert!(h
        .engine
        .start_analysis(&sid, "discussion")
        .unwrap_err()
        .contains("only available for pull requests"));

    // A review can be run, but there is nowhere to post it.
    h.engine.run_analysis(&sid, "review", true).await;
    assert_eq!(status_of(&h, &sid, "review"), Some(AnalysisStatus::Done));
    let err = h
        .engine
        .post_review(
            &sid,
            PostReviewInput {
                event: ReviewEvent::Comment,
                body: "x".into(),
            },
        )
        .await
        .unwrap_err();
    assert!(err.contains("only available for pull requests"), "{err}");
    assert!(err.contains("reviews commits"), "{err}");
    assert_eq!(session(&h, &sid).posted_review, None);
}

#[tokio::test]
async fn a_run_of_commits_from_the_root_is_one_session() {
    let h = harness(&[GOOD_DISCOVERY, QUESTIONS]);
    let (base, head) = (h.fx.base_sha.clone(), h.fx.head_sha.clone());
    let s = h
        .engine
        .create_session(commits(&head, Some(&base)))
        .await
        .unwrap();
    let SessionSource::Commits {
        base: source_base,
        count,
        ..
    } = &s.source
    else {
        panic!("not a commit session: {:?}", s.source);
    };
    assert_eq!(*count, 2);
    // `base` is the root commit, so the run is diffed against the empty tree.
    assert_eq!(source_base, "4b825dc642cb6eb9a060e54bf8d69288fbee4904");
    assert_eq!(s.title, "2 commits on feature");
    assert_eq!(s.description, "- base\n- require approval");
    assert_eq!(s.author, "grsp-test");

    let sid = s.id.clone();
    wait_for("questions", || {
        status_of(&h, &sid, "questions") == Some(AnalysisStatus::Done)
    })
    .await;
    let ready = session(&h, &sid);
    assert_eq!(ready.status, SessionStatus::Ready, "{:?}", ready.error);
    // Every file in the repository at head except the lock file: api, imports,
    // models, policy, services.
    assert_eq!(ready.files_changed, 5);
    // A list of subjects is a description, so mismatches are not thrown away.
    assert!(!discovery_of(&h, &sid).description_empty);

    // A different run ending at the same commit is its own session.
    let single = h.engine.create_session(commits(&head, None)).await.unwrap();
    assert_ne!(single.id, sid);
    wait_for("second session settles", || {
        session(&h, &single.id).status != SessionStatus::Preparing
            && status_of(&h, &single.id, "discovery")
                .is_some_and(|st| st != AnalysisStatus::Running)
    })
    .await;
}

#[tokio::test]
async fn commits_that_cannot_be_reviewed_together_are_rejected_up_front() {
    let h = harness(&[]);
    // `from` is newer than `head`.
    let err = h
        .engine
        .create_session(commits(&h.fx.base_sha, Some(&h.fx.head_sha)))
        .await
        .unwrap_err();
    assert!(err.contains("isn't in the history of"), "{err}");
    let err = h
        .engine
        .create_session(commits("0123456789abcdef", None))
        .await
        .unwrap_err();
    assert!(err.contains("Couldn't find commit"), "{err}");
    let err = h
        .engine
        .create_session(NewSessionInput::Commits {
            repo_id: "gone".into(),
            branch: None,
            head: h.fx.head_sha.clone(),
            from: None,
        })
        .await
        .unwrap_err();
    assert!(err.contains("repository no longer exists"), "{err}");
    // Nothing was stored for any of them.
    assert!(db::list_sessions(&h.engine.conn().unwrap())
        .unwrap()
        .is_empty());
}

#[tokio::test]
async fn the_commit_list_marks_where_the_last_review_of_the_branch_ended() {
    let h = harness(&[GOOD_DISCOVERY, QUESTIONS]);
    let (base, head) = (h.fx.base_sha.clone(), h.fx.head_sha.clone());

    let list = h.engine.list_commits("r1", "feature", None).unwrap();
    assert_eq!(list.branch, "feature");
    let shas: Vec<&str> = list.commits.iter().map(|c| c.sha.as_str()).collect();
    assert_eq!(shas, [head.as_str(), base.as_str()]);
    assert_eq!(list.commits[0].subject, "require approval");
    // services.py, policy.py, legacy.py and the lock file.
    assert_eq!(list.commits[0].files_changed, 4);
    assert_eq!(list.last_reviewed_sha, None);
    assert_eq!(list.offline, None);

    let sid = h
        .engine
        .create_session(commits(&head, None))
        .await
        .unwrap()
        .id;
    wait_for("questions", || {
        status_of(&h, &sid, "questions") == Some(AnalysisStatus::Done)
    })
    .await;
    let reviewed = |branch: &str, limit: Option<u32>| {
        h.engine
            .list_commits("r1", branch, limit)
            .unwrap()
            .last_reviewed_sha
    };
    assert_eq!(reviewed("feature", None), Some(head.clone()));
    // Reviews are remembered per branch.
    assert_eq!(reviewed("main", None), None);

    // New commits land above the reviewed one.
    write(&h.fx.dir, "orders/notes.py", "NOTE = 1\n");
    git_in(&h.fx.dir, &["add", "-A"]);
    git_in(&h.fx.dir, &["commit", "-q", "-m", "more"]);
    let list = h.engine.list_commits("r1", "feature", None).unwrap();
    assert_eq!(list.commits.len(), 3);
    assert_eq!(list.commits[1].sha, head);
    assert_eq!(list.last_reviewed_sha, Some(head.clone()));
    // …and it is only reported while it is still in the list.
    assert_eq!(reviewed("feature", Some(1)), None);

    h.engine.archive_session(&sid).await.unwrap();
    assert_eq!(reviewed("feature", None), None);
    assert!(h.engine.list_commits("nope", "feature", None).is_err());
}

#[tokio::test]
async fn the_whole_diff_and_notes_are_served_for_a_session() {
    let h = harness(&[GOOD_DISCOVERY, QUESTIONS]);
    let head = h.fx.head_sha.clone();
    let sid = h
        .engine
        .create_session(commits(&head, None))
        .await
        .unwrap()
        .id;
    wait_for("questions", || {
        status_of(&h, &sid, "questions") == Some(AnalysisStatus::Done)
    })
    .await;

    let diff = h.engine.read_diff(&sid).unwrap();
    let mut paths: Vec<&str> = diff.files.iter().map(|f| f.path.as_str()).collect();
    paths.sort_unstable();
    assert_eq!(
        paths,
        ["orders/legacy.py", "orders/policy.py", "orders/services.py"]
    );
    assert_eq!(diff.excluded_files, 1, "the lock file");
    let services = diff
        .files
        .iter()
        .find(|f| f.path == "orders/services.py")
        .unwrap();
    assert!(services
        .patch
        .starts_with("diff --git a/orders/services.py b/orders/services.py\n"));
    assert!(services.patch.contains("+    if requires_approval(order):"));
    assert!(!services.truncated && !services.binary);
    let stats = session(&h, &sid);
    assert_eq!(diff.files.len() as u32, stats.files_changed);
    assert_eq!(
        diff.files.iter().map(|f| f.added).sum::<u32>(),
        stats.lines_added
    );
    assert_eq!(
        diff.files.iter().map(|f| f.removed).sum::<u32>(),
        stats.lines_removed
    );
    assert!(h.engine.read_diff("missing").is_err());

    // Notes are pinned to the head they were written against.
    let anchor = NoteAnchor::Line {
        file: "orders/services.py".into(),
        line: 7,
        side: DiffSide::New,
    };
    let note = h
        .engine
        .save_note(&sid, None, " What about refunds? ", Some(&anchor))
        .unwrap();
    assert_eq!(note.body, "What about refunds?");
    assert_eq!(note.head_sha, head);
    assert_eq!(note.anchor, Some(anchor));
    let general = h
        .engine
        .save_note(&sid, None, "Overall fine.", None)
        .unwrap();
    let edited = h
        .engine
        .save_note(&sid, Some(&note.id), "Refunds are out of scope.", None)
        .unwrap();
    assert_eq!(edited.id, note.id);
    assert!(h.engine.save_note(&sid, None, "  ", None).is_err());
    let listed = h.engine.list_notes(&sid).unwrap();
    assert_eq!(listed, vec![edited, general.clone()]);
    h.engine.delete_note(&note.id).unwrap();
    assert_eq!(h.engine.list_notes(&sid).unwrap(), vec![general]);
    // Notes cost no agent passes.
    assert_eq!(session(&h, &sid).agent_passes, 2);
}
