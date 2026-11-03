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
    assert.equal(branded.nodes[1].style.textColor,theme.color);
    assert.equal(branded.edges[0].style.color,theme.color);
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
