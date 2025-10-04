import mongoose from 'mongoose';
const { Schema, model } = mongoose;

const GroupSchema = new Schema(
  {
    nombre: { type: String, required: true, trim: true },
    imagen: { type: String, default: '/favicon.svg' },
    descripcion: { type: String, default: '' },
    miembros: [{ type: Schema.Types.ObjectId, ref: 'User' }],
    admins: [{ type: Schema.Types.ObjectId, ref: 'User' }],
    creador: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    fechaCreacion: { type: Date, default: Date.now },
  },
  { timestamps: true }
);

export default model('Group', GroupSchema);
