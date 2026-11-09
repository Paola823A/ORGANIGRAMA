import {test} from 'node:test';
import assert from 'node:assert/strict';
import {openDatabase} from '../src/db/index.js';
import {importService} from '../src/modules/imports/service.js';
import {book,person} from './helpers.js';
test('eliminar historial individual conserva datos, jerarquías, detección de duplicados y permisos',()=>{
 const db=openDatabase(':memory:');
 try {
  const imports=importService(db),buffer=book([person('00000001')]);
  const p=imports.preview(buffer,'base.xlsm');const result=imports.confirm({token:p.token});
  const before=db.prepare('SELECT * FROM employees').all(),hierarchy=db.prepare('SELECT * FROM employee_hierarchy').all();
  assert.throws(()=>imports.removeHistory(result.id,{userId:'ajeno',companyIds:[]}),/acceso/);
  assert.equal(imports.history().length,1);
  imports.removeHistory(result.id);
  assert.equal(imports.history().length,0);
  assert.deepEqual(db.prepare('SELECT * FROM employees').all(),before);
  assert.deepEqual(db.prepare('SELECT * FROM employee_hierarchy').all(),hierarchy);
  assert.equal(imports.preview(buffer,'base.xlsm').repeated,true);
  assert.throws(()=>imports.removeHistory(result.id),/no encontrada/);
  assert.deepEqual(db.pragma('foreign_key_check'),[]);
 }finally{db.close();}
});
