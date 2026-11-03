import { toJpeg, toPng } from "html-to-image";
import { getSmoothStepPath } from "@vue-flow/core";
import { cardTextColor, cardTextStyle, connectionAnchor, groupBaseStyle } from "./cardStyle.js";
import { cardContent } from "./cardContent.js";
import { isGroupingNode, subordinateCounts } from "../../../shared/graph.js";
import {
  graphBounds,
  pdfGeometry,
  isCompleteInTile,
} from "./exportGeometry.js";
const NS = "http://www.w3.org/2000/svg";
const labels = {
  EMPLOYEE: "Colaborador",
  POSITION: "Puesto",
  BUSINESS_LINE: "Línea de negocio",
  BRANCH: "Sede",
  AREA: "Área",
  GROUP: "Grupo",
  CUSTOM: "Tarjeta",
};
function textElement(tag, className, text) {
  const element = document.createElement(tag);
  element.className = className;
  element.textContent = text;
  return element;
}
function exportTile(graph, bounds, showNames, left, top, width, height, teams) {
  const frame = document.createElement("div");
  Object.assign(frame.style, {
    position: "fixed",
    left: "0",
    top: "0",
    zIndex: "-1",
    width: `${width}px`,
    height: `${height}px`,
    overflow: "hidden",
    backgroundColor: "#ffffff",
    fontFamily: getComputedStyle(document.body).fontFamily,
  });
  const svg = document.createElementNS(NS, "svg");
  svg.setAttribute("width", width);
  svg.setAttribute("height", height);
  Object.assign(svg.style, { position: "absolute", left: "0", top: "0" });
  const nodes = new Map(graph.nodes.map((n) => [n.id, n]));
  for (const e of graph.edges) {
    const s = nodes.get(e.source),
      t = nodes.get(e.target);
    if (!s || !t) continue;
    const path = document.createElementNS(NS, "path");
    const source = connectionAnchor(s, e.style?.sourceHandle || "source-bottom", "bottom");
    const target = connectionAnchor(t, e.style?.targetHandle || "target-top", "top");
    const [d] = getSmoothStepPath({
      sourceX: source.x - bounds.x - left,
      sourceY: source.y - bounds.y - top,
      targetX: target.x - bounds.x - left,
      targetY: target.y - bounds.y - top,
      sourcePosition: source.side,
      targetPosition: target.side,
    });
    path.setAttribute("d", e.layoutPath || d);
    if (e.layoutPath) path.setAttribute("transform", `translate(${-bounds.x - left} ${-bounds.y - top})`);
    path.setAttribute("fill", "none");
    path.setAttribute("stroke", e.style?.color || "#94a3b8");
    path.setAttribute("stroke-width", e.style?.width || 1.5);
    if (e.style?.lineType === "dashed")
      path.setAttribute("stroke-dasharray", "6 4");
    svg.append(path);
  }
  frame.append(svg);
  for (const n of graph.nodes) {
    const x = n.position.x - bounds.x - left,
      y = n.position.y - bounds.y - top;
    // The overlapping tiles guarantee a complete copy on at least one page.
    if (!isCompleteInTile(n, bounds, left, top, width, height)) continue;
    const card = document.createElement("article");
    card.className = n.type === "JUNCTION" ? "junction-node" : `chart-card${n.type !== "EMPLOYEE" ? " is-manual" : ""}${n.metadata.employmentStatus === "CEASED" ? " is-ceased" : ""}`;
    if (n.metadata.visualOnly) card.classList.add("is-visual-copy");
    Object.assign(card.style, {
      position: "absolute",
      left: `${x}px`,
      top: `${y}px`,
      width: `${n.width}px`,
      height: `${n.height}px`,
      backgroundColor: n.style.backgroundColor,
      color: cardTextColor(n),
      borderColor: n.style.borderColor,
      borderStyle: n.style.borderStyle,
    });
    for (const [key, value] of Object.entries(cardTextStyle(n.style))) {
      if (key.startsWith("--")) card.style.setProperty(key, value);
      else card.style[key] = value;
    }
    if (n.type === "JUNCTION") {
      frame.append(card);
      continue;
    }
    if (isGroupingNode(n)) {
      card.className = "group-heading";
      Object.assign(card.style, { borderStyle: "none", ...groupBaseStyle(n) });
      card.append(textElement("strong", "group-heading-title", n.title));
      if (n.subtitle) card.append(textElement("span", "group-heading-subtitle", n.subtitle));
      if (teams.parents.has(n.id)) card.append(textElement("span", "group-toggle", teams.collapsed.has(n.id) ? "Mostrar ▾" : "Ocultar ▴"));
      frame.append(card);
      continue;
    }
    const kicker = textElement("div", "card-kicker", n.type === "EMPLOYEE" ? "" : labels[n.type]);
    if (["CEASED", "ABSENT"].includes(n.metadata.employmentStatus))
      kicker.append(
        textElement(
          "span",
          "ceased-tag",
          n.metadata.employmentStatus === "CEASED" ? "Cesado" : "Ausente",
        ),
      );
    if (n.type !== "EMPLOYEE") card.append(kicker);
    else if (kicker.firstChild) {
      const status = kicker.firstChild;
      status.className = "ceased-tag card-employment-status";
      card.append(status);
    }
    const content = cardContent(n, showNames);
    if (n.metadata.visualOnly) card.append(textElement("span", "visual-copy-label", "Solo visual"));
    const body = textElement("div", "card-content", "");
    body.append(textElement("strong", "card-title", content.heading));
    if (content.name) body.append(textElement("span", "card-subtitle", content.name));
    if (content.area) body.append(textElement("span", "card-details", content.area));
    if (content.branch) body.append(textElement("span", "card-details card-branch", content.branch));
    card.append(body);
    if (teams.parents.has(n.id)) {
      const count = teams.counts.get(n.id) || 0, closed = teams.collapsed.has(n.id);
      card.append(textElement("span", `collapse-button${closed ? " is-collapsed" : ""}`, `${count} ${count === 1 ? "persona" : "personas"} ${closed ? "▾" : "▴"}`));
    }
    frame.append(card);
  }
  document.body.append(frame);
  return frame;
}
function download(dataUrl, filename) {
  const [header, encoded] = dataUrl.split(","),
    bytes = Uint8Array.from(atob(encoded), (c) => c.charCodeAt(0));
  const blob = new Blob([bytes], {
    type: header.match(/data:([^;]+)/)?.[1] || "application/octet-stream",
  });
  const url = URL.createObjectURL(blob),
    a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 60000);
}
export async function exportGraph(
  graph,
  { format, company, version, showNames = true, onProgress = () => {}, hierarchy = graph, collapsed = new Set() },
) {
  if (!graph.nodes.length)
    throw new Error("No hay tarjetas visibles para exportar.");
  const teams = { counts: subordinateCounts(hierarchy), parents: new Set(hierarchy.edges.map((edge) => edge.source)), collapsed };
  const bounds = graphBounds(graph.nodes),
    date = new Date().toLocaleDateString("sv-SE"),
    base = `${company.replace(/[^\p{L}\p{N}-]/gu, "_")}_V${version}_${date}`;
  await document.fonts.ready;
  if (format !== "pdf") {
    if (
      bounds.width > 16000 ||
      bounds.height > 16000 ||
      bounds.width * bounds.height > 32e6
    )
      throw new Error(
        "El organigrama supera el límite de imagen. Contrae ramas, aplica filtros o utiliza PDF multipágina.",
      );
    const tile = exportTile(
      graph,
      bounds,
      showNames,
      0,
      0,
      bounds.width,
      bounds.height,
      teams,
    );
    try {
      const uri = await (format === "jpeg" ? toJpeg : toPng)(tile, {
        pixelRatio: 1,
        backgroundColor: "#ffffff",
        quality: 0.95,
        skipFonts: true,
        cacheBust: false,
        width: bounds.width,
        height: bounds.height,
        style: { position: "relative", left: "0", top: "0", zIndex: "1" },
      });
      download(uri, `${base}.${format === "jpeg" ? "jpg" : "png"}`);
    } finally {
      tile.remove();
    }
    return;
  }
  const { jsPDF } = await import("jspdf");
  const { tileWidth, tileHeight, stepX, stepY, cols, rows } = pdfGeometry(
    graph.nodes,
    bounds,
  );
  if (cols * rows > 200)
    throw new Error(
      "La exportación requiere más de 200 páginas. Aplica filtros o contrae ramas.",
    );
  const orientation = tileWidth >= tileHeight ? "landscape" : "portrait";
  const pdf = new jsPDF({
    orientation,
    unit: "mm",
    format: "a3",
    compress: true,
  });
  for (let row = 0; row < rows; row++)
    for (let col = 0; col < cols; col++) {
      const index = row * cols + col;
      if (index) pdf.addPage("a3", orientation);
      onProgress(index + 1, cols * rows);
      await new Promise((resolve) => requestAnimationFrame(resolve));
      const width = Math.min(tileWidth, bounds.width - col * stepX),
        height = Math.min(tileHeight, bounds.height - row * stepY),
        tile = exportTile(
          graph,
          bounds,
          showNames,
          col * stepX,
          row * stepY,
          width,
          height,
          teams,
        );
      try {
        const uri = await toJpeg(tile, {
          pixelRatio: 1,
          quality: 0.93,
          backgroundColor: "#ffffff",
          skipFonts: true,
          width,
          height,
          style: { position: "relative", left: "0", top: "0", zIndex: "1" },
        });
        const scale = Math.min(
          (pdf.internal.pageSize.getWidth() - 20) /
            Math.min(tileWidth, bounds.width),
          (pdf.internal.pageSize.getHeight() - 30) /
            Math.min(tileHeight, bounds.height),
        );
        pdf.addImage(
          uri,
          "JPEG",
          10,
          10,
          width * scale,
          height * scale,
          undefined,
          "FAST",
        );
        pdf.setFontSize(8);
        pdf.text(
          `${base}  |  ${index + 1}/${cols * rows}  |  ${col + 1},${row + 1}`,
          10,
          pdf.internal.pageSize.getHeight() - 7,
        );
      } finally {
        tile.remove();
      }
    }
  pdf.save(`${base}.pdf`);
}
