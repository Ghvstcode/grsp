//! Change status (SPEC §3.2) and review anchoring (SPEC §5.6), both read
//! straight from the DiffMap.

use super::FileSource;
use crate::model::{Anchoring, ChangeStatus, CodeRef, DiffFile, DiffMap, FileStatus};

/// The DiffMap entry for a file as seen from one side of the diff.
pub(crate) fn diff_file_for<'m>(
    map: &'m DiffMap,
    file: &str,
    at_base: bool,
) -> Option<&'m DiffFile> {
    if at_base {
        map.files
            .iter()
            .find(|f| f.old_path.as_deref() == Some(file))
            .or_else(|| {
                map.files
                    .iter()
                    .find(|f| f.path == file && f.status != FileStatus::Added)
            })
    } else {
        map.files
            .iter()
            .find(|f| f.path == file && f.status != FileStatus::Deleted)
    }
}

fn count_in(sorted: &[u32], start: u32, end: u32) -> usize {
    let lo = sorted.partition_point(|n| *n < start);
    let hi = sorted.partition_point(|n| *n <= end);
    hi.saturating_sub(lo)
}

/// Change status of a verified ref's range from the DiffMap (SPEC §3.2):
///
/// - `New`: the file was added, or every non-blank line in the range is an
///   added line;
/// - `Changed`: the range contains an added line, or lines were removed
///   inside it or directly at its edges;
/// - `Unchanged`: otherwise;
/// - `Removed`: the ref is at the merge base.
///
/// Never returns `NotCovered` — see `block_status`. Nothing the agent says
/// about change status is consulted.
pub fn change_status(map: &DiffMap, src: &dyn FileSource, cref: &CodeRef) -> ChangeStatus {
    if cref.is_at_base() {
        return ChangeStatus::Removed;
    }
    let Some(file) = diff_file_for(map, &cref.file, false) else {
        return ChangeStatus::Unchanged;
    };
    if file.status == FileStatus::Added {
        return ChangeStatus::New;
    }
    let start = cref.start_line;
    let end = cref.last_line();
    let added = count_in(&file.added_lines, start, end);

    if added > 0 {
        let all_new = match src.read_head(&cref.file) {
            Some(text) => {
                let mut non_blank = 0usize;
                let mut non_blank_added = 0usize;
                for (i, line) in text.lines().enumerate() {
                    let n = i as u32 + 1;
                    if n < start || n > end || line.trim().is_empty() {
                        continue;
                    }
                    non_blank += 1;
                    if file.added_lines.binary_search(&n).is_ok() {
                        non_blank_added += 1;
                    }
                }
                non_blank > 0 && non_blank == non_blank_added
            }
            None => added as u32 == end - start + 1,
        };
        return if all_new {
            ChangeStatus::New
        } else {
            ChangeStatus::Changed
        };
    }

    // Pure deletions: `removed_at` is the head line that now follows a
    // removed run, so `start..=end+1` covers removals inside the range and
    // directly above its first or below its last line.
    if count_in(&file.removed_at, start, end.saturating_add(1)) > 0 {
        return ChangeStatus::Changed;
    }
    ChangeStatus::Unchanged
}

/// `change_status` plus the gap rule: `NotCovered` only when the agent
/// flagged the block as a gap **and** Rust confirms it is `Unchanged`.
/// A gap that is actually part of the diff isn't a gap.
pub fn block_status(
    map: &DiffMap,
    src: &dyn FileSource,
    cref: &CodeRef,
    flagged_gap: bool,
) -> ChangeStatus {
    match change_status(map, src, cref) {
        ChangeStatus::Unchanged if flagged_gap => ChangeStatus::NotCovered,
        status => status,
    }
}

/// Review anchoring (SPEC §5.6): `Inline` when head-side `line` of `file`
/// is an added or context line inside a hunk, else `Summary`. GitHub only
/// accepts inline comments on lines that are part of the PR diff.
pub fn anchor_line(map: &DiffMap, file: &str, line: u32) -> Anchoring {
    let in_hunk = diff_file_for(map, file, false).is_some_and(|f| {
        !f.binary
            && f.hunks
                .iter()
                .any(|h| h.new_lines > 0 && line >= h.new_start && line < h.new_start + h.new_lines)
    });
    if in_hunk {
        Anchoring::Inline
    } else {
        Anchoring::Summary
    }
}

