import { Router } from 'express';
import { param } from 'express-validator';
import { authRequired } from '../middleware/authMiddleware.js';
import User from '../models/User.js';

const router = Router();

// Alias para aceptar solicitud de amistad: POST /api/friends/:id/accept
router.post('/:id/accept', authRequired, param('id').isMongoId(), async (req, res) => {
  try {
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
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ message: 'Error aceptando solicitud', error: e.message });
  }
});

export default router;
