import { Router } from 'express';
import { body, query, param, validationResult } from 'express-validator';
import { authRequired } from '../middleware/authMiddleware.js';
import Message from '../models/Message.js';
import Group from '../models/Group.js';
import { emitToUser, getIO } from '../socket.js';

const router = Router();

// Buscar mensajes por texto
router.get(
  '/search',
  authRequired,
  query('peerId').isMongoId(),
  query('esGrupo').isBoolean().toBoolean(),
  query('q').isString(),
  query('page').optional().isInt({ min: 1 }).toInt(),
  query('limit').optional().isInt({ min: 1, max: 100 }).toInt(),
  async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) return res.status(400).json({ errors: errors.array() });
    const { peerId } = req.query;
    const esGrupo = req.query.esGrupo === true || req.query.esGrupo === 'true';
    const q = req.query.q;
    const page = Math.max(1, parseInt(req.query.page) || 1);
    const limit = Math.min(100, Math.max(1, parseInt(req.query.limit) || 30));
    let filter;
    if (esGrupo) {
      filter = { receptor: peerId, esGrupo: true, $text: { $search: q } };
    } else {
      filter = {
        esGrupo: false,
        $or: [
          { emisor: req.user.id, receptor: peerId },
          { emisor: peerId, receptor: req.user.id },
        ],
        $text: { $search: q },
      };
    }
    const total = await Message.countDocuments(filter);
    const messages = await Message.find(filter).sort({ fecha: -1 }).skip((page - 1) * limit).limit(limit);
    res.json({ total, page, limit, messages });
  }
);

// Obtener mensajes con paginación
router.get(
  '/:id',
  authRequired,
  param('id').isMongoId(),
  query('esGrupo').optional().isBoolean().toBoolean(),
  query('page').optional().isInt({ min: 1 }).toInt(),
  query('limit').optional().isInt({ min: 1, max: 100 }).toInt(),
  async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) return res.status(400).json({ errors: errors.array() });
    const { id } = req.params;
    const esGrupo = req.query.esGrupo === true || req.query.esGrupo === 'true';
    const page = Math.max(1, parseInt(req.query.page) || 1);
    const limit = Math.min(100, Math.max(1, parseInt(req.query.limit) || 30));
    let filter;
    if (esGrupo) {
      filter = { receptor: id, esGrupo: true };
    } else {
      // Direct chat: messages in both directions
      filter = {
        esGrupo: false,
        $or: [
          { emisor: req.user.id, receptor: id },
          { emisor: id, receptor: req.user.id },
        ],
      };
    }
    const total = await Message.countDocuments(filter);
    const messages = await Message.find(filter)
      .sort({ fecha: -1 })
      .skip((page - 1) * limit)
      .limit(limit);
    res.json({ total, page, limit, messages });
  }
);

// Enviar mensaje
router.post(
  '/',
  authRequired,
  body('receptor').isMongoId(),
  body('esGrupo').isBoolean(),
  body('tipo').optional().isIn(['texto', 'imagen', 'pdf', 'video', 'audio', 'archivo']).default('texto'),
  body('contenido').optional().isString(),
  body('meta').optional(),
  async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) return res.status(400).json({ errors: errors.array() });
    try {
      const { receptor, esGrupo, tipo = 'texto', contenido = '', meta = {} } = req.body;

      if (esGrupo) {
        const group = await Group.findById(receptor);
        if (!group) return res.status(404).json({ message: 'Grupo no encontrado' });
        if (!group.miembros.some((id) => id.equals(req.user.id))) return res.status(403).json({ message: 'No perteneces al grupo' });
      }

      const message = await Message.create({
        emisor: req.user.id,
        receptor,
        esGrupo,
        tipo,
        contenido,
        meta,
        fecha: new Date(),
      });

      // Mention notifications
      try {
        const mentions = Array.isArray(meta?.mentions) ? meta.mentions.map(String) : [];
        for (const uid of mentions) {
          if (uid && uid !== String(req.user.id)) {
            emitToUser(uid, 'mention', {
              by: req.user.id,
              message: { _id: message._id, tipo: message.tipo, contenido: message.contenido, receptor: message.receptor, esGrupo: message.esGrupo },
            });
          }
        }
      } catch {}

      if (esGrupo) {
        getIO().to(`group:${receptor}`).emit('message:new', message);
      } else {
        emitToUser(receptor, 'message:new', message);
        emitToUser(req.user.id, 'message:new', message); // sincroniza otros dispositivos del emisor
      }

      res.status(201).json(message);
    } catch (e) {
      res.status(500).json({ message: 'Error enviando mensaje', error: e.message });
    }
  }
);

