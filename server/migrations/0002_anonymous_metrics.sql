-- Usage metrics no longer require a signed-in user: events carry an anonymous
-- install id, and a user id only when the app is signed in.

CREATE TABLE metric_events_new (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER REFERENCES users(id),
    install_id TEXT,
    event_type TEXT NOT NULL,
    event_data TEXT,
    client_timestamp TEXT NOT NULL,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

INSERT INTO metric_events_new (id, user_id, event_type, event_data, client_timestamp, created_at)
SELECT id, user_id, event_type, event_data, client_timestamp, created_at FROM metric_events;

DROP TABLE metric_events;
ALTER TABLE metric_events_new RENAME TO metric_events;

CREATE INDEX IF NOT EXISTS idx_metric_events_user_type ON metric_events(user_id, event_type);
CREATE INDEX IF NOT EXISTS idx_metric_events_install_type ON metric_events(install_id, event_type);
CREATE INDEX IF NOT EXISTS idx_metric_events_created ON metric_events(created_at);
