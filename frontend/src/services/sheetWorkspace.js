import {businessSheet} from './businessSheets.js';
const clone=value=>JSON.parse(JSON.stringify(value));
function clean(graph) {const result=clone(graph);for(const n of result.nodes) delete n.metadata.sheetViews;return result;}
function share(target,source) {
 const byId=new Map(source.nodes.filter(n=>n.type==='EMPLOYEE').map(n=>[n.id,n]));
 return {...target,nodes:target.nodes.map(n=>{
  const current=byId.get(n.id);if(!current) return n;
  return {...n,title:current.title,subtitle:current.subtitle,employeeId:current.employeeId,metadata:{...n.metadata,...current.metadata,sheetViews:undefined}};
 })};
}
export function openWorkspace(graph) {
 const sheets=clone(graph.nodes[0]?.metadata?.sheetViews || {});
 return {general:clean(graph),sheets};
}
export function updateWorkspace(workspace,line,graph) {
 const next=clean(graph);
 if(line) workspace.sheets[line]=next;else workspace.general=next;
 workspace.general=share(workspace.general,next);
 for(const key of Object.keys(workspace.sheets)) workspace.sheets[key]=share(workspace.sheets[key],next);
}
export function workspaceView(workspace,line,company) {
 if(!line) return clone(workspace.general);
 if(!workspace.sheets[line]) workspace.sheets[line]=businessSheet(workspace.general,line,company);
 else {
  const saved=workspace.sheets[line],fresh=businessSheet(workspace.general,line,company);
  const ids=new Set(saved.nodes.map(n=>n.id));
  const additions=fresh.nodes.filter(n=>n.type==='EMPLOYEE' && !ids.has(n.id));
  if(additions.length) {
   const required=new Set(additions.map(n=>n.id));
   // Include missing grouping headings on the incoming route, not other staff.
   let changed=true;
   while(changed) {changed=false;for(const e of fresh.edges) if(required.has(e.target) && !ids.has(e.source) && !required.has(e.source) && fresh.nodes.find(n=>n.id===e.source)?.type!=='EMPLOYEE'){required.add(e.source);changed=true;}}
   const bottom=Math.max(0,...saved.nodes.map(n=>n.position.y+n.height))+100;
   const added=fresh.nodes.filter(n=>required.has(n.id) && !ids.has(n.id));
   added.forEach((n,i)=>{saved.nodes.push({...n,position:{x:(i%5)*300,y:bottom+Math.floor(i/5)*180}});ids.add(n.id);});
   saved.edges.push(...fresh.edges.filter(e=>required.has(e.target) && ids.has(e.source) && !saved.edges.some(old=>old.source===e.source && old.target===e.target)));
  }
 }
 return clone(share(workspace.sheets[line],workspace.general));
}
export function serializeWorkspace(workspace) {
 const graph=clean(workspace.general);
 if(graph.nodes.length && Object.keys(workspace.sheets).length) graph.nodes[0].metadata.sheetViews=clone(workspace.sheets);
 return graph;
}
