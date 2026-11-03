import { getSmoothStepPath } from '@vue-flow/core';
import { isGroupingNode } from '../../../shared/graph.js';
import { cardContent } from './cardContent.js';
import { cardTextColor,connectionAnchor } from './cardStyle.js';

// Native PDF text and drawing commands remain sharp at any zoom level.
export function drawVectorGraph(pdf,graph,bounds,{teams,showNames=true}) {
  const pageW=pdf.internal.pageSize.getWidth(),pageH=pdf.internal.pageSize.getHeight();
  const scale=Math.min((pageW-20)/bounds.width,(pageH-25)/bounds.height);
  const offsetX=(pageW-bounds.width*scale)/2,offsetY=(pageH-5-bounds.height*scale)/2;
  const x=value=>offsetX+(value-bounds.x)*scale,y=value=>offsetY+(value-bounds.y)*scale;
  const color=value=>/^#[0-9a-f]{6}$/i.test(value || '') ? value:'#30306c';
  const nodes=new Map(graph.nodes.map(n=>[n.id,n]));
  for(const edge of graph.edges) {
    const source=nodes.get(edge.source),target=nodes.get(edge.target);
    if(!source || !target) continue;
    const a=connectionAnchor(source,edge.style?.sourceHandle,'bottom'),b=connectionAnchor(target,edge.style?.targetHandle,'top');
    const path=edge.layoutPath || getSmoothStepPath({sourceX:a.x,sourceY:a.y,sourcePosition:a.side,targetX:b.x,targetY:b.y,targetPosition:b.side,borderRadius:0})[0];
    const tokens=path.match(/[MLQ]|-?\d+(?:\.\d+)?(?:e[-+]?\d+)?/gi) || [];
    let previous=null;
    pdf.setDrawColor(color(edge.style?.color));pdf.setLineWidth((edge.style?.width || 1.5)*scale);
    pdf.setLineDashPattern(edge.style?.lineType==='dashed' ? [6*scale,4*scale]:[],0);
    for(let i=0;i<tokens.length;) {
      const command=tokens[i++],count=command==='Q' ? 4:2;
      const point=[x(Number(tokens[i+count-2])),y(Number(tokens[i+count-1]))];i+=count;
      if(previous && command!=='M') pdf.line(...previous,...point);
      previous=point;
    }
  }
  pdf.setLineDashPattern([],0);
  for(const node of graph.nodes) {
    const left=x(node.position.x),top=y(node.position.y),width=node.width*scale,height=node.height*scale;
    const style=node.style || {},group=isGroupingNode(node),parent=teams.parents.has(node.id);
    pdf.setDrawColor(color(style.borderColor));pdf.setFillColor(color(style.backgroundColor || '#ffffff'));pdf.setLineWidth(scale);
    pdf.setLineDashPattern(style.borderStyle==='dashed' ? [5*scale,3*scale]:[],0);
    if(node.type==='JUNCTION') {pdf.circle(left+width/2,top+height/2,Math.min(width,height)/2,'F');continue;}
    if(group) {
      pdf.line(left,top+height,left+width,top+height);
      if(['BUSINESS_LINE','AREA'].includes(node.type)) pdf.line(left,top+height-3*scale,left+width,top+height-3*scale);
    } else pdf.roundedRect(left,top,width,height,5*scale,5*scale,'FD');
    pdf.setLineDashPattern([],0);
    const content=cardContent(node,showNames);
    const fields=[{text:content.heading,size:11,bold:style.bold!==false},
      {text:content.name,size:9,bold:!!style.bold},{text:content.area,size:8},{text:content.branch,size:8}].filter(f=>f.text);
    const align=group ? 'center':style.textAlign || 'left',innerWidth=Math.max(1,node.width-22)*scale;
    const fontStyle=bold=>bold ? style.italic ? 'bolditalic':'bold' : style.italic ? 'italic':'normal';
    function layout(factor) {
      return fields.map(f=>{
        pdf.setFont('helvetica',fontStyle(f.bold));pdf.setFontSize(f.size*scale*72/25.4*factor);
        return {...f,lines:pdf.splitTextToSize(f.text,innerWidth),lineHeight:f.size*1.3*scale*factor,factor};
      });
    }
    let rows=layout(1),available=Math.max(10,node.height-20-(parent ? 20:0)-(node.metadata?.visualOnly ? 8:0))*scale;
    for(let attempt=0;attempt<10 && rows.reduce((sum,f)=>sum+f.lines.length*f.lineHeight,0)>available;attempt++) rows=layout(rows[0].factor*0.85);
    const total=rows.reduce((sum,f)=>sum+f.lines.length*f.lineHeight,0);
    let cursor=top+10*scale+(node.metadata?.visualOnly ? 8*scale:0)+Math.max(0,(available-total)/2);
    pdf.setTextColor(color(cardTextColor(node)));
    for(const field of rows) {
      pdf.setFont('helvetica',fontStyle(field.bold));pdf.setFontSize(field.size*scale*72/25.4*field.factor);
      for(const line of field.lines) {
        const anchor=align==='center' ? left+width/2:align==='right' ? left+width-11*scale:left+11*scale;
        cursor+=field.lineHeight;
        pdf.text(line,anchor,cursor,{align:align==='right' ? 'right':align==='center' ? 'center':'left'});
        if(style.strikethrough) {
          const textWidth=pdf.getTextWidth(line),start=align==='center' ? anchor-textWidth/2:align==='right' ? anchor-textWidth:anchor;
          pdf.setDrawColor(color(cardTextColor(node)));pdf.line(start,cursor-field.lineHeight*.3,start+textWidth,cursor-field.lineHeight*.3);
        }
      }
    }
    if(node.metadata?.visualOnly) {
      pdf.setFont('helvetica','normal');pdf.setFontSize(6*scale*72/25.4);pdf.text('Solo visual',left+width-8*scale,top+8*scale,{align:'right'});
    }
    if(parent) {
      const count=teams.counts.get(node.id) || 0,label=group ? teams.collapsed.has(node.id) ? 'Mostrar':'Ocultar':`${count} ${count===1 ? 'persona':'personas'}`;
      pdf.setFont('helvetica','bold');pdf.setFontSize(8*scale*72/25.4);pdf.setTextColor(color(style.borderColor));
      pdf.text(label,left+width/2,top+height-7*scale,{align:'center'});
    }
  }
}
