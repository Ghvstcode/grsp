//! Comprehension questions (SPEC §5.2).

use super::context::{discovery_brief, Outcome, PassCtx};
use super::instructions;
use crate::agent::{AgentError, JsonPass, RunHooks, Runner};
use crate::model::*;
use crate::verify::{self, Verifier};

fn check(raw: &RawQuestions) -> Result<(), String> {
    if raw.questions.iter().all(|q| q.question.trim().is_empty()) {
        return Err("`questions` is missing or empty".to_string());
    }
    Ok(())
}

/// Inputs: the context pack and the discovery result.
pub async fn run(
    runner: &Runner,
    ctx: &PassCtx,
    discovery: &DiscoveryResult,
    hooks: &RunHooks,
) -> Result<Outcome<QuestionsResult>, AgentError> {
    let mut layers = ctx.layers(instructions::QUESTIONS.to_string());
    layers.context_pack = format!("{}\n{}", layers.context_pack, discovery_brief(discovery));
    let pass: JsonPass<RawQuestions> = runner
        .run_output(&ctx.request(&layers), hooks, check)
        .await?;

    let src = ctx.source();
    let mut v = Verifier::new(&src, ctx.map());
    let result = verify::shape_questions(pass.value, &mut v);
    let mut report = v.into_report();
    report.files_explored = Some(pass.files_explored.len() as u32);
    Ok(Outcome { result, report })
}
