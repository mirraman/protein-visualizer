/**
 * Protein Solver Service - Headless solver operations
 * Decouples solver logic from React components
 */

import { 
  MonteCarloSolver, 
  SimulatedAnnealingSolver,
  GeneticAlgorithmSolver,
  EvolutionStrategiesSolver,
  EvolutionaryProgrammingSolver,
  GeneticProgrammingSolver,
  EnergyCalculator,
  type SolverResult,
  type Conformation
} from "../solvers";
import type { Direction } from "../types";

export interface SolverConfig {
  algorithm: 'monte-carlo' | 'simulated-annealing' | 'ga' | 'es' | 'ep' | 'gp';
  sequence: string;
  initialDirections?: Direction[];
  maxIterations: number;
  populationSize?: number; // For Monte Carlo
  // Lattice type
  latticeType?: '2D' | '3D';
  // GA-specific
  crossoverRate?: number;
  mutationRate?: number;
  eliteCount?: number;
  tournamentSize?: number;
  initialTemperature?: number; // For Simulated Annealing
  finalTemperature?: number;
  coolingRate?: number;
  // ES-specific
  mu?: number;
  lambda?: number;
  initialMutationRate?: number;
  // GP-specific
  maxTreeDepth?: number;
}

export interface SolverProgress {
  iteration: number;
  currentEnergy: number;
  bestEnergy: number;
  progress: number; // 0-100
}

export interface SolverEventCallbacks {
  onProgress?: (progress: SolverProgress) => void;
  onComplete?: (result: SolverResult) => void;
  onError?: (error: Error) => void;
}

export class ProteinSolverService {
  private currentSolver: MonteCarloSolver | SimulatedAnnealingSolver | GeneticAlgorithmSolver | EvolutionStrategiesSolver | EvolutionaryProgrammingSolver | GeneticProgrammingSolver | null = null;
  private isRunning = false;
  private callbacks: SolverEventCallbacks = {};

  /**
   * Run solver with configuration and callbacks
   */
  async solve(config: SolverConfig, callbacks: SolverEventCallbacks = {}): Promise<SolverResult> {
    if (this.isRunning) {
      throw new Error('Solver is already running');
    }

    this.callbacks = callbacks;
    this.isRunning = true;

    try {
      // Create appropriate solver
      if (config.algorithm === 'monte-carlo') {
        this.currentSolver = new MonteCarloSolver({
          sequence: config.sequence,
          maxIterations: config.maxIterations,
          populationSize: config.populationSize || 50,
          initialDirections: config.initialDirections,
          latticeType: config.latticeType,
          onProgress: this.handleProgress.bind(this)
        });
      } else if (config.algorithm === 'ga') {
        this.currentSolver = new GeneticAlgorithmSolver({
          sequence: config.sequence,
          maxIterations: config.maxIterations,
          populationSize: config.populationSize ?? 120,
          crossoverRate: config.crossoverRate ?? 0.9,
          mutationRate: config.mutationRate ?? 0.1,
          eliteCount: config.eliteCount ?? 3,
          tournamentSize: config.tournamentSize ?? 3,
          initialDirections: config.initialDirections,
          latticeType: config.latticeType,
          onProgress: this.handleProgress.bind(this)
        });
      } else if (config.algorithm === 'es') {
        this.currentSolver = new EvolutionStrategiesSolver({
          sequence: config.sequence,
          maxIterations: config.maxIterations,
          mu: config.mu ?? 25,
          lambda: config.lambda ?? 150,
          initialMutationRate: config.initialMutationRate ?? 0.1,
          mutationDecay: 0.97,
          mutationBoost: 1.1,
          stagnationWindow: 10,
          plusSelection: true,
          initialDirections: config.initialDirections,
          latticeType: config.latticeType,
          onProgress: this.handleProgress.bind(this)
        });
      } else if (config.algorithm === 'ep') {
        this.currentSolver = new EvolutionaryProgrammingSolver({
          sequence: config.sequence,
          maxIterations: config.maxIterations,
          populationSize: config.populationSize ?? 120,
          mutationRate: config.mutationRate ?? 0.1,
          tournamentSize: config.tournamentSize ?? 3,
          eliteCount: 2,
          initialDirections: config.initialDirections,
          latticeType: config.latticeType,
          onProgress: this.handleProgress.bind(this)
        });
      } else if (config.algorithm === 'gp') {
        this.currentSolver = new GeneticProgrammingSolver({
          sequence: config.sequence,
          maxIterations: config.maxIterations,
          populationSize: config.populationSize ?? 60,
          maxTreeDepth: 4,
          crossoverRate: 0.9,
          mutationRate: 0.2,
          eliteCount: 2,
          tournamentSize: 3,
          rolloutCount: 1,
          initialDirections: config.initialDirections,
          latticeType: config.latticeType,
          onProgress: this.handleProgress.bind(this)
        });
      } else {
        this.currentSolver = new SimulatedAnnealingSolver({
          sequence: config.sequence,
          maxIterations: config.maxIterations,
          initialTemperature: config.initialTemperature || 5.0,
          finalTemperature: config.finalTemperature || 0.01,
          coolingRate: config.coolingRate || 0.95,
          initialDirections: config.initialDirections,
          latticeType: config.latticeType,
          onProgress: this.handleProgress.bind(this)
        });
      }

      const result = await this.currentSolver.solve();
      
      this.callbacks.onComplete?.(result);
      return result;

    } catch (error) {
      const solverError = error instanceof Error ? error : new Error('Unknown solver error');
      this.callbacks.onError?.(solverError);
      throw solverError;
    } finally {
      this.isRunning = false;
      this.currentSolver = null;
    }
  }

