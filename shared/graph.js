export const NODE_TYPES = [
  "EMPLOYEE",
  "POSITION",
  "BUSINESS_LINE",
  "BRANCH",
  "AREA",
  "GROUP",
  "CUSTOM",
  "JUNCTION",
];
export const GROUPING_TYPES = ["BUSINESS_LINE", "BRANCH", "AREA", "GROUP", "CUSTOM"];
export function isGroupingNode(node) {
  return GROUPING_TYPES.includes(node?.type);
}
export function normalize(value = "") {
  return String(value)
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim()
    .replace(/\s+/g, " ")
    .toUpperCase();
}
export function countPeople(graph) {
  return new Set(
    graph.nodes
      .filter((node) => node.type === "EMPLOYEE" && node.employeeId && !node.metadata?.visualOnly && !['CEASED','ABSENT'].includes(node.metadata?.employmentStatus))
      .map((node) => node.employeeId),
  ).size;
}
export function subordinateCounts(graph) {
  const nodes = new Map(graph.nodes.map((node) => [node.id, node]));
  const children = new Map();
  for (const edge of graph.edges) {
    if (!children.has(edge.source)) children.set(edge.source, []);
    children.get(edge.source).push(edge.target);
  }
  return new Map(graph.nodes.map((boss) => {
    const people = new Set(), seen = new Set([boss.id]), queue = [...(children.get(boss.id) || [])];
    while (queue.length) {
      const id = queue.pop();
      if (seen.has(id)) continue;
      seen.add(id);
      const node = nodes.get(id);
      if (node?.type === "EMPLOYEE" && node.employeeId && !node.metadata?.visualOnly && !['CEASED','ABSENT'].includes(node.metadata?.employmentStatus) && node.employeeId !== boss.employeeId) people.add(node.employeeId);
      queue.push(...(children.get(id) || []));
    }
    return [boss.id, people.size];
  }));
}
export function compactJunctions(graph) {
  return { ...graph, nodes: graph.nodes.map((node) => node.type !== "JUNCTION" ? node : {
    ...node, width: 8, height: 8,
    position: { x: node.position.x + node.width / 2 - 4, y: node.position.y + node.height / 2 - 4 },
  }) };
}
export function validateGraph(graph) {
  if (!graph || !Array.isArray(graph.nodes) || !Array.isArray(graph.edges))
    throw new Error("El grafo requiere nodos y conexiones.");
  const { nodes, edges } = graph;
  if (nodes.length > 3000 || edges.length > 3000)
    throw new Error("El límite es 3000 tarjetas y 3000 conexiones.");
  const ids = new Set(),
    edgeIds = new Set(),
    pairs = new Set(),
    children = new Map(),
    indegree = new Map();
  for (const n of nodes) {
    if (typeof n.id !== "string" || !n.id || n.id.length > 100 || ids.has(n.id))
      throw new Error("Identificador de tarjeta inválido o repetido.");
    ids.add(n.id);
    indegree.set(n.id, 0);
    children.set(n.id, []);
    if (n.metadata?.visualOnly != null && typeof n.metadata.visualOnly !== "boolean")
      throw new Error("La marca de copia visual debe ser verdadera o falsa.");
    if (!NODE_TYPES.includes(n.type))
      throw new Error("Tipo de tarjeta inválido.");
    if (
      typeof n.title !== "string" ||
      n.title.length > 500 ||
      typeof n.subtitle !== "string" ||
      n.subtitle.length > 500
    )
      throw new Error("Los títulos deben tener hasta 500 caracteres.");
    if (
      ![n.position?.x, n.position?.y].every(
        (x) => Number.isFinite(x) && Math.abs(x) <= 1e7,
      )
    )
      throw new Error("Posición inválida.");
    if (
      ![n.width, n.height].every(
        (x) => Number.isFinite(x) && x >= (n.type === "JUNCTION" ? 8 : 60) && x <= 2000,
      )
    )
      throw new Error("Dimensiones inválidas.");
    if (!Number.isInteger(n.siblingOrder) || Math.abs(n.siblingOrder) > 100000)
      throw new Error("Orden inválido.");
    if (n.type === "EMPLOYEE" && !n.employeeId)
      throw new Error("La tarjeta de empleado requiere un empleado asociado.");
    if (n.employeeId != null && typeof n.employeeId !== "string")
      throw new Error("Empleado inválido.");
    const style = n.style || {};
    for (const key of ["backgroundColor", "textColor", "borderColor"])
      if (!/^#[0-9a-f]{6}$/i.test(style[key] || ""))
        throw new Error("Color inválido.");
    if (!["solid", "dashed"].includes(style.borderStyle))
      throw new Error("Borde inválido.");
    if (style.textAlign != null && !["left", "center", "right"].includes(style.textAlign))
      throw new Error("Alineación inválida.");
    for (const key of ["bold", "italic", "strikethrough"])
      if (style[key] != null && typeof style[key] !== "boolean")
        throw new Error("Formato de texto inválido.");
    if (
      !n.metadata ||
      typeof n.metadata !== "object" ||
      Array.isArray(n.metadata) ||
      JSON.stringify(n.metadata).length > 5000
    )
      throw new Error("Metadatos inválidos.");
  }
  for (const e of edges) {
    if (
      typeof e.id !== "string" ||
      !e.id ||
      e.id.length > 100 ||
      edgeIds.has(e.id)
    )
      throw new Error("Identificador de conexión inválido o repetido.");
    edgeIds.add(e.id);
    if (!ids.has(e.source) || !ids.has(e.target))
      throw new Error("La conexión apunta a una tarjeta inexistente.");
    if (e.source === e.target)
      throw new Error("Una tarjeta no puede conectarse consigo misma.");
    const pair = JSON.stringify([e.source, e.target, e.style?.sourceHandle || "source-bottom", e.style?.targetHandle || "target-top"]);
    if (pairs.has(pair)) throw new Error("No se permiten conexiones duplicadas entre los mismos puntos.");
    pairs.add(pair);
    children.get(e.source).push(e.target);
    indegree.set(e.target, indegree.get(e.target) + 1);
    if (
      e.style &&
      (!/^#[0-9a-f]{6}$/i.test(e.style.color) ||
        !Number.isFinite(e.style.width) ||
        e.style.width < 1 ||
        e.style.width > 10 ||
        !["solid", "dashed"].includes(e.style.lineType))
    )
      throw new Error("Estilo de conexión inválido.");
    for (const [key, prefix] of [["sourceHandle", "source"], ["targetHandle", "target"]])
      if (e.style?.[key] != null && !["top", "bottom", "left", "right"].some((side) => e.style[key] === `${prefix}-${side}`))
        throw new Error("Punto de conexión inválido.");
  }
  const queue = [...ids].filter((id) => indegree.get(id) === 0), depth = new Map(queue.map((id) => [id, 0]));
  for (let index = 0; index < queue.length; index++) {
    const id = queue[index];
    for (const child of children.get(id)) {
      const nextDepth = Math.max(depth.get(child) || 0, depth.get(id) + 1);
      if (nextDepth > 500) throw new Error("La profundidad máxima es 500 niveles.");
      depth.set(child, nextDepth);
      indegree.set(child, indegree.get(child) - 1);
      if (!indegree.get(child)) queue.push(child);
    }
  }
  if (queue.length !== ids.size) throw new Error("La conexión genera un ciclo.");
  return graph;
}
export function visibleGraph(graph, filters = {}, collapsed = new Set()) {
  const parents = new Map(), children = new Map();
  for (const edge of graph.edges) {
    if (!parents.has(edge.target)) parents.set(edge.target, []);
    parents.get(edge.target).push(edge.source);
    if (!children.has(edge.source)) children.set(edge.source, []);
    children.get(edge.source).push(edge.target);
  }
  const filtering = Object.values(filters).some(Boolean),
    included = new Set();
  for (const n of graph.nodes) {
    const match = Object.entries(filters).every(
      ([key, value]) =>
        !value || normalize(n.metadata?.[key]) === normalize(value),
    );
    if (!filtering || match) {
      const queue = [n.id];
      const seen = new Set();
      while (queue.length) {
        const id = queue.pop();
        if (seen.has(id)) continue;
        seen.add(id);
        included.add(id);
        queue.push(...(parents.get(id) || []));
      }
    }
  }
  const visible = new Set();
  const queue = [...included].filter((id) => !(parents.get(id) || []).some((parent) => included.has(parent)));
  while (queue.length) {
    const id = queue.pop();
    if (visible.has(id) || !included.has(id)) continue;
    visible.add(id);
    if (!collapsed.has(id)) queue.push(...(children.get(id) || []));
  }
  return {
    nodes: graph.nodes.filter((n) => visible.has(n.id)),
    edges: graph.edges.filter(
      (e) => visible.has(e.source) && visible.has(e.target) && !collapsed.has(e.source),
    ),
  };
}
export function graphAncestors(graph, nodeId) {
  const parents = new Map();
  for (const edge of graph.edges) {
    if (!parents.has(edge.target)) parents.set(edge.target, []);
    parents.get(edge.target).push(edge.source);
  }
  const result = new Set(), queue = [...(parents.get(nodeId) || [])];
  while (queue.length) {
    const id = queue.pop();
    if (result.has(id)) continue;
    result.add(id);
    queue.push(...(parents.get(id) || []));
  }
  return result;
}
