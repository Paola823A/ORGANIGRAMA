import {normalize} from '../../../shared/graph.js';
export const boardFilterLabels={businessLine:'Giro',area:'Área',branch:'Sede',position:'Puesto'};
export function positionGroup(value) {
 const text=normalize(value);
 for(const [pattern,label] of [[/JEF/,'Jefes'],[/SUPERVIS/,'Supervisores'],[/AUXILIAR/,'Auxiliares'],[/TECNIC/,'Técnicos'],[/GERENT/,'Gerentes'],[/ASISTENT/,'Asistentes'],[/ANALISTA/,'Analistas'],[/COORDIN/,'Coordinadores'],[/PRACTIC/,'Practicantes']]) if(pattern.test(text)) return label;
 return value || 'Sin puesto';
}
export function filterValue(node,key) {return key==='position' ? positionGroup(node.subtitle):node.metadata?.[key] || '';}
export function matchesBoard(node,filters,except) {return Object.entries(filters).every(([key,value])=>key===except || !value || filterValue(node,key)===value);}
export function boardOptions(nodes,filters) {
 const people=nodes.filter(n=>n.type==='EMPLOYEE');
 return Object.fromEntries(Object.keys(boardFilterLabels).map(key=>[key,[...new Set(people.filter(n=>matchesBoard(n,filters,key)).map(n=>filterValue(n,key)).filter(Boolean))].sort((a,b)=>a.localeCompare(b,'es'))]));
}
