import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {repairEdgeIds} from '../../shared/edgeIdentity.js';
import {validateGraph} from '../../shared/graph.js';
import {openWorkspace,workspaceView,updateWorkspace,serializeWorkspace,workspaceTabs,createSheet} from '../../frontend/src/services/sheetWorkspace.js';
import {businessSheet} from '../../frontend/src/services/businessSheets.js';
import {useEditor} from '../../frontend/src/composables/useEditor.js';
import {manualNode} from './helpers.js';
import {openDatabase} from '../src/db/index.js';
import {chartService} from '../src/modules/charts/service.js';
import {jsPDF} from 'jspdf';
import {drawVectorGraph} from '../../frontend/src/services/vectorPdf.js';
import {graphBounds} from '../../frontend/src/services/exportGeometry.js';
import {modelEdgePath} from '../../frontend/src/services/edgePath.js';

test('POST VENTA: incorporar personal no reutiliza IDs secuenciales de conexiones guardadas',()=>{
 const employee=id=>manualNode(id,{type:'EMPLOYEE',employeeId:id,metadata:{businessLine:'POST VENTA',branch:'AREQUIPA'}});
 const graph={nodes:[employee('a'),employee('b')],edges:[]};
 const workspace=openWorkspace(graph),sheet=workspaceTabs(workspace).find(s=>s.name==='POST VENTA');
 const previous=businessSheet({nodes:[graph.nodes[0]],edges:[]},'POST VENTA');
 // A manually authored connection already occupies the next generated sequence ID.
 previous.edges[0].id='sheet-edge:2';sheet.graph=structuredClone(previous);
 const view=workspaceView(workspace,sheet.id);
 assert.equal(view.edges[0].id,'sheet-edge:2');
 assert.equal(view.edges.length,3);
 assert.equal(new Set(view.edges.map(e=>e.id)).size,view.edges.length);
 assert.deepEqual(view.edges[0],previous.edges[0]);
 validateGraph(view);
 const once=structuredClone(view);assert.deepEqual(workspaceView(workspace,sheet.id),once);
});

test('reparación: solo IDs inválidos o repetidos cambian; no se borran extremos, estilos ni tarjetas',()=>{
 const graph={nodes:[manualNode('a'),manualNode('b'),manualNode('c')],edges:[
  {id:'valid',source:'a',target:'b',style:{color:'#123456',width:2,lineType:'solid'}},
  {id:'valid',source:'a',target:'c'},
  {id:null,source:'b',target:'c'},
 ]};
 const before=structuredClone(graph),result=repairEdgeIds(graph);
 assert.equal(result.repairs.length,2);assert.equal(result.graph.edges[0].id,'valid');
 assert.deepEqual(result.graph.nodes,before.nodes);
 assert.deepEqual(result.graph.edges.map(({id,...edge})=>edge),before.edges.map(({id,...edge})=>edge));
 assert.deepEqual(graph,before);validateGraph(result.graph);
 assert.equal(repairEdgeIds(result.graph).repairs.length,0);
 const duplicate=structuredClone(result.graph);duplicate.edges.push({...duplicate.edges[0],id:'another'});
 assert.throws(()=>validateGraph(duplicate),/conexiones duplicadas/);
});

