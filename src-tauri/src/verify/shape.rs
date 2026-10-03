//! Shaping: raw agent output + DiffMap + FileSource → UI-ready contract
//! types, with every drop rule applied (SPEC §3, §5).
//!
//! Nothing here trusts the agent for line numbers, change status, code text
//! or anchoring. Claims whose refs don't verify are dropped; the
//! `Verifier`'s report says how many.

use super::status::diff_file_for;
use super::{
    anchor_line, block_status, change_status, edge_confirmed, excerpt_block, excerpt_for_ref,
    excerpt_point, EdgeEnd, RefSide, Verifier, MAX_ENTRY_POINTS, MAX_PATH_BLOCKS,
};
use crate::model::*;
use std::collections::{BTreeMap, HashMap, HashSet};

const MAX_QUESTIONS: usize = 6;
const MAX_ASK_SUGGESTIONS: usize = 3;
const MAX_WHAT_IF_OPTIONS: usize = 3;
const MAX_GIST_WORDS: usize = 12;

fn clean(s: &str) -> String {
    s.trim().to_string()
}

/// A trimmed id, or `{prefix}{n}` when the agent left it out; made unique.
fn unique_id(raw: &str, prefix: &str, n: usize, seen: &mut HashSet<String>) -> String {
    let base = if raw.trim().is_empty() {
        format!("{prefix}{n}")
    } else {
        raw.trim().to_string()
    };
    let mut id = base.clone();
    let mut suffix = 2;
    while !seen.insert(id.clone()) {
        id = format!("{base}-{suffix}");
        suffix += 1;
    }
    id
}

fn ranges_overlap(a: &CodeRef, b: &CodeRef) -> bool {
    a.file == b.file
        && a.is_at_base() == b.is_at_base()
        && a.start_line <= b.last_line()
        && b.start_line <= a.last_line()
}

// ── Discovery (SPEC §5.1) ──────────────────────────────────

struct PendingEntry {
    raw: RawEntryPoint,
    id: String,
    code_ref: CodeRef,
    status: ChangeStatus,
}

/// Discovery → Gist (SPEC §5.1). `description` is the PR description.
///
/// - entry points, gaps and mismatches without a verified ref are never shown;
/// - a gap is kept only if Rust confirms its block is Unchanged;
/// - removed items must verify at the merge base and be removed in the diff;
/// - the entry point tag is derived here: `not_covered` if a confirmed gap
///   points at it, `new` if its block is New, `timing` if the agent set
///   `timingOnly`, else `changed`;
/// - order: entry points with gaps first, then by risk; at most 12;
/// - an empty description gives no mismatches and `descriptionEmpty`.
pub fn shape_discovery(
    raw: RawDiscovery,
    description: &str,
    v: &mut Verifier<'_>,
) -> DiscoveryResult {
    // Entry points.
    let mut seen_ids = HashSet::new();
    let mut entries: Vec<PendingEntry> = Vec::new();
    for (i, mut rep) in raw.entry_points.into_iter().enumerate() {
        let Some(raw_ref) = rep.code_ref.take() else {
            v.count_dropped(format!(
                "entry point {:?} dropped: no code reference",
                rep.label
            ));
            continue;
        };
        let Some(code_ref) = v.check(&raw_ref, RefSide::Head) else {
            continue;
        };
        let id = unique_id(&rep.id, "ep", i + 1, &mut seen_ids);
        let status = change_status(v.map, v.src, &code_ref);
        entries.push(PendingEntry {
            raw: rep,
            id,
            code_ref,
            status,
        });
    }

    // Gaps: verified ref and confirmed Unchanged, or not shown.
    let mut gaps: Vec<Gap> = Vec::new();
    for g in raw.gaps {
        let Some(raw_ref) = g.code_ref else {
            v.count_dropped(format!(
                "gap on {:?} dropped: no code reference",
                g.write_target
            ));
            continue;
        };
        let Some(code_ref) = v.check(&raw_ref, RefSide::Head) else {
            continue;
        };
        let status = change_status(v.map, v.src, &code_ref);
        if status != ChangeStatus::Unchanged {
            v.note(format!(
                "gap at {}:{} not shown: that code is part of this diff",
                code_ref.file, code_ref.start_line
            ));
            continue;
        }
        gaps.push(Gap {
            code_ref,
            write_target: clean(&g.write_target),
            explanation: clean(&g.explanation),
            entry_point_id: g.entry_point_id.map(|s| clean(&s)),
        });
    }

    // Tags, order, cap.
    let gap_entry_ids: HashSet<String> = gaps
        .iter()
        .filter_map(|g| g.entry_point_id.clone())
        .collect();
    let mut entry_points: Vec<EntryPoint> = entries
        .into_iter()
        .map(|e| {
            let has_gap = gap_entry_ids.contains(&e.id);
            let tag = if has_gap {
                AffectedTag::NotCovered
            } else if e.status == ChangeStatus::New {
                AffectedTag::New
            } else if e.raw.timing_only {
                AffectedTag::Timing
            } else {
                AffectedTag::Changed
            };
            EntryPoint {
                id: e.id,
                label: clean(&e.raw.label),
                kind: EntryPointKind::parse(&e.raw.kind),
                code_ref: e.code_ref,
                effect: clean(&e.raw.effect),
                risk: Level::parse(&e.raw.risk),
                tag,
                has_gap,
            }
        })
        .collect();
    // Stable: the agent's own order breaks ties.
    entry_points.sort_by_key(|e| (!e.has_gap, e.risk));
    if entry_points.len() > MAX_ENTRY_POINTS {
        v.note(format!(
            "{} entry points found; showing the first {MAX_ENTRY_POINTS}",
            entry_points.len()
        ));
        entry_points.truncate(MAX_ENTRY_POINTS);
    }
    let shown_ids: HashSet<&str> = entry_points.iter().map(|e| e.id.as_str()).collect();
    let known = |id: Option<String>| id.filter(|i| shown_ids.contains(i.as_str()));
    for g in &mut gaps {
        g.entry_point_id = known(g.entry_point_id.take());
    }

    // Mismatches.
    let description_empty = description.trim().is_empty();
    let mut mismatches: Vec<Mismatch> = Vec::new();
    if description_empty {
        if !raw.mismatches.is_empty() {
            v.note(format!(
                "{} mismatches ignored: the PR has no description to compare against",
                raw.mismatches.len()
            ));
        }
    } else {
        for m in raw.mismatches {
            if m.claim.trim().is_empty() && m.reality.trim().is_empty() {
                continue;
            }
            let refs = v.check_all(&m.refs, RefSide::Auto);
            if refs.is_empty() {
                v.note(format!(
                    "mismatch {:?} not shown: no verified reference",
                    clean(&m.claim)
                ));
                continue;
            }
            mismatches.push(Mismatch {
                id: format!("m{}", mismatches.len() + 1),
                claim: clean(&m.claim),
                reality: clean(&m.reality),
                refs,
                entry_point_id: known(m.entry_point_id.map(|s| clean(&s))),
            });
        }
    }

    // Removed code: must exist at the merge base and be removed by the diff.
    let mut removed: Vec<RemovedItem> = Vec::new();
    for r in raw.removed {
        let Some(raw_ref) = r.code_ref else {
            v.count_dropped(format!(
                "removed item {:?} dropped: no code reference",
                r.name
            ));
            continue;
        };
        let Some(code_ref) = v.check(&raw_ref, RefSide::Base) else {
            continue;
        };
        let really_removed = diff_file_for(v.map, &code_ref.file, true).is_some_and(|f| {
            f.status == FileStatus::Deleted
                || f.removed_lines
                    .iter()
                    .any(|n| *n >= code_ref.start_line && *n <= code_ref.last_line())
        });
        if !really_removed {
            v.note(format!(
                "removed item at {}:{} not shown: the diff doesn't remove it",
                code_ref.file, code_ref.start_line
            ));
            continue;
        }
        let name = if r.name.trim().is_empty() {
            code_ref
                .anchor
                .clone()
                .unwrap_or_else(|| code_ref.file.clone())
        } else {
            clean(&r.name)
        };
        removed.push(RemovedItem { code_ref, name });
    }

    let mut ask_suggestions: Vec<String> = Vec::new();
    for s in raw.ask_suggestions {
        let s = clean(&s);
        if !s.is_empty()
            && !ask_suggestions.contains(&s)
            && ask_suggestions.len() < MAX_ASK_SUGGESTIONS
        {
            ask_suggestions.push(s);
        }
    }

    DiscoveryResult {
        behaviour_summary: clean(&raw.behaviour_summary),
        description_empty,
        mismatches,
        entry_points,
        gaps,
        removed,
        ask_suggestions,
        shards: None,
    }
}

