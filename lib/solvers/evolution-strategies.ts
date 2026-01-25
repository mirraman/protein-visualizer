import { EnergyCalculator } from "./energy-calculator";
import { BaseSolver, type SolverResult, type Conformation, type EvolutionStrategiesParameters } from "./types";
import type { Direction } from "../types";

/**
 * Tipul Individual pentru ES
 * Include sigma - rata de mutație specifică individului (auto-adaptare)
 */
type Individual = {
  directions: Direction[];  // Cromozomul - secvența de direcții
  energy: number;           // Fitness-ul - energia
  sigma: number;            // Rata de mutație individuală (pentru auto-adaptare)
};

/**
 * Clasa EvolutionStrategiesSolver - Implementează (μ + λ)-ES cu auto-adaptare
 */
export class EvolutionStrategiesSolver extends BaseSolver {
  // μ (mu) - numărul de părinți
  private mu: number;

  // λ (lambda) - numărul de copii generați per generație
  private lambda: number;

  // σ (sigma) - rata globală de mutație
  private sigma: number;

  // Factorul de reducere a sigma când găsim îmbunătățiri
  private mutationDecay: number;

  // Factorul de creștere a sigma când stagnăm
  private mutationBoost: number;

  // Numărul de generații fără îmbunătățire înainte de a crește sigma
  private stagnationWindow: number;

  // Dacă folosim (μ + λ) sau (μ, λ)
  // true = (μ + λ): părinții competiție cu copiii
  // false = (μ, λ): doar copiii sunt considerați
  private plusSelection: boolean;

  // Populația de părinți
  private parents: Individual[] = [];

  /**
   * Constructor - Inițializează parametrii ES
   */
  constructor(parameters: EvolutionStrategiesParameters) {
    super(parameters);
    this.mu = parameters.mu;                                    // Ex: 15 părinți
    this.lambda = parameters.lambda;                            // Ex: 100 copii
    this.sigma = parameters.initialMutationRate;                // Ex: 0.3 (30%)
    this.mutationDecay = parameters.mutationDecay ?? 0.97;      // Reduce sigma cu 3%
    this.mutationBoost = parameters.mutationBoost ?? 1.1;       // Crește sigma cu 10%
    this.stagnationWindow = parameters.stagnationWindow ?? 10;  // 10 generații stagnare
    this.plusSelection = parameters.plusSelection ?? true;      // Folosim (μ + λ)
  }

