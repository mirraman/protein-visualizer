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
}

export interface MonteCarloParameters extends SolverParameters {
  populationSize: number;
}

export interface SimulatedAnnealingParameters extends SolverParameters {
  initialTemperature: number;
  finalTemperature: number;
  coolingRate: number;
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
  rolloutCount?: number; // number of rollouts to construct directions per program
}

export abstract class BaseSolver {
  protected sequence: string;
  protected maxIterations: number;
  protected isStopped: boolean = false;
  protected onProgress?: (progress: any) => void;


  protected possibleDirections: Direction[];

  constructor(parameters: SolverParameters) {
    this.sequence = parameters.sequence;
    this.maxIterations = parameters.maxIterations;
    this.onProgress = parameters.onProgress;

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
   * If the walk gets trapped (cannot move without colliding), it restarts.
   */
  protected generateRandomDirections(): Direction[] {
    const maxRestarts = 100; // Prevent infinite loops

    for (let attempt = 0; attempt < maxRestarts; attempt++) {
      const directions: Direction[] = [];
      const occupied = new Set<string>();
      let currentPos = { x: 0, y: 0, z: 0 };

      // Mark origin as occupied
      occupied.add(`${currentPos.x},${currentPos.y},${currentPos.z}`);

      let validWalk = true;

      // Try to build the full sequence
      for (let i = 0; i < this.sequence.length - 1; i++) {
        // Shuffle all possible directions to try them in random order
        const shuffledDirections = [...this.possibleDirections].sort(() => Math.random() - 0.5);
        let moveFound = false;

        for (const dir of shuffledDirections) {
          const nextPos = this.getNextPosition(currentPos, dir);
          const posKey = `${nextPos.x},${nextPos.y},${nextPos.z}`;

          // If this move is safe (not occupied), take it
          if (!occupied.has(posKey)) {
            directions.push(dir);
            occupied.add(posKey);
            currentPos = nextPos;
            moveFound = true;
            break;
          }
        }

        // If we tried all directions and found nowhere to go, we are trapped.
        if (!moveFound) {
          validWalk = false;
          break; // Break the inner loop to restart the attempt
        }
      }

      // If we successfully finished the loop without getting trapped, return result
      if (validWalk) {
        return directions;
      }

      // If we are here, 'validWalk' was false, so the loop repeats (restart)
    }

    // Fallback: If we failed 100 times (very rare for short chains),
    // return a random walk even if it has collisions, just to return *something*.
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
