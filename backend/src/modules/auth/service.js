import { randomBytes, randomUUID, scrypt, timingSafeEqual, createHash } from 'node:crypto';
import { promisify } from 'node:util';
import { assert } from '../../utils/errors.js';
const derive = promisify(scrypt);
const digest = (value) => createHash('sha256').update(value).digest('hex');
const options = { N: 32768, r: 8, p: 1, maxmem: 64 * 1024 * 1024 };
async function hashPassword(password) {
  assert(typeof password === 'string' && password.length >= 6, 'La contraseña debe tener al menos 6 caracteres.');
  const salt = randomBytes(16).toString('hex');
  return `${salt}:${(await derive(password, salt, 64, options)).toString('hex')}`;
}
const dummy = '0'.repeat(32) + ':' + '0'.repeat(128);
async function verify(password, stored) {
  const [salt, hex] = stored.split(':');
  const validInput = typeof password === 'string';
  const actual = await derive(validInput ? password : '', salt, 64, options);
  return validInput && timingSafeEqual(actual, Buffer.from(hex, 'hex'));
}
export function authService(db) {
  function enabled() { return !!db.prepare('SELECT 1 FROM app_users LIMIT 1').get(); }
  function publicUser(user) {
    if (!user) return null;
    return { id: user.id, username: user.username, displayName: user.display_name,
      employeeId: user.employee_id, role: user.role, status: user.status,
      mustChangePassword: !!user.must_change_password,
      permissions: db.prepare('SELECT company_id AS companyId,module FROM user_permissions WHERE user_id=?').all(user.id) };
  }
  function grants(permissions) {
    assert(Array.isArray(permissions) && permissions.length <= 300, 'Permisos inválidos.');
    const seen = new Set();
    return permissions.filter((p) => {
      assert(p && ['graphic','board','upload'].includes(p.module) && typeof p.companyId === 'string' && db.prepare('SELECT 1 FROM companies WHERE id=?').get(p.companyId), 'Empresa o módulo inválido.');
      const key = `${p.companyId}:${p.module}`;
      if (seen.has(key)) return false;
      seen.add(key); return true;
    });
  }
  function setPermissions(id, permissions) {
    db.prepare('DELETE FROM user_permissions WHERE user_id=?').run(id);
    for (const p of permissions) db.prepare('INSERT INTO user_permissions VALUES (?,?,?)').run(id,p.companyId,p.module);
  }
  async function create(input, owner = false) {
    const username = String(input.username || '').trim().toLowerCase();
    assert(/^[a-z0-9][a-z0-9@._+-]{2,99}$/.test(username), 'Usa un usuario de 3 a 100 caracteres, sin espacios.');
    const employee = input.employeeId ? db.prepare('SELECT id,full_name FROM employees WHERE id=?').get(input.employeeId) : null;
    assert(!input.employeeId || employee, 'Empleado no encontrado.');
    const name = employee?.full_name || String(input.displayName || '').trim();
    assert(name.length > 0 && name.length <= 200, 'Indica el nombre del usuario.');
    const permissions = grants(input.permissions || []);
    const hash = await hashPassword(input.password);
    const id = randomUUID();
    db.transaction(() => {
      assert(!owner || !enabled(), 'La cuenta del creador ya existe.', 409);
      assert(!db.prepare('SELECT 1 FROM app_users WHERE username=?').get(username), 'El nombre de usuario ya existe.', 409);
      db.prepare('INSERT INTO app_users(id,username,display_name,employee_id,password_hash,role,status,must_change_password) VALUES (?,?,?,?,?,?,?,?)')
        .run(id,username,name,employee?.id || null,hash,owner ? 'OWNER':'MEMBER','APPROVED',0);
      setPermissions(id,permissions);
    }).immediate();
    return publicUser(db.prepare('SELECT * FROM app_users WHERE id=?').get(id));
  }
  function session(token) {
    if (!token) return null;
    return publicUser(db.prepare("SELECT u.* FROM app_users u JOIN user_sessions s ON s.user_id=u.id WHERE s.token_hash=? AND s.expires_at>? AND u.status='APPROVED' AND u.deleted_at IS NULL").get(digest(token),Date.now()));
  }
  async function login(username, password, ip) {
    username = String(username || '').trim().toLowerCase().slice(0,100);
    const keys = [digest(`ip:${ip}`),digest(`user:${username}`)];
    const now = Date.now();
    for (const key of keys) {
      const limit = db.prepare('SELECT * FROM login_limits WHERE key=?').get(key);
      assert(!limit || limit.expires_at <= now || limit.attempts < 20, 'Demasiados intentos. Espera 15 minutos.',429);
      db.prepare('INSERT INTO login_limits VALUES (?,1,?) ON CONFLICT(key) DO UPDATE SET attempts=CASE WHEN expires_at<=? THEN 1 ELSE attempts+1 END,expires_at=CASE WHEN expires_at<=? THEN excluded.expires_at ELSE expires_at END').run(key,now+900000,now,now);
    }
    const user = db.prepare('SELECT * FROM app_users WHERE username=? AND deleted_at IS NULL').get(username);
    const valid = await verify(password,user?.password_hash || dummy);
    assert(valid && user?.status === 'APPROVED', 'Credenciales incorrectas o acceso no autorizado.',401);
    db.prepare('DELETE FROM login_limits WHERE key=?').run(keys[1]);
    db.prepare('DELETE FROM user_sessions WHERE expires_at<=?').run(now);
    const token = randomBytes(32).toString('hex');
    db.prepare('INSERT INTO user_sessions VALUES (?,?,?)').run(digest(token),user.id,now+8*3600000);
    return { token, user: publicUser(user) };
  }
  async function update(id,input) {
    const user = db.prepare('SELECT * FROM app_users WHERE id=? AND deleted_at IS NULL').get(id);
    assert(user && user.role !== 'OWNER','Solo se pueden modificar cuentas de personal.',400);
    assert(['APPROVED','DISABLED'].includes(input.status),'Estado inválido.');
    const username = String(input.username ?? user.username).trim().toLowerCase();
    const displayName = String(input.displayName ?? user.display_name).trim();
    assert(/^[a-z0-9][a-z0-9@._+-]{2,99}$/.test(username),'Usa un usuario de 3 a 100 caracteres, sin espacios.');
    assert(displayName.length > 0 && displayName.length <= 200,'Indica el nombre del usuario.');
    assert(!db.prepare('SELECT 1 FROM app_users WHERE username=? AND id<>?').get(username,id),'El nombre de usuario ya existe.',409);
    const permissions = grants(input.permissions || []);
    const passwordHash = input.password ? await hashPassword(input.password) : null;
    db.transaction(() => {
      assert(db.prepare('SELECT 1 FROM app_users WHERE id=? AND deleted_at IS NULL').get(id),'La cuenta ya no existe.',400);
      db.prepare('UPDATE app_users SET status=?,username=?,display_name=?,password_hash=COALESCE(?,password_hash),must_change_password=0 WHERE id=?').run(input.status,username,displayName,passwordHash,id);
      setPermissions(id,permissions);
      db.prepare('DELETE FROM user_sessions WHERE user_id=?').run(id);
    })();
    return publicUser(db.prepare('SELECT * FROM app_users WHERE id=?').get(id));
  }
  async function changePassword(userId,currentPassword,newPassword) {
    const user = db.prepare('SELECT * FROM app_users WHERE id=?').get(userId);
    assert(user && await verify(currentPassword,user.password_hash),'Contraseña actual incorrecta.',400);
    assert(newPassword !== currentPassword,'Elige una contraseña diferente.');
    const hash = await hashPassword(newPassword);
    db.transaction(() => {
      db.prepare('UPDATE app_users SET password_hash=?,must_change_password=0 WHERE id=?').run(hash,userId);
      db.prepare('DELETE FROM user_sessions WHERE user_id=?').run(userId);
    })();
  }
  async function resetPassword(id,password) {
    const user = db.prepare("SELECT * FROM app_users WHERE id=? AND role='MEMBER' AND deleted_at IS NULL").get(id);
    assert(user,'Usuario no encontrado.',404);
    const hash = await hashPassword(password);
    db.transaction(() => {
      db.prepare('UPDATE app_users SET password_hash=?,must_change_password=0 WHERE id=?').run(hash,id);
      db.prepare('DELETE FROM user_sessions WHERE user_id=?').run(id);
    })();
  }
  function remove(id) {
    const user = db.prepare('SELECT * FROM app_users WHERE id=? AND deleted_at IS NULL').get(id);
    assert(user && user.role === 'MEMBER','No se puede eliminar la cuenta del creador ni una cuenta inexistente.',400);
    db.transaction(()=>{
      db.prepare("UPDATE app_users SET status='DISABLED',deleted_at=CURRENT_TIMESTAMP WHERE id=?").run(id);
      db.prepare('DELETE FROM user_sessions WHERE user_id=?').run(id);
      db.prepare('DELETE FROM user_permissions WHERE user_id=?').run(id);
    })();
  }
  return { enabled,create,session,login,update,changePassword,resetPassword,remove,
    list: () => db.prepare('SELECT * FROM app_users WHERE deleted_at IS NULL ORDER BY created_at,id').all().map(publicUser),
    logout: (token) => { if (token) db.prepare('DELETE FROM user_sessions WHERE token_hash=?').run(digest(token)); } };
}
