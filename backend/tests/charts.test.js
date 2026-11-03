import { test } from "node:test";
import assert from "node:assert/strict";
import Database from "better-sqlite3";
import { readFileSync } from "node:fs";
import { openDatabase } from "../src/db/index.js";
import { importService } from "../src/modules/imports/service.js";
import { chartService } from "../src/modules/charts/service.js";
import { countPeople, graphAncestors, subordinateCounts, validateGraph, visibleGraph } from "../../shared/graph.js";
import { book, person, manualNode } from "./helpers.js";
function setup(legacy = false) {
  const db = legacy ? new Database(":memory:") : openDatabase(":memory:");
  if (legacy) {
    db.pragma("foreign_keys = ON");
    db.exec(readFileSync(new URL("../migrations/001_initial.sql", import.meta.url), "utf8"));
    for (const migration of ['003_users_permissions.sql','004_delegated_upload.sql','005_simplify_users.sql','006_permanent_passwords.sql','007_remove_published_versions.sql']) db.exec(readFileSync(new URL(`../migrations/${migration}`, import.meta.url),'utf8'));
  }
  const
    imports = importService(db);
  const p = imports.preview(
    book([
      person("00000001"),
      person("00000002", "00000001"),
      person("00000003", "", { company: "Empresa B" }),
    ]),
    "a.xlsm",
  );
  imports.confirm({ token: p.token });
  return {
    db,
    imports,
    charts: chartService(db),
    chartId: db
      .prepare(
        "SELECT o.id FROM organization_charts o JOIN companies c ON c.id=o.company_id WHERE c.name='Empresa A'",
      )
      .get().id,
  };
}
test("contador: personas únicas visibles al combinar filtros y contraer ramas", () => {
  const employee = (id, employeeId, metadata) =>
    manualNode(id, { type: "EMPLOYEE", employeeId, metadata });
  const graph = {
    nodes: [
      employee("boss", "boss-person", { branch: "Cusco" }),
      employee("a", "person-a", { branch: "Lima", businessLine: "Autos" }),
      employee("copy-a", "person-a", { branch: "Lima", businessLine: "Autos" }),
      employee("b", "person-b", { branch: "Lima", businessLine: "Taller" }),
      manualNode("vacancy", { type: "POSITION" }),
    ],
    edges: ["a", "copy-a", "b", "vacancy"].map((target) => ({
      id: target, source: "boss", target,
    })),
  };
  assert.equal(countPeople(visibleGraph(graph)), 3);
  assert.equal(countPeople(visibleGraph(graph, { branch: "Lima", businessLine: "Autos" })), 2);
  assert.equal(countPeople(visibleGraph(graph, {}, new Set(["boss"]))), 1);
  assert.equal(countPeople(visibleGraph(graph, { area: "Inexistente" })), 0);
});
test("personas a cargo: cuenta directas e indirectas sin duplicar personas ni contar uniones, vacantes o al jefe", () => {
  const employee = (id, employeeId) => manualNode(id, { type: "EMPLOYEE", employeeId });
  const graph = {
    nodes: [employee("boss", "chief"), employee("a", "person-a"), employee("copy-a", "person-a"), employee("b", "person-b"),
      employee("boss-copy", "chief"), manualNode("point", { type: "JUNCTION", width: 8, height: 8 }), manualNode("vacancy", { type: "POSITION" })],
    edges: [
      { id: "1", source: "boss", target: "a" }, { id: "2", source: "boss", target: "point" },
      { id: "3", source: "point", target: "copy-a" }, { id: "4", source: "a", target: "b" },
      { id: "5", source: "copy-a", target: "b" }, { id: "6", source: "point", target: "vacancy" },
      { id: "7", source: "point", target: "boss-copy" },
    ],
  };
  const counts = subordinateCounts(graph);
  assert.equal(counts.get("boss"), 2);
  assert.equal(counts.get("a"), 1);
  assert.equal(counts.get("b"), 0);
  assert.equal(counts.get("boss-copy"), 0);
  assert.deepEqual(visibleGraph(graph, {}, new Set(["boss"])).nodes.map((node) => node.id), ["boss"]);
  assert.equal(subordinateCounts(graph).get("boss"), 2);
});
test("grafo: rechaza autorreferencias, duplicados, ciclos y extremos inválidos; admite padres múltiples", () => {
  const nodes = ["a", "b", "c"].map((id) => manualNode(id));
  const edge = (id, source, target) => ({ id, source, target });
  for (const edges of [
    [edge("1", "a", "a")],
    [edge("1", "a", "b"), edge("2", "a", "b")],
    [edge("1", "a", "b"), edge("2", "b", "a")],
    [edge("1", "a", "missing")],
  ])
    assert.throws(() => validateGraph({ nodes, edges }));
  assert.doesNotThrow(() =>
    validateGraph({ nodes, edges: [edge("1", "a", "b")] }),
  );
  assert.doesNotThrow(() => validateGraph({ nodes, edges: [edge("1", "a", "c"), edge("2", "b", "c")] }));
});
test("borradores: posiciones, tarjetas manuales, duplicación y conexiones conservan jerarquía maestra", () => {
  const { db, charts, chartId } = setup();
  try {
    const before = db
      .prepare("SELECT * FROM employee_hierarchy ORDER BY employee_id")
      .all();
    let d = charts.createDraft(chartId, { mode: "master" });
    assert.equal(d.nodes.length, 2);
    assert.equal(d.edges.length, 1);
    const clone = { ...d.nodes[0], id: "clone", position: { x: 333, y: 444 } };
    d = charts.saveDraft(d.id, {
      ...d,
      nodes: [
        ...d.nodes,
        clone,
        manualNode("branch", { type: "BRANCH" }),
        manualNode("line", { type: "BUSINESS_LINE" }),
        manualNode("vacancy", { type: "POSITION" }),
      ],
      edges: [],
    });
    assert.equal(d.nodes.find((n) => n.id === "clone").position.x, 333);
    assert.equal(
      d.nodes.filter((n) => n.employeeId === clone.employeeId).length,
      2,
    );
    assert.deepEqual(
      db.prepare("SELECT * FROM employee_hierarchy ORDER BY employee_id").all(),
      before,
    );
    assert.equal(db.prepare("SELECT COUNT(*) n FROM employees").get().n, 3);
    assert.throws(
      () => charts.saveDraft(d.id, { ...d, content_revision: 0 }),
      /otra sesión/,
    );
  } finally {
    db.close();
  }
});
test("backend valida grafo al guardar y publicar", () => {
  const { db, charts, chartId } = setup();
  try {
    const d = charts.createDraft(chartId, { mode: "empty" });
    assert.throws(
      () =>
        charts.saveDraft(d.id, {
          ...d,
          nodes: [manualNode("a")],
          edges: [{ id: "e", source: "a", target: "a" }],
        }),
      /consigo/,
    );
    assert.throws(() => charts.publish(d.id, { content_revision: 0 }), /vacío/);
  } finally {
    db.close();
  }
});
test("copias visuales: guarda y publica la referencia de persona y su marca de exclusión del contador", () => {
  const { db, charts, chartId } = setup();
  try {
    const draft = charts.createDraft(chartId, { mode: "master" });
    const duplicate = { ...draft.nodes[0], id: "visual-copy", metadata: { ...draft.nodes[0].metadata, visualOnly: true, branch: "Juliaca" } };
    const saved = charts.saveDraft(draft.id, { ...draft, nodes: [...draft.nodes, duplicate] });
    const snapshot = charts.publish(saved.id, { content_revision: saved.content_revision }).snapshot;
    assert.equal(snapshot.nodes.find((node) => node.id === "visual-copy").metadata.visualOnly, true);
    assert.equal(snapshot.nodes.find((node) => node.id === "visual-copy").title, draft.nodes[0].title);
    assert.equal(countPeople(snapshot), 2);
    assert.equal(countPeople(visibleGraph(snapshot, { branch: "Juliaca" })), 0);
  } finally { db.close(); }
});
test("agrupadores: conserva tipo, encabezado, propiedades y conexiones al guardar y publicar sin sumar personal", () => {
  const { db, charts, chartId } = setup();
  try {
    const draft = charts.createDraft(chartId, { mode: "master" });
    const headings = ["BUSINESS_LINE", "BRANCH", "AREA", "CUSTOM", "GROUP"].map((type, index) => manualNode(`heading-${index}`, {
      type, title: `Encabezado ${type}`, subtitle: "Descripción editable", height: 60,
      style: { backgroundColor: "#fbfcfd", textColor: "#213f37", borderColor: "#91b7ab", borderStyle: "solid", textAlign: "center", italic: true },
    }));
    const saved = charts.saveDraft(draft.id, { ...draft, nodes: [...headings, ...draft.nodes], edges: [...draft.edges,
      ...headings.map((node, index) => ({ id: `heading-edge-${index}`, source: node.id, target: headings[index + 1]?.id || draft.nodes[0].id })),
    ] });
    assert.equal(countPeople(saved), 2);
    assert.equal(subordinateCounts(saved).get("heading-0"), 2);
    const snapshot = charts.publish(saved.id, { content_revision: saved.content_revision }).snapshot;
    assert.equal(snapshot.nodes.find((node) => node.id === "heading-0").title, "Encabezado BUSINESS_LINE");
    assert.equal(snapshot.nodes.find((node) => node.id === "heading-0").style.italic, true);
    assert.equal(snapshot.edges.length, saved.edges.length);
    assert.equal(countPeople(snapshot), 2);
  } finally { db.close(); }
});
test("conexiones múltiples: guarda varias entradas y diferentes laterales sin alterar jerarquía maestra", () => {
  const { db, charts, chartId } = setup();
  try {
    const before = db.prepare("SELECT * FROM employee_hierarchy ORDER BY employee_id").all();
    const draft = charts.createDraft(chartId, { mode: "empty" });
    const nodes = ["a", "b", "c"].map((id) => manualNode(id));
    const style = { color: "#94a3b8", width: 1.5, lineType: "solid" };
    const edges = [
      { id: "1", source: "a", target: "c", style },
      { id: "2", source: "b", target: "c", style },
      { id: "3", source: "a", target: "c", style: { ...style, sourceHandle: "source-right", targetHandle: "target-left" } },
    ];
    const saved = charts.saveDraft(draft.id, { ...draft, nodes, edges });
    assert.equal(charts.getDraft(draft.id).edges.length, 3);
    assert.equal(charts.publish(draft.id, { content_revision: saved.content_revision }).snapshot.edges.length, 3);
    assert.deepEqual(db.prepare("SELECT * FROM employee_hierarchy ORDER BY employee_id").all(), before);
    assert.throws(() => validateGraph({ nodes, edges: [...edges, { id: "cycle", source: "c", target: "a" }] }), /ciclo/);
  } finally { db.close(); }
});
test("migración: preserva las conexiones de borradores existentes y habilita más entradas", () => {
  const { db, charts, chartId } = setup(true);
  try {
    const draft = charts.createDraft(chartId, { mode: "master" });
    const before = charts.getDraft(draft.id);
    db.transaction(() => db.exec(readFileSync(new URL("../migrations/002_multiple_visual_connections.sql", import.meta.url), "utf8")))();
    assert.deepEqual(charts.getDraft(draft.id), before);
    const extra = manualNode("extra");
    const next = charts.saveDraft(draft.id, { ...before, nodes: [...before.nodes, extra],
      edges: [...before.edges, { id: "extra-edge", source: extra.id, target: before.edges[0].target }] });
    assert.equal(next.edges.length, 2);
    assert.deepEqual(db.pragma("foreign_key_check"), []);
  } finally { db.close(); }
});
test("filtros con varias entradas: conserva todos los ancestros y rutas abiertas al contraer", () => {
  const graph = { nodes: [manualNode("a"), manualNode("b"), manualNode("c", { metadata: { branch: "Lima" } }), manualNode("d")],
    edges: [{ id: "1", source: "a", target: "c" }, { id: "2", source: "b", target: "c" }, { id: "3", source: "c", target: "d" }] };
  assert.deepEqual([...graphAncestors(graph, "c")].sort(), ["a", "b"]);
  assert.deepEqual(visibleGraph(graph, { branch: "Lima" }).nodes.map((n) => n.id), ["a", "b", "c"]);
  const partlyCollapsed = visibleGraph(graph, {}, new Set(["a"]));
  assert.deepEqual(partlyCollapsed.nodes.map((n) => n.id), ["a", "b", "c", "d"]);
  assert.deepEqual(partlyCollapsed.edges.map((e) => e.id), ["2", "3"]);
  assert.deepEqual(visibleGraph(graph, {}, new Set(["a", "b"])).nodes.map((n) => n.id), ["a", "b"]);
});
test("persistencia: uniones, anclajes laterales y formato sobreviven guardado y publicación", () => {
  const { db, charts, chartId } = setup();
  try {
    const d = charts.createDraft(chartId, { mode: "empty" });
    const node = manualNode("card");
    node.style = { ...node.style, textAlign: "center", bold: true, italic: true, strikethrough: true };
    const point = manualNode("point", { type: "JUNCTION", width: 16, height: 16 });
    const edges = [{ id: "edge", source: "point", target: "card", style: {
      color: "#94a3b8", width: 1.5, lineType: "solid", sourceHandle: "source-right", targetHandle: "target-left",
    } }];
    const saved = charts.saveDraft(d.id, { ...d, nodes: [node, point], edges });
    assert.deepEqual(saved.nodes.find((n) => n.id === "card").style, node.style);
    assert.deepEqual(saved.edges, edges);
    const version = charts.publish(d.id, { content_revision: saved.content_revision });
    assert.deepEqual(version.snapshot.edges, edges);
    assert.equal(version.snapshot.nodes.find((n) => n.type === "JUNCTION").width, 16);
    assert.equal(version.snapshot.nodes.find((n) => n.id === "card").style.strikethrough, true);
  } finally { db.close(); }
});
test('versiones pasadas: se retiran sin borrar borradores ni reutilizar números; se protege la última',()=>{
  const {db,charts,chartId}=setup();
  try {
    const draft=charts.createDraft(chartId,{mode:'master'});
    const first=charts.publish(draft.id,{content_revision:0});
    const copy=charts.createDraft(chartId,{mode:'version',versionId:first.id});
    const saved=charts.getDraft(copy.id);
    const second=charts.publish(draft.id,{content_revision:0});
    assert.throws(()=>charts.removeVersion(chartId,second.id),/más reciente/);
    charts.removeVersion(chartId,first.id);
    assert.deepEqual(charts.versions(chartId).map(v=>v.id),[second.id]);
    assert.throws(()=>charts.getVersion(chartId,first.id),/no encontrada/);
    assert.deepEqual(charts.getDraft(copy.id),saved);
    assert.equal(charts.publish(draft.id,{content_revision:0}).version_number,3);
    assert.deepEqual(db.pragma('foreign_key_check'),[]);
  }finally{db.close();}
});
test("versiones: snapshots inmutables, nueva base independiente y numeración por empresa", () => {
  const { db, charts, chartId, imports } = setup();
  try {
    const d = charts.createDraft(chartId, { mode: "master" }),
      v1 = charts.publish(d.id, { content_revision: 0 }),
      original = JSON.stringify(v1.snapshot);
    const copy = charts.createDraft(chartId, {
      mode: "version",
      versionId: v1.id,
    });
    charts.saveDraft(copy.id, {
      ...copy,
      nodes: copy.nodes.map((n) => ({ ...n, title: "Personalizado" })),
    });
    const v2 = charts.publish(copy.id, { content_revision: 1 });
    assert.equal(v2.version_number, 2);
    const otherId = db
      .prepare("SELECT id FROM organization_charts WHERE id<>?")
      .get(chartId).id;
    const other = charts.createDraft(otherId, { mode: "master" });
    assert.equal(
      charts.publish(other.id, { content_revision: 0 }).version_number,
      1,
    );
    const next = imports.preview(
      book([person("00000001", "", { positionName: "Puesto actualizado" })]),
      "next.xlsm",
    );
    imports.confirm({ token: next.token });
    assert.equal(
      JSON.stringify(charts.getVersion(chartId, v1.id).snapshot),
      original,
    );
    assert.equal(charts.getDraft(copy.id).nodes[0].title, "Personalizado");
    assert.ok(charts.syncPreview(copy.id).length > 0);
    assert.throws(
      () =>
        db
          .prepare("UPDATE chart_versions SET snapshot_json='{}' WHERE id=?")
          .run(v1.id),
      /immutable/,
    );
    assert.throws(
      () => db.prepare("DELETE FROM chart_versions WHERE id=?").run(v1.id),
      /immutable/,
    );
  } finally {
    db.close();
  }
});
test("filtros: conserva ancestros reales, combina atributos y respeta colapso sin modificar el snapshot", () => {
  const nodes = [
    manualNode("root"),
    manualNode("group"),
    manualNode("match", {
      type: "EMPLOYEE",
      employeeId: "e",
      metadata: { branch: "Lima", area: "Ventas" },
    }),
    manualNode("other", { metadata: { branch: "Cusco", area: "Ventas" } }),
  ];
  const graph = {
      nodes,
      edges: [
        { id: "1", source: "root", target: "group" },
        { id: "2", source: "group", target: "match" },
        { id: "3", source: "root", target: "other" },
      ],
    },
    saved = JSON.stringify(graph);
  assert.deepEqual(
    visibleGraph(graph, { branch: "lima", area: "ventas" }).nodes.map(
      (n) => n.id,
    ),
    ["root", "group", "match"],
  );
  assert.deepEqual(
    visibleGraph(graph, { branch: "Lima" }, new Set(["group"])).nodes.map(
      (n) => n.id,
    ),
    ["root", "group"],
  );
  assert.equal(
    visibleGraph(graph, { branch: "Lima", area: "Otro" }).nodes.length,
    0,
  );
  assert.equal(JSON.stringify(graph), saved);
});
