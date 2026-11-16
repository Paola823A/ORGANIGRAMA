import {normalize,countPeople} from '../../../shared/graph.js';
export function positionCounts(nodes,filters={}) {
 const groups=new Map();
 for(const node of nodes) if(node.type==='EMPLOYEE' && matchesBoard(node,filters,'position')) {
  const key=positionGroup(node.subtitle);
  if(!groups.has(key)) groups.set(key,[]);
  groups.get(key).push(node);
 }
 return Object.fromEntries([...groups].map(([key,people])=>[key,countPeople({nodes:people})]));
}
export const boardFilterLabels={businessLine:'Línea de negocio',area:'Área',branch:'Sede',position:'Puesto'};
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
