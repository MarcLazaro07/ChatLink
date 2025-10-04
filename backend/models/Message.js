import mongoose from 'mongoose';
const { Schema, model } = mongoose;

const MessageSchema = new Schema(
  {
    emisor: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    receptor: { type: Schema.Types.ObjectId, required: true }, // User or Group id
    esGrupo: { type: Boolean, default: false },
    tipo: { type: String, enum: ['texto', 'imagen', 'pdf', 'video', 'audio', 'archivo'], default: 'texto' },
    contenido: { type: String, default: '' },
    meta: { type: Schema.Types.Mixed, default: {} },
    vistoPor: [{ type: Schema.Types.ObjectId, ref: 'User' }],
    fijado: { type: Boolean, default: false },
    edited: { type: Boolean, default: false },
    reactions: [{
      emoji: { type: String },
      users: [{ type: Schema.Types.ObjectId, ref: 'User' }]
    }],
    fecha: { type: Date, default: Date.now },
  },
  { timestamps: true }
);

MessageSchema.index({ receptor: 1, fecha: -1 });
MessageSchema.index({ contenido: 'text' });

export default model('Message', MessageSchema);
