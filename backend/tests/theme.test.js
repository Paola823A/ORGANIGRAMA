import {test} from 'node:test';
import assert from 'node:assert/strict';
import {companyTheme,applyBrandTheme,AUTRISA_BLUE} from '../../shared/theme.js';
import {manualNode} from './helpers.js';
test('marcas por empresa: colores de tarjetas, agrupadores y líneas, sin perder personalizaciones posteriores',()=>{
  const graph={nodes:[manualNode('card',{type:'EMPLOYEE',metadata:{autrisaTheme:1}}),manualNode('area',{type:'AREA'})],edges:[{id:'e',source:'card',target:'area',style:{color:'#94a3b8',width:2,lineType:'dashed'}}]};
  const before=JSON.stringify(graph);
  for(const name of ['INCAMOTORS','NOVA AUTOS','AUTRISA']) {
    const theme=companyTheme(name),branded=applyBrandTheme(graph,name);
    if(name!=='AUTRISA') assert.notEqual(theme.color,AUTRISA_BLUE);
    assert.equal(branded.nodes[1].style.borderColor,theme.color);
    assert.equal(branded.nodes[1].style.textColor,theme.headingColor);
    assert.equal(branded.edges[0].style.color,theme.lineColor);
    assert.equal(branded.edges[0].style.width,2);
    assert.equal(branded.edges[0].style.lineType,'dashed');
    assert.deepEqual(applyBrandTheme(branded,name),branded);
    branded.nodes[1].style.borderColor='#123456';branded.edges[0].style.color='#112233';
    const custom=applyBrandTheme(branded,name);
    assert.equal(custom.nodes[1].style.borderColor,'#123456');
    assert.equal(custom.edges[0].style.color,'#112233');
  }
  assert.equal(JSON.stringify(graph),before);
});
test('Inc motors: actualiza el dorado anterior a líneas gris oscuro y títulos negros una sola vez',()=>{
  const graph={nodes:[manualNode('area',{type:'AREA',metadata:{brandTheme:'incamotors'},style:{borderColor:'#b8873e',textColor:'#b8873e'}})],edges:[{id:'e',source:'area',target:'area',style:{color:'#b8873e',brandTheme:'incamotors',width:2,lineType:'solid'}}]};
  const next=applyBrandTheme(graph,'INCAMOTORS');
  assert.equal(next.nodes[0].style.textColor,'#000000');
  assert.equal(next.nodes[0].style.borderColor,'#b8873e');
  assert.equal(next.edges[0].style.color,'#555555');
  next.nodes[0].style.textColor='#112233';next.edges[0].style.color='#222222';
  assert.deepEqual(applyBrandTheme(next,'INCAMOTORS'),next);
});
