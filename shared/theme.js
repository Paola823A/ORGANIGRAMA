import { isGroupingNode } from "./graph.js";
export const AUTRISA_BLUE = "#30306c";
export function companyTheme(name='') {
  const normalized=name.normalize('NFD').replace(/[\u0300-\u036f]/g,'').toUpperCase().replace(/[^A-Z0-9]/g,'');
  if(normalized.includes('INCAMOTORS')) return {key:'incamotors',color:'#b8873e',accent:'#926625',hover:'#6d4b17',soft:'#f8f0e2'};
  if(normalized.includes('NOVAAUTO')) return {key:'nova-autos',color:'#656a70',accent:'#656a70',hover:'#494e54',soft:'#eef0f2'};
  return {key:'autrisa',color:AUTRISA_BLUE,accent:AUTRISA_BLUE,hover:'#242452',soft:'#ededf8'};
}

export function applyBrandTheme(graph,company='') {
  const brand=companyTheme(company);
  return { ...graph, nodes: graph.nodes.map((node) => node.type === "JUNCTION" || node.metadata?.brandTheme === brand.key || brand.key==='autrisa' && node.metadata?.autrisaTheme === 1 ? node : {
    ...node,
    style: { ...node.style, borderColor: brand.color, ...(isGroupingNode(node) ? { textColor: brand.color } : {}) },
    metadata: { ...node.metadata, autrisaTheme: 1,brandTheme:brand.key },
  }), edges:graph.edges.map(edge=>edge.style?.brandTheme===brand.key ? edge : {...edge,style:{color:brand.color,width:1.5,lineType:'solid',...edge.style,...(!edge.style?.color || ['#94a3b8',AUTRISA_BLUE].includes(edge.style.color) || edge.style.brandTheme ? {color:brand.color}:{}),brandTheme:brand.key}}) };
}
