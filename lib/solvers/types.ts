import { Direction } from "../types";

export interface Position {
  x: number;
  y: number;
  z: number;
}

export interface Conformation {
  sequence: string;
  directions: Direction[];
  energy: number;
  positions: Position[];
}

export interface SolverResult {
  bestConformation: Conformation;
  energyHistory: { iteration: number; energy: number }[];
  totalIterations: number;
  convergenceTime: number;
}

export interface SolverParameters {
  maxIterations: number;
  sequence: string;
  initialDirections?: Direction[];
  onProgress?: (progress: any) => void;
  latticeType?: '2D' | '3D';
  targetEnergy?: number;  // stop early when this energy is reached
}

export interface MonteCarloParameters extends SolverParameters {
  populationSize: number;
}

export interface SimulatedAnnealingParameters extends SolverParameters {
  initialTemperature: number;
  finalTemperature: number;
  coolingRate: number;
  stagnationWindow?: number; // restarts after N iters with no improvement
}

export interface GeneticAlgorithmParameters extends SolverParameters {
  populationSize: number;
  crossoverRate: number; // 0..1
  mutationRate: number; // 0..1 per gene
  eliteCount: number; // number of elites to keep each generation
  selectionPressure?: number; // for selection
  saveGenerations?: boolean; // Save all chromosomes to DB
  userId?: string; // User ID for saving generations
  experimentName?: string; // Optional experiment name
}

export interface EvolutionStrategiesParameters extends SolverParameters {
  mu: number; // parents
  lambda: number; // offspring
  initialMutationRate: number; // per-gene
  mutationDecay?: number; // multiply when improving (<1)
  mutationBoost?: number; // multiply when stagnating (>1)
  stagnationWindow?: number;
  plusSelection?: boolean; // (mu+lambda) vs (mu,lambda)
}

export interface EvolutionaryProgrammingParameters extends SolverParameters {
  populationSize: number;
  mutationRate: number; // per-gene
  tournamentSize: number; // for EP selection
  eliteCount?: number; // optional elitism
}

export interface GeneticProgrammingParameters extends SolverParameters {
  populationSize: number;
  maxTreeDepth: number;
  crossoverRate: number; // 0..1
  mutationRate: number; // 0..1
  eliteCount: number;
  tournamentSize: number;
}

export abstract class BaseSolver {
  protected sequence: string;
  protected maxIterations: number;
  protected isStopped: boolean = false;
  protected onProgress?: (progress: any) => void;
  private targetEnergy?: number;
  protected positionBuffer: Float64Array;

  protected possibleDirections: Direction[];

  protected hasReachedTarget(energy: number): boolean {
    return this.targetEnergy !== undefined && energy <= this.targetEnergy;
  }

  /**
   * Yields execution to the browser on the next animation frame.
   * Gives smooth 60fps UI updates instead of setTimeout(0) bursts.
   */
  protected yieldToFrame(): Promise<void> {
    return new Promise(resolve => {
      if (typeof requestAnimationFrame !== 'undefined') {
        requestAnimationFrame(() => resolve());
      } else {
        setTimeout(resolve, 0);
      }
    });
  }

  protected get yieldInterval(): number {
    return Math.max(1, Math.floor(this.maxIterations / 120));
  }

  protected get logInterval(): number {
    return Math.max(1, Math.floor(this.maxIterations / 2000));
  }

  /**
   * Generates a conformation using a greedy H-H contact heuristic.
   * For each step, picks the direction that maximizes immediate H-H
   * contacts with already-placed H residues.
   */
  protected generateGreedyDirections(): Direction[] {
    const n    = this.sequence.length;
    const dirs: Direction[] = [];
    const placed = new Map<number, number>();
    let x = 0, y = 0, z = 0;

    const key = (px: number, py: number, pz: number) =>
      ((pz + 512) << 20) | ((py + 512) << 10) | (px + 512);

    placed.set(key(x, y, z), 0);

    const offsets = [
      [-1,0,0],[1,0,0],[0,-1,0],[0,1,0],[0,0,-1],[0,0,1]
    ] as const;

    for (let i = 1; i < n; i++) {
      const isH = this.sequence[i] === 'H';
      let bestDir: Direction | null = null;
      let bestScore = -Infinity;

      const shuffled = [...this.possibleDirections].sort(() => Math.random() - 0.5);

      for (const dir of shuffled) {
        let nx = x, ny = y, nz = z;
        if      (dir === 'R') nx++;
        else if (dir === 'L') nx--;
        else if (dir === 'U') ny++;
        else if (dir === 'D') ny--;
        else if (dir === 'F') nz++;
        else if (dir === 'B') nz--;

        if (placed.has(key(nx, ny, nz))) continue;

        let score = 0;
        if (isH) {
          for (const [ox, oy, oz] of offsets) {
            const neighborIdx = placed.get(key(nx + ox, ny + oy, nz + oz));
            if (
              neighborIdx !== undefined &&
              Math.abs(neighborIdx - i) > 1 &&
              this.sequence[neighborIdx] === 'H'
            ) {
              score++;
            }
          }
        }

        if (score > bestScore) {
          bestScore = score;
          bestDir   = dir;
        }
      }

      if (bestDir === null) {
        return this.generateRandomDirections();
      }

      dirs.push(bestDir);

      if      (bestDir === 'R') x++;
      else if (bestDir === 'L') x--;
      else if (bestDir === 'U') y++;
      else if (bestDir === 'D') y--;
      else if (bestDir === 'F') z++;
      else if (bestDir === 'B') z--;

      placed.set(key(x, y, z), i);
    }

    return dirs;
  }