// ── Questions (SPEC §5.2) ──────────────────────────────────

/// Questions (SPEC §5.2): questions without a verified ref are dropped.
/// `opened` is false; the caller merges `question_state`.
pub fn shape_questions(raw: RawQuestions, v: &mut Verifier<'_>) -> QuestionsResult {
    let mut seen = HashSet::new();
    let mut questions = Vec::new();
    for (i, q) in raw.questions.into_iter().enumerate() {
        if q.question.trim().is_empty() || q.answer.trim().is_empty() {
            continue;
        }
        let refs = v.check_all(&q.refs, RefSide::Auto);
        if refs.is_empty() {
            v.note(format!(
                "question {:?} dropped: no verified reference",
                clean(&q.question)
            ));
            continue;
        }
        if questions.len() >= MAX_QUESTIONS {
            break;
        }
        questions.push(ComprehensionQuestion {
            id: unique_id(&q.id, "q", i + 1, &mut seen),
            question: clean(&q.question),
            answer: clean(&q.answer),
            refs,
            opened: false,
        });
    }
    QuestionsResult { questions }
}

// ── Discussion (SPEC §5.3) ─────────────────────────────────

/// Discussion (SPEC §5.3): attach agent gists (≤12 words) to API threads.
/// Threads, comments, authors and resolved state are facts from the API
/// and pass through untouched; gists for unknown thread ids are ignored.
pub fn shape_discussion(
    raw: RawDiscussion,
    mut threads: Vec<DiscussionThread>,
) -> DiscussionResult {
    for t in &mut threads {
        if let Some(gist) = raw.thread_gists.get(&t.id) {
            let words: Vec<&str> = gist.split_whitespace().collect();
            if !words.is_empty() {
                let mut text = words[..words.len().min(MAX_GIST_WORDS)].join(" ");
                if words.len() > MAX_GIST_WORDS {
                    text.push('…');
                }
                t.gist = Some(text);
            }
        }
    }
    let comment_count = threads.iter().map(|t| t.comments.len() as u32).sum();
    DiscussionResult {
        digest: clean(&raw.digest),
        threads,
        comment_count,
    }
}

// ── Walkthrough (SPEC §5.5) ────────────────────────────────

struct KeptBlock {
    id: String,
    label: String,
    kind: BlockKind,
    note: String,
    code_ref: CodeRef,
    excerpt: Excerpt,
    decision: Option<RawDecision>,
}

/// Where an edge to `id` lands once dropped blocks are skipped.
fn resolve_targets(
    id: &str,
    kept: &HashSet<String>,
    raw_next: &HashMap<String, Vec<String>>,
    visiting: &mut HashSet<String>,
    out: &mut Vec<String>,
) {
    if kept.contains(id) {
        if !out.iter().any(|o| o == id) {
            out.push(id.to_string());
        }
        return;
    }
    // A dropped block: follow its own edges. Unknown ids lead nowhere.
    if !visiting.insert(id.to_string()) {
        return;
    }
    if let Some(nexts) = raw_next.get(id) {
        for n in nexts {
            resolve_targets(n, kept, raw_next, visiting, out);
        }
    }
}

fn yes_no(s: &str) -> Option<&'static str> {
    match s.trim().to_ascii_lowercase().as_str() {
        "yes" | "true" | "y" => Some("yes"),
        "no" | "false" | "n" => Some("no"),
        _ => None,
    }
}

