import jwt from 'jsonwebtoken';
import User from '../models/User.js';

export function authRequired(req, res, next) {
  const header = req.headers.authorization || '';
  const [type, token] = header.split(' ');
  if (type !== 'Bearer' || !token) return res.status(401).json({ message: 'Token requerido' });
  try {
    const payload = jwt.verify(token, process.env.JWT_SECRET);
    req.user = { id: payload.id };
    next();
  } catch (e) {
    return res.status(401).json({ message: 'Token inválido' });
  }
}

export async function attachUser(req, res, next) {
  if (!req.user?.id) return next();
  req.me = await User.findById(req.user.id).select('-password');
  next();
}
