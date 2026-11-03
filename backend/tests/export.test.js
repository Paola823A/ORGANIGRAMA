import { test } from "node:test";
import assert from "node:assert/strict";
import {
  graphBounds,
  pdfGeometry,
  isCompleteInTile,
} from "../../frontend/src/services/exportGeometry.js";
test("exportación PDF: cada tarjeta tiene al menos una representación completa, incluso con tamaños grandes y coordenadas negativas", () => {
  const nodes = Array.from({ length: 200 }, (_, i) => ({
    position: {
      x: (i % 40) * 301 - 4000.25,
      y: Math.floor(i / 40) * 211 - 200.5,
    },
    width: i % 19 === 0 ? 1800 : 252,
    height: i % 31 === 0 ? 1300 : 110,
  }));
  const bounds = graphBounds(nodes),
    g = pdfGeometry(nodes, bounds);
  for (const n of nodes) {
    let included = false;
    for (let row = 0; row < g.rows; row++)
      for (let col = 0; col < g.cols; col++)
        included ||= isCompleteInTile(
          n,
          bounds,
          col * g.stepX,
          row * g.stepY,
          Math.min(g.tileWidth, bounds.width - col * g.stepX),
          Math.min(g.tileHeight, bounds.height - row * g.stepY),
        );
    assert.equal(included, true);
  }
});
