import { Direction } from "../types";
import { BaseSolver, SimulatedAnnealingParameters, SolverResult, Conformation, Position } from "./types";
import { EnergyCalculator } from "./energy-calculator";

export class SimulatedAnnealingSolver extends BaseSolver {
  private initialTemperature: number;
  private finalTemperature: number;
  private coolingRate: number;

  constructor(parameters: SimulatedAnnealingParameters) {
    super(parameters);
    this.initialTemperature = parameters.initialTemperature;
    this.finalTemperature = parameters.finalTemperature;
    this.coolingRate = parameters.coolingRate;
  }

  async solve(): Promise<SolverResult> {
    const startTime = Date.now();
    const energyHistory: { iteration: number; energy: number }[] = [];

    // Initialize temperature first
    let temperature = this.initialTemperature;

    // Initialize with random or provided conformation
    let currentConformation = this.initializeConformation();
    let bestConformation = { ...currentConformation };

    energyHistory.push({ iteration: 0, energy: currentConformation.energy });

    // Simulated Annealing optimization
    for (let iteration = 1; iteration <= this.maxIterations; iteration++) {
      // Check if solver was stopped
      if (this.isStopped) {
        break;
      }

      // Generate neighbor conformation
      const neighborConformation = this.generateNeighbor(currentConformation);

      // Accept or reject the move
      if (this.acceptMove(currentConformation.energy, neighborConformation.energy, temperature)) {
        currentConformation = neighborConformation;

        // Update global best
        if (currentConformation.energy < bestConformation.energy) {
          bestConformation = { ...currentConformation };
        }
      }

      // Cool down temperature
      temperature = this.updateTemperature(temperature, iteration);

      // Record energy history (sample every 10 iterations)
      // Track both current and best energy to show funnel exploration
      if (iteration % 10 === 0) {
        energyHistory.push({
          iteration,
          energy: bestConformation.energy
        });
      }

      // Progress callback
      if (this.onProgress && iteration % 10 === 0) {
        this.onProgress({
          iteration,
          currentEnergy: currentConformation.energy,
          bestEnergy: bestConformation.energy,
          progress: (iteration / this.maxIterations) * 100
        });
      }

      // Allow UI updates
      if (iteration % 100 === 0) {
        await new Promise(resolve => setTimeout(resolve, 1));
      }

      // Early termination if temperature is too low
      if (temperature < this.finalTemperature) {
        break;
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

  private initializeConformation(): Conformation {
    const directions = this.generateRandomDirections();
    return EnergyCalculator.createConformation(this.sequence, directions);
  }

  private generateNeighbor(conformation: Conformation): Conformation {
    // Try multiple attempts to generate a valid neighbor
    const maxAttempts = 10;

    for (let attempt = 0; attempt < maxAttempts; attempt++) {
      const newDirections = [...conformation.directions];
      const randomIndex = Math.floor(Math.random() * newDirections.length);
      const possibleDirections: Direction[] = this.possibleDirections;

      // Choose a different direction
      const currentDirection = newDirections[randomIndex];
      const availableDirections = possibleDirections.filter(d => d !== currentDirection);
      const newDirection = availableDirections[Math.floor(Math.random() * availableDirections.length)];

      newDirections[randomIndex] = newDirection;

      const neighbor = EnergyCalculator.createConformation(this.sequence, newDirections);

      // If we found a valid neighbor, return it
      if (neighbor.energy !== Number.POSITIVE_INFINITY || attempt === maxAttempts - 1) {
        return neighbor;
      }
    }

    // Fallback: return the original conformation
    return conformation;
  }

  private acceptMove(currentEnergy: number, newEnergy: number, temperature: number): boolean {
    // Handle infinite energy cases
    if (currentEnergy === Number.POSITIVE_INFINITY && newEnergy === Number.POSITIVE_INFINITY) {
      return false; // Don't accept if both are invalid
    }

    if (currentEnergy === Number.POSITIVE_INFINITY && newEnergy !== Number.POSITIVE_INFINITY) {
      return true; // Always accept valid solutions when current is invalid
    }

    if (currentEnergy !== Number.POSITIVE_INFINITY && newEnergy === Number.POSITIVE_INFINITY) {
      // Accept invalid solutions with very low probability when current is valid
      if (temperature > 0) {
        const acceptanceProbability = Math.exp(-10 / temperature); // Very low probability
        return Math.random() < acceptanceProbability;
      }
      return false;
    }

    // Both energies are finite - normal acceptance criterion
    // Always accept better solutions
    if (newEnergy < currentEnergy) {
      return true;
    }

    // Accept worse solutions with probability based on temperature
    if (temperature > 0) {
      const acceptanceProbability = Math.exp((currentEnergy - newEnergy) / temperature);
      return Math.random() < acceptanceProbability;
    }

    return false;
  }

  private updateTemperature(currentTemperature: number, iteration: number): number {
    // Exponential cooling schedule (more appropriate for simulated annealing)
    // T(t) = T_initial * (T_final/T_initial)^(t/t_max)
    // This provides slower cooling that allows proper exploration
    const coolingFactor = Math.pow(this.finalTemperature / this.initialTemperature, iteration / this.maxIterations);
    const newTemperature = this.initialTemperature * coolingFactor;

    // Ensure temperature doesn't go below final temperature
    return Math.max(newTemperature, this.finalTemperature);
  }

  /**
   * Get current temperature for monitoring
   */
  getCurrentTemperature(iteration: number): number {
    return this.updateTemperature(this.initialTemperature, iteration);
  }
}
