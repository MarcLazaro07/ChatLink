import 'dotenv/config';
import express from 'express';
import http from 'http';
import mongoose from 'mongoose';
import cors from 'cors';
import helmet from 'helmet';
import morgan from 'morgan';
import rateLimit from 'express-rate-limit';
import path from 'path';
import { fileURLToPath } from 'url';

import { initSocket } from './socket.js';

import authRoutes from './routes/auth.routes.js';
import usersRoutes from './routes/users.routes.js';
import chatsRoutes from './routes/chats.routes.js';
import messagesRoutes from './routes/messages.routes.js';
import groupsRoutes from './routes/groups.routes.js';
import uploadRoutes from './routes/uploads.routes.js';
import friendsRoutes from './routes/friends.routes.js';

const app = express();
const server = http.createServer(app);

// Initialize Socket.IO
initSocket(server);

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Security & common middleware
app.use(
  helmet({
    contentSecurityPolicy: {
      useDefaults: true,
      directives: {
        defaultSrc: ["'self'"],
        scriptSrc: ["'self'", 'https://cdn.socket.io', 'https://cdnjs.cloudflare.com', 'https://cdn.jsdelivr.net', 'https://unpkg.com'],
        workerSrc: ["'self'", 'blob:', 'https://cdnjs.cloudflare.com', 'https://cdn.jsdelivr.net', 'https://unpkg.com'],
        styleSrc: ["'self'", "'unsafe-inline'", 'https://fonts.googleapis.com'],
        fontSrc: ["'self'", 'https://fonts.gstatic.com', 'data:'],
        imgSrc: ["'self'", 'data:', 'blob:', 'https://res.cloudinary.com'],
        connectSrc: ["'self'", 'ws:', 'wss:', 'https://cdn.socket.io', 'https://cdnjs.cloudflare.com', 'https://res.cloudinary.com'],
        frameSrc: [
          "'self'",
          'https://www.youtube.com',
          'https://player.vimeo.com',
          'https://open.spotify.com',
          'https://w.soundcloud.com',
        ],
        mediaSrc: ["'self'", 'data:', 'blob:', 'https://res.cloudinary.com'],
        objectSrc: ["'none'"],
        baseUri: ["'self'"],
      },
    },
    crossOriginEmbedderPolicy: false, // allow PDF.js worker
  })
);
app.use(cors({ origin: process.env.CORS_ORIGIN ? process.env.CORS_ORIGIN.split(',') : '*', credentials: true }));
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));
app.use(morgan('dev'));

// Serve local uploads only in development
if (process.env.NODE_ENV !== 'production') {
  app.use('/uploads', express.static(path.join(__dirname, 'uploads')));
}

// Rate limit uploads
const uploadLimiter = rateLimit({ windowMs: 60_000, max: 20 });
app.use('/api/upload', uploadLimiter);

// Routes
app.use('/api/auth', authRoutes);
app.use('/api/users', usersRoutes);
app.use('/api/friends', friendsRoutes);
app.use('/api/chats', chatsRoutes);
app.use('/api/messages', messagesRoutes);
app.use('/api/groups', groupsRoutes);
app.use('/api/upload', uploadRoutes);

// Serve pdf.js library locally (mount BEFORE frontend static)
app.use('/libs/pdfjs', express.static(path.join(__dirname, 'node_modules', 'pdfjs-dist', 'legacy', 'build')));
app.use('/libs/pdfjs', express.static(path.join(__dirname, 'node_modules', 'pdfjs-dist', 'build')));

// Explicit mapping to avoid any ambiguity
app.get('/libs/pdfjs/pdf.js', (req, res) => {
  res.type('application/javascript');
  res.sendFile(path.join(__dirname, 'node_modules', 'pdfjs-dist', 'build', 'pdf.js'));
});
app.get('/libs/pdfjs/pdf.worker.js', (req, res) => {
  res.type('application/javascript');
  res.sendFile(path.join(__dirname, 'node_modules', 'pdfjs-dist', 'build', 'pdf.worker.js'));
});

// Serve frontend static files
const frontendPath = path.join(__dirname, '..', 'frontend');
app.use(express.static(frontendPath));

app.get('/', (req, res) => {
  res.sendFile(path.join(frontendPath, 'index.html'));
});

// Favicon fallback
app.get('/favicon.ico', (req, res) => {
  res.type('image/svg+xml');
  res.sendFile(path.join(frontendPath, 'favicon.svg'));
});

// DB connection & server start
const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017/chatapp';
mongoose.set('strictQuery', true);
mongoose
  .connect(MONGODB_URI)
  .then(() => {
    const port = process.env.PORT || 5000;
    server.listen(port, () => {
      console.log(`Server listening on http://localhost:${port}`);
    });
  })
  .catch((err) => {
    console.error('MongoDB connection error', err);
    process.exit(1);
  });
