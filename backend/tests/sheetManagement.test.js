import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,rmSync} from 'node:fs';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {openDatabase} from '../src/db/index.js';
import {importService} from '../src/modules/imports/service.js';
import {chartService} from '../src/modules/charts/service.js';
import {openWorkspace,workspaceView,updateWorkspace,serializeWorkspace,workspaceTabs,createSheet,renameSheet,duplicateSheet,deleteSheet,moveSheet} from '../../frontend/src/services/sheetWorkspace.js';
import {useEditor} from '../../frontend/src/composables/useEditor.js';
import {manualNode,book,person} from './helpers.js';
import {modelEdgePath} from '../../frontend/src/services/edgePath.js';
import {validateGraph} from '../../shared/graph.js';
test('hojas: VCE, SOPORTE archivado, IDs estables, duplicar, renombrar, mover y eliminar sin regeneración',()=>{
 const employee=manualNode('employee',{type:'EMPLOYEE',employeeId:'person',metadata:{businessLine:'SOPORTE',area:'SOPORTE'}});
 employee.metadata.sheetViews={SOPORTE:{nodes:[manualNode('old')],edges:[]}};
 const workspace=openWorkspace({nodes:[employee],edges:[]});
 assert.ok(workspaceTabs(workspace).some(s=>s.name==='VCE'));
 assert.ok(!workspaceTabs(workspace).some(s=>s.name==='SOPORTE'));
 const archived=workspaceTabs(workspace,true)[0];assert.equal(archived.name,'SOPORTE');assert.equal(archived.graph.nodes[0].id,'old');
 assert.equal(workspace.general.nodes[0].metadata.area,'SOPORTE');
 const a=createSheet(workspace,'Proyecto'),b=createSheet(workspace,'Otra');
 const graph=workspaceView(workspace,a.id);graph.nodes.push(manualNode('boss'),manualNode('child',{position:{x:400,y:300}}));graph.edges.push({id:'link',source:'boss',target:'child'});
 updateWorkspace(workspace,a.id,graph);
 const copy=duplicateSheet(workspace,a.id,'Copia');assert.deepEqual(copy.graph,graph);assert.notEqual(copy.id,a.id);
 renameSheet(workspace,a.id,'Renombrada');assert.equal(a.id,workspaceTabs(workspace).find(s=>s.name==='Renombrada').id);
 moveSheet(workspace,b.id,-1);assert.ok(workspace.sheets.indexOf(b)<workspace.sheets.indexOf(a));
 deleteSheet(workspace,a.id);const recreated=createSheet(workspace,'Renombrada');assert.notEqual(recreated.id,a.id);assert.equal(workspaceView(workspace,recreated.id).nodes.length,0);
 const vce=workspaceTabs(workspace).find(s=>s.name==='VCE');deleteSheet(workspace,vce.id);
 const serialized=serializeWorkspace(workspace);validateGraph(serialized);
 const reopened=openWorkspace(JSON.parse(JSON.stringify(serialized)));
 assert.ok(!workspaceTabs(reopened).some(s=>s.id===a.id || s.id===vce.id));
 assert.deepEqual(workspaceView(reopened,copy.id),copy.graph);
 // Empty General still retains every sheet: state no longer lives on card zero.
 updateWorkspace(reopened,'',{nodes:[],edges:[]});
 assert.equal(openWorkspace(serializeWorkspace(reopened)).sheets.length,reopened.sheets.length);
});
test('SQLite: eliminar tarjeta y hoja persiste tras reabrir, importar, sincronizar y publicar; empleados intactos',()=>{
 const folder=mkdtempSync(join(tmpdir(),'org-sheets-')),file=join(folder,'test.sqlite');let db=openDatabase(file);
 try {
  let imports=importService(db),charts=chartService(db);
  const buffer=book([person('00000001','',{businessLine:'VCE'}),person('00000002','00000001',{businessLine:'VCE'})]);
  let preview=imports.preview(buffer,'primero.xlsm');imports.confirm({token:preview.token});
  const chart=charts.list()[0],draft=charts.createDraft(chart.id,{mode:'master'});
  let workspace=openWorkspace(draft),vce=workspaceTabs(workspace).find(s=>s.name==='VCE');
  const view=workspaceView(workspace,vce.id),employee=view.nodes.find(n=>n.type==='EMPLOYEE');
  const editor=useEditor();editor.load(view);editor.selectNode(employee.id);editor.remove();
  updateWorkspace(workspace,vce.id,editor.graph.value);
  let saved=charts.saveDraft(draft.id,{...serializeWorkspace(workspace),name:'Libro',content_revision:0},'Prueba');
  db.close();db=openDatabase(file);charts=chartService(db);imports=importService(db);
  workspace=openWorkspace(charts.getDraft(draft.id));
  assert.ok(!workspaceView(workspace,vce.id).nodes.some(n=>n.id===employee.id));
  assert.ok(!charts.syncPreview(draft.id,workspaceView(workspace,vce.id).nodes).some(item=>item.nodeId===employee.id));
  preview=imports.preview(buffer,'repetido.xlsm');imports.confirm({token:preview.token,allowRepeated:true});
  workspace=openWorkspace(charts.getDraft(draft.id));
  assert.ok(!workspaceView(workspace,vce.id).nodes.some(n=>n.id===employee.id));
  assert.ok(db.prepare('SELECT 1 FROM employees WHERE id=?').get(employee.employeeId));
  const generalEditor=useEditor();generalEditor.load(workspace.general);generalEditor.selectNode(employee.id);generalEditor.remove();updateWorkspace(workspace,'',generalEditor.graph.value);
  const current=charts.getDraft(draft.id);
  saved=charts.saveDraft(draft.id,{...serializeWorkspace(workspace),name:'Libro',content_revision:current.content_revision});
  preview=imports.preview(buffer,'otra.xlsm');imports.confirm({token:preview.token,allowRepeated:true});
  assert.ok(!charts.getDraft(draft.id).nodes.some(n=>n.id===employee.id));
  workspace=openWorkspace(charts.getDraft(draft.id));deleteSheet(workspace,vce.id);
  const latest=charts.getDraft(draft.id);saved=charts.saveDraft(draft.id,{...serializeWorkspace(workspace),name:'Libro',content_revision:latest.content_revision});
  assert.throws(()=>charts.saveDraft(draft.id,{...saved,workspaceState:undefined}),/hojas independientes/);
  const published=charts.publish(draft.id,{content_revision:saved.content_revision});
  assert.ok(!workspaceTabs(openWorkspace(published.snapshot)).some(s=>s.id===vce.id));
  const restored=charts.createDraft(chart.id,{mode:'version',versionId:published.id});assert.deepEqual(restored.workspaceState,saved.workspaceState);
  const history=charts.history(draft.id);
  const initial=history.find(entry=>entry.action==='Estado inicial');
  const legacyRestore=charts.restore(draft.id,initial.id,saved.content_revision,'Prueba de restauración');
  assert.equal(legacyRestore.workspaceState,undefined);
  assert.ok(legacyRestore.nodes.some(n=>n.id===employee.id));
  const deletedState=history.find(entry=>entry.action==='Edición');
  const sheetRestore=charts.restore(draft.id,deletedState.id,legacyRestore.content_revision,'Prueba de restauración');
  assert.deepEqual(sheetRestore.workspaceState,saved.workspaceState);
  assert.deepEqual(db.pragma('foreign_key_check'),[]);
 }finally{db.close();rmSync(folder,{recursive:true,force:true});}
});
test('rutas: los puntos de anclaje son independientes del zoom y el desplazamiento del viewport',()=>{
 const graph={nodes:[manualNode('a',{position:{x:-100,y:30}}),manualNode('b',{position:{x:400,y:600}})],edges:[{id:'e',source:'a',target:'b',style:{sourceHandle:'source-right',targetHandle:'target-left'}}]};
 const before=JSON.stringify(graph),path=modelEdgePath(graph,graph.edges[0]);
 for(const zoom of [.01,.1,.5,1,2]) {
  assert.equal(modelEdgePath({...graph,viewport:{zoom,x:123,y:54}},graph.edges[0]),path);
  const source={x:graph.nodes[0].position.x+graph.nodes[0].width,y:graph.nodes[0].position.y+graph.nodes[0].height/2};
  assert.ok(path.startsWith(`M${source.x} ${source.y}`));
 }
 assert.equal(JSON.stringify(graph),before);
});
