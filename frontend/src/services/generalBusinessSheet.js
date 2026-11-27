import {graphAncestors,normalize,validateGraph} from '../../../shared/graph.js';
import {companyTheme} from '../../../shared/theme.js';
const clone=value=>JSON.parse(JSON.stringify(value));

// Copy authored subgraphs. Only translate whole branches: never re-layout their cards.
export function generalBusinessSheet(graph,line,company='') {
 const source=new Map(graph.nodes.map(n=>[n.id,n]));
 const people=graph.nodes.filter(n=>n.type==='EMPLOYEE' && normalize(n.metadata?.businessLine)===normalize(line));
 const ancestors=new Map(people.map(n=>[n.id,graphAncestors(graph,n.id)]));
 const ownManagers=people.filter(n=>/GERENTE/.test(normalize(n.subtitle)));
 const common=graph.nodes.filter(n=>n.type==='EMPLOYEE' && !people.some(p=>p.id===n.id) && /GERENTE/.test(normalize(n.subtitle)) && people.length && people.every(p=>ancestors.get(p.id).has(n.id)));
 const candidates=ownManagers.length ? ownManagers:common;
 const manager=candidates.sort((a,b)=>ownManagers.length
  ? graphAncestors(graph,a.id).size-graphAncestors(graph,b.id).size
  : graphAncestors(graph,b.id).size-graphAncestors(graph,a.id).size)[0];
 const theme=companyTheme(company),nodes=[],edges=[],used=new Set();
 const id=(kind,value)=>`sheet:${encodeURIComponent(line)}:${kind}:${encodeURIComponent(value)}`;
 function heading(key,type,title) {
  const authored=graph.nodes.find(n=>n.type===type && normalize(n.title)===normalize(title));
  return {...(authored ? clone(authored):{type,title,subtitle:'',employeeId:null,width:252,height:64,style:{textAlign:'center',backgroundColor:'#ffffff',borderColor:theme.color,textColor:theme.headingColor,borderStyle:'solid'},metadata:{},siblingOrder:0,collapsed:false}),id:key,position:{x:0,y:0},metadata:{...(authored?.metadata || {}),sheetViews:undefined}};
 }
 function link(a,b) {
  let key=`sheet-edge:${edges.length}`;while(used.has(key)) key+='x';used.add(key);
  edges.push({id:key,source:a,target:b,style:{color:theme.lineColor,width:1.5,lineType:'solid',sourceHandle:'source-bottom',targetHandle:'target-top'}});
 }
 const root=heading(id('line','root'),'BUSINESS_LINE',line);nodes.push(root);
 if(manager) {const copy=clone(manager);delete copy.metadata.sheetViews;nodes.push(copy);link(root.id,manager.id);}
 const branches=[...new Set(people.filter(n=>n.id!==manager?.id).map(n=>n.metadata?.branch || 'Sin sede'))].sort((a,b)=>a.localeCompare(b,'es'));
 const parents=new Map(),children=new Map();
 for(const e of graph.edges) {if(!parents.has(e.target)) parents.set(e.target,[]);parents.get(e.target).push(e.source);if(!children.has(e.source)) children.set(e.source,[]);children.get(e.source).push(e.target);}
 const branchTop=manager ? 160+manager.height+90:150;
 let cursor=0;
 const occupied=new Set(nodes.map(n=>n.id));
 for(const [branchIndex,branch] of branches.entries()) {
  const members=people.filter(n=>n.id!==manager?.id && (n.metadata?.branch || 'Sin sede')===branch),memberIds=new Set(members.map(n=>n.id)),included=new Set(memberIds);
  // Keep intermediate junctions, areas, vacancies and manual cards on the authored paths.
  const queue=[...memberIds];
  while(queue.length) {
   const current=queue.shift();
   for(const candidate of [...(parents.get(current)||[]),...(children.get(current)||[])]) {
    const n=source.get(candidate);
    if(!n || included.has(candidate) || n.id===manager?.id || ['BRANCH','BUSINESS_LINE'].includes(n.type) || (n.type==='EMPLOYEE'&&!memberIds.has(n.id))) continue;
    included.add(candidate);queue.push(candidate);
   }
  }
  const originals=graph.nodes.filter(n=>included.has(n.id));
  const minX=Math.min(...originals.map(n=>n.position.x)),minY=Math.min(...originals.map(n=>n.position.y));
  const width=Math.max(252,...originals.map(n=>n.position.x+n.width-minX));
  const ids=new Map(originals.map((n,i)=>[n.id,occupied.has(n.id) ? `sheet-copy:${branchIndex}:${i}:${n.id.slice(-36)}`:n.id]));
  const branchNode=heading(id('branch',branch),'BRANCH',branch);branchNode.position={x:cursor+(width-branchNode.width)/2,y:branchTop};nodes.push(branchNode);occupied.add(branchNode.id);
  link(manager?.id || root.id,branchNode.id);
  for(const n of originals) {const copy=clone(n);copy.id=ids.get(n.id);copy.position={x:cursor+n.position.x-minX,y:branchTop+branchNode.height+90+n.position.y-minY};delete copy.metadata.sheetViews;nodes.push(copy);occupied.add(copy.id);}
  const internal=graph.edges.filter(e=>included.has(e.source)&&included.has(e.target));
  for(const e of internal) {
   let key=e.id;while(used.has(key)) key=`sheet-copy-edge:${branchIndex}:${used.size}`;
   used.add(key);edges.push({...clone(e),id:key,source:ids.get(e.source),target:ids.get(e.target)});
  }
  const targets=new Set(internal.map(e=>e.target));
  for(const n of originals) if(!targets.has(n.id)) link(branchNode.id,ids.get(n.id));
  cursor+=width+100;
 }
 root.position={x:Math.max(0,(cursor-100-root.width)/2),y:0};
 if(manager) nodes.find(n=>n.id===manager.id).position={x:root.position.x+(root.width-manager.width)/2,y:130};
 const result={nodes,edges,deletedCards:[]};validateGraph(result);return result;
}

