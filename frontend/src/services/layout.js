import dagre from "@dagrejs/dagre";
export { compactWholeGraph as reflowVisibleGraph } from "./compactLayout.js";
export function autoLayout(graph, rootId = null) {
  const selected = new Set();
  if (rootId) {
    const queue = [rootId];
    while (queue.length) {
      const id = queue.shift();
      if (selected.has(id)) continue;
      selected.add(id);
      graph.edges
        .filter((e) => e.source === id)
        .forEach((e) => queue.push(e.target));
    }
  } else graph.nodes.forEach((n) => selected.add(n.id));
  const g = new dagre.graphlib.Graph();
  g.setGraph({
    rankdir: "TB",
    nodesep: 45,
    ranksep: 85,
    marginx: 50,
    marginy: 50,
  });
  g.setDefaultEdgeLabel(() => ({}));
  graph.nodes
    .filter((n) => selected.has(n.id))
    .sort((a, b) => a.siblingOrder - b.siblingOrder)
    .forEach((n) => g.setNode(n.id, { width: n.width, height: n.height }));
  const order = new Map(graph.nodes.map((n) => [n.id, n.siblingOrder]));
  graph.edges
    .filter((e) => selected.has(e.source) && selected.has(e.target))
    .sort((a, b) => (order.get(a.target) || 0) - (order.get(b.target) || 0))
    .forEach((e) => g.setEdge(e.source, e.target));
  dagre.layout(g);
  const root = graph.nodes.find((n) => n.id === rootId),
    rootLayout = rootId ? g.node(rootId) : null;
  const offset =
    root && rootLayout
      ? {
          x: root.position.x - (rootLayout.x - root.width / 2),
          y: root.position.y - (rootLayout.y - root.height / 2),
        }
      : { x: 0, y: 0 };
  return {
    ...graph,
    nodes: graph.nodes.map((n) => {
      const p = g.node(n.id);
      return p
        ? {
            ...n,
            position: {
              x: p.x - n.width / 2 + offset.x,
              y: p.y - n.height / 2 + offset.y,
            },
          }
        : n;
    }),
  };
}
