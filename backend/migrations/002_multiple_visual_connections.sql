-- Preserve existing edges while removing the former one-parent restriction.
CREATE TABLE chart_edges_multiple (
 id TEXT NOT NULL, draft_id TEXT NOT NULL REFERENCES chart_drafts(id) ON DELETE CASCADE,
 source_node_id TEXT NOT NULL, target_node_id TEXT NOT NULL, style_json TEXT NOT NULL,
 PRIMARY KEY(draft_id,id),
 FOREIGN KEY(draft_id,source_node_id) REFERENCES chart_nodes(draft_id,id),
 FOREIGN KEY(draft_id,target_node_id) REFERENCES chart_nodes(draft_id,id),
 CHECK(source_node_id <> target_node_id)
);
INSERT INTO chart_edges_multiple SELECT id,draft_id,source_node_id,target_node_id,style_json FROM chart_edges;
DROP TABLE chart_edges;
ALTER TABLE chart_edges_multiple RENAME TO chart_edges;
CREATE INDEX idx_chart_edges_draft_target ON chart_edges(draft_id,target_node_id);
