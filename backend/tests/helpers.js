import * as XLSX from "xlsx";
import { MAPPINGS, MAIN_SHEET } from "../src/modules/imports/reader.js";
export function book(records = [], ceased = [], options = {}) {
  const wb = XLSX.utils.book_new();
  const headers = {
    dni: "DNI",
    branch: "SEDE",
    company: "EMPRESA",
    fullName: "APELLIDOS Y NOMBRES",
    area: "ÁREA",
    positionName: "PUESTO",
    businessLine: "GIRO",
    supervisorDni: "DNI ENCARGADO",
  };
  for (const [name, rows] of [
    [MAIN_SHEET, records],
    ["CESADOS", ceased],
  ]) {
    if (options.noMain && name === MAIN_SHEET) continue;
    const ws = {};
    const mapping = MAPPINGS[name];
    for (const [field, col] of Object.entries(mapping))
      ws[`${col}3`] = { t: "s", v: headers[field] };
    rows.forEach((row, index) => {
      for (const [field, col] of Object.entries(mapping)) {
        const v = row[field] ?? "";
        ws[`${col}${index + 4}`] =
          typeof v === "object" ? v : { t: "s", v: String(v) };
      }
    });
    if (options.badHeader && name === MAIN_SHEET) delete ws.AL3;
    ws["!ref"] = `A1:AM${Math.max(4, rows.length + 3)}`;
    XLSX.utils.book_append_sheet(wb, ws, name);
  }
  return XLSX.write(wb, { type: "buffer", bookType: "xlsm" });
}
export function person(dni, supervisorDni = "", extra = {}) {
  return {
    dni,
    supervisorDni,
    fullName: `Persona ${dni}`,
    company: "Empresa A",
    branch: "Sede A",
    area: "Área A",
    positionName: "Puesto",
    businessLine: "Giro A",
    ...extra,
  };
}
export function manualNode(id, extra = {}) {
  return {
    id,
    type: "GROUP",
    employeeId: null,
    title: "Grupo",
    subtitle: "",
    position: { x: 0, y: 0 },
    width: 252,
    height: 110,
    style: {
      backgroundColor: "#ffffff",
      textColor: "#243247",
      borderColor: "#cbd5e1",
      borderStyle: "solid",
    },
    collapsed: false,
    siblingOrder: 0,
    metadata: {},
    ...extra,
  };
}
