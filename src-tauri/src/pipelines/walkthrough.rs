//! Walkthrough (SPEC §5.5): one pass per entry point, run when first opened.

use super::context::{discovery_brief, Outcome, PassCtx};
use super::instructions;
use crate::agent::{AgentError, JsonPass, RunHooks, Runner};
use crate::model::*;
use crate::verify::{self, Verifier};

fn check(raw: &RawWalkthrough) -> Result<(), String> {
    if raw.blocks.is_empty() {
        return Err("`blocks` is missing or empty".to_string());
    }
    Ok(())
}

fn entry_point_section(ep: &EntryPoint) -> String {
    let r = &ep.code_ref;
    let range = match r.end_line {
        Some(end) if end > r.start_line => format!("{}-{}", r.start_line, end),
        _ => r.start_line.to_string(),
    };
    format!(
        "## The entry point to trace\n\n- id: {}\n- label: {}\n- kind: {}\n- handler: {} lines {}\n- what the discovery pass said changes for it: {}\n",
        ep.id,
        ep.label,
        serde_json::to_value(ep.kind).ok().and_then(|v| v.as_str().map(String::from)).unwrap_or_default(),
        r.file,
        range,
        ep.effect
    )
}

/// Inputs: the entry point, the context pack and the discovery result.
pub async fn run(
    runner: &Runner,
    ctx: &PassCtx,
    discovery: &DiscoveryResult,
    entry_point_id: &str,
    trace_depth: u8,
    hooks: &RunHooks,
) -> Result<Outcome<WalkthroughResult>, AgentError> {
    let ep = discovery
        .entry_points
        .iter()
        .find(|e| e.id == entry_point_id)
        .ok_or_else(|| AgentError::Failed {
            message: "That entry point is no longer part of this analysis.".to_string(),
            details: String::new(),
        })?;

    let mut layers = ctx.layers(format!(
        "{}\n\n{}",
        instructions::walkthrough(trace_depth),
        entry_point_section(ep)
    ));
    layers.context_pack = format!("{}\n{}", layers.context_pack, discovery_brief(discovery));
    let pass: JsonPass<RawWalkthrough> = runner
        .run_output(&ctx.request(&layers), hooks, check)
        .await?;

    let gap_refs: Vec<CodeRef> = discovery.gaps.iter().map(|g| g.code_ref.clone()).collect();
    let src = ctx.source();
    let mut v = Verifier::new(&src, ctx.map());
    let result = verify::shape_walkthrough(pass.value, entry_point_id, &gap_refs, &mut v);
    let mut report = v.into_report();
    report.files_explored = Some(pass.files_explored.len() as u32);
    if result.blocks.is_empty() {
        // Every block's ref was dropped: nothing verifiable to show.
        return Err(AgentError::BadOutput {
            message: "The agent's walkthrough didn't match the code, so there is nothing to show. Retry to run it again.".to_string(),
            details: report.notes.join("\n"),
        });
    }
    Ok(Outcome { result, report })
}
