import { Router } from 'express';
import { assert } from '../../utils/errors.js';
import { config } from '../../config/index.js';
export function authRoutes(auth, local) {
  const router = Router();
  const cookie = (res,token) => res.cookie('ain_session',token,{ httpOnly:true,sameSite:'strict',secure:config.secureCookies,path:'/',maxAge:8*3600000 });
  const owner = (req,_res,next) => { assert(req.user?.role === 'OWNER' && !req.user.mustChangePassword,'Solo el creador puede administrar usuarios.',403); next(); };
  router.get('/session',(req,res) => res.json({ enabled:auth.enabled(), localMode:!auth.enabled() && local(req), user:req.user }));
  router.post('/login',async (req,res) => {
    const result = await auth.login(req.body.username,req.body.password,req.socket.remoteAddress);
    cookie(res,result.token); res.json(result.user);
  });
  router.post('/logout',(req,res) => { auth.logout(req.sessionToken); res.clearCookie('ain_session',{path:'/'}); res.json({ok:true}); });
  router.post('/password',owner,async (req,res) => {
    await auth.changePassword(req.user.id,req.body.currentPassword,req.body.newPassword);
    res.clearCookie('ain_session',{path:'/'}); res.json({ok:true});
  });
  router.get('/users',owner,(_req,res) => res.json(auth.list()));
  router.post('/users',owner,async (req,res) => res.status(201).json(await auth.create(req.body)));
  router.put('/users/:id',owner,async (req,res) => res.json(await auth.update(req.params.id,req.body)));
  router.delete('/users/:id',owner,(req,res) => {auth.remove(req.params.id);res.json({ok:true});});
  router.post('/users/:id/password',owner,async (req,res) => { await auth.resetPassword(req.params.id,req.body.password);res.json({ok:true}); });
  return router;
}
