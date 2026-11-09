import { randomUUID, createHash } from "node:crypto";
import { readWorkbook } from "./reader.js";
import { normalize } from "../../../../shared/graph.js";
import { assert } from "../../utils/errors.js";
import {syncImportedDrafts} from '../charts/importSync.js';

function matchRecords(records, existing) {
  const used = new Set();
  function group(items, keyOf) {
    const result = new Map();
    for (const item of items) {
      const key = keyOf(item);
      if (!result.has(key)) result.set(key, []);
      result.get(key).push(item);
    }
    return result;
  }
  const previousGroups = group(existing, (e) => `${e.source_sheet}:${e.dni}`),
    incomingGroups = group(records, (r) => `${r.sheet}:${r.dni}`),
    keyGroups = group(records, (r) => r.matchKey);
  return records.map((record) => {
    const key = `${record.sheet}:${record.dni}`;
    const previous = previousGroups.get(key) || [];
    const incoming = incomingGroups.get(key) || [];
    let match =
      record.dni && previous.length === 1 && incoming.length === 1
        ? previous[0]
        : null;
    if (!match) {
      const exact = previous.filter(
        (e) => e.match_key === record.matchKey && !used.has(e.id),
      );
      if (exact.length === 1 && keyGroups.get(record.matchKey).length === 1)
        match = exact[0];
    }
    if (match && used.has(match.id)) match = null;
    if (match) used.add(match.id);
    const conflict = previous.length > 0 && !match;
    const changes = match
      ? [
          "dni",
          "fullName",
          "positionName",
          "company",
          "businessLine",
          "branch",
          "area",
        ].filter((k) => {
          const cols = {
            fullName: "full_name",
            positionName: "position_name",
            businessLine: "business_line",
          };
          return record[k] !== match[cols[k] || k];
        })
      : [];
    return {
      ...record,
      id: match?.id || randomUUID(),
      action: match ? "UPDATE" : "INSERT",
      conflict,
      changes,
    };
  });
}
export function importService(db) {
  const previews = new Map();
  const existing = () =>
    db
      .prepare(
        "SELECT e.*,c.name AS company FROM employees e JOIN companies c ON c.id=e.company_id",
      )
      .all();
  const latest = () =>
    db
      .prepare(
        "SELECT id FROM import_batches WHERE result='SUCCESS' ORDER BY rowid DESC LIMIT 1",
      )
      .get()?.id || null;
  function recordFailure(filename, hash, processed, code) {
    const id = randomUUID();
    db.transaction(() => {
      db.prepare(
        "INSERT INTO import_batches(id,filename,content_hash,processed_count,inserted_count,updated_count,issue_count,result,summary_json) VALUES (?,?,?,?,0,0,1,'FAILED','{}')",
      ).run(id, filename, hash, processed);
      db.prepare(
        "INSERT INTO import_issues(import_batch_id,sheet,severity,code,message) VALUES (?,'','ERROR',?,?)",
      ).run(
        id,
        code,
        code === "VALIDATION_FAILED"
          ? "El archivo no superó la validación. No se modificó la base de personal."
          : "La transacción falló y se revirtieron todos los cambios de personal.",
      );
    })();
  }
  function preview(buffer, filename, context = {}) {
    for (const [id, p] of previews)
      if (p.expires < Date.now()) previews.delete(id);
    assert(
      previews.size < 5,
      "Hay demasiadas vistas previas abiertas. Espera su caducidad o confirma una.",
      429,
    );
    let parsed;
    try {
      parsed = readWorkbook(buffer);
    } catch (error) {
      recordFailure(
        filename,
        createHash("sha256").update(buffer).digest("hex"),
        0,
        "VALIDATION_FAILED",
      );
      throw error;
    }
    let scope = null;
    if (context.companyIds) {
      const allowed = db.prepare('SELECT id,normalized_name FROM companies').all().filter(c=>context.companyIds.includes(c.id));
      const names = new Set(allowed.map(c=>c.normalized_name));
      const records = parsed.records.filter(r=>names.has(normalize(r.company)));
      assert(records.length,'El archivo no contiene personal de las empresas que tienes autorizadas.',403);
      const present = new Set(records.map(r=>normalize(r.company)));
      scope = allowed.filter(c=>present.has(c.normalized_name)).map(c=>c.id);
      const activeRows = new Set(records.filter(r=>r.status==='ACTIVE').map(r=>r.row));
      parsed = { ...parsed, records:records.map(r=>r.hierarchyStatus==='RESOLVED' && !activeRows.has(r.supervisorRow) ? {...r,hierarchyStatus:'MISSING',supervisorRow:undefined} : r),
        issues:parsed.issues.filter(i=>records.some(r=>r.sheet===i.sheet && r.row===i.row)) };
    }
    const token = randomUUID(),
      old = existing().filter(e=>!scope || scope.includes(e.company_id));
    const records = matchRecords(parsed.records, old);
    const matched = new Set(records.map((r) => r.id));
    const summary = {
      active: records.filter((r) => r.status === "ACTIVE").length,
      ceased: records.filter((r) => r.status === "CEASED").length,
      inserted: records.filter((r) => r.action === "INSERT").length,
      updated: records.filter((r) => r.action === "UPDATE").length,
      changed: records.filter((r) => r.changes.length).length,
      absent: old.filter(
        (e) => e.employment_status === "ACTIVE" && !matched.has(e.id),
      ).length,
      duplicateRows: parsed.issues.filter((i) => i.code === "DUPLICATE_DNI")
        .length,
      unresolved: records.filter(
        (r) => r.status === "ACTIVE" && r.hierarchyStatus !== "RESOLVED",
      ).length,
      conflicts: records.filter((r) => r.conflict).length,
      issues: parsed.issues.length,
    };
    const repeated = !!db
      .prepare(
        "SELECT 1 FROM import_batches WHERE content_hash=? AND result='SUCCESS'",
      )
      .get(parsed.hash);
    const value = {
      ...parsed,
      records,
      filename,
      summary,
      repeated,
      scope,
      actor:context.userId || null,
      baseline: latest(),
      expires: Date.now() + 30 * 60 * 1000,
    };
    previews.set(token, value);
    return {
      token,
      filename,
      size: buffer.length,
      hash: parsed.hash,
      expiresAt: new Date(value.expires).toISOString(),
      summary,
      repeated,
      structures: parsed.structures,
      records,
      issues: parsed.issues,
      scoped: !!scope,
    };
  }
  function confirm({
    token,
    allowRepeated = false,
    preserveConflicts = false,
  } = {}, context = {}) {
    const p = previews.get(token);
    assert(
      p && p.expires > Date.now(),
      "La vista previa venció. Selecciona el archivo nuevamente.",
      410,
    );
    assert(p.actor === (context.userId || null), 'Esta vista previa pertenece a otro usuario.',403);
    assert(!context.companyIds || p.scope && p.scope.every(id=>context.companyIds.includes(id)), 'Ya no tienes permisos para confirmar esta carga.',403);
    assert(
      !p.repeated || allowRepeated === true,
      "Confirma expresamente que deseas repetir esta importación.",
    );
    assert(
      !p.summary.conflicts || preserveConflicts === true,
      "Debes aceptar conservar los conflictos como registros separados.",
    );
    const id = randomUUID();
    try {
      db.transaction(() => {
        assert(
          latest() === p.baseline,
          "Otra importación cambió la base. Genera una vista previa nueva.",
          409,
        );
        db.prepare(
          `INSERT INTO import_batches(id,filename,content_hash,processed_count,inserted_count,updated_count,issue_count,result,summary_json) VALUES (?,?,?,?,?,?,?,'SUCCESS',?)`,
        ).run(
          id,
          p.filename,
          p.hash,
          p.records.length,
          p.summary.inserted,
          p.summary.updated,
          p.issues.length,
          JSON.stringify(p.summary),
        );
        db.prepare('UPDATE import_batches SET actor_user_id=?,scope_json=? WHERE id=?').run(p.actor,p.scope ? JSON.stringify(p.scope):null,id);
        const companyMap = new Map(
          db
            .prepare("SELECT * FROM companies")
            .all()
            .map((c) => [c.normalized_name, c.id]),
        );
        for (const r of p.records) {
          const key = normalize(r.company);
          if (!companyMap.has(key)) {
            const companyId = randomUUID();
            companyMap.set(key, companyId);
            db.prepare(
              "INSERT INTO companies(id,name,normalized_name) VALUES (?,?,?)",
            ).run(companyId, r.company, key);
            db.prepare(
              "INSERT INTO organization_charts(id,company_id,name) VALUES (?,?,?)",
            ).run(randomUUID(), companyId, `Organigrama ${r.company}`);
          }
          const companyId = companyMap.get(key);
          db.prepare(
            `INSERT INTO employees(id,dni,full_name,position_name,company_id,business_line,branch,area,employment_status,source_sheet,source_row,match_key,search_text,last_seen_import_id)
          VALUES (@id,@dni,@fullName,@positionName,@companyId,@businessLine,@branch,@area,@status,@sheet,@row,@matchKey,@searchText,@importId)
          ON CONFLICT(id) DO UPDATE SET dni=excluded.dni,full_name=excluded.full_name,position_name=excluded.position_name,company_id=excluded.company_id,business_line=excluded.business_line,branch=excluded.branch,area=excluded.area,employment_status=excluded.employment_status,source_row=excluded.source_row,match_key=excluded.match_key,search_text=excluded.search_text,last_seen_import_id=excluded.last_seen_import_id,updated_at=CURRENT_TIMESTAMP`,
          ).run({
            ...r,
            companyId,
            searchText: normalize(`${r.dni} ${r.fullName} ${r.positionName}`),
            importId: id,
          });
        }
        const scopeWhere = p.scope ? ` AND company_id IN (${p.scope.map(()=>'?').join(',')})` : '';
        db.prepare(
          "UPDATE employees SET employment_status='ABSENT',updated_at=CURRENT_TIMESTAMP WHERE employment_status='ACTIVE' AND last_seen_import_id<>?" + scopeWhere,
        ).run(id,...(p.scope || []));
        // This table is only changed by a confirmed import, never by visual operations.
        if (p.scope) db.prepare(`DELETE FROM employee_hierarchy WHERE employee_id IN (SELECT id FROM employees WHERE company_id IN (${p.scope.map(()=>'?').join(',')}))`).run(...p.scope);
        else db.prepare("DELETE FROM employee_hierarchy").run();
        const activeByRow = new Map(
          p.records
            .filter((r) => r.status === "ACTIVE")
            .map((r) => [r.row, r.id]),
        );
        const insertHierarchy = db.prepare(
          "INSERT INTO employee_hierarchy(employee_id,supervisor_employee_id,supervisor_dni,resolution_status,import_batch_id) VALUES (?,?,?,?,?)",
        );
        for (const r of p.records.filter((r) => r.status === "ACTIVE"))
          insertHierarchy.run(
            r.id,
            r.hierarchyStatus === "RESOLVED"
              ? activeByRow.get(r.supervisorRow)
              : null,
            r.supervisorDni,
            r.hierarchyStatus,
            id,
          );
        const insertIssue = db.prepare(
          "INSERT INTO import_issues(import_batch_id,sheet,row_number,severity,code,message) VALUES (?,?,?,?,?,?)",
        );
        for (const issue of p.issues)
          insertIssue.run(
            id,
            issue.sheet,
            issue.row,
            issue.severity,
            issue.code,
            issue.message,
          );
        const actor=p.actor ? db.prepare('SELECT display_name FROM app_users WHERE id=?').get(p.actor)?.display_name : 'Modo local';
        syncImportedDrafts(db,p.records,actor || 'Importación');
      }).immediate();
    } catch (error) {
      if (!error.status) {
        try {
          recordFailure(p.filename, p.hash, p.records.length, "CONFIRM_FAILED");
        } catch {
          /* The original error remains authoritative if the database itself is unavailable. */
        }
      }
      throw error;
    }
    previews.delete(token);
    return { id, summary: p.summary };
  }
  return {
    preview,
    confirm,
    removeHistory:(id,context)=>{
      const batch=db.prepare('SELECT * FROM import_batches WHERE id=? AND history_deleted_at IS NULL').get(id);
      assert(batch,'Importación no encontrada.',404);
      if(context) assert(batch.actor_user_id===context.userId && batch.scope_json && JSON.parse(batch.scope_json).every(company=>context.companyIds.includes(company)),'No tienes acceso a esta importación.',403);
      db.prepare('UPDATE import_batches SET history_deleted_at=CURRENT_TIMESTAMP WHERE id=?').run(id);
      return {ok:true};
    },
    history: (context) =>
      db
        .prepare("SELECT * FROM import_batches WHERE history_deleted_at IS NULL ORDER BY rowid DESC LIMIT 100")
        .all()
        .filter(b=>!context || b.actor_user_id===context.userId && b.scope_json && JSON.parse(b.scope_json).every(id=>context.companyIds.includes(id)))
        .map((b) => ({
          ...b,
          summary: JSON.parse(b.summary_json),
          summary_json: undefined,
        })),
    issues: (id,context) => {
      if(context) {
        const batch = db.prepare('SELECT * FROM import_batches WHERE id=?').get(id);
        assert(batch && batch.actor_user_id===context.userId && batch.scope_json && JSON.parse(batch.scope_json).every(id=>context.companyIds.includes(id)), 'No tienes acceso a esta importación.',403);
      }
      return db
        .prepare(
          "SELECT * FROM import_issues WHERE import_batch_id=? ORDER BY id",
        )
        .all(id);
    },
  };
}
