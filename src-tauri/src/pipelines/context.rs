//! What every pipeline pass needs about a session at one head: the worktree,
//! the DiffMap, and the context pack (prompt layer 3, SPEC §4.2).

use std::path::PathBuf;

use serde_json::json;

use crate::agent::{AgentRequest, PromptLayers};
use crate::git::{self, DiffBundle};
use crate::model::*;
use crate::verify::WorktreeSource;

/// Total raw-diff lines included in one context pack. Past this, files are
/// listed with their hunks only and the agent reads them from the worktree.
pub const CONTEXT_DIFF_MAX_LINES: usize = 6_000;
/// Characters of PR description included.
pub const DESCRIPTION_MAX_CHARS: usize = 12_000;

/// A session pinned to one head, ready for agent passes.
#[derive(Debug, Clone)]
pub struct PassCtx {
    pub session: ReviewSession,
    pub worktree: PathBuf,
    pub head_sha: String,
    pub merge_base_sha: String,
    pub bundle: DiffBundle,
    pub agent: AgentKind,
    /// `.grsp/prompt.md` from the worktree, if present (layer 5).
    pub repo_prompt: Option<String>,
}

/// A pipeline's UI-ready result with its verification report.
#[derive(Debug, Clone)]
pub struct Outcome<T> {
    pub result: T,
    pub report: VerificationReport,
}

/// Said once in the context of a commit session. The pipeline instructions
/// are written for pull requests; this maps their words onto commits and
/// sets what the change is measured against.
const COMMITS_NOTE_SINGLE: &str = "This change is one commit, not a pull request. Wherever the task says \"pull request\", read \"this commit\"; wherever it says \"the description\", read the commit message below.\nThe commit may be one step in a longer series. The reference is the surrounding code as it stands at this commit, which is what your working directory contains. Commits made after it are not visible to you: don't assume they exist, and don't guess what they contain.\n";

const COMMITS_NOTE_RUN: &str = "This change is a run of commits, not a pull request. Wherever the task says \"pull request\", read \"these commits, taken together\"; wherever it says \"the description\", read the commit messages below.\nThe run may be one stretch of a longer series. The reference is the surrounding code as it stands at the last of these commits, which is what your working directory contains. Commits made after it are not visible to you: don't assume they exist, and don't guess what they contain.\n";

/// What counts as a checkable claim in a commit message (discovery step 4).
const COMMIT_CLAIMS_SINGLE: &str = "A commit message is often only a label. Only a statement about what the software does is a checkable claim; a line that merely names the change is not one.\n\n";

const COMMIT_CLAIMS_RUN: &str = "Each item is one commit's subject line, with the rest of its message indented beneath when it has one. A subject line usually only names its commit: treat it as a checkable claim only when it plainly states what the software does. Something an earlier commit says and a later commit in this run deliberately changes is not a mismatch.\n\n";

fn short(sha: &str) -> &str {
    &sha[..sha.len().min(10)]
}

fn hunk_ranges(f: &DiffFile) -> String {
    let ranges: Vec<String> = f
        .hunks
        .iter()
        .filter(|h| h.new_lines > 0)
        .take(12)
        .map(|h| {
            format!(
                "{}-{}",
                h.new_start,
                h.new_start + h.new_lines.saturating_sub(1)
            )
        })
        .collect();
    if ranges.is_empty() {
        String::new()
    } else {
        format!("; changed around lines {}", ranges.join(", "))
    }
}

fn status_word(f: &DiffFile) -> String {
    let base = match f.status {
        FileStatus::Added => "added".to_string(),
        FileStatus::Modified => "modified".to_string(),
        FileStatus::Deleted => "deleted".to_string(),
        FileStatus::Renamed => match &f.old_path {
            Some(old) => format!("renamed from {old}"),
            None => "renamed".to_string(),
        },
    };
    if f.binary {
        format!("{base}, binary")
    } else {
        base
    }
}

impl PassCtx {
    /// Build the context for a prepared session. Reads `.grsp/prompt.md`.
    pub fn new(
        session: ReviewSession,
        worktree: PathBuf,
        bundle: DiffBundle,
        agent: AgentKind,
    ) -> Result<Self, String> {
        let head_sha = session
            .head_sha
            .clone()
            .ok_or("The session has no head commit yet.")?;
        let merge_base_sha = session
            .merge_base_sha
            .clone()
            .ok_or("The session has no merge base yet.")?;
        let repo_prompt = git::read_repo_prompt(&worktree);
        Ok(Self {
            session,
            worktree,
            head_sha,
            merge_base_sha,
            bundle,
            agent,
            repo_prompt,
        })
    }

