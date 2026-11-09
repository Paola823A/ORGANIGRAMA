import {randomUUID} from 'node:crypto';
export function recordDraft(db,draft,actor='Modo local',action='Edición') {
  db.prepare('INSERT INTO draft_history(id,draft_id,actor_name,action,snapshot_json) VALUES (?,?,?,?,?)').run(randomUUID(),draft.id,actor,action,JSON.stringify(draft));
}
