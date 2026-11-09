import {test} from 'node:test';
import assert from 'node:assert/strict';
import {openDatabase} from '../src/db/index.js';
import {importService} from '../src/modules/imports/service.js';
import {chartService} from '../src/modules/charts/service.js';
import {countPeople,subordinateCounts} from '../../shared/graph.js';
import {book,person} from './helpers.js';
test('importación: agrega nuevos, conserva posiciones y cesados, excluye cesados y restaura historial con autor',()=>{
 const db=openDatabase(':memory:');
 try {
  const imports=importService(db),charts=chartService(db);
  let p=imports.preview(book([person('00000001'),person('00000002','00000001')]),'uno.xlsm');imports.confirm({token:p.token});
  const chart=charts.list()[0],draft=charts.createDraft(chart.id,{mode:'master'});
  const first=draft.nodes.find(n=>n.metadata.dni==='00000001');
  first.position={x:900,y:400};
  const saved=charts.saveDraft(draft.id,{...draft},'Editora Ana');
  const prior=charts.history(draft.id)[0];
  p=imports.preview(book([person('00000001'),person('00000003')],[person('00000002')]),'dos.xlsm');imports.confirm({token:p.token});
  const updated=charts.getDraft(draft.id);
  assert.equal(updated.nodes.length,3);
  assert.deepEqual(updated.nodes.find(n=>n.id===first.id).position,{x:900,y:400});
  const ceased=updated.nodes.find(n=>n.metadata.dni==='00000002');
  assert.equal(ceased.metadata.employmentStatus,'CEASED');
  assert.equal(countPeople(updated),2);
  assert.equal(subordinateCounts(updated).get(first.id),0);
  assert.equal(charts.history(draft.id)[0].action,'Actualización de personal');
  assert.throws(()=>charts.saveDraft(draft.id,saved,'Otra editora'),/otra sesión/);
  const restored=charts.restore(draft.id,prior.id,updated.content_revision,'Admin');
  assert.equal(restored.nodes.length,2);
  assert.equal(charts.history(draft.id)[0].actor_name,'Admin');
  assert.equal(charts.history(draft.id)[0].action,'Restauración de historial');
  const repeat=imports.preview(book([person('00000001'),person('00000003')],[person('00000002')]),'dos.xlsm');imports.confirm({token:repeat.token,allowRepeated:true});
  assert.equal(charts.getDraft(draft.id).nodes.length,3);
  assert.deepEqual(db.pragma('foreign_key_check'),[]);
 }finally{db.close();}
});
