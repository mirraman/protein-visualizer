// Importăm tipul Direction pentru direcțiile posibile
import { Direction } from "../types";

// Importăm clasele de bază și interfețele necesare
import { BaseSolver, SimulatedAnnealingParameters, SolverResult, Conformation, Position } from "./types";

// Importăm calculatorul de energie pentru modelul HP
import { EnergyCalculator } from "./energy-calculator";

/**
 * Clasa SimulatedAnnealingSolver - Implementează algoritmul Simulated Annealing
 */
export class SimulatedAnnealingSolver extends BaseSolver {
  // Temperatura inițială - controlează cât de mult explorăm la început
  private initialTemperature: number;

  // Temperatura finală - când oprim algoritmul (aproape de 0)
  private finalTemperature: number;

  // Rata de răcire - cât de repede scade temperatura
  private coolingRate: number;

  // Restart după N iterații fără îmbunătățire
  private stagnationWindow: number;

  /**
   * Constructor - Inițializează solver-ul cu parametrii de temperatură
   */
  constructor(parameters: SimulatedAnnealingParameters) {
    super(parameters);
    this.initialTemperature = parameters.initialTemperature;
    this.finalTemperature   = parameters.finalTemperature;
    this.stagnationWindow   = parameters.stagnationWindow ?? 300;

    // Auto-compute coolingRate so temperature reaches T_final
    // after one full stagnation cycle (stagnationWindow iterations).
    // This guarantees each restart cycle cools fully and independently.
    const itersPerCycle = this.stagnationWindow;
    this.coolingRate = Math.pow(
      this.finalTemperature / this.initialTemperature,
      1 / itersPerCycle
    );
  }

  /**
   * METODA PRINCIPALĂ - Rulează algoritmul Simulated Annealing
   */
  async solve(): Promise<SolverResult> {
    const startTime = Date.now();
    const energyHistory: { iteration: number; energy: number }[] = [];
    const stagnationWindow = this.stagnationWindow;

    // Global best — survives across restarts
    let bestHpEnergy  = Infinity;
    let bestDirections: Direction[] = [];

    // Current trajectory state — 50% greedy (better start -5..-7) vs 50% random (diversity)
    const useGreedy = Math.random() < 0.5;
    let currentDirections = useGreedy
      ? this.generateGreedyDirections()
      : this.generateRandomDirections();
    let currentHpEnergy   = EnergyCalculator.calculateHPEnergy(this.sequence, currentDirections);
    let currentFitness    = EnergyCalculator.calculateFitness(this.sequence, currentDirections, 100);
    let temperature       = this.initialTemperature;

    // Stagnation tracking
    let lastImprovedAt = 0;

    if (currentHpEnergy < bestHpEnergy) {
      bestHpEnergy   = currentHpEnergy;
      bestDirections = currentDirections.slice();
    }

    energyHistory.push({ iteration: 0, energy: bestHpEnergy });

    for (let iteration = 1; iteration <= this.maxIterations; iteration++) {
      if (this.isStopped) break;
      if (this.hasReachedTarget(bestHpEnergy)) break;

      // ── STAGNATION RESTART ─────────────────────────────────────
      // Iterated SA restart: perturb the best known solution (not random).
      // Apply 3-5 random pivot moves to bestDirections — this escapes the
      // local basin while staying close to a high-quality region.
      // Reference: Lourenco, Martin & Stützle (2003) Iterated Local Search.
      if (iteration - lastImprovedAt > stagnationWindow) {
        currentDirections = this.perturbBest(bestDirections);
        currentHpEnergy   = EnergyCalculator.calculateHPEnergy(this.sequence, currentDirections);
        currentFitness    = EnergyCalculator.calculateFitness(this.sequence, currentDirections, 100);
        temperature       = this.initialTemperature; // reheat fully
        lastImprovedAt    = iteration;
      }
      // ──────────────────────────────────────────────────────────

      const currentConformation: Conformation & { fitness: number } = {
        sequence: this.sequence,
        directions: currentDirections,
        energy: currentHpEnergy,
        positions: EnergyCalculator.calculatePositions(this.sequence, currentDirections),
        fitness: currentFitness
      };
      const neighbor = this.generateNeighbor(currentConformation, temperature);

      if (this.acceptMove(currentFitness, neighbor.fitness, temperature)) {
        currentDirections = neighbor.directions.slice();
        currentHpEnergy   = neighbor.energy;
        currentFitness    = neighbor.fitness;

        if (neighbor.energy < bestHpEnergy) {
          bestHpEnergy   = neighbor.energy;
          bestDirections = neighbor.directions.slice();
          lastImprovedAt = iteration;
        }
      }

      temperature = this.geometricCooling(temperature);

      if (iteration % this.logInterval === 0) {
        energyHistory.push({ iteration, energy: bestHpEnergy });
        this.onProgress?.({
          iteration,
          currentEnergy: currentHpEnergy,
          bestEnergy:    bestHpEnergy,
          progress:      (iteration / this.maxIterations) * 100,
        });
      }

      if (iteration % this.yieldInterval === 0) {
        await this.yieldToFrame();
      }
    }

    return {
      bestConformation: {
        sequence:   this.sequence,
        directions: bestDirections,
        positions:  EnergyCalculator.calculatePositions(this.sequence, bestDirections),
        energy:     bestHpEnergy,
      },
      energyHistory,
      totalIterations: this.maxIterations,
      convergenceTime: Date.now() - startTime,
    };
  }

