//! Discovery (SPEC §5.1), including sharding for large PRs (§4.3).

use std::collections::{BTreeSet, HashMap};
use std::sync::Arc;

use tokio::task::JoinSet;

use super::context::{Outcome, PassCtx};
use super::instructions;
use crate::agent::{json, AgentError, JsonPass, PromptLayers, RunHooks, Runner};
use crate::git;
use crate::model::*;
use crate::verify::{self, Verifier};

/// SPEC §4.3: up to 4 shards.
pub const MAX_SHARDS: usize = 4;

fn check(raw: &RawDiscovery) -> Result<(), String> {
    if raw.behaviour_summary.trim().is_empty() {
        return Err("`behaviourSummary` is missing or empty".to_string());
    }
    Ok(())
}

fn shape(
    ctx: &PassCtx,
    raw: RawDiscovery,
    files_explored: &BTreeSet<String>,
    shards: Option<u32>,
) -> Outcome<DiscoveryResult> {
    let src = ctx.source();
    let mut v = Verifier::new(&src, ctx.map());
    let mut result = verify::shape_discovery(raw, &ctx.session.description, &mut v);
    result.shards = shards;
    let mut report = v.into_report();
    report.files_explored = Some(files_explored.len() as u32);
    if let Some(n) = shards {
        report
            .notes
            .push(format!("Large PR: analysed in {n} parts."));
    }
    Outcome { result, report }
}

/// Run discovery for a prepared session.
pub async fn run(
    runner: &Runner,
    ctx: &PassCtx,
    hooks: &RunHooks,
) -> Result<Outcome<DiscoveryResult>, AgentError> {
    if git::is_large(&ctx.bundle.stats) {
        let shards = git::plan_shards(ctx.map(), MAX_SHARDS);
        if shards.len() > 1 {
            return run_sharded(runner, ctx, hooks, shards).await;
        }
    }
    let layers = ctx.layers(instructions::DISCOVERY.to_string());
    let pass: JsonPass<RawDiscovery> = runner
        .run_output(&ctx.request(&layers), hooks, check)
        .await?;
    Ok(shape(ctx, pass.value, &pass.files_explored, None))
}

fn shard_layers(ctx: &PassCtx, shard: &git::Shard, index: usize, total: usize) -> PromptLayers {
    let instruction = format!(
        "{}\n\n{}\n\nYour part is {} of {}: `{}` ({} files).",
        instructions::DISCOVERY,
        instructions::DISCOVERY_SHARD_NOTE,
        index + 1,
        total,
        shard.label,
        shard.files.len()
    );
    PromptLayers {
        instruction,
        context_pack: ctx.context_pack(Some(&shard.files)),
        review_prompt: None,
        repo_prompt: ctx.repo_prompt.clone(),
    }
}

