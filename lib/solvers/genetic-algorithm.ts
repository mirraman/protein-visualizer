import { EnergyCalculator } from "./energy-calculator";
import { BaseSolver, type SolverResult, type Conformation, type GeneticAlgorithmParameters } from "./types";
import type { Direction } from "../types";

type Individual = {
  directions: Direction[];
  energy: number;
};

export class GeneticAlgorithmSolver extends BaseSolver {
  private populationSize: number;
  private crossoverRate: number;
  private mutationRate: number;
  private eliteCount: number;
  private tournamentSize: number;

  private population: Individual[] = [];

  constructor(parameters: GeneticAlgorithmParameters) {
    super(parameters);
    this.populationSize = parameters.populationSize;
    this.crossoverRate = parameters.crossoverRate;
    this.mutationRate = parameters.mutationRate;
    this.eliteCount = parameters.eliteCount;
    this.tournamentSize = parameters.tournamentSize;
    // simple GA: fixed one-point crossover, fixed mutation
  }

  async solve(): Promise<SolverResult> {
    const startTime = Date.now();
    const energyHistory: { iteration: number; energy: number }[] = [];

    // Initialize population
    this.population = this.initializePopulation();

    let best = this.getBestIndividual();
    energyHistory.push({ iteration: 0, energy: best.energy });

    const logInterval = Math.max(1, Math.floor(this.maxIterations / 2000));
    const yieldInterval = Math.max(1, Math.floor(this.maxIterations / 1000));

    for (let iteration = 1; iteration <= this.maxIterations; iteration++) {
      if (this.isStopped) break;

      // Elitism: carry over top elites
      const nextPopulation: Individual[] = this.getElites(this.eliteCount);

      // Produce offspring until reaching population size
      while (nextPopulation.length < this.populationSize) {
        const parentA = this.tournamentSelect();
        const parentB = this.tournamentSelect();

        let [childDirsA, childDirsB] = this.maybeCrossover(parentA.directions, parentB.directions);

        // Mutate
        childDirsA = this.mutate(childDirsA);
        childDirsB = this.mutate(childDirsB);

        // Evaluate
        const childA: Individual = {
          directions: childDirsA,
          energy: EnergyCalculator.calculateEnergy(this.sequence, childDirsA)
        };
        const childB: Individual = {
          directions: childDirsB,
          energy: EnergyCalculator.calculateEnergy(this.sequence, childDirsB)
        };

        nextPopulation.push(childA);
        if (nextPopulation.length < this.populationSize) nextPopulation.push(childB);
      }

      this.population = nextPopulation;
      const currentBest = this.getBestIndividual();
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
      positions: EnergyCalculator["calculatePositions" as any]
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
    const individuals: Individual[] = [];
    for (let i = 0; i < this.populationSize; i++) {
      const directions = this.generateInitialDirections();
      const energy = EnergyCalculator.calculateEnergy(this.sequence, directions);
      individuals.push({ directions, energy });
    }
    return individuals;
  }

  private generateInitialDirections(): Direction[] {
    // Use provided initial as seed if available, otherwise random non-self-intersecting attempt
    const length = this.sequence.length - 1;
    const base = this.generateRandomDirections();
    // Ensure exact length
    return base.slice(0, length);
  }

  private getElites(k: number): Individual[] {
    return [...this.population]
      .sort((a, b) => a.energy - b.energy)
      .slice(0, Math.min(k, this.population.length));
  }

  private tournamentSelect(): Individual {
    const picks: Individual[] = [];
    for (let i = 0; i < this.tournamentSize; i++) {
      const idx = Math.floor(Math.random() * this.population.length);
      picks.push(this.population[idx]);
    }
    return picks.reduce((best, cur) => (cur.energy < best.energy ? cur : best), picks[0]);
  }

  private maybeCrossover(a: Direction[], b: Direction[]): [Direction[], Direction[]] {
    if (Math.random() > this.crossoverRate) return [a.slice(), b.slice()];
    const length = Math.min(a.length, b.length);
    if (length < 2) return [a.slice(), b.slice()];
    const point = 1 + Math.floor(Math.random() * (length - 1));
    const childA = a.slice(0, point).concat(b.slice(point));
    const childB = b.slice(0, point).concat(a.slice(point));
    return [childA as Direction[], childB as Direction[]];
  }

  private mutate(genes: Direction[]): Direction[] {
    const dirs: Direction[] = genes.slice();
    const alphabet: Direction[] = this.possibleDirections;
    for (let i = 0; i < dirs.length; i++) {
      if (Math.random() < this.mutationRate) {
        // Change to a different direction
        const current = dirs[i];
        const choices = alphabet.filter(d => d !== current);
        dirs[i] = choices[Math.floor(Math.random() * choices.length)];
      }
    }
    return dirs;
  }

  // no local relaxation in simple GA

  private getBestIndividual(): Individual {
    return this.population.reduce((best, cur) => (cur.energy < best.energy ? cur : best), this.population[0]);
  }
}


