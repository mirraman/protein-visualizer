import { Direction } from "../types";
import { BaseSolver, MonteCarloParameters, SolverResult, Conformation } from "./types";
import { EnergyCalculator } from "./energy-calculator";

export class MonteCarloSolver extends BaseSolver {
  private populationSize: number;
  private population: Conformation[] = [];
  private totalSampledCount: number = 0;

  constructor(parameters: MonteCarloParameters) {
    super(parameters);
    this.populationSize = parameters.populationSize;
  }

  async solve(): Promise<SolverResult> {
    const startTime = Date.now();
    const energyHistory: { iteration: number; energy: number }[] = [];

    // Initialize population with diverse random conformations
    this.initializePopulation();

    let bestConformation = this.getBestConformation();
    let averageEnergy = this.getAverageEnergy();

    energyHistory.push({ iteration: 0, energy: averageEnergy });

    const logInterval = Math.max(1, Math.floor(this.maxIterations / 2000));
    const yieldInterval = Math.max(1, Math.floor(this.maxIterations / 1000));

    // Monte Carlo sampling - focus on exploration, not optimization
    for (let iteration = 1; iteration <= this.maxIterations; iteration++) {
      // Check if solver was stopped
      if (this.isStopped) {
        break;
      }

      // Generate new samples through random sampling
      this.performSamplingIteration();

      // Track the best conformation found (but don't optimize for it)
      const currentBest = this.getBestConformation();
      if (currentBest.energy < bestConformation.energy) {
        bestConformation = { ...currentBest };
      }

      // Record energy statistics (average energy of population, not just best)
      if (iteration % logInterval === 0) {
        averageEnergy = this.getAverageEnergy();
        energyHistory.push({
          iteration,
          energy: averageEnergy
        });

        // Progress update synced with logging
        this.onProgress?.({
          iteration,
          currentEnergy: averageEnergy,
          bestEnergy: bestConformation.energy,
          progress: (iteration / this.maxIterations) * 100
        });
      }

      // Allow UI updates
      if (iteration % yieldInterval === 0) {
        await new Promise(resolve => setTimeout(resolve, 0));
      }
    }

    const convergenceTime = Date.now() - startTime;

    return {
      bestConformation,
      energyHistory,
      totalIterations: this.maxIterations,
      convergenceTime
    };
  }

  private initializePopulation(): void {
    this.population = [];
    this.totalSampledCount = 0;

    for (let i = 0; i < this.populationSize; i++) {
      const directions = this.generateRandomDirections();
      const conformation = EnergyCalculator.createConformation(this.sequence, directions);
      this.population.push(conformation);
    }
    this.totalSampledCount = this.populationSize;
  }

  private performSamplingIteration(): void {
    // Monte Carlo sampling: generate new conformations and maintain diverse population
    const newSamples: Conformation[] = [];

    // Generate new random samples
    const newSampleCount = Math.floor(this.populationSize * 0.5); // Generate 50% new samples
    for (let i = 0; i < newSampleCount; i++) {
      const directions = this.generateRandomDirections();
      const conformation = EnergyCalculator.createConformation(this.sequence, directions);
      newSamples.push(conformation);
    }

    // Generate samples by mutating existing good conformations
    const mutationCount = Math.floor(this.populationSize * 0.3); // 30% mutations
    const topHalf = [...this.population]
      .sort((a, b) => a.energy - b.energy)
      .slice(0, Math.floor(this.populationSize / 2));

    for (let i = 0; i < mutationCount; i++) {
      const parent = topHalf[Math.floor(Math.random() * topHalf.length)];
      const mutatedConformation = this.mutateConformation(parent);
      newSamples.push(mutatedConformation);
    }

    // Add new samples to population and keep diverse set
    this.population.push(...newSamples);
    this.totalSampledCount += newSamples.length;

    this.maintainPopulationDiversity();
  }