/// Walkthrough (SPEC §5.5).
///
/// - blocks whose ref is dropped are removed and `next` edges and what-if
///   paths are re-linked around them;
/// - change chips come from the DiffMap; `gap_refs` (the discovery gaps'
///   verified refs) turn an Unchanged block covering a gap into Not covered;
/// - edges that fail the spot-check are listed in `unconfirmed_edges`;
/// - a what-if option naming a block id the agent never defined is
///   discarded; fewer than two surviving options means no what-if;
/// - at most 12 blocks per path.
pub fn shape_walkthrough(
    raw: RawWalkthrough,
    entry_point_id: &str,
    gap_refs: &[CodeRef],
    v: &mut Verifier<'_>,
) -> WalkthroughResult {
    let mut defined: HashSet<String> = HashSet::new();
    let mut raw_next: HashMap<String, Vec<String>> = HashMap::new();
    let mut kept: Vec<KeptBlock> = Vec::new();

    for (i, block) in raw.blocks.into_iter().enumerate() {
        let id = if block.id.trim().is_empty() {
            format!("b{}", i + 1)
        } else {
            clean(&block.id)
        };
        if !defined.insert(id.clone()) {
            v.note(format!("block {id:?} dropped: duplicate id"));
            continue;
        }
        raw_next.insert(id.clone(), block.next.iter().map(|n| clean(n)).collect());

        let Some(mut raw_ref) = block.code_ref else {
            v.count_dropped(format!("block {id:?} dropped: no code reference"));
            continue;
        };
        if raw_ref.anchor.is_none() {
            raw_ref.anchor = block.anchor.clone();
        }
        // Removed code is listed in the Gist, never in walkthroughs: head only.
        let Some(code_ref) = v.check(&raw_ref, RefSide::Head) else {
            continue;
        };
        let Some(excerpt) = excerpt_for_ref(v.src, v.map, &code_ref) else {
            v.note(format!("block {id:?} dropped: its code couldn't be read"));
            continue;
        };
        kept.push(KeptBlock {
            id,
            label: clean(&block.label),
            kind: BlockKind::parse(&block.kind),
            note: clean(&block.note),
            code_ref,
            excerpt,
            decision: block.decision,
        });
    }

    let kept_ids: HashSet<String> = kept.iter().map(|b| b.id.clone()).collect();

    // Re-link edges around dropped blocks.
    let mut next_of: HashMap<String, Vec<String>> = HashMap::new();
    for b in &kept {
        let mut out = Vec::new();
        for n in raw_next.get(&b.id).map(Vec::as_slice).unwrap_or_default() {
            let mut visiting = HashSet::new();
            resolve_targets(n, &kept_ids, &raw_next, &mut visiting, &mut out);
        }
        out.retain(|n| n != &b.id);
        next_of.insert(b.id.clone(), out);
    }

    // Spot-check every surviving edge.
    let index: HashMap<&str, &KeptBlock> = kept.iter().map(|b| (b.id.as_str(), b)).collect();
    let mut unconfirmed_of: HashMap<String, Vec<String>> = HashMap::new();
    for b in &kept {
        let from = EdgeEnd {
            code_ref: &b.code_ref,
            label: &b.label,
            kind: b.kind,
        };
        let unconfirmed: Vec<String> = next_of[&b.id]
            .iter()
            .filter(|n| {
                index.get(n.as_str()).is_none_or(|to| {
                    !edge_confirmed(
                        v.src,
                        from,
                        EdgeEnd {
                            code_ref: &to.code_ref,
                            label: &to.label,
                            kind: to.kind,
                        },
                    )
                })
            })
            .cloned()
            .collect();
        unconfirmed_of.insert(b.id.clone(), unconfirmed);
    }
    let has_decision: HashSet<String> = kept
        .iter()
        .filter(|b| {
            b.decision
                .as_ref()
                .is_some_and(|d| !d.condition.trim().is_empty())
        })
        .map(|b| b.id.clone())
        .collect();

    let mut blocks: Vec<WalkBlock> = Vec::with_capacity(kept.len());
    for b in kept {
        let flagged_gap = gap_refs.iter().any(|g| ranges_overlap(g, &b.code_ref));
        let status = block_status(v.map, v.src, &b.code_ref, flagged_gap);
        let decision = b
            .decision
            .filter(|d| !d.condition.trim().is_empty())
            .map(|d| {
                let code_ref = d.code_ref.as_ref().and_then(|r| v.check(r, RefSide::Head));
                if code_ref.is_none() {
                    // Kept: the condition is still useful, but it's unverified.
                    v.count_unverified();
                }
                WalkDecision {
                    condition: clean(&d.condition),
                    yes: clean(&d.yes),
                    no: clean(&d.no),
                    code_ref,
                }
            });
        blocks.push(WalkBlock {
            next: next_of.remove(&b.id).unwrap_or_default(),
            unconfirmed_edges: unconfirmed_of.remove(&b.id).unwrap_or_default(),
            id: b.id,
            label: b.label,
            kind: b.kind,
            code_ref: b.code_ref,
            note: b.note,
            decision,
            status,
            excerpt: b.excerpt,
        });
    }

    // Default path: from the first block nothing points at, follow the
    // first edge each time.
    let targeted: HashSet<&str> = blocks
        .iter()
        .flat_map(|b| b.next.iter().map(String::as_str))
        .collect();
    let by_id: HashMap<&str, &WalkBlock> = blocks.iter().map(|b| (b.id.as_str(), b)).collect();
    let mut path: Vec<String> = Vec::new();
    let mut cursor = blocks
        .iter()
        .find(|b| !targeted.contains(b.id.as_str()))
        .or(blocks.first());
    while let Some(b) = cursor {
        if path.len() >= MAX_PATH_BLOCKS || path.contains(&b.id) {
            break;
        }
        path.push(b.id.clone());
        cursor = b.next.first().and_then(|n| by_id.get(n.as_str()).copied());
    }

    // What if.
    let what_if = raw.what_if.and_then(|w| {
        let variable = clean(&w.variable);
        if variable.is_empty() {
            return None;
        }
        let mut options: Vec<WhatIfOption> = Vec::new();
        for o in w.options {
            let label = clean(&o.label);
            if label.is_empty() || options.len() >= MAX_WHAT_IF_OPTIONS {
                continue;
            }
            let mut option_path: Vec<String> = Vec::new();
            let mut invented = None;
            for id in o.path.iter().map(|s| clean(s)) {
                if kept_ids.contains(&id) {
                    if option_path.last() != Some(&id) {
                        option_path.push(id);
                    }
                } else if !defined.contains(&id) {
                    invented = Some(id);
                    break;
                }
                // else: a dropped block — the path is re-linked around it.
            }
            if let Some(id) = invented {
                v.note(format!(
                    "what-if option {label:?} dropped: unknown block {id:?}"
                ));
                continue;
            }
            if option_path.is_empty() {
                v.note(format!(
                    "what-if option {label:?} dropped: no verified blocks left"
                ));
                continue;
            }
            option_path.truncate(MAX_PATH_BLOCKS);
            let on_path: HashSet<&str> = option_path.iter().map(String::as_str).collect();
            let taken: BTreeMap<String, String> = o
                .taken
                .iter()
                .filter(|(id, _)| on_path.contains(id.trim()) && has_decision.contains(id.trim()))
                .filter_map(|(id, val)| yes_no(val).map(|yn| (clean(id), yn.to_string())))
                .collect();
            let notes: BTreeMap<String, String> = o
                .notes
                .iter()
                .filter(|(id, text)| on_path.contains(id.trim()) && !text.trim().is_empty())
                .map(|(id, text)| (clean(id), clean(text)))
                .collect();
            let note = w
                .notes
                .iter()
                .find(|(k, text)| k.trim().eq_ignore_ascii_case(&label) && !text.trim().is_empty())
                .map(|(_, text)| clean(text));
            options.push(WhatIfOption {
                label,
                path: option_path,
                taken: (!taken.is_empty()).then_some(taken),
                notes: (!notes.is_empty()).then_some(notes),
                note,
            });
        }
        if options.len() < 2 {
            v.note("what-if not shown: fewer than two verifiable options");
            return None;
        }
        Some(WhatIf { variable, options })
    });

    WalkthroughResult {
        entry_point_id: entry_point_id.to_string(),
        blocks,
        path,
        what_if,
    }
}

// ── Ask (SPEC §5.4) ────────────────────────────────────────

/// Ask (SPEC §5.4): the excerpt and refs are verified. A "grounded" answer
/// with nothing verified behind it is counted as unverified and its
/// confidence lowered.
pub fn shape_ask(raw: RawAsk, v: &mut Verifier<'_>) -> AskAnswer {
    let refs = v.check_all(&raw.refs, RefSide::Auto);
    let excerpt_ref = raw.excerpt.as_ref().and_then(|r| v.check(r, RefSide::Auto));
    let highlight_ref = raw
        .highlight
        .as_ref()
        .and_then(|r| v.check(r, RefSide::Auto));

    let excerpt = match (&excerpt_ref, &highlight_ref) {
        (Some(e), hl) => {
            if e.last_line() > e.start_line {
                let line = hl
                    .as_ref()
                    .filter(|h| ranges_overlap(e, h))
                    .map(|h| h.start_line);
                excerpt_block(v.src, v.map, e, line)
            } else {
                excerpt_point(v.src, v.map, e)
            }
        }
        (None, Some(h)) => excerpt_point(v.src, v.map, h),
        (None, None) => None,
    };

    let mut confidence = Level::parse(&raw.confidence);
    let nothing_verified = refs.is_empty() && excerpt.is_none();
    if raw.grounded && nothing_verified {
        v.count_unverified();
        confidence = Level::Low;
    }

    AskAnswer {
        paragraphs: raw
            .paragraphs
            .iter()
            .map(|p| clean(p))
            .filter(|p| !p.is_empty())
            .collect(),
        excerpt,
        refs,
        confidence,
        grounded: raw.grounded,
    }
}

// ── Review (SPEC §5.6) ─────────────────────────────────────

/// Review (SPEC §5.6): findings without a verified ref are dropped; each
/// kept finding gets its anchoring from the DiffMap and an excerpt with
/// its line highlighted. Blocking findings come first.
pub fn shape_review(
    raw: RawReview,
    repo_prompt_active: bool,
    v: &mut Verifier<'_>,
) -> ReviewResult {
    let mut seen = HashSet::new();
    let mut findings: Vec<Finding> = Vec::new();
    for (i, f) in raw.findings.into_iter().enumerate() {
        if f.title.trim().is_empty() && f.why.trim().is_empty() {
            continue;
        }
        let Some(raw_ref) = f.code_ref else {
            v.count_dropped(format!(
                "finding {:?} dropped: no code reference",
                clean(&f.title)
            ));
            continue;
        };
        let Some(code_ref) = v.check(&raw_ref, RefSide::Auto) else {
            continue;
        };
        let excerpt = if code_ref.last_line() > code_ref.start_line {
            excerpt_block(v.src, v.map, &code_ref, Some(code_ref.start_line))
        } else {
            excerpt_point(v.src, v.map, &code_ref)
        };
        let Some(excerpt) = excerpt else {
            v.note(format!(
                "finding {:?} dropped: its code couldn't be read",
                clean(&f.title)
            ));
            continue;
        };
        let anchoring = if code_ref.is_at_base() {
            Anchoring::Summary
        } else {
            anchor_line(v.map, &code_ref.file, code_ref.start_line)
        };
        let comment = if f.suggested_comment.trim().is_empty() {
            clean(&f.why)
        } else {
            clean(&f.suggested_comment)
        };
        findings.push(Finding {
            id: unique_id(&f.id, "f", i + 1, &mut seen),
            severity: Severity::parse(&f.severity),
            title: clean(&f.title),
            why: clean(&f.why),
            code_ref,
            excerpt,
            comment,
            included: true,
            anchoring,
        });
    }
    findings.sort_by_key(|f| match f.severity {
        Severity::Blocking => 0,
        Severity::ShouldFix => 1,
        Severity::Nit => 2,
    });
    ReviewResult {
        findings,
        summary: clean(&raw.summary),
        repo_prompt_active,
    }
}