export function copyGeneralBusinessStructures(workspace,company='',sheetIds=null) {
 const changed=[];
 for(const sheet of workspace.sheets) {
  if((sheetIds && !sheetIds.includes(sheet.id)) || sheet.deleted || sheet.kind!=='BUSINESS' || normalize(sheet.businessLine || sheet.name)==='POST VENTA' || normalize(sheet.name)==='POST VENTA') continue;
  const next=generalBusinessSheet(workspace.general,sheet.businessLine || sheet.name,company);
  // Preserve sheet-only cards and their connections, outside the copied structure.
  const present=new Set(next.nodes.map(n=>n.id));
  const extras=(sheet.graph?.nodes || []).filter(n=>!present.has(n.id) && !n.id.startsWith('sheet:'));
  if(extras.length) {
   const bottom=Math.max(...next.nodes.map(n=>n.position.y+n.height))+120,minY=Math.min(...extras.map(n=>n.position.y));
   next.nodes.push(...extras.map(n=>({...clone(n),position:{x:n.position.x,y:bottom+n.position.y-minY}})));
   const ids=new Set(next.nodes.map(n=>n.id)),edgeIds=new Set(next.edges.map(e=>e.id));
   for(const edge of sheet.graph.edges) if(ids.has(edge.source)&&ids.has(edge.target)&&!next.edges.some(e=>e.source===edge.source&&e.target===edge.target)) {
    let key=edge.id;while(edgeIds.has(key)) key=crypto.randomUUID();edgeIds.add(key);next.edges.push({...clone(edge),id:key});
   }
  }
  validateGraph(next);sheet.graph=next;changed.push({id:sheet.id,name:sheet.name,nodes:next.nodes.length,edges:next.edges.length});
 }
 return changed;
}
