//! Live, read-only checks of the GitHub module against a real PR.
//! Needs `gh` signed in and network access, so they are ignored by default:
//! `cargo test --test github_live -- --ignored --nocapture`.

use grsp_lib::github;

const OWNER: &str = "Ghvstcode";
const NAME: &str = "sustn";
const PR: u64 = 20;

#[test]
#[ignore]
fn reads_a_real_pr() {
    let status = github::status();
    assert!(status.authenticated, "gh is not signed in");

    let meta = github::pr_meta(OWNER, NAME, PR).expect("pr meta");
    println!("meta: {meta:?}");

    let head = github::head_sha(OWNER, NAME, PR).expect("head sha");
    assert_eq!(head.len(), 40);

    let ci = github::ci_status(OWNER, NAME, &head);
    println!("ci: {ci:?}");

    let discussion = github::fetch_discussion(OWNER, NAME, PR).expect("discussion");
    let threads = github::build_threads(&discussion);
    println!(
        "threads: {} · comments: {}",
        threads.len(),
        github::comment_count(&threads)
    );

    let open = github::list_open_prs(OWNER, NAME).expect("open prs");
    println!("open prs: {}", open.len());
    assert!(!open.is_empty());
}
