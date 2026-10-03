//! Excerpts (SPEC §3.4): all code shown in the UI is read here, from the
//! worktree or the merge base, with diff markers from the DiffMap.

use super::status::diff_file_for;
use super::{normalize_path, FileSource, EXCERPT_CONTEXT, EXCERPT_MAX_LINES};
use crate::model::{CodeRef, DiffMap, Excerpt, ExcerptLine};

/// Very long lines (minified code) are cut for display.
const MAX_LINE_CHARS: usize = 500;

fn clip(line: &str) -> String {
    if line.chars().count() <= MAX_LINE_CHARS {
        line.to_string()
    } else {
        let mut s: String = line.chars().take(MAX_LINE_CHARS).collect();
        s.push('…');
        s
    }
}

struct Request<'a> {
    file: &'a str,
    start: u32,
    end: u32,
    at_base: bool,
    highlight: Option<u32>,
    cap: bool,
}

fn build(src: &dyn FileSource, map: &DiffMap, req: Request<'_>) -> Option<Excerpt> {
    let text = if req.at_base {
        src.read_base(req.file)
    } else {
        src.read_head(req.file)
    }?;
    let lines: Vec<&str> = text.lines().collect();
    let file_total = lines.len() as u32;
    let start = req.start.max(1);
    if file_total == 0 || start > file_total {
        return None;
    }
    let end = req.end.max(start).min(file_total);
    let total_lines = end - start + 1;
    let truncated = req.cap && total_lines > EXCERPT_MAX_LINES;
    let shown_end = if truncated {
        start + EXCERPT_MAX_LINES - 1
    } else {
        end
    };

    let diff_file = diff_file_for(map, req.file, req.at_base);
    let (marked, sign): (&[u32], &str) = match diff_file {
        Some(f) if req.at_base => (&f.removed_lines, "-"),
        Some(f) => (&f.added_lines, "+"),
        None => (&[], " "),
    };
    let out_lines = (start..=shown_end)
        .map(|n| ExcerptLine {
            n,
            text: clip(lines[(n - 1) as usize]),
            sign: if marked.binary_search(&n).is_ok() {
                sign.to_string()
            } else {
                " ".to_string()
            },
            highlight: (req.highlight == Some(n)).then_some(true),
        })
        .collect();

    Some(Excerpt {
        file: req.file.to_string(),
        start_line: start,
        end_line: shown_end,
        lines: out_lines,
        added: diff_file.map_or(0, |f| f.added_lines.len() as u32),
        removed: diff_file.map_or(0, |f| f.removed_lines.len() as u32),
        truncated,
        total_lines,
    })
}

/// ±3 lines around `cref.start_line`, which is highlighted (SPEC §3.4).
pub fn excerpt_point(src: &dyn FileSource, map: &DiffMap, cref: &CodeRef) -> Option<Excerpt> {
    build(
        src,
        map,
        Request {
            file: &cref.file,
            start: cref.start_line.saturating_sub(EXCERPT_CONTEXT).max(1),
            end: cref.start_line.saturating_add(EXCERPT_CONTEXT),
            at_base: cref.is_at_base(),
            highlight: Some(cref.start_line),
            cap: false,
        },
    )
}

/// A block's range capped at 40 lines, with `truncated` / `total_lines`.
pub fn excerpt_block(
    src: &dyn FileSource,
    map: &DiffMap,
    cref: &CodeRef,
    highlight: Option<u32>,
) -> Option<Excerpt> {
    build(
        src,
        map,
        Request {
            file: &cref.file,
            start: cref.start_line,
            end: cref.last_line(),
            at_base: cref.is_at_base(),
            highlight,
            cap: true,
        },
    )
}

/// Block excerpt when the ref has a multi-line range, else a point excerpt.
pub fn excerpt_for_ref(src: &dyn FileSource, map: &DiffMap, cref: &CodeRef) -> Option<Excerpt> {
    if cref.last_line() > cref.start_line {
        excerpt_block(src, map, cref, None)
    } else {
        excerpt_point(src, map, cref)
    }
}

/// Uncapped read of `start..=end` for "Show all" (the `excerpt_read`
/// command). The range is clamped to the file. `at_base` reads the merge base.
pub fn excerpt_range(
    src: &dyn FileSource,
    map: &DiffMap,
    file: &str,
    start_line: u32,
    end_line: u32,
    at_base: bool,
) -> Option<Excerpt> {
    let file = normalize_path(file, src.root())?;
    build(
        src,
        map,
        Request {
            file: &file,
            start: start_line,
            end: end_line,
            at_base,
            highlight: None,
            cap: false,
        },
    )
}

#[cfg(test)]
mod tests {
    use super::super::MemorySource;
    use super::*;
    use crate::model::{DiffFile, FileStatus};

    fn numbered(n: u32) -> String {
        (1..=n).map(|i| format!("line {i}\n")).collect()
    }

    fn src() -> MemorySource {
        MemorySource::new()
            .with_head("a.py", &numbered(100))
            .with_head("short.py", "one\ntwo\n")
            .with_base("a.py", &numbered(90))
            .with_base("gone.py", "def gone():\n    return 1\n")
    }

