import {normalize} from './graph.js';
export function cardKey(node) {return node.employeeId ? `employee:${node.employeeId}` : `node:${node.id}`;}
export function businessLineNames(graph) {
 const names=new Map();
 for(const n of graph.nodes) if(n.type==='EMPLOYEE' && n.metadata?.businessLine && normalize(n.metadata.businessLine)!=='SOPORTE') names.set(normalize(n.metadata.businessLine),n.metadata.businessLine);
 names.set('VCE','VCE');
 return [...names.values()].sort((a,b)=>a.localeCompare(b,'es'));
}
