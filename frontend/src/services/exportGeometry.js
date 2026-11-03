export function graphBounds(nodes) {
  const x = Math.min(...nodes.map((n) => n.position.x)) - 40;
  const y = Math.min(...nodes.map((n) => n.position.y)) - 40;
  return {
    x,
    y,
    width: Math.ceil(
      Math.max(...nodes.map((n) => n.position.x + n.width)) - x + 40,
    ),
    height: Math.ceil(
      Math.max(...nodes.map((n) => n.position.y + n.height)) - y + 40,
    ),
  };
}
export function pdfGeometry(nodes, bounds, singlePage = false) {
  if (singlePage) return {tileWidth:bounds.width,tileHeight:bounds.height,stepX:bounds.width,stepY:bounds.height,cols:1,rows:1};
  const maxWidth = Math.max(...nodes.map((n) => n.width));
  const maxHeight = Math.max(...nodes.map((n) => n.height));
  const tileWidth = Math.max(1500, maxWidth + 80);
  const tileHeight = Math.max(1000, maxHeight + 80);
  const stepX = tileWidth - maxWidth - 20;
  const stepY = tileHeight - maxHeight - 20;
  return {
    tileWidth,
    tileHeight,
    stepX,
    stepY,
    cols: Math.max(1, Math.ceil((bounds.width - maxWidth - 20) / stepX)),
    rows: Math.max(1, Math.ceil((bounds.height - maxHeight - 20) / stepY)),
  };
}
export function isCompleteInTile(node, bounds, left, top, width, height) {
  const x = node.position.x - bounds.x - left;
  const y = node.position.y - bounds.y - top;
  return (
    x >= 0 && y >= 0 && x + node.width <= width && y + node.height <= height
  );
}
