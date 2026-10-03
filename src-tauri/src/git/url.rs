//! PR URL and remote URL parsing. Pure.

use super::PrUrl;
use crate::model::RemoteInfo;

fn host_label(host: &str) -> String {
    let h = host.trim().to_ascii_lowercase();
    let h = h.strip_prefix("www.").unwrap_or(&h);
    if h == "github.com" {
        "github".to_string()
    } else {
        h.to_string()
    }
}

fn valid_segment(s: &str) -> bool {
    !s.is_empty()
        && s != "."
        && s != ".."
        && s.chars()
            .all(|c| c.is_ascii_alphanumeric() || matches!(c, '-' | '_' | '.'))
}

/// Parse `https://github.com/{owner}/{repo}/pull/{n}` with optional
/// `/files`, `/commits`, query string, fragment and trailing slashes.
/// Only github.com URLs are accepted (PR mode is GitHub only in v1).
pub fn parse_pr_url(url: &str) -> Option<PrUrl> {
    let s = url.trim();
    let s = s.split(['?', '#']).next().unwrap_or("");
    let lower = s.to_ascii_lowercase();
    let rest = if lower.starts_with("https://") {
        &s[8..]
    } else if lower.starts_with("http://") {
        &s[7..]
    } else if s.contains("://") {
        return None;
    } else {
        s
    };
    let mut parts = rest.split('/').filter(|p| !p.is_empty());
    let host = host_label(parts.next()?);
    if host != "github" {
        return None;
    }
    let owner = parts.next()?;
    let name = parts.next()?;
    let kind = parts.next()?;
    if kind != "pull" && kind != "pulls" {
        return None;
    }
    let number_text = parts.next()?;
    if !number_text.chars().all(|c| c.is_ascii_digit()) {
        return None;
    }
    let number: u64 = number_text.parse().ok()?;
    if number == 0 || !valid_segment(owner) || !valid_segment(name) {
        return None;
    }
    Some(PrUrl {
        host,
        owner: owner.to_string(),
        name: name.to_string(),
        number,
    })
}

