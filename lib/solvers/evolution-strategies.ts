import { EnergyCalculator } from "./energy-calculator";
import { BaseSolver, type SolverResult, type Conformation, type EvolutionStrategiesParameters } from "./types";
import type { Direction } from "../types";

type Individual = {
  directions: Direction[];
  energy: number;
  sigma: number; // global per-chromosome mutation rate
};

export class EvolutionStrategiesSolver extends BaseSolver {
  private mu: number;
  private lambda: number;
  private sigma: number;
  private mutationDecay: number;
  private mutationBoost: number;
  private stagnationWindow: number;
  private plusSelection: boolean;

  private parents: Individual[] = [];

  constructor(parameters: EvolutionStrategiesParameters) {
    super(parameters);
    this.mu = parameters.mu;
    this.lambda = parameters.lambda;
    this.sigma = parameters.initialMutationRate;
    this.mutationDecay = parameters.mutationDecay ?? 0.97;
    this.mutationBoost = parameters.mutationBoost ?? 1.1;
    this.stagnationWindow = parameters.stagnationWindow ?? 10;
    this.plusSelection = parameters.plusSelection ?? true;
  }

  async solve(): Promise<SolverResult> {
    const startTime = Date.now();
    const energyHistory: { iteration: number; energy: number }[] = [];

    // Initialize parents
    this.parents = this.initializeParents();
    let best = this.getBest(this.parents);
    let bestEnergySoFar = best.energy;
    let stagnation = 0;
    energyHistory.push({ iteration: 0, energy: best.energy });

    const logInterval = Math.max(1, Math.floor(this.maxIterations / 2000));
    const yieldInterval = Math.max(1, Math.floor(this.maxIterations / 1000));

    for (let iteration = 1; iteration <= this.maxIterations; iteration++) {
      if (this.isStopped) break;

      const offspring: Individual[] = [];
      for (let k = 0; k < this.lambda; k++) {
        const parent = this.parents[Math.floor(Math.random() * this.parents.length)];
        const child = this.mutate(parent);
        offspring.push(child);
      }

      const pool = this.plusSelection ? this.parents.concat(offspring) : offspring;
      pool.sort((a, b) => a.energy - b.energy);
      this.parents = pool.slice(0, this.mu);

      const currentBest = this.parents[0];
      if (currentBest.energy < best.energy) best = currentBest;

      // Adapt sigma
      if (best.energy < bestEnergySoFar) {
        bestEnergySoFar = best.energy;
        stagnation = 0;
        this.sigma = Math.max(0.01, this.sigma * this.mutationDecay);
      } else {
        stagnation++;
        if (stagnation >= this.stagnationWindow) {
          this.sigma = Math.min(0.5, this.sigma * this.mutationBoost);
          stagnation = 0;
        }
      }

      if (iteration % logInterval === 0) {
        energyHistory.push({ iteration, energy: best.energy });
        this.onProgress?.({
          iteration,
          currentEnergy: currentBest.energy,
          bestEnergy: best.energy,
          progress: (iteration / this.maxIterations) * 100
        });
      }

      if (iteration % yieldInterval === 0) {
        await new Promise(resolve => setTimeout(resolve, 0));
      }
    }

    const endTime = Date.now();
    const bestConformation: Conformation = {
      sequence: this.sequence,
      directions: best.directions,
      positions: (EnergyCalculator as any).calculatePositions
        ? (EnergyCalculator as any).calculatePositions(this.sequence, best.directions)
        : [],
      energy: best.energy
    };

    return {
      bestConformation,
      energyHistory,
      totalIterations: this.maxIterations,
      convergenceTime: endTime - startTime
    };
  }

  private initializeParents(): Individual[] {
    const arr: Individual[] = [];
    for (let i = 0; i < this.mu; i++) {
      const directions = this.generateRandomDirections();
      const energy = EnergyCalculator.calculateEnergy(this.sequence, directions);
      arr.push({ directions, energy, sigma: this.sigma });
    }
    return arr;
  }

  private mutate(ind: Individual): Individual {
    const alphabet: Direction[] = this.possibleDirections;
    const dirs = ind.directions.slice();
    const rate = ind.sigma;
    for (let i = 0; i < dirs.length; i++) {
      if (Math.random() < rate) {
        const current = dirs[i];
        const choices = alphabet.filter(d => d !== current);
        dirs[i] = choices[Math.floor(Math.random() * choices.length)];
      }
    }
    const energy = EnergyCalculator.calculateEnergy(this.sequence, dirs);
    // self-adapt global sigma slightly per offspring
    const childSigma = Math.min(0.5, Math.max(0.01, rate * (0.9 + Math.random() * 0.2)));
    return { directions: dirs, energy, sigma: childSigma };
  }

  private getBest(pop: Individual[]): Individual {
    return pop.reduce((b, c) => (c.energy < b.energy ? c : b), pop[0]);
  }
}