#[cfg(test)]
mod tests {
    use super::super::MemorySource;
    use super::*;
    use crate::git::parse_unified_diff;

    /// services.py at head (20 lines). Lines 5–8 are added; one line was
    /// removed between head lines 15 and 16.
    const HEAD: &str = "\
import x

class OrderService:
    def create(self, data):
        if requires_approval(order):
            order.status = HOLD

        else:
            order.status = OK
        order.save()

    def helper(self):
        a = 1
        b = 2
        c = 3
        e = 5
        f = 6

    def untouched(self):
        return 1
";

    const DIFF: &str = "\
diff --git a/services.py b/services.py
index 1..2 100644
--- a/services.py
+++ b/services.py
@@ -2,6 +2,10 @@ import x
 
 class OrderService:
     def create(self, data):
+        if requires_approval(order):
+            order.status = HOLD
+
+        else:
             order.status = OK
         order.save()
 
@@ -9,7 +13,6 @@ class OrderService:
         a = 1
         b = 2
         c = 3
-        d = 4
         e = 5
         f = 6
 
diff --git a/policy.py b/policy.py
new file mode 100644
--- /dev/null
+++ b/policy.py
@@ -0,0 +1,2 @@
+def requires_approval(order):
+    return order.total > LIMIT
diff --git a/old_name.py b/new_name.py
similarity index 100%
rename from old_name.py
rename to new_name.py
diff --git a/logo.png b/logo.png
index 1..2 100644
Binary files a/logo.png and b/logo.png differ
diff --git a/legacy.py b/legacy.py
deleted file mode 100644
--- a/legacy.py
+++ /dev/null
@@ -1,2 +0,0 @@
-def old():
-    return 1
";

    fn map() -> DiffMap {
        DiffMap {
            files: parse_unified_diff(DIFF)
                .into_iter()
                .map(|(f, _)| f)
                .collect(),
        }
    }

    fn src() -> MemorySource {
        MemorySource::new()
            .with_head("services.py", HEAD)
            .with_head(
                "policy.py",
                "def requires_approval(order):\n    return order.total > LIMIT\n",
            )
            .with_head("other.py", "x = 1\ny = 2\n")
            .with_head("new_name.py", "a\nb\n")
    }

    fn r(file: &str, start: u32, end: Option<u32>) -> CodeRef {
        CodeRef {
            file: file.into(),
            start_line: start,
            end_line: end,
            verified: true,
            ..Default::default()
        }
    }

    fn status(file: &str, start: u32, end: Option<u32>) -> ChangeStatus {
        change_status(&map(), &src(), &r(file, start, end))
    }

    #[test]
    fn fixture_is_consistent() {
        let m = map();
        let f = m.file("services.py").unwrap();
        assert_eq!(f.added_lines, vec![5, 6, 7, 8]);
        assert_eq!(f.removed_lines, vec![12]);
        assert_eq!(f.removed_at, vec![16]);
        assert_eq!(HEAD.lines().nth(15).unwrap().trim(), "e = 5");
    }

    #[test]
    fn new_when_file_added_or_every_non_blank_line_is_added() {
        assert_eq!(status("policy.py", 1, Some(2)), ChangeStatus::New);
        assert_eq!(status("policy.py", 2, None), ChangeStatus::New);
        // Lines 5–8 are all added; line 7 is blank and doesn't count either way.
        assert_eq!(status("services.py", 5, Some(8)), ChangeStatus::New);
        assert_eq!(status("services.py", 5, Some(6)), ChangeStatus::New);
        assert_eq!(status("services.py", 6, None), ChangeStatus::New);
    }

    #[test]
    fn changed_when_range_holds_some_added_lines() {
        assert_eq!(status("services.py", 4, Some(10)), ChangeStatus::Changed);
        assert_eq!(status("services.py", 8, Some(9)), ChangeStatus::Changed);
        assert_eq!(status("services.py", 1, Some(20)), ChangeStatus::Changed);
    }

