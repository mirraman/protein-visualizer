import mongoose, { Document } from 'mongoose'

export interface IChromosome {
  directions: string[];  // Array de direcții (L, R, U, D, etc.)
  energy: number;         // Energia conformației
  positions: Array<{     // Pozițiile 3D ale aminoacizilor
    x: number;
    y: number;
    z: number;
  }>;
  hhContacts?: number;   // Numărul de contacte H-H (opțional, pentru performanță)
}

export interface IGAPopulation extends Document {
  userId: mongoose.Types.ObjectId;
  sequence: string;      // Secvența proteinei
  generation: number;    // Numărul generației (0, 1, 2, ...)
  chromosomes: IChromosome[];  // Toți cei 50 de cromozomi
  bestEnergy: number;    // Cea mai bună energie din generație
  averageEnergy: number; // Energia medie
  experimentName?: string; // Nume experiment (opțional)
  createdAt: Date;
  updatedAt: Date;
}

const chromosomeSchema = new mongoose.Schema({
  directions: { type: [String], required: true },
  energy: { type: Number, required: true },
  positions: [{
    x: Number,
    y: Number,
    z: Number
  }],
  hhContacts: { type: Number, required: false }
}, { _id: false });

const gaPopulationSchema = new mongoose.Schema({
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
    index: true,
  },
  sequence: {
    type: String,
    required: true,
    index: true,
  },
  generation: {
    type: Number,
    required: true,
    index: true,
  },
  chromosomes: {
    type: [chromosomeSchema],
    required: true,
  },
  bestEnergy: {
    type: Number,
    required: true,
  },
  averageEnergy: {
    type: Number,
    required: true,
  },
  experimentName: {
    type: String,
    required: false,
  },
}, {
  timestamps: true,
  versionKey: false
});

// Index compus pentru căutare rapidă după secvență și generație
gaPopulationSchema.index({ sequence: 1, generation: 1 });
gaPopulationSchema.index({ userId: 1, sequence: 1, generation: 1 });

// Drop the existing model if it exists to ensure schema changes take effect
if (mongoose.models && mongoose.models.GAPopulation) {
  delete mongoose.models.GAPopulation
}

const GAPopulation = mongoose.model<IGAPopulation>('GAPopulation', gaPopulationSchema)

export default GAPopulation