#[cfg(test)]
mod tests {
    use super::super::MemorySource;
    use super::*;
    use crate::git::parse_unified_diff;
    use serde_json::json;

    // The order-approval scenario: `create` now routes large orders through
    // an approval policy; the bulk import still writes orders directly.

    /// orders/services.py at head. Lines 6–9 are added.
    const SERVICES: &str = "\
from orders.policy import requires_approval

class OrderService:
    def create(self, data):
        order = Order(**data)
        if requires_approval(order):
            order.status = REQUIRES_APPROVAL
        else:
            order.status = OK
        order.save()
        publish_order_created(order)
        return order

    def cancel(self, order):
        order.status = CANCELLED
        order.save()
";

    /// orders/policy.py at head: a new file.
    const POLICY: &str = "\
THRESHOLD = 10000

def requires_approval(order):
    return order.total > THRESHOLD
";

    /// orders/views.py at head: unchanged.
    const VIEWS: &str = "\
class OrderView(APIView):
    def post(self, request):
        order = OrderService().create(request.data)
        return Response(serialize(order))
";

    /// orders/importers.py at head: unchanged — the gap.
    const IMPORTERS: &str = "\
def bulk_import(rows):
    orders = [Order(**row, status=OK) for row in rows]
    Order.objects.bulk_create(orders)
    return len(orders)
";

    /// orders/events.py and orders/jobs.py at head: unchanged.
    const EVENTS: &str = "\
def publish_order_created(order):
    queue.publish('order.created', order.id)
";
    const JOBS: &str = "\
def handle_order_created(order_id):
    send_confirmation(order_id)
";

    /// orders/legacy.py at the merge base: deleted by the PR.
    const LEGACY: &str = "\
def auto_approve(order):
    order.status = OK
";

    const DIFF: &str = "\
diff --git a/orders/services.py b/orders/services.py
index 1..2 100644
--- a/orders/services.py
+++ b/orders/services.py
@@ -1,9 +1,13 @@
+from orders.policy import requires_approval

 class OrderService:
     def create(self, data):
         order = Order(**data)
-        order.status = OK
+        if requires_approval(order):
+            order.status = REQUIRES_APPROVAL
+        else:
+            order.status = OK
         order.save()
         publish_order_created(order)
         return order

diff --git a/orders/policy.py b/orders/policy.py
new file mode 100644
--- /dev/null
+++ b/orders/policy.py
@@ -0,0 +1,4 @@
+THRESHOLD = 10000
+
+def requires_approval(order):
+    return order.total > THRESHOLD
diff --git a/orders/legacy.py b/orders/legacy.py
deleted file mode 100644
--- a/orders/legacy.py
+++ /dev/null
@@ -1,2 +0,0 @@
-def auto_approve(order):
-    order.status = OK
";

    fn src() -> MemorySource {
        MemorySource::new()
            .with_head("orders/services.py", SERVICES)
            .with_head("orders/policy.py", POLICY)
            .with_head("orders/views.py", VIEWS)
            .with_head("orders/importers.py", IMPORTERS)
            .with_head("orders/events.py", EVENTS)
            .with_head("orders/jobs.py", JOBS)
            .with_base("orders/legacy.py", LEGACY)
            .with_base("orders/views.py", VIEWS)
            .with_root("/wt")
    }

    fn map() -> DiffMap {
        DiffMap {
            files: parse_unified_diff(DIFF)
                .into_iter()
                .map(|(f, _)| f)
                .collect(),
        }
    }

    fn parse<T: serde::de::DeserializeOwned>(v: serde_json::Value) -> T {
        serde_json::from_value(v).unwrap()
    }

    #[test]
    fn fixture_is_consistent() {
        let m = map();
        let f = m.file("orders/services.py").unwrap();
        assert_eq!(f.added_lines, vec![1, 6, 7, 8, 9]);
        assert_eq!(
            SERVICES.lines().nth(5).unwrap().trim(),
            "if requires_approval(order):"
        );
        assert_eq!(SERVICES.lines().count(), 16);
    }

    // ── Discovery ──────────────────────────────────────────

    fn good_discovery() -> serde_json::Value {
        json!({
            "behaviourSummary": " Orders above the threshold now wait for approval. ",
            "mismatches": [{
                "claim": "All orders above €10,000 require approval",
                "reality": "Bulk import creates orders without the check",
                "refs": [{"file": "orders/importers.py", "startLine": 3, "anchor": "bulk_create"}],
                "entryPointId": "ep3"
            }],
            "entryPoints": [
                {"id": "ep1", "label": "POST /orders", "kind": "http",
                 "ref": {"file": "orders/views.py", "startLine": 2, "endLine": 4, "anchor": "def post"},
                 "effect": "Large orders are held", "risk": "medium", "timingOnly": false,
                 "status": "new", "changeStatus": "new"},
                {"id": "ep2", "label": "order.created consumer", "kind": "consumer",
                 "ref": {"file": "orders/jobs.py", "startLine": 1, "anchor": "def handle_order_created"},
                 "effect": "Runs later for held orders", "risk": "low", "timingOnly": true},
                {"id": "ep3", "label": "Bulk import", "kind": "job",
                 "ref": {"file": "orders/importers.py", "startLine": 1, "endLine": 4, "anchor": "def bulk_import"},
                 "effect": "Still writes orders directly", "risk": "high"},
                {"id": "ep4", "label": "Approval policy", "kind": "api",
                 "ref": {"file": "orders/policy.py", "startLine": 3, "endLine": 4, "anchor": "def requires_approval"},
                 "effect": "New rule", "risk": "high"}
            ],
            "gaps": [{
                "ref": {"file": "orders/importers.py", "startLine": 3, "anchor": "bulk_create"},
                "writeTarget": "orders table", "explanation": "bulk_create bypasses the policy",
                "entryPointId": "ep3"
            }],
            "removed": [{"ref": {"file": "orders/legacy.py", "startLine": 1, "endLine": 2, "anchor": "def auto_approve"}, "name": "auto_approve"}],
            "askSuggestions": ["What happens at exactly 10,000?", " ", "Who can approve?", "Is import covered?", "A fourth one"]
        })
    }

