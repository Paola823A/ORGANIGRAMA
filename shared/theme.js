import { isGroupingNode } from "./graph.js";
export const AUTRISA_BLUE = "#30306c";

export function applyBrandTheme(graph) {
  return { ...graph, nodes: graph.nodes.map((node) => node.type === "JUNCTION" || node.metadata?.autrisaTheme === 1 ? node : {
    ...node,
    style: { ...node.style, borderColor: AUTRISA_BLUE, ...(isGroupingNode(node) ? { textColor: AUTRISA_BLUE } : {}) },
    metadata: { ...node.metadata, autrisaTheme: 1 },
  }) };
}
