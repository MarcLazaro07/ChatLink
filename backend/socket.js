import { Server } from 'socket.io';
import jwt from 'jsonwebtoken';

let io;
const onlineUsers = new Map(); // userId -> Set(socketId)

export function initSocket(httpServer) {
  io = new Server(httpServer, {
    cors: { origin: process.env.CORS_ORIGIN ? process.env.CORS_ORIGIN.split(',') : '*', credentials: true },
  });

  io.on('connection', (socket) => {
    // Optional handshake auth via token
    const token = socket.handshake.auth?.token || socket.handshake.query?.token;
    if (token) {
      try {
        const payload = jwt.verify(token, process.env.JWT_SECRET);
        attachUser(socket, payload.id);
      } catch {}
    }

    socket.on('authenticate', (tokenStr) => {
      try {
        const payload = jwt.verify(tokenStr, process.env.JWT_SECRET);
        attachUser(socket, payload.id);
      } catch {
        socket.emit('error', 'Invalid token');
      }
    });

    socket.on('join:group', (groupId) => {
      if (groupId) socket.join(`group:${groupId}`);
    });

    socket.on('typing', (targetId, isGroup) => {
      if (!socket.data.userId || !targetId) return;
      if (isGroup) {
        io.to(`group:${targetId}`).emit('typing', { from: socket.data.userId, isGroup: true });
      } else {
        emitToUser(targetId, 'typing', { from: socket.data.userId, isGroup: false });
      }
    });

    socket.on('disconnect', () => {
      const userId = socket.data.userId;
      if (userId) {
        const set = onlineUsers.get(userId);
        if (set) {
          set.delete(socket.id);
          if (set.size === 0) {
            onlineUsers.delete(userId);
            io.emit('user:offline', userId);
          }
        }
      }
    });
  });

  return io;
}

function attachUser(socket, userId) {
  socket.data.userId = String(userId);
  if (!onlineUsers.has(socket.data.userId)) onlineUsers.set(socket.data.userId, new Set());
  onlineUsers.get(socket.data.userId).add(socket.id);
  socket.join(`user:${socket.data.userId}`);
  io.emit('user:online', socket.data.userId);
}

export function emitToUser(userId, event, payload) {
  if (!io) return;
  io.to(`user:${userId}`).emit(event, payload);
}

export function getIO() {
  if (!io) throw new Error('Socket.io not initialized');
  return io;
}