    #[test]
    fn discovery_good_output_shapes_the_gist() {
        let (s, m) = (src(), map());
        let mut v = Verifier::new(&s, &m);
        let d = shape_discovery(
            parse(good_discovery()),
            "Orders above €10,000 require approval.",
            &mut v,
        );

        assert_eq!(
            d.behaviour_summary,
            "Orders above the threshold now wait for approval."
        );
        assert!(!d.description_empty);

        // Order: gap first, then high, medium, low.
        let ids: Vec<&str> = d.entry_points.iter().map(|e| e.id.as_str()).collect();
        assert_eq!(ids, vec!["ep3", "ep4", "ep1", "ep2"]);

        // Tags are derived here; the agent's "status": "new" on ep1 is ignored.
        let tag = |id: &str| d.entry_points.iter().find(|e| e.id == id).unwrap().tag;
        assert_eq!(tag("ep3"), AffectedTag::NotCovered);
        assert_eq!(tag("ep4"), AffectedTag::New);
        assert_eq!(tag("ep1"), AffectedTag::Changed);
        assert_eq!(tag("ep2"), AffectedTag::Timing);
        assert!(d.entry_points[0].has_gap);
        assert!(!d.entry_points[1].has_gap);
        assert_eq!(d.entry_points[0].kind, EntryPointKind::Job);

        assert_eq!(d.gaps.len(), 1);
        assert_eq!(d.gaps[0].entry_point_id.as_deref(), Some("ep3"));
        assert!(d.gaps[0].code_ref.verified);

        assert_eq!(d.mismatches.len(), 1);
        assert_eq!(d.mismatches[0].id, "m1");
        assert_eq!(d.mismatches[0].entry_point_id.as_deref(), Some("ep3"));

        assert_eq!(d.removed.len(), 1);
        assert_eq!(d.removed[0].code_ref.at_base, Some(true));

        assert_eq!(d.ask_suggestions.len(), 3);
        assert_eq!(d.ask_suggestions[1], "Who can approve?");

        let r = v.into_report();
        assert_eq!((r.verified, r.dropped, r.unverified), (7, 0, 0));
        // Every shown item carries a verified ref.
        assert!(d.entry_points.iter().all(|e| e.code_ref.verified));
        assert!(d
            .mismatches
            .iter()
            .all(|m| m.refs.iter().all(|r| r.verified)));
    }

    #[test]
    fn discovery_drops_hallucinated_files_wrong_lines_and_wrong_anchors() {
        let (s, m) = (src(), map());
        let mut v = Verifier::new(&s, &m);
        let raw = json!({
            "behaviourSummary": "x",
            "entryPoints": [
                // Hallucinated file.
                {"id": "a", "label": "Ghost", "ref": {"file": "orders/ghost.py", "startLine": 1, "anchor": "def ghost"}},
                // Wrong anchor.
                {"id": "b", "label": "Wrong anchor", "ref": {"file": "orders/views.py", "startLine": 2, "anchor": "def delete"}},
                // Line number past the end of the file, no anchor.
                {"id": "c", "label": "Wrong line", "ref": {"file": "orders/views.py", "startLine": 400}},
                // No ref at all.
                {"id": "d", "label": "No ref"},
                // Path escaping the worktree.
                {"id": "e", "label": "Escape", "ref": {"file": "../../etc/passwd", "startLine": 1}},
                // Wrong line but the anchor is 9 lines away: snapped.
                {"id": "f", "label": "Snapped", "ref": {"file": "orders/services.py", "startLine": 13, "endLine": 20, "anchor": "def create"}},
                // Absolute path inside the worktree.
                {"id": "g", "label": "Absolute", "ref": {"file": "/wt/orders/views.py", "startLine": 2, "anchor": "def post"}}
            ],
            "mismatches": [
                {"claim": "c1", "reality": "r1", "refs": [{"file": "orders/ghost.py", "startLine": 1}]},
                {"claim": "c2", "reality": "r2", "refs": []},
                {"claim": "c3", "reality": "r3", "entryPointId": "a",
                 "refs": [{"file": "orders/ghost.py", "startLine": 1},
                          {"file": "orders/importers.py", "startLine": 3, "anchor": "bulk_create"}]}
            ],
            "gaps": [
                {"ref": {"file": "orders/ghost.py", "startLine": 3}, "writeTarget": "t", "explanation": "e"},
                {"writeTarget": "t2", "explanation": "no ref"}
            ],
            "removed": [
                // Still exists at head and isn't removed by the diff.
                {"ref": {"file": "orders/views.py", "startLine": 1, "anchor": "class OrderView"}, "name": "OrderView"},
                // Never existed.
                {"ref": {"file": "orders/never.py", "startLine": 1}, "name": "never"}
            ]
        });
        let d = shape_discovery(parse(raw), "A description.", &mut v);

        let ids: Vec<&str> = d.entry_points.iter().map(|e| e.id.as_str()).collect();
        assert_eq!(ids, vec!["f", "g"]);
        let snapped = &d.entry_points[0].code_ref;
        assert_eq!(
            (snapped.start_line, snapped.end_line, snapped.snapped),
            (4, Some(11), Some(true))
        );
        assert_eq!(d.entry_points[1].code_ref.file, "orders/views.py");

        // Only the mismatch with a verified ref survives, keeping just that
        // ref; its entry point was dropped so the link is cleared.
        assert_eq!(d.mismatches.len(), 1);
        assert_eq!(d.mismatches[0].claim, "c3");
        assert_eq!(d.mismatches[0].refs.len(), 1);
        assert_eq!(d.mismatches[0].entry_point_id, None);

        assert!(d.gaps.is_empty());
        assert!(d.removed.is_empty());

        let r = v.into_report();
        // Verified: f, g, c3's importers ref, the views.py "removed" ref at base.
        assert_eq!(r.verified, 4);
        // Dropped: a, b, c, d, e, two ghost mismatch refs, gap ghost, gap without ref, never.py.
        assert_eq!(r.dropped, 10);
        assert!(r
            .notes
            .iter()
            .any(|n| n.contains("the diff doesn't remove it")));
    }

    #[test]
    fn discovery_gap_that_is_part_of_the_diff_is_not_a_gap() {
        let (s, m) = (src(), map());
        let mut v = Verifier::new(&s, &m);
        let raw = json!({
            "entryPoints": [
                {"id": "ep1", "label": "create", "risk": "low",
                 "ref": {"file": "orders/services.py", "startLine": 4, "endLine": 12, "anchor": "def create"}}
            ],
            "gaps": [
                // The agent calls changed code a gap: Rust says it's Changed.
                {"ref": {"file": "orders/services.py", "startLine": 4, "endLine": 12, "anchor": "def create"},
                 "writeTarget": "orders", "explanation": "x", "entryPointId": "ep1"},
                // New file: also not a gap.
                {"ref": {"file": "orders/policy.py", "startLine": 3, "anchor": "requires_approval"},
                 "writeTarget": "orders", "explanation": "x"},
                // A real one, pointing at an entry point that doesn't exist.
                {"ref": {"file": "orders/services.py", "startLine": 14, "endLine": 16, "anchor": "def cancel"},
                 "writeTarget": "orders", "explanation": "cancel skips the policy", "entryPointId": "nope"}
            ]
        });
        let d = shape_discovery(parse(raw), "desc", &mut v);
        assert_eq!(d.gaps.len(), 1);
        assert_eq!(d.gaps[0].code_ref.start_line, 14);
        assert_eq!(d.gaps[0].entry_point_id, None);
        // ep1's "gap" was rejected, so it isn't tagged not_covered.
        assert_eq!(d.entry_points[0].tag, AffectedTag::Changed);
        assert!(!d.entry_points[0].has_gap);
        assert_eq!(
            v.report
                .notes
                .iter()
                .filter(|n| n.contains("part of this diff"))
                .count(),
            2
        );
    }

    #[test]
    fn discovery_empty_description_gives_no_mismatches() {
        let (s, m) = (src(), map());
        let mut v = Verifier::new(&s, &m);
        let d = shape_discovery(parse(good_discovery()), "  \n ", &mut v);
        assert!(d.description_empty);
        assert!(d.mismatches.is_empty());
        assert_eq!(d.entry_points.len(), 4);
    }

    #[test]
    fn discovery_caps_entry_points_at_twelve_and_dedupes_ids() {
        let (s, m) = (src(), map());
        let mut v = Verifier::new(&s, &m);
        let eps: Vec<serde_json::Value> = (0..15)
            .map(|i| {
                json!({"id": if i < 2 { "same".to_string() } else { format!("e{i}") },
                       "label": format!("L{i}"), "risk": if i == 14 { "high" } else { "low" },
                       "ref": {"file": "orders/views.py", "startLine": 2, "anchor": "def post"}})
            })
            .collect();
        let d = shape_discovery(parse(json!({"entryPoints": eps})), "desc", &mut v);
        assert_eq!(d.entry_points.len(), 12);
        // Highest risk first even though the agent listed it last.
        assert_eq!(d.entry_points[0].id, "e14");
        assert_eq!(d.entry_points[1].id, "same");
        assert_eq!(d.entry_points[2].id, "same-2");
    }