    pub fn source(&self) -> WorktreeSource {
        WorktreeSource::new(&self.worktree, &self.merge_base_sha)
    }

    pub fn map(&self) -> &DiffMap {
        &self.bundle.map
    }

    /// Title, description, author, base and head — no diff.
    pub fn header(&self) -> String {
        let s = &self.session;
        let mut out = String::new();
        match &s.source {
            SessionSource::Pr { number, url } => {
                out.push_str(&format!("Pull request #{number}: {}\n", s.title.trim()));
                out.push_str(&format!("URL: {url}\n"));
            }
            SessionSource::Branches { base, head } => {
                out.push_str(&format!(
                    "Comparison of branch `{head}` against `{base}` (no pull request).\n"
                ));
                if !s.title.trim().is_empty() {
                    out.push_str(&format!("Title: {}\n", s.title.trim()));
                }
            }
            SessionSource::Commits { branch, count, .. } => {
                let on = branch
                    .as_deref()
                    .map(|b| format!(" on branch `{b}`"))
                    .unwrap_or_default();
                if *count > 1 {
                    out.push_str(&format!(
                        "A run of {count} consecutive commits{on}, reviewed together as one change. There is no pull request.\n"
                    ));
                } else {
                    out.push_str(&format!("A single commit{on}. There is no pull request.\n"));
                    if !s.title.trim().is_empty() {
                        out.push_str(&format!("Subject: {}\n", s.title.trim()));
                    }
                }
            }
        }
        if !s.author.trim().is_empty() {
            out.push_str(&format!("Author: {}\n", s.author.trim()));
        }
        match &s.source {
            SessionSource::Commits { count, .. } => {
                let many = *count > 1;
                if git::is_empty_tree(&self.merge_base_sha) {
                    out.push_str(
                        "Base: none. The change starts at the repository's first commit, so every file in it is new.\n",
                    );
                } else {
                    out.push_str(&format!(
                        "Base: {} ({})\n",
                        short(&self.merge_base_sha),
                        if many {
                            "the commit just before the oldest one reviewed"
                        } else {
                            "the commit's parent"
                        }
                    ));
                }
                out.push_str(&format!(
                    "Head: {} — this is what your working directory contains\n\n",
                    short(&self.head_sha)
                ));
                out.push_str(if many {
                    COMMITS_NOTE_RUN
                } else {
                    COMMITS_NOTE_SINGLE
                });
                out.push_str(if many {
                    "\n## Description (the commit messages, oldest first)\n\n"
                } else {
                    "\n## Description (the commit message)\n\n"
                });
            }
            _ => {
                out.push_str(&format!(
                    "Base: {} (merge base {})\nHead: {} ({}) — this is what your working directory contains\n",
                    s.base_ref,
                    short(&self.merge_base_sha),
                    s.head_ref,
                    short(&self.head_sha),
                ));
                out.push_str("\n## Description\n\n");
            }
        }
        let desc = s.description.trim();
        if desc.is_empty() {
            out.push_str(if s.source.is_commits() {
                "(The commit message is only its subject line, shown above. A subject line names the change; it is not a description to check the code against. There is nothing to compare the code against, so report no mismatches.)\n"
            } else {
                "(The author wrote no description. There is nothing to compare the code against.)\n"
            });
            return out;
        }
        match &s.source {
            SessionSource::Commits { count, .. } if *count > 1 => out.push_str(COMMIT_CLAIMS_RUN),
            SessionSource::Commits { .. } => out.push_str(COMMIT_CLAIMS_SINGLE),
            _ => {}
        }
        if desc.chars().count() > DESCRIPTION_MAX_CHARS {
            let head: String = desc.chars().take(DESCRIPTION_MAX_CHARS).collect();
            out.push_str(&head);
            out.push_str("\n… (description truncated)\n");
        } else {
            out.push_str(desc);
            out.push('\n');
        }
        out
    }

