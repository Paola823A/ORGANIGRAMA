import { test } from "node:test";
import assert from "node:assert/strict";
import { createApp } from "../src/app.js";
import { openDatabase } from "../src/db/index.js";
import { book, person } from "./helpers.js";
import Database from "better-sqlite3";
import { mkdtempSync, rmSync, rmdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { importService } from "../src/modules/imports/service.js";

test("API: un fallo de escritura informa permisos y conserva el borrador sin error genérico", async () => {
  const folder = mkdtempSync(join(tmpdir(), "organigrama-readonly-"));
  const filename = join(folder, "test.sqlite");
  const original = openDatabase(":memory:"), imports = importService(original);
  const preview = imports.preview(book([person("00000001")]), "test.xlsm");
  imports.confirm({ token: preview.token });
  const chartId = original.prepare("SELECT id FROM organization_charts LIMIT 1").get().id;
  await original.backup(filename);
  original.close();
  const db = new Database(filename, { readonly: true });
  const server = createApp(db).listen(0, "127.0.0.1");
  await new Promise((resolve) => server.once("listening", resolve));
  try {
    const response = await fetch(`http://127.0.0.1:${server.address().port}/api/v1/charts/${chartId}/drafts`, {
      method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ mode: "empty", name: "Prueba" }),
    });
    assert.equal(response.status, 503);
    const result = await response.json();
    assert.match(result.error, /permisos/);
    assert.ok(!JSON.stringify(result).includes("stack"));
    assert.equal(db.prepare("SELECT COUNT(*) AS n FROM chart_drafts").get().n, 0);
  } finally {
    await new Promise((resolve) => server.close(resolve));
    db.close();
    for (const path of [filename, filename + "-wal", filename + "-shm"]) rmSync(path, { force: true });
    rmdirSync(folder);
  }
});
test("API: salud, XLSM preview/confirm, búsqueda literal, paginación, rechazos y errores seguros", async () => {
  const db = openDatabase(":memory:"),
    server = createApp(db).listen(0, "127.0.0.1");
  await new Promise((resolve) => server.once("listening", resolve));
  const base = `http://127.0.0.1:${server.address().port}/api/v1`;
  try {
    assert.equal(
      (await (await fetch(`${base}/health`)).json()).foreignKeys,
      true,
    );
    const body = new FormData();
    body.append("file", new Blob([book([person("00123456")])]), "base.xlsm");
    const response = await fetch(`${base}/imports/preview`, {
      method: "POST",
      body,
    });
    assert.equal(response.status, 200);
    const p = await response.json();
    assert.equal(db.prepare("SELECT COUNT(*) n FROM employees").get().n, 0);
    const confirmed = await fetch(`${base}/imports/confirm`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ token: p.token }),
    });
    assert.equal(confirmed.status, 201);
    const employees = await (
      await fetch(`${base}/employees?q=00123456&limit=1`)
    ).json();
    assert.equal(employees.items.length, 1);
    assert.equal(employees.items[0].dni, "00123456");
    assert.equal(
      (await (await fetch(`${base}/employees?q=%25`)).json()).total,
      0,
    );
    const invalid = new FormData();
    invalid.append("file", new Blob(["bad"]), "file.txt");
    assert.equal(
      (
        await fetch(`${base}/imports/preview`, {
          method: "POST",
          body: invalid,
        })
      ).status,
      400,
    );
    assert.equal(
      (
        await fetch(`${base}/imports/confirm`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Origin: "https://example.com",
          },
          body: "{}",
        })
      ).status,
      403,
    );
    const notFound = await fetch(`${base}/drafts/missing`);
    assert.equal(notFound.status, 404);
    assert.ok(!(await notFound.text()).includes("stack"));
  } finally {
    await new Promise((resolve) => server.close(resolve));
    db.close();
  }
});
