import { connectionAnchor } from "./cardStyle.js";

export function slidePosition(graph, id, position) {
  const node = graph.nodes.find((item) => item.id === id);
  if (!node || node.type === "JUNCTION") return position;
  const incoming = graph.edges.find((edge) => edge.target === id);
  const outgoing = graph.edges.find((edge) => edge.source === id);
  const handle = incoming?.style?.targetHandle || outgoing?.style?.sourceHandle || "target-top";
  const horizontal = handle.endsWith("left") || handle.endsWith("right");
  return horizontal ? { x: position.x, y: node.position.y } : { x: node.position.x, y: position.y };
}

// Keep the existing lower branches anchored while moving only the card.
export function anchorOutgoingLines(graph, id) {
  const node = graph.nodes.find((item) => item.id === id);
  if (!node || node.type === "JUNCTION") return graph;
  const byId = new Map(graph.nodes.map((item) => [item.id, item]));
  const anchors = new Map(), points = [], bridges = [];
  const opposite = { top: "bottom", bottom: "top", left: "right", right: "left" };
  const edges = graph.edges.map((edge) => {
    if (edge.source !== id || byId.get(edge.target)?.type === "JUNCTION") return edge;
    const handle = edge.style?.sourceHandle || "source-bottom";
    if (!anchors.has(handle)) {
      const point = connectionAnchor(node, handle, "bottom"), pointId = crypto.randomUUID();
      anchors.set(handle, pointId);
      points.push({
        id: pointId, type: "JUNCTION", employeeId: null, title: "Punto de unión", subtitle: "",
        position: { x: point.x - 4, y: point.y - 4 }, width: 8, height: 8,
        siblingOrder: graph.nodes.length + points.length, collapsed: false, metadata: {},
        style: { backgroundColor: edge.style?.color || "#94a3b8", borderColor: edge.style?.color || "#94a3b8", textColor: "#243247", borderStyle: "solid" },
      });
      bridges.push({ id: crypto.randomUUID(), source: id, target: pointId,
        style: { color: "#94a3b8", width: 1.5, lineType: "solid", ...edge.style,
          sourceHandle: handle, targetHandle: `target-${opposite[point.side]}` } });
    }
    return { ...edge, source: anchors.get(handle) };
  });
  return { ...graph, nodes: [...graph.nodes, ...points], edges: [...edges, ...bridges] };
}

export function moveGraphNode(graph, id, position, slide = false) {
  const node = graph.nodes.find((item) => item.id === id);
  if (!node) return graph;
  const nextPosition = slide ? slidePosition(graph, id, position) : position;
  if (node.position.x === nextPosition.x && node.position.y === nextPosition.y) return graph;
  const base = slide ? anchorOutgoingLines(graph, id) : graph;
  return { ...base, nodes: base.nodes.map((item) => item.id === id ? { ...item, position: nextPosition } : item) };
}