/// Parse a remote URL: `https://host/owner/repo(.git)`, `ssh://git@host[:port]/owner/repo`,
/// `git://…`, or scp-like `git@host:owner/repo.git`. `host` is `"github"`
/// for github.com and the hostname otherwise. Nested groups keep their
/// path in `owner`.
pub fn parse_remote_url(url: &str) -> Option<RemoteInfo> {
    let s = url.trim();
    if s.is_empty() {
        return None;
    }
    let (host, path) = if let Some(idx) = s.find("://") {
        let scheme = s[..idx].to_ascii_lowercase();
        if !matches!(
            scheme.as_str(),
            "https" | "http" | "ssh" | "git" | "git+ssh"
        ) {
            return None;
        }
        let rest = &s[idx + 3..];
        let (authority, path) = rest.split_once('/')?;
        let host_port = authority.rsplit('@').next().unwrap_or(authority);
        let host = host_port.split(':').next().unwrap_or(host_port);
        (host, path)
    } else {
        // scp-like: [user@]host:path
        let (left, path) = s.split_once(':')?;
        if left.contains('/') || left.is_empty() {
            return None;
        }
        let host = left.rsplit('@').next().unwrap_or(left);
        (host, path)
    };
    if host.is_empty() {
        return None;
    }
    let path = path.split(['?', '#']).next().unwrap_or("");
    let path = path.trim_matches('/');
    let path = path
        .strip_suffix(".git")
        .unwrap_or(path)
        .trim_end_matches('/');
    let segments: Vec<&str> = path.split('/').filter(|p| !p.is_empty()).collect();
    if segments.len() < 2 || !segments.iter().all(|p| valid_segment(p)) {
        return None;
    }
    let name = segments[segments.len() - 1].to_string();
    let owner = segments[..segments.len() - 1].join("/");
    Some(RemoteInfo {
        host: host_label(host),
        owner,
        name,
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    fn pr(url: &str) -> Option<(String, String, u64)> {
        parse_pr_url(url).map(|p| (p.owner, p.name, p.number))
    }

    #[test]
    fn pr_url_plain() {
        assert_eq!(
            pr("https://github.com/acme/shop/pull/482"),
            Some(("acme".into(), "shop".into(), 482))
        );
        assert_eq!(
            parse_pr_url("https://github.com/acme/shop/pull/482")
                .unwrap()
                .host,
            "github"
        );
    }

    #[test]
    fn pr_url_suffixes_queries_and_slashes() {
        for u in [
            "https://github.com/acme/shop/pull/482/",
            "https://github.com/acme/shop/pull/482/files",
            "https://github.com/acme/shop/pull/482/files/",
            "https://github.com/acme/shop/pull/482/commits",
            "https://github.com/acme/shop/pull/482/commits/abc123",
            "https://github.com/acme/shop/pull/482?diff=split&w=1",
            "https://github.com/acme/shop/pull/482/files?diff=unified#diff-abc",
            "https://github.com/acme/shop/pull/482#issuecomment-1",
            "  https://github.com/acme/shop/pull/482///  ",
            "http://github.com/acme/shop/pull/482",
            "https://www.github.com/acme/shop/pull/482",
            "github.com/acme/shop/pull/482",
            "HTTPS://GitHub.com/acme/shop/pull/482",
        ] {
            assert_eq!(pr(u), Some(("acme".into(), "shop".into(), 482)), "{u}");
        }
    }

    #[test]
    fn pr_url_keeps_dots_and_dashes() {
        assert_eq!(
            pr("https://github.com/my-org/my.repo_x/pull/7"),
            Some(("my-org".into(), "my.repo_x".into(), 7))
        );
    }

    #[test]
    fn pr_url_rejects_everything_else() {
        for u in [
            "",
            "not a url",
            "https://github.com/acme/shop",
            "https://github.com/acme/shop/issues/482",
            "https://github.com/acme/shop/pull/",
            "https://github.com/acme/shop/pull/abc",
            "https://github.com/acme/shop/pull/12abc",
            "https://github.com/acme/shop/pull/0",
            "https://gitlab.com/acme/shop/pull/1",
            "https://github.com.evil.com/acme/shop/pull/1",
            "ftp://github.com/acme/shop/pull/1",
            "https://github.com/acme/../pull/1",
        ] {
            assert_eq!(pr(u), None, "{u}");
        }
    }

    fn remote(url: &str) -> Option<(String, String, String)> {
        parse_remote_url(url).map(|r| (r.host, r.owner, r.name))
    }

    #[test]
    fn remote_https_forms() {
        let want = Some(("github".to_string(), "acme".to_string(), "shop".to_string()));
        assert_eq!(remote("https://github.com/acme/shop.git"), want);
        assert_eq!(remote("https://github.com/acme/shop"), want);
        assert_eq!(remote("https://github.com/acme/shop/"), want);
        assert_eq!(remote("https://user:tok@github.com/acme/shop.git"), want);
        assert_eq!(remote("git://github.com/acme/shop.git"), want);
    }

    #[test]
    fn remote_ssh_forms() {
        let want = Some(("github".to_string(), "acme".to_string(), "shop".to_string()));
        assert_eq!(remote("git@github.com:acme/shop.git"), want);
        assert_eq!(remote("git@github.com:acme/shop"), want);
        assert_eq!(remote("ssh://git@github.com/acme/shop.git"), want);
        assert_eq!(remote("ssh://git@github.com:22/acme/shop.git"), want);
        assert_eq!(remote("org-123@github.com:acme/shop.git"), want);
    }

    #[test]
    fn remote_other_hosts_and_groups() {
        assert_eq!(
            remote("git@gitlab.com:group/sub/proj.git"),
            Some(("gitlab.com".into(), "group/sub".into(), "proj".into()))
        );
        assert_eq!(
            remote("https://bitbucket.org/team/repo.git"),
            Some(("bitbucket.org".into(), "team".into(), "repo".into()))
        );
        assert!(!parse_remote_url("git@gitlab.com:g/p.git")
            .unwrap()
            .is_github());
    }

    #[test]
    fn remote_rejects_local_and_garbage() {
        for u in [
            "",
            "/srv/git/repo.git",
            "../repo",
            "file:///srv/repo.git",
            "github.com",
            "https://github.com/onlyowner",
        ] {
            assert_eq!(remote(u), None, "{u}");
        }
    }
}
