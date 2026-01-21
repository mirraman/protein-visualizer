import { EnergyCalculator } from "./energy-calculator";
import { BaseSolver, type SolverResult, type Conformation, type EvolutionaryProgrammingParameters } from "./types";
import type { Direction } from "../types";

type Individual = {
  directions: Direction[];
  energy: number;
};

export class EvolutionaryProgrammingSolver extends BaseSolver {
  private populationSize: number;
  private mutationRate: number;
  private tournamentSize: number;
  private eliteCount: number;
  private population: Individual[] = [];

  constructor(parameters: EvolutionaryProgrammingParameters) {
    super(parameters);
    this.populationSize = parameters.populationSize;
    this.mutationRate = parameters.mutationRate;
    this.tournamentSize = parameters.tournamentSize;
    this.eliteCount = parameters.eliteCount ?? 2;
  }

  async solve(): Promise<SolverResult> {
    const startTime = Date.now();
    const energyHistory: { iteration: number; energy: number }[] = [];

    // Initialize population
    this.population = this.initializePopulation();
    let best = this.getBest();
    energyHistory.push({ iteration: 0, energy: best.energy });

    const logInterval = Math.max(1, Math.floor(this.maxIterations / 2000));
    const yieldInterval = Math.max(1, Math.floor(this.maxIterations / 1000));

    for (let iteration = 1; iteration <= this.maxIterations; iteration++) {
      if (this.isStopped) break;

      const next: Individual[] = this.getElites(this.eliteCount);
      while (next.length < this.populationSize) {
        const parent = this.tournamentSelect();
        const childDirs = this.mutate(parent.directions);
        const child: Individual = {
          directions: childDirs,
          energy: EnergyCalculator.calculateEnergy(this.sequence, childDirs)
        };
        next.push(child);
      }
      this.population = next;
      const currentBest = this.getBest();
      if (currentBest.energy < best.energy) best = currentBest;

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

  private initializePopulation(): Individual[] {
    const arr: Individual[] = [];
    for (let i = 0; i < this.populationSize; i++) {
      const d = this.generateRandomDirections();
      arr.push({ directions: d, energy: EnergyCalculator.calculateEnergy(this.sequence, d) });
    }
    return arr;
  }

  private tournamentSelect(): Individual {
    const picks: Individual[] = [];
    for (let i = 0; i < this.tournamentSize; i++) {
      picks.push(this.population[Math.floor(Math.random() * this.population.length)]);
    }
    return picks.reduce((b, c) => (c.energy < b.energy ? c : b), picks[0]);
  }

  private mutate(genes: Direction[]): Direction[] {
    const dirs = genes.slice();
    const alphabet: Direction[] = this.possibleDirections;
    for (let i = 0; i < dirs.length; i++) {
      if (Math.random() < this.mutationRate) {
        const current = dirs[i];
        const choices = alphabet.filter(d => d !== current);
        dirs[i] = choices[Math.floor(Math.random() * choices.length)];
      }
    }
    return dirs as Direction[];
  }

  private getElites(k: number): Individual[] {
    return [...this.population].sort((a, b) => a.energy - b.energy).slice(0, Math.min(k, this.population.length));
  }

  private getBest(): Individual {
    return this.population.reduce((b, c) => (c.energy < b.energy ? c : b), this.population[0]);
  }
}


