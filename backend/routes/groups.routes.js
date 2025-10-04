import { Router } from 'express';
import { body, param, validationResult } from 'express-validator';
import { authRequired } from '../middleware/authMiddleware.js';
import Group from '../models/Group.js';
import User from '../models/User.js';
import Message from '../models/Message.js';
import { getIO } from '../socket.js';

const router = Router();

// Crear grupo
router.post(
  '/',
  authRequired,
  body('nombre').isString().isLength({ min: 2 }),
  body('miembros').optional().isArray(),
  body('descripcion').optional().isString(),
  async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) return res.status(400).json({ errors: errors.array() });
    try {
      const { nombre, miembros = [], imagen, descripcion } = req.body;
      const uniqueMemberIds = new Set([req.user.id, ...miembros.map(String)]);
      const miembrosIds = Array.from(uniqueMemberIds);

      const users = await User.find({ _id: { $in: miembrosIds } }).select('_id');
      const validIds = users.map((u) => u._id);

      const group = await Group.create({
        nombre,
        imagen: imagen || '/uploads/groups/default.png',
        descripcion: descripcion || '',
        miembros: validIds,
        admins: [req.user.id],
        creador: req.user.id,
        fechaCreacion: new Date(),
      });

      res.status(201).json(group);
    } catch (e) {
      res.status(500).json({ message: 'Error creando grupo', error: e.message });
    }
  }
);

// Editar grupo (solo admins)
router.put(
  '/:id',
  authRequired,
  param('id').isMongoId(),
  body('nombre').optional().isString().isLength({ min: 2 }),
  body('imagen').optional().isString(),
  body('descripcion').optional().isString(),
  body('addMiembros').optional().isArray(),
  body('removeMiembros').optional().isArray(),
  async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) return res.status(400).json({ errors: errors.array() });
    try {
      const group = await Group.findById(req.params.id);
      if (!group) return res.status(404).json({ message: 'Grupo no encontrado' });
      const isAdmin = group.admins.some((id) => id.equals(req.user.id));
      if (!isAdmin) return res.status(403).json({ message: 'Solo admins pueden editar el grupo' });

      if (req.body.nombre !== undefined) group.nombre = req.body.nombre;
      if (req.body.imagen !== undefined) group.imagen = req.body.imagen;
      if (req.body.descripcion !== undefined) group.descripcion = req.body.descripcion;

      // Manage members
      const add = Array.isArray(req.body.addMiembros) ? req.body.addMiembros : [];
      const rem = Array.isArray(req.body.removeMiembros) ? req.body.removeMiembros : [];
      if (add.length) {
        const toAdd = await User.find({ _id: { $in: add } }).select('_id');
        toAdd.forEach((u) => { if (!group.miembros.some((id) => id.equals(u._id))) group.miembros.push(u._id); });
      }
      if (rem.length) {
        group.miembros = group.miembros.filter((id) => !rem.some((rid) => String(rid) === String(id)));
        // ensure at least one admin remains member
        group.admins = group.admins.filter((id) => group.miembros.some((m) => m.equals(id)));
      }
      await group.save();
      res.json(group);
    } catch (e) {
      res.status(500).json({ message: 'Error editando grupo', error: e.message });
    }
  }
);

// Obtener grupo con detalles
router.get('/:id', authRequired, param('id').isMongoId(), async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) return res.status(400).json({ errors: errors.array() });
  try {
    const g = await Group.findById(req.params.id)
      .select('nombre imagen descripcion miembros admins creador')
      .populate('miembros', 'username nombre fotoPerfil')
      .populate('admins', 'username nombre fotoPerfil');
    if (!g) return res.status(404).json({ message: 'Grupo no encontrado' });
    res.json(g);
  } catch (e) {
    res.status(500).json({ message: 'Error obteniendo grupo', error: e.message });
  }
});

export default router;
// Salir de un grupo (miembro)
router.post('/:id/leave', authRequired, param('id').isMongoId(), async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) return res.status(400).json({ errors: errors.array() });
  const group = await Group.findById(req.params.id);
  if (!group) return res.status(404).json({ message: 'Grupo no encontrado' });
  const wasMember = group.miembros.some((id) => id.equals(req.user.id));
  if (!wasMember) return res.status(400).json({ message: 'No eres miembro de este grupo' });
  group.miembros = group.miembros.filter((id) => !id.equals(req.user.id));
  group.admins = group.admins.filter((id) => !id.equals(req.user.id));
  await group.save();
  res.json({ ok: true });
});

// Eliminar grupo (solo admin): borra el grupo y sus mensajes
router.delete('/:id', authRequired, param('id').isMongoId(), async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) return res.status(400).json({ errors: errors.array() });
  try {
    const group = await Group.findById(req.params.id);
    if (!group) return res.status(404).json({ message: 'Grupo no encontrado' });
    const isAdmin = group.admins.some((id) => id.equals(req.user.id));
    if (!isAdmin) return res.status(403).json({ message: 'Solo admins pueden eliminar el grupo' });

    // Delete messages of this group
    await Message.deleteMany({ esGrupo: true, receptor: group._id });
    await Group.deleteOne({ _id: group._id });

    // Notify all connected members
    const io = getIO();
    io.to(`group:${group._id}`).emit('group:deleted', { id: group._id });
    res.json({ id: group._id, deleted: true });
  } catch (e) {
    res.status(500).json({ message: 'Error eliminando grupo', error: e.message });
  }
});
