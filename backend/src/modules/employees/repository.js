import { normalize } from "../../../../shared/graph.js";
export const employeeSelect = `SELECT e.*, c.name AS company, h.supervisor_employee_id, h.supervisor_dni, h.resolution_status AS hierarchy_status
FROM employees e JOIN companies c ON c.id=e.company_id LEFT JOIN employee_hierarchy h ON h.employee_id=e.id`;
export function employeeRepository(db) {
  return {
    list(query = {}) {
      const conditions = [],
        params = [];
      for (const [key, column] of [
        ["companyId", "e.company_id"],
        ["status", "e.employment_status"],
      ])
        if (query[key]) {
          conditions.push(`${column}=?`);
          params.push(query[key]);
        }
      if (query.q) {
        conditions.push("e.search_text LIKE ? ESCAPE '\\'");
        params.push(`%${normalize(query.q).replace(/[\\%_]/g, "\\$&")}%`);
      }
      const where = conditions.length
        ? ` WHERE ${conditions.join(" AND ")}`
        : "";
      const total = db
        .prepare(`SELECT COUNT(*) AS count FROM employees e${where}`)
        .get(...params).count;
      const requestedLimit = Number(query.limit),
        requestedOffset = Number(query.offset);
      const limit = Number.isFinite(requestedLimit)
        ? Math.min(200, Math.max(1, Math.trunc(requestedLimit) || 50))
        : 50;
      const offset = Number.isFinite(requestedOffset)
        ? Math.min(1000000, Math.max(0, Math.trunc(requestedOffset)))
        : 0;
      return {
        items: db
          .prepare(
            `${employeeSelect}${where} ORDER BY e.full_name, e.id LIMIT ? OFFSET ?`,
          )
          .all(...params, limit, offset),
        total,
        limit,
        offset,
      };
    },
    get(id) {
      return db.prepare(`${employeeSelect} WHERE e.id=?`).get(id);
    },
    companies() {
      return db
        .prepare(
          `SELECT c.*, o.id AS chart_id, (SELECT COUNT(*) FROM employees e WHERE e.company_id=c.id AND e.employment_status='ACTIVE') AS employee_count FROM companies c LEFT JOIN organization_charts o ON o.company_id=c.id ORDER BY c.name`,
        )
        .all();
    },
    active(companyId) {
      return db
        .prepare(
          `${employeeSelect} WHERE e.company_id=? AND e.employment_status='ACTIVE' ORDER BY e.full_name`,
        )
        .all(companyId);
    },
  };
}
