//! Edge spot-check (SPEC §3.3).

use super::refs::squash;
use super::{FileSource, EXCERPT_MAX_LINES};
use crate::model::{BlockKind, CodeRef};

/// One end of a claimed "A leads to B" edge.
#[derive(Debug, Clone, Copy)]
pub struct EdgeEnd<'a> {
    pub code_ref: &'a CodeRef,
    pub label: &'a str,
    pub kind: BlockKind,
}

fn is_ident_char(c: char) -> bool {
    c.is_alphanumeric() || c == '_'
}

/// Identifier-like tokens of at least three characters.
fn identifiers(s: &str) -> Vec<&str> {
    s.split(|c: char| !is_ident_char(c))
        .filter(|t| t.chars().count() >= 3 && !t.chars().all(|c| c.is_ascii_digit()))
        .collect()
}

/// `needle` appears in `haystack` as a whole identifier.
fn contains_word(haystack: &str, needle: &str) -> bool {
    let mut from = 0;
    while let Some(pos) = haystack[from..].find(needle) {
        let start = from + pos;
        let end = start + needle.len();
        let before_ok = haystack[..start]
            .chars()
            .next_back()
            .is_none_or(|c| !is_ident_char(c));
        let after_ok = haystack[end..]
            .chars()
            .next()
            .is_none_or(|c| !is_ident_char(c));
        if before_ok && after_ok {
            return true;
        }
        from = start + needle.chars().next().map_or(1, char::len_utf8);
    }
    false
}

/// Edge spot-check (SPEC §3.3): does A's range text contain B's anchor or
/// name? Tried in order: B's whole anchor (whitespace-insensitive), B's
/// label, the label's last segment (`OrderService.create` → `create`), and
/// the longest identifier in B's anchor (`def requires_approval(order):` →
/// `requires_approval`). No language knowledge: only identifier shapes.
///
/// An event/queue publish → job/consumer step is exempt, because the
/// indirection is expected, but needs a verified ref on both ends.
pub fn edge_confirmed(src: &dyn FileSource, from: EdgeEnd<'_>, to: EdgeEnd<'_>) -> bool {
    if !from.code_ref.verified || !to.code_ref.verified {
        return false;
    }
    if from.kind == BlockKind::Event && to.kind == BlockKind::Job {
        return true;
    }
    let a = from.code_ref;
    let text = if a.is_at_base() {
        src.read_base(&a.file)
    } else {
        src.read_head(&a.file)
    };
    let Some(text) = text else {
        return false;
    };
    let start = a.start_line.max(1);
    // A point ref gives no extent; look at the same window a block shows.
    let end = a
        .end_line
        .unwrap_or(start + EXCERPT_MAX_LINES - 1)
        .max(start);
    let range: String = text
        .lines()
        .skip(start as usize - 1)
        .take((end - start + 1) as usize)
        .collect::<Vec<_>>()
        .join("\n");
    if range.trim().is_empty() {
        return false;
    }
    let squashed = squash(&range);

    if let Some(anchor) = to.code_ref.anchor.as_deref() {
        let needle = squash(anchor);
        if needle.chars().count() >= 3 && squashed.contains(&needle) {
            return true;
        }
    }
    let label = squash(to.label);
    if label.chars().count() >= 3 && squashed.contains(&label) {
        return true;
    }
    if let Some(last) = identifiers(to.label).last() {
        if contains_word(&range, last) {
            return true;
        }
    }
    if let Some(anchor) = to.code_ref.anchor.as_deref() {
        // Longest identifier; the first one wins a tie.
        let longest = identifiers(anchor)
            .into_iter()
            .fold(None::<&str>, |best, t| match best {
                Some(b) if b.chars().count() >= t.chars().count() => Some(b),
                _ => Some(t),
            });
        if let Some(name) = longest {
            if contains_word(&range, name) {
                return true;
            }
        }
    }
    false
}

#[cfg(test)]
mod tests {
    use super::super::MemorySource;
    use super::*;

    const SERVICES: &str = "\
class OrderService:
    def create(self, data):
        order = Order(**data)
        if requires_approval(order):
            order.status = HOLD
        order.save()
        publish('order.created', order.id)
        return order

    def other(self):
        return create_invoice()
";

    fn src() -> MemorySource {
        MemorySource::new().with_head("services.py", SERVICES)
    }

