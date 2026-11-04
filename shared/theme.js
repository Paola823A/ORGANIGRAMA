import { isGroupingNode } from "./graph.js";
export const AUTRISA_BLUE = "#30306c";
export function companyTheme(name='') {
  const normalized=name.normalize('NFD').replace(/[\u0300-\u036f]/g,'').toUpperCase().replace(/[^A-Z0-9]/g,'');
  if(normalized.includes('INCAMOTORS')) return {key:'incamotors',color:'#b8873e',lineColor:'#555555',headingColor:'#000000',accent:'#926625',hover:'#6d4b17',soft:'#f8f0e2'};
  if(normalized.includes('NOVAAUTO')) return {key:'nova-autos',color:'#656a70',lineColor:'#656a70',headingColor:'#656a70',accent:'#656a70',hover:'#494e54',soft:'#eef0f2'};
  return {key:'autrisa',color:AUTRISA_BLUE,lineColor:AUTRISA_BLUE,headingColor:AUTRISA_BLUE,accent:AUTRISA_BLUE,hover:'#242452',soft:'#ededf8'};
}

export function applyBrandTheme(graph,company='') {
  const brand=companyTheme(company);
  return { ...graph, nodes: graph.nodes.map(node=>{
    if(node.type==='JUNCTION') return node;
    const current=node.metadata?.brandTheme===brand.key || brand.key==='autrisa' && node.metadata?.autrisaTheme===1;
    if(current && !(brand.key==='incamotors' && isGroupingNode(node) && node.metadata?.brandPalette!==2)) return node;
    return {...node,style:{...node.style,...(!current ? {borderColor:brand.color}:{}),...(isGroupingNode(node) ? {textColor:brand.headingColor}:{})},metadata:{...node.metadata,autrisaTheme:1,brandTheme:brand.key,brandPalette:2}};
  }),edges:graph.edges.map(edge=>{
    if(edge.style?.brandTheme===brand.key && (brand.key!=='incamotors' || edge.style.brandPalette===2)) return edge;
    return {...edge,style:{color:brand.lineColor,width:1.5,lineType:'solid',...edge.style,...(brand.key==='incamotors' || !edge.style?.color || ['#94a3b8',AUTRISA_BLUE].includes(edge.style.color) || edge.style.brandTheme ? {color:brand.lineColor}:{}),brandTheme:brand.key,brandPalette:2}};
  }) };
}
