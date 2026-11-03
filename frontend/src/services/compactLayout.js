import { getSmoothStepPath } from "@vue-flow/core";
import { visibleGraph } from "../../../shared/graph.js";
import { connectionAnchor } from "./cardStyle.js";

function mergedIntervals(intervals) {
  const result = [];
  for (const interval of intervals.sort((a, b) => a.start - b.start)) {
    const last = result.at(-1);
    if (last && interval.start <= last.end) last.end = Math.max(last.end, interval.end);
    else result.push({ ...interval });
  }
  return result;
}

// One strictly increasing coordinate transform for the whole drawing, not a
// separate packing rule per column. Visible cards protect their entire footprint.
function compactAxis(nodes, visibleIds, axis) {
  const size = axis === "x" ? "width" : "height";
  const interval = (node) => ({ start: node.position[axis], end: node.position[axis] + node[size] });
  const occupied = mergedIntervals(nodes.filter((node) => visibleIds.has(node.id)).map(interval));
  const hidden = mergedIntervals(nodes.filter((node) => !visibleIds.has(node.id) && node.type !== "JUNCTION").map(interval));
  const gaps = [];
  for (let i = 1; i < occupied.length; i++) {
    const start = occupied[i - 1].end, end = occupied[i].start, length = end - start;
    const hiddenSpace = hidden.reduce((sum, item) => sum + Math.max(0, Math.min(end, item.end) - Math.max(start, item.start)), 0);
    // Hidden reports often sit directly below their manager, not inside the
    // horizontal gap. Their reserved width must still be released. Apply the
    // same transform across every row so columns and routed lines stay ordered.
    const horizontal = axis === "x" && hidden.length > 0;
    if ((!horizontal && !hiddenSpace) || length <= 48) continue;
    const remove = horizontal ? length - 48 : Math.min(hiddenSpace + 24, length - 48, length * 0.8);
    gaps.push({ start, end, remove });
  }
  return {
    changed: gaps.length > 0,
    map: (coordinate) => coordinate - gaps.reduce((sum, gap) => sum + gap.remove * Math.max(0, Math.min(1, (coordinate - gap.start) / (gap.end - gap.start))), 0),
    unmap: (coordinate) => {
      let removed = 0;
      for (const gap of gaps) {
        const start = gap.start - removed, end = gap.end - removed - gap.remove;
        if (coordinate < start) return coordinate + removed;
        if (coordinate <= end) return gap.start + (coordinate - start) * (gap.end - gap.start) / (end - start);
        removed += gap.remove;
      }
      return coordinate + removed;
    },
  };
}

export function restoreCompactedPoint(graph, filters, collapsed, point) {
  const visibleIds = new Set(visibleGraph(graph, filters, collapsed).nodes.map((node) => node.id));
  return {
    x: compactAxis(graph.nodes, visibleIds, "x").unmap(point.x),
    y: compactAxis(graph.nodes, visibleIds, "y").unmap(point.y),
  };
}

function routePoints(source, target, edge) {
  const from = connectionAnchor(source, edge.style?.sourceHandle || "source-bottom", "bottom");
  const to = connectionAnchor(target, edge.style?.targetHandle || "target-top", "top");
  const path = getSmoothStepPath({ sourceX: from.x, sourceY: from.y, sourcePosition: from.side,
    targetX: to.x, targetY: to.y, targetPosition: to.side, borderRadius: 0 })[0];
  const tokens = path.match(/[MLQ]|-?\d+(?:\.\d+)?(?:e[-+]?\d+)?/gi) || [];
  const points = [];
  for (let i = 0; i < tokens.length;) {
    const command = tokens[i++], count = command === "Q" ? 4 : 2;
    // With radius zero a quadratic bend has identical control/end points.
    const x = Number(tokens[i + count - 2]), y = Number(tokens[i + count - 1]);
    points.push({ x, y });
    i += count;
  }
  return points;
}

export function compactWholeGraph(graph, filters = {}, collapsed = new Set()) {
  const visible = visibleGraph(graph, filters, collapsed);
  const visibleIds = new Set(visible.nodes.map((node) => node.id));
  if (!visible.nodes.length || visible.nodes.length === graph.nodes.length) return graph;
  const x = compactAxis(graph.nodes, visibleIds, "x"), y = compactAxis(graph.nodes, visibleIds, "y");
  if (!x.changed && !y.changed) return graph;
  const original = new Map(graph.nodes.map((node) => [node.id, node]));
  const visibleEdges = new Set(visible.edges.map((edge) => edge.id));
  return {
    ...graph,
    nodes: graph.nodes.map((node) => !visibleIds.has(node.id) ? node : {
      ...node, position: { x: x.map(node.position.x), y: y.map(node.position.y) },
    }),
    edges: graph.edges.map((edge) => {
      if (!visibleEdges.has(edge.id)) return edge;
      const points = routePoints(original.get(edge.source), original.get(edge.target), edge)
        .map((point) => ({ x: x.map(point.x), y: y.map(point.y) }));
      return { ...edge, layoutPath: points.map((point, index) => `${index ? "L" : "M"}${point.x} ${point.y}`).join("") };
    }),
  };
}