async fn run_sharded(
    runner: &Runner,
    ctx: &PassCtx,
    hooks: &RunHooks,
    shards: Vec<git::Shard>,
) -> Result<Outcome<DiscoveryResult>, AgentError> {
    let total = shards.len();
    (hooks.progress)(format!("Large PR: analysing in {total} parts"));

    // Shards run concurrently; the runner's semaphore keeps it to 2 at once.
    let mut set: JoinSet<(usize, Result<JsonPass<RawDiscovery>, AgentError>)> = JoinSet::new();
    for (i, shard) in shards.iter().enumerate() {
        let req = ctx.request(&shard_layers(ctx, shard, i, total));
        let runner = runner.clone();
        let outer = hooks.progress.clone();
        let shard_hooks = RunHooks {
            progress: Arc::new(move |line| outer(format!("Part {} of {total}: {line}", i + 1))),
            cancel: hooks.cancel.clone(),
            on_pass: hooks.on_pass.clone(),
        };
        set.spawn(async move { (i, runner.run_output(&req, &shard_hooks, check).await) });
    }

    let mut parts: Vec<Option<JsonPass<RawDiscovery>>> = (0..total).map(|_| None).collect();
    let mut first_err: Option<AgentError> = None;
    while let Some(joined) = set.join_next().await {
        match joined {
            Ok((i, Ok(pass))) => parts[i] = Some(pass),
            Ok((_, Err(e))) => {
                // One part failing means the picture is incomplete. Stop the
                // rest rather than present a partial analysis as whole.
                if first_err.is_none() {
                    first_err = Some(e);
                    set.abort_all();
                }
            }
            Err(_) => {
                if first_err.is_none() {
                    first_err = Some(AgentError::Cancelled);
                }
            }
        }
    }
    if let Some(e) = first_err {
        return Err(e);
    }
    let parts: Vec<JsonPass<RawDiscovery>> = parts.into_iter().flatten().collect();
    let mut files: BTreeSet<String> = BTreeSet::new();
    for p in &parts {
        files.extend(p.files_explored.iter().cloned());
    }

    // The short merge pass: dedupe entry points, combine summaries.
    (hooks.progress)("Combining the parts".to_string());
    let mut listing = String::new();
    for (i, (p, shard)) in parts.iter().zip(shards.iter()).enumerate() {
        let compact = json::extract_object(&p.raw)
            .map(|v| v.to_string())
            .unwrap_or_else(|| p.raw.clone());
        listing.push_str(&format!(
            "### Part {} of {total}: {}\n\n```json\n{compact}\n```\n\n",
            i + 1,
            shard.label
        ));
    }
    let layers = PromptLayers {
        instruction: format!(
            "{}\n\n## The parts\n\n{listing}",
            instructions::DISCOVERY_MERGE
        ),
        context_pack: format!("{}\n{}", ctx.header(), ctx.file_list()),
        review_prompt: None,
        repo_prompt: ctx.repo_prompt.clone(),
    };
    let merged = match runner
        .run_output::<RawDiscovery, _>(&ctx.request(&layers), hooks, check)
        .await
    {
        Ok(pass) => {
            files.extend(pass.files_explored);
            pass.value
        }
        Err(AgentError::Cancelled) => return Err(AgentError::Cancelled),
        // The parts are sound; a failed merge pass shouldn't lose them.
        Err(_) => merge_raw(parts.into_iter().map(|p| p.value).collect()),
    };
    Ok(shape(ctx, merged, &files, Some(total as u32)))
}

fn ref_key(r: &Option<RawCodeRef>) -> Option<(String, u32)> {
    r.as_ref().map(|r| (r.file.clone(), r.start_line))
}

/// Deterministic merge of shard results: concatenates, dedupes entry points
/// by location or label, renumbers ids and rewrites `entryPointId`s. Used
/// when the agent merge pass fails.
pub fn merge_raw(parts: Vec<RawDiscovery>) -> RawDiscovery {
    let mut out = RawDiscovery::default();
    let mut by_ref: HashMap<(String, u32), String> = HashMap::new();
    let mut by_label: HashMap<String, String> = HashMap::new();
    let mut summaries: Vec<String> = Vec::new();

    for part in parts {
        if !part.behaviour_summary.trim().is_empty() {
            summaries.push(part.behaviour_summary.trim().to_string());
        }
        // Old id (within this part) → merged id.
        let mut remap: HashMap<String, String> = HashMap::new();
        for mut ep in part.entry_points {
            let key = ref_key(&ep.code_ref);
            let label_key = ep.label.trim().to_lowercase();
            let existing = key
                .as_ref()
                .and_then(|k| by_ref.get(k))
                .or_else(|| by_label.get(&label_key).filter(|_| !label_key.is_empty()))
                .cloned();
            match existing {
                Some(id) => {
                    remap.insert(ep.id.clone(), id.clone());
                    if let Some(kept) = out.entry_points.iter_mut().find(|e| e.id == id) {
                        if Level::parse(&ep.risk) < Level::parse(&kept.risk) {
                            kept.risk = ep.risk.clone();
                        }
                        kept.timing_only = kept.timing_only && ep.timing_only;
                    }
                }
                None => {
                    let id = format!("ep{}", out.entry_points.len() + 1);
                    remap.insert(ep.id.clone(), id.clone());
                    if let Some(k) = key {
                        by_ref.insert(k, id.clone());
                    }
                    if !label_key.is_empty() {
                        by_label.insert(label_key, id.clone());
                    }
                    ep.id = id;
                    out.entry_points.push(ep);
                }
            }
        }
        let map_id = |id: Option<String>| id.and_then(|i| remap.get(&i).cloned());
        for mut g in part.gaps {
            g.entry_point_id = map_id(g.entry_point_id);
            if !out
                .gaps
                .iter()
                .any(|x| ref_key(&x.code_ref) == ref_key(&g.code_ref))
            {
                out.gaps.push(g);
            }
        }
        for mut m in part.mismatches {
            m.entry_point_id = map_id(m.entry_point_id);
            if !out
                .mismatches
                .iter()
                .any(|x| x.claim.trim() == m.claim.trim())
            {
                out.mismatches.push(m);
            }
        }
        for r in part.removed {
            if !out
                .removed
                .iter()
                .any(|x| ref_key(&x.code_ref) == ref_key(&r.code_ref))
            {
                out.removed.push(r);
            }
        }
        for s in part.ask_suggestions {
            if out.ask_suggestions.len() < 3 && !out.ask_suggestions.contains(&s) {
                out.ask_suggestions.push(s);
            }
        }
    }
    // Riskiest first, as the single-pass instruction asks.
    out.entry_points.sort_by_key(|e| Level::parse(&e.risk));
    out.behaviour_summary = summaries.join(" ");
    out
}

