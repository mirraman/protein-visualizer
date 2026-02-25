// Importăm tipul Direction (L, R, U, D, F, B)
import { Direction } from "../types";

// Importăm funcția care convertește o direcție în deplasare de coordonate
import { directionToPosition } from "../utils";

// Importăm tipurile Position și Conformation
import { Position, Conformation } from "./types";

/**
 * Clasa EnergyCalculator - Calculează energia conformațiilor în modelul HP
 * Toate metodele sunt statice (nu necesită instanțiere)
 */
export class EnergyCalculator {
  /**
   * Calculează energia unei conformații
   *
   * @param sequence - Secvența de aminoacizi (ex: "HPHPPHHPHPPHPHHPPHPH")
   * @param directions - Direcțiile de pliere (ex: ["R", "U", "L", "D", ...])
   * @returns number - Energia conformației (negativă = bună, infinit = invalidă)
   */
  static calculateEnergy(sequence: string, directions: Direction[]): number {
    // 1. Calculate positions
    const positions = this.calculatePositions(sequence, directions);

    // 2. Count collisions (Penalty Term)
    const collisions = this.countCollisions(positions);

    // 3. Calculate HP Energy (Physics Term)
    // Note: We calculate this even if there are collisions!
    // This allows the GA to find H-H contacts even while untangling the knot.
    const hpEnergy = this.calculateContactEnergy(sequence, positions);

    // 4. Combine them
    // PENALTY_WEIGHT must be larger than the best possible contact gain per atom.
    // 100 is usually safe.
    const PENALTY_WEIGHT = 100;

    const totalEnergy = hpEnergy + (collisions * PENALTY_WEIGHT);

    return totalEnergy;
  }

  /**
   * Returns PURE H-H contact energy with no collision penalty.
   * Use this for: energyHistory logging, onProgress reporting, final result output.
   */
  static calculateHPEnergy(sequence: string, directions: Direction[]): number {
    const positions = this.calculatePositions(sequence, directions);
    return this.calculateContactEnergy(sequence, positions);
  }

  /**
   * Returns fitness score for INTERNAL SELECTION only (HP energy + collision penalty).
   * Use this inside algorithm selection logic, never for reporting or charts.
   */
  static calculateFitness(
    sequence: string,
    directions: Direction[],
    penaltyWeight: number = 100
  ): number {
    const positions = this.calculatePositions(sequence, directions);
    const collisions = this.countCollisions(positions);
    const hp = this.calculateContactEnergy(sequence, positions);
    return hp + collisions * penaltyWeight;
  }

  /**
   * Returns true if the conformation has zero collisions (valid SAW).
   */
  static isValid(positions: Position[]): boolean {
    return this.countCollisions(positions) === 0;
  }

  /**
   * Returns the count of H-H topological contacts (positive integer).
   * Same logic as calculateContactEnergy but returns a positive count for DB storage.
   */
  static calculateHHContacts(sequence: string, positions: Position[]): number {
    let contacts = 0;
    for (let i = 0; i < sequence.length; i++) {
      if (sequence[i] === 'H') {
        for (let j = i + 2; j < sequence.length; j++) {
          if (sequence[j] === 'H') {
            const dx = Math.abs(positions[i].x - positions[j].x);
            const dy = Math.abs(positions[i].y - positions[j].y);
            const dz = Math.abs(positions[i].z - positions[j].z);
            if (dx + dy + dz === 1) contacts++;
          }
        }
      }
    }
    return contacts;
  }

  /**
   * Creează un obiect Conformation complet cu poziții și energie
   * Folosit pentru a stoca o conformație cu toate datele ei
   *
   * @param sequence - Secvența de aminoacizi
   * @param directions - Direcțiile de pliere
   * @returns Conformation - Obiect cu secvență, direcții, poziții și energie
   */
  static createConformation(sequence: string, directions: Direction[]): Conformation {
    // Calculăm pozițiile
    const positions = this.calculatePositions(sequence, directions);

    // Calculăm energia folosind aceeași metodă ca în calculateEnergy (soft constraints)
    const energy = this.calculateEnergy(sequence, directions);

    // Returnăm obiectul complet
    return {
      sequence,    // Secvența originală
      directions,  // Direcțiile de pliere
      energy,      // Energia calculată
      positions    // Pozițiile 3D ale fiecărui aminoacid
    };
  }

