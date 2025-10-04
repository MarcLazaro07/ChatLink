# Realtime Chat Backend

Backend modular para chat en tiempo real con Express, MongoDB (Mongoose), JWT y Socket.IO.

## Requisitos
- Node.js 18+
- MongoDB en local o remoto

## Configuración
1. Copia `.env.example` a `.env` y ajusta valores:
```
PORT=5000
MONGODB_URI=mongodb://127.0.0.1:27017/chatapp
JWT_SECRET=your_jwt_secret_change_me
NODE_ENV=development
CORS_ORIGIN=http://localhost:5173
```

2. Instala dependencias:
```
npm install
```

3. Ejecuta en desarrollo con recarga:
```
npm run dev
```

El servidor expone:
- HTTP: `http://localhost:5000`
- WebSocket (Socket.IO): mismo host/puerto

## Estructura
```
backend/
 ├─ models/           # Mongoose models
 ├─ routes/           # Rutas REST
 ├─ middleware/       # Middlewares (auth)
 ├─ uploads/          # Almacenamiento local en dev (con .gitkeep)
 ├─ server.js         # App Express + conexión Mongo + montar rutas
 └─ socket.js         # Inicialización Socket.IO
```

## Rutas principales
- Auth
  - POST `/api/auth/register`
  - POST `/api/auth/login`
- Usuarios
  - GET `/api/users/search?q=...`
  - GET `/api/users/:id`
  - PUT `/api/users/:id`
  - POST `/api/users/:id/request`
  - POST `/api/users/friends/:id/accept` (nota: en spec sugerida es `/api/friends/:id/accept`)
- Chats
  - GET `/api/chats` (lista directos y grupos)
- Mensajes
  - GET `/api/messages/:id?esGrupo=true|false&page=1&limit=30`
  - POST `/api/messages`
  - PUT `/api/messages/:id/seen`
  - PUT `/api/messages/:id/pin`
- Grupos
  - POST `/api/groups`
  - PUT `/api/groups/:id`
- Uploads
  - POST `/api/upload?type=avatar|group|file` (campo `file` en `form-data`)

## Notas de seguridad
- JWT vía `Authorization: Bearer <token>`
- Contraseñas con `bcryptjs`
- Rate-limit aplicado a `/api/upload`
- `helmet` y `cors` habilitados

## WebSocket (Socket.IO)
Eventos soportados:
- Autenticación: `authenticate` (envía JWT para asociar usuario)
- Estados de usuario: `user:online`, `user:offline`
- Escritura: `typing` (directo o grupo)
- Mensajería: `message:new`, `message:seen`, `message:pin`
- Grupos: `join:group`

## Producción (roadmap)
- Reemplazar almacenamiento local por Cloudinary o AWS S3
- Servir estáticos desde CDN
- Habilitar logs estructurados y métricas
