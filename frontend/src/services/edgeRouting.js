// A small junction anchors a dragged line without moving any employee cards.
export function splitGraphEdge(graph,connectionId,position,direction='down',id=crypto.randomUUID(),nextEdgeId=crypto.randomUUID()) {
  const edge=graph.edges.find(item=>item.id===connectionId);
  if(!edge) throw new Error('La conexión ya no existe.');
  const handles={down:['target-top','source-bottom'],up:['target-bottom','source-top'],right:['target-left','source-right'],left:['target-right','source-left']}[direction];
  const color=edge.style?.color || '#94a3b8';
  const node={id,type:'JUNCTION',employeeId:null,title:'Punto de unión',subtitle:'',
    position:{x:position.x-4,y:position.y-4},width:8,height:8,
    style:{backgroundColor:color,textColor:'#243247',borderColor:color,borderStyle:'solid'},metadata:{},siblingOrder:graph.nodes.length,collapsed:false};
  return {...graph,nodes:[...graph.nodes,node],edges:graph.edges.flatMap(item=>item.id!==connectionId ? [item]:[
    {...edge,target:id,style:{color,width:1.5,lineType:'solid',...edge.style,targetHandle:handles[0]}},
    {...edge,id:nextEdgeId,source:id,style:{color,width:1.5,lineType:'solid',...edge.style,sourceHandle:handles[1]}}
  ])};
}
