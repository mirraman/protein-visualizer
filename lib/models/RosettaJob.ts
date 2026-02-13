import mongoose, { Document } from 'mongoose'

interface IRosettaJob extends Document {
  jobId: string
  userId: mongoose.Types.ObjectId
  sequence: string
  directions?: string[]
  params: {
    protocol: string
    repeats: number
    seed?: string
    biasToDirections: boolean
  }
  status: 'queued' | 'running' | 'succeeded' | 'failed'
  errorMessage?: string
  pdbContent?: string
  energy?: number
  createdAt: Date
  updatedAt: Date
  completedAt?: Date
}

const rosettaJobSchema = new mongoose.Schema({
  jobId: {
    type: String,
    required: true,
    unique: true,
    index: true
  },
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
  },
  sequence: {
    type: String,
    required: true,
  },
  directions: {
    type: [String],
    default: [],
  },
  params: {
    protocol: {
      type: String,
      required: true,
      default: 'relax'
    },
    repeats: {
      type: Number,
      required: true,
      default: 1
    },
    seed: {
      type: String,
      required: false
    },
    biasToDirections: {
      type: Boolean,
      required: true,
      default: true
    }
  },
  status: {
    type: String,
    enum: ['queued', 'running', 'succeeded', 'failed'],
    required: true,
    default: 'queued'
  },
  errorMessage: {
    type: String,
    required: false
  },
  pdbContent: {
    type: String,
    required: false
  },
  energy: {
    type: Number,
    required: false
  },
  completedAt: {
    type: Date,
    required: false
  }
}, {
  timestamps: true, // This will automatically manage createdAt and updatedAt
  versionKey: false // This will remove the __v field
})

// Ensure the model is properly registered
let RosettaJob: mongoose.Model<IRosettaJob>

if (mongoose.models && mongoose.models.RosettaJob) {
  RosettaJob = mongoose.models.RosettaJob
} else {
  RosettaJob = mongoose.model<IRosettaJob>('RosettaJob', rosettaJobSchema)
}

export default RosettaJob
