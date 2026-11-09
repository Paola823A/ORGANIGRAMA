CREATE TABLE draft_history (
 id TEXT PRIMARY KEY,
 draft_id TEXT NOT NULL REFERENCES chart_drafts(id),
 actor_name TEXT NOT NULL,
 action TEXT NOT NULL,
 snapshot_json TEXT NOT NULL,
 created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX history_draft ON draft_history(draft_id,created_at);
