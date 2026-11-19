import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {openDatabase} from '../src/db/index.js';
import {chartService} from '../src/modules/charts/service.js';
import {createApp} from '../src/app.js';
import {manualNode} from './helpers.js';
import {validateGraph} from '../../shared/graph.js';
import {openWorkspace,workspaceView,updateWorkspace,serializeWorkspace} from '../../frontend/src/services/sheetWorkspace.js';
import {applyBrandTheme} from '../../shared/theme.js';
function fixture() {
 const nodes=Array.from({length:24},(_,i)=>manualNode('card-'+i,{title:'Área o cargo '+i,type:i%3 ? 'POSITION':'AREA',position:{x:(i%4)*320,y:Math.floor(i/4)*180},siblingOrder:i,metadata:{area:'Área '+i,branch:'Lima'},style:{backgroundColor:'#ffffff',textColor:'#123456',borderColor:'#b8873e',borderStyle:'solid',textAlign:'center'}}));
 const edges=nodes.slice(1).map((n,i)=>({id:'edge-'+i,source:nodes[Math.floor(i/2)].id,target:n.id,style:{color:'#555555',width:2,lineType:'solid'}}));
 const sheet=structuredClone({nodes,edges});sheet.nodes[0].position={x:300,y:800};
 nodes[0].metadata.sheetViews={'POST VENTA':sheet};
 return {nodes,edges};
}
test('regresión: vistas de más de 5000 caracteres se validan; datos inválidos siguen rechazándose con contexto',()=>{
 const graph=fixture();
 assert.ok(JSON.stringify(graph.nodes[0].metadata).length>5000,'reproduce el umbral que causaba el error');
 validateGraph(graph);
 const invalid=structuredClone(graph);invalid.nodes[0].metadata.sheetViews['POST VENTA'].nodes[1].position.x=null;
 assert.throws(()=>validateGraph(invalid),/Vista «POST VENTA».*Posición inválida/);
 const nested=structuredClone(graph);nested.nodes[0].metadata.sheetViews['POST VENTA'].nodes[0].metadata.sheetViews={};
 assert.throws(()=>validateGraph(nested),/no puede contener otras vistas/);
 const large=fixture();large.nodes[1].metadata.note='x'.repeat(5001);
 assert.throws(()=>validateGraph(large),/card-1.*5000/);
 for(const metadata of [null,[],true]) {const bad=fixture();bad.nodes[1].metadata=metadata;assert.throws(()=>validateGraph(bad),/card-1.*objeto JSON/);}
 const workspace=openWorkspace(graph),sheet=workspaceView(workspace,'POST VENTA');
 sheet.nodes[2].position={x:100,y:200};updateWorkspace(workspace,'POST VENTA',sheet);
 validateGraph(serializeWorkspace(workspace));
});
test('API y SQLite en disco: crear, actualizar, reabrir, publicar y restaurar preserva todo el borrador',async()=>{
 const folder=mkdtempSync(join(tmpdir(),'org-metadata-')),filename=join(folder,'test.sqlite');
 let db=openDatabase(filename),server;
 try {
  db.prepare('INSERT INTO companies(id,name,normalized_name) VALUES (?,?,?)').run('test','Prueba','PRUEBA');
  db.prepare('INSERT INTO organization_charts(id,company_id,name) VALUES (?,?,?)').run('chart','test','Prueba');
  let charts=chartService(db);
  const draft=charts.createDraft('chart',{mode:'empty',name:'Borrador inicial'});
  server=createApp(db).listen(0,'127.0.0.1');await new Promise(r=>server.once('listening',r));
  const url=`http://127.0.0.1:${server.address().port}/api/v1/drafts/${draft.id}`;
  const payload={...draft,...fixture(),name:'Borrador con múltiples áreas'};
  const response=await fetch(url,{method:'PUT',headers:{'Content-Type':'application/json'},body:JSON.stringify(payload)});
  assert.equal(response.status,200);let saved=await response.json();
  assert.deepEqual(saved.nodes,payload.nodes);assert.deepEqual([...saved.edges].sort((a,b)=>a.id.localeCompare(b.id)),[...payload.edges].sort((a,b)=>a.id.localeCompare(b.id)));
  saved.nodes[2].title='Cargo actualizado';saved.nodes[2].position={x:800,y:600};
  saved.nodes[0].metadata.sheetViews['POST VENTA'].nodes[2].position={x:77,y:99};
  const updated=charts.saveDraft(draft.id,saved,'Editora');
  const bad=structuredClone(updated);bad.nodes[0].metadata.sheetViews['POST VENTA'].edges[0].target='inexistente';
  const rejected=await fetch(url,{method:'PUT',headers:{'Content-Type':'application/json'},body:JSON.stringify(bad)});
  assert.equal(rejected.status,400);assert.match((await rejected.json()).error,/POST VENTA.*inexistente/);
  assert.deepEqual(charts.getDraft(draft.id),updated,'rollback sin pérdida de datos');
  await new Promise(r=>server.close(r));server=null;db.close();db=openDatabase(filename);charts=chartService(db);
  const reopened=charts.getDraft(draft.id);assert.deepEqual(reopened,updated);
  const published=charts.publish(draft.id,{content_revision:reopened.content_revision});
  assert.deepEqual(published.snapshot.nodes,reopened.nodes);
  const copied=charts.createDraft('chart',{mode:'version',versionId:published.id,name:'Copia'});
  assert.deepEqual(copied.nodes,applyBrandTheme(reopened,'Prueba').nodes);
  const history=charts.history(draft.id)[0];
  assert.deepEqual(charts.restore(draft.id,history.id,reopened.content_revision,'Admin').nodes,reopened.nodes);
  assert.deepEqual(db.pragma('foreign_key_check'),[]);
 }finally{if(server) await new Promise(r=>server.close(r));db.close();rmSync(folder,{recursive:true,force:true});}
});