test('SQLite: crear, conectar, reconectar, quitar conexión de prueba, guardar, reabrir y publicar POST VENTA',()=>{
 const directory=mkdtempSync(join(tmpdir(),'post-venta-')),filename=join(directory,'test.sqlite');let db=openDatabase(filename);
 try {
  let charts=chartService(db);db.prepare('INSERT INTO companies(id,name,normalized_name) VALUES (?,?,?)').run('company','INCAMOTORS','INCAMOTORS');
  db.prepare('INSERT INTO organization_charts(id,company_id,name) VALUES (?,?,?)').run('chart','company','INCAMOTORS');
  const draft=charts.createDraft('chart',{name:'Prueba',mode:'empty'}),workspace=openWorkspace(draft);
  const sheet=createSheet(workspace,'POST VENTA'),fuso=createSheet(workspace,'BORRADOR FUSO');
  fuso.graph={nodes:[manualNode('fuso-card')],edges:[],deletedCards:[]};const fusoBefore=structuredClone(fuso);
  const editor=useEditor();editor.load(workspaceView(workspace,sheet.id));
  for(const id of ['a','b','c']) editor.addNode(manualNode(id,{type:'POSITION',title:id}));
  editor.connect({source:'a',target:'b'});const edge=editor.graph.value.edges[0];
  editor.connect({source:'a',target:'c'},edge.id);assert.equal(editor.graph.value.edges[0].id,edge.id);
  editor.connect({source:'b',target:'c'});editor.selectNode(null);editor.edgeId.value=editor.graph.value.edges[1].id;editor.remove();
  updateWorkspace(workspace,sheet.id,editor.graph.value);
  const saved=charts.saveDraft(draft.id,{...serializeWorkspace(workspace),name:'Prueba',content_revision:0});
  db.close();db=openDatabase(filename);charts=chartService(db);
  const reopened=openWorkspace(charts.getDraft(draft.id));
  assert.deepEqual(workspaceView(reopened,sheet.id),editor.graph.value);
  assert.deepEqual(reopened.sheets.find(s=>s.id===fuso.id),fusoBefore);
  assert.ok(workspaceTabs(reopened).some(s=>s.id===fuso.id));
  assert.ok(!workspaceTabs(reopened,false,'ORGANIGRAMA').some(s=>s.id===fuso.id));
  const published=charts.publish(draft.id,{content_revision:saved.content_revision});
  const publicWorkspace=openWorkspace(published.snapshot);
  assert.deepEqual(workspaceView(publicWorkspace,sheet.id),editor.graph.value);
  assert.ok(!workspaceTabs(publicWorkspace,false,'ORGANIGRAMA').some(s=>s.id===fuso.id));
  assert.deepEqual(db.pragma('foreign_key_check'),[]);
 } finally {db.close();rmSync(directory,{recursive:true,force:true});}
});

test('PDF: conserva tarjetas y líneas sin dibujar puntos de unión ni controles del editor',()=>{
 const graph={nodes:[manualNode('a',{type:'POSITION',title:'JEFE'}),manualNode('j',{type:'JUNCTION',width:8,height:8,position:{x:126,y:200}}),manualNode('b',{type:'POSITION',title:'TECNICO',position:{x:0,y:300}})],edges:[{id:'one',source:'a',target:'j'},{id:'two',source:'j',target:'b'}]};
 const before=structuredClone(graph),pdf=new jsPDF({compress:false});let circles=0,lines=0,rectangles=0;
 const originalLine=pdf.line.bind(pdf),originalRect=pdf.roundedRect.bind(pdf);
 pdf.circle=()=>{circles++;};pdf.line=(...args)=>{lines++;return originalLine(...args);};pdf.roundedRect=(...args)=>{rectangles++;return originalRect(...args);};
 drawVectorGraph(pdf,graph,graphBounds(graph.nodes),{teams:{parents:new Set(),counts:new Map(),collapsed:new Set()}});
 assert.equal(circles,0);assert.equal(rectangles,2);assert.ok(lines>=2);
 assert.ok(pdf.output().includes('JEFE'));assert.ok(pdf.output().includes('TECNICO'));
 assert.deepEqual(graph,before);
 const firstPath=modelEdgePath(graph,graph.edges[0],undefined,true),secondPath=modelEdgePath(graph,graph.edges[1],undefined,true);
 const center=`${graph.nodes[1].position.x+4} ${graph.nodes[1].position.y+4}`;
 assert.ok(firstPath.endsWith(`L${center}`));assert.ok(secondPath.startsWith(`M${center} `));
});
