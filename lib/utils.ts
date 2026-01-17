import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"
import { Direction } from "./types"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

type MongoDoc = {
  toObject?: () => any;
  _id?: any;
  [key: string]: any;
}

export function convertDocToObj(doc: MongoDoc | MongoDoc[] | null): any {
  if (!doc) return null;

  // If it's an array, map over it
  if (Array.isArray(doc)) {
    return doc.map(item => convertDocToObj(item));
  }

  // If it's a mongoose document, convert to plain object
  if (doc.toObject) {
    const obj = doc.toObject();
    // Convert ObjectId to string
    if (obj._id) {
      obj._id = obj._id.toString();
    }
    // Convert any nested ObjectIds (but preserve arrays)
    Object.keys(obj).forEach(key => {
      if (obj[key] && obj[key].toString && typeof obj[key].toString === 'function' && !Array.isArray(obj[key])) {
        obj[key] = obj[key].toString();
      }
    });
    return obj;
  }

  // If it's a plain object, process its properties
  if (typeof doc === 'object') {
    const obj = { ...doc };
    if (obj._id) {
      obj._id = obj._id.toString();
    }
    Object.keys(obj).forEach(key => {
      if (obj[key] && obj[key].toString && typeof obj[key].toString === 'function' && !Array.isArray(obj[key])) {
        obj[key] = obj[key].toString();
      }
    });
    return obj;
  }

  return doc;
}

/**
 * Parses direction string with letter format (R, U, D, L) supporting spaces and commas
 * Examples: "RUDL", "RUDL DURL", "R U D L", "R,U,L,L,D"
 * Only accepts exact letter format - rejects old word format
 */
export function parseDirections(directionsStr: string): Direction[] {
  if (!directionsStr) return [];

  // Remove all spaces and commas, then convert to uppercase
  const cleanStr = directionsStr.replace(/[\s,]+/g, '').toUpperCase();

  // Check if string contains only valid direction letters
  const validPattern = /^[RUDLFB]+$/;
  if (!validPattern.test(cleanStr)) {
    // If it contains any invalid characters (like words), return empty array
    return [];
  }

  // Split into individual characters (all are guaranteed to be valid)
  return cleanStr.split('') as Direction[];
}

/**
 * Converts directions array to string format
 */
export function directionsToString(directions: Direction[]): string {
  return directions.join('');
}


/**
 * Converts letter direction to position change
 */
export function directionToPosition(direction: Direction): { x: number; y: number; z: number } {
  switch (direction) {
    case 'L': return { x: -1, y: 0, z: 0 };
    case 'R': return { x: 1, y: 0, z: 0 };
    case 'U': return { x: 0, y: 1, z: 0 };
    case 'D': return { x: 0, y: -1, z: 0 };
    case 'F': return { x: 0, y: 0, z: 1 };
    case 'B': return { x: 0, y: 0, z: -1 };
    default: return { x: 1, y: 0, z: 0 };
  }
}
