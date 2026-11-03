import path from "node:path";
import { fileURLToPath } from "node:url";
export const root = fileURLToPath(new URL("../../../", import.meta.url));
export const config = {
  development: process.env.NODE_ENV === "development",
  host: process.env.HOST || "127.0.0.1",
  port: Number(process.env.PORT || 3001),
  database:
    process.env.DATABASE_PATH || path.join(root, "data", "organigrama.sqlite"),
  maxFileSize: 12 * 1024 * 1024,
};
