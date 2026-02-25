import { EnergyCalculator } from "./energy-calculator";
import { BaseSolver, type SolverResult, type Conformation, type EvolutionaryProgrammingParameters } from "./types";
import type { Direction } from "../types";

/**
 * Tipul Individual pentru EP
 */
type Individual = {
  directions: Direction[];
  encoded:    Uint8Array;
  hpEnergy:   number;
  energy:     number;
};

/**
 * Clasa EvolutionaryProgrammingSolver - Implementează Programarea Evolutivă
 */
export class EvolutionaryProgrammingSolver extends BaseSolver {
  // Dimensiunea populației
  private populationSize: number;

  // Rata de mutație - probabilitatea de a schimba o direcție
  private mutationRate: number;

  // Dimensiunea turnirului pentru selecție
  private tournamentSize: number;

  // Numărul de indivizi de elită păstrați direct
  private eliteCount: number;

  // Populația curentă
  private population: Individual[] = [];

  /**
   * Constructor - Inițializează parametrii EP
   */
  constructor(parameters: EvolutionaryProgrammingParameters) {
    super(parameters);
    this.populationSize = parameters.populationSize;      // Ex: 50 indivizi
    this.mutationRate = parameters.mutationRate;          // Ex: 0.15 (15%)
    this.tournamentSize = parameters.tournamentSize;      // Ex: 3
    this.eliteCount = parameters.eliteCount ?? 2;         // Ex: 2 indivizi de elită
  }

  /**
   * METODA PRINCIPALĂ - Rulează algoritmul de Programare Evolutivă
   */
  async solve(): Promise<SolverResult> {
    const startTime = Date.now();
    const energyHistory: { iteration: number; energy: number }[] = [];

    // PASUL 1: INIȚIALIZARE - Creăm populația inițială aleatorie
    this.population = this.initializePopulation();

    // Găsim cel mai bun individ
    let best = this.getBest();
    energyHistory.push({ iteration: 0, energy: best.hpEnergy });

    // BUCLA PRINCIPALĂ - Evoluție
    for (let iteration = 1; iteration <= this.maxIterations; iteration++) {
      if (this.isStopped) break;
      if (this.hasReachedTarget(best.hpEnergy)) break;

      // PASUL 2: ELITISM - Copiem cei mai buni indivizi direct
      const next: Individual[] = this.getElites(this.eliteCount);

      // PASUL 3: Creăm restul populației prin selecție și mutație
      while (next.length < this.populationSize) {
        // SELECȚIE: Alegem un părinte prin turnir
        const parent = this.tournamentSelect();

        // MUTAȚIE: Creăm un copil prin mutația părintelui
        const childDirs = this.mutate(parent.directions);

        // EVALUARE: buffer-based for performance
        EnergyCalculator.calculatePositionsInto(
          this.sequence, childDirs, this.positionBuffer
        );
        const collisions = EnergyCalculator.countCollisionsInBuffer(
          this.positionBuffer, this.sequence.length
        );
        const hpEnergy = EnergyCalculator.calculateContactEnergyFromBuffer(
          this.sequence, this.positionBuffer
        );
        const child: Individual = {
          directions: childDirs,
          encoded:    this.encodeDirections(childDirs),
          hpEnergy,
          energy:     hpEnergy + collisions * 100,
        };

        // Adăugăm copilul în noua generație
        next.push(child);
      }

      // Înlocuim populația cu noua generație
      this.population = next;

      // Găsim cel mai bun din noua generație
      const currentBest = this.getBest();

      // Actualizăm cel mai bun global
      if (currentBest.energy < best.energy) {
        best = currentBest;
      }

      // Logging și UI — folosim hpEnergy pentru raportare
      if (iteration % this.logInterval === 0) {
        energyHistory.push({ iteration, energy: best.hpEnergy });
        this.onProgress?.({
          iteration,
          currentEnergy: currentBest.hpEnergy,
          bestEnergy: best.hpEnergy,
          progress: (iteration / this.maxIterations) * 100
        });
      }

      if (iteration % this.yieldInterval === 0) {
        await this.yieldToFrame();
      }
    }

    // Construim rezultatul final — energy = hpEnergy
    const endTime = Date.now();
    const bestConformation: Conformation = {
      sequence: this.sequence,
      directions: best.directions,
      positions: EnergyCalculator.calculatePositions(this.sequence, best.directions),
      energy: best.hpEnergy
    };

    return {
      bestConformation,
      energyHistory,
      totalIterations: this.maxIterations,
      convergenceTime: endTime - startTime
    };
  }

