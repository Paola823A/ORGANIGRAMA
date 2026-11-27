import Database from 'better-sqlite3';
import {mkdirSync} from 'node:fs';
import path from 'node:path';
import {config} from '../backend/src/config/index.js';
import {chartRepository} from '../backend/src/modules/charts/repository.js';
import {recordDraft} from '../backend/src/modules/charts/history.js';
import {openWorkspace} from '../frontend/src/services/sheetWorkspace.js';
import {copyGeneralBusinessStructures} from '../frontend/src/services/generalBusinessSheet.js';
import {normalize,validateGraph} from '../shared/graph.js';
const apply=process.argv.includes('--apply'),index=process.argv.indexOf('--database');
const filename=index>=0 ? path.resolve(process.argv[index+1]):config.database;
const db=new Database(filename,{readonly:!apply,fileMustExist:true});
try {
 const repository=chartRepository(db),plans=[];
 for(const row of db.prepare('SELECT d.id,c.name AS company FROM chart_drafts d JOIN organization_charts o ON o.id=d.chart_id JOIN companies c ON c.id=o.company_id').all()) {
  const before=repository.draft(row.id),workspace=openWorkspace(before);
  // Existing catalogue and protected sheets remain byte-for-byte equivalent.
  if(before.workspaceState) workspace.sheets=structuredClone(before.workspaceState.sheets);
  const changed=copyGeneralBusinessStructures(workspace,row.company);
  if(!changed.length) continue;
  const state={...(before.workspaceState || {}),version:2,deletedCards:workspace.general.deletedCards || [],sheets:workspace.sheets};
  validateGraph({...before,workspaceState:state});
  for(const original of before.workspaceState?.sheets || []) if(normalize(original.businessLine || original.name)==='POST VENTA' || normalize(original.name)==='POST VENTA') {
   if(JSON.stringify(original)!==JSON.stringify(state.sheets.find(s=>s.id===original.id))) throw new Error('POST VENTA cambió; operación cancelada.');
  }
  plans.push({before,state,changed});
 }
 console.log(JSON.stringify({mode:apply?'apply':'dry-run',drafts:plans.map(p=>({id:p.before.id,sheets:p.changed}))},null,2));
 if(apply && plans.length) {
  const directory=path.join(path.dirname(filename),'backups');mkdirSync(directory,{recursive:true});
  const backup=path.join(directory,`before-copy-general-${new Date().toISOString().replace(/[:.]/g,'-')}.sqlite`);
  await db.backup(backup);console.log(`Respaldo: ${backup}`);
  db.transaction(()=>{
   for(const plan of plans) {
    const current=repository.draft(plan.before.id);
    if(JSON.stringify(current)!==JSON.stringify(plan.before)) throw new Error('El borrador cambió durante la copia; no se guardó ningún cambio.');
    recordDraft(db,current,'Mantenimiento','Antes de copiar estructura del General');
    db.prepare('UPDATE chart_drafts SET workspace_state_json=?,content_revision=content_revision+1,updated_at=CURRENT_TIMESTAMP WHERE id=?').run(JSON.stringify(plan.state),current.id);
    recordDraft(db,repository.draft(current.id),'Mantenimiento','Copia de estructura del General (POST VENTA intacta)');
   }
  }).immediate();
 }
} finally {db.close();}
