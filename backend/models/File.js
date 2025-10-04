import mongoose from 'mongoose';
const { Schema, model } = mongoose;

const FileSchema = new Schema(
  {
    owner: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    tipo: { type: String, enum: ['imagen', 'pdf', 'otro'], default: 'otro' },
    url: { type: String, required: true },
    nombre: { type: String, required: true },
    size: { type: Number, default: 0 },
    fecha: { type: Date, default: Date.now },
  },
  { timestamps: true }
);

export default model('File', FileSchema);
