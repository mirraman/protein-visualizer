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
  tournamentSize: number; // for selection
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

  protected generateRandomDirections(): Direction[] {
    const directions: Direction[] = [];
    // Use the instance's possible directions
    const possibleDirections: Direction[] = this.possibleDirections;
    const occupied = new Set<string>();
    let currentPos = { x: 0, y: 0, z: 0 };

    // Always start with the first position
    occupied.add(`${currentPos.x},${currentPos.y},${currentPos.z}`);

    for (let i = 0; i < this.sequence.length - 1; i++) {
      // Try to find a non-intersecting direction
      let directionFound = false;
      const shuffledDirections = [...possibleDirections].sort(() => Math.random() - 0.5);

      for (const dir of shuffledDirections) {
        const nextPos = this.getNextPosition(currentPos, dir);
        const posKey = `${nextPos.x},${nextPos.y},${nextPos.z}`;

        if (!occupied.has(posKey)) {
          directions.push(dir);
          occupied.add(posKey);
          currentPos = nextPos;
          directionFound = true;
          break;
        }
      }

      // If no valid direction found, use a random one (fallback)
      if (!directionFound) {
        const randomDir = possibleDirections[Math.floor(Math.random() * possibleDirections.length)];
        directions.push(randomDir);
        const nextPos = this.getNextPosition(currentPos, randomDir);
        currentPos = nextPos;
        // Don't add to occupied set to allow some flexibility
      }
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