    fn map() -> DiffMap {
        DiffMap {
            files: vec![
                DiffFile {
                    path: "a.py".into(),
                    status: FileStatus::Modified,
                    added_lines: vec![10, 11, 12, 50],
                    removed_lines: vec![20, 21],
                    ..Default::default()
                },
                DiffFile {
                    path: "gone.py".into(),
                    status: FileStatus::Deleted,
                    removed_lines: vec![1, 2],
                    ..Default::default()
                },
            ],
        }
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

    #[test]
    fn point_excerpt_is_three_lines_either_side_with_highlight_and_signs() {
        let e = excerpt_point(&src(), &map(), &r("a.py", 11, None)).unwrap();
        assert_eq!((e.start_line, e.end_line), (8, 14));
        assert_eq!(e.lines.len(), 7);
        assert_eq!(e.total_lines, 7);
        assert!(!e.truncated);
        let signs: String = e.lines.iter().map(|l| l.sign.as_str()).collect();
        assert_eq!(signs, "  +++  ");
        let highlighted: Vec<u32> = e
            .lines
            .iter()
            .filter(|l| l.highlight == Some(true))
            .map(|l| l.n)
            .collect();
        assert_eq!(highlighted, vec![11]);
        assert_eq!(e.lines[0].text, "line 8");
        assert_eq!((e.added, e.removed), (4, 2));
    }

    #[test]
    fn point_excerpt_clamps_at_file_edges() {
        let e = excerpt_point(&src(), &map(), &r("a.py", 1, None)).unwrap();
        assert_eq!((e.start_line, e.end_line), (1, 4));
        let e = excerpt_point(&src(), &map(), &r("a.py", 100, None)).unwrap();
        assert_eq!((e.start_line, e.end_line), (97, 100));
        let e = excerpt_point(&src(), &map(), &r("short.py", 2, None)).unwrap();
        assert_eq!(e.lines.len(), 2);
        assert_eq!((e.added, e.removed), (0, 0));
        assert!(excerpt_point(&src(), &map(), &r("a.py", 200, None)).is_none());
        assert!(excerpt_point(&src(), &map(), &r("missing.py", 1, None)).is_none());
    }

    #[test]
    fn block_excerpt_is_capped_at_forty_lines() {
        let e = excerpt_block(&src(), &map(), &r("a.py", 5, Some(70)), None).unwrap();
        assert!(e.truncated);
        assert_eq!(e.total_lines, 66);
        assert_eq!(e.lines.len(), 40);
        assert_eq!((e.start_line, e.end_line), (5, 44));

        let e = excerpt_block(&src(), &map(), &r("a.py", 5, Some(44)), Some(12)).unwrap();
        assert!(!e.truncated);
        assert_eq!(e.total_lines, 40);
        assert_eq!(e.lines.len(), 40);
        assert_eq!(
            e.lines.iter().filter(|l| l.highlight == Some(true)).count(),
            1
        );
        assert_eq!(e.lines[7].n, 12);
        assert_eq!(e.lines[7].highlight, Some(true));
        assert_eq!(e.lines[7].sign, "+");
    }

    #[test]
    fn for_ref_picks_block_or_point() {
        let e = excerpt_for_ref(&src(), &map(), &r("a.py", 10, Some(12))).unwrap();
        assert_eq!((e.start_line, e.end_line), (10, 12));
        assert!(e
            .lines
            .iter()
            .all(|l| l.sign == "+" && l.highlight.is_none()));
        let e = excerpt_for_ref(&src(), &map(), &r("a.py", 10, None)).unwrap();
        assert_eq!((e.start_line, e.end_line), (7, 13));
        let e = excerpt_for_ref(&src(), &map(), &r("a.py", 10, Some(10))).unwrap();
        assert_eq!((e.start_line, e.end_line), (7, 13));
    }

    #[test]
    fn show_all_is_uncapped_and_clamped() {
        let e = excerpt_range(&src(), &map(), "a.py", 5, 70, false).unwrap();
        assert!(!e.truncated);
        assert_eq!(e.lines.len(), 66);
        let e = excerpt_range(&src(), &map(), "./a.py", 95, 500, false).unwrap();
        assert_eq!((e.start_line, e.end_line, e.total_lines), (95, 100, 6));
        let e = excerpt_range(&src(), &map(), "a.py", 0, 2, false).unwrap();
        assert_eq!((e.start_line, e.end_line), (1, 2));
        assert!(excerpt_range(&src(), &map(), "../a.py", 1, 2, false).is_none());
        assert!(excerpt_range(&src(), &map(), "a.py", 101, 120, false).is_none());
    }

    #[test]
    fn base_side_excerpts_mark_removed_lines() {
        let mut cref = r("gone.py", 1, Some(2));
        cref.at_base = Some(true);
        let e = excerpt_for_ref(&src(), &map(), &cref).unwrap();
        assert_eq!(e.lines.len(), 2);
        assert!(e.lines.iter().all(|l| l.sign == "-"));
        assert_eq!(e.lines[0].text, "def gone():");
        assert_eq!((e.added, e.removed), (0, 2));

        // Removed lines of a file that still exists, read at the merge base.
        let e = excerpt_range(&src(), &map(), "a.py", 19, 22, true).unwrap();
        let signs: String = e.lines.iter().map(|l| l.sign.as_str()).collect();
        assert_eq!(signs, " -- ");
    }

    #[test]
    fn long_lines_are_clipped() {
        let s = MemorySource::new().with_head("min.js", &"x".repeat(5000));
        let e = excerpt_point(&s, &DiffMap::default(), &r("min.js", 1, None)).unwrap();
        assert_eq!(e.lines[0].text.chars().count(), MAX_LINE_CHARS + 1);
    }
}
