export function cardTextStyle(style = {}) {
  return {
    textAlign: style.textAlign || "left",
    "--card-weight": style.bold === false ? "400" : "650",
    "--card-subtitle-weight": style.bold ? "700" : "400",
    "--card-font-style": style.italic ? "italic" : "normal",
    "--card-decoration": style.strikethrough ? "line-through" : "none",
  };
}
export function cardTextColor(node) {
  return node.metadata?.employmentStatus === "CEASED" ? "#c62828" : node.style.textColor;
}
export function groupBaseStyle(node) {
  const double = ["BUSINESS_LINE", "AREA"].includes(node.type);
  return { borderBottomStyle: double ? "double" : "solid", borderBottomWidth: double ? "4px" : "2px" };
}

export function connectionAnchor(node, handle, fallback) {
  const side = handle?.split("-")[1] || fallback;
  const offset = 0.5;
  return {
    x: node.position.x + (side === "left" ? 0 : side === "right" ? node.width : node.width * offset),
    y: node.position.y + (side === "top" ? 0 : side === "bottom" ? node.height : node.height * offset),
    side,
  };
}
