import {getSmoothStepPath} from '@vue-flow/core';
import {connectionAnchor} from './cardStyle.js';
// Hidden junctions still join at their centre; keep the authored route intact.
export function presentationEdgePath(path,source,target,sourceAnchor,targetAnchor) {
 if(source?.type==='JUNCTION') path=`M${source.position.x+source.width/2} ${source.position.y+source.height/2} L${sourceAnchor.x} ${sourceAnchor.y} ${path}`;
 if(target?.type==='JUNCTION') path+=` L${target.position.x+target.width/2} ${target.position.y+target.height/2}`;
 return path;
}
// Model coordinates only: zoom/pan are applied once by Vue Flow's viewport.
export function modelEdgePath(graph,edge,nodes=new Map(graph.nodes.map(n=>[n.id,n])),presentation=false) {
 const source=nodes.get(edge.source),target=nodes.get(edge.target);
 if(!source || !target) return '';
 const a=connectionAnchor(source,edge.style?.sourceHandle || 'source-bottom','bottom'),b=connectionAnchor(target,edge.style?.targetHandle || 'target-top','top');
 const path=edge.layoutPath || getSmoothStepPath({sourceX:a.x,sourceY:a.y,sourcePosition:a.side,targetX:b.x,targetY:b.y,targetPosition:b.side})[0];
 return presentation ? presentationEdgePath(path,source,target,a,b):path;
}