  /**
   * Stop current solver execution
   */
  stop(): void {
    if (this.currentSolver && this.isRunning) {
      this.currentSolver.stop?.();
      this.isRunning = false;
    }
  }

  /**
   * Check if solver is currently running
   */
  isSolverRunning(): boolean {
    return this.isRunning;
  }

  /**
   * Calculate energy for given sequence and directions
   */
  static calculateEnergy(sequence: string, directions: Direction[]): number {
    return EnergyCalculator.calculateEnergy(sequence, directions);
  }

  /**
   * Validate protein sequence
   */
  static validateSequence(sequence: string): { isValid: boolean; errors: string[] } {
    const errors: string[] = [];
    
    if (!sequence || sequence.length === 0) {
      errors.push('Sequence cannot be empty');
    }
    
    if (sequence.length < 2) {
      errors.push('Sequence must have at least 2 residues');
    }
    
    const invalidChars = sequence.replace(/[HP]/g, '');
    if (invalidChars.length > 0) {
      errors.push(`Invalid characters found: ${[...new Set(invalidChars)].join(', ')}`);
    }
    
    return {
      isValid: errors.length === 0,
      errors
    };
  }

  /**
   * Validate folding directions
   */
  static validateDirections(directions: Direction[], sequenceLength: number, latticeType: '2D' | '3D' = '2D'): { isValid: boolean; errors: string[] } {
    const errors: string[] = [];
    
    if (!directions || directions.length === 0) {
      return { isValid: true, errors: [] }; // Directions are optional
    }
    
    if (directions.length !== sequenceLength - 1) {
      errors.push(`Expected ${sequenceLength - 1} directions for sequence of length ${sequenceLength}, got ${directions.length}`);
    }
    
    // Include F/B for 3D lattice
    const validDirections = latticeType === '3D' 
      ? ['R', 'U', 'D', 'L', 'F', 'B'] 
      : ['R', 'U', 'D', 'L'];
    const invalidDirections = directions.filter(d => !validDirections.includes(d));
    if (invalidDirections.length > 0) {
      errors.push(`Invalid directions found: ${[...new Set(invalidDirections)].join(', ')}`);
    }
    
    return {
      isValid: errors.length === 0,
      errors
    };
  }

  /**
   * Batch processing - solve multiple configurations
   */
  static async batchSolve(configs: SolverConfig[]): Promise<SolverResult[]> {
    const results: SolverResult[] = [];
    
    for (const config of configs) {
      const service = new ProteinSolverService();
      try {
        const result = await service.solve(config);
        results.push(result);
      } catch (error) {
        console.error(`Batch solve failed for config:`, config, error);
        // Continue with next config
      }
    }
    
    return results;
  }

  private handleProgress(progress: any): void {
    // Transform solver progress to our interface
    const solverProgress: SolverProgress = {
      iteration: progress.iteration || 0,
      currentEnergy: progress.currentEnergy || 0,
      bestEnergy: progress.bestEnergy || 0,
      progress: progress.iteration && this.currentSolver ? 
        (progress.iteration / (this.currentSolver as any).maxIterations) * 100 : 0
    };
    
    this.callbacks.onProgress?.(solverProgress);
  }
}

// Singleton instance for global use
export const proteinSolverService = new ProteinSolverService();