    #[test]
    fn discovery_survives_empty_output() {
        let (s, m) = (src(), map());
        let mut v = Verifier::new(&s, &m);
        let d = shape_discovery(parse(json!({})), "desc", &mut v);
        assert!(d.entry_points.is_empty() && d.gaps.is_empty() && d.mismatches.is_empty());
        assert_eq!(v.into_report(), VerificationReport::default());
    }

    // ── Questions ──────────────────────────────────────────

    #[test]
    fn questions_without_a_verified_ref_are_dropped() {
        let (s, m) = (src(), map());
        let mut v = Verifier::new(&s, &m);
        let raw = json!([
            {"id": "q1", "question": "What happens at exactly the threshold?", "answer": "Not held: the check is >.",
             "refs": [{"file": "orders/policy.py", "startLine": 4, "anchor": "order.total > THRESHOLD"}]},
            {"id": "q2", "question": "Invented?", "answer": "Yes.",
             "refs": [{"file": "orders/ghost.py", "startLine": 1}]},
            {"id": "q3", "question": "No refs?", "answer": "None."},
            {"id": "q4", "question": "Mixed refs?", "answer": "One survives.",
             "refs": [{"file": "orders/views.py", "startLine": 3, "anchor": "nonsense"},
                      {"file": "orders/views.py", "startLine": 9, "anchor": "OrderService().create"}]},
            {"id": "q5", "question": "", "answer": "blank question"}
        ]);
        let q = shape_questions(parse(raw), &mut v);
        let ids: Vec<&str> = q.questions.iter().map(|x| x.id.as_str()).collect();
        assert_eq!(ids, vec!["q1", "q4"]);
        assert!(q.questions.iter().all(|x| !x.opened));
        // q4's surviving ref was snapped from line 9 to line 3.
        assert_eq!(q.questions[1].refs.len(), 1);
        assert_eq!(q.questions[1].refs[0].start_line, 3);
        assert_eq!(q.questions[1].refs[0].snapped, Some(true));
        let r = v.into_report();
        assert_eq!((r.verified, r.dropped), (2, 2));
    }

    // ── Discussion ─────────────────────────────────────────

    #[test]
    fn discussion_attaches_short_gists_to_known_threads() {
        let threads = vec![
            DiscussionThread {
                id: "t1".into(),
                resolved: false,
                comments: vec![DiscussionComment::default(), DiscussionComment::default()],
                ..Default::default()
            },
            DiscussionThread {
                id: "t2".into(),
                resolved: true,
                comments: vec![DiscussionComment::default()],
                ..Default::default()
            },
        ];
        let raw: RawDiscussion = parse(json!({
            "digest": " Two threads. ",
            "threadGists": {
                "t1": "one two three four five six seven eight nine ten eleven twelve thirteen fourteen",
                "ghost": "not a thread"
            }
        }));
        let d = shape_discussion(raw, threads);
        assert_eq!(d.digest, "Two threads.");
        assert_eq!(d.comment_count, 3);
        assert_eq!(
            d.threads[0]
                .gist
                .as_deref()
                .unwrap()
                .split_whitespace()
                .count(),
            12
        );
        assert!(d.threads[0].gist.as_deref().unwrap().ends_with("twelve…"));
        assert_eq!(d.threads[1].gist, None);
        assert!(d.threads[1].resolved);
    }

    // ── Walkthrough ────────────────────────────────────────

    fn good_walkthrough() -> serde_json::Value {
        json!({
            "blocks": [
                {"id": "b1", "label": "OrderView.post", "kind": "route",
                 "ref": {"file": "orders/views.py", "startLine": 2, "endLine": 4, "anchor": "def post"},
                 "note": "Entry.", "next": ["b2"], "status": "changed"},
                {"id": "b2", "label": "OrderService.create", "kind": "service",
                 "ref": {"file": "orders/services.py", "startLine": 4, "endLine": 12},
                 "anchor": "def create", "note": "Now checks the policy.", "next": ["b3", "b4"],
                 "decision": {"condition": "requires_approval(order)", "yes": "REQUIRES_APPROVAL", "no": "OK",
                              "ref": {"file": "orders/services.py", "startLine": 6, "anchor": "if requires_approval"}}},
                {"id": "b3", "label": "requires_approval", "kind": "policy",
                 "ref": {"file": "orders/policy.py", "startLine": 3, "endLine": 4, "anchor": "def requires_approval"},
                 "note": "The new rule.", "next": []},
                {"id": "b4", "label": "publish_order_created", "kind": "event",
                 "ref": {"file": "orders/events.py", "startLine": 1, "endLine": 2, "anchor": "def publish_order_created"},
                 "note": "Publishes.", "next": ["b5"]},
                {"id": "b5", "label": "handle_order_created", "kind": "job",
                 "ref": {"file": "orders/jobs.py", "startLine": 1, "endLine": 2, "anchor": "def handle_order_created"},
                 "note": "Consumer.", "next": []}
            ],
            "whatIf": {
                "variable": "order total",
                "options": [
                    {"label": "€9,999", "path": ["b1", "b2", "b3", "b4", "b5"], "taken": {"b2": "no", "b1": "yes", "zz": "no"},
                     "notes": {"b2": "Status stays OK.", "zz": "ignored"}},
                    {"label": "€10,000", "path": ["b1", "b2", "b3", "b4", "b5"], "taken": {"b2": "no"}},
                    {"label": "€25,000", "path": ["b1", "b2", "b3"], "taken": {"b2": "YES"}}
                ],
                "notes": {"€10,000": "The check is strictly greater-than, so exactly 10,000 is not held."}
            }
        })
    }

    #[test]
    fn walkthrough_good_output() {
        let (s, m) = (src(), map());
        let mut v = Verifier::new(&s, &m);
        let w = shape_walkthrough(parse(good_walkthrough()), "ep1", &[], &mut v);
        assert_eq!(w.entry_point_id, "ep1");
        assert_eq!(w.blocks.len(), 5);

        // Change chips come from the DiffMap, not the agent ("status": "changed" on b1).
        let status = |id: &str| w.blocks.iter().find(|b| b.id == id).unwrap().status;
        assert_eq!(status("b1"), ChangeStatus::Unchanged);
        assert_eq!(status("b2"), ChangeStatus::Changed);
        assert_eq!(status("b3"), ChangeStatus::New);
        assert_eq!(status("b4"), ChangeStatus::Unchanged);

        // The block-level anchor was used for b2's ref.
        let b2 = &w.blocks[1];
        assert_eq!(b2.code_ref.anchor.as_deref(), Some("def create"));
        assert_eq!(b2.next, vec!["b3", "b4"]);
        // Every edge here is visible in the code, and event → job is exempt.
        assert!(
            w.blocks.iter().all(|b| b.unconfirmed_edges.is_empty()),
            "{:?}",
            w.blocks
                .iter()
                .map(|b| &b.unconfirmed_edges)
                .collect::<Vec<_>>()
        );

        // Excerpts are read here, with diff markers.
        assert_eq!(b2.excerpt.lines.len(), 9);
        assert_eq!(b2.excerpt.lines[2].sign, "+");
        assert_eq!(b2.excerpt.lines[0].sign, " ");
        assert!(b2.excerpt.lines[2]
            .text
            .contains("if requires_approval(order):"));

        let d = b2.decision.as_ref().unwrap();
        assert_eq!(d.yes, "REQUIRES_APPROVAL");
        assert!(d.code_ref.as_ref().unwrap().verified);

        assert_eq!(w.path, vec!["b1", "b2", "b3"]);

        let wi = w.what_if.unwrap();
        assert_eq!(wi.variable, "order total");
        assert_eq!(wi.options.len(), 3);
        // `taken` keeps only decisions on the path; values are normalised.
        let taken0 = wi.options[0].taken.as_ref().unwrap();
        assert_eq!(taken0.len(), 1);
        assert_eq!(taken0["b2"], "no");
        assert_eq!(wi.options[2].taken.as_ref().unwrap()["b2"], "yes");
        assert_eq!(wi.options[0].notes.as_ref().unwrap().len(), 1);
        assert!(wi.options[1].note.as_deref().unwrap().contains("strictly"));
        assert_eq!(wi.options[0].note, None);
        assert_eq!(wi.options[2].path, vec!["b1", "b2", "b3"]);

        let r = v.into_report();
        assert_eq!((r.verified, r.dropped, r.unverified), (6, 0, 0));
    }