    /// The list of changed files with their status and hunk positions.
    pub fn file_list(&self) -> String {
        let st = &self.bundle.stats;
        let mut out = format!(
            "## Changed files ({} files, +{} −{} lines)\n\n",
            st.files, st.added, st.removed
        );
        if self.bundle.map.files.is_empty() {
            out.push_str("(No files changed.)\n");
        }
        for f in &self.bundle.map.files {
            out.push_str(&format!(
                "- {} ({}, +{} −{}{})\n",
                f.path,
                status_word(f),
                f.added_lines.len(),
                f.removed_lines.len(),
                hunk_ranges(f)
            ));
        }
        if !self.bundle.excluded.is_empty() {
            out.push_str(&format!(
                "\n{} generated, vendored or lock files also changed and are left out of the analysis.\n",
                self.bundle.excluded.len()
            ));
        }
        out
    }

    /// The raw diff section. `only_files` restricts it to one shard. The
    /// per-file cap (400 lines) is applied by `git`; this adds a total cap.
    pub fn diff_section(&self, only_files: Option<&[String]>) -> String {
        let mut out = String::from("## Diff (from the merge base to the head)\n\n");
        let mut used = 0usize;
        let mut omitted: Vec<&str> = Vec::new();
        for (file, raw) in self.bundle.map.files.iter().zip(self.bundle.raw.iter()) {
            if let Some(only) = only_files {
                if !only.contains(&file.path) {
                    continue;
                }
            }
            let lines = raw.text.lines().count();
            if used > 0 && used + lines > CONTEXT_DIFF_MAX_LINES {
                omitted.push(&file.path);
                continue;
            }
            used += lines;
            out.push_str(&format!(
                "### {} ({})\n```diff\n{}",
                file.path,
                status_word(file),
                raw.text
            ));
            if !raw.text.ends_with('\n') {
                out.push('\n');
            }
            out.push_str("```\n\n");
        }
        if !omitted.is_empty() {
            out.push_str(&format!(
                "The diffs of these {} files are not shown to keep this context small. Read them in the working directory; the changed line ranges are in the file list above:\n",
                omitted.len()
            ));
            for p in omitted {
                out.push_str(&format!("- {p}\n"));
            }
        }
        out
    }

    /// Layer 3: header, changed files and raw diff.
    pub fn context_pack(&self, only_files: Option<&[String]>) -> String {
        format!(
            "{}\n{}\n{}",
            self.header(),
            self.file_list(),
            self.diff_section(only_files)
        )
    }

    /// Layers for a pass with the full context pack.
    pub fn layers(&self, instruction: String) -> PromptLayers {
        PromptLayers {
            instruction,
            context_pack: self.context_pack(None),
            review_prompt: None,
            repo_prompt: self.repo_prompt.clone(),
        }
    }

    pub fn request(&self, layers: &PromptLayers) -> AgentRequest {
        AgentRequest::new(
            self.agent,
            self.worktree.clone(),
            crate::agent::prompt::build(layers),
        )
    }
}

fn ref_brief(r: &CodeRef) -> String {
    match r.end_line {
        Some(end) if end > r.start_line => format!("{}:{}-{}", r.file, r.start_line, end),
        _ => format!("{}:{}", r.file, r.start_line),
    }
}

/// The discovery result as later passes see it: compact, verified, and with
/// the git-derived tags (so the agent doesn't have to re-derive them).
pub fn discovery_brief(d: &DiscoveryResult) -> String {
    let v = json!({
        "behaviourSummary": d.behaviour_summary,
        "entryPoints": d.entry_points.iter().map(|e| json!({
            "id": e.id, "label": e.label, "kind": e.kind, "at": ref_brief(&e.code_ref),
            "effect": e.effect, "risk": e.risk, "changeStatusFromGit": e.tag, "hasGap": e.has_gap,
        })).collect::<Vec<_>>(),
        "gaps": d.gaps.iter().map(|g| json!({
            "at": ref_brief(&g.code_ref), "writeTarget": g.write_target,
            "explanation": g.explanation, "entryPointId": g.entry_point_id,
        })).collect::<Vec<_>>(),
        "mismatches": d.mismatches.iter().map(|m| json!({
            "claim": m.claim, "reality": m.reality,
            "at": m.refs.iter().map(ref_brief).collect::<Vec<_>>(),
            "entryPointId": m.entry_point_id,
        })).collect::<Vec<_>>(),
        "removed": d.removed.iter().map(|r| json!({"name": r.name, "at": ref_brief(&r.code_ref)})).collect::<Vec<_>>(),
    });
    format!(
        "## Discovery result (already verified by grsp against the repository)\n\n```json\n{}\n```\n",
        serde_json::to_string_pretty(&v).unwrap_or_default()
    )
}

