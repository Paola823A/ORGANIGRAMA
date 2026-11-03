import { test } from "node:test";
import assert from "node:assert/strict";
import { useEditor } from "../../frontend/src/composables/useEditor.js";
import { autoLayout, reflowVisibleGraph } from "../../frontend/src/services/layout.js";
import { manualNode } from "./helpers.js";
import { cardTextColor, cardTextStyle, connectionAnchor, groupBaseStyle } from "../../frontend/src/services/cardStyle.js";
import { applyBrandTheme, AUTRISA_BLUE } from "../../shared/theme.js";
import { editorShortcut } from "../../frontend/src/services/editorShortcuts.js";
import { compactJunctions, countPeople, isGroupingNode, subordinateCounts } from "../../shared/graph.js";
import { moveGraphNode, slidePosition } from "../../frontend/src/services/graphMovement.js";
import { visibleGraph } from "../../shared/graph.js";
import { graphBounds } from "../../frontend/src/services/exportGeometry.js";
import { cardContent } from "../../frontend/src/services/cardContent.js";
import { companyChoices } from "../../frontend/src/services/companyChoices.js";
import { restoreCompactedPoint } from "../../frontend/src/services/compactLayout.js";
test("Ctrl + clic: añade, quita y mueve la selección completa en una sola operación deshacible", () => {
  const editor = useEditor();
  const graph = { nodes: [manualNode("a", { position: { x: 10, y: 20 } }), manualNode("b", { position: { x: 300, y: 80 } }), manualNode("c")],
    edges: [{ id: "edge", source: "a", target: "b" }] };
  editor.load(graph);
  editor.selectNode("a");
  editor.selectNode("b", true);
  assert.deepEqual([...editor.selectedIds.value], ["a", "b"]);
  assert.equal(editor.selectedId.value, null);
  assert.equal(editor.dirty.value, false);
  editor.moveNodes([{ id: "a", position: { x: 60, y: 120 } }, { id: "b", position: { x: 350, y: 180 } }]);
  assert.deepEqual(editor.graph.value.nodes[2], graph.nodes[2]);
  assert.deepEqual(editor.graph.value.edges, graph.edges);
  assert.equal(editor.past.value.length, 1);
  editor.undo();
  assert.deepEqual(editor.graph.value, graph);
  editor.redo();
  assert.deepEqual(editor.graph.value.nodes[1].position, { x: 350, y: 180 });
  editor.selectNode("b", true);
  assert.deepEqual([...editor.selectedIds.value], ["a"]);
  assert.equal(editor.selectedId.value, "a");
  editor.selectNode(null);
  assert.equal(editor.selectedIds.value.size, 0);
  editor.selectNode("c");
  assert.deepEqual([...editor.selectedIds.value], ["c"]);
  assert.throws(() => editor.moveNodes([{ id: "c", position: { x: Infinity, y: 0 } }]), /Posición/);
});
test("selección rectangular: reemplaza la selección con nodos válidos y permite moverlos juntos", () => {
  const editor = useEditor();
  editor.load({ nodes: [manualNode("a"), manualNode("b"), manualNode("c")], edges: [] });
  editor.selectNode("c");
  editor.selectNodes(["a", "b", "a", "missing"]);
  assert.deepEqual([...editor.selectedIds.value], ["a", "b"]);
  assert.equal(editor.selectedId.value, null);
  assert.equal(editor.dirty.value, false);
  editor.moveNodes([...editor.selectedIds.value].map((id) => ({ id, position: { x: 80, y: 40 } })));
  assert.deepEqual(editor.graph.value.nodes[0].position, { x: 80, y: 40 });
  assert.deepEqual(editor.graph.value.nodes[1].position, { x: 80, y: 40 });
  assert.deepEqual(editor.graph.value.nodes[2].position, { x: 0, y: 0 });
  editor.undo();
  assert.deepEqual(editor.graph.value.nodes[0].position, { x: 0, y: 0 });
  editor.selectNodes([]);
  assert.equal(editor.selectedIds.value.size, 0);
});
test("empresas: retira solo Seminuevos del selector sin modificar los registros de origen", () => {
  const companies = [{ id: "a", name: "AUTRISA" }, { id: "i", name: "INCAMOTORS" }, { id: "n", name: "NOVA AUTOS" }, { id: "s", name: "  seminuevos " }];
  assert.deepEqual(companyChoices(companies).map((company) => company.id), ["a", "i", "n"]);
  assert.equal(companies.length, 4);
});
function authoredColumn() {
  return { nodes: [
    manualNode("root", { position: { x: 400, y: 0 } }),
    manualNode("boss", { position: { x: 0, y: 200 } }),
    manualNode("assistant", { position: { x: 0, y: 400 } }),
    manualNode("stock", { position: { x: 0, y: 600 } }),
    manualNode("peer", { position: { x: 800, y: 600 } }),
    manualNode("point", { type: "JUNCTION", width: 8, height: 8, position: { x: 270, y: 730 } }),
  ], edges: [["root", "boss"], ["boss", "assistant"], ["root", "stock"], ["root", "peer"], ["root", "point"]].map(([source, target], i) => ({ id: String(i), source, target })) };
}
test("expansión: restaura el diseño completo sin solapamientos y vuelve al estado compacto", () => {
  const graph = { nodes: [
    manualNode("boss", { position: { x: 0, y: 100 } }),
    manualNode("child", { position: { x: 0, y: 250 } }),
    manualNode("below", { position: { x: 0, y: 450 } }),
    manualNode("peer", { position: { x: 500, y: 450 } }),
  ], edges: [{ id: "child-edge", source: "boss", target: "child" }] };
  const original = JSON.stringify(graph);
  const expanded = reflowVisibleGraph(graph);
  const at = (g, id) => g.nodes.find((node) => node.id === id);
  assert.ok(at(expanded, "below").position.y >= at(expanded, "child").position.y + at(expanded, "child").height + 18);
  for (const node of graph.nodes) assert.equal(at(expanded, node.id).position.x, node.position.x);
  assert.deepEqual(at(expanded, "peer").position, at(graph, "peer").position);
  const closed = reflowVisibleGraph(graph, {}, new Set(["boss"]));
  assert.ok(at(closed, "below").position.y < at(expanded, "below").position.y);
  assert.deepEqual(reflowVisibleGraph(graph), expanded);
  assert.deepEqual(reflowVisibleGraph(graph, {}, new Set(["boss"])), closed);
  assert.equal(JSON.stringify(graph), original);
});
test("marca Autrisa: aplica azul a bordes antiguos sin perder datos ni futuras personalizaciones", () => {
  const graph = { nodes: [manualNode("card"), manualNode("area", { type: "AREA" })], edges: [] };
  const themed = applyBrandTheme(graph);
  assert.equal(themed.nodes[0].style.borderColor, AUTRISA_BLUE);
  assert.equal(themed.nodes[1].style.textColor, AUTRISA_BLUE);
  assert.notEqual(graph.nodes[0].style.borderColor, AUTRISA_BLUE);
  const customized = { ...themed, nodes: themed.nodes.map((node) => ({ ...node, style: { ...node.style, borderColor: "#112233" } })) };
  assert.equal(applyBrandTheme(customized).nodes[0].style.borderColor, "#112233");
  for (const type of ["BUSINESS_LINE", "AREA"]) assert.deepEqual(groupBaseStyle({ type }), { borderBottomStyle: "double", borderBottomWidth: "4px" });
  for (const type of ["GROUP", "BRANCH", "CUSTOM"]) assert.deepEqual(groupBaseStyle({ type }), { borderBottomStyle: "solid", borderBottomWidth: "2px" });
});
test("compactación conjunta: conserva alineaciones entre columnas y restaura el diseño al expandir", () => {
  const graph = authoredColumn(), snapshot = JSON.stringify(graph);
  const closed = reflowVisibleGraph(graph, {}, new Set(["boss"]));
  const at = (g, id) => g.nodes.find((node) => node.id === id).position;
  assert.ok(at(closed, "root").x < at(graph, "root").x);
  assert.equal(at(closed, "root").y, at(graph, "root").y);
  assert.deepEqual(at(closed, "boss"), at(graph, "boss"));
  assert.equal(at(closed, "stock").x, 0);
  assert.ok(at(closed, "stock").y < at(graph, "stock").y);
  assert.equal(at(closed, "peer").y, at(closed, "stock").y);
  assert.ok(at(closed, "peer").x < at(graph, "peer").x);
  assert.ok(at(closed, "point").y < at(graph, "point").y);
  assert.deepEqual(reflowVisibleGraph(graph), graph);
  assert.deepEqual(reflowVisibleGraph(graph, {}, new Set(["boss"])), closed);
  assert.equal(JSON.stringify(graph), snapshot);
  assert.deepEqual(closed.edges.map(({ layoutPath, ...edge }) => edge), graph.edges);
});
test("compactación: mantiene una fila ocupada por otra tarjeta y acumula múltiples huecos sin solapamientos", () => {
  const graph = authoredColumn();
  graph.nodes.push(manualNode("same-row", { position: { x: 5, y: 400 } }));
  assert.deepEqual(reflowVisibleGraph(graph, {}, new Set(["boss"])).nodes.find((n) => n.id === "stock").position, { x: 0, y: 600 });
  const two = authoredColumn();
  two.nodes.push(manualNode("assistant2", { position: { x: 0, y: 800 } }), manualNode("bottom", { position: { x: 0, y: 1000 } }));
  two.edges.push({ id: "extra", source: "boss", target: "assistant2" }, { id: "bottom-edge", source: "root", target: "bottom" });
  const compact = reflowVisibleGraph(two, {}, new Set(["boss"]));
  assert.equal(compact.nodes.find((n) => n.id === "bottom").position.x, 0);
  assert.ok(compact.nodes.find((n) => n.id === "bottom").position.y < 1000);
  assert.ok(compact.nodes.find((n) => n.id === "bottom").position.y > compact.nodes.find((n) => n.id === "stock").position.y + 110);
});
test("compactación en ambos ejes: no mezcla ramas, conserva tamaños y desplaza los trazados con las tarjetas", () => {
  const node = (id, x, y, branch = "shown") => manualNode(id, { position: { x, y }, metadata: { branch } });
  const style = { color: "#30306c", width: 1.5, lineType: "solid", sourceHandle: "source-right", targetHandle: "target-left" };
  const graph = { nodes: [node("a", 0, 0), node("b", 700, 0), node("c", 0, 400), node("d", 700, 400), node("hidden", 350, 200, "hidden")],
    edges: [{ id: "top", source: "a", target: "b", style }, { id: "bottom", source: "c", target: "d", style }] };
  const snapshot = JSON.stringify(graph);
  const compact = reflowVisibleGraph(graph, { branch: "shown" });
  const at = (id) => compact.nodes.find((item) => item.id === id);
  assert.ok(at("b").position.x < 700);
  assert.ok(at("c").position.y < 400);
  const restored = restoreCompactedPoint(graph, { branch: "shown" }, new Set(), at("d").position);
  assert.ok(Math.abs(restored.x - 700) < 1e-8 && Math.abs(restored.y - 400) < 1e-8);
  assert.equal(at("a").position.y, at("b").position.y);
  assert.equal(at("c").position.y, at("d").position.y);
  assert.equal(at("a").position.x, at("c").position.x);
  assert.equal(at("b").position.x, at("d").position.x);
  assert.ok(at("b").position.x > at("a").position.x + at("a").width);
  assert.ok(at("c").position.y > at("a").position.y + at("a").height);
  for (const item of compact.nodes) assert.equal(item.width, 252);
  for (const edge of compact.edges) {
    const points = edge.layoutPath.match(/-?\d+(?:\.\d+)?/g).map(Number);
    assert.equal(points[0], at(edge.source).position.x + at(edge.source).width);
    assert.equal(points[1], at(edge.source).position.y + at(edge.source).height / 2);
    assert.equal(points.at(-2), at(edge.target).position.x);
    assert.equal(points.at(-1), at(edge.target).position.y + at(edge.target).height / 2);
    const ys = points.filter((_, index) => index % 2);
    assert.ok(ys.every((y) => y === ys[0]));
  }
  assert.notEqual(compact.edges[0].layoutPath.match(/-?\d+(?:\.\d+)?/g)[1], compact.edges[1].layoutPath.match(/-?\d+(?:\.\d+)?/g)[1]);
  assert.equal(JSON.stringify(graph), snapshot);
  assert.deepEqual(reflowVisibleGraph(graph), graph);
});
test("jefes contraídos: libera separación horizontal aunque el subordinado esté debajo del jefe", () => {
  const graph = { nodes: [manualNode("boss", { position: { x: 0, y: 0 } }),
    manualNode("child", { position: { x: 0, y: 200 } }),
    manualNode("peer", { position: { x: 900, y: 0 } })],
    edges: [{ id: "report", source: "boss", target: "child" }] };
  const closed = reflowVisibleGraph(graph, {}, new Set(["boss"]));
  assert.equal(closed.nodes[2].position.x, graph.nodes[0].width + 48);
  assert.equal(closed.nodes[2].position.y, 0);
  assert.deepEqual(reflowVisibleGraph(graph), graph);
  assert.deepEqual(restoreCompactedPoint(graph, {}, new Set(["boss"]), closed.nodes[2].position), graph.nodes[2].position);
});
test("tarjeta: muestra puesto, nombre, área y sede, y permite ocultar el nombre", () => {
  const node = manualNode("n", { type: "EMPLOYEE", employeeId: "e", title: "Ana Pérez", subtitle: "Jefe de Gestión Humana", metadata: { area: "Gestión Humana", branch: "Arequipa" } });
  assert.deepEqual(cardContent(node), { heading: "Jefe de Gestión Humana", name: "Ana Pérez", area: "Área: Gestión Humana", branch: "Arequipa" });
  assert.equal(cardContent(node, false).name, "");
  assert.equal(cardContent(manualNode("group")).heading, "Grupo");
});
test("colapso: no sobrescribe el diseño guardado y permite expandir o deshacer sin perder posiciones", () => {
  const graph = authoredColumn();
  const editor = useEditor();
  editor.load(graph);
  editor.updateNode({ ...editor.graph.value.nodes.find((node) => node.id === "boss"), collapsed: true });
  const compact = visibleGraph(reflowVisibleGraph(editor.graph.value, {}, new Set(["boss"])), {}, new Set(["boss"]));
  assert.ok(!compact.nodes.some((node) => node.id === "assistant"));
  for (const node of graph.nodes) assert.deepEqual(editor.graph.value.nodes.find((item) => item.id === node.id).position, node.position);
  assert.deepEqual(editor.graph.value.nodes.find((node) => node.id === "root").position, graph.nodes.find((node) => node.id === "root").position);
  assert.equal(editor.graph.value.nodes.length, graph.nodes.length);
  assert.deepEqual(editor.graph.value.edges, graph.edges);
  editor.undo();
  assert.deepEqual(editor.graph.value, graph);
  editor.redo();
  editor.updateNode({ ...editor.graph.value.nodes.find((node) => node.id === "boss"), collapsed: false });
  assert.deepEqual(reflowVisibleGraph(editor.graph.value), graph);
  const published = reflowVisibleGraph(graph, {}, new Set(["root"]));
  assert.equal(visibleGraph(published, {}, new Set(["root"])).nodes.length, 1);
  assert.equal(graph.nodes.find((node) => node.id === "boss").collapsed, false);
});
test("movimiento: arrastre normal conserva extremos; deslizamiento mantiene ramas fijas en un solo paso deshacible", () => {
  const editor = useEditor();
  const graph = { nodes: [manualNode("a"), manualNode("b", { position: { x: 0, y: 300 } }), manualNode("c", { position: { x: 400, y: 300 } })],
    edges: [{ id: "1", source: "a", target: "b" }, { id: "2", source: "a", target: "c" }] };
  editor.load(graph);
  editor.moveNode("a", { x: 50, y: 50 });
  assert.equal(editor.graph.value.nodes.length, 3);
  assert.deepEqual(editor.graph.value.edges, graph.edges);
  editor.undo();
  editor.moveNode("a", { x: 50, y: 50 }, true);
  const next = editor.graph.value;
  assert.deepEqual(next.nodes[0].position, { x: 0, y: 50 });
  assert.deepEqual(next.nodes[1].position, graph.nodes[1].position);
  assert.deepEqual(next.nodes[2].position, graph.nodes[2].position);
  const point = next.nodes.find((node) => node.type === "JUNCTION");
  assert.deepEqual(point.position, { x: 122, y: 106 });
  assert.equal(next.edges.filter((edge) => edge.source === point.id).length, 2);
  const movedAgain = moveGraphNode(next, "a", { x: 200, y: 100 }, true);
  assert.equal(movedAgain.nodes.length, next.nodes.length);
  assert.deepEqual(movedAgain.nodes.find((node) => node.id === point.id).position, point.position);
  editor.undo();
  assert.deepEqual(editor.graph.value, graph);
  editor.redo();
  assert.deepEqual(editor.graph.value, next);
  assert.equal(moveGraphNode(graph, "a", { x: 100, y: 0 }, true), graph);
});
test("deslizamiento lateral: conserva el eje de la línea de entrada", () => {
  const graph = { nodes: [manualNode("a"), manualNode("b", { position: { x: 500, y: 200 } })],
    edges: [{ id: "1", source: "a", target: "b", style: { sourceHandle: "source-right", targetHandle: "target-left" } }] };
  assert.deepEqual(slidePosition(graph, "b", { x: 700, y: 900 }), { x: 700, y: 200 });
});
test("uniones: divide líneas, conserva extremos laterales y estilo, permite ramas y deshacer", () => {
  const editor = useEditor();
  editor.load({ nodes: [manualNode("a"), manualNode("b"), manualNode("c")], edges: [] });
  editor.connect({ source: "a", target: "b", sourceHandle: "source-right", targetHandle: "target-left" });
  const edge = editor.graph.value.edges[0];
  editor.splitEdge(edge.id, { x: 300, y: 200 }, "down");
  const junction = editor.graph.value.nodes.find((n) => n.type === "JUNCTION");
  assert.equal(editor.graph.value.edges.length, 2);
  assert.equal(editor.graph.value.edges[0].style.sourceHandle, "source-right");
  assert.equal(editor.graph.value.edges[1].style.targetHandle, "target-left");
  assert.deepEqual(junction.position, { x: 296, y: 196 });
  editor.connect({ source: junction.id, target: "c", sourceHandle: "source-right", targetHandle: "target-left" });
  assert.equal(editor.graph.value.edges.length, 3);
  assert.throws(() => editor.connect({ source: "b", target: "a" }), /ciclo/);
  editor.undo();
  editor.undo();
  assert.equal(editor.graph.value.nodes.length, 3);
  assert.deepEqual(editor.graph.value.edges, [edge]);
  editor.redo();
  assert.equal(editor.graph.value.nodes[3].type, "JUNCTION");
});
test("texto y exportación: formatos combinados y anclajes coinciden con los laterales", () => {
  const style = cardTextStyle({ bold: false, italic: true, strikethrough: true, textAlign: "center" });
  assert.equal(style.textAlign, "center");
  assert.equal(style["--card-weight"], "400");
  assert.equal(style["--card-font-style"], "italic");
  assert.equal(style["--card-decoration"], "line-through");
  const node = manualNode("n", { position: { x: 10, y: 20 }, width: 200, height: 100 });
  assert.deepEqual(connectionAnchor(node, "source-right", "bottom"), { x: 210, y: 70, side: "right" });
  assert.deepEqual(connectionAnchor(node, "target-left", "top"), { x: 10, y: 70, side: "left" });
});
test("conectores compartidos: entrada y salida se guardan con sus roles y uniones antiguas conservan el centro", () => {
  const editor = useEditor();
  editor.load({ nodes: [manualNode("a"), manualNode("b")], edges: [] });
  editor.connect({ source: "a", target: "b", sourceHandle: "source-right", targetHandle: "source-left" });
  assert.equal(editor.graph.value.edges[0].style.targetHandle, "target-left");
  const graph = { nodes: [manualNode("point", { type: "JUNCTION", width: 16, height: 16, position: { x: 100, y: 100 } })], edges: [] };
  const compact = compactJunctions(graph);
  assert.equal(compact.nodes[0].width, 8);
  assert.deepEqual(compact.nodes[0].position, { x: 104, y: 104 });
  assert.deepEqual(compactJunctions(compact), compact);
  assert.equal(graph.nodes[0].width, 16);
});
test("editor: duplicación visual independiente, undo/redo y límite de historial", () => {
  const editor = useEditor();
  editor.load({
    nodes: [manualNode("a", { employeeId: "employee-1", type: "EMPLOYEE" })],
    edges: [],
  });
  editor.selectedId.value = "a";
  editor.duplicate();
  assert.equal(editor.graph.value.nodes.length, 2);
    assert.equal(editor.graph.value.nodes[1].employeeId, "employee-1");
    assert.equal(editor.graph.value.nodes[1].type, "EMPLOYEE");
    assert.equal(editor.graph.value.nodes[1].metadata.visualOnly, true);
    assert.equal(countPeople(editor.graph.value), 1);
  assert.equal(editor.graph.value.edges.length, 0);
  assert.equal(editor.dirty.value, true);
  editor.undo();
  assert.equal(editor.graph.value.nodes.length, 1);
  assert.equal(editor.dirty.value, false);
  editor.redo();
  assert.equal(editor.graph.value.nodes.length, 2);
  for (let i = 0; i < 60; i++)
    editor.updateNode({
      ...editor.graph.value.nodes[0],
      title: `Edición ${i}`,
    });
  assert.equal(editor.past.value.length, 40);
});
test("contadores: vacantes, agrupadores y duplicados no suman personal adicional", () => {
  const employee = manualNode("employee", { type: "EMPLOYEE", employeeId: "person-1", subtitle: "Auditor" });
  const nodes = [manualNode("heading", { type: "BUSINESS_LINE" }), employee, { ...employee, id: "copy" },
    manualNode("vacant", { type: "POSITION" }), manualNode("site", { type: "BRANCH" }), manualNode("area", { type: "AREA" }), manualNode("custom", { type: "CUSTOM" })];
  const graph = { nodes, edges: nodes.slice(1).map((node) => ({ id: node.id, source: "heading", target: node.id })) };
  assert.equal(countPeople(graph), 1);
  assert.equal(subordinateCounts(graph).get("heading"), 1);
  for (const type of ["BUSINESS_LINE", "BRANCH", "AREA", "GROUP", "CUSTOM"]) assert.equal(isGroupingNode({ type }), true);
  for (const type of ["EMPLOYEE", "POSITION", "JUNCTION"]) assert.equal(isGroupingNode({ type }), false);
});
test("copia visual: conserva la persona, admite otra sede y no cuenta incluso si el original está oculto o se elimina", () => {
  const editor = useEditor();
  const person = manualNode("marilia", { type: "EMPLOYEE", employeeId: "person-1", title: "Marilia Soto", subtitle: "Jefa", metadata: { branch: "Arequipa", area: "Ventas", employmentStatus: "ACTIVE" } });
  editor.load({ nodes: [manualNode("boss"), person], edges: [{ id: "edge", source: "boss", target: person.id }] });
  editor.selectNode(person.id);
  const [duplicate] = editor.duplicate();
  assert.equal(duplicate.title, person.title);
  assert.equal(duplicate.subtitle, person.subtitle);
  editor.updateNode({ ...duplicate, metadata: { ...duplicate.metadata, branch: "Juliaca" } });
  const copyOnly = visibleGraph(editor.graph.value, { branch: "Juliaca" });
  assert.equal(copyOnly.nodes.length, 1);
  assert.equal(countPeople(copyOnly), 0);
  assert.equal(countPeople(editor.graph.value), 1);
  editor.selectNode(person.id);
  editor.remove();
  assert.equal(countPeople(editor.graph.value), 0);
  assert.equal(subordinateCounts(editor.graph.value).get("boss"), 0);
});
test("portapapeles: pega selecciones con conexiones internas, IDs nuevos y permite eliminar y deshacer el grupo", () => {
  const editor = useEditor();
  const nodes = [manualNode("heading", { type: "BRANCH" }), manualNode("person", { type: "EMPLOYEE", employeeId: "employee-1" }), manualNode("outside")];
  editor.load({ nodes, edges: [{ id: "internal", source: "heading", target: "person" }, { id: "external", source: "outside", target: "heading" }] });
  editor.selectNodes(["heading", "person"]);
  assert.equal(editor.copySelection(), 2);
  const copies = editor.paste();
  assert.equal(copies.length, 2);
  assert.equal(editor.graph.value.edges.length, 3);
  assert.equal(editor.graph.value.edges.at(-1).source, copies[0].id);
  assert.equal(editor.graph.value.edges.at(-1).target, copies[1].id);
  assert.equal(copies[1].metadata.visualOnly, true);
  assert.equal(countPeople(editor.graph.value), 1);
  const secondCopies = editor.paste();
  assert.notEqual(copies[0].id, secondCopies[0].id);
  editor.remove();
  assert.equal(editor.graph.value.nodes.length, 5);
  editor.undo();
  assert.equal(editor.graph.value.nodes.length, 7);
  editor.undo();
  assert.equal(editor.graph.value.nodes.length, 5);
  editor.undo();
  assert.deepEqual(editor.graph.value.nodes, nodes);
});
test("atajos: Ctrl+C, Ctrl+V y Supr respetan campos de texto y no repiten borrados", () => {
  assert.equal(editorShortcut({ key: "c", ctrlKey: true }), "copy");
  assert.equal(editorShortcut({ key: "V", ctrlKey: true }), "paste");
  assert.equal(editorShortcut({ key: "Delete" }), "remove");
  assert.equal(editorShortcut({ key: "v", ctrlKey: true }, true), null);
  assert.equal(editorShortcut({ key: "Delete" }, true), null);
  assert.equal(editorShortcut({ key: "Delete", repeat: true }), null);
  assert.equal(editorShortcut({ key: "Backspace" }), null);
});
test("cesados: texto rojo automático, también en copias, sin alterar colores de personal activo", () => {
  const node = manualNode("n", { type: "EMPLOYEE", employeeId: "e", metadata: { employmentStatus: "CEASED" } });
  assert.equal(cardTextColor(node), "#c62828");
  assert.equal(cardTextColor({ ...node, metadata: { ...node.metadata, visualOnly: true } }), "#c62828");
  assert.equal(cardTextColor({ ...node, metadata: { employmentStatus: "ACTIVE" } }), node.style.textColor);
});
test("Dagre: respeta conexiones y orden de hermanas; distribución de rama conserva nodos exteriores", () => {
  const graph = {
    nodes: [
      manualNode("a"),
      manualNode("b", { siblingOrder: 2 }),
      manualNode("c", { siblingOrder: 1 }),
      manualNode("outside", { position: { x: 12000, y: 543 } }),
    ],
    edges: [
      { id: "1", source: "a", target: "b" },
      { id: "2", source: "a", target: "c" },
    ],
  };
  const next = autoLayout(graph, "a");
  assert.deepEqual(next.edges, graph.edges);
  assert.deepEqual(next.nodes.find((n) => n.id === "outside").position, {
    x: 12000,
    y: 543,
  });
  assert.deepEqual(
    next.nodes.find((n) => n.id === "a").position,
    graph.nodes[0].position,
  );
  assert.ok(
    next.nodes.find((n) => n.id === "b").position.y > next.nodes[0].position.y,
  );
  assert.ok(
    next.nodes.find((n) => n.id === "c").position.x <
      next.nodes.find((n) => n.id === "b").position.x,
  );
});
