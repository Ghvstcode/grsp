//! Extracting the single JSON object an agent was asked to return (SPEC §4.2).
//!
//! Agents wrap JSON in prose and code fences however firmly they're told not
//! to. This module finds the object; serde then enforces the schema.

use serde::de::DeserializeOwned;

/// Why an agent reply couldn't be turned into the pipeline's type.
#[derive(Debug, Clone, PartialEq)]
pub enum JsonError {
    /// No JSON object could be found in the reply.
    NoObject,
    /// An object was found but didn't match the expected schema.
    Schema(String),
}

impl std::fmt::Display for JsonError {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            JsonError::NoObject => write!(f, "the reply did not contain a JSON object"),
            JsonError::Schema(e) => write!(f, "the JSON did not match the expected shape: {e}"),
        }
    }
}

/// Contents of every ``` fenced block in `text`, in order.
fn fenced_blocks(text: &str) -> Vec<&str> {
    let mut out = Vec::new();
    let mut rest = text;
    while let Some(open) = rest.find("```") {
        let after = &rest[open + 3..];
        // Skip the info string ("json", "JSON", …) up to the end of the line.
        let body_start = after.find('\n').map(|i| i + 1).unwrap_or(after.len());
        let body = &after[body_start..];
        match body.find("```") {
            Some(close) => {
                out.push(body[..close].trim());
                rest = &body[close + 3..];
            }
            None => {
                // Unterminated fence: take everything after it.
                out.push(body.trim());
                break;
            }
        }
    }
    out
}

/// Every balanced top-level `{…}` span in `text`, respecting JSON strings.
fn balanced_objects(text: &str) -> Vec<&str> {
    let bytes = text.as_bytes();
    let mut out = Vec::new();
    let mut i = 0;
    while i < bytes.len() {
        if bytes[i] != b'{' {
            i += 1;
            continue;
        }
        let start = i;
        let mut depth = 0usize;
        let mut in_str = false;
        let mut escaped = false;
        let mut end = None;
        let mut j = i;
        while j < bytes.len() {
            let c = bytes[j];
            if in_str {
                if escaped {
                    escaped = false;
                } else if c == b'\\' {
                    escaped = true;
                } else if c == b'"' {
                    in_str = false;
                }
            } else {
                match c {
                    b'"' => in_str = true,
                    b'{' => depth += 1,
                    b'}' => {
                        depth -= 1;
                        if depth == 0 {
                            end = Some(j);
                            break;
                        }
                    }
                    _ => {}
                }
            }
            j += 1;
        }
        match end {
            Some(e) => {
                out.push(&text[start..=e]);
                i = e + 1;
            }
            None => i = start + 1,
        }
    }
    out
}

fn as_object(candidate: &str) -> Option<serde_json::Value> {
    match serde_json::from_str::<serde_json::Value>(candidate.trim()) {
        Ok(v) if v.is_object() => Some(v),
        _ => None,
    }
}

/// Find the JSON object in an agent's final message.
///
/// Order: the whole reply, then fenced blocks, then balanced `{…}` spans.
/// When several spans parse, the largest wins (an agent that quotes a small
/// example before its real answer shouldn't have the example picked).
pub fn extract_object(text: &str) -> Option<serde_json::Value> {
    let trimmed = text.trim().trim_start_matches('\u{feff}');
    if let Some(v) = as_object(trimmed) {
        return Some(v);
    }
    for block in fenced_blocks(trimmed) {
        if let Some(v) = as_object(block) {
            return Some(v);
        }
    }
    balanced_objects(trimmed)
        .into_iter()
        .filter_map(|c| as_object(c).map(|v| (c.len(), v)))
        .max_by_key(|(len, _)| *len)
        .map(|(_, v)| v)
}

/// A reply that is a bare JSON array (some schemas in SPEC §5 are lists).
fn extract_array(text: &str) -> Option<serde_json::Value> {
    let trimmed = text.trim();
    let as_array = |c: &str| match serde_json::from_str::<serde_json::Value>(c.trim()) {
        Ok(v) if v.is_array() => Some(v),
        _ => None,
    };
    as_array(trimmed).or_else(|| fenced_blocks(trimmed).into_iter().find_map(as_array))
}

/// The JSON value in a reply: a bare array when the whole reply (or a fenced
/// block) is one, otherwise the object.
pub fn extract_value(text: &str) -> Option<serde_json::Value> {
    extract_array(text).or_else(|| extract_object(text))
}

