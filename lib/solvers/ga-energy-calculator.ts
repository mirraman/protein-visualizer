/**
 * Genetic Algorithm Energy Calculator
 * Separate energy calculation system specifically for Genetic Algorithm solver
 * This allows independent tuning and debugging of GA energy calculations
 */

import type { Direction } from "../types";
import { directionToPosition } from "../utils";
import type { Position } from "./types";

/**
 * Calculează pozițiile 3D ale aminoacizilor pentru algoritmul genetic
 * @param sequence - Secvența de aminoacizi
 * @param directions - Direcțiile de pliere
 * @returns Array cu pozițiile 3D
 */
export function calculatePositions(sequence: string, directions: Direction[]): Position[] {
  const positions: Position[] = [];

  // Primul aminoacid la origine
  positions.push({ x: 0, y: 0, z: 0 });

  // Pentru fiecare aminoacid următor
  for (let i = 1; i < sequence.length; i++) {
    const prevPos = positions[i - 1];
    const direction = directions[i - 1];
    const positionChange = directionToPosition(direction);

    positions.push({
      x: prevPos.x + positionChange.x,
      y: prevPos.y + positionChange.y,
      z: prevPos.z + positionChange.z,
    });
  }

  return positions;
}

/**
 * Numără coliziunile (auto-intersecțiile) pentru algoritmul genetic
 * @param positions - Array cu pozițiile aminoacizilor
 * @returns Numărul de coliziuni
 */
export function countCollisions(positions: Position[]): number {
  const occupied = new Set<string>();
  let collisionCount = 0;

  for (const pos of positions) {
    const posKey = `${pos.x},${pos.y},${pos.z}`;
    if (occupied.has(posKey)) {
      collisionCount++;
    } else {
      occupied.add(posKey);
    }
  }

  return collisionCount;
}

/**
 * Calculează energia bazată pe contactele H-H pentru algoritmul genetic
 * 
 * FORMULA: E = -(number of non-consecutive H–H contacts)
 * 
 * REGULI:
 * 1. H–H contacts: Perechi de reziduuri hidrofobe (H) care sunt:
 *    - Adjacente pe grilă (distanță Manhattan = 1)
 *    - NU consecutive în secvență (j = i + 2, i + 3, ...)
 * 2. Fiecare contact H-H contribuie -1 la energie
 * 3. Scop: Minimizare energie → maximizare contacte H-H → nucleu hidrofob compact
 * 
 * DISTANȚA MANHATTAN: |dx| + |dy| + |dz|
 * - Dacă = 1: aminoacizii sunt vecini pe grilă = CONTACT!
 * - Dacă > 1: nu sunt vecini
 * 
 * CONSISTENCY CHECK:
 * - calculateHHContacts returns positive count (e.g., 5 contacts)
 * - calculateContactEnergy returns negative energy (e.g., -5)
 * - Relationship: calculateContactEnergy = -(calculateHHContacts)
 * 
 * @param sequence - Secvența de aminoacizi
 * @param positions - Pozițiile 3D (pentru 2D, z = 0)
 * @returns Energia totală (negativă = bună, ex: -6 pentru 6 contacte H-H)
 */
export function calculateContactEnergy(sequence: string, positions: Position[]): number {
  let energy = 0;

  // Parcurgem toate perechile de aminoacizi
  for (let i = 0; i < sequence.length; i++) {
    if (sequence[i] === "H") {
      // Începem de la i + 2 pentru a exclude:
      // 1. Contactele cu sine (i cu i)
      // 2. Contactele consecutive în secvență (i cu i+1) - acestea nu contează
      // 3. Numărarea dublă (i-j și j-i)
      for (let j = i + 2; j < sequence.length; j++) {
        if (sequence[j] === "H") {
          // Calculăm distanța Manhattan între cele două poziții
          const dx = Math.abs(positions[i].x - positions[j].x);
          const dy = Math.abs(positions[i].y - positions[j].y);
          const dz = Math.abs(positions[i].z - positions[j].z);

          // Dacă distanța Manhattan = 1, sunt vecini pe grilă = CONTACT H-H!
          if (dx + dy + dz === 1) {
            energy -= 1; // Fiecare contact H-H scade energia cu 1
          }
        }
      }
    }
  }

  return energy;
}

