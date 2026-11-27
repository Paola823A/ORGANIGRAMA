export function rectangleBounds(a,b) {
 return {x:Math.min(a.x,b.x),y:Math.min(a.y,b.y),width:Math.abs(a.x-b.x),height:Math.abs(a.y-b.y)};
}
export function nodesInRectangle(nodes,a,b) {
 const box=rectangleBounds(a,b);
 return nodes.filter(n=>n.position.x<=box.x+box.width && n.position.x+n.width>=box.x && n.position.y<=box.y+box.height && n.position.y+n.height>=box.y).map(n=>n.id);
}
