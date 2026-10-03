//! Verification layer (SPEC §3): the agent discovers and interprets, git and
//! the worktree confirm. Pure, deterministic, no language knowledge.
//!
//! Typical use from a pipeline:
//!
//! ```ignore
//! let src = WorktreeSource::new(&worktree, &merge_base_sha);
//! let mut v = Verifier::new(&src, &diff_map);
//! let result = shape_discovery(raw, &session.description, &mut v);
//! let report = v.into_report();
//! ```

// API CHANGES (since the step-0 stubs) — all additive, no signature changed:
// - `Verifier::count_dropped`, `Verifier::set_files_explored`
// - `MemorySource::with_root` (and a public `root` field)
// - `git::pr_ref`, `git::parse_ls_remote_sha`, `git::parse_check_attr_z`,
//   `git::bundle_from_diff_text`, `db::archive_sessions_for_repo`
// - `model::parse_agent_output` — parse top-level agent JSON with this, not
//   `serde_json::from_value`: the lenient raw structs would otherwise read a
//   top-level array or string as an empty result instead of failing.

use crate::model::{CodeRef, DiffMap, RawCodeRef, VerificationReport};

mod edges;
mod excerpt;
mod refs;
mod shape;
mod source;
mod status;

pub use edges::*;
pub use excerpt::*;
pub use refs::*;
pub use shape::*;
pub use source::*;
pub use status::*;

/// Lines of context either side of a point excerpt.
pub const EXCERPT_CONTEXT: u32 = 3;
/// Block excerpts are capped at this many lines ("Show all").
pub const EXCERPT_MAX_LINES: u32 = 40;
/// Anchor found within this many lines counts as verified in place.
pub const ANCHOR_NEAR: u32 = 2;
/// Anchor found within this many lines snaps the ref.
pub const ANCHOR_SNAP: u32 = 10;
pub const MAX_ENTRY_POINTS: usize = 12;
pub const MAX_PATH_BLOCKS: usize = 12;

/// At most this many drop notes are kept per report.
const MAX_NOTES: usize = 60;

/// Verification context for one analysis: a file source, the DiffMap and
/// the accumulating `VerificationReport` (SPEC §3.5).
pub struct Verifier<'a> {
    pub src: &'a dyn FileSource,
    pub map: &'a DiffMap,
    pub report: VerificationReport,
}

impl<'a> Verifier<'a> {
    pub fn new(src: &'a dyn FileSource, map: &'a DiffMap) -> Self {
        Self {
            src,
            map,
            report: VerificationReport::default(),
        }
    }

    /// Verify a ref, counting it as verified or dropped (with a note).
    pub fn check(&mut self, raw: &RawCodeRef, side: RefSide) -> Option<CodeRef> {
        match verify_ref(raw, self.src, side) {
            Ok(r) => {
                self.report.verified += 1;
                Some(r)
            }
            Err(why) => {
                self.report.dropped += 1;
                self.note(format!("{}:{} dropped: {why}", raw.file, raw.start_line));
                None
            }
        }
    }

    /// Verify a list, keeping only the verified refs.
    pub fn check_all(&mut self, raws: &[RawCodeRef], side: RefSide) -> Vec<CodeRef> {
        raws.iter().filter_map(|r| self.check(r, side)).collect()
    }

    /// Count a claim kept visible without any verified ref.
    pub fn count_unverified(&mut self) {
        self.report.unverified += 1;
    }

    /// Count a claim that was dropped because it came with no ref at all.
    pub fn count_dropped(&mut self, note: impl Into<String>) {
        self.report.dropped += 1;
        self.note(note);
    }

    pub fn note(&mut self, note: impl Into<String>) {
        if self.report.notes.len() < MAX_NOTES {
            self.report.notes.push(note.into());
        }
    }

    /// Record how many distinct files the agent read or searched.
    pub fn set_files_explored(&mut self, files: u32) {
        self.report.files_explored = Some(files);
    }

    pub fn into_report(self) -> VerificationReport {
        self.report
    }
}

/// Add `other`'s counts and notes into `into` (e.g. merging shard reports).
pub fn merge_reports(into: &mut VerificationReport, other: &VerificationReport) {
    into.verified += other.verified;
    into.dropped += other.dropped;
    into.unverified += other.unverified;
    for n in &other.notes {
        if into.notes.len() < MAX_NOTES {
            into.notes.push(n.clone());
        }
    }
    into.files_explored = match (into.files_explored, other.files_explored) {
        (Some(a), Some(b)) => Some(a + b),
        (a, b) => a.or(b),
    };
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn report_accumulates() {
        let src = MemorySource::new().with_head("a.py", "def a():\n    pass\n");
        let map = DiffMap::default();
        let mut v = Verifier::new(&src, &map);
        assert!(v
            .check(
                &RawCodeRef::new("a.py", 1, None, Some("def a")),
                RefSide::Head
            )
            .is_some());
        assert!(v
            .check(&RawCodeRef::new("b.py", 1, None, None), RefSide::Head)
            .is_none());
        assert!(v
            .check(
                &RawCodeRef::new("a.py", 1, None, Some("nope")),
                RefSide::Head
            )
            .is_none());
        v.count_unverified();
        v.set_files_explored(3);
        let r = v.into_report();
        assert_eq!((r.verified, r.dropped, r.unverified), (1, 2, 1));
        assert_eq!(r.notes.len(), 2);
        assert!(r.notes[0].starts_with("b.py:1 dropped:"));
        assert_eq!(r.files_explored, Some(3));

        let mut total = VerificationReport::default();
        merge_reports(&mut total, &r);
        merge_reports(&mut total, &r);
        assert_eq!((total.verified, total.dropped, total.unverified), (2, 4, 2));
        assert_eq!(total.files_explored, Some(6));
    }
}
