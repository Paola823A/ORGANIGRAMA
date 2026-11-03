import { config } from '../../config/index.js';
import { assert } from '../../utils/errors.js';
const loopbacks = ['127.0.0.1','::1','::ffff:127.0.0.1'];
export function localRequest(req) {
  return !config.authRequired && ['127.0.0.1','localhost','::1'].includes(config.host)
    && loopbacks.includes(req.socket.remoteAddress) && ['127.0.0.1','localhost','[::1]'].includes(req.hostname);
}
export function identify(auth) {
  return (req,_res,next) => {
    const token = (req.headers.cookie || '').split(';').map((s) => s.trim()).find((s) => s.startsWith('ain_session='))?.slice(12);
    req.sessionToken = token;
    req.user = auth.session(token);
    next();
  };
}
export function accessControl(db,auth) {
  return (req,res,next) => {
    if (!auth.enabled()) {
      assert(localRequest(req),'Configura la cuenta del creador antes de habilitar el acceso remoto.',503);
      return next();
    }
    const user = req.user;
    assert(user,'Inicia sesión para acceder.',401);
    assert(!user.mustChangePassword,'Debes cambiar tu contraseña temporal.',403);
    if (user.role === 'OWNER') return next();
    const can = (company,module) => user.permissions.some((p) => p.companyId === company && (!module || p.module === module || module === 'graphic' && p.module === 'board'));
    const path = req.path;
    const write = !['GET','HEAD'].includes(req.method);
    if (path.startsWith('/imports')) {
      const allowed = user.permissions.filter((p) => p.module === 'upload').map((p) => p.companyId);
      assert(allowed.length,'No tienes permiso para cargar la base.',403);
      req.importScope = { userId:user.id, companyIds:allowed };
    } else if (path === '/companies' || path === '/charts') {
      const send = res.json.bind(res);
      res.json = (rows) => send(Array.isArray(rows) ? rows.filter((r) => can(path === '/companies' ? r.id : r.company_id,path === '/companies' ? null:'graphic')) : rows);
    } else if (path.startsWith('/companies/')) {
      assert(can(path.split('/')[2],'graphic'),'No tienes acceso a este módulo en esta empresa.',403);
    } else if (path.startsWith('/employees')) {
      const id = path.split('/')[2];
      if (id && id !== 'ceased') {
        const employee = db.prepare('SELECT company_id FROM employees WHERE id=?').get(id);
        assert(employee && can(employee.company_id,'board'),'No tienes acceso a este empleado.',403);
      } else {
        const allowed = user.permissions.filter((p) => p.module === 'board').map((p) => p.companyId);
        assert(allowed.length,'No tienes permiso para consultar la base de personal.',403);
        if (req.query.companyId) assert(allowed.includes(req.query.companyId),'No tienes acceso a esta empresa.',403);
        req.allowedEmployeeCompanies = allowed;
      }
    } else if (path.startsWith('/charts/') || path.startsWith('/drafts/')) {
      const parts = path.split('/');
      const chart = parts[1] === 'drafts'
        ? db.prepare('SELECT o.* FROM organization_charts o JOIN chart_drafts d ON d.chart_id=o.id WHERE d.id=?').get(parts[2])
        : db.prepare('SELECT * FROM organization_charts WHERE id=?').get(parts[2]);
      const module = write || parts[1] === 'drafts' || parts.includes('drafts') ? 'board' : 'graphic';
      assert(chart && can(chart.company_id,module),'No tienes permiso para este módulo en esta empresa.',403);
      // New references require access to the employee's company too. Existing
      // shared cards remain editable in the chart the creator authorized.
      if (write && Array.isArray(req.body?.nodes)) {
        const existing = parts[1] === 'drafts' ? db.prepare('SELECT employee_id FROM chart_nodes WHERE draft_id=?').all(parts[2]) : [];
        const ids = new Set(existing.map((row) => row.employee_id));
        for (const node of req.body.nodes) if (node.employeeId && !ids.has(node.employeeId)) {
          const e = db.prepare('SELECT company_id FROM employees WHERE id=?').get(node.employeeId);
          assert(e && can(e.company_id,'board'),'No tienes permiso para incorporar personal de esta empresa.',403);
        }
      }
    } else assert(false,'Acceso no autorizado.',403);
    next();
  };
}