#[cfg(test)]
mod tests {
    use super::*;

    fn ep(id: &str, label: &str, file: &str, line: u32, risk: &str) -> RawEntryPoint {
        RawEntryPoint {
            id: id.into(),
            label: label.into(),
            kind: "http".into(),
            code_ref: Some(RawCodeRef::new(file, line, None, None)),
            effect: "e".into(),
            risk: risk.into(),
            timing_only: false,
        }
    }

    #[test]
    fn merge_dedupes_entry_points_and_rewrites_ids() {
        let a = RawDiscovery {
            behaviour_summary: "Part one.".into(),
            entry_points: vec![ep("ep1", "POST /orders", "api.x", 10, "medium")],
            gaps: vec![RawGap {
                code_ref: Some(RawCodeRef::new("imports.x", 5, None, None)),
                write_target: "orders".into(),
                explanation: "bypass".into(),
                entry_point_id: Some("ep1".into()),
            }],
            ask_suggestions: vec!["a?".into(), "b?".into()],
            ..Default::default()
        };
        let b = RawDiscovery {
            behaviour_summary: "Part two.".into(),
            entry_points: vec![
                ep("ep1", "nightly job", "jobs.x", 3, "low"),
                // Same handler as part one's ep1, reported with a higher risk.
                ep("ep2", "POST /orders (create)", "api.x", 10, "high"),
            ],
            mismatches: vec![RawMismatch {
                claim: "all orders".into(),
                reality: "not imports".into(),
                refs: vec![],
                entry_point_id: Some("ep2".into()),
            }],
            gaps: vec![RawGap {
                code_ref: Some(RawCodeRef::new("imports.x", 5, None, None)),
                write_target: "orders".into(),
                explanation: "duplicate".into(),
                entry_point_id: Some("ep2".into()),
            }],
            ask_suggestions: vec!["b?".into(), "c?".into(), "d?".into()],
            ..Default::default()
        };
        let m = merge_raw(vec![a, b]);
        assert_eq!(m.behaviour_summary, "Part one. Part two.");
        assert_eq!(m.entry_points.len(), 2);
        // The merged POST /orders took the higher risk and sorts first.
        assert_eq!(m.entry_points[0].label, "POST /orders");
        assert_eq!(m.entry_points[0].risk, "high");
        assert_eq!(m.entry_points[0].id, "ep1");
        assert_eq!(m.entry_points[1].id, "ep2");
        assert_eq!(m.gaps.len(), 1);
        assert_eq!(m.gaps[0].entry_point_id.as_deref(), Some("ep1"));
        // Part two's ep2 was merged into ep1, so the mismatch follows it.
        assert_eq!(m.mismatches[0].entry_point_id.as_deref(), Some("ep1"));
        assert_eq!(m.ask_suggestions, vec!["a?", "b?", "c?"]);
    }

    #[test]
    fn empty_summary_fails_the_schema_check() {
        assert!(check(&RawDiscovery::default()).is_err());
        assert!(check(&RawDiscovery {
            behaviour_summary: "x".into(),
            ..Default::default()
        })
        .is_ok());
    }
}
