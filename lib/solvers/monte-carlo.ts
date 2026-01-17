import { Direction } from "../types";
import { BaseSolver, MonteCarloParameters, SolverResult, Conformation } from "./types";
import { EnergyCalculator } from "./energy-calculator";

export class MonteCarloSolver extends BaseSolver {
  private populationSize: number;
  private population: Conformation[] = [];
  private sampledConformations: Conformation[] = [];

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
      if (iteration % 10 === 0) {
        averageEnergy = this.getAverageEnergy();
        energyHistory.push({
          iteration,
          energy: averageEnergy  // Track population average, not just best
        });
      }

      // Progress callback
      if (this.onProgress && iteration % 10 === 0) {
        this.onProgress({
          iteration,
          currentEnergy: averageEnergy,
          bestEnergy: bestConformation.energy,
          progress: (iteration / this.maxIterations) * 100
        });
      }

      // Allow UI updates
      if (iteration % 100 === 0) {
        await new Promise(resolve => setTimeout(resolve, 1));
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

    for (let i = 0; i < this.populationSize; i++) {
      const directions = this.generateRandomDirections();
      const conformation = EnergyCalculator.createConformation(this.sequence, directions);
      this.population.push(conformation);
    }
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
    const sortedPopulation = [...this.population].sort((a, b) => a.energy - b.energy);
    const topHalf = sortedPopulation.slice(0, Math.floor(this.populationSize / 2));

    for (let i = 0; i < mutationCount; i++) {
      const parent = topHalf[Math.floor(Math.random() * topHalf.length)];
      const mutatedConformation = this.mutateConformation(parent);
      newSamples.push(mutatedConformation);
    }

    // Add new samples to population and keep diverse set
    this.population.push(...newSamples);
    this.sampledConformations.push(...newSamples);

    // Maintain population size by keeping diverse conformations
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

  /**
   * Get the current population for analysis
   */
  getPopulation(): Conformation[] {
    return [...this.population];
  }

  /**
   * Get all sampled conformations (for analysis of sampling coverage)
   */
  getAllSampledConformations(): Conformation[] {
    return [...this.sampledConformations];
  }

  /**
   * Get population statistics
   */
  getPopulationStats(): {
    bestEnergy: number;
    worstEnergy: number;
    averageEnergy: number;
    validConformations: number;
    totalSampled: number;
    diversityScore: number;
  } {
    const validConformations = this.population.filter(c => c.energy !== Number.POSITIVE_INFINITY);
    const energies = validConformations.map(c => c.energy);

    // Calculate diversity as standard deviation of energies
    const avgEnergy = energies.reduce((sum, e) => sum + e, 0) / energies.length;
    const variance = energies.reduce((sum, e) => sum + Math.pow(e - avgEnergy, 2), 0) / energies.length;
    const diversityScore = Math.sqrt(variance);

    return {
      bestEnergy: Math.min(...energies),
      worstEnergy: Math.max(...energies),
      averageEnergy: avgEnergy,
      validConformations: validConformations.length,
      totalSampled: this.sampledConformations.length,
      diversityScore
    };
  }

  /**
   * Get energy distribution histogram for analysis
   */
  getEnergyDistribution(bins: number = 10): { energy: number; count: number }[] {
    const validConformations = this.population.filter(c => c.energy !== Number.POSITIVE_INFINITY);
    const energies = validConformations.map(c => c.energy);

    if (energies.length === 0) return [];

    const minEnergy = Math.min(...energies);
    const maxEnergy = Math.max(...energies);
    const binSize = (maxEnergy - minEnergy) / bins;

    const histogram: { energy: number; count: number }[] = [];

    for (let i = 0; i < bins; i++) {
      const binStart = minEnergy + i * binSize;
      const binEnd = binStart + binSize;
      const count = energies.filter(e => e >= binStart && e < binEnd).length;

      histogram.push({
        energy: binStart + binSize / 2, // Bin center
        count
      });
    }

    return histogram;
  }
}