/// Extract the value and deserialise it into `T`.
pub fn parse_reply<T: DeserializeOwned>(text: &str) -> Result<T, JsonError> {
    let value = extract_value(text).ok_or(JsonError::NoObject)?;
    serde_json::from_value::<T>(value).map_err(|e| JsonError::Schema(e.to_string()))
}

/// A short excerpt of raw agent output for the "Details" disclosure.
pub fn excerpt(text: &str, max_chars: usize) -> String {
    let t = text.trim();
    if t.chars().count() <= max_chars {
        return t.to_string();
    }
    let head: String = t.chars().take(max_chars).collect();
    format!("{head}\n… (truncated)")
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde::Deserialize;

    #[derive(Debug, Deserialize, PartialEq)]
    struct Sample {
        name: String,
        #[serde(default)]
        n: u32,
    }

    #[test]
    fn parses_bare_object() {
        let s: Sample = parse_reply(r#"{"name":"a","n":2}"#).unwrap();
        assert_eq!(
            s,
            Sample {
                name: "a".into(),
                n: 2
            }
        );
    }

    #[test]
    fn strips_json_code_fence() {
        let s: Sample = parse_reply("```json\n{\"name\": \"a\"}\n```").unwrap();
        assert_eq!(s.name, "a");
    }

    #[test]
    fn strips_fence_with_prose_around() {
        let text = "Here is the result:\n\n```\n{\"name\": \"b\", \"n\": 1}\n```\nLet me know!";
        let s: Sample = parse_reply(text).unwrap();
        assert_eq!(
            s,
            Sample {
                name: "b".into(),
                n: 1
            }
        );
    }

    #[test]
    fn finds_object_in_prose_without_fence() {
        let text = "Sure. {\"name\": \"c\"} is the answer.";
        let s: Sample = parse_reply(text).unwrap();
        assert_eq!(s.name, "c");
    }

    #[test]
    fn braces_inside_strings_do_not_confuse_the_scanner() {
        let text = r#"Result: {"name": "if (x) { return \"}\"; }", "n": 3} done"#;
        let s: Sample = parse_reply(text).unwrap();
        assert_eq!(s.n, 3);
        assert!(s.name.contains("return"));
    }

    #[test]
    fn prefers_the_largest_object_over_an_inline_example() {
        let text = r#"An item looks like {"n": 1}. Final: {"name": "real", "n": 9}"#;
        let v = extract_object(text).unwrap();
        assert_eq!(v["name"], "real");
    }

    #[test]
    fn unterminated_fence_still_parses() {
        let s: Sample = parse_reply("```json\n{\"name\": \"d\"}").unwrap();
        assert_eq!(s.name, "d");
    }

    #[test]
    fn no_object_is_reported() {
        let r: Result<Sample, _> = parse_reply("I could not complete the task.");
        assert_eq!(r.unwrap_err(), JsonError::NoObject);
    }

    #[test]
    fn truncated_json_is_reported_as_no_object() {
        let r: Result<Sample, _> = parse_reply("{\"name\": \"a\", \"n\": ");
        assert_eq!(r.unwrap_err(), JsonError::NoObject);
    }

    #[test]
    fn a_bare_array_is_handed_to_serde() {
        assert!(extract_object("[1, 2, 3]").is_none());
        let v: Vec<u32> = parse_reply("```json\n[1, 2, 3]\n```").unwrap();
        assert_eq!(v, vec![1, 2, 3]);
        let r: Result<Sample, _> = parse_reply("[1, 2, 3]");
        assert!(matches!(r.unwrap_err(), JsonError::Schema(_)));
    }

    #[test]
    fn schema_mismatch_is_reported_with_the_serde_message() {
        let r: Result<Sample, _> = parse_reply(r#"{"n": 2}"#);
        match r.unwrap_err() {
            JsonError::Schema(m) => assert!(m.contains("name"), "{m}"),
            other => panic!("unexpected {other:?}"),
        }
    }

    #[test]
    fn excerpt_truncates_on_char_boundaries() {
        let e = excerpt("€€€€€€", 3);
        assert!(e.starts_with("€€€"));
        assert!(e.contains("truncated"));
        assert_eq!(excerpt("short", 10), "short");
    }
}
