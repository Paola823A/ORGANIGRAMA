import {normalize,graphAncestors} from '../../../shared/graph.js';
import {companyTheme} from '../../../shared/theme.js';
import {autoLayout} from './layout.js';
import {generalBusinessSheet} from './generalBusinessSheet.js';
export function businessLines(graph) {
 return [...new Set(graph.nodes.filter(n=>n.type==='EMPLOYEE').map(n=>n.metadata?.businessLine).filter(Boolean))].sort((a,b)=>a.localeCompare(b,'es'));
}
export function businessSheet(graph,line,company='') {
 if(normalize(line)!=='POST VENTA') return generalBusinessSheet(graph,line,company);
 const people=graph.nodes.filter(n=>n.type==='EMPLOYEE' && normalize(n.metadata?.businessLine)===normalize(line));
 const theme=companyTheme(company),nodes=[],edges=[];
 const id=(kind,value)=>`sheet:${encodeURIComponent(line)}:${kind}:${encodeURIComponent(value)}`;
 function heading(key,type,title) {return {id:key,type,title,subtitle:'',employeeId:null,width:252,height:64,position:{x:0,y:0},style:{textAlign:'center',backgroundColor:'#ffffff',borderColor:theme.color,textColor:theme.headingColor,borderStyle:'solid'},metadata:{},siblingOrder:nodes.length,collapsed:false};}
 function link(source,target) {edges.push({id:`sheet-edge:${edges.length}`,source,target,style:{color:theme.lineColor,width:1.5,lineType:'solid',sourceHandle:'source-bottom',targetHandle:'target-top'}});}
 const root=id('line','root');nodes.push(heading(root,'BUSINESS_LINE',line));
 const branches=[...new Set(people.map(n=>n.metadata?.branch || 'Sin sede'))].sort((a,b)=>a.localeCompare(b,'es'));
 for(const branch of branches) {
  const branchId=id('branch',branch);nodes.push(heading(branchId,'BRANCH',branch));link(root,branchId);
  const members=people.filter(n=>(n.metadata?.branch || 'Sin sede')===branch);
  for(const member of members) {
   nodes.push({...member,position:{...member.position}});
   // Reuse the authored hierarchy through junctions and grouping headings.
   const ancestors=graphAncestors(graph,member.id);
   const managers=members.filter(n=>n.id!==member.id && ancestors.has(n.id));
   const nearest=managers.filter(n=>!managers.some(other=>other.id!==n.id && graphAncestors(graph,other.id).has(n.id)));
   if(nearest.length) nearest.forEach(manager=>link(manager.id,member.id));
   else link(branchId,member.id);
  }
 }
 return {...graph,nodes:autoLayout({nodes,edges}).nodes,edges};
}