  /**
   * Inițializează populația — 20% greedy, 80% random SAW
   */
  private initializePopulation(): Individual[] {
    const arr: Individual[] = [];
    const greedyCount = Math.max(1, Math.floor(this.populationSize * 0.2));

    for (let i = 0; i < this.populationSize; i++) {
      const d = i < greedyCount
        ? this.generateGreedyDirections()
        : this.generateRandomDirections();
      EnergyCalculator.calculatePositionsInto(
        this.sequence, d, this.positionBuffer
      );
      const collisions = EnergyCalculator.countCollisionsInBuffer(
        this.positionBuffer, this.sequence.length
      );
      const hpEnergy = EnergyCalculator.calculateContactEnergyFromBuffer(
        this.sequence, this.positionBuffer
      );
      arr.push({
        directions: d,
        encoded:    this.encodeDirections(d),
        hpEnergy,
        energy:     hpEnergy + collisions * 100,
      });
    }

    return arr;
  }

  /**
   * SELECȚIE TURNIR
   * Alegem tournamentSize indivizi aleatoriu, cel mai bun câștigă
   */
  private tournamentSelect(): Individual {
    const picks: Individual[] = [];

    // Selectăm tournamentSize indivizi aleatoriu
    for (let i = 0; i < this.tournamentSize; i++) {
      const randomIndex = Math.floor(Math.random() * this.population.length);
      picks.push(this.population[randomIndex]);
    }

    // Returnăm cel mai bun din turnir
    return picks.reduce((b, c) => (c.energy < b.energy ? c : b), picks[0]);
  }

  private pivotMove(dirs: Direction[]): Direction[] {
    const result = dirs.slice();
    const n = result.length;
    if (n < 2) return result;

    const pivotIdx = 1 + Math.floor(Math.random() * (n - 1));

    const rotateCW: Record<Direction, Direction>  = { R: 'D', D: 'L', L: 'U', U: 'R', F: 'F', B: 'B' };
    const rotateCCW: Record<Direction, Direction> = { R: 'U', U: 'L', L: 'D', D: 'R', F: 'F', B: 'B' };
    const rotate = Math.random() < 0.5 ? rotateCW : rotateCCW;

    if (Math.random() < 0.5) {
      for (let i = pivotIdx; i < n; i++) result[i] = rotate[result[i]];
    } else {
      for (let i = 0; i < pivotIdx; i++) result[i] = rotate[result[i]];
    }

    return result;
  }

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
   * MUTAȚIE — pivot/pull moves + 10% point mutation
   */
  private mutate(genes: Direction[]): Direction[] {
    let dirs = genes.slice();
    const roll = Math.random();

    if (roll < 0.6) {
      dirs = this.pivotMove(dirs);
    } else if (roll < 0.9) {
      dirs = this.pullMove(dirs);
    } else {
      const idx     = Math.floor(Math.random() * dirs.length);
      const current = dirs[idx];
      const choices = this.possibleDirections.filter(d => d !== current);
      dirs[idx]     = choices[Math.floor(Math.random() * choices.length)];
    }

    return dirs as Direction[];
  }

  /**
   * ELITISM - Selectează cei mai buni k indivizi
   */
  private getElites(k: number): Individual[] {
    // Sortăm după energie și luăm primii k
    return [...this.population]
      .sort((a, b) => a.energy - b.energy)
      .slice(0, Math.min(k, this.population.length));
  }

  /**
   * Găsește cel mai bun individ din populație
   */
  private getBest(): Individual {
    return this.population.reduce((b, c) => (c.energy < b.energy ? c : b), this.population[0]);
  }
}