  /**
   * Calculează pozițiile 3D ale fiecărui aminoacid din conformație
   *
   * ALGORITM:
   * 1. Primul aminoacid e la origine (0, 0, 0)
   * 2. Pentru fiecare aminoacid următor:
   *    - Luăm direcția corespunzătoare
   *    - Calculăm noua poziție = poziția anterioară + deplasare
   *
   * Exemplu cu direcții ["R", "U"]:
   * - Aminoacid 0: (0, 0, 0)
   * - Aminoacid 1: (0, 0, 0) + R(1,0,0) = (1, 0, 0)
   * - Aminoacid 2: (1, 0, 0) + U(0,1,0) = (1, 1, 0)
   *
   * @param sequence - Secvența de aminoacizi
   * @param directions - Direcțiile de pliere
   * @returns Position[] - Array cu pozițiile 3D ale fiecărui aminoacid
   */
  static calculatePositions(sequence: string, directions: Direction[]): Position[] {
    const positions: Position[] = [];

    // Primul aminoacid e la origine (0, 0, 0)
    positions.push({ x: 0, y: 0, z: 0 });

    // Pentru fiecare aminoacid următor (de la al 2-lea până la sfârșit)
    for (let i = 1; i < sequence.length; i++) {
      // Poziția aminoacidului anterior
      const prevPos = positions[i - 1];

      // Direcția de la aminoacidul anterior la cel curent
      // directions[0] = direcția de la aminoacidul 0 la 1
      // directions[i-1] = direcția de la aminoacidul i-1 la i
      const direction = directions[i - 1];

      // Convertim direcția în deplasare de coordonate
      // Ex: "R" -> {x: 1, y: 0, z: 0}
      //     "U" -> {x: 0, y: 1, z: 0}
      //     "F" -> {x: 0, y: 0, z: 1}
      const positionChange = directionToPosition(direction);

      // Calculăm noua poziție adăugând deplasarea
      const newPos: Position = {
        x: prevPos.x + positionChange.x,
        y: prevPos.y + positionChange.y,
        z: prevPos.z + positionChange.z,
      };

      // Adăugăm noua poziție în array
      positions.push(newPos);
    }

    return positions;
  }

  /**
   * Writes positions into a pre-allocated Float64Array buffer.
   * Layout: [x0, y0, z0, x1, y1, z1, ..., xN, yN, zN]
   */
  static calculatePositionsInto(
    sequence: string,
    directions: Direction[],
    buffer: Float64Array
  ): void {
    buffer[0] = 0; buffer[1] = 0; buffer[2] = 0;

    for (let i = 1; i < sequence.length; i++) {
      const base = i * 3;
      const prev = base - 3;
      const dir  = directions[i - 1];

      buffer[base]     = buffer[prev];
      buffer[base + 1] = buffer[prev + 1];
      buffer[base + 2] = buffer[prev + 2];

      if      (dir === 'R') buffer[base]++;
      else if (dir === 'L') buffer[base]--;
      else if (dir === 'U') buffer[base + 1]++;
      else if (dir === 'D') buffer[base + 1]--;
      else if (dir === 'F') buffer[base + 2]++;
      else if (dir === 'B') buffer[base + 2]--;
    }
  }

  /**
   * Counts collisions using a pre-filled position buffer — no Position[] allocation.
   */
  static countCollisionsInBuffer(buffer: Float64Array, length: number): number {
    const occupied = new Set<number>();
    let collisions = 0;

    for (let i = 0; i < length; i++) {
      const b   = i * 3;
      const key = this.positionKey(buffer[b], buffer[b + 1], buffer[b + 2]);
      if (occupied.has(key)) collisions++;
      else occupied.add(key);
    }
    return collisions;
  }

