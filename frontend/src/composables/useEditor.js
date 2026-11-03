import { computed, ref, shallowRef } from "vue";
import { compactJunctions, validateGraph } from "../../../shared/graph.js";
import { moveGraphNode } from "../services/graphMovement.js";
const copy = (value) => JSON.parse(JSON.stringify(value));
export function useEditor() {
  const graph = shallowRef({ nodes: [], edges: [] }),
    selectedId = ref(null),
    selectedIds = ref(new Set()),
    edgeId = ref(null),
    past = shallowRef([]),
    future = shallowRef([]),
    saved = ref(""),
    clipboard = shallowRef(null);
  let pasteCount = 0;
  const dirty = computed(() => JSON.stringify(graph.value) !== saved.value);
  const selected = computed(() =>
    graph.value.nodes.find((n) => n.id === selectedId.value),
  );
  function load(value) {
    graph.value = copy(compactJunctions({ nodes: value.nodes, edges: value.edges }));
    saved.value = JSON.stringify(graph.value);
    past.value = [];
    future.value = [];
    selectedId.value = null;
    selectedIds.value = new Set();
    edgeId.value = null;
  }
  function commit(value) {
    validateGraph(value);
    past.value = [...past.value.slice(-39), copy(graph.value)];
    future.value = [];
    graph.value = copy(value);
  }
  function undo() {
    if (!past.value.length) return;
    future.value = [...future.value, copy(graph.value)];
    graph.value = past.value.at(-1);
    past.value = past.value.slice(0, -1);
  }
  function redo() {
    if (!future.value.length) return;
    past.value = [...past.value, copy(graph.value)];
    graph.value = future.value.at(-1);
    future.value = future.value.slice(0, -1);
  }
  function updateNode(node) {
    const next = {
      ...graph.value,
      nodes: graph.value.nodes.map((n) => (n.id === node.id ? node : n)),
    };
    commit(next);
  }
  function addNode(node) {
    commit({ ...graph.value, nodes: [...graph.value.nodes, node] });
    selectNode(node.id);
  }
  function selectNode(id, additive = false) {
    const next = additive ? new Set(selectedIds.value) : new Set();
    if (id) {
      if (additive && next.has(id)) next.delete(id);
      else next.add(id);
    }
    selectedIds.value = next;
    selectedId.value = next.size === 1 ? [...next][0] : null;
    edgeId.value = null;
  }
  function selectNodes(ids) {
    const available = new Set(graph.value.nodes.map((node) => node.id));
    selectedIds.value = new Set(ids.filter((id) => available.has(id)));
    selectedId.value = selectedIds.value.size === 1 ? [...selectedIds.value][0] : null;
    edgeId.value = null;
  }
  function moveNodes(moves) {
    const positions = new Map(moves.map((move) => [move.id, move.position]));
    const changed = graph.value.nodes.some((node) => positions.has(node.id) &&
      (positions.get(node.id).x !== node.position.x || positions.get(node.id).y !== node.position.y));
    if (changed) commit({ ...graph.value, nodes: graph.value.nodes.map((node) =>
      positions.has(node.id) ? { ...node, position: positions.get(node.id) } : node,
    ) });
  }
  function moveNode(id, position, slide = false) {
    const next = moveGraphNode(graph.value, id, position, slide);
    if (next !== graph.value) commit(next);
  }
  function copySelection() {
    const ids = selectedIds.value.size ? selectedIds.value : new Set(selectedId.value ? [selectedId.value] : []);
    const nodes = graph.value.nodes.filter((node) => ids.has(node.id));
    if (!nodes.length) return 0;
    clipboard.value = copy({ nodes, edges: graph.value.edges.filter((edge) => ids.has(edge.source) && ids.has(edge.target)) });
    pasteCount = 0;
    return nodes.length;
  }
  function pasteSnapshot(snapshot, offset = 40) {
    if (!snapshot?.nodes.length) return [];
    const ids = new Map(snapshot.nodes.map((node) => [node.id, crypto.randomUUID()]));
    const nodes = copy(snapshot.nodes).map((node, index) => ({
      ...node, id: ids.get(node.id), collapsed: false, siblingOrder: graph.value.nodes.length + index,
      position: { x: node.position.x + offset, y: node.position.y + offset },
      metadata: { ...node.metadata, ...(node.type === "EMPLOYEE" ? { visualOnly: true } : {}) },
    }));
    const edges = copy(snapshot.edges).map((edge) => ({ ...edge, id: crypto.randomUUID(), source: ids.get(edge.source), target: ids.get(edge.target) }));
    commit({ ...graph.value, nodes: [...graph.value.nodes, ...nodes], edges: [...graph.value.edges, ...edges] });
    selectNodes(nodes.map((node) => node.id));
    return nodes;
  }
  function paste() {
    if (!clipboard.value) return [];
    return pasteSnapshot(clipboard.value, 40 * ++pasteCount);
  }
  function duplicate() {
    if (!selected.value) return [];
    return pasteSnapshot({ nodes: [selected.value], edges: [] });
  }
  function remove() {
    const ids = selectedIds.value.size ? selectedIds.value : new Set(selectedId.value ? [selectedId.value] : []);
    if (ids.size)
      commit({
        ...graph.value,
        nodes: graph.value.nodes.filter((n) => !ids.has(n.id)),
        edges: graph.value.edges.filter(
          (e) => !ids.has(e.source) && !ids.has(e.target),
        ),
      });
    else if (edgeId.value)
      commit({
        ...graph.value,
        edges: graph.value.edges.filter((e) => e.id !== edgeId.value),
      });
    selectedId.value = null;
    selectedIds.value = new Set();
    edgeId.value = null;
  }
  function connect(connection, replaceId = null) {
    const previous = graph.value.edges.find((edge) => edge.id === replaceId);
    const edge = {
      id: replaceId || crypto.randomUUID(),
      source: connection.source,
      target: connection.target,
      style: {
        color: "#94a3b8", width: 1.5, lineType: "solid", ...previous?.style,
        sourceHandle: (connection.sourceHandle || "source-bottom").replace("target-", "source-"),
        targetHandle: (connection.targetHandle || "target-top").replace("source-", "target-"),
      },
    };
    commit({
      ...graph.value,
      edges: [...graph.value.edges.filter((e) => e.id !== replaceId), edge],
    });
  }
  function splitEdge(connectionId, position, direction = "down") {
    const edge = graph.value.edges.find((item) => item.id === connectionId);
    if (!edge) throw new Error("La conexión ya no existe.");
    const id = crypto.randomUUID();
    const handles = {
      down: ["target-top", "source-bottom"], up: ["target-bottom", "source-top"],
      right: ["target-left", "source-right"], left: ["target-right", "source-left"],
    }[direction];
    const node = {
      id, type: "JUNCTION", employeeId: null, title: "Punto de unión", subtitle: "",
      position: { x: position.x - 4, y: position.y - 4 }, width: 8, height: 8,
      style: { backgroundColor: edge.style?.color || "#94a3b8", textColor: "#243247", borderColor: edge.style?.color || "#94a3b8", borderStyle: "solid" },
      metadata: {}, siblingOrder: graph.value.nodes.length, collapsed: false,
    };
    commit({
      nodes: [...graph.value.nodes, node],
      edges: graph.value.edges.flatMap((item) => item.id !== connectionId ? [item] : [
        { ...edge, target: id, style: { color: "#94a3b8", width: 1.5, lineType: "solid", ...edge.style, targetHandle: handles[0] } },
        { ...edge, id: crypto.randomUUID(), source: id, style: { color: "#94a3b8", width: 1.5, lineType: "solid", ...edge.style, sourceHandle: handles[1] } },
      ]),
    });
    selectNode(id);
    edgeId.value = null;
  }
  return {
    graph,
    selectedId,
    selectedIds,
    selectNode,
    selectNodes,
    edgeId,
    selected,
    dirty,
    past,
    future,
    saved,
    load,
    commit,
    undo,
    redo,
    updateNode,
    moveNode,
    moveNodes,
    addNode,
    duplicate,
    clipboard,
    copySelection,
    paste,
    remove,
    connect,
    splitEdge,
  };
}
