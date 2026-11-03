export function cardContent(node, showNames = true) {
  const employee = node.type === "EMPLOYEE";
  return {
    heading: employee ? node.subtitle || "Puesto sin especificar" : node.title,
    name: employee ? (showNames ? node.title : "") : node.subtitle,
    area: employee ? `Área: ${node.metadata?.area || "Sin especificar"}` : "",
    branch: employee ? node.metadata?.branch || "Sin especificar" : "",
  };
}
