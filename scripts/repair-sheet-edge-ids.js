import Database from 'better-sqlite3';
import {mkdirSync} from 'node:fs';
import path from 'node:path';
import {config} from '../backend/src/config/index.js';
import {chartRepository} from '../backend/src/modules/charts/repository.js';
import {recordDraft} from '../backend/src/modules/charts/history.js';
import {repairEdgeIds} from '../shared/edgeIdentity.js';
import {validateGraph} from '../shared/graph.js';

// Dry run by default. --apply takes a consistent SQLite backup before any write.
const apply=process.argv.includes('--apply');
const index=process.argv.indexOf('--database');
const filename=index>=0 ? path.resolve(process.argv[index+1]):config.database;
const db=new Database(filename,{readonly:!apply,fileMustExist:true});
try {
 const repository=chartRepository(db),plans=[];
 for(const row of db.prepare('SELECT id FROM chart_drafts').all()) {
  const before=repository.draft(row.id),after=structuredClone(before),repairs=[];
  function repair(graph,label) {
   const result=repairEdgeIds(graph);
   if(result.repairs.length) {graph.edges=result.graph.edges;repairs.push({sheet:label,connections:result.repairs});}
  }
  repair(after,'GENERAL');
  for(const node of after.nodes) for(const [name,graph] of Object.entries(node.metadata?.sheetViews || {})) repair(graph,name);
  for(const sheet of after.workspaceState?.sheets || []) if(sheet.graph) repair(sheet.graph,sheet.name);
  if(repairs.length) {validateGraph(after);plans.push({before,after,repairs});}
 }
 console.log(JSON.stringify({mode:apply?'apply':'dry-run',drafts:plans.map(p=>({id:p.before.id,repairs:p.repairs}))},null,2));
 if(apply) {
  const directory=path.join(path.dirname(filename),'backups');mkdirSync(directory,{recursive:true});
  const backup=path.join(directory,`before-edge-repair-${new Date().toISOString().replace(/[:.]/g,'-')}.sqlite`);
  await db.backup(backup);console.log(`Respaldo: ${backup}`);
  db.transaction(()=>{
   for(const plan of plans) {
    const current=repository.draft(plan.before.id);
    if(JSON.stringify(current)!==JSON.stringify(plan.before)) throw new Error('El borrador cambió durante la revisión. No se reparó ningún registro.');
    recordDraft(db,current,'Mantenimiento','Antes de reparar identificadores de conexiones');
    repository.writeGraph(current.id,plan.after);
    db.prepare('UPDATE chart_drafts SET content_revision=content_revision+1,updated_at=CURRENT_TIMESTAMP WHERE id=?').run(current.id);
    recordDraft(db,repository.draft(current.id),'Mantenimiento','Reparación de identificadores de conexiones');
   }
  }).immediate();
  console.log(`Borradores reparados: ${plans.length}`);
 }
} finally {db.close();}