  /**
   * METODA PRINCIPALĂ - Rulează algoritmul (μ + λ)-ES
   */
  async solve(): Promise<SolverResult> {
    const startTime = Date.now();
    const energyHistory: { iteration: number; energy: number }[] = [];

    // PASUL 1: Inițializăm μ părinți aleatoriu
    this.parents = this.initializeParents();

    // Găsim cel mai bun părinte
    let best = this.getBest(this.parents);
    let bestEnergySoFar = best.energy;  // Pentru detectarea stagnării
    let stagnation = 0;                  // Contor de stagnare

    energyHistory.push({ iteration: 0, energy: best.energy });

    // Intervalele pentru logging
    const logInterval = Math.max(1, Math.floor(this.maxIterations / 2000));
    const yieldInterval = Math.max(1, Math.floor(this.maxIterations / 1000));

    // BUCLA PRINCIPALĂ - Evoluție
    for (let iteration = 1; iteration <= this.maxIterations; iteration++) {
      if (this.isStopped) break;

      // PASUL 2: Generăm λ copii prin mutație
      const offspring: Individual[] = [];
      for (let k = 0; k < this.lambda; k++) {
        // Alegem un părinte aleatoriu
        const parent = this.parents[Math.floor(Math.random() * this.parents.length)];
        // Creăm un copil prin mutația părintelui
        const child = this.mutate(parent);
        offspring.push(child);
      }

      // PASUL 3: SELECȚIE
      // Creăm pool-ul de selecție (depinde de tipul ES)
      const pool = this.plusSelection
        ? this.parents.concat(offspring)  // (μ + λ): părinți + copii
        : offspring;                       // (μ, λ): doar copii

      // Sortăm după fitness (energie crescătoare)
      pool.sort((a, b) => a.energy - b.energy);

      // Selectăm cei mai buni μ indivizi ca noii părinți
      this.parents = pool.slice(0, this.mu);

      // Cel mai bun din generația curentă
      const currentBest = this.parents[0];

      // Actualizăm cel mai bun global
      if (currentBest.energy < best.energy) {
        best = currentBest;
      }

      // PASUL 4: AUTO-ADAPTARE SIGMA
      // Verificăm dacă am găsit o îmbunătățire
      if (best.energy < bestEnergySoFar) {
        // Am găsit ceva mai bun!
        bestEnergySoFar = best.energy;
        stagnation = 0;  // Resetăm contorul de stagnare

        // REDUCEM sigma - suntem într-o zonă bună, explorăm mai fin
        this.sigma = Math.max(0.01, this.sigma * this.mutationDecay);
      } else {
        // Nu am găsit îmbunătățire
        stagnation++;

        // Dacă am stagnat prea mult
        if (stagnation >= this.stagnationWindow) {
          // CREȘTEM sigma - trebuie să explorăm mai mult
          this.sigma = Math.min(0.5, this.sigma * this.mutationBoost);
          stagnation = 0;  // Resetăm contorul
        }
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
   * Inițializează μ părinți aleatoriu
   * Fiecare părinte primește sigma inițial
   */
  private initializeParents(): Individual[] {
    const arr: Individual[] = [];

    for (let i = 0; i < this.mu; i++) {
      // Generăm direcții aleatorii
      const directions = this.generateRandomDirections();
      // Calculăm energia
      const energy = EnergyCalculator.calculateEnergy(this.sequence, directions);
      // Creăm individul cu sigma inițial
      arr.push({ directions, energy, sigma: this.sigma });
    }

    return arr;
  }

  /**
   * MUTAȚIE cu auto-adaptare sigma
   * 
   * Fiecare copil:
   * 1. Moștenește sigma de la părinte
   * 2. Își adaptează propriul sigma (variație mică)
   * 3. Aplică mutații cu rata proprie sigma
   * 
   * @param ind - Părintele de mutat
   * @returns Individual - Copilul rezultat
   */
  private mutate(ind: Individual): Individual {
    // Alfabetul de direcții posibile
    const alphabet: Direction[] = this.possibleDirections;

    // Copiem direcțiile părintelui
    const dirs = ind.directions.slice();

    // Folosim rata de mutație a părintelui
    const rate = ind.sigma;

    // Aplicăm mutații pe fiecare genă
    for (let i = 0; i < dirs.length; i++) {
      // Cu probabilitate rate, mutăm gena
      if (Math.random() < rate) {
        const current = dirs[i];
        // Alegem o altă direcție (diferită de cea curentă)
        const choices = alphabet.filter(d => d !== current);
        dirs[i] = choices[Math.floor(Math.random() * choices.length)];
      }
    }

    // Calculăm energia noii conformații
    const energy = EnergyCalculator.calculateEnergy(this.sequence, dirs);

    // AUTO-ADAPTARE: Copilul își ajustează propriul sigma
    // Variație aleatorie între 0.9 și 1.1 * sigma părinte
    // Aceasta permite evoluția parametrilor de mutație împreună cu soluțiile
    const childSigma = Math.min(0.5, Math.max(0.01, rate * (0.9 + Math.random() * 0.2)));

    return { directions: dirs, energy, sigma: childSigma };
  }

  /**
   * Găsește cel mai bun individ dintr-o populație
   * @param pop - Populația de căutat
   * @returns Individual - Cel mai bun (energia minimă)
   */
  private getBest(pop: Individual[]): Individual {
    return pop.reduce((b, c) => (c.energy < b.energy ? c : b), pop[0]);
  }
}
