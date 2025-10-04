import { Router } from 'express';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { body, validationResult } from 'express-validator';
import User from '../models/User.js';
import Message from '../models/Message.js';

const router = Router();

router.post(
  '/register',
  body('username').isLength({ min: 3 }).toLowerCase().trim(),
  body('email').isEmail().normalizeEmail(),
  body('password').isLength({ min: 6 }),
  body('nombre').optional().isString(),
  async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) return res.status(400).json({ errors: errors.array() });
    const { username, email, password, nombre } = req.body;
    try {
      const exists = await User.findOne({ $or: [{ username }, { email }] });
      if (exists) return res.status(409).json({ message: 'Usuario o email ya existe' });
      const hash = await bcrypt.hash(password, 10);
      const user = await User.create({
        username,
        email,
        password: hash,
        nombre: nombre || username,
      });

      // Seed a direct chat with the LinkChat system user (only once per user)
      try {
        // Ensure system user exists
        const sysUsername = 'linkchat';
        let sys = await User.findOne({ username: sysUsername });
        if (!sys) {
          const sysHash = await bcrypt.hash(process.env.LINKCHAT_BOT_PASSWORD || 'linkchat!system', 10);
          sys = await User.create({
            username: sysUsername,
            email: 'linkchat@system.local',
            password: sysHash,
            nombre: 'LinkChat',
            fotoPerfil: '/favicon.svg',
            estado: 'Asistente',
          });
        } else if (sys.fotoPerfil !== '/favicon.svg') {
          // keep avatar in sync with current logo path
          sys.fotoPerfil = '/favicon.svg'; await sys.save();
        }

        // Only seed if no prior conversation exists
        const exists = await Message.exists({ esGrupo: false, $or: [ { emisor: sys._id, receptor: user._id }, { emisor: user._id, receptor: sys._id } ] });
        if (!exists) {
          const now = new Date();
          const msgs = [
            {
              emisor: sys._id,
              receptor: user._id,
              esGrupo: false,
              tipo: 'texto',
              contenido: '¡Bienvenido a LinkChat! Aquí puedes chatear en tiempo real, crear grupos y personalizar tu apariencia (modo y paleta en la seccion de configuracion que esta en los 3 puntos).',
              fecha: now,
            },
            {
              emisor: sys._id,
              receptor: user._id,
              esGrupo: false,
              tipo: 'texto',
              contenido: 'Para agregar a alguien toca los tres puntos (arriba a la derecha) > "Agregar contacto", busca su usuario (username) y envía solicitud. La otra persona debe aceptar para que puedan chatear. Para crear un grupo, toca "Crear grupo", ponle nombre y selecciona miembros.',
              fecha: new Date(now.getTime() + 1000),
            },
            {
              emisor: sys._id,
              receptor: user._id,
              esGrupo: false,
              tipo: 'texto',
              contenido: 'Puedes adjuntar fotos y PDFs con el clip. Los enlaces enviados de contenido multimedia compatible se previsualizan como youtube, soundcloud y mas proximamente.',
              fecha: new Date(now.getTime() + 2000),
            },
            {
              emisor: sys._id,
              receptor: user._id,
              esGrupo: false,
              tipo: 'texto',
              contenido: 'https://youtu.be/hwqIGchuYK0?si=Qd0h37quMgzryrux',
              fecha: new Date(now.getTime() + 3000),
            },
            {
              emisor: sys._id,
              receptor: user._id,
              esGrupo: false,
              tipo: 'texto',
              contenido: 'Ya puedes empezar a usar la página.',
              fecha: new Date(now.getTime() + 4000),
            },
          ];
          await Message.insertMany(msgs);
        }
      } catch (seedErr) {
        // non-blocking
        console.error('Seed chat error:', seedErr?.message || seedErr);
      }
      const token = jwt.sign({ id: user._id }, process.env.JWT_SECRET, { expiresIn: '7d' });
      res.status(201).json({
        token,
        user: {
          id: user._id,
          username: user.username,
          email: user.email,
          nombre: user.nombre,
          fotoPerfil: user.fotoPerfil,
          estado: user.estado,
          tema: user.tema,
        },
      });
    } catch (e) {
      res.status(500).json({ message: 'Error registrando', error: e.message });
    }
  }
);

router.post(
  '/login',
  body('username').notEmpty(),
  body('password').notEmpty(),
  async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) return res.status(400).json({ errors: errors.array() });
    const { username, password } = req.body;
    try {
      const id = String(username || '').toLowerCase().trim();
      const user = await User.findOne({ $or: [ { username: id }, { email: id } ] });
      if (!user) return res.status(401).json({ message: 'Credenciales inválidas' });
      const ok = await bcrypt.compare(password, user.password);
      if (!ok) return res.status(401).json({ message: 'Credenciales inválidas' });
      const token = jwt.sign({ id: user._id }, process.env.JWT_SECRET, { expiresIn: '7d' });
      user.ultimoAcceso = new Date();
      await user.save();
      res.json({
        token,
        user: {
          id: user._id,
          username: user.username,
          email: user.email,
          nombre: user.nombre,
          fotoPerfil: user.fotoPerfil,
          estado: user.estado,
          tema: user.tema,
        },
      });
    } catch (e) {
      res.status(500).json({ message: 'Error iniciando sesión', error: e.message });
    }
  }
);

export default router;