// Marcar como visto
router.put(
  '/:id/seen',
  authRequired,
  param('id').isMongoId(),
  async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) return res.status(400).json({ errors: errors.array() });
    try {
      const message = await Message.findByIdAndUpdate(
        req.params.id,
        { $addToSet: { vistoPor: req.user.id } },
        { new: true }
      );
      if (!message) return res.status(404).json({ message: 'Mensaje no encontrado' });

      if (message.esGrupo) {
        getIO().to(`group:${message.receptor}`).emit('message:seen', { id: message._id, userId: req.user.id });
      } else {
        const other = message.emisor.equals(req.user.id) ? message.receptor : message.emisor;
        emitToUser(other, 'message:seen', { id: message._id, userId: req.user.id });
      }

      res.json(message);
    } catch (e) {
      res.status(500).json({ message: 'Error marcando visto', error: e.message });
    }
  }
);

// Fijar/Desfijar mensaje
router.put(
  '/:id/pin',
  authRequired,
  param('id').isMongoId(),
  body('fijado').optional().isBoolean().toBoolean(),
  async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) return res.status(400).json({ errors: errors.array() });
    try {
      const message = await Message.findById(req.params.id);
      if (!message) return res.status(404).json({ message: 'Mensaje no encontrado' });

      // Permisos: directos -> emisor o receptor; grupos -> admin del grupo
      if (message.esGrupo) {
        const group = await Group.findById(message.receptor);
        if (!group) return res.status(404).json({ message: 'Grupo no encontrado' });
        const isAdmin = group.admins.some((id) => id.equals(req.user.id));
        if (!isAdmin) return res.status(403).json({ message: 'Solo admins del grupo' });
      } else {
        const isParty = message.emisor.equals(req.user.id) || String(message.receptor) === String(req.user.id);
        if (!isParty) return res.status(403).json({ message: 'Sin permiso' });
      }

      const fijado = req.body.fijado !== undefined ? req.body.fijado : !message.fijado;
      message.fijado = fijado;
      await message.save();

      if (message.esGrupo) {
        getIO().to(`group:${message.receptor}`).emit('message:pin', { id: message._id, fijado });
      } else {
        const other = message.emisor.equals(req.user.id) ? message.receptor : message.emisor;
        emitToUser(other, 'message:pin', { id: message._id, fijado });
        emitToUser(req.user.id, 'message:pin', { id: message._id, fijado });
      }

      res.json({ id: message._id, fijado });
    } catch (e) {
      res.status(500).json({ message: 'Error fijando mensaje', error: e.message });
    }
  }
);