/**
 * Calculează numărul de contacte H-H pentru o conformație
 * 
 * CONSISTENCY CHECK:
 * - calculateHHContacts returns positive count (e.g., 5 contacts)
 * - calculateContactEnergy returns negative energy (e.g., -5)
 * - Relationship: calculateContactEnergy = -(calculateHHContacts)
 * 
 * @param sequence - Secvența de aminoacizi
 * @param positions - Pozițiile 3D
 * @returns Numărul de contacte H-H (pozitiv, ex: 5 pentru 5 contacte)
 */
export function calculateHHContacts(sequence: string, positions: Position[]): number {
  let contacts = 0;
  for (let i = 0; i < sequence.length; i++) {
    if (sequence[i] === "H") {
      for (let j = i + 2; j < sequence.length; j++) {
        if (sequence[j] === "H") {
          const dx = Math.abs(positions[i].x - positions[j].x);
          const dy = Math.abs(positions[i].y - positions[j].y);
          const dz = Math.abs(positions[i].z - positions[j].z);
          if (dx + dy + dz === 1) {
            contacts++;
          }
        }
      }
    }
  }
  return contacts;
}

/**
 * Calculează energia pentru algoritmul genetic
 * Această metodă este separată de EnergyCalculator pentru a permite ajustări specifice
 * 
 * IMPORTANT: GA nu rezolvă energia analitic - efectuează căutare stocastică într-un
 * fitness landscape. Implementarea noastră definește acest landscape.
 * 
 * FORMULA TOTALĂ: E_total = E_HP + (coliziuni × PENALTY_WEIGHT)
 * 
 * Unde:
 * - E_HP = -(număr contacte H-H non-consecutive) [energie negativă = bună]
 * - Coliziuni = număr de poziții ocupate de mai multe ori (auto-intersecții)
 * - PENALTY_WEIGHT = 15 (softened from 100) - permite GA să exploreze tradeoffs
 *   între coliziuni și energie HP, în loc să trateze coliziunile ca catastrofale
 * 
 * NOTĂ: Fitness-ul lexicographic este implementat în genetic-algorithm.ts:
 * - Primul criteriu: minimizăm coliziunile (0 = valid)
 * - Al doilea criteriu: minimizăm energia HP
 * 
 * @param sequence - Secvența de aminoacizi
 * @param directions - Direcțiile de pliere (R, L, U, D pentru 2D)
 * @returns Energia totală (negativă = bună, ex: -6 pentru 6 contacte H-H fără coliziuni)
 */
export function calculateEnergy(sequence: string, directions: Direction[]): number {
  // 1. Calculează pozițiile
  const positions = calculatePositions(sequence, directions);

  // 2. Numără coliziunile (auto-intersecțiile)
  const collisions = countCollisions(positions);

  // 3. Calculează energia HP (contacte H-H non-consecutive)
  // Notă: Calculăm aceasta chiar dacă există coliziuni pentru a permite GA-ului
  // să găsească contacte H-H chiar și în timp ce "desface nodul"
  const hpEnergy = calculateContactEnergy(sequence, positions);

  // 4. Combină energia HP cu penalizarea pentru coliziuni
  // PENALTY_WEIGHT = 15 (softened from 100) allows GA to explore tradeoffs
  // between collisions and HP energy, rather than treating collisions as catastrophic
  const PENALTY_WEIGHT = 15;
  const totalEnergy = hpEnergy + (collisions * PENALTY_WEIGHT);

  return totalEnergy;
}

/**
 * Verifică dacă o conformație este validă (fără coliziuni)
 * @param positions - Array cu pozițiile aminoacizilor
 * @returns boolean - true dacă nu există coliziuni
 */
export function isValid(positions: Position[]): boolean {
  return countCollisions(positions) === 0;
}
