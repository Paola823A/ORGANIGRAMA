CREATE TABLE removed_chart_versions (
 version_id TEXT PRIMARY KEY REFERENCES chart_versions(id),
 removed_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
