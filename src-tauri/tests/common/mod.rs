//! A tiny git repo with a base and a head commit, for contract tests.
//!
//! The scenario is the prototype's: an order-approval rule is added to the
//! normal create path, while a bulk import keeps writing orders without it.

#![allow(dead_code)]

use std::path::{Path, PathBuf};
use std::process::Command;
use std::sync::Arc;

use grsp_lib::agent::{Runner, ScriptedBackend};
use grsp_lib::git;
use grsp_lib::model::*;
use grsp_lib::pipelines::PassCtx;

pub const API: &str = "\
from orders.services import create_order
from orders.imports import import_orders


def post_orders(request):
    order = create_order(request.data)
    return {\"id\": order.id, \"status\": order.status}


def post_orders_import(request):
    count = import_orders(request.rows)
    return {\"imported\": count}
";

pub const IMPORTS: &str = "\
from orders.models import Order


def import_orders(rows):
    orders = [Order(**row) for row in rows]
    Order.objects.bulk_create(orders)
    return len(orders)
";

pub const SERVICES_BASE: &str = "\
from orders.models import Order


def create_order(data):
    order = Order(**data)
    order.status = \"OK\"
    order.save()
    notify_created(order)
    return order


def notify_created(order):
    publish(\"order.created\", order.id)
";

pub const SERVICES_HEAD: &str = "\
from orders.models import Order
from orders.policy import requires_approval


def create_order(data):
    order = Order(**data)
    if requires_approval(order):
        order.status = \"REQUIRES_APPROVAL\"
    else:
        order.status = \"OK\"
    order.save()
    notify_created(order)
    return order


def notify_created(order):
    publish(\"order.created\", order.id)
";

pub const POLICY: &str = "\
APPROVAL_THRESHOLD = 10000


def requires_approval(order):
    return order.total > APPROVAL_THRESHOLD
";

pub const LEGACY: &str = "\
def auto_approve(order):
    order.status = \"OK\"
    return order
";

pub const DESCRIPTION: &str =
    "All orders over 10,000 now require approval before they are confirmed.";

pub fn git_in(dir: &Path, args: &[&str]) -> String {
    let out = Command::new("git")
        .current_dir(dir)
        .args([
            "-c",
            "user.name=grsp-test",
            "-c",
            "user.email=test@grsp.invalid",
            "-c",
            "commit.gpgsign=false",
            "-c",
            "core.autocrlf=false",
        ])
        .args(args)
        .output()
        .expect("git runs");
    assert!(
        out.status.success(),
        "git {args:?} failed: {}",
        String::from_utf8_lossy(&out.stderr)
    );
    String::from_utf8_lossy(&out.stdout).trim().to_string()
}

pub fn write(dir: &Path, rel: &str, content: &str) {
    let p = dir.join(rel);
    std::fs::create_dir_all(p.parent().unwrap()).unwrap();
    std::fs::write(p, content).unwrap();
}

pub struct Fixture {
    pub dir: PathBuf,
    pub base_sha: String,
    pub head_sha: String,
}

impl Drop for Fixture {
    fn drop(&mut self) {
        let _ = std::fs::remove_dir_all(&self.dir);
    }
}

pub fn temp_dir(tag: &str) -> PathBuf {
    let dir = std::env::temp_dir().join(format!("grsp-{tag}-{}", uuid::Uuid::new_v4()));
    std::fs::create_dir_all(&dir).unwrap();
    dir.canonicalize().unwrap()
}

/// The order-approval repo: `main` at base, `feature` at head (checked out).
pub fn order_repo() -> Fixture {
    order_repo_with(|_| {})
}

/// Same, with extra head-side changes applied before the head commit.
pub fn order_repo_with(extra_head: impl FnOnce(&Path)) -> Fixture {
    let dir = temp_dir("contract");
    git_in(&dir, &["init", "-q", "-b", "main"]);
    write(&dir, "orders/api.py", API);
    write(&dir, "orders/imports.py", IMPORTS);
    write(&dir, "orders/services.py", SERVICES_BASE);
    write(&dir, "orders/legacy.py", LEGACY);
    write(&dir, "orders/models.py", "class Order:\n    pass\n");
    write(&dir, "package-lock.json", "{\"lockfileVersion\": 1}\n");
    git_in(&dir, &["add", "-A"]);
    git_in(&dir, &["commit", "-q", "-m", "base"]);
    let base_sha = git_in(&dir, &["rev-parse", "HEAD"]);

    git_in(&dir, &["checkout", "-q", "-b", "feature"]);
    write(&dir, "orders/services.py", SERVICES_HEAD);
    write(&dir, "orders/policy.py", POLICY);
    std::fs::remove_file(dir.join("orders/legacy.py")).unwrap();
    write(&dir, "package-lock.json", "{\"lockfileVersion\": 2}\n");
    extra_head(&dir);
    git_in(&dir, &["add", "-A"]);
    git_in(&dir, &["commit", "-q", "-m", "require approval"]);
    let head_sha = git_in(&dir, &["rev-parse", "HEAD"]);
    Fixture {
        dir,
        base_sha,
        head_sha,
    }
}

pub fn session(fx: &Fixture, description: &str) -> ReviewSession {
    ReviewSession {
        id: "s1".into(),
        repo_id: "r1".into(),
        source: SessionSource::Branches {
            base: "main".into(),
            head: "feature".into(),
        },
        title: "Require approval for large orders".into(),
        description: description.into(),
        author: "maya".into(),
        base_ref: "main".into(),
        head_ref: "feature".into(),
        base_sha: Some(fx.base_sha.clone()),
        head_sha: Some(fx.head_sha.clone()),
        merge_base_sha: Some(fx.base_sha.clone()),
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

/// A pass context reading the fixture repo's working tree (at head).
pub fn ctx(fx: &Fixture, description: &str) -> PassCtx {
    let bundle = git::build_diff(&fx.dir, &fx.base_sha, &fx.head_sha).expect("diff builds");
    PassCtx::new(
        session(fx, description),
        fx.dir.clone(),
        bundle,
        AgentKind::Claude,
    )
    .expect("ctx")
}

/// A runner that replays the given replies in order.
pub fn scripted<I, S>(replies: I) -> (Runner, Arc<ScriptedBackend>)
where
    I: IntoIterator<Item = S>,
    S: Into<String>,
{
    let backend = Arc::new(ScriptedBackend::new(replies));
    (Runner::new(backend.clone()), backend)
}

/// The discovery result later pipelines take as input, produced by running
/// the good recorded discovery reply through the real pipeline.
pub const GOOD_DISCOVERY: &str = r#"{
  "behaviourSummary": "Orders over 10,000 are now held for approval when created through the normal order endpoint. Orders created through the bulk import are not checked.",
  "mismatches": [
    { "claim": "All orders over 10,000 require approval", "reality": "The bulk import writes orders without the approval check.",
      "refs": [ { "file": "orders/imports.py", "startLine": 6, "anchor": "Order.objects.bulk_create(orders)" } ], "entryPointId": "ep2" }
  ],
  "entryPoints": [
    { "id": "ep1", "label": "POST /orders", "kind": "http",
      "ref": { "file": "orders/api.py", "startLine": 5, "endLine": 7, "anchor": "def post_orders(request)" },
      "effect": "Large orders are saved as REQUIRES_APPROVAL instead of OK.", "risk": "high", "timingOnly": false },
    { "id": "ep2", "label": "POST /orders/import", "kind": "http",
      "ref": { "file": "orders/api.py", "startLine": 10, "endLine": 12, "anchor": "def post_orders_import(request)" },
      "effect": "Not covered: imported orders skip the approval check.", "risk": "medium", "timingOnly": false }
  ],
  "gaps": [
    { "ref": { "file": "orders/imports.py", "startLine": 6, "anchor": "Order.objects.bulk_create(orders)" },
      "writeTarget": "orders", "explanation": "bulk_create saves orders directly, so large imported orders are never held.", "entryPointId": "ep2" }
  ],
  "removed": [
    { "ref": { "file": "orders/legacy.py", "startLine": 1, "endLine": 3, "anchor": "def auto_approve(order)" }, "name": "auto_approve" }
  ],
  "askSuggestions": ["What happens at exactly 10,000?", "Are imported orders checked?", "Who can approve an order?"]
}"#;
