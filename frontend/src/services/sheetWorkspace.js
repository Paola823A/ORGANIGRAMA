import {businessSheet} from './businessSheets.js';
import {businessLineNames,cardKey} from '../../../shared/sheetState.js';
import {normalize} from '../../../shared/graph.js';
const clone=value=>JSON.parse(JSON.stringify(value));
function clean(graph) {
 const result=clone({nodes:graph.nodes,edges:graph.edges,deletedCards:graph.deletedCards || []});
 for(const n of result.nodes) delete n.metadata.sheetViews;
 return result;
}
function share(target,source) {
 const byId=new Map(source.nodes.filter(n=>n.type==='EMPLOYEE').map(n=>[n.employeeId,n]));
 return {...target,nodes:target.nodes.map(n=>{
  const current=byId.get(n.employeeId);if(!current || n.type!=='EMPLOYEE') return n;
  return {...n,title:current.title,subtitle:current.subtitle,metadata:{...n.metadata,...current.metadata,sheetViews:undefined}};
 })};
}
export function openWorkspace(graph) {
 const state=graph.workspaceState;
 const general=clean({...graph,deletedCards:state?.deletedCards || graph.deletedCards || []});
 if(state?.version===2) return {general,sheets:clone(state.sheets)};
 const legacy=graph.nodes.reduce((all,n)=>Object.assign(all,n.metadata?.sheetViews || {}),{});
 const names=[...new Set([...businessLineNames(graph),...Object.keys(legacy)])];
 const sheets=names.map(name=>({id:crypto.randomUUID(),name,kind:normalize(name)==='SOPORTE' ? 'ARCHIVED':'BUSINESS',businessLine:name,deleted:false,graph:legacy[name] ? clean(legacy[name]):null}));
 return {general,sheets};
}
export function workspaceTabs(workspace,archived=false) {return workspace.sheets.filter(s=>!s.deleted && (archived ? s.kind==='ARCHIVED':s.kind!=='ARCHIVED'));}
function findSheet(workspace,key) {return workspace.sheets.find(s=>s.id===key) || workspace.sheets.find(s=>s.businessLine===key || s.name===key);}
export function updateWorkspace(workspace,key,graph) {
 const next=clean(graph);
 if(key) {const sheet=findSheet(workspace,key);if(!sheet || sheet.deleted) throw new Error('La hoja ya no está disponible.');sheet.graph=next;}
 else workspace.general=next;
 workspace.general=share(workspace.general,next);
 for(const sheet of workspace.sheets) if(sheet.graph && !sheet.deleted) sheet.graph=share(sheet.graph,next);
}
export function workspaceView(workspace,key,company) {
 if(!key) return clone(workspace.general);
 const sheet=findSheet(workspace,key);
 if(!sheet || sheet.deleted) throw new Error('La hoja ya no está disponible.');
 if(!sheet.graph) sheet.graph=sheet.kind==='BUSINESS' ? businessSheet(workspace.general,sheet.businessLine,company):{nodes:[],edges:[],deletedCards:[]};
 else if(sheet.kind==='BUSINESS') {
  const fresh=businessSheet(workspace.general,sheet.businessLine,company),saved=sheet.graph;
  const ids=new Set(saved.nodes.map(n=>n.id)),removed=new Set(saved.deletedCards || []);
  const incoming=fresh.nodes.filter(n=>n.type==='EMPLOYEE' && !ids.has(n.id) && !removed.has(cardKey(n)));
  const required=new Set(incoming.map(n=>n.id));
  let changed=true;
  while(changed){changed=false;for(const e of fresh.edges) if(required.has(e.target)&&!ids.has(e.source)&&!required.has(e.source)&&fresh.nodes.find(n=>n.id===e.source)?.type!=='EMPLOYEE'&&!removed.has(`node:${e.source}`)){required.add(e.source);changed=true;}}
  const bottom=Math.max(0,...saved.nodes.map(n=>n.position.y+n.height))+100;
  fresh.nodes.filter(n=>required.has(n.id)&&!ids.has(n.id)).forEach((n,i)=>{saved.nodes.push({...n,position:{x:i%5*300,y:bottom+Math.floor(i/5)*180}});ids.add(n.id);});
  for(const e of fresh.edges) if(required.has(e.target)&&ids.has(e.source)&&!saved.edges.some(old=>old.source===e.source&&old.target===e.target)) saved.edges.push(e);
 }
 sheet.graph=share(sheet.graph,workspace.general);
 return clone(sheet.graph);
}
export function serializeWorkspace(workspace) {
 return {...clean(workspace.general),workspaceState:{version:2,deletedCards:workspace.general.deletedCards || [],sheets:clone(workspace.sheets)}};
}
export function createSheet(workspace,name) {
 name=name.trim();if(!name || name.length>100) throw new Error('El nombre debe tener entre 1 y 100 caracteres.');
 const sheet={id:crypto.randomUUID(),name,kind:'CUSTOM',businessLine:null,deleted:false,graph:{nodes:[],edges:[],deletedCards:[]}};
 workspace.sheets.push(sheet);return sheet;
}
export function renameSheet(workspace,id,name) {const sheet=findSheet(workspace,id);name=name.trim();if(!sheet || !name || name.length>100) throw new Error('Nombre de hoja inválido.');sheet.name=name;}
export function duplicateSheet(workspace,id,name,company) {const graph=workspaceView(workspace,id,company),copy=createSheet(workspace,name);copy.graph=clean(graph);return copy;}
export function deleteSheet(workspace,id) {const sheet=findSheet(workspace,id);if(!sheet) throw new Error('Hoja inexistente.');sheet.deleted=true;}
export function moveSheet(workspace,id,direction) {
 const visible=workspaceTabs(workspace),index=visible.findIndex(s=>s.id===id),neighbor=visible[index+direction];
 if(index<0 || !neighbor) return;
 const from=workspace.sheets.findIndex(s=>s.id===id),to=workspace.sheets.findIndex(s=>s.id===neighbor.id);
 [workspace.sheets[from],workspace.sheets[to]]=[workspace.sheets[to],workspace.sheets[from]];
}
export function reorderSheet(workspace,id,targetId,after=false) {
 if(id===targetId) return false;
 const visible=workspaceTabs(workspace);
 if(!visible.some(s=>s.id===id) || !visible.some(s=>s.id===targetId)) return false;
 const from=workspace.sheets.findIndex(s=>s.id===id);
 const [sheet]=workspace.sheets.splice(from,1);
 const target=workspace.sheets.findIndex(s=>s.id===targetId);
 workspace.sheets.splice(target+(after ? 1:0),0,sheet);
 return true;
}
