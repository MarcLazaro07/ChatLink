import { Router } from 'express';
import { query, param, body, validationResult } from 'express-validator';
import { authRequired } from '../middleware/authMiddleware.js';
import { emitToUser } from '../socket.js';
import User from '../models/User.js';
import Message from '../models/Message.js';
import Group from '../models/Group.js';

const router = Router();

// Perfil del usuario autenticado
router.get('/me', authRequired, async (req, res) => {
  const user = await User.findById(req.user.id)
    .select('-password')
    .populate({ path: 'amigos', select: 'username nombre fotoPerfil estado online' })
    .populate({ path: 'solicitudes', select: 'username nombre fotoPerfil estado online' });
  if (!user) return res.status(404).json({ message: 'Usuario no encontrado' });
  const u = user.toObject();
  u.id = u._id;
  res.json(u);
});

router.get('/search', authRequired, query('q').optional().isString(), async (req, res) => {
  const q = (req.query.q || '').toString().toLowerCase();
  if (!q) return res.json([]);
  const users = await User.find({ username: { $regex: q, $options: 'i' } })
    .limit(20)
    .select('_id username nombre fotoPerfil estado');
  res.json(users);
});

router.get('/:id', authRequired, param('id').isMongoId(), async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) return res.status(400).json({ errors: errors.array() });
  const { id } = req.params;
  const user = await User.findById(id).select('-password');
  if (!user) return res.status(404).json({ message: 'Usuario no encontrado' });
  const u = user.toObject();
  u.id = u._id;
  res.json(u);
});

router.put('/:id', authRequired, body('nombre').optional().isString(), body('estado').optional().isString(), body('tema').optional().isString(), body('mode').optional().isIn(['claro','oscuro']), body('palette').optional().isIn(['azul','verde','naranja','morado']), body('descripcion').optional().isString(), async (req, res) => {
  if (req.params.id !== req.user.id) return res.status(403).json({ message: 'Sin permiso' });
  const updates = {};
  ['nombre', 'estado', 'tema', 'mode', 'palette', 'fotoPerfil', 'descripcion'].forEach((k) => {
    if (req.body[k] !== undefined) updates[k] = req.body[k];
  });
  const user = await User.findByIdAndUpdate(req.user.id, updates, { new: true }).select('-password');
  const u = user.toObject();
  u.id = u._id;
  res.json(u);
});

router.post('/:id/request', authRequired, param('id').isMongoId(), async (req, res) => {
  const targetId = req.params.id;
  if (targetId === req.user.id) return res.status(400).json({ message: 'No puedes enviarte solicitud a ti mismo' });
  const me = await User.findById(req.user.id);
  const target = await User.findById(targetId);
  if (!target) return res.status(404).json({ message: 'Usuario no encontrado' });
  if (me.amigos.includes(target._id)) return res.status(400).json({ message: 'Ya son amigos' });
  if (!target.solicitudes.includes(me._id)) {
    target.solicitudes.push(me._id);
    await target.save();
    try {
      emitToUser(targetId, 'friend:request', { from: { id: me._id, username: me.username, nombre: me.nombre, fotoPerfil: me.fotoPerfil } });
    } catch {}
  }
  res.json({ ok: true });
});

router.post('/friends/:id/accept', authRequired, param('id').isMongoId(), async (req, res) => {
  const requesterId = req.params.id;
  const me = await User.findById(req.user.id);
  const requester = await User.findById(requesterId);
  if (!requester) return res.status(404).json({ message: 'Usuario no encontrado' });
  if (!me.solicitudes.some((id) => id.equals(requester._id))) return res.status(400).json({ message: 'No hay solicitud' });
  me.solicitudes = me.solicitudes.filter((id) => !id.equals(requester._id));
  if (!me.amigos.some((id) => id.equals(requester._id))) me.amigos.push(requester._id);
  if (!requester.amigos.some((id) => id.equals(me._id))) requester.amigos.push(me._id);
  await me.save();
  await requester.save();
  try {
    emitToUser(requesterId, 'friend:accepted', { by: { id: me._id, username: me.username, nombre: me.nombre, fotoPerfil: me.fotoPerfil } });
    emitToUser(me._id, 'friend:accepted', { by: { id: requester._id, username: requester.username, nombre: requester.nombre, fotoPerfil: requester.fotoPerfil } });
  } catch {}
  res.json({ ok: true });
});

// Delete account: remove directs, pull from groups/friends, keep group messages (anonymized on client)
router.delete('/me', authRequired, async (req, res) => {
  try {
    const userId = req.user.id;
    // 1) Delete direct messages where user participated
    await Message.deleteMany({ esGrupo: false, $or: [{ emisor: userId }, { receptor: userId }] });
    // 2) Remove user from groups (miembros, admins)
    await Group.updateMany({}, { $pull: { miembros: userId, admins: userId } });
    // 3) Remove user references from other users (friends and requests)
    await User.updateMany({}, { $pull: { amigos: userId, solicitudes: userId } });
    // 4) Delete the user
    await User.findByIdAndDelete(userId);
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ message: 'Error eliminando cuenta', error: e.message });
  }
});

export default router;