    #[test]
    fn walkthrough_drops_bad_blocks_and_relinks_around_them() {
        let (s, m) = (src(), map());
        let mut v = Verifier::new(&s, &m);
        let mut raw = good_walkthrough();
        // b2's anchor is wrong and b4 points at a file that doesn't exist.
        raw["blocks"][1]["anchor"] = json!("def destroy");
        raw["blocks"][3]["ref"]["file"] = json!("orders/ghost.py");
        let w = shape_walkthrough(parse(raw), "ep1", &[], &mut v);

        let ids: Vec<&str> = w.blocks.iter().map(|b| b.id.as_str()).collect();
        assert_eq!(ids, vec!["b1", "b3", "b5"]);
        // b1 → (b2) → b3 and b1 → (b2) → (b4) → b5.
        assert_eq!(w.blocks[0].next, vec!["b3", "b5"]);
        // The re-linked edges can't be seen in b1's code: dotted.
        assert_eq!(w.blocks[0].unconfirmed_edges, vec!["b3", "b5"]);
        assert!(w.blocks[1].next.is_empty());

        let wi = w.what_if.unwrap();
        assert_eq!(wi.options[0].path, vec!["b1", "b3", "b5"]);
        assert_eq!(wi.options[2].path, vec!["b1", "b3"]);
        // b2 is gone, so nothing can be "taken" at it.
        assert_eq!(wi.options[0].taken, None);
        assert_eq!(wi.options[0].notes, None);
        // Every path id exists.
        for o in &wi.options {
            assert!(o.path.iter().all(|id| ids.contains(&id.as_str())));
        }
        assert_eq!(w.path, vec!["b1", "b3"]);
        assert_eq!(v.report.dropped, 2);
    }

    #[test]
    fn walkthrough_what_if_with_invented_block_ids_is_discarded() {
        let (s, m) = (src(), map());
        let mut v = Verifier::new(&s, &m);
        let mut raw = good_walkthrough();
        raw["whatIf"]["options"][0]["path"] = json!(["b1", "b2", "b99"]);
        raw["whatIf"]["options"][1]["path"] = json!(["b1", "nope"]);
        let w = shape_walkthrough(parse(raw), "ep1", &[], &mut v);
        // Only one option is left: no what-if at all.
        assert!(w.what_if.is_none());
        assert!(v
            .report
            .notes
            .iter()
            .any(|n| n.contains("unknown block \"b99\"")));
    }

    #[test]
    fn walkthrough_unconfirmed_edge_and_unverified_decision() {
        let (s, m) = (src(), map());
        let mut v = Verifier::new(&s, &m);
        let raw = json!({
            "blocks": [
                {"id": "b1", "label": "OrderView.post", "kind": "route",
                 "ref": {"file": "orders/views.py", "startLine": 2, "endLine": 4, "anchor": "def post"},
                 "next": ["b2", "ghost", "b1"],
                 "decision": {"condition": "request.user.is_staff", "yes": "allowed", "no": "403",
                              "ref": {"file": "orders/views.py", "startLine": 3, "anchor": "is_staff"}}},
                // views.post never mentions bulk_import.
                {"id": "b2", "label": "bulk_import", "kind": "job",
                 "ref": {"file": "orders/importers.py", "startLine": 1, "endLine": 4, "anchor": "def bulk_import"},
                 "next": ["b1"]}
            ],
            "whatIf": null
        });
        let gap = CodeRef {
            file: "orders/importers.py".into(),
            start_line: 3,
            verified: true,
            ..Default::default()
        };
        let w = shape_walkthrough(parse(raw), "ep3", &[gap], &mut v);
        assert_eq!(w.blocks[0].next, vec!["b2"]);
        assert_eq!(w.blocks[0].unconfirmed_edges, vec!["b2"]);
        // The decision is kept without its ref and counted as unverified.
        let d = w.blocks[0].decision.as_ref().unwrap();
        assert_eq!(d.code_ref, None);
        assert_eq!(v.report.unverified, 1);
        // The unchanged block covering a confirmed gap is Not covered.
        assert_eq!(w.blocks[1].status, ChangeStatus::NotCovered);
        assert_eq!(w.blocks[0].status, ChangeStatus::Unchanged);
        // A cycle doesn't loop the default path.
        assert_eq!(w.path, vec!["b1", "b2"]);
        assert!(w.what_if.is_none());
    }

    #[test]
    fn walkthrough_paths_are_capped_at_twelve_blocks() {
        let (s, m) = (src(), map());
        let mut v = Verifier::new(&s, &m);
        let blocks: Vec<serde_json::Value> = (1..=15)
            .map(|i| {
                json!({"id": format!("b{i}"), "label": format!("step {i}"), "kind": "other",
                       "ref": {"file": "orders/services.py", "startLine": i},
                       "next": if i < 15 { vec![format!("b{}", i + 1)] } else { vec![] }})
            })
            .collect();
        let all: Vec<String> = (1..=15).map(|i| format!("b{i}")).collect();
        let raw = json!({"blocks": blocks, "whatIf": {"variable": "x", "options": [
            {"label": "a", "path": all}, {"label": "b", "path": ["b1", "b1", "b2"]},
            {"label": "c", "path": ["b3"]}, {"label": "d", "path": ["b4"]}
        ]}});
        let w = shape_walkthrough(parse(raw), "ep", &[], &mut v);
        assert_eq!(w.blocks.len(), 15);
        assert_eq!(w.path.len(), 12);
        let wi = w.what_if.unwrap();
        assert_eq!(wi.options.len(), 3);
        assert_eq!(wi.options[0].path.len(), 12);
        assert_eq!(wi.options[1].path, vec!["b1", "b2"]);
    }

    #[test]
    fn walkthrough_with_everything_dropped_is_empty_not_a_panic() {
        let (s, m) = (src(), map());
        let mut v = Verifier::new(&s, &m);
        let raw = json!({"blocks": [
            {"id": "b1", "label": "x", "ref": {"file": "nope.py", "startLine": 1}, "next": ["b2"]},
            {"id": "b2", "label": "y", "next": ["b1"]},
            // Removed code never appears in a walkthrough.
            {"id": "b3", "label": "auto_approve", "ref": {"file": "orders/legacy.py", "startLine": 1, "anchor": "def auto_approve"}}
        ], "whatIf": {"variable": "v", "options": [{"label": "a", "path": ["b1"]}, {"label": "b", "path": ["b2"]}]}});
        let w = shape_walkthrough(parse(raw), "ep", &[], &mut v);
        assert!(w.blocks.is_empty());
        assert!(w.path.is_empty());
        assert!(w.what_if.is_none());
        assert_eq!(v.report.dropped, 3);
    }

    // ── Ask ────────────────────────────────────────────────

