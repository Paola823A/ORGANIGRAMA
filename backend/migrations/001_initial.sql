CREATE TABLE companies (
 id TEXT PRIMARY KEY, name TEXT NOT NULL, normalized_name TEXT NOT NULL UNIQUE,
 created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP, updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE import_batches (
 id TEXT PRIMARY KEY, filename TEXT NOT NULL, content_hash TEXT NOT NULL,
 processed_count INTEGER NOT NULL, inserted_count INTEGER NOT NULL, updated_count INTEGER NOT NULL,
 issue_count INTEGER NOT NULL, result TEXT NOT NULL, summary_json TEXT NOT NULL,
 created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX idx_import_hash ON import_batches(content_hash);
CREATE TABLE employees (
 id TEXT PRIMARY KEY, dni TEXT NOT NULL, full_name TEXT NOT NULL, position_name TEXT NOT NULL,
 company_id TEXT NOT NULL REFERENCES companies(id), business_line TEXT NOT NULL,
 branch TEXT NOT NULL, area TEXT NOT NULL,
 employment_status TEXT NOT NULL CHECK(employment_status IN ('ACTIVE','CEASED','ABSENT')),
 source_sheet TEXT NOT NULL, source_row INTEGER NOT NULL, match_key TEXT NOT NULL,
 search_text TEXT NOT NULL, last_seen_import_id TEXT REFERENCES import_batches(id),
 created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP, updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX idx_employees_dni ON employees(dni);
CREATE INDEX idx_employees_company_status ON employees(company_id, employment_status);
CREATE INDEX idx_employees_match ON employees(match_key);
CREATE TABLE employee_hierarchy (
 employee_id TEXT PRIMARY KEY REFERENCES employees(id), supervisor_employee_id TEXT REFERENCES employees(id),
 supervisor_dni TEXT NOT NULL, resolution_status TEXT NOT NULL,
 import_batch_id TEXT NOT NULL REFERENCES import_batches(id), updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
 CHECK(employee_id <> supervisor_employee_id)
);
CREATE INDEX idx_hierarchy_supervisor ON employee_hierarchy(supervisor_employee_id);
CREATE TABLE organization_charts (
 id TEXT PRIMARY KEY, company_id TEXT NOT NULL UNIQUE REFERENCES companies(id), name TEXT NOT NULL,
 created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP, updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE chart_drafts (
 id TEXT PRIMARY KEY, chart_id TEXT NOT NULL REFERENCES organization_charts(id),
 base_version_id TEXT REFERENCES chart_versions(id), name TEXT NOT NULL,
 content_revision INTEGER NOT NULL DEFAULT 0,
 created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP, updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE chart_nodes (
 id TEXT NOT NULL, draft_id TEXT NOT NULL REFERENCES chart_drafts(id) ON DELETE CASCADE,
 employee_id TEXT REFERENCES employees(id), node_type TEXT NOT NULL,
 title TEXT NOT NULL, subtitle TEXT NOT NULL, position_x REAL NOT NULL, position_y REAL NOT NULL,
 width REAL NOT NULL, height REAL NOT NULL, style_json TEXT NOT NULL,
 metadata_json TEXT NOT NULL, sibling_order INTEGER NOT NULL, collapsed INTEGER NOT NULL,
 PRIMARY KEY(draft_id,id)
);
CREATE TABLE chart_edges (
 id TEXT NOT NULL, draft_id TEXT NOT NULL REFERENCES chart_drafts(id) ON DELETE CASCADE,
 source_node_id TEXT NOT NULL, target_node_id TEXT NOT NULL, style_json TEXT NOT NULL,
 PRIMARY KEY(draft_id,id), UNIQUE(draft_id,source_node_id,target_node_id), UNIQUE(draft_id,target_node_id),
 FOREIGN KEY(draft_id,source_node_id) REFERENCES chart_nodes(draft_id,id),
 FOREIGN KEY(draft_id,target_node_id) REFERENCES chart_nodes(draft_id,id),
 CHECK(source_node_id <> target_node_id)
);
CREATE TABLE chart_versions (
 id TEXT PRIMARY KEY, chart_id TEXT NOT NULL REFERENCES organization_charts(id), version_number INTEGER NOT NULL,
 source_draft_id TEXT REFERENCES chart_drafts(id), snapshot_json TEXT NOT NULL,
 published_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP, UNIQUE(chart_id,version_number)
);
CREATE TRIGGER versions_no_update BEFORE UPDATE ON chart_versions BEGIN SELECT RAISE(ABORT,'Published versions are immutable'); END;
CREATE TRIGGER versions_no_delete BEFORE DELETE ON chart_versions BEGIN SELECT RAISE(ABORT,'Published versions are immutable'); END;
CREATE TABLE import_issues (
 id INTEGER PRIMARY KEY, import_batch_id TEXT NOT NULL REFERENCES import_batches(id),
 sheet TEXT NOT NULL, row_number INTEGER, severity TEXT NOT NULL, code TEXT NOT NULL, message TEXT NOT NULL
);
CREATE INDEX idx_issues_batch ON import_issues(import_batch_id);