#[cfg(test)]
pub(crate) mod testutil {
    use super::*;

    pub fn session(title: &str, description: &str) -> ReviewSession {
        ReviewSession {
            id: "s1".into(),
            repo_id: "r1".into(),
            source: SessionSource::Branches {
                base: "main".into(),
                head: "feature".into(),
            },
            title: title.into(),
            description: description.into(),
            author: "maya".into(),
            base_ref: "main".into(),
            head_ref: "feature".into(),
            base_sha: Some("b".repeat(40)),
            head_sha: Some("a".repeat(40)),
            merge_base_sha: Some("b".repeat(40)),
            status: SessionStatus::Ready,
            error: None,
            pr_state: PrState::Open,
            is_own_pr: false,
            ci: None,
            files_changed: 0,
            lines_added: 0,
            lines_removed: 0,
            new_commits: 0,
            agent_passes: 0,
            posted_review: None,
            created_at: "2026-01-01T00:00:00Z".into(),
            last_opened_at: "2026-01-01T00:00:00Z".into(),
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::git::RawFileDiff;

    fn ctx(description: &str, files: usize, lines_each: usize) -> PassCtx {
        let mut bundle = DiffBundle::default();
        for i in 0..files {
            let path = format!("pkg/file{i}.txt");
            bundle.map.files.push(DiffFile {
                path: path.clone(),
                status: FileStatus::Modified,
                hunks: vec![Hunk {
                    old_start: 1,
                    old_lines: 2,
                    new_start: 1,
                    new_lines: 3,
                }],
                added_lines: vec![2],
                ..Default::default()
            });
            bundle.raw.push(RawFileDiff {
                path,
                text: (0..lines_each).map(|n| format!("+line {n}\n")).collect(),
                truncated: false,
            });
        }
        bundle.stats = git::diff_stats(&bundle.map);
        PassCtx {
            session: testutil::session("Require approval", description),
            worktree: std::env::temp_dir(),
            head_sha: "a".repeat(40),
            merge_base_sha: "b".repeat(40),
            bundle,
            agent: AgentKind::Claude,
            repo_prompt: None,
        }
    }

    #[test]
    fn context_pack_has_title_description_refs_files_and_diff() {
        let c = ctx("All orders over the limit need approval.", 2, 3);
        let pack = c.context_pack(None);
        for needle in [
            "Require approval",
            "Author: maya",
            "Base: main",
            "Head: feature",
            "All orders over the limit need approval.",
            "## Changed files (2 files, +2 −0 lines)",
            "pkg/file0.txt (modified, +1 −0; changed around lines 1-3)",
            "### pkg/file1.txt (modified)",
            "+line 2",
        ] {
            assert!(pack.contains(needle), "missing {needle:?} in:\n{pack}");
        }
    }

    fn commit_ctx(count: u32, branch: Option<&str>, title: &str, description: &str) -> PassCtx {
        let mut c = ctx(description, 1, 1);
        c.session.title = title.into();
        c.session.source = SessionSource::Commits {
            branch: branch.map(String::from),
            base: "b".repeat(40),
            head: "a".repeat(40),
            count,
        };
        c
    }

    #[test]
    fn a_single_commit_is_described_as_a_commit_not_a_pull_request() {
        let c = commit_ctx(
            1,
            Some("main"),
            "Hold large orders",
            "Orders over the limit now wait for approval.",
        );
        let header = c.header();
        for needle in [
            "A single commit on branch `main`. There is no pull request.",
            "Subject: Hold large orders",
            "Author: maya",
            "Base: bbbbbbbbbb (the commit's parent)",
            "Head: aaaaaaaaaa — this is what your working directory contains",
            "This change is one commit, not a pull request.",
            "read the commit message below",
            "may be one step in a longer series",
            "as it stands at this commit",
            "## Description (the commit message)",
            "Only a statement about what the software does is a checkable claim",
            "Orders over the limit now wait for approval.",
        ] {
            assert!(header.contains(needle), "missing {needle:?} in:\n{header}");
        }
        assert!(!header.contains("Pull request #"));
        assert!(!header.contains("merge base"));
    }

    #[test]
    fn a_commit_with_only_a_subject_has_nothing_to_compare_against() {
        let header = commit_ctx(1, None, "wip", "  ").header();
        assert!(header.contains("A single commit. There is no pull request."));
        assert!(header.contains("The commit message is only its subject line"));
        assert!(header.contains("report no mismatches"));
        assert!(!header.contains("checkable claim"));
        assert!(!header.contains("The author wrote no description"));
    }

    #[test]
    fn a_run_of_commits_is_described_as_a_run() {
        let c = commit_ctx(
            3,
            Some("feature/x"),
            "3 commits on feature/x",
            "- Add the limit\n- Hold large orders\n\n  Over the limit they wait.\n- Tidy",
        );
        let header = c.header();
        for needle in [
            "A run of 3 consecutive commits on branch `feature/x`, reviewed together as one change.",
            "Base: bbbbbbbbbb (the commit just before the oldest one reviewed)",
            "This change is a run of commits, not a pull request.",
            "may be one stretch of a longer series",
            "## Description (the commit messages, oldest first)",
            "treat it as a checkable claim only when it plainly states what the software does",
            "- Hold large orders",
        ] {
            assert!(header.contains(needle), "missing {needle:?} in:\n{header}");
        }
        assert!(!header.contains("Subject:"));
    }

    #[test]
    fn a_root_commit_has_no_base() {
        let mut c = commit_ctx(1, None, "Initial commit", "");
        c.merge_base_sha = "4b825dc642cb6eb9a060e54bf8d69288fbee4904".into();
        let header = c.header();
        assert!(header.contains("Base: none. The change starts at the repository's first commit"));
        assert!(!header.contains("4b825dc"));
    }

    #[test]
    fn commit_wording_is_language_agnostic() {
        let all = [
            COMMITS_NOTE_SINGLE,
            COMMITS_NOTE_RUN,
            COMMIT_CLAIMS_SINGLE,
            COMMIT_CLAIMS_RUN,
        ]
        .join("\n")
        .to_lowercase();
        for banned in [
            "python",
            "javascript",
            "typescript",
            "rust",
            ".py",
            ".ts",
            "django",
            "react",
        ] {
            assert!(!all.contains(banned), "commit wording mentions `{banned}`");
        }
    }

    #[test]
    fn empty_description_is_stated() {
        let pack = ctx("  ", 1, 1).context_pack(None);
        assert!(pack.contains("The author wrote no description"));
    }

    #[test]
    fn only_files_restricts_the_diff_but_not_the_file_list() {
        let c = ctx("d", 3, 2);
        let pack = c.context_pack(Some(&["pkg/file1.txt".to_string()]));
        assert!(pack.contains("- pkg/file0.txt"));
        assert!(pack.contains("### pkg/file1.txt"));
        assert!(!pack.contains("### pkg/file0.txt"));
        assert!(!pack.contains("### pkg/file2.txt"));
    }

    #[test]
    fn total_diff_is_capped_and_omitted_files_are_named() {
        let c = ctx("d", 4, 2_500);
        let section = c.diff_section(None);
        assert!(section.contains("### pkg/file0.txt"));
        assert!(section.contains("### pkg/file1.txt"));
        assert!(!section.contains("### pkg/file2.txt"));
        assert!(section.contains("The diffs of these 2 files are not shown"));
        assert!(section.contains("- pkg/file3.txt"));
    }

    #[test]
    fn layers_carry_the_repo_prompt() {
        let mut c = ctx("d", 1, 1);
        c.repo_prompt = Some("We care about migrations.".into());
        let prompt = crate::agent::prompt::build(&c.layers("INSTRUCTION".into()));
        assert!(prompt.contains("INSTRUCTION"));
        assert!(prompt.contains("We care about migrations."));
    }

    #[test]
    fn discovery_brief_lists_entry_points_with_locations() {
        let d = DiscoveryResult {
            behaviour_summary: "Orders over the limit wait for approval.".into(),
            entry_points: vec![EntryPoint {
                id: "ep1".into(),
                label: "POST /orders".into(),
                kind: EntryPointKind::Http,
                code_ref: CodeRef {
                    file: "orders/api.txt".into(),
                    start_line: 10,
                    end_line: Some(30),
                    verified: true,
                    ..Default::default()
                },
                effect: "Now checks the limit".into(),
                risk: Level::High,
                tag: AffectedTag::Changed,
                has_gap: false,
            }],
            ..Default::default()
        };
        let b = discovery_brief(&d);
        assert!(b.contains("\"at\": \"orders/api.txt:10-30\""));
        assert!(b.contains("\"changeStatusFromGit\": \"changed\""));
        assert!(b.contains("POST /orders"));
    }
}