  /**
   * Calculates HP contact energy using a pre-filled position buffer.
   */
  static calculateContactEnergyFromBuffer(
    sequence: string,
    buffer: Float64Array
  ): number {
    let energy = 0;
    const n = sequence.length;

    for (let i = 0; i < n; i++) {
      if (sequence[i] !== 'H') continue;
      const bi = i * 3;

      for (let j = i + 2; j < n; j++) {
        if (sequence[j] !== 'H') continue;
        const bj = j * 3;

        const dx = Math.abs(buffer[bi]     - buffer[bj]);
        const dy = Math.abs(buffer[bi + 1] - buffer[bj + 1]);
        const dz = Math.abs(buffer[bi + 2] - buffer[bj + 2]);

        if (dx + dy + dz === 1) energy--;
      }
    }
    return energy;
  }

  /**
   * Packs a 3D grid position into a single integer key for O(1) Set lookup.
   * Assumes coordinates are in range [-512, 511] (10 bits each) which is
   * more than enough for any realistic HP sequence length.
   * This eliminates string allocation in the hot collision-detection loop.
   */
  private static positionKey(x: number, y: number, z: number): number {
    return ((z + 512) << 20) | ((y + 512) << 10) | (x + 512);
  }

  /**
   * Returns the number of collisions (self-intersections).
   * 0 means valid. >0 means invalid.
   */
  static countCollisions(positions: Position[]): number {
    const occupied = new Set<number>();
    let collisionCount = 0;

    for (const pos of positions) {
      const key = this.positionKey(pos.x, pos.y, pos.z);
      if (occupied.has(key)) {
        collisionCount++;
      } else {
        occupied.add(key);
      }
    }
    return collisionCount;
  }

  /**
   * Calculează energia bazată pe contactele H-H
   *
   * REGULI MODELUL HP:
   * 1. Doar contactele H-H contribuie la energie
   * 2. Un contact = doi aminoacizi H vecini în spațiu (distanță Manhattan = 1)
   * 3. Aminoacizii ADIACENȚI în secvență NU contează (sunt mereu vecini)
   * 4. Fiecare contact H-H contribuie -1 la energie
   *
   * DISTANȚA MANHATTAN: |dx| + |dy| + |dz|
   * - Dacă = 1, aminoacizii sunt vecini pe grilă
   * - Dacă > 1, nu sunt vecini
   *
   * @param sequence - Secvența de aminoacizi
   * @param positions - Pozițiile 3D
   * @returns number - Energia totală (negativă = bună)
   */
  static calculateContactEnergy(sequence: string, positions: Position[]): number {
    let energy = 0;

    // Parcurgem toate perechile de aminoacizi
    for (let i = 0; i < sequence.length; i++) {
      // Verificăm doar dacă aminoacidul i este H (hidrofobic)
      if (sequence[i] === "H") {
        // Căutăm contacte cu aminoacizi după i+1
        // (i+1 e adiacent în secvență, deci nu contează)
        // Începem de la i+2 pentru a evita:
        // 1. Contactele cu sine (i cu i)
        // 2. Contactele adiacente în secvență (i cu i+1)
        // 3. Numărarea dublă (i-j și j-i)
        for (let j = i + 2; j < sequence.length; j++) {
          // Verificăm dacă aminoacidul j este și el H
          if (sequence[j] === "H") {
            // Calculăm distanța Manhattan între cele două poziții
            const dx = Math.abs(positions[i].x - positions[j].x);
            const dy = Math.abs(positions[i].y - positions[j].y);
            const dz = Math.abs(positions[i].z - positions[j].z);

            // Dacă distanța Manhattan = 1, sunt vecini pe grilă = CONTACT!
            if (dx + dy + dz === 1) {
              energy -= 1; // Fiecare contact H-H scade energia cu 1
            }
          }
        }
      }
    }

    return energy;
  }
}