// Eliminar mensaje
router.delete(
  '/:id',
  authRequired,
  param('id').isMongoId(),
  async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) return res.status(400).json({ errors: errors.array() });
    try {
      const message = await Message.findById(req.params.id);
      if (!message) return res.status(404).json({ message: 'Mensaje no encontrado' });

      if (message.esGrupo) {
        const group = await Group.findById(message.receptor);
        if (!group) return res.status(404).json({ message: 'Grupo no encontrado' });
        const isAdmin = group.admins.some((id) => id.equals(req.user.id));
        const isOwner = message.emisor.equals(req.user.id);
        if (!isAdmin && !isOwner) return res.status(403).json({ message: 'Sin permiso' });
      } else {
        const isOwner = message.emisor.equals(req.user.id);
        if (!isOwner) return res.status(403).json({ message: 'Solo el emisor puede eliminar' });
      }

      await Message.deleteOne({ _id: message._id });

      if (message.esGrupo) {
        getIO().to(`group:${message.receptor}`).emit('message:deleted', { id: message._id });
      } else {
        const other = message.emisor.equals(req.user.id) ? message.receptor : message.emisor;
        emitToUser(other, 'message:deleted', { id: message._id });
        emitToUser(req.user.id, 'message:deleted', { id: message._id });
      }

      res.json({ id: message._id, deleted: true });
    } catch (e) {
      res.status(500).json({ message: 'Error eliminando mensaje', error: e.message });
    }
  }
);

// Editar mensaje (solo emisor; admin de grupo no edita, solo puede eliminar)
router.put(
  '/:id',
  authRequired,
  param('id').isMongoId(),
  body('contenido').isString(),
  async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) return res.status(400).json({ errors: errors.array() });
    try {
      const message = await Message.findById(req.params.id);
      if (!message) return res.status(404).json({ message: 'Mensaje no encontrado' });
      const isOwner = message.emisor.equals(req.user.id);
      if (!isOwner) return res.status(403).json({ message: 'Solo el emisor puede editar' });
      if (message.tipo !== 'texto') return res.status(400).json({ message: 'Solo mensajes de texto' });
      const prev = message.contenido;
      message.contenido = String(req.body.contenido || '');
      message.set('edited', true);
      const edits = Array.isArray(message.meta?.edits) ? message.meta.edits : [];
      edits.push({ at: new Date(), by: req.user.id, prev });
      message.meta = { ...(message.meta||{}), edits };
      await message.save();

      if (message.esGrupo) {
        getIO().to(`group:${message.receptor}`).emit('message:edited', { id: message._id, contenido: message.contenido, edited: true });
      } else {
        const other = message.emisor.equals(req.user.id) ? message.receptor : message.emisor;
        emitToUser(other, 'message:edited', { id: message._id, contenido: message.contenido, edited: true });
        emitToUser(req.user.id, 'message:edited', { id: message._id, contenido: message.contenido, edited: true });
      }
      res.json({ id: message._id, contenido: message.contenido, edited: true });
    } catch (e) {
      res.status(500).json({ message: 'Error editando mensaje', error: e.message });
    }
  }
);

// Reaccionar a mensaje (toggle)
router.post(
  '/:id/react',
  authRequired,
  param('id').isMongoId(),
  body('emoji').isString(),
  async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) return res.status(400).json({ errors: errors.array() });
    try {
      const message = await Message.findById(req.params.id);
      if (!message) return res.status(404).json({ message: 'Mensaje no encontrado' });
      const emoji = String(req.body.emoji || '').slice(0, 4);
      let reactions = Array.isArray(message.reactions) ? message.reactions : [];
      const idx = reactions.findIndex(r => r.emoji === emoji);
      const uid = String(req.user.id);
      if (idx === -1) reactions.push({ emoji, users: [uid] });
      else {
        const set = new Set(reactions[idx].users.map(String));
        if (set.has(uid)) { set.delete(uid); } else { set.add(uid); }
        reactions[idx].users = Array.from(set);
      }
      message.set('reactions', reactions);
      await message.save();

      const payload = { id: message._id, emoji, users: reactions.find(r=>r.emoji===emoji)?.users || [] };
      if (message.esGrupo) getIO().to(`group:${message.receptor}`).emit('message:react', payload);
      else {
        const other = message.emisor.equals(req.user.id) ? message.receptor : message.emisor;
        emitToUser(other, 'message:react', payload);
        emitToUser(req.user.id, 'message:react', payload);
      }
      res.json(payload);
    } catch (e) {
      res.status(500).json({ message: 'Error reaccionando', error: e.message });
    }
  }
);

export default router;
