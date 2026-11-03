import express from "express";
import path from "node:path";
import fs from "node:fs";
import { root, config } from "./config/index.js";
import { importService } from "./modules/imports/service.js";
import { importRoutes } from "./modules/imports/routes.js";
import { chartService } from "./modules/charts/service.js";
import { chartRoutes } from "./modules/charts/routes.js";
import { employeeRepository } from "./modules/employees/repository.js";
import { employeeRoutes } from "./modules/employees/routes.js";
export function createApp(db) {
  const app = express();
  app.disable("x-powered-by");
  app.use((_req, res, next) => {
    res.setHeader("X-Content-Type-Options", "nosniff");
    res.setHeader("Referrer-Policy", "same-origin");
    res.setHeader("Cache-Control", "no-store");
    next();
  });
  app.use((req, res, next) => {
    if (
      ["POST", "PUT", "PATCH", "DELETE"].includes(req.method) &&
      req.headers.origin
    ) {
      let origin;
      try {
        origin = new URL(req.headers.origin);
      } catch {
        return res.status(403).json({ error: "Origen no permitido." });
      }
      const localDevelopment =
        config.development &&
        ["http://localhost:5173", "http://127.0.0.1:5173"].includes(
          origin.origin,
        );
      if (origin.host !== req.headers.host && !localDevelopment)
        return res.status(403).json({ error: "Origen no permitido." });
    }
    next();
  });
  app.use(express.json({ limit: "15mb" }));
  app.get("/api/v1/health", (_req, res) =>
    res.json({
      status: "ok",
      foreignKeys: db.pragma("foreign_keys", { simple: true }) === 1,
    }),
  );
  app.use("/api/v1/imports", importRoutes(importService(db)));
  app.use(
    "/api/v1",
    employeeRoutes(employeeRepository(db), db),
    chartRoutes(chartService(db)),
  );
  app.use("/api", (_req, res) =>
    res.status(404).json({ error: "Ruta no encontrada." }),
  );
  const dist = path.join(root, "frontend/dist");
  if (fs.existsSync(dist)) {
    app.use(express.static(dist));
    app.get("/{*path}", (_req, res) =>
      res.sendFile(path.join(dist, "index.html")),
    );
  }
  app.use((err, _req, res, _next) => {
    const databaseMessage = {
      SQLITE_BUSY: "La base de datos está ocupada. Espera unos segundos y vuelve a guardar; tus cambios siguen en pantalla.",
      SQLITE_READONLY: "No se puede escribir en la base de datos. Revisa los permisos y reinicia el servidor; tus cambios siguen en pantalla.",
      SQLITE_READONLY_DBMOVED: "La ubicación del archivo de datos cambió mientras el servidor estaba abierto. Reinicia el servidor y vuelve a guardar; tus cambios siguen en pantalla.",
      SQLITE_CANTOPEN: "No se puede abrir el archivo de datos para guardar. Revisa que su carpeta esté disponible y reinicia el servidor.",
      SQLITE_FULL: "No hay espacio disponible para guardar. Libera espacio y vuelve a intentar; tus cambios siguen en pantalla.",
    }[err.code];
    if (databaseMessage) return res.status(503).json({ error: databaseMessage });
    const status =
      err.code === "LIMIT_FILE_SIZE"
        ? 413
        : err instanceof SyntaxError
          ? 400
          : err.status || (err.name === "MulterError" ? 400 : 500);
    if (status === 500) console.error("Error interno del servidor:", err.code || err.name, err.message);
    res
      .status(status)
      .json({
        error:
          status === 500
            ? "No se pudo completar la operación. No se guardaron cambios parciales."
            : err.code === "LIMIT_FILE_SIZE"
              ? "El archivo supera el límite de 12 MB."
              : err.message,
        details: err.details,
      });
  });
  return app;
}
