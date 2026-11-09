import { randomUUID } from "node:crypto";
import { chartRepository } from "./repository.js";
import { employeeRepository } from "../employees/repository.js";
import { validateGraph } from "../../../../shared/graph.js";
import { AppError, assert } from "../../utils/errors.js";
import { AUTRISA_BLUE,applyBrandTheme } from "../../../../shared/theme.js";
import {recordDraft} from './history.js';

export function employeeNode(e, index = 0) {
  return {
    id: randomUUID(),
    type: "EMPLOYEE",
    employeeId: e.id,
    title: e.full_name,
    subtitle: e.position_name,
    position: { x: (index % 6) * 300, y: Math.floor(index / 6) * 150 },
    width: 252,
    height: 110,
    style: {
      backgroundColor: "#ffffff",
      textColor: "#243247",
      borderColor: AUTRISA_BLUE,
      borderStyle: e.employment_status === "CEASED" ? "dashed" : "solid",
    },
    collapsed: false,
    siblingOrder: index,
    metadata: {
      autrisaTheme: 1,
      company: e.company,
      businessLine: e.business_line,
      branch: e.branch,
      area: e.area,
      dni: e.dni,
      employmentStatus: e.employment_status,
      hierarchyStatus: e.hierarchy_status || "EMPTY",
    },
  };
}
export function chartService(db) {
  const repository = chartRepository(db),
    employees = employeeRepository(db);
  function getDraft(id) {
    const d = repository.draft(id);
    assert(d, "Borrador no encontrado.", 404);
    return d;
  }
  function getChart(id) {
    const c = db
      .prepare(
        "SELECT o.*,c.name AS company FROM organization_charts o JOIN companies c ON c.id=o.company_id WHERE o.id=?",
      )
      .get(id);
    assert(c, "Organigrama no encontrado.", 404);
    return c;
  }
  function checkGraph(graph) {
    try {
      validateGraph(graph);
    } catch (e) {
      throw new AppError(e.message);
    }
    const getEmployee = db.prepare("SELECT 1 FROM employees WHERE id=?");
    for (const n of graph.nodes)
      if (n.employeeId)
        assert(
          getEmployee.get(n.employeeId),
          "El empleado asociado no existe.",
        );
  }
  function createDraft(chartId, options = {}) {
    const chart = getChart(chartId),
      id = randomUUID();
    const name = options.name || "Nuevo borrador";
    assert(
      typeof name === "string" && name.trim() && name.length <= 200,
      "Nombre de borrador inválido.",
    );
    assert(
      ["empty", "master", "version"].includes(options.mode || "empty"),
      "Origen de borrador inválido.",
    );
    let graph = { nodes: [], edges: [] },
      base = null;
    if (options.mode === "master") {
      const people = employees.active(chart.company_id),
        nodes = people.map(employeeNode);
      const nodeIds = new Map(nodes.map((n) => [n.employeeId, n.id]));
      graph = {
        nodes,
        edges: people
          .filter(
            (e) =>
              e.hierarchy_status === "RESOLVED" &&
              nodeIds.has(e.supervisor_employee_id),
          )
          .map((e) => ({
            id: randomUUID(),
            source: nodeIds.get(e.supervisor_employee_id),
            target: nodeIds.get(e.id),
            style: { color: "#94a3b8", width: 1.5, lineType: "solid" },
          })),
      };
      for (const n of graph.nodes) {
        const person = people.find((e) => e.id === n.employeeId);
        if (
          person.hierarchy_status === "RESOLVED" &&
          !nodeIds.has(person.supervisor_employee_id)
        )
          n.metadata.hierarchyStatus = "OUTSIDE_COMPANY";
      }
    } else if (options.mode === "version") {
      const version = getVersion(chartId, options.versionId);
      graph = version.snapshot;
      base = version.id;
    }
    graph=applyBrandTheme(graph,chart.company);
    checkGraph(graph);
    db.transaction(() => {
      db.prepare(
        "INSERT INTO chart_drafts(id,chart_id,base_version_id,name) VALUES (?,?,?,?)",
      ).run(id, chartId, base, name.trim());
      repository.writeGraph(id, graph);
    })();
    return getDraft(id);
  }
  function saveDraft(id, body, actor='Modo local',action='Edición') {
    const current = getDraft(id);
    assert(
      Number.isInteger(body.content_revision),
      "Falta la revisión del borrador.",
    );
    assert(
      typeof body.name === "string" &&
        body.name.trim() &&
        body.name.length <= 200,
      "Nombre de borrador inválido.",
    );
    checkGraph(body);
    db.transaction(() => {
      const result = db
        .prepare(
          "UPDATE chart_drafts SET name=?,content_revision=content_revision+1,updated_at=CURRENT_TIMESTAMP WHERE id=? AND content_revision=?",
        )
        .run(body.name.trim(), id, body.content_revision);
      assert(
        result.changes === 1,
        "El borrador cambió en otra sesión. Recárgalo antes de guardar.",
        409,
      );
      if(!db.prepare('SELECT 1 FROM draft_history WHERE draft_id=? LIMIT 1').get(id)) recordDraft(db,current,actor,'Estado inicial');
      repository.writeGraph(current.id, body);
      recordDraft(db,repository.draft(id),actor,action);
    }).immediate();
    return getDraft(id);
  }
  function publish(id, { content_revision } = {}) {
    return db
      .transaction(() => {
        const draft = getDraft(id);
        assert(
          draft.content_revision === content_revision,
          "Guarda o recarga el borrador antes de publicar.",
          409,
        );
        checkGraph(draft);
        assert(
          draft.nodes.length,
          "No se puede publicar un organigrama vacío.",
        );
        const number = db
          .prepare(
            "SELECT COALESCE(MAX(version_number),0)+1 AS n FROM chart_versions WHERE chart_id=?",
          )
          .get(draft.chart_id).n;
        const versionId = randomUUID();
        const snapshot = {
          schemaVersion: 1,
          name: draft.name,
          nodes: draft.nodes,
          edges: draft.edges,
        };
        db.prepare(
          "INSERT INTO chart_versions(id,chart_id,version_number,source_draft_id,snapshot_json) VALUES (?,?,?,?,?)",
        ).run(versionId, draft.chart_id, number, id, JSON.stringify(snapshot));
        return getVersion(draft.chart_id, versionId);
      })
      .immediate();
  }
  function getVersion(chartId, id) {
    const version = db
      .prepare("SELECT * FROM chart_versions WHERE chart_id=? AND id=? AND NOT EXISTS (SELECT 1 FROM removed_chart_versions r WHERE r.version_id=chart_versions.id)")
      .get(chartId, id);
    assert(version, "Versión no encontrada.", 404);
    return {
      ...version,
      snapshot_json: undefined,
      snapshot: JSON.parse(version.snapshot_json),
    };
  }
  function syncPreview(id) {
    return getDraft(id)
      .nodes.filter((n) => n.employeeId)
      .map((n) => {
        const e = employees.get(n.employeeId);
        return {
          nodeId: n.id,
          currentTitle: n.title,
          currentSubtitle: n.subtitle,
          employee: e,
          changed:
            !!e &&
            (n.title !== e.full_name ||
              n.subtitle !== e.position_name ||
              n.metadata.employmentStatus !== e.employment_status ||
              n.metadata.company !== e.company ||
              n.metadata.branch !== e.branch ||
              n.metadata.area !== e.area ||
              n.metadata.businessLine !== e.business_line ||
              n.metadata.dni !== e.dni),
        };
      })
      .filter((n) => n.changed);
  }
  function removeVersion(chartId,id) {
    db.transaction(()=>{
      const version=getVersion(chartId,id);
      const latest=db.prepare('SELECT MAX(version_number) AS n FROM chart_versions WHERE chart_id=? AND NOT EXISTS (SELECT 1 FROM removed_chart_versions r WHERE r.version_id=chart_versions.id)').get(chartId).n;
      assert(version.version_number<latest,'Conserva la versión más reciente. Solo puedes eliminar versiones pasadas.',409);
      db.prepare('INSERT INTO removed_chart_versions(version_id) VALUES (?)').run(id);
    }).immediate();
    return {ok:true};
  }
  return {
    getChart,
    getDraft,
    createDraft,
    saveDraft,
    publish,
    getVersion,
    syncPreview,
    history:(id)=>{getDraft(id);return db.prepare('SELECT id,actor_name,action,created_at FROM draft_history WHERE draft_id=? ORDER BY rowid DESC LIMIT 200').all(id);},
    restore:(id,historyId,revision,actor)=>{
      getDraft(id);
      const entry=db.prepare('SELECT snapshot_json FROM draft_history WHERE id=? AND draft_id=?').get(historyId,id);
      assert(entry,'Punto del historial no encontrado.',404);
      return saveDraft(id,{...JSON.parse(entry.snapshot_json),content_revision:revision},actor,'Restauración de historial');
    },
    removeVersion,
    list: (companyId) =>
      db
        .prepare(
          `SELECT * FROM organization_charts ${companyId ? "WHERE company_id=?" : ""}`,
        )
        .all(...(companyId ? [companyId] : [])),
    drafts: (chartId) => {
      getChart(chartId);
      return db
        .prepare(
          "SELECT * FROM chart_drafts WHERE chart_id=? ORDER BY updated_at DESC,rowid DESC",
        )
        .all(chartId);
    },
    versions: (chartId) => {
      getChart(chartId);
      return db
        .prepare(
          "SELECT id,chart_id,version_number,source_draft_id,published_at FROM chart_versions WHERE chart_id=? AND NOT EXISTS (SELECT 1 FROM removed_chart_versions r WHERE r.version_id=chart_versions.id) ORDER BY version_number DESC",
        )
        .all(chartId);
    },
  };
}