  protected static readonly DIR_ENCODE: Record<string, number> = {
    L: 0, R: 1, U: 2, D: 3, F: 4, B: 5
  };
  protected static readonly DIR_DECODE: Direction[] = ['L', 'R', 'U', 'D', 'F', 'B'];

  /** Convert Direction[] to Uint8Array for fast internal processing */
  protected encodeDirections(dirs: Direction[]): Uint8Array {
    const buf = new Uint8Array(dirs.length);
    const enc = (this.constructor as typeof BaseSolver).DIR_ENCODE;
    for (let i = 0; i < dirs.length; i++) buf[i] = enc[dirs[i]];
    return buf;
  }

  /** Convert Uint8Array back to Direction[] for output and display */
  protected decodeDirections(buf: Uint8Array): Direction[] {
    const dec = (this.constructor as typeof BaseSolver).DIR_DECODE;
    const dirs: Direction[] = new Array(buf.length);
    for (let i = 0; i < buf.length; i++) dirs[i] = dec[buf[i]];
    return dirs;
  }

  /** Fast copy of a Uint8Array chromosome — no heap allocation */
  protected copyChromosome(src: Uint8Array): Uint8Array {
    const copy = new Uint8Array(src.length);
    copy.set(src);
    return copy;
  }

  constructor(parameters: SolverParameters) {
    this.sequence = parameters.sequence;
    this.maxIterations = parameters.maxIterations;
    this.onProgress = parameters.onProgress;
    this.targetEnergy = parameters.targetEnergy;
    this.positionBuffer = new Float64Array(parameters.sequence.length * 3);

    // Set possible directions based on lattice type
    // Default to 2D if not specified
    if (parameters.latticeType === '3D') {
      this.possibleDirections = ["L", "R", "U", "D", "F", "B"];
    } else {
      this.possibleDirections = ["L", "R", "U", "D"];
    }
  }

  abstract solve(): Promise<SolverResult>;

  stop(): void {
    this.isStopped = true;
  }

  /**
   * Generates a valid Self-Avoiding Walk (SAW).
   * Uses integer-packed position keys for fast collision detection.
   */
  protected generateRandomDirections(): Direction[] {
    const maxRestarts = 100;

    for (let attempt = 0; attempt < maxRestarts; attempt++) {
      const directions: Direction[] = [];
      const occupied = new Set<number>();
      let x = 0, y = 0, z = 0;

      occupied.add(((z + 512) << 20) | ((y + 512) << 10) | (x + 512));

      let validWalk = true;

      for (let i = 0; i < this.sequence.length - 1; i++) {
        const shuffled = [...this.possibleDirections].sort(() => Math.random() - 0.5);
        let moveFound = false;

        for (const dir of shuffled) {
          let nx = x, ny = y, nz = z;
          if      (dir === 'L') nx--;
          else if (dir === 'R') nx++;
          else if (dir === 'U') ny++;
          else if (dir === 'D') ny--;
          else if (dir === 'F') nz++;
          else if (dir === 'B') nz--;

          const key = ((nz + 512) << 20) | ((ny + 512) << 10) | (nx + 512);
          if (!occupied.has(key)) {
            directions.push(dir);
            occupied.add(key);
            x = nx; y = ny; z = nz;
            moveFound = true;
            break;
          }
        }

        if (!moveFound) { validWalk = false; break; }
      }

      if (validWalk) return directions;
    }

    return this.generateFallbackDirections();
  }

  /**
   * Helper for the "Emergency" case where valid generation fails.
   * Just generates random directions ignoring collisions.
   */
  private generateFallbackDirections(): Direction[] {
    const directions: Direction[] = [];
    for (let i = 0; i < this.sequence.length - 1; i++) {
      directions.push(this.possibleDirections[Math.floor(Math.random() * this.possibleDirections.length)]);
    }
    return directions;
  }

  private getNextPosition(pos: { x: number; y: number; z: number }, dir: Direction): { x: number; y: number; z: number } {
    switch (dir) {
      case 'L': return { x: pos.x - 1, y: pos.y, z: pos.z };
      case 'R': return { x: pos.x + 1, y: pos.y, z: pos.z };
      case 'U': return { x: pos.x, y: pos.y + 1, z: pos.z };
      case 'D': return { x: pos.x, y: pos.y - 1, z: pos.z };
      case 'F': return { x: pos.x, y: pos.y, z: pos.z + 1 };
      case 'B': return { x: pos.x, y: pos.y, z: pos.z - 1 };
      default: return pos;
    }
  }
}
