//! Ask (SPEC §5.4).

use super::context::{discovery_brief, Outcome, PassCtx};
use super::instructions;
use crate::agent::{AgentError, JsonPass, RunHooks, Runner};
use crate::model::*;
use crate::verify::{self, Verifier};

/// Follow-up context: the last 3 Q&As in the session.
pub const HISTORY_LIMIT: usize = 3;
const QUESTION_MAX_CHARS: usize = 2_000;

fn check(raw: &RawAsk) -> Result<(), String> {
    if raw.paragraphs.iter().all(|p| p.trim().is_empty()) {
        return Err("`paragraphs` is missing or empty".to_string());
    }
    Ok(())
}

/// The earlier Q&As (oldest first) as the agent sees them.
pub fn history_section(history: &[AskMessage]) -> String {
    let items: Vec<String> = history
        .iter()
        .filter_map(|m| {
            let a = m.answer.as_ref()?;
            Some(format!(
                "Q: {}\nA: {}",
                m.question.trim(),
                a.paragraphs.join(" ")
            ))
        })
        .collect();
    if items.is_empty() {
        return String::new();
    }
    let start = items.len().saturating_sub(HISTORY_LIMIT);
    format!(
        "## Earlier questions in this session (oldest first)\n\n{}\n",
        items[start..].join("\n\n")
    )
}

/// Inputs: the question, the context pack, the discovery result (if it has
/// run) and the last 3 Q&As.
pub async fn run(
    runner: &Runner,
    ctx: &PassCtx,
    discovery: Option<&DiscoveryResult>,
    history: &[AskMessage],
    question: &str,
    hooks: &RunHooks,
) -> Result<Outcome<AskAnswer>, AgentError> {
    let q: String = question.trim().chars().take(QUESTION_MAX_CHARS).collect();
    let mut layers = ctx.layers(format!(
        "{}\n\n## The reviewer's question\n\n{q}\n",
        instructions::ASK
    ));
    let mut pack = layers.context_pack.clone();
    if let Some(d) = discovery {
        pack.push('\n');
        pack.push_str(&discovery_brief(d));
    }
    let hist = history_section(history);
    if !hist.is_empty() {
        pack.push('\n');
        pack.push_str(&hist);
    }
    layers.context_pack = pack;
    let pass: JsonPass<RawAsk> = runner
        .run_output(&ctx.request(&layers), hooks, check)
        .await?;

    let src = ctx.source();
    let mut v = Verifier::new(&src, ctx.map());
    let result = verify::shape_ask(pass.value, &mut v);
    let mut report = v.into_report();
    report.files_explored = Some(pass.files_explored.len() as u32);
    Ok(Outcome { result, report })
}

#[cfg(test)]
mod tests {
    use super::*;

    fn msg(q: &str, a: Option<&str>) -> AskMessage {
        AskMessage {
            id: q.into(),
            question: q.into(),
            answer: a.map(|t| AskAnswer {
                paragraphs: vec![t.into()],
                grounded: true,
                ..Default::default()
            }),
            ..Default::default()
        }
    }

    #[test]
    fn history_keeps_the_last_three_answered() {
        let h = vec![
            msg("q1", Some("a1")),
            msg("q2", Some("a2")),
            msg("q3", None),
            msg("q4", Some("a4")),
            msg("q5", Some("a5")),
        ];
        let s = history_section(&h);
        assert!(!s.contains("q1"));
        assert!(!s.contains("q3"));
        assert!(s.contains("Q: q2\nA: a2"));
        assert!(s.find("q2").unwrap() < s.find("q5").unwrap());
        assert_eq!(history_section(&[]), "");
    }
}