  /**
   * Inițializează o conformație aleatoare
   * Generează direcții aleatorii și calculează energia rezultată
   */
  private initializeConformation(): Conformation {
    const directions = this.generateRandomDirections();
    return EnergyCalculator.createConformation(this.sequence, directions);
  }

  /**
   * Generates a neighbor conformation using structural moves.
   * Adaptive move distribution: hot phase favors large moves (pivot), cold phase
   * favors fine-grained moves (pull, singleFlip) to exploit near the current solution.
   */
  private generateNeighbor(
    conformation: Conformation & { fitness: number },
    temperature: number
  ): Conformation & { fitness: number } {
    const maxAttempts = 15;

    for (let attempt = 0; attempt < maxAttempts; attempt++) {
      const roll = Math.random();
      let newDirections: Direction[];

      if (temperature < 1.0) {
        // Cold phase — fine-grained moves to exploit near current solution
        if (roll < 0.25)      newDirections = this.pivotMove(conformation.directions);
        else if (roll < 0.55) newDirections = this.pullMove(conformation.directions);
        else                  newDirections = this.singleFlip(conformation.directions);
      } else {
        // Hot phase — large structural moves to explore broadly
        if (roll < 0.60)      newDirections = this.pivotMove(conformation.directions);
        else if (roll < 0.90) newDirections = this.pullMove(conformation.directions);
        else                  newDirections = this.singleFlip(conformation.directions);
      }

      const positions = EnergyCalculator.calculatePositions(this.sequence, newDirections);
      if (EnergyCalculator.countCollisions(positions) === 0) {
        return {
          sequence:   this.sequence,
          directions: newDirections,
          positions,
          energy:  EnergyCalculator.calculateHPEnergy(this.sequence, newDirections),
          fitness: EnergyCalculator.calculateFitness(this.sequence, newDirections, 100),
        };
      }
    }

    return conformation;
  }

  /**
   * Pivot move: picks a random pivot index and rotates either the head
   * segment [0..pivot] or the tail segment [pivot..end] by 90° CW or CCW.
   *
   * This is the standard move for 2D lattice protein folding — it rotates
   * a contiguous segment while keeping the rest fixed, producing a new
   * conformation that is very likely to be collision-free.
   */
  private pivotMove(dirs: Direction[]): Direction[] {
    const result = dirs.slice();
    const n = result.length;
    if (n < 2) return result;

    const pivotIdx = 1 + Math.floor(Math.random() * (n - 1));

    const rotateCW: Record<Direction, Direction>  = { R: 'D', D: 'L', L: 'U', U: 'R', F: 'F', B: 'B' };
    const rotateCCW: Record<Direction, Direction> = { R: 'U', U: 'L', L: 'D', D: 'R', F: 'F', B: 'B' };
    const rotate = Math.random() < 0.5 ? rotateCW : rotateCCW;

    if (Math.random() < 0.5) {
      // Rotate tail
      for (let i = pivotIdx; i < n; i++) result[i] = rotate[result[i]];
    } else {
      // Rotate head
      for (let i = 0; i < pivotIdx; i++) result[i] = rotate[result[i]];
    }

    return result;
  }