    #[test]
    fn ask_verifies_excerpt_and_refs() {
        let (s, m) = (src(), map());
        let mut v = Verifier::new(&s, &m);
        let raw = json!({
            "paragraphs": ["Exactly 10,000 is not held.", "  "],
            "excerpt": {"file": "orders/policy.py", "startLine": 3, "endLine": 4, "anchor": "def requires_approval"},
            "highlight": {"file": "orders/policy.py", "startLine": 4, "anchor": "order.total > THRESHOLD"},
            "refs": [
                {"file": "orders/policy.py", "startLine": 4, "anchor": "order.total > THRESHOLD"},
                {"file": "orders/ghost.py", "startLine": 1}
            ],
            "confidence": "high", "grounded": true
        });
        let a = shape_ask(parse(raw), &mut v);
        assert_eq!(a.paragraphs.len(), 1);
        assert_eq!(a.refs.len(), 1);
        let e = a.excerpt.unwrap();
        assert_eq!((e.start_line, e.end_line), (3, 4));
        assert_eq!(e.lines[1].highlight, Some(true));
        assert_eq!(e.lines[0].highlight, None);
        assert!(e.lines.iter().all(|l| l.sign == "+"));
        assert_eq!(a.confidence, Level::High);
        assert!(a.grounded);
        let r = v.into_report();
        assert_eq!((r.verified, r.dropped, r.unverified), (3, 1, 0));
    }

    #[test]
    fn ask_with_nothing_verified_is_unverified_and_low_confidence() {
        let (s, m) = (src(), map());
        let mut v = Verifier::new(&s, &m);
        let raw = json!({
            "paragraphs": ["Refunds are handled in billing/refunds.py."],
            "excerpt": {"file": "billing/refunds.py", "startLine": 10, "anchor": "def refund"},
            "refs": [{"file": "billing/refunds.py", "startLine": 10}],
            "confidence": "high", "grounded": true
        });
        let a = shape_ask(parse(raw), &mut v);
        assert!(a.excerpt.is_none());
        assert!(a.refs.is_empty());
        assert_eq!(a.confidence, Level::Low);
        assert_eq!(v.report.unverified, 1);
        assert_eq!(v.report.dropped, 2);
    }

    #[test]
    fn ask_ungrounded_answer_passes_through() {
        let (s, m) = (src(), map());
        let mut v = Verifier::new(&s, &m);
        let raw = json!({
            "paragraphs": ["No direct match in this repository."],
            "excerpt": null, "highlight": null, "refs": [], "confidence": "low", "grounded": false
        });
        let a = shape_ask(parse(raw), &mut v);
        assert!(!a.grounded);
        assert!(a.excerpt.is_none());
        assert_eq!(v.into_report(), VerificationReport::default());
    }

    // ── Review ─────────────────────────────────────────────

    #[test]
    fn review_drops_unverified_findings_and_anchors_the_rest() {
        let (s, m) = (src(), map());
        let mut v = Verifier::new(&s, &m);
        let raw = json!({
            "summary": " The policy is bypassed by bulk import. ",
            "findings": [
                // In the diff (added line): inline.
                {"id": "f1", "severity": "should_fix", "title": "Boundary", "why": "Uses > not >=",
                 "ref": {"file": "orders/services.py", "startLine": 6, "anchor": "if requires_approval(order)"},
                 "suggestedComment": "Should exactly 10,000 be held?"},
                // Unchanged file: posts in the summary.
                {"id": "f2", "severity": "blocking", "title": "Bulk import bypasses approval", "why": "bulk_create skips the policy",
                 "ref": {"file": "orders/importers.py", "startLine": 3, "anchor": "bulk_create"},
                 "suggestedComment": ""},
                // Hallucinated file.
                {"id": "f3", "severity": "blocking", "title": "Ghost", "why": "x",
                 "ref": {"file": "orders/ghost.py", "startLine": 1}},
                // Wrong anchor.
                {"id": "f4", "severity": "nit", "title": "Wrong anchor", "why": "x",
                 "ref": {"file": "orders/services.py", "startLine": 5, "anchor": "order.refund()"}},
                // No ref.
                {"id": "f5", "severity": "nit", "title": "No ref", "why": "x"},
                // Context line inside a hunk: inline. Duplicate id, odd severity.
                {"id": "f1", "severity": "Nitpick", "title": "Context", "why": "x",
                 "ref": {"file": "orders/services.py", "startLine": 10, "anchor": "order.save()"}},
                // Same file but outside any hunk: summary. Wrong line, snapped.
                {"severity": "should fix", "title": "Cancel", "why": "No policy on cancel",
                 "ref": {"file": "orders/services.py", "startLine": 9, "anchor": "def cancel"}}
            ]
        });
        let r = shape_review(parse(raw), true, &mut v);
        assert!(r.repo_prompt_active);
        assert_eq!(r.summary, "The policy is bypassed by bulk import.");

        let titles: Vec<&str> = r.findings.iter().map(|f| f.title.as_str()).collect();
        // Blocking first, then should-fix, then nits; agent order within a group.
        assert_eq!(
            titles,
            vec![
                "Bulk import bypasses approval",
                "Boundary",
                "Cancel",
                "Context"
            ]
        );

        let by = |t: &str| r.findings.iter().find(|f| f.title == t).unwrap();
        assert_eq!(by("Boundary").anchoring, Anchoring::Inline);
        assert_eq!(by("Context").anchoring, Anchoring::Inline);
        assert_eq!(
            by("Bulk import bypasses approval").anchoring,
            Anchoring::Summary
        );
        assert_eq!(by("Cancel").anchoring, Anchoring::Summary);

        // Ids are unique; missing ones are filled in.
        assert_eq!(by("Boundary").id, "f1");
        assert_eq!(by("Context").id, "f1-2");
        assert_eq!(by("Cancel").id, "f7");
        assert_eq!(by("Context").severity, Severity::Nit);
        assert_eq!(by("Cancel").severity, Severity::ShouldFix);

        // The snapped ref points at the real line, and that line is highlighted.
        let cancel = by("Cancel");
        assert_eq!(
            (cancel.code_ref.start_line, cancel.code_ref.snapped),
            (14, Some(true))
        );
        let hl: Vec<u32> = cancel
            .excerpt
            .lines
            .iter()
            .filter(|l| l.highlight == Some(true))
            .map(|l| l.n)
            .collect();
        assert_eq!(hl, vec![14]);

        let boundary = by("Boundary");
        assert_eq!(boundary.comment, "Should exactly 10,000 be held?");
        assert!(boundary.included);
        assert_eq!(
            (boundary.excerpt.start_line, boundary.excerpt.end_line),
            (3, 9)
        );
        assert_eq!(boundary.excerpt.lines[3].sign, "+");
        assert_eq!(boundary.excerpt.lines[3].highlight, Some(true));
        // An empty suggested comment falls back to the reason.
        assert_eq!(
            by("Bulk import bypasses approval").comment,
            "bulk_create skips the policy"
        );

        let rep = v.into_report();
        assert_eq!((rep.verified, rep.dropped), (4, 3));
    }

    #[test]
    fn review_finding_on_removed_code_posts_in_summary() {
        let (s, m) = (src(), map());
        let mut v = Verifier::new(&s, &m);
        let raw = json!({"findings": [
            {"id": "f1", "severity": "should_fix", "title": "Removed safety net", "why": "auto_approve is gone",
             "ref": {"file": "orders/legacy.py", "startLine": 1, "endLine": 2, "anchor": "def auto_approve"}}
        ]});
        let r = shape_review(parse(raw), false, &mut v);
        assert_eq!(r.findings.len(), 1);
        let f = &r.findings[0];
        assert_eq!(f.anchoring, Anchoring::Summary);
        assert_eq!(f.code_ref.at_base, Some(true));
        assert!(f.excerpt.lines.iter().all(|l| l.sign == "-"));
        assert_eq!(f.excerpt.lines[0].highlight, Some(true));
    }
}