    fn r(start: u32, end: Option<u32>, anchor: Option<&str>) -> CodeRef {
        CodeRef {
            file: "services.py".into(),
            start_line: start,
            end_line: end,
            anchor: anchor.map(str::to_string),
            verified: true,
            ..Default::default()
        }
    }

    fn confirmed(
        a: &CodeRef,
        a_kind: BlockKind,
        b: &CodeRef,
        b_label: &str,
        b_kind: BlockKind,
    ) -> bool {
        edge_confirmed(
            &src(),
            EdgeEnd {
                code_ref: a,
                label: "A",
                kind: a_kind,
            },
            EdgeEnd {
                code_ref: b,
                label: b_label,
                kind: b_kind,
            },
        )
    }

    #[test]
    fn confirmed_by_longest_identifier_in_anchor() {
        let a = r(2, Some(8), Some("def create"));
        let b = r(1, None, Some("def requires_approval(order):"));
        assert!(confirmed(
            &a,
            BlockKind::Service,
            &b,
            "Approval policy",
            BlockKind::Policy
        ));
    }

    #[test]
    fn confirmed_by_whole_anchor_whitespace_insensitive() {
        let a = r(2, Some(8), None);
        let b = r(1, None, Some("order.save( )"));
        assert!(confirmed(
            &a,
            BlockKind::Service,
            &b,
            "Persist",
            BlockKind::DbWrite
        ));
    }

    #[test]
    fn confirmed_by_label_last_segment() {
        let a = r(2, Some(8), None);
        let b = r(1, None, None);
        assert!(confirmed(
            &a,
            BlockKind::Service,
            &b,
            "Order.save",
            BlockKind::DbWrite
        ));
        assert!(confirmed(
            &a,
            BlockKind::Service,
            &b,
            "policy::requires_approval()",
            BlockKind::Policy
        ));
    }

    #[test]
    fn unconfirmed_when_a_never_mentions_b() {
        let a = r(2, Some(8), None);
        let b = r(1, None, Some("def send_email(to):"));
        assert!(!confirmed(
            &a,
            BlockKind::Service,
            &b,
            "Mailer.send_email",
            BlockKind::External
        ));
        // `create` appears only as part of `create_invoice` in lines 10–11:
        // whole-identifier matching doesn't count that.
        let a = r(10, Some(11), None);
        let b = r(2, None, None);
        assert!(!confirmed(
            &a,
            BlockKind::Service,
            &b,
            "OrderService.create",
            BlockKind::Service
        ));
    }

    #[test]
    fn range_matters() {
        // The call is on line 4; a range that stops at line 3 doesn't contain it.
        let b = r(1, None, Some("def requires_approval(order):"));
        assert!(!confirmed(
            &r(2, Some(3), None),
            BlockKind::Service,
            &b,
            "policy",
            BlockKind::Policy
        ));
        // A point ref looks at the window a block would show.
        assert!(confirmed(
            &r(2, None, None),
            BlockKind::Service,
            &b,
            "policy",
            BlockKind::Policy
        ));
    }

    #[test]
    fn event_to_consumer_is_exempt_with_verified_refs() {
        let a = r(7, None, Some("publish('order.created'"));
        let b = r(10, Some(11), None);
        assert!(confirmed(
            &a,
            BlockKind::Event,
            &b,
            "handle_order_created",
            BlockKind::Job
        ));
        // Same pair without the event/job kinds is checked normally and fails.
        assert!(!confirmed(
            &a,
            BlockKind::Service,
            &b,
            "handle_order_created",
            BlockKind::Job
        ));
        assert!(!confirmed(
            &a,
            BlockKind::Event,
            &b,
            "handle_order_created",
            BlockKind::Service
        ));
        // The exemption still needs verified refs on both ends.
        let mut unverified = b.clone();
        unverified.verified = false;
        assert!(!confirmed(
            &a,
            BlockKind::Event,
            &unverified,
            "handle_order_created",
            BlockKind::Job
        ));
    }

    #[test]
    fn short_or_numeric_names_never_confirm() {
        let a = r(2, Some(8), None);
        let b = r(1, None, Some("id"));
        assert!(!confirmed(
            &a,
            BlockKind::Service,
            &b,
            "x",
            BlockKind::Other
        ));
    }
}