  /**
   * Pull move: reverses a short local segment (length 1–3) and flips
   * all directions in it 180°. Simulates pulling a loop inward.
   * Produces smaller structural changes than pivot — useful for
   * fine-tuning near a good conformation.
   */
  private pullMove(dirs: Direction[]): Direction[] {
    const result = dirs.slice();
    const n = result.length;
    if (n < 3) return result;

    const start = Math.floor(Math.random() * (n - 2));
    const len   = 1 + Math.floor(Math.random() * Math.min(3, n - start - 1));

    const flip: Record<Direction, Direction> = { R: 'L', L: 'R', U: 'D', D: 'U', F: 'B', B: 'F' };
    const segment = result.slice(start, start + len + 1).reverse().map(d => flip[d]);

    for (let i = 0; i <= len; i++) result[start + i] = segment[i];

    return result;
  }

  /**
   * Perturbs the best known solution by applying k random pivot moves.
   * Used for Iterated SA restarts — escapes the current basin while
   * preserving the structural quality of the best solution found.
   * k=4 is the sweet spot: enough to escape, not so much it becomes random.
   */
  private perturbBest(dirs: Direction[]): Direction[] {
    let result = dirs.slice();
    const perturbSteps = 4;

    for (let i = 0; i < perturbSteps; i++) {
      const candidate = this.pivotMove(result);
      const positions = EnergyCalculator.calculatePositions(this.sequence, candidate);
      if (EnergyCalculator.countCollisions(positions) === 0) {
        result = candidate;
      }
      // If pivot produces collision, skip it and try next step
    }
    return result;
  }

  /**
   * Single flip: changes one randomly chosen direction to another.
   * Kept as a minority move (10%) for very fine local search near
   * the end of the cooling schedule when T is almost 0.
   */
  private singleFlip(dirs: Direction[]): Direction[] {
    const result  = dirs.slice();
    const idx     = Math.floor(Math.random() * result.length);
    const current = result[idx];
    const choices = this.possibleDirections.filter(d => d !== current);
    result[idx]   = choices[Math.floor(Math.random() * choices.length)];
    return result;
  }

  /**
   * CRITERIUL METROPOLIS - Decide dacă acceptăm o mișcare
   * Compară fitness (HP + collision penalty), nu hpEnergy.
   * 
   * @param currentFitness - Fitness conformației curente
   * @param newFitness - Fitness conformației vecine
   * @param temperature - Temperatura curentă
   */
  private acceptMove(currentFitness: number, newFitness: number, temperature: number): boolean {
    // Dacă noua conformație e MAI BUNĂ (fitness mai mic) -> ACCEPTĂM întotdeauna
    if (newFitness < currentFitness) {
      return true;
    }

    // Dacă noua conformație e MAI PROASTĂ -> acceptăm cu probabilitate Boltzmann
    if (temperature > 0) {
      const acceptanceProbability = Math.exp((currentFitness - newFitness) / temperature);
      return Math.random() < acceptanceProbability;
    }

    return false;
  }

  /**
   * Geometric cooling: T = T * coolingRate each iteration.
   * This is the standard multiplicative schedule from Kirkpatrick et al. (1983).
   * Temperature is tracked as STATE in solve() — not recomputed from a formula.
   * This means stagnation restarts (setting T = T_init) work correctly.
   *
   * coolingRate = (T_final / T_init)^(1 / maxIterationsPerCycle)
   * For T_init=8, T_final=0.05, 300 iters per cycle: rate ≈ 0.9948
   */
  private geometricCooling(temperature: number): number {
    return Math.max(temperature * this.coolingRate, this.finalTemperature);
  }
}
