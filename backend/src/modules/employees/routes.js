import { Router } from "express";
import { assert } from "../../utils/errors.js";
export function employeeRoutes(repository, db) {
  const router = Router();
  router.get("/companies", (_req, res) => res.json(repository.companies()));
  router.get("/companies/:id/filters", (req, res) => {
    const rows = repository.active(req.params.id);
    res.json(
      Object.fromEntries(
        ["business_line", "branch", "area"].map((k) => [
          k,
          [...new Set(rows.map((r) => r[k]).filter(Boolean))].sort(),
        ]),
      ),
    );
  });
  router.get("/employees/ceased", (req, res) =>
    res.json(repository.list({ ...req.query, allowedCompanies: req.allowedEmployeeCompanies, status: "CEASED" })),
  );
  router.get("/employees", (req, res) => res.json(repository.list({ ...req.query, allowedCompanies: req.allowedEmployeeCompanies })));
  router.get("/employees/:id", (req, res) => {
    const e = repository.get(req.params.id);
    assert(e, "Empleado no encontrado.", 404);
    res.json(e);
  });
  router.get("/employees/:id/hierarchy", (req, res) => {
    assert(repository.get(req.params.id), "Empleado no encontrado.", 404);
    res.json(
      db
        .prepare("SELECT * FROM employee_hierarchy WHERE employee_id=?")
        .get(req.params.id) || null,
    );
  });
  return router;
}
