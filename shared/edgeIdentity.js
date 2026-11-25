// Preserve valid IDs, endpoints, styles and parallel routes. Only repair bad identities.
export function repairEdgeIds(graph,createId=()=>crypto.randomUUID()) {
 const reserved=new Set(graph.edges.filter(e=>typeof e.id==='string' && e.id.length>0 && e.id.length<=100).map(e=>e.id));
 const seen=new Set(),repairs=[];
 const edges=graph.edges.map((edge,index)=>{
  let id=edge.id;
  if(typeof id!=='string' || !id || id.length>100 || seen.has(id)) {
   do {id=createId();} while(reserved.has(id));
   reserved.add(id);repairs.push({index,previousId:edge.id,id});
  }
  seen.add(id);
  return id===edge.id ? edge:{...edge,id};
 });
 return {graph:repairs.length ? {...graph,edges}:graph,repairs};
}
