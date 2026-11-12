import {chartRepository} from './repository.js';
import {employeeRepository} from '../employees/repository.js';
import {employeeNode} from './service.js';
import {applyBrandTheme} from '../../../../shared/theme.js';
import {recordDraft} from './history.js';
export function syncImportedDrafts(db,records,actor) {
  const repository=chartRepository(db),employees=employeeRepository(db);
  const ids=new Set(records.map(r=>r.id));
  const incoming=new Map(records.map(r=>[r.id,r]));
  const touched=new Set(db.prepare('SELECT DISTINCT company_id FROM employees').all().map(r=>r.company_id));
  for(const row of db.prepare('SELECT d.id,o.company_id,c.name AS company FROM chart_drafts d JOIN organization_charts o ON o.id=d.chart_id JOIN companies c ON c.id=o.company_id').all()) {
    if(!touched.has(row.company_id)) continue;
    const draft=repository.draft(row.id);
    const present=new Set(draft.nodes.filter(n=>!n.metadata?.visualOnly).map(n=>n.employeeId));
    let changed=false;
    const nodes=draft.nodes.map(n=>{
      if(!n.employeeId) return n;
      let e=employees.get(n.employeeId);
      if(e?.employment_status!=='ACTIVE' && n.metadata?.dni) {
        const ceased=db.prepare("SELECT id FROM employees WHERE dni=? AND company_id=? AND employment_status='CEASED'").all(n.metadata.dni,e?.company_id);
        if(ceased.length===1) e=employees.get(ceased[0].id);
      }
      if(!e || !ids.has(e.id)) return n;
      const status=e.employment_status;
      const fields=incoming.get(e.id)?.changes || [];
      if(n.metadata?.employmentStatus===status && n.employeeId===e.id && !fields.length) return n;
      changed=true;
      const metadata={...n.metadata,employmentStatus:status,pendingReview:true,updatedFields:fields,updatedAt:new Date().toISOString()};
      for(const [field,column] of [['company','company'],['businessLine','business_line'],['branch','branch'],['area','area'],['dni','dni']]) if(fields.includes(field)) metadata[field]=e[column];
      return {...n,employeeId:e.id,...(fields.includes('fullName') ? {title:e.full_name}:{}),...(fields.includes('positionName') ? {subtitle:e.position_name}:{}),metadata};
    });
    const newPeople=employees.active(row.company_id).filter(e=>ids.has(e.id) && !present.has(e.id));
    const bottom=Math.max(0,...nodes.map(n=>n.position.y+n.height))+100;
    newPeople.forEach((e,i)=>{const n=employeeNode(e,nodes.length);n.position={x:(i%5)*300,y:bottom+Math.floor(i/5)*160};nodes.push(n);});
    if(!changed && !newPeople.length) continue;
    recordDraft(db,draft,actor,'Antes de importar');
    const graph=applyBrandTheme({...draft,nodes},row.company);
    repository.writeGraph(row.id,graph);
    db.prepare('UPDATE chart_drafts SET content_revision=content_revision+1,updated_at=CURRENT_TIMESTAMP WHERE id=?').run(row.id);
    recordDraft(db,repository.draft(row.id),actor,'Actualización de personal');
  }
}
