import { Router } from "express";
import multer from "multer";
import { config } from "../../config/index.js";
import { assert } from "../../utils/errors.js";
export function importRoutes(service) {
  const router = Router(),
    upload = multer({
      storage: multer.memoryStorage(),
      limits: { fileSize: config.maxFileSize, files: 1, fields: 0 },
      fileFilter(_req, file, cb) {
        if (!/\.xlsm$/i.test(file.originalname))
          return cb(
            Object.assign(new Error("Selecciona un archivo .xlsm."), {
              status: 400,
            }),
          );
        cb(null, true);
      },
    });
  router.post("/preview", upload.single("file"), (req, res) => {
    assert(req.file, "Selecciona un archivo XLSM.");
    res.json(service.preview(req.file.buffer, req.file.originalname, req.importScope || {userId:req.user?.id}));
  });
  router.post("/confirm", (req, res) =>
    res.status(201).json(service.confirm(req.body,req.importScope || {userId:req.user?.id})),
  );
  router.get("/", (req, res) => res.json(service.history(req.importScope)));
  router.get("/:id/issues", (req, res) =>
    res.json(service.issues(req.params.id,req.importScope)),
  );
  return router;
}
