//! Headless eval runner (SPEC §8): runs the real pipelines against a repo in
//! branch-pair mode and prints one JSON document with the UI-ready results.
//!
//!     grsp-eval --repo <path> --base <ref> --head <ref> --title <t>
//!               [--description-file <f>] [--author <name>] [--agent claude|codex]
//!               [--pipelines discovery,questions,walkthrough,ask,review]
//!               [--ask "question"]… [--max-walkthroughs N] [--trace-depth 1|2|3]
//!               [--review-prompt-file <f>]
//!
//! stdout carries only the JSON document; progress goes to stderr. This
//! spends the user's agent subscription, so it's never run in CI.

use std::path::{Path, PathBuf};
use std::sync::atomic::{AtomicU32, Ordering};
use std::sync::Arc;

use grsp_lib::agent::{AgentError, RunHooks, Runner};
use grsp_lib::git;
use grsp_lib::model::analysis_kind as kinds;
use grsp_lib::model::*;
use grsp_lib::pipelines::{ask, discovery, questions, review, walkthrough, Outcome, PassCtx};
use serde::Serialize;
use tokio::task::JoinSet;

const USAGE: &str = "usage: grsp-eval --repo <path> --base <ref> --head <ref> --title <title> [--description-file <file>] [--author <name>] [--agent claude|codex] [--pipelines discovery,questions,walkthrough,ask,review] [--ask <question>]... [--max-walkthroughs <n>] [--trace-depth 1|2|3] [--review-prompt-file <file>]";

struct Args {
    repo: PathBuf,
    base: String,
    head: String,
    title: String,
    description: String,
    author: String,
    agent: AgentKind,
    pipelines: Vec<String>,
    asks: Vec<String>,
    max_walkthroughs: usize,
    trace_depth: u8,
    review_prompt: String,
}

fn parse_args() -> Result<Args, String> {
    let mut it = std::env::args().skip(1);
    let mut repo = None;
    let mut base = None;
    let mut head = None;
    let mut title = String::new();
    let mut description = String::new();
    let mut author = String::new();
    let mut agent = AgentKind::Claude;
    let mut pipelines: Vec<String> = ["discovery", "questions", "walkthrough", "ask", "review"]
        .iter()
        .map(|s| s.to_string())
        .collect();
    let mut asks = Vec::new();
    let mut max_walkthroughs = usize::MAX;
    let mut trace_depth = 2u8;
    let mut review_prompt = DEFAULT_REVIEW_PROMPT.to_string();

    while let Some(flag) = it.next() {
        if flag == "--help" || flag == "-h" {
            return Err(USAGE.to_string());
        }
        let mut value = || {
            it.next()
                .ok_or_else(|| format!("{flag} needs a value\n{USAGE}"))
        };
        match flag.as_str() {
            "--repo" => repo = Some(PathBuf::from(value()?)),
            "--base" => base = Some(value()?),
            "--head" => head = Some(value()?),
            "--title" => title = value()?,
            "--author" => author = value()?,
            "--description-file" => {
                let f = value()?;
                description =
                    std::fs::read_to_string(&f).map_err(|e| format!("couldn't read {f}: {e}"))?;
            }
            "--review-prompt-file" => {
                let f = value()?;
                review_prompt =
                    std::fs::read_to_string(&f).map_err(|e| format!("couldn't read {f}: {e}"))?;
            }
            "--agent" => {
                agent = match value()?.as_str() {
                    "claude" => AgentKind::Claude,
                    "codex" => AgentKind::Codex,
                    other => return Err(format!("unknown agent {other:?}; use claude or codex")),
                }
            }
            "--pipelines" => {
                pipelines = value()?
                    .split(',')
                    .map(|s| s.trim().to_string())
                    .filter(|s| !s.is_empty())
                    .collect();
                for p in &pipelines {
                    if !matches!(
                        p.as_str(),
                        "discovery" | "questions" | "walkthrough" | "ask" | "review"
                    ) {
                        return Err(format!("unknown pipeline {p:?}"));
                    }
                }
            }
            "--ask" => asks.push(value()?),
            "--max-walkthroughs" => {
                max_walkthroughs = value()?
                    .parse()
                    .map_err(|_| "--max-walkthroughs needs a number".to_string())?
            }
            "--trace-depth" => {
                trace_depth = value()?
                    .parse::<u8>()
                    .map_err(|_| "--trace-depth needs 1, 2 or 3".to_string())?
                    .clamp(1, 3)
            }
            other => return Err(format!("unknown argument {other:?}\n{USAGE}")),
        }
    }
    Ok(Args {
        repo: repo.ok_or_else(|| format!("--repo is required\n{USAGE}"))?,
        base: base.ok_or_else(|| format!("--base is required\n{USAGE}"))?,
        head: head.ok_or_else(|| format!("--head is required\n{USAGE}"))?,
        title,
        description,
        author,
        agent,
        pipelines,
        asks,
        max_walkthroughs,
        trace_depth,
        review_prompt,
    })
}

