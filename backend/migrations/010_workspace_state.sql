-- Additive: existing metadata and snapshots remain intact for compatibility.
ALTER TABLE chart_drafts ADD COLUMN workspace_state_json TEXT;
