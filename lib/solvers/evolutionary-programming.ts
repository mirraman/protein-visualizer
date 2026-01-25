import { EnergyCalculator } from "./energy-calculator";
import { BaseSolver, type SolverResult, type Conformation, type EvolutionaryProgrammingParameters } from "./types";
import type { Direction } from "../types";

/**
 * Tipul Individual pentru EP
 */
type Individual = {
  directions: Direction[];  // Conformația - secvența de direcții
  energy: number;           // Fitness-ul - energia
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
    energyHistory.push({ iteration: 0, energy: best.energy });

    // Intervalele pentru logging
    const logInterval = Math.max(1, Math.floor(this.maxIterations / 2000));
    const yieldInterval = Math.max(1, Math.floor(this.maxIterations / 1000));

    // BUCLA PRINCIPALĂ - Evoluție
    for (let iteration = 1; iteration <= this.maxIterations; iteration++) {
      if (this.isStopped) break;

      // PASUL 2: ELITISM - Copiem cei mai buni indivizi direct
      const next: Individual[] = this.getElites(this.eliteCount);

      // PASUL 3: Creăm restul populației prin selecție și mutație
      while (next.length < this.populationSize) {
        // SELECȚIE: Alegem un părinte prin turnir
        const parent = this.tournamentSelect();

        // MUTAȚIE: Creăm un copil prin mutația părintelui
        const childDirs = this.mutate(parent.directions);

        // EVALUARE: Calculăm fitness-ul copilului
        const child: Individual = {
          directions: childDirs,
          energy: EnergyCalculator.calculateEnergy(this.sequence, childDirs)
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

      // Logging și UI
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

    // Construim rezultatul final
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

  /**
   * Inițializează populația cu indivizi aleatorii
   */
  private initializePopulation(): Individual[] {
    const arr: Individual[] = [];

    for (let i = 0; i < this.populationSize; i++) {
      // Generăm direcții aleatorii
      const d = this.generateRandomDirections();
      // Calculăm energia și creăm individul
      arr.push({
        directions: d,
        energy: EnergyCalculator.calculateEnergy(this.sequence, d)
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

  /**
   * MUTAȚIE
   * Pentru fiecare direcție, cu probabilitate mutationRate, o schimbăm
   * 
   * În EP tradițional, mutația e adesea Gaussiană pentru valori continue.
   * Pentru reprezentarea noastră discretă (direcții), folosim mutație uniformă.
   * 
   * @param genes - Secvența de direcții a părintelui
   * @returns Direction[] - Secvența mutată pentru copil
   */
  private mutate(genes: Direction[]): Direction[] {
    // Copiem direcțiile părintelui
    const dirs = genes.slice();

    // Alfabetul de direcții posibile
    const alphabet: Direction[] = this.possibleDirections;

    // Pentru fiecare direcție
    for (let i = 0; i < dirs.length; i++) {
      // Cu probabilitate mutationRate
      if (Math.random() < this.mutationRate) {
        // Schimbăm direcția cu alta diferită
        const current = dirs[i];
        const choices = alphabet.filter(d => d !== current);
        dirs[i] = choices[Math.floor(Math.random() * choices.length)];
      }
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
