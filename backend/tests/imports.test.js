import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { readWorkbook, MAIN_SHEET } from "../src/modules/imports/reader.js";
import { importService } from "../src/modules/imports/service.js";
import { openDatabase } from "../src/db/index.js";
import { book, person } from "./helpers.js";

test("lector: mapeos distintos, ceros iniciales, valores originales y filas vacías", () => {
  const parsed = readWorkbook(
    book(
      [person("00123456"), {}, person("123456789", "00123456")],
      [person("00888888")],
    ),
  );
  assert.equal(parsed.records.length, 3);
  assert.equal(parsed.records[0].dni, "00123456");
  assert.equal(parsed.records[1].hierarchyStatus, "RESOLVED");
  assert.equal(parsed.records[2].status, "CEASED");
  assert.equal(parsed.records[2].fullName, "Persona 00888888");
  assert.equal(parsed.records[2].branch, "Sede A");
});
test("lector: documentos numéricos conservan máscara de ceros y no se ejecutan fórmulas", () => {
  const p = readWorkbook(
    book([
      person({ t: "n", v: 123456, z: "00000000" }, "", { fullName: "Nombre" }),
    ]),
  );
  assert.equal(p.records[0].dni, "00123456");
});
test("lector: rechaza formato, hoja o encabezados incorrectos", () => {
  assert.throws(() => readWorkbook(Buffer.from("invalid")), /XLSM/);
  assert.throws(
    () => readWorkbook(book([], [], { noMain: true })),
    /Falta la hoja/,
  );
  assert.throws(
    () => readWorkbook(book([person("00000001")], [], { badHeader: true })),
    /Encabezado/,
  );
  assert.throws(() => readWorkbook(book([])), /empleados válidos/);
});
test("lector: duplicados ambiguos, referencias inexistentes y autorreferencias", () => {
  const p = readWorkbook(
    book([
      person("00000001", "00000001"),
      person("00000002"),
      person("00000002", "", { company: "Empresa B" }),
      person("00000003", "00000002"),
      person("00000004", "99999999"),
    ]),
  );
  assert.equal(p.records[0].hierarchyStatus, "SELF");
  assert.equal(p.records[3].hierarchyStatus, "AMBIGUOUS");
  assert.equal(p.records[4].hierarchyStatus, "MISSING");
  assert.equal(p.issues.filter((i) => i.code === "DUPLICATE_DNI").length, 2);
});
test("lector: descarta todos los miembros de un ciclo y conserva subordinados válidos", () => {
  const p = readWorkbook(
    book([
      person("00000001", "00000002"),
      person("00000002", "00000001"),
      person("00000003", "00000001"),
    ]),
  );
  assert.equal(p.records[0].hierarchyStatus, "CYCLE");
  assert.equal(p.records[1].hierarchyStatus, "CYCLE");
  assert.equal(p.records[2].hierarchyStatus, "RESOLVED");
});
const realFilename = "Base de Datos Personal 2026_octubre_v2.xlsm";
test(
  "archivo real: 733 activos, 791 cesados, 173 observaciones y exclusión de campos sensibles",
  { skip: !fs.existsSync(realFilename) },
  () => {
    const filename = realFilename;
    const p = readWorkbook(fs.readFileSync(filename));
    assert.equal(p.records.filter((r) => r.status === "ACTIVE").length, 733);
    assert.equal(p.records.filter((r) => r.status === "CEASED").length, 791);
    assert.equal(p.issues.length, 173);
    assert.equal(
      p.records.filter((r) => r.hierarchyStatus === "RESOLVED").length,
      711,
    );
    assert.equal(
      p.records.filter((r) => r.hierarchyStatus === "AMBIGUOUS").length,
      8,
    );
    for (const r of p.records)
      assert.ok(
        !("salary" in r) &&
          !("phone" in r) &&
          !("address" in r) &&
          !("birthDate" in r),
      );
  },
);
test("persistencia: actualiza UUID inequívoco, marca ausentes y mantiene cesados separados", () => {
  const db = openDatabase(":memory:");
  try {
    const service = importService(db),
      p = service.preview(
        book(
          [person("00000001"), person("00000002", "00000001")],
          [person("00000001")],
        ),
        "test.xlsm",
      );
    service.confirm({ token: p.token });
    const id = db
      .prepare(
        "SELECT id FROM employees WHERE dni='00000001' AND employment_status='ACTIVE'",
      )
      .get().id;
    const next = service.preview(
      book(
        [person("00000001", "", { positionName: "Otro puesto" })],
        [person("00000001")],
      ),
      "next.xlsm",
    );
    assert.equal(next.summary.updated, 2);
    assert.equal(next.summary.absent, 1);
    service.confirm({ token: next.token });
    assert.equal(
      db.prepare("SELECT position_name FROM employees WHERE id=?").get(id)
        .position_name,
      "Otro puesto",
    );
    assert.equal(
      db
        .prepare(
          "SELECT COUNT(*) n FROM employees WHERE employment_status='ABSENT'",
        )
        .get().n,
      1,
    );
    assert.equal(db.prepare("SELECT COUNT(*) n FROM employees").get().n, 3);
  } finally {
    db.close();
  }
});
test("confirmación: hash repetido, token de un uso y vista previa desactualizada", () => {
  const db = openDatabase(":memory:");
  try {
    const service = importService(db),
      buffer = book([person("00000001")]);
    const p = service.preview(buffer, "a.xlsm");
    service.confirm({ token: p.token });
    assert.throws(() => service.confirm({ token: p.token }), /venció/);
    const repeated = service.preview(buffer, "a.xlsm");
    assert.equal(repeated.repeated, true);
    assert.throws(() => service.confirm({ token: repeated.token }), /repetir/);
    const stale = service.preview(book([person("00000002")]), "b.xlsm");
    service.confirm({ token: repeated.token, allowRepeated: true });
    assert.throws(
      () => service.confirm({ token: stale.token }),
      /Otra importación/,
    );
  } finally {
    db.close();
  }
});
test("transacción: rollback incluye lote, empresas, empleados y relaciones", () => {
  const db = openDatabase(":memory:");
  try {
    const service = importService(db),
      p = service.preview(book([person("00000001")]), "a.xlsm");
    db.exec(
      "CREATE TRIGGER force_failure BEFORE INSERT ON employee_hierarchy BEGIN SELECT RAISE(ABORT,'test failure'); END",
    );
    assert.throws(() => service.confirm({ token: p.token }), /test failure/);
    assert.equal(
      db
        .prepare("SELECT COUNT(*) n FROM import_batches WHERE result='SUCCESS'")
        .get().n,
      0,
    );
    assert.equal(service.history()[0].result, "FAILED");
    for (const table of ["companies", "employees", "employee_hierarchy"])
      assert.equal(db.prepare(`SELECT COUNT(*) n FROM ${table}`).get().n, 0);
  } finally {
    db.close();
  }
});
test("duplicados: conserva registros y exige decisión explícita cuando cambian ambiguamente", () => {
  const db = openDatabase(":memory:");
  try {
    const s = importService(db),
      p = s.preview(
        book([
          person("00000001"),
          person("00000001", "", { company: "Empresa B" }),
        ]),
        "a.xlsm",
      );
    s.confirm({ token: p.token });
    const p2 = s.preview(
      book([
        person("00000001", "", { positionName: "Nuevo" }),
        person("00000001", "", { company: "Empresa B" }),
      ]),
      "b.xlsm",
    );
    assert.equal(p2.summary.conflicts, 1);
    assert.throws(() => s.confirm({ token: p2.token }), /conservar/);
    s.confirm({ token: p2.token, preserveConflicts: true });
    assert.equal(db.prepare("SELECT COUNT(*) n FROM employees").get().n, 3);
  } finally {
    db.close();
  }
});