fn now() -> String {
    chrono::Utc::now().to_rfc3339()
}

fn hooks(label: &str, passes: &Arc<AtomicU32>) -> RunHooks {
    let label = label.to_string();
    let passes = passes.clone();
    let mut h = RunHooks::silent();
    h.progress = Arc::new(move |line| eprintln!("[{label}] {line}"));
    h.on_pass = Arc::new(move || {
        passes.fetch_add(1, Ordering::SeqCst);
    });
    h
}

/// The same `Analysis` shape the app stores and the UI reads.
fn analysis<T: Serialize>(
    kind: &str,
    head: &str,
    started: String,
    outcome: Result<Outcome<T>, AgentError>,
) -> Analysis {
    let mut a = Analysis {
        session_id: "eval".to_string(),
        kind: kind.to_string(),
        head_sha: head.to_string(),
        started_at: Some(started),
        finished_at: Some(now()),
        ..Default::default()
    };
    match outcome {
        Ok(o) => {
            a.status = AnalysisStatus::Done;
            a.result = serde_json::to_value(&o.result).ok();
            a.verification = Some(o.report);
        }
        Err(e) => {
            eprintln!("[{kind}] failed: {}", e.message());
            a.status = AnalysisStatus::Error;
            a.error = Some(e.message());
            a.error_details = e.details();
        }
    }
    a
}

fn skipped(kind: &str, head: &str, why: &str) -> Analysis {
    Analysis {
        session_id: "eval".to_string(),
        kind: kind.to_string(),
        head_sha: head.to_string(),
        status: AnalysisStatus::Error,
        error: Some(why.to_string()),
        ..Default::default()
    }
}

