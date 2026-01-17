import { EnergyCalculator } from "./energy-calculator";
import { BaseSolver, type SolverResult, type Conformation, type GeneticProgrammingParameters } from "./types";
import type { Direction } from "../types";

// GP for Direction sequences: evolve Direction[] directly with GP-style operators
type Program = {
  directions: Direction[];
  fitness?: number;
};

function randomDirection(possibleDirections: Direction[]): Direction {
  return possibleDirections[Math.floor(Math.random() * possibleDirections.length)];
}

function createRandomProgram(length: number, possibleDirections: Direction[]): Program {
  const dirs: Direction[] = [];
  for (let i = 0; i < length; i++) {
    dirs.push(randomDirection(possibleDirections));
  }
  return { directions: dirs };
}

// GP-style crossover: multi-point with variable segments
function gpCrossover(a: Program, b: Program): [Program, Program] {
  const len = Math.min(a.directions.length, b.directions.length);
  if (len < 3) return [{ directions: a.directions.slice() }, { directions: b.directions.slice() }];

  // Create 2-4 crossover points
  const numPoints = 2 + Math.floor(Math.random() * 3);
  const points: number[] = [];
  for (let i = 0; i < numPoints; i++) {
    points.push(Math.floor(Math.random() * len));
  }
  points.sort((x, y) => x - y);

  const child1: Direction[] = [];
  const child2: Direction[] = [];
  let useA = true;
  let pointIdx = 0;

  for (let i = 0; i < len; i++) {
    if (pointIdx < points.length && i >= points[pointIdx]) {
      useA = !useA;
      pointIdx++;
    }
    child1.push(useA ? a.directions[i] : b.directions[i]);
    child2.push(useA ? b.directions[i] : a.directions[i]);
  }

  return [{ directions: child1 }, { directions: child2 }];
}

// GP-style mutation: segment replacement and local changes
function gpMutate(prog: Program, mutationRate: number, possibleDirections: Direction[]): Program {
  const dirs = prog.directions.slice();
  const len = dirs.length;

  // Segment replacement (10% chance)
  if (Math.random() < 0.1 && len > 4) {
    const start = Math.floor(Math.random() * (len - 2));
    const segLen = 1 + Math.floor(Math.random() * Math.min(4, len - start));
    for (let i = start; i < start + segLen; i++) {
      dirs[i] = randomDirection(possibleDirections);
    }
  }

  // Point mutations
  for (let i = 0; i < len; i++) {
    if (Math.random() < mutationRate) {
      const current = dirs[i];
      const choices: Direction[] = possibleDirections.filter(d => d !== current);
      dirs[i] = choices[Math.floor(Math.random() * choices.length)];
    }
  }

  return { directions: dirs };
}

export class GeneticProgrammingSolver extends BaseSolver {
  private populationSize: number;
  private maxTreeDepth: number;
  private crossoverRate: number;
  private mutationRate: number;
  private eliteCount: number;
  private tournamentSize: number;
  private rolloutCount: number;

  private population: Program[] = [];

  constructor(parameters: GeneticProgrammingParameters) {
    super(parameters);
    this.populationSize = parameters.populationSize;
    this.maxTreeDepth = parameters.maxTreeDepth;
    this.crossoverRate = parameters.crossoverRate;
    this.mutationRate = parameters.mutationRate;
    this.eliteCount = parameters.eliteCount;
    this.tournamentSize = parameters.tournamentSize;
    this.rolloutCount = parameters.rolloutCount ?? 1;
  }

  async solve(): Promise<SolverResult> {
    const start = Date.now();
    const energyHistory: { iteration: number; energy: number }[] = [];
    this.population = this.initializePopulation();

    let best = this.evaluatePopulationAndGetBest();
    energyHistory.push({ iteration: 0, energy: best.energy });

    for (let iteration = 1; iteration <= this.maxIterations; iteration++) {
      if (this.isStopped) break;
      const next: Program[] = this.getElitesPrograms(this.eliteCount);

      while (next.length < this.populationSize) {
        const a = this.tournamentSelect();
        const b = this.tournamentSelect();
        let [childA, childB] = Math.random() < this.crossoverRate ?
          gpCrossover(a, b) :
          [{ directions: a.directions.slice() }, { directions: b.directions.slice() }];

        if (Math.random() < this.mutationRate) childA = gpMutate(childA, this.mutationRate, this.possibleDirections);
        if (Math.random() < this.mutationRate) childB = gpMutate(childB, this.mutationRate, this.possibleDirections);

        next.push(childA);
        if (next.length < this.populationSize) next.push(childB);
      }

      this.population = next;
      const currentBest = this.evaluatePopulationAndGetBest();
      if (currentBest.energy < best.energy) best = currentBest;

      if (iteration % 10 === 0) {
        energyHistory.push({ iteration, energy: best.energy });
        this.onProgress?.({ iteration, currentEnergy: currentBest.energy, bestEnergy: best.energy, progress: (iteration / this.maxIterations) * 100 });
        await new Promise(r => setTimeout(r, 0));
      }
    }

    const bestConformation: Conformation = {
      sequence: this.sequence,
      directions: best.directions,
      positions: (EnergyCalculator as any).calculatePositions ? (EnergyCalculator as any).calculatePositions(this.sequence, best.directions) : [],
      energy: best.energy
    };
    return { bestConformation, energyHistory, totalIterations: this.maxIterations, convergenceTime: Date.now() - start };
  }

  private initializePopulation(): Program[] {
    const arr: Program[] = [];
    const length = this.sequence.length - 1;
    for (let i = 0; i < this.populationSize; i++) {
      arr.push(createRandomProgram(length, this.possibleDirections));
    }
    return arr;
  }

  private evaluatePopulationAndGetBest(): { directions: Direction[]; energy: number } {
    let bestEnergy = Number.POSITIVE_INFINITY;
    let bestDirs: Direction[] = [];

    for (const p of this.population) {
      const energy = EnergyCalculator.calculateEnergy(this.sequence, p.directions);
      p.fitness = energy;
      if (energy < bestEnergy) {
        bestEnergy = energy;
        bestDirs = p.directions.slice();
      }
    }
    return { directions: bestDirs, energy: bestEnergy };
  }

  private tournamentSelect(): Program {
    const picks: Program[] = [];
    for (let i = 0; i < this.tournamentSize; i++) {
      picks.push(this.population[Math.floor(Math.random() * this.population.length)]);
    }
    // lower fitness is better
    return picks.reduce((b, c) => ((b.fitness ?? Infinity) <= (c.fitness ?? Infinity) ? b : c), picks[0]);
  }

  private getElitesPrograms(k: number): Program[] {
    return [...this.population]
      .sort((a, b) => (a.fitness ?? Infinity) - (b.fitness ?? Infinity))
      .slice(0, Math.min(k, this.population.length));
  }
}