    #[test]
    fn changed_when_lines_were_removed_inside_the_range() {
        assert_eq!(status("services.py", 12, Some(17)), ChangeStatus::Changed);
        // Directly at the edges of the range.
        assert_eq!(status("services.py", 16, Some(17)), ChangeStatus::Changed);
        assert_eq!(status("services.py", 13, Some(15)), ChangeStatus::Changed);
        // One line further away on either side: unchanged.
        assert_eq!(status("services.py", 13, Some(14)), ChangeStatus::Unchanged);
        assert_eq!(status("services.py", 17, None), ChangeStatus::Unchanged);
    }

    #[test]
    fn hunk_context_lines_alone_are_unchanged() {
        // Lines 2–4 and 9–10 sit inside the first hunk as context only.
        assert_eq!(status("services.py", 3, Some(4)), ChangeStatus::Unchanged);
        assert_eq!(status("services.py", 9, Some(10)), ChangeStatus::Unchanged);
        assert_eq!(status("services.py", 19, Some(20)), ChangeStatus::Unchanged);
    }

    #[test]
    fn unchanged_for_files_outside_the_diff_and_pure_renames() {
        assert_eq!(status("other.py", 1, Some(2)), ChangeStatus::Unchanged);
        assert_eq!(status("new_name.py", 1, Some(2)), ChangeStatus::Unchanged);
    }

    #[test]
    fn removed_for_base_side_refs() {
        let mut cref = r("legacy.py", 1, Some(2));
        cref.at_base = Some(true);
        assert_eq!(change_status(&map(), &src(), &cref), ChangeStatus::Removed);
    }

    #[test]
    fn gap_rule_needs_rust_to_confirm_unchanged() {
        let (m, s) = (map(), src());
        // Flagged and really unchanged: a gap.
        assert_eq!(
            block_status(&m, &s, &r("other.py", 1, Some(2)), true),
            ChangeStatus::NotCovered
        );
        assert_eq!(
            block_status(&m, &s, &r("services.py", 19, Some(20)), true),
            ChangeStatus::NotCovered
        );
        // Flagged but part of the diff: not a gap.
        assert_eq!(
            block_status(&m, &s, &r("services.py", 4, Some(10)), true),
            ChangeStatus::Changed
        );
        assert_eq!(
            block_status(&m, &s, &r("policy.py", 1, Some(2)), true),
            ChangeStatus::New
        );
        // Not flagged: never NotCovered.
        assert_eq!(
            block_status(&m, &s, &r("other.py", 1, Some(2)), false),
            ChangeStatus::Unchanged
        );
    }

    #[test]
    fn anchoring_inline_only_inside_head_side_hunks() {
        let m = map();
        // Added lines and context lines of the first hunk (head 2..=11).
        for line in [2, 4, 5, 8, 9, 11] {
            assert_eq!(
                anchor_line(&m, "services.py", line),
                Anchoring::Inline,
                "line {line}"
            );
        }
        // Second hunk covers head 13..=18.
        assert_eq!(anchor_line(&m, "services.py", 13), Anchoring::Inline);
        assert_eq!(anchor_line(&m, "services.py", 18), Anchoring::Inline);
        // Between and outside hunks.
        for line in [1, 12, 19, 20, 500] {
            assert_eq!(
                anchor_line(&m, "services.py", line),
                Anchoring::Summary,
                "line {line}"
            );
        }
        assert_eq!(anchor_line(&m, "policy.py", 2), Anchoring::Inline);
        assert_eq!(anchor_line(&m, "policy.py", 3), Anchoring::Summary);
        // Not in the diff, pure rename, binary, deleted.
        assert_eq!(anchor_line(&m, "other.py", 1), Anchoring::Summary);
        assert_eq!(anchor_line(&m, "new_name.py", 1), Anchoring::Summary);
        assert_eq!(anchor_line(&m, "logo.png", 1), Anchoring::Summary);
        assert_eq!(anchor_line(&m, "legacy.py", 1), Anchoring::Summary);
    }
}
