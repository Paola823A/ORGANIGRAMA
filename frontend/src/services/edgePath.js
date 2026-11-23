import {getSmoothStepPath} from '@vue-flow/core';
import {connectionAnchor} from './cardStyle.js';
// Model coordinates only: zoom/pan are applied once by Vue Flow's viewport.
export function modelEdgePath(graph,edge,nodes=new Map(graph.nodes.map(n=>[n.id,n]))) {
 if(edge.layoutPath) return edge.layoutPath;
 const source=nodes.get(edge.source),target=nodes.get(edge.target);
 if(!source || !target) return '';
 const a=connectionAnchor(source,edge.style?.sourceHandle || 'source-bottom','bottom'),b=connectionAnchor(target,edge.style?.targetHandle || 'target-top','top');
 return getSmoothStepPath({sourceX:a.x,sourceY:a.y,sourcePosition:a.side,targetX:b.x,targetY:b.y,targetPosition:b.side})[0];
}
