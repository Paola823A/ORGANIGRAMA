import fs from "node:fs";
import { readWorkbook } from "../backend/src/modules/imports/reader.js";
const filename =
  process.argv[2] || fs.readdirSync(".").find((f) => f.endsWith(".xlsm"));
if (!filename) throw new Error("Indica la ruta del archivo XLSM.");
const result = readWorkbook(fs.readFileSync(filename));
console.log(
  JSON.stringify(
    {
      hash: result.hash,
      structures: result.structures,
      records: result.records.length,
      statuses: result.records.reduce((out, r) => {
        out[r.status] = (out[r.status] || 0) + 1;
        return out;
      }, {}),
      issues: result.issues.reduce((out, i) => {
        out[i.code] = (out[i.code] || 0) + 1;
        return out;
      }, {}),
    },
    null,
    2,
  ),
);
