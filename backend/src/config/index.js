import path from "node:path";
import { fileURLToPath } from "node:url";
import { loadEnvFile } from "node:process";
export const root = fileURLToPath(new URL("../../../", import.meta.url));
try { loadEnvFile(path.join(root,'.env')); }
catch(error) { if(error.code!=='ENOENT') throw error; }
function boolean(name) {
  const value=process.env[name];
  if(value===undefined || value==='false') return false;
  if(value==='true') return true;
  throw new Error(`${name} debe ser true o false.`);
}
const port=Number(process.env.PORT || 3001);
if(!Number.isInteger(port) || port<1 || port>65535) throw new Error('PORT debe ser un entero entre 1 y 65535.');
export const config = {
  development: process.env.NODE_ENV === "development",
  host: process.env.HOST || "127.0.0.1",
  port,
  database: path.resolve(root,process.env.DATABASE_PATH || 'data/organigrama.sqlite'),
  authRequired:boolean('AUTH_REQUIRED'),
  secureCookies:boolean('AUTH_SECURE_COOKIES'),
  maxFileSize: 12 * 1024 * 1024,
};
