import { Router } from "express";
export function chartRoutes(service) {
  const router = Router();
  router.get("/charts", (req, res) =>
    res.json(service.list(req.query.companyId)),
  );
  router.get("/charts/:id", (req, res) =>
    res.json(service.getChart(req.params.id)),
  );
  router.get("/charts/:id/drafts", (req, res) =>
    res.json(service.drafts(req.params.id)),
  );
  router.post("/charts/:id/drafts", (req, res) =>
    res.status(201).json(service.createDraft(req.params.id, req.body)),
  );
  router.get("/drafts/:id", (req, res) =>
    res.json(service.getDraft(req.params.id)),
  );
  router.put("/drafts/:id", (req, res) =>
    res.json(service.saveDraft(req.params.id, req.body)),
  );
  router.get("/drafts/:id/sync-preview", (req, res) =>
    res.json(service.syncPreview(req.params.id)),
  );
  router.post("/drafts/:id/publish", (req, res) =>
    res.status(201).json(service.publish(req.params.id, req.body)),
  );
  router.get("/charts/:id/versions", (req, res) =>
    res.json(service.versions(req.params.id)),
  );
  router.get("/charts/:id/versions/:versionId", (req, res) =>
    res.json(service.getVersion(req.params.id, req.params.versionId)),
  );
  router.post("/charts/:id/versions/:versionId/create-draft", (req, res) =>
    res
      .status(201)
      .json(
        service.createDraft(req.params.id, {
          ...req.body,
          mode: "version",
          versionId: req.params.versionId,
        }),
      ),
  );
  return router;
}
