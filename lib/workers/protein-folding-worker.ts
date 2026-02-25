/**
 * Protein Folding Worker - Processes background jobs for protein folding algorithms
 * Handles execution of different algorithms and progress reporting
 */

import Queue from 'bull';
import { 
  JobData, 
  JobResult, 
  AlgorithmType,
  JobStatus 
} from '../types/job-types';
import { jobQueueService } from '../services/job-queue-service';

// Import existing solvers
import {
  MonteCarloSolver,
  SimulatedAnnealingSolver,
  GeneticAlgorithmSolver,
  EvolutionStrategiesSolver,
  EvolutionaryProgrammingSolver,
  GeneticProgrammingSolver,
  type SolverResult
} from '../solvers';

class ProteinFoldingWorker {
  private queue: Queue.Queue;

  constructor() {
    this.queue = new Queue('protein-folding-jobs', {
      redis: {
        host: process.env.REDIS_HOST || 'localhost',
        port: parseInt(process.env.REDIS_PORT || '6379'),
        password: process.env.REDIS_PASSWORD,
        db: parseInt(process.env.REDIS_DB || '0')
      }
    });

    this.setupProcessors();
  }

  /**
   * Setup job processors for different algorithms
   */
  private setupProcessors(): void {
    // Monte Carlo processor
    this.queue.process(AlgorithmType.MONTE_CARLO, 2, async (job) => {
      return this.processMonteCarlo(job);
    });

    // Simulated Annealing processor
    this.queue.process(AlgorithmType.SIMULATED_ANNEALING, 2, async (job) => {
      return this.processSimulatedAnnealing(job);
    });

    // Genetic Algorithm processor
    this.queue.process(AlgorithmType.GENETIC_ALGORITHM, 1, async (job) => {
      return this.processGeneticAlgorithm(job);
    });

    // Evolution Strategies processor
    this.queue.process(AlgorithmType.EVOLUTION_STRATEGIES, 1, async (job) => {
      return this.processEvolutionStrategies(job);
    });

    // Evolutionary Programming processor
    this.queue.process(AlgorithmType.EVOLUTIONARY_PROGRAMMING, 1, async (job) => {
      return this.processEvolutionaryProgramming(job);
    });

    // Genetic Programming processor
    this.queue.process(AlgorithmType.GENETIC_PROGRAMMING, 1, async (job) => {
      return this.processGeneticProgramming(job);
    });

    // Rosetta processor (placeholder for future implementation)
    this.queue.process(AlgorithmType.ROSETTA, 1, async (job) => {
      return this.processRosetta(job);
    });
  }

  /**
   * Process Monte Carlo job
   */
  private async processMonteCarlo(job: Queue.Job): Promise<JobResult> {
    const { sequence, parameters } = job.data;
    
    try {
      const solver = new MonteCarloSolver({
        sequence,
        maxIterations: parameters.maxIterations || 1000,
        populationSize: parameters.populationSize || 50,
        initialDirections: parameters.initialDirections,
        onProgress: (progress) => {
          job.progress(progress.progress || 0);
        }
      });

      const result = await solver.solve();
      return this.convertSolverResult(result);

    } catch (error) {
      console.error('Monte Carlo job failed:', error);
      throw error;
    }
  }

  /**
   * Process Simulated Annealing job
   */
  private async processSimulatedAnnealing(job: Queue.Job): Promise<JobResult> {
    const { sequence, parameters } = job.data;
    
    try {
      const solver = new SimulatedAnnealingSolver({
        sequence,
        maxIterations: parameters.maxIterations || 1000,
        initialTemperature: parameters.initialTemperature || 5.0,
        finalTemperature: parameters.finalTemperature || 0.01,
        coolingRate: parameters.coolingRate || 0.95,
        initialDirections: parameters.initialDirections,
        onProgress: (progress) => {
          job.progress(progress.progress || 0);
        }
      });

      const result = await solver.solve();
      return this.convertSolverResult(result);

    } catch (error) {
      console.error('Simulated Annealing job failed:', error);
      throw error;
    }
  }

  /**
   * Process Genetic Algorithm job
   */
  private async processGeneticAlgorithm(job: Queue.Job): Promise<JobResult> {
    const { sequence, parameters } = job.data;
    
    try {
      const solver = new GeneticAlgorithmSolver({
        sequence,
        maxIterations: parameters.maxIterations || 1000,
        populationSize: parameters.populationSize || 120,
        crossoverRate: parameters.crossoverRate || 0.9,
        mutationRate: parameters.mutationRate || 0.1,
        eliteCount: parameters.eliteCount || 3,
        tournamentSize: parameters.tournamentSize || 3,
        initialDirections: parameters.initialDirections,
        onProgress: (progress) => {
          job.progress(progress.progress || 0);
        }
      });

      const result = await solver.solve();
      return this.convertSolverResult(result);

    } catch (error) {
      console.error('Genetic Algorithm job failed:', error);
      throw error;
    }
  }

  /**
   * Process Evolution Strategies job
   */
  private async processEvolutionStrategies(job: Queue.Job): Promise<JobResult> {
    const { sequence, parameters } = job.data;
    
    try {
      const solver = new EvolutionStrategiesSolver({
        sequence,
        maxIterations: parameters.maxIterations || 1000,
        mu: parameters.mu || 25,
        lambda: parameters.lambda || 150,
        initialMutationRate: parameters.initialMutationRate || 0.1,
        mutationDecay: parameters.mutationDecay || 0.97,
        mutationBoost: parameters.mutationBoost || 1.1,
        stagnationWindow: parameters.stagnationWindow || 10,
        plusSelection: parameters.plusSelection ?? true,
        initialDirections: parameters.initialDirections,
        onProgress: (progress) => {
          job.progress(progress.progress || 0);
        }
      });

      const result = await solver.solve();
      return this.convertSolverResult(result);

    } catch (error) {
      console.error('Evolution Strategies job failed:', error);
      throw error;
    }
  }

  /**
   * Process Evolutionary Programming job
   */
  private async processEvolutionaryProgramming(job: Queue.Job): Promise<JobResult> {
    const { sequence, parameters } = job.data;
    
    try {
      const solver = new EvolutionaryProgrammingSolver({
        sequence,
        maxIterations: parameters.maxIterations || 1000,
        populationSize: parameters.populationSize || 120,
        mutationRate: parameters.mutationRate || 0.1,
        tournamentSize: parameters.tournamentSize || 3,
        eliteCount: parameters.eliteCount || 2,
        initialDirections: parameters.initialDirections,
        onProgress: (progress) => {
          job.progress(progress.progress || 0);
        }
      });

      const result = await solver.solve();
      return this.convertSolverResult(result);

    } catch (error) {
      console.error('Evolutionary Programming job failed:', error);
      throw error;
    }
  }

  /**
   * Process Genetic Programming job
   */
  private async processGeneticProgramming(job: Queue.Job): Promise<JobResult> {
    const { sequence, parameters } = job.data;
    
    try {
      const solver = new GeneticProgrammingSolver({
        sequence,
        maxIterations: parameters.maxIterations || 1000,
        populationSize: parameters.populationSize || 60,
        maxTreeDepth: parameters.maxTreeDepth || 4,
        crossoverRate: parameters.crossoverRate || 0.9,
        mutationRate: parameters.mutationRate || 0.2,
        eliteCount: parameters.eliteCount || 2,
        tournamentSize: parameters.tournamentSize || 3,
        initialDirections: parameters.initialDirections,
        onProgress: (progress) => {
          job.progress(progress.progress || 0);
        }
      });

      const result = await solver.solve();
      return this.convertSolverResult(result);

    } catch (error) {
      console.error('Genetic Programming job failed:', error);
      throw error;
    }
  }

  /**
   * Process Rosetta job (placeholder)
   */
  private async processRosetta(job: Queue.Job): Promise<JobResult> {
    const { sequence, parameters } = job.data;
    
    try {
      // TODO: Implement actual Rosetta integration
      // This is a placeholder that simulates a long-running job
      
      job.progress(10);
      await new Promise(resolve => setTimeout(resolve, 1000));
      
      job.progress(50);
      await new Promise(resolve => setTimeout(resolve, 1000));
      
      job.progress(90);
      await new Promise(resolve => setTimeout(resolve, 1000));
      
      job.progress(100);

      // Return a mock result for now
      return {
        bestConformation: {
          sequence,
          directions: ['R', 'U', 'L', 'D'],
          energy: -2,
          positions: [
            { x: 0, y: 0, z: 0 },
            { x: 1, y: 0, z: 0 },
            { x: 1, y: 1, z: 0 },
            { x: 0, y: 1, z: 0 },
            { x: 0, y: 0, z: 0 }
          ]
        },
        energyHistory: [
          { iteration: 0, energy: 0 },
          { iteration: 100, energy: -1 },
          { iteration: 200, energy: -2 }
        ],
        totalIterations: 200,
        convergenceTime: 3000,
        metadata: {
          algorithm: 'rosetta',
          version: '1.0.0',
          note: 'This is a placeholder result. Actual Rosetta integration coming soon.'
        }
      };

    } catch (error) {
      console.error('Rosetta job failed:', error);
      throw error;
    }
  }

  /**
   * Convert SolverResult to JobResult format
   */
  private convertSolverResult(solverResult: SolverResult): JobResult {
    return {
      bestConformation: {
        sequence: solverResult.bestConformation.sequence,
        directions: solverResult.bestConformation.directions,
        energy: solverResult.bestConformation.energy,
        positions: solverResult.bestConformation.positions
      },
      energyHistory: solverResult.energyHistory,
      totalIterations: solverResult.totalIterations,
      convergenceTime: solverResult.convergenceTime,
      metadata: {
        algorithm: 'fast-algorithm',
        processedAt: new Date().toISOString()
      }
    };
  }

  /**
   * Start the worker
   */
  async start(): Promise<void> {
    try {
      await this.queue.isReady();
      console.log('Protein Folding Worker started successfully');
    } catch (error) {
      console.error('Failed to start Protein Folding Worker:', error);
      throw error;
    }
  }

  /**
   * Stop the worker
   */
  async stop(): Promise<void> {
    try {
      await this.queue.close();
      console.log('Protein Folding Worker stopped successfully');
    } catch (error) {
      console.error('Error stopping Protein Folding Worker:', error);
    }
  }

  /**
   * Get worker statistics
   */
  async getStats(): Promise<{
    isReady: boolean;
    waiting: number;
    active: number;
    completed: number;
    failed: number;
  }> {
    try {
      const isReady = await this.queue.isReady();
      const [waiting, active, completed, failed] = await Promise.all([
        this.queue.getWaiting(),
        this.queue.getActive(),
        this.queue.getCompleted(),
        this.queue.getFailed()
      ]);

      return {
        isReady,
        waiting: waiting.length,
        active: active.length,
        completed: completed.length,
        failed: failed.length
      };
    } catch (error) {
      console.error('Failed to get worker stats:', error);
      return {
        isReady: false,
        waiting: 0,
        active: 0,
        completed: 0,
        failed: 0
      };
    }
  }
}

// Create and export worker instance
export const proteinFoldingWorker = new ProteinFoldingWorker();

export default ProteinFoldingWorker;
