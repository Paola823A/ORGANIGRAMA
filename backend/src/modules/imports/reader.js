import * as XLSX from "xlsx";
import { createHash } from "node:crypto";
import { normalize } from "../../../../shared/graph.js";
import { AppError, assert } from "../../utils/errors.js";

export const MAIN_SHEET = "AUTRISA-INCAMOTORS-NOVA AUTOS";
export const MAPPINGS = {
  [MAIN_SHEET]: {
    dni: "A",
    branch: "E",
    company: "F",
    fullName: "H",
    area: "K",
    positionName: "L",
    businessLine: "AI",
    supervisorDni: "AL",
  },
  CESADOS: {
    dni: "A",
    branch: "D",
    company: "G",
    fullName: "I",
    area: "L",
    positionName: "M",
    businessLine: "AJ",
    supervisorDni: "AM",
  },
};
const HEADERS = {
  dni: "DNI",
  branch: "SEDE",
  company: "EMPRESA",
  fullName: "APELLIDOS Y NOMBRES",
  area: "AREA",
  positionName: "PUESTO",
  businessLine: "GIRO",
  supervisorDni: "DNI ENCARGADO",
};

// Check ZIP directory sizes before SheetJS allocates decompressed XML.
export function validateArchive(buffer) {
  assert(
    buffer.length >= 22 && buffer.readUInt32LE(0) === 0x04034b50,
    "El archivo no es un libro XLSM válido.",
  );
  let end = -1;
  for (let i = buffer.length - 22; i >= Math.max(0, buffer.length - 65557); i--)
    if (buffer.readUInt32LE(i) === 0x06054b50) {
      end = i;
      break;
    }
  assert(end >= 0, "El archivo ZIP está incompleto.");
  const count = buffer.readUInt16LE(end + 10);
  let offset = buffer.readUInt32LE(end + 16),
    size = 0;
  assert(
    count <= 3000 && count > 0,
    "El archivo contiene demasiadas entradas.",
  );
  for (let i = 0; i < count; i++) {
    assert(
      offset + 46 <= buffer.length &&
        buffer.readUInt32LE(offset) === 0x02014b50,
      "Directorio XLSM inválido.",
    );
    assert(
      !(buffer.readUInt16LE(offset + 8) & 1),
      "No se admiten libros cifrados.",
    );
    const compressed = buffer.readUInt32LE(offset + 20),
      expanded = buffer.readUInt32LE(offset + 24);
    size += expanded;
    assert(
      size <= 80 * 1024 * 1024 &&
        expanded <= 40 * 1024 * 1024 &&
        expanded / Math.max(1, compressed) < 2000,
      "El libro excede los límites de descompresión.",
    );
    offset +=
      46 +
      buffer.readUInt16LE(offset + 28) +
      buffer.readUInt16LE(offset + 30) +
      buffer.readUInt16LE(offset + 32);
  }
}
function cellText(cell, identifier = false) {
  if (!cell || cell.v == null) return "";
  if (identifier && cell.t === "n") {
    if (!Number.isSafeInteger(cell.v) || cell.v < 0) return String(cell.v);
    if (/^0{7,12}$/.test(cell.z || ""))
      return String(cell.v).padStart(cell.z.length, "0");
  }
  return String(cell.v).trim().replace(/\s+/g, " ");
}
export function readWorkbook(buffer) {
  validateArchive(buffer);
  let workbook;
  try {
    workbook = XLSX.read(buffer, {
      type: "buffer",
      cellNF: true,
      cellFormula: true,
      bookVBA: false,
      sheets: [MAIN_SHEET, "CESADOS"],
    });
  } catch {
    throw new AppError(
      "No se pudo leer el libro XLSM. Comprueba que no esté protegido o dañado.",
    );
  }
  assert(workbook.Sheets[MAIN_SHEET], `Falta la hoja ${MAIN_SHEET}.`);
  const records = [],
    issues = [],
    structures = [];
  const addIssue = (sheet, row, code, message, severity = "WARNING") =>
    issues.push({ sheet, row, code, message, severity });
  for (const [sheetName, mapping] of Object.entries(MAPPINGS)) {
    const sheet = workbook.Sheets[sheetName];
    if (!sheet) {
      addIssue(
        sheetName,
        null,
        "SHEET_MISSING",
        "No existe CESADOS; su catálogo anterior se conservará.",
      );
      continue;
    }
    assert(sheet["!ref"], `La hoja ${sheetName} está vacía.`);
    const range = XLSX.utils.decode_range(sheet["!ref"]);
    assert(
      range.e.r < 20000 && range.e.c < 500,
      `La hoja ${sheetName} excede los límites de filas o columnas.`,
    );
    const headers = {};
    for (const [field, col] of Object.entries(mapping)) {
      headers[field] = cellText(sheet[`${col}3`]);
      assert(
        normalize(headers[field]) === HEADERS[field],
        `Encabezado incorrecto en ${sheetName}!${col}3. Se esperaba ${HEADERS[field]}.`,
      );
    }
    structures.push({
      sheet: sheetName,
      headers,
      columns: mapping,
      range: sheet["!ref"],
    });
    for (let row = 4; row <= range.e.r + 1; row++) {
      const record = {
        sheet: sheetName,
        row,
        status: sheetName === MAIN_SHEET ? "ACTIVE" : "CEASED",
      };
      for (const [field, col] of Object.entries(mapping))
        record[field] = cellText(
          sheet[`${col}${row}`],
          ["dni", "supervisorDni"].includes(field),
        );
      if (!record.dni && !record.fullName) continue;
      if (!record.fullName || !record.company) {
        addIssue(
          sheetName,
          row,
          "INCOMPLETE_ROW",
          "Fila excluida: falta nombre o empresa.",
        );
        continue;
      }
      if (!/^\d{8,12}$/.test(record.dni))
        addIssue(
          sheetName,
          row,
          "DOCUMENT_FORMAT",
          "Documento vacío, corto o alfanumérico; se conserva sin completar ni truncar.",
        );
      for (const [field, col] of Object.entries(mapping)) {
        assert(
          record[field].length <= 500,
          `Campo demasiado largo en ${sheetName}!${col}${row}.`,
        );
        if (sheet[`${col}${row}`]?.f)
          addIssue(
            sheetName,
            row,
            "CACHED_FORMULA",
            "Se utilizará el valor almacenado de una fórmula sin ejecutarla.",
          );
      }
      record.matchKey = createHash("sha256")
        .update(
          JSON.stringify([
            sheetName,
            record.dni,
            normalize(record.fullName),
            normalize(record.company),
            normalize(record.positionName),
            normalize(record.branch),
            normalize(record.area),
            normalize(record.businessLine),
          ]),
        )
        .digest("hex");
      records.push(record);
    }
  }
  assert(
    records.some((r) => r.status === "ACTIVE"),
    "La hoja principal no contiene empleados válidos.",
  );
  resolveHierarchy(records, addIssue);
  return {
    records,
    issues,
    structures,
    sheetNames: workbook.SheetNames,
    hash: createHash("sha256").update(buffer).digest("hex"),
  };
}
export function resolveHierarchy(records, addIssue) {
  const active = records.filter((r) => r.status === "ACTIVE"),
    byDni = new Map();
  const duplicateGroups = new Map();
  for (const r of records)
    if (r.dni) {
      const key = `${r.sheet}:${r.dni}`;
      if (!duplicateGroups.has(key)) duplicateGroups.set(key, []);
      duplicateGroups.get(key).push(r);
    }
  for (const r of records) {
    const key = `${r.sheet}:${r.dni}`;
    if (r.dni) {
      const group = duplicateGroups.get(key);
      if (group.length > 1)
        addIssue(
          r.sheet,
          r.row,
          "DUPLICATE_DNI",
          `Documento compartido por filas ${group.map((x) => x.row).join(", ")}; no se fusionará.`,
        );
    }
    if (r.status === "ACTIVE" && r.dni) {
      if (!byDni.has(r.dni)) byDni.set(r.dni, []);
      byDni.get(r.dni).push(r);
    }
  }
  for (const r of active) {
    const candidates = byDni.get(r.supervisorDni) || [];
    r.hierarchyStatus = !r.supervisorDni
      ? "EMPTY"
      : r.dni === r.supervisorDni
        ? "SELF"
        : candidates.length === 0
          ? "MISSING"
          : candidates.length > 1
            ? "AMBIGUOUS"
            : "RESOLVED";
    if (r.hierarchyStatus === "RESOLVED") r.supervisorRow = candidates[0].row;
  }
  const byRow = new Map(active.map((r) => [r.row, r]));
  const completed = new Set();
  for (const start of active) {
    const path = [],
      seen = new Map();
    let cursor = start;
    while (
      cursor?.hierarchyStatus === "RESOLVED" &&
      !completed.has(cursor.row)
    ) {
      if (seen.has(cursor.row)) {
        for (const r of path.slice(seen.get(cursor.row))) {
          r.hierarchyStatus = "CYCLE";
          delete r.supervisorRow;
        }
        break;
      }
      seen.set(cursor.row, path.length);
      path.push(cursor);
      cursor = byRow.get(cursor.supervisorRow);
    }
    path.forEach((r) => completed.add(r.row));
  }
  for (const r of active)
    if (r.hierarchyStatus !== "RESOLVED")
      addIssue(
        r.sheet,
        r.row,
        `HIERARCHY_${r.hierarchyStatus}`,
        {
          EMPTY: "Sin DNI encargado.",
          SELF: "Autorreferencia; relación descartada.",
          MISSING: "El DNI encargado no existe en la hoja principal.",
          AMBIGUOUS: "El DNI encargado tiene varias coincidencias.",
          CYCLE: "Relación descartada por ciclo jerárquico.",
        }[r.hierarchyStatus],
      );
}
