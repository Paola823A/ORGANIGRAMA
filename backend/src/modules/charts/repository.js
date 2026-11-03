export function chartRepository(db) {
  function draft(id) {
    const d = db.prepare("SELECT * FROM chart_drafts WHERE id=?").get(id);
    if (!d) return null;
    const nodes = db
      .prepare(
        "SELECT * FROM chart_nodes WHERE draft_id=? ORDER BY sibling_order,id",
      )
      .all(id)
      .map((n) => ({
        id: n.id,
        type: n.node_type,
        employeeId: n.employee_id,
        title: n.title,
        subtitle: n.subtitle,
        position: { x: n.position_x, y: n.position_y },
        width: n.width,
        height: n.height,
        style: JSON.parse(n.style_json),
        metadata: JSON.parse(n.metadata_json),
        siblingOrder: n.sibling_order,
        collapsed: !!n.collapsed,
      }));
    const edges = db
      .prepare("SELECT * FROM chart_edges WHERE draft_id=?")
      .all(id)
      .map((e) => ({
        id: e.id,
        source: e.source_node_id,
        target: e.target_node_id,
        style: JSON.parse(e.style_json),
      }));
    return { ...d, nodes, edges };
  }
  function writeGraph(id, graph) {
    db.prepare("DELETE FROM chart_edges WHERE draft_id=?").run(id);
    db.prepare("DELETE FROM chart_nodes WHERE draft_id=?").run(id);
    const nodeStmt = db.prepare(
      "INSERT INTO chart_nodes(id,draft_id,employee_id,node_type,title,subtitle,position_x,position_y,width,height,style_json,metadata_json,sibling_order,collapsed) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)",
    );
    for (const n of graph.nodes)
      nodeStmt.run(
        n.id,
        id,
        n.employeeId || null,
        n.type,
        n.title,
        n.subtitle,
        n.position.x,
        n.position.y,
        n.width,
        n.height,
        JSON.stringify(n.style),
        JSON.stringify(n.metadata),
        n.siblingOrder,
        n.collapsed ? 1 : 0,
      );
    const edgeStmt = db.prepare(
      "INSERT INTO chart_edges(id,draft_id,source_node_id,target_node_id,style_json) VALUES (?,?,?,?,?)",
    );
    for (const e of graph.edges)
      edgeStmt.run(
        e.id,
        id,
        e.source,
        e.target,
        JSON.stringify(
          e.style || { color: "#94a3b8", width: 1.5, lineType: "solid" },
        ),
      );
  }
  return { draft, writeGraph };
}