async fn run(args: Args, data_dir: &Path) -> Result<serde_json::Value, String> {
    let repo = args
        .repo
        .canonicalize()
        .map_err(|e| format!("--repo: {e}"))?;
    let repo_str = repo.to_string_lossy().to_string();
    if !git::is_git_repo(&repo_str) {
        return Err(format!("{repo_str} isn't a git repository"));
    }

    // Session preparation, as the app does it in branch-pair mode (SPEC §2.2).
    eprintln!("[session] Resolving {} and {}", args.base, args.head);
    let refs = git::resolve_branch_pair(&repo_str, &args.base, &args.head)?;
    let worktree = git::worktree_path(data_dir, "eval");
    eprintln!(
        "[session] Creating a read-only worktree at {}",
        &refs.head_sha[..refs.head_sha.len().min(7)]
    );
    git::ensure_worktree(&repo_str, &worktree, &refs.head_sha)?;
    eprintln!("[session] Working out what changed");
    let bundle = git::build_diff(&worktree, &refs.merge_base_sha, &refs.head_sha)?;

    let stamp = now();
    let mut session = ReviewSession {
        id: "eval".to_string(),
        repo_id: "eval".to_string(),
        source: SessionSource::Branches {
            base: args.base.clone(),
            head: args.head.clone(),
        },
        title: if args.title.is_empty() {
            args.head.clone()
        } else {
            args.title.clone()
        },
        description: args.description.clone(),
        author: args.author.clone(),
        base_ref: args.base.clone(),
        head_ref: args.head.clone(),
        base_sha: Some(refs.base_sha.clone()),
        head_sha: Some(refs.head_sha.clone()),
        merge_base_sha: Some(refs.merge_base_sha.clone()),
        status: SessionStatus::Ready,
        error: None,
        pr_state: PrState::Open,
        is_own_pr: false,
        ci: None,
        files_changed: bundle.stats.files,
        lines_added: bundle.stats.added,
        lines_removed: bundle.stats.removed,
        new_commits: 0,
        agent_passes: 0,
        posted_review: None,
        created_at: stamp.clone(),
        last_opened_at: stamp,
    };
    let ctx = PassCtx::new(session.clone(), worktree.clone(), bundle, args.agent)?;
    let head = refs.head_sha.clone();
    let runner = Runner::cli();
    let passes = Arc::new(AtomicU32::new(0));
    let wants = |p: &str| args.pipelines.iter().any(|x| x == p);

    let mut doc = serde_json::Map::new();

    // Discovery always runs: every other pipeline takes its result as input.
    let started = now();
    let disc_outcome = discovery::run(&runner, &ctx, &hooks("discovery", &passes)).await;
    let disc: Option<DiscoveryResult> = disc_outcome.as_ref().ok().map(|o| o.result.clone());
    doc.insert(
        "discovery".into(),
        serde_json::to_value(analysis(kinds::DISCOVERY, &head, started, disc_outcome))
            .map_err(|e| e.to_string())?,
    );
    const NEEDS_DISCOVERY: &str = "Discovery failed, so this pipeline didn't run.";

    if wants("questions") {
        let a = match &disc {
            Some(d) => {
                let started = now();
                analysis(
                    kinds::QUESTIONS,
                    &head,
                    started,
                    questions::run(&runner, &ctx, d, &hooks("questions", &passes)).await,
                )
            }
            None => skipped(kinds::QUESTIONS, &head, NEEDS_DISCOVERY),
        };
        doc.insert(
            "questions".into(),
            serde_json::to_value(a).map_err(|e| e.to_string())?,
        );
    }

    if wants("walkthrough") {
        let mut walks = serde_json::Map::new();
        if let Some(d) = &disc {
            // Every discovered entry point, two agent processes at a time.
            let mut set: JoinSet<(String, Analysis)> = JoinSet::new();
            for ep in d.entry_points.iter().take(args.max_walkthroughs) {
                let (runner, ctx, d, id, head) = (
                    runner.clone(),
                    ctx.clone(),
                    d.clone(),
                    ep.id.clone(),
                    head.clone(),
                );
                let h = hooks(&format!("walkthrough:{id}"), &passes);
                let depth = args.trace_depth;
                set.spawn(async move {
                    let started = now();
                    let out = walkthrough::run(&runner, &ctx, &d, &id, depth, &h).await;
                    let a = analysis(&kinds::walkthrough(&id), &head, started, out);
                    (id, a)
                });
            }
            while let Some(joined) = set.join_next().await {
                if let Ok((id, a)) = joined {
                    walks.insert(id, serde_json::to_value(a).map_err(|e| e.to_string())?);
                }
            }
        }
        doc.insert("walkthroughs".into(), serde_json::Value::Object(walks));
    }

    if wants("ask") {
        let mut messages: Vec<AskMessage> = Vec::new();
        for (i, question) in args.asks.iter().enumerate() {
            // Follow-ups see the earlier answers, as in the app.
            let history: Vec<AskMessage> = messages
                .iter()
                .filter(|m| m.status == AskStatus::Done)
                .cloned()
                .collect();
            let mut msg = AskMessage {
                id: format!("ask{}", i + 1),
                session_id: "eval".to_string(),
                question: question.clone(),
                status: AskStatus::Running,
                head_sha: head.clone(),
                created_at: now(),
                ..Default::default()
            };
            match ask::run(
                &runner,
                &ctx,
                disc.as_ref(),
                &history,
                question,
                &hooks(&format!("ask:{}", i + 1), &passes),
            )
            .await
            {
                Ok(o) => {
                    msg.status = AskStatus::Done;
                    msg.answer = Some(o.result);
                    msg.verification = Some(o.report);
                }
                Err(e) => {
                    eprintln!("[ask:{}] failed: {}", i + 1, e.message());
                    msg.status = AskStatus::Error;
                    msg.error = Some(e.message());
                }
            }
            messages.push(msg);
        }
        doc.insert(
            "ask".into(),
            serde_json::to_value(messages).map_err(|e| e.to_string())?,
        );
    }

    if wants("review") {
        let started = now();
        let out = review::run(
            &runner,
            &ctx,
            disc.as_ref(),
            None,
            &args.review_prompt,
            &hooks("review", &passes),
        )
        .await;
        doc.insert(
            "review".into(),
            serde_json::to_value(analysis(kinds::REVIEW, &head, started, out))
                .map_err(|e| e.to_string())?,
        );
    }

    let total = passes.load(Ordering::SeqCst);
    session.agent_passes = total;
    doc.insert(
        "session".into(),
        serde_json::to_value(&session).map_err(|e| e.to_string())?,
    );
    doc.insert("passes".into(), serde_json::json!(total));
    doc.insert("agent".into(), serde_json::json!(args.agent));

    let _ = git::remove_worktree(&repo_str, &worktree);
    Ok(serde_json::Value::Object(doc))
}

#[tokio::main]
async fn main() {
    let args = match parse_args() {
        Ok(a) => a,
        Err(e) => {
            eprintln!("{e}");
            std::process::exit(2);
        }
    };
    // A throwaway app-data dir: nothing touches the real grsp database.
    let data_dir = std::env::temp_dir().join(format!("grsp-eval-{}", uuid::Uuid::new_v4()));
    if let Err(e) = std::fs::create_dir_all(&data_dir) {
        eprintln!("couldn't create {}: {e}", data_dir.display());
        std::process::exit(1);
    }
    let data_dir = data_dir.canonicalize().unwrap_or(data_dir);
    let repo = args.repo.clone();
    let result = run(args, &data_dir).await;
    // Make sure the worktree registration is gone even after an error.
    if let Ok(repo) = repo.canonicalize() {
        let _ = git::remove_worktree(
            &repo.to_string_lossy(),
            &git::worktree_path(&data_dir, "eval"),
        );
    }
    let _ = std::fs::remove_dir_all(&data_dir);
    match result {
        Ok(doc) => {
            println!(
                "{}",
                serde_json::to_string_pretty(&doc).unwrap_or_else(|_| "{}".to_string())
            );
        }
        Err(e) => {
            eprintln!("grsp-eval: {e}");
            std::process::exit(1);
        }
    }
}
