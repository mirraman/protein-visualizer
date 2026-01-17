import { Document, Types } from 'mongoose'

export type Direction = 'L' | 'R' | 'U' | 'D' | 'F' | 'B'

export interface IUser extends Document {
  username: string
  email: string
  passwordHash: string
  createdAt: Date
  updatedAt: Date
}

export interface IProtein extends Document {
  userId: Types.ObjectId
  name: string
  sequence: string
  description: string
  isPublic: boolean
  directions?: string[]
  createdAt: Date
  updatedAt: Date
}

export interface IVisualization extends Document {
  proteinId: Types.ObjectId
  visualizationType: string
  foldingDirections?: string
  energyValue?: number
  settings?: Record<string, any>
  createdAt: Date
}

export type ProteinInput = {
  userId: Types.ObjectId
  name: string
  sequence: string
  description: string
  isPublic: boolean
  directions?: string[]
}

// For the global mongoose type
declare global {
  var mongoose: {
    conn: any | null
    promise: Promise<any> | null
  }
} 