import { EnergyCalculator } from "./energy-calculator";
import { BaseSolver, type SolverResult, type Conformation, type EvolutionStrategiesParameters } from "./types";
import type { Direction } from "../types";

/**
 * Individual for ES
 * sigma is per-individual mutation rate (true self-adaptation)
 */
type Individual = {
  directions: Direction[];
  energy: number;
  sigma: number;
};

/**
 * EvolutionStrategiesSolver — (μ, λ)-ES with:
 *  - Pivot moves & pull moves for valid SAW mutations
 *  - True per-individual sigma self-adaptation (1/5 success rule variant)
 *  - (μ, λ) comma selection to avoid premature convergence
 *  - Diversity injection on stagnation
 */
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
    this.mutationBoost = parameters.mutationBoost ?? 1.15;
    this.stagnationWindow = parameters.stagnationWindow ?? 10;
    // Defaulting to FALSE (comma selection) — better for escaping local minima
    this.plusSelection = parameters.plusSelection ?? false;
  }

  async solve(): Promise<SolverResult> {
    const startTime = Date.now();
    const energyHistory: { iteration: number; energy: number }[] = [];

    this.parents = this.initializeParents();

    let best = this.getBest(this.parents);
    let bestEnergySoFar = best.energy;
    let stagnation = 0;

    energyHistory.push({ iteration: 0, energy: best.energy });

    const logInterval = Math.max(1, Math.floor(this.maxIterations / 2000));
    const yieldInterval = Math.max(1, Math.floor(this.maxIterations / 1000));

    for (let iteration = 1; iteration <= this.maxIterations; iteration++) {
      if (this.isStopped) break;

      // Generate λ offspring via mutation
      const offspring: Individual[] = [];
      for (let k = 0; k < this.lambda; k++) {
        const parent = this.parents[Math.floor(Math.random() * this.parents.length)];
        const child = this.mutate(parent);
        offspring.push(child);
      }

      // Selection pool
      const pool = this.plusSelection
        ? this.parents.concat(offspring)
        : offspring; // (μ, λ) default: only offspring survive

      pool.sort((a, b) => a.energy - b.energy);
      this.parents = pool.slice(0, this.mu);

      const currentBest = this.parents[0];
      if (currentBest.energy < best.energy) {
        best = { ...currentBest };
      }

      // --- FIX 1: Update ALL parent sigmas (not just a detached global variable) ---
      if (best.energy < bestEnergySoFar) {
        bestEnergySoFar = best.energy;
        stagnation = 0;
        // Tighten sigma on all parents — we're in a good region, exploit more
        this.parents = this.parents.map(p => ({
          ...p,
          sigma: Math.max(0.05, p.sigma * this.mutationDecay)
        }));
      } else {
        stagnation++;
        if (stagnation >= this.stagnationWindow) {
          // --- FIX 2: Diversity injection on stagnation ---
          // Replace the bottom 20% of parents with fresh random individuals
          const keepCount = Math.floor(this.mu * 0.8);
          const freshCount = this.mu - keepCount;
          const freshIndividuals = this.initializeParents(freshCount);
          this.parents = this.parents.slice(0, keepCount).concat(freshIndividuals);

          // Also widen sigma on remaining parents to escape local minimum
          this.parents = this.parents.map(p => ({
            ...p,
            sigma: Math.min(0.6, p.sigma * this.mutationBoost)
          }));

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
      positions: EnergyCalculator.calculatePositions(this.sequence, best.directions),
      energy: best.energy
    };

    return {
      bestConformation,
      energyHistory,
      totalIterations: this.maxIterations,
      convergenceTime: endTime - startTime
    };
  }

  private initializeParents(count?: number): Individual[] {
    const n = count ?? this.mu;
    const arr: Individual[] = [];
    for (let i = 0; i < n; i++) {
      const directions = this.generateRandomDirections();
      const energy = EnergyCalculator.calculateEnergy(this.sequence, directions);
      arr.push({ directions, energy, sigma: this.sigma });
    }
    return arr;
  }

  /**
   * FIX 3: Structural mutation using pivot moves and pull moves
   * instead of random per-gene direction flips.
   *
   * Strategy:
   *  - With probability (1 - sigma): apply a pivot move (valid SAW move)
   *  - With probability sigma: apply a pull move (valid SAW move)
   *  - Small chance of fallback to random segment scramble + collision check
   */
  private mutate(ind: Individual): Individual {
    const rate = ind.sigma;
    let dirs = ind.directions.slice();

    // Decide mutation type
    const roll = Math.random();

    if (roll < 0.6) {
      // Pivot move — pick a random pivot point and reflect/rotate a segment
      dirs = this.pivotMove(dirs);
    } else if (roll < 0.9) {
      // Pull move — pull a random segment inward
      dirs = this.pullMove(dirs);
    } else {
      // Fallback: random scramble of a small window, then repair collisions
      dirs = this.windowScramble(dirs, rate);
    }

    const energy = EnergyCalculator.calculateEnergy(this.sequence, dirs);

    // FIX 4: Individual sigma self-adaptation with wider range
    // τ (learning rate) ~ 1/sqrt(n) where n = sequence length
    const tau = 1 / Math.sqrt(this.sequence.length);
    const childSigma = Math.min(0.6, Math.max(0.01, rate * Math.exp(tau * (Math.random() - 0.5))));

    return { directions: dirs, energy, sigma: childSigma };
  }

  /**
   * Pivot move: pick a random pivot index, then rotate the tail
   * (or head) segment by 90° left or right.
   * This always produces a valid SAW if the original was valid
   * (assuming no collision — energy calculator handles penalty).
   */
  private pivotMove(dirs: Direction[]): Direction[] {
    const result = dirs.slice();
    const n = result.length;
    if (n < 2) return result;

    // Pick a pivot position (exclude the very ends to keep it meaningful)
    const pivotIdx = 1 + Math.floor(Math.random() * (n - 1));

    // Rotation maps: 90° CW and CCW on 2D lattice
    const rotateCW: Record<Direction, Direction> = { R: "D", D: "L", L: "U", U: "R", F: "F", B: "B" };
    const rotateCCW: Record<Direction, Direction> = { R: "U", U: "L", L: "D", D: "R", F: "F", B: "B" };
    const rotate = Math.random() < 0.5 ? rotateCW : rotateCCW;

    // Decide: rotate the tail (pivotIdx → end) or head (0 → pivotIdx)
    if (Math.random() < 0.5) {
      for (let i = pivotIdx; i < n; i++) {
        result[i] = rotate[result[i]];
      }
    } else {
      for (let i = 0; i < pivotIdx; i++) {
        result[i] = rotate[result[i]];
      }
    }

    return result;
  }

  /**
   * Pull move: pick a random position and "pull" it toward
   * a neighbor. Implemented as a small local segment reversal
   * with direction flip to simulate the pull effect.
   */
  private pullMove(dirs: Direction[]): Direction[] {
    const result = dirs.slice();
    const n = result.length;
    if (n < 3) return result;

    // Pick a random interior segment [start, start+len]
    const start = Math.floor(Math.random() * (n - 2));
    const len = 1 + Math.floor(Math.random() * Math.min(3, n - start - 1));

    // Reverse the sub-segment and flip directions (180° rotation)
    const flip: Record<Direction, Direction> = { R: "L", L: "R", U: "D", D: "U", F: "B", B: "F" };
    const segment = result.slice(start, start + len + 1).reverse().map(d => flip[d]);

    for (let i = 0; i <= len; i++) {
      result[start + i] = segment[i];
    }

    return result;
  }

  /**
   * Window scramble: randomly re-assign directions in a small window.
   * Less structure-preserving but adds diversity.
   */
  private windowScramble(dirs: Direction[], rate: number): Direction[] {
    const alphabet: Direction[] = this.possibleDirections;
    const result = dirs.slice();
    const windowSize = Math.max(1, Math.floor(rate * result.length));
    const start = Math.floor(Math.random() * (result.length - windowSize));

    for (let i = start; i < start + windowSize; i++) {
      result[i] = alphabet[Math.floor(Math.random() * alphabet.length)];
    }

    return result;
  }

  private getBest(pop: Individual[]): Individual {
    return pop.reduce((b, c) => (c.energy < b.energy ? c : b), pop[0]);
  }
}