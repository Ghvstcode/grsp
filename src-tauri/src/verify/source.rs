//! Where file text comes from: the worktree at head, `git show` at the
//! merge base, or memory in tests.

use std::collections::HashMap;
use std::path::{Component, Path, PathBuf};
use std::sync::Mutex;

/// Files larger than this are never read for verification or excerpts.
const MAX_FILE_BYTES: u64 = 4 * 1024 * 1024;

/// Where file text comes from. Paths are repo-relative with `/` separators.
pub trait FileSource {
    /// File text at head (the worktree). `None` if missing or unreadable.
    fn read_head(&self, path: &str) -> Option<String>;
    /// File text at the merge base. `None` if missing.
    fn read_base(&self, path: &str) -> Option<String>;
    /// Worktree root, used to relativise absolute paths the agent returns.
    fn root(&self) -> Option<&Path> {
        None
    }
}

/// Reads head from a worktree directory and base via `git show`.
/// Reads are cached for the lifetime of the source.
pub struct WorktreeSource {
    worktree: PathBuf,
    merge_base_sha: String,
    cache: Mutex<HashMap<(bool, String), Option<String>>>,
}

fn is_plain_relative(path: &str) -> bool {
    !path.is_empty()
        && Path::new(path)
            .components()
            .all(|c| matches!(c, Component::Normal(_)))
}

impl WorktreeSource {
    pub fn new(worktree: &Path, merge_base_sha: &str) -> Self {
        Self {
            worktree: worktree
                .canonicalize()
                .unwrap_or_else(|_| worktree.to_path_buf()),
            merge_base_sha: merge_base_sha.to_string(),
            cache: Mutex::new(HashMap::new()),
        }
    }

    fn cached(
        &self,
        base: bool,
        path: &str,
        load: impl FnOnce() -> Option<String>,
    ) -> Option<String> {
        let key = (base, path.to_string());
        if let Ok(cache) = self.cache.lock() {
            if let Some(hit) = cache.get(&key) {
                return hit.clone();
            }
        }
        let value = load();
        if let Ok(mut cache) = self.cache.lock() {
            cache.insert(key, value.clone());
        }
        value
    }

    fn load_head(&self, path: &str) -> Option<String> {
        if !is_plain_relative(path) {
            return None;
        }
        // Canonicalise so a symlink can't lead outside the worktree.
        let full = self.worktree.join(path).canonicalize().ok()?;
        if !full.starts_with(&self.worktree) {
            return None;
        }
        let meta = std::fs::metadata(&full).ok()?;
        if !meta.is_file() || meta.len() > MAX_FILE_BYTES {
            return None;
        }
        let bytes = std::fs::read(&full).ok()?;
        if bytes.iter().take(8000).any(|b| *b == 0) {
            return None; // binary
        }
        Some(String::from_utf8_lossy(&bytes).to_string())
    }

    fn load_base(&self, path: &str) -> Option<String> {
        if !is_plain_relative(path) || self.merge_base_sha.is_empty() {
            return None;
        }
        let text =
            crate::git::show_file_at(&self.worktree.to_string_lossy(), &self.merge_base_sha, path)
                .ok()
                .flatten()?;
        (text.len() as u64 <= MAX_FILE_BYTES && !text.bytes().take(8000).any(|b| b == 0))
            .then_some(text)
    }
}

impl FileSource for WorktreeSource {
    fn read_head(&self, path: &str) -> Option<String> {
        self.cached(false, path, || self.load_head(path))
    }

    fn read_base(&self, path: &str) -> Option<String> {
        self.cached(true, path, || self.load_base(path))
    }

    fn root(&self) -> Option<&Path> {
        Some(&self.worktree)
    }
}

/// In-memory source for tests.
#[derive(Debug, Clone, Default)]
pub struct MemorySource {
    pub head: HashMap<String, String>,
    pub base: HashMap<String, String>,
    pub root: Option<PathBuf>,
}

impl MemorySource {
    pub fn new() -> Self {
        Self::default()
    }

    pub fn with_head(mut self, path: &str, text: &str) -> Self {
        self.head.insert(path.to_string(), text.to_string());
        self
    }

    pub fn with_base(mut self, path: &str, text: &str) -> Self {
        self.base.insert(path.to_string(), text.to_string());
        self
    }

    pub fn with_root(mut self, root: &str) -> Self {
        self.root = Some(PathBuf::from(root));
        self
    }
}

impl FileSource for MemorySource {
    fn read_head(&self, path: &str) -> Option<String> {
        self.head.get(path).cloned()
    }

    fn read_base(&self, path: &str) -> Option<String> {
        self.base.get(path).cloned()
    }

    fn root(&self) -> Option<&Path> {
        self.root.as_deref()
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::git::testutil::*;

    #[test]
    fn worktree_source_reads_head_and_base_and_refuses_escapes() {
        let tmp = tempfile::tempdir().unwrap();
        let dir = tmp.path().join("repo");
        std::fs::create_dir_all(&dir).unwrap();
        std::fs::write(tmp.path().join("secret.txt"), "top secret\n").unwrap();
        init_repo(&dir);
        write(&dir, "a.py", "old\n");
        write(&dir, "gone.py", "def gone():\n    pass\n");
        let base = commit_all(&dir, "base");
        write(&dir, "a.py", "new\n");
        std::fs::remove_file(dir.join("gone.py")).unwrap();
        std::fs::write(dir.join("blob.bin"), [1u8, 0, 2, 0]).unwrap();
        #[cfg(unix)]
        std::os::unix::fs::symlink(tmp.path().join("secret.txt"), dir.join("link.txt")).unwrap();
        commit_all(&dir, "head");

        let src = WorktreeSource::new(&dir, &base);
        assert_eq!(src.read_head("a.py").as_deref(), Some("new\n"));
        assert_eq!(src.read_base("a.py").as_deref(), Some("old\n"));
        assert_eq!(src.read_head("gone.py"), None);
        assert_eq!(
            src.read_base("gone.py").as_deref(),
            Some("def gone():\n    pass\n")
        );
        assert_eq!(src.read_base("never.py"), None);
        assert_eq!(src.read_head("blob.bin"), None);
        assert_eq!(src.read_head("../secret.txt"), None);
        assert_eq!(src.read_base("../secret.txt"), None);
        assert_eq!(src.read_head("/etc/hosts"), None);
        #[cfg(unix)]
        assert_eq!(src.read_head("link.txt"), None);
        assert!(src.root().is_some());
        // Cached: still served after the file changes underneath.
        std::fs::write(dir.join("a.py"), "changed again\n").unwrap();
        assert_eq!(src.read_head("a.py").as_deref(), Some("new\n"));
    }
}
