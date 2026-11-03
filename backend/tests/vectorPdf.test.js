import {test} from 'node:test';
import assert from 'node:assert/strict';
import {jsPDF} from 'jspdf';
import {drawVectorGraph} from '../../frontend/src/services/vectorPdf.js';
import {graphBounds} from '../../frontend/src/services/exportGeometry.js';
import {manualNode} from './helpers.js';
test('PDF de alta calidad: una página con texto y líneas vectoriales, sin imágenes JPEG',()=>{
  const nodes=[manualNode('boss',{type:'EMPLOYEE',title:'NOMBRE DEL JEFE',subtitle:'GERENTE',metadata:{area:'ADMINISTRACION',branch:'AREQUIPA'},style:{textColor:'#30306c',borderColor:'#30306c',backgroundColor:'#ffffff',bold:true,italic:true,strikethrough:true}}),
    manualNode('child',{type:'EMPLOYEE',title:'PERSONA SELECCIONADA',subtitle:'ANALISTA',position:{x:5000,y:4000},metadata:{area:'VENTAS',branch:'JULIACA',visualOnly:true}})];
  const graph={nodes,edges:[{id:'e',source:'boss',target:'child'}]};
  const teams={parents:new Set(['boss']),counts:new Map([['boss',1]]),collapsed:new Set()};
  const pdf=new jsPDF({format:'a3',orientation:'landscape',compress:false});
  drawVectorGraph(pdf,graph,graphBounds(nodes),{teams});
  const output=pdf.output();
  assert.equal(pdf.getNumberOfPages(),1);
  for(const text of ['GERENTE','NOMBRE DEL JEFE','ANALISTA','PERSONA SELECCIONADA','JULIACA','Solo visual','1 persona']) assert.ok(output.includes(text),text);
  assert.ok(!output.includes('/Subtype /Image'));
  const hidden=new jsPDF({compress:false});
  drawVectorGraph(hidden,graph,graphBounds(nodes),{teams,showNames:false});
  assert.ok(!hidden.output().includes('PERSONA SELECCIONADA'));
});
