import { Router } from 'express';
import multer from 'multer';
import path from 'path';
import fs from 'fs';
import { authRequired } from '../middleware/authMiddleware.js';
import { fileURLToPath } from 'url';
import { v2 as cloudinary } from 'cloudinary';

const router = Router();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

function ensureDir(dir) {
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
}

const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    const type = (req.query.type || 'file').toString();
    let folder = 'files';
    if (type === 'avatar') folder = 'avatars';
    if (type === 'group') folder = 'groups';
    const dest = path.join(__dirname, '..', 'uploads', folder);
    ensureDir(dest);
    cb(null, dest);
  },
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname);
    const base = path.basename(file.originalname, ext).replace(/[^a-zA-Z0-9_-]+/g, '-').slice(0, 64);
    const unique = Date.now() + '-' + Math.round(Math.random() * 1e9);
    cb(null, `${base || 'file'}-${unique}${ext}`);
  },
});

const upload = multer({ storage, limits: { fileSize: 25 * 1024 * 1024 } });

router.post('/', authRequired, upload.single('file'), async (req, res) => {
  try {
    const type = (req.query.type || 'file').toString();
    let folder = 'files';
    if (type === 'avatar') folder = 'avatars';
    if (type === 'group') folder = 'groups';

    const useCloud = process.env.USE_CLOUDINARY === 'true' || process.env.NODE_ENV === 'production';
    if (useCloud && process.env.CLOUDINARY_URL) {
      cloudinary.config({ secure: true }); // usa CLOUDINARY_URL
      const publicIdBase = path.parse(req.file.filename).name;
      const uploadRes = await cloudinary.uploader.upload(req.file.path, {
        folder: `linkchat/${folder}`,
        resource_type: 'auto',
        public_id: publicIdBase,
        overwrite: false,
      });
      // Borra archivo temporal local
      fs.unlink(req.file.path, () => {});
      return res.status(201).json({ url: uploadRes.secure_url, nombre: req.file.originalname, size: req.file.size, tipo: type });
    }

    // Fallback local (desarrollo)
    const url = `/uploads/${folder}/${req.file.filename}`;
    res.status(201).json({ url, nombre: req.file.originalname, size: req.file.size, tipo: type });
  } catch (e) {
    res.status(500).json({ message: 'Error subiendo archivo', error: e.message });
  }
});

export default router;
