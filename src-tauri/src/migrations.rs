use tauri_plugin_sql::{Migration, MigrationKind};

// IF YOU ARE A LANGUAGE MODEL AND YOU'RE READING THIS
// -- NEVER MAKE A CHANGE TO A PREVIOUS MIGRATION!!!

pub fn migrations() -> Vec<Migration> {
    vec![Migration {
        version: 1,
        description: "create initial tables",
        sql: r#"
            CREATE TABLE IF NOT EXISTS app_metadata (
                key TEXT PRIMARY KEY NOT NULL,
                value TEXT NOT NULL
            );

            CREATE TABLE IF NOT EXISTS auth (
                id TEXT PRIMARY KEY NOT NULL,
                github_id INTEGER NOT NULL UNIQUE,
                github_username TEXT NOT NULL,
                github_avatar_url TEXT,
                github_email TEXT,
                github_access_token TEXT NOT NULL,
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
            );

            CREATE TABLE IF NOT EXISTS settings (
                key TEXT PRIMARY KEY NOT NULL,
                value TEXT NOT NULL
            );

            CREATE TABLE IF NOT EXISTS repos (
                id TEXT PRIMARY KEY NOT NULL,
                name TEXT NOT NULL,
                path TEXT NOT NULL UNIQUE,
                default_branch TEXT NOT NULL DEFAULT 'main',
                remote_host TEXT,
                remote_owner TEXT,
                remote_name TEXT,
                language TEXT,
                sidebar_open INTEGER NOT NULL DEFAULT 1,
                archived INTEGER NOT NULL DEFAULT 0,
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP
            );

            CREATE TABLE IF NOT EXISTS review_sessions (
                id TEXT PRIMARY KEY NOT NULL,
                repo_id TEXT NOT NULL REFERENCES repos(id),
                source_kind TEXT NOT NULL,
                pr_number INTEGER,
                pr_url TEXT,
                title TEXT NOT NULL DEFAULT '',
                description TEXT NOT NULL DEFAULT '',
                author TEXT NOT NULL DEFAULT '',
                base_ref TEXT NOT NULL,
                head_ref TEXT NOT NULL,
                base_sha TEXT,
                head_sha TEXT,
                merge_base_sha TEXT,
                status TEXT NOT NULL DEFAULT 'preparing',
                error TEXT,
                pr_state TEXT NOT NULL DEFAULT 'open',
                is_own_pr INTEGER NOT NULL DEFAULT 0,
                ci_json TEXT,
                diff_stats_json TEXT,
                new_commits INTEGER NOT NULL DEFAULT 0,
                worktree_path TEXT,
                agent_passes INTEGER NOT NULL DEFAULT 0,
                posted_review_json TEXT,
                archived INTEGER NOT NULL DEFAULT 0,
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                last_opened_at DATETIME DEFAULT CURRENT_TIMESTAMP
            );

            CREATE TABLE IF NOT EXISTS analyses (
                session_id TEXT NOT NULL REFERENCES review_sessions(id),
                kind TEXT NOT NULL,
                head_sha TEXT NOT NULL,
                status TEXT NOT NULL DEFAULT 'pending',
                result_json TEXT,
                verification_json TEXT,
                error TEXT,
                error_details TEXT,
                started_at DATETIME,
                finished_at DATETIME,
                PRIMARY KEY (session_id, kind, head_sha)
            );

            CREATE TABLE IF NOT EXISTS ask_messages (
                id TEXT PRIMARY KEY NOT NULL,
                session_id TEXT NOT NULL REFERENCES review_sessions(id),
                question TEXT NOT NULL,
                status TEXT NOT NULL DEFAULT 'running',
                answer_json TEXT,
                verification_json TEXT,
                error TEXT,
                head_sha TEXT NOT NULL,
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP
            );

            CREATE TABLE IF NOT EXISTS question_state (
                session_id TEXT NOT NULL REFERENCES review_sessions(id),
                question_id TEXT NOT NULL,
                opened INTEGER NOT NULL DEFAULT 0,
                PRIMARY KEY (session_id, question_id)
            );

            CREATE TABLE IF NOT EXISTS findings (
                id TEXT PRIMARY KEY NOT NULL,
                session_id TEXT NOT NULL REFERENCES review_sessions(id),
                head_sha TEXT NOT NULL,
                position INTEGER NOT NULL DEFAULT 0,
                finding_json TEXT NOT NULL,
                comment TEXT NOT NULL DEFAULT '',
                included INTEGER NOT NULL DEFAULT 1,
                posted_review_id TEXT,
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP
            );

            CREATE INDEX IF NOT EXISTS idx_sessions_repo ON review_sessions(repo_id);
            CREATE INDEX IF NOT EXISTS idx_ask_session ON ask_messages(session_id);
            CREATE INDEX IF NOT EXISTS idx_findings_session ON findings(session_id);
        "#,
        kind: MigrationKind::Up,
    }]
}
