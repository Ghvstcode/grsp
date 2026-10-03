-- Initial schema for SUSTN server (D1/SQLite)

CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    github_id INTEGER NOT NULL UNIQUE,
    github_username TEXT NOT NULL,
    github_email TEXT,
    github_avatar_url TEXT,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    last_login_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS metric_events (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL REFERENCES users(id),
    event_type TEXT NOT NULL,
    event_data TEXT,
    client_timestamp TEXT NOT NULL,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_metric_events_user_type ON metric_events(user_id, event_type);
CREATE INDEX IF NOT EXISTS idx_metric_events_created ON metric_events(created_at);