  private mutateConformation(parent: Conformation): Conformation {
    const newDirections = [...parent.directions];

    // Mutate 1-3 random positions
    const mutationCount = Math.floor(Math.random() * 3) + 1;
    // Use the instance's possible directions
    const possibleDirections: Direction[] = this.possibleDirections;

    for (let i = 0; i < mutationCount; i++) {
      const randomIndex = Math.floor(Math.random() * newDirections.length);
      const currentDirection = newDirections[randomIndex];
      const availableDirections = possibleDirections.filter(d => d !== currentDirection);
      newDirections[randomIndex] = availableDirections[Math.floor(Math.random() * availableDirections.length)];
    }

    return EnergyCalculator.createConformation(this.sequence, newDirections);
  }

  private maintainPopulationDiversity(): void {
    // Keep population at target size while maintaining diversity
    if (this.population.length > this.populationSize) {
      // Sort by energy and keep a mix of good and diverse conformations
      const sorted = [...this.population].sort((a, b) => a.energy - b.energy);

      // Keep best 60% and random 40% for diversity
      const keepBest = Math.floor(this.populationSize * 0.6);
      const keepRandom = this.populationSize - keepBest;

      const newPopulation = sorted.slice(0, keepBest);

      // Add random selection from remaining conformations for diversity
      const remaining = sorted.slice(keepBest);
      for (let i = 0; i < keepRandom && remaining.length > 0; i++) {
        const randomIndex = Math.floor(Math.random() * remaining.length);
        newPopulation.push(remaining.splice(randomIndex, 1)[0]);
      }

      this.population = newPopulation;
    }
  }

  private getBestConformation(): Conformation {
    if (this.population.length === 0) return { sequence: this.sequence, directions: [], energy: 0, positions: [] };
    return this.population.reduce((best, current) =>
      current.energy < best.energy ? current : best
    );
  }

  private getAverageEnergy(): number {
    const validConformations = this.population.filter(c => c.energy !== Number.POSITIVE_INFINITY);
    if (validConformations.length === 0) return 0;

    const totalEnergy = validConformations.reduce((sum, c) => sum + c.energy, 0);
    return totalEnergy / validConformations.length;
  }

  getPopulation(): Conformation[] {
    return [...this.population];
  }

  /**
   * Returns empty array now to save memory, or could return just the current population
   * @deprecated logic changed for performance
   */
  getAllSampledConformations(): Conformation[] {
    console.warn("getAllSampledConformations returns only current population in high-performance mode");
    return [...this.population];
  }

  getPopulationStats() {
    const valid = this.population.filter(c => c.energy !== Number.POSITIVE_INFINITY);
    const energies = valid.map(c => c.energy);

    // Handle edge case of no valid conformations
    if (energies.length === 0) {
      return {
        bestEnergy: 0, worstEnergy: 0, averageEnergy: 0,
        validConformations: 0, totalSampled: this.totalSampledCount, diversityScore: 0
      };
    }

    const avgEnergy = energies.reduce((sum, e) => sum + e, 0) / energies.length;
    const variance = energies.reduce((sum, e) => sum + Math.pow(e - avgEnergy, 2), 0) / energies.length;

    return {
      bestEnergy: Math.min(...energies),
      worstEnergy: Math.max(...energies),
      averageEnergy: avgEnergy,
      validConformations: valid.length,
      // Use the counter here
      totalSampled: this.totalSampledCount,
      diversityScore: Math.sqrt(variance)
    };
  }

  // getEnergyDistribution remains the same as it uses this.population
  getEnergyDistribution(bins: number = 10): { energy: number; count: number }[] {
    const validConformations = this.population.filter(c => c.energy !== Number.POSITIVE_INFINITY);
    const energies = validConformations.map(c => c.energy);

    if (energies.length === 0) return [];

    const minEnergy = Math.min(...energies);
    const maxEnergy = Math.max(...energies);
    // Avoid division by zero if all energies are the same
    const binSize = maxEnergy === minEnergy ? 1 : (maxEnergy - minEnergy) / bins;

    const histogram: { energy: number; count: number }[] = [];

    for (let i = 0; i < bins; i++) {
      const binStart = minEnergy + i * binSize;
      const binEnd = binStart + binSize;
      // For the last bin, include the max value
      const count = energies.filter(e => e >= binStart && (i === bins - 1 ? e <= binEnd : e < binEnd)).length;

      histogram.push({
        energy: binStart + binSize / 2,
        count
      });
    }

    return histogram;
  }
}
