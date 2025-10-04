import mongoose from 'mongoose';

const { Schema, model } = mongoose;

const UserSchema = new Schema(
  {
    username: { type: String, required: true, unique: true, index: true, trim: true, lowercase: true },
    email: { type: String, required: true, unique: true, trim: true, lowercase: true },
    password: { type: String, required: true },
    nombre: { type: String, default: '' },
    descripcion: { type: String, default: '' },
    fotoPerfil: { type: String, default: '/favicon.svg' },
    estado: { type: String, default: 'Disponible' },
    tema: { type: String, default: 'oscuro' }, // backward compat
    mode: { type: String, enum: ['claro','oscuro'], default: 'oscuro' },
    palette: { type: String, enum: ['azul','verde','naranja','morado'], default: 'azul' },
    amigos: [{ type: Schema.Types.ObjectId, ref: 'User' }],
    solicitudes: [{ type: Schema.Types.ObjectId, ref: 'User' }],
    ultimoAcceso: { type: Date, default: Date.now },
    online: { type: Boolean, default: false },
  },
  { timestamps: true }
);

// Unique index on username is already defined via the schema field (unique: true)

export default model('User', UserSchema);
