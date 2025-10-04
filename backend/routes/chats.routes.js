import { Router } from 'express';
import { authRequired } from '../middleware/authMiddleware.js';
import Message from '../models/Message.js';
import Group from '../models/Group.js';
import User from '../models/User.js';
import mongoose from 'mongoose';

const router = Router();

router.get('/', authRequired, async (req, res) => {
  const userId = new mongoose.Types.ObjectId(req.user.id);
  try {
    // Direct chats: last message per peer
    const directs = await Message.aggregate([
      { $match: { esGrupo: false, $or: [{ emisor: userId }, { receptor: userId }] } },
      { $addFields: { otherUser: { $cond: [{ $eq: ['$emisor', userId] }, '$receptor', '$emisor'] } } },
      { $sort: { fecha: -1 } },
      { $group: { _id: '$otherUser', lastMessage: { $first: '$$ROOT' } } },
      { $limit: 50 },
    ]);

    // Also include friends without messages
    const me = await User.findById(userId).select('amigos');
    const directSet = new Set(directs.map((d) => String(d._id)));
    const allPeerIds = Array.from(new Set([...(me?.amigos || []).map(String), ...Array.from(directSet)])).map((id) => new mongoose.Types.ObjectId(id));

    const users = await User.find({ _id: { $in: allPeerIds } }).select('username nombre fotoPerfil estado online');
    const userMap = new Map(users.map((u) => [u._id.toString(), u]));

    // Merge directs with friends without messages
    const formattedDirects = [];
    const seen = new Set();
    for (const d of directs) {
      const key = d._id.toString();
      formattedDirects.push({ type: 'direct', user: userMap.get(key), lastMessage: d.lastMessage });
      seen.add(key);
    }
    for (const friendId of me?.amigos || []) {
      const key = friendId.toString();
      if (!seen.has(key) && userMap.get(key)) {
        formattedDirects.push({ type: 'direct', user: userMap.get(key), lastMessage: null });
      }
    }

    // Groups where user is a member (populate minimal member info)
    const groups = await Group.find({ miembros: userId })
      .select('nombre imagen miembros admins descripcion')
      .limit(50)
      .populate('miembros', 'username nombre fotoPerfil');

    res.json({ directs: formattedDirects, groups });
  } catch (e) {
    res.status(500).json({ message: 'Error listando chats', error: e.message });
  }
});

export default router;
