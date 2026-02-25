import { EnergyCalculator } from "./energy-calculator";
import { BaseSolver, type SolverResult, type Conformation, type GeneticProgrammingParameters } from "./types";
import type { Direction } from "../types";

/**
 * Tipul Program - În GP tradițional ar fi un arbore, aici e o secvență
 */
type Program = {
  directions: Direction[];
  fitness?: number;   // Fitness (HP + penalty) — pentru selecție
  hpEnergy?: number; // HP pură — pentru raportare
};

/**
 * Funcție helper - Generează o direcție aleatorie
 * @param possibleDirections - Lista de direcții posibile
 */
function randomDirection(possibleDirections: Direction[]): Direction {
  return possibleDirections[Math.floor(Math.random() * possibleDirections.length)];
}

/**
 * Creează un "program" aleatoriu (secvență de direcții)
 * @param length - Lungimea programului
 * @param possibleDirections - Direcțiile posibile
 */
function createRandomProgram(length: number, possibleDirections: Direction[]): Program {
  const dirs: Direction[] = [];
  for (let i = 0; i < length; i++) {
    dirs.push(randomDirection(possibleDirections));
  }
  return { directions: dirs };
}

/**
 * CROSSOVER GP-STYLE (Multi-punct cu segmente variabile)
 * 
 * DIFERENȚĂ FAȚĂ DE CROSSOVER GA:
 * - GA: UN punct de tăiere
 * - GP: 2-4 puncte de tăiere, schimbăm segmente ALTERNATIV
 * 
 * Exemplu cu 3 puncte (pozițiile 2, 5, 8):
 * Părinte A: [A A | A A A | A A A | A A]
 * Părinte B: [B B | B B B | B B B | B B]
 * Copil 1:   [A A | B B B | A A A | B B]  (alternează A, B, A, B)
 * Copil 2:   [B B | A A A | B B B | A A]  (alternează B, A, B, A)
 * 
 * Aceasta creează mai multă diversitate decât crossover-ul cu un singur punct.
 */
function gpCrossover(a: Program, b: Program): [Program, Program] {
  const len = Math.min(a.directions.length, b.directions.length);

  // Dacă programele sunt prea scurte, nu facem crossover
  if (len < 3) {
    return [{ directions: a.directions.slice() }, { directions: b.directions.slice() }];
  }

  // Generăm 2-4 puncte de tăiere aleatorii
  const numPoints = 2 + Math.floor(Math.random() * 3);
  const points: number[] = [];
  for (let i = 0; i < numPoints; i++) {
    points.push(Math.floor(Math.random() * len));
  }
  // Sortăm punctele crescător
  points.sort((x, y) => x - y);

  // Construim copiii alternând între părinți la fiecare punct
  const child1: Direction[] = [];
  const child2: Direction[] = [];
  let useA = true;  // Începem cu părintele A pentru copilul 1
  let pointIdx = 0;

  for (let i = 0; i < len; i++) {
    // Verificăm dacă am ajuns la un punct de tăiere
    if (pointIdx < points.length && i >= points[pointIdx]) {
      useA = !useA;  // Schimbăm părintele sursă
      pointIdx++;
    }
    // Adăugăm gena de la părintele curent
    child1.push(useA ? a.directions[i] : b.directions[i]);
    child2.push(useA ? b.directions[i] : a.directions[i]);
  }

  return [{ directions: child1 }, { directions: child2 }];
}

/**
 * MUTAȚIE GP-STYLE (Înlocuire segment + mutații punct)
 * 
 * DIFERENȚĂ FAȚĂ DE MUTAȚIE GA:
 * - GA: Schimbă gene individuale
 * - GP: Poate înlocui SEGMENTE întregi (subarbori în GP tradițional)
 * 
 * Operații:
 * 1. Cu 10% șansă: Înlocuim un segment de 1-4 gene consecutive
 * 2. Mutații punct: Schimbăm gene individuale cu probabilitate mutationRate
 */
function gpMutate(prog: Program, mutationRate: number, possibleDirections: Direction[]): Program {
  const dirs = prog.directions.slice();
  const len = dirs.length;

  // MUTAȚIE DE SEGMENT (10% șansă)
  // Aceasta simulează înlocuirea unui subarbore în GP tradițional
  if (Math.random() < 0.1 && len > 4) {
    // Alegem un punct de start aleatoriu
    const start = Math.floor(Math.random() * (len - 2));
    // Lungimea segmentului: 1-4 gene
    const segLen = 1 + Math.floor(Math.random() * Math.min(4, len - start));

    // Înlocuim segmentul cu direcții noi aleatorii
    for (let i = start; i < start + segLen; i++) {
      dirs[i] = randomDirection(possibleDirections);
    }
  }

  // MUTAȚII PUNCT (pentru fiecare genă cu probabilitate mutationRate)
  for (let i = 0; i < len; i++) {
    if (Math.random() < mutationRate) {
      const current = dirs[i];
      // Alegem o direcție diferită
      const choices: Direction[] = possibleDirections.filter(d => d !== current);
      dirs[i] = choices[Math.floor(Math.random() * choices.length)];
    }
  }

  return { directions: dirs };
}

/**
 * Clasa GeneticProgrammingSolver - Implementează Programarea Genetică
 */
export class GeneticProgrammingSolver extends BaseSolver {
  // Dimensiunea populației
  private populationSize: number;

  // Adâncimea maximă a "arborelui" (pentru GP tradițional, aici nu e folosit)
  private maxTreeDepth: number;

  // Rata de crossover
  private crossoverRate: number;

  // Rata de mutație
  private mutationRate: number;

  // Numărul de indivizi de elită
  private eliteCount: number;

  // Dimensiunea turnirului
  private tournamentSize: number;

  // Populația de programe
  private population: Program[] = [];

  /**
   * Constructor - Inițializează parametrii GP
   */
  constructor(parameters: GeneticProgrammingParameters) {
    super(parameters);
    this.populationSize = parameters.populationSize;      // Ex: 100
    this.maxTreeDepth = parameters.maxTreeDepth;          // Ex: 5 (pentru compatibilitate)
    this.crossoverRate = parameters.crossoverRate;        // Ex: 0.8
    this.mutationRate = parameters.mutationRate;          // Ex: 0.15
    this.eliteCount = parameters.eliteCount;              // Ex: 3
    this.tournamentSize = parameters.tournamentSize;      // Ex: 3
  }

  /**
   * METODA PRINCIPALĂ - Rulează algoritmul de Programare Genetică
   */
  async solve(): Promise<SolverResult> {
    const start = Date.now();
    const energyHistory: { iteration: number; energy: number }[] = [];

    // PASUL 1: Inițializăm populația cu programe aleatorii
    this.population = this.initializePopulation();

    // Evaluăm și găsim cel mai bun
    let best = this.evaluatePopulationAndGetBest();
    energyHistory.push({ iteration: 0, energy: best.energy });

    // BUCLA PRINCIPALĂ - Evoluție
    for (let iteration = 1; iteration <= this.maxIterations; iteration++) {
      if (this.isStopped) break;
      if (this.hasReachedTarget(best.energy)) break;

      // PASUL 2: ELITISM - Păstrăm cele mai bune programe
      const next: Program[] = this.getElitesPrograms(this.eliteCount);

      // PASUL 3: Creăm restul populației
      while (next.length < this.populationSize) {
        // SELECȚIE: Alegem doi părinți prin turnir
        const a = this.tournamentSelect();
        const b = this.tournamentSelect();

        // CROSSOVER GP: Cu probabilitate crossoverRate, aplicăm crossover multi-punct
        let [childA, childB] = Math.random() < this.crossoverRate
          ? gpCrossover(a, b)
          : [{ directions: a.directions.slice() }, { directions: b.directions.slice() }];

        // MUTAȚIE GP: Aplicăm mutație (segment + punct)
        if (Math.random() < this.mutationRate) {
          childA = gpMutate(childA, this.mutationRate, this.possibleDirections);
        }
        if (Math.random() < this.mutationRate) {
          childB = gpMutate(childB, this.mutationRate, this.possibleDirections);
        }

        // Adăugăm copiii în noua generație
        next.push(childA);
        if (next.length < this.populationSize) {
          next.push(childB);
        }
      }

      // Înlocuim populația
      this.population = next;

      // Evaluăm noua generație și găsim cel mai bun
      const currentBest = this.evaluatePopulationAndGetBest();

      // Actualizăm cel mai bun global (compară după fitness)
      if (currentBest.fitness < best.fitness) {
        best = currentBest;
      }

      // Logging și UI
      if (iteration % this.logInterval === 0) {
        energyHistory.push({ iteration, energy: best.energy });
        this.onProgress?.({
          iteration,
          currentEnergy: currentBest.energy,
          bestEnergy: best.energy,
          progress: (iteration / this.maxIterations) * 100
        });
      }

      if (iteration % this.yieldInterval === 0) {
        await this.yieldToFrame();
      }
    }

    // Construim rezultatul final
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
      convergenceTime: Date.now() - start
    };
  }

  /**
   * Inițializează populația — 20% greedy, 80% random
   */
  private initializePopulation(): Program[] {
    const arr: Program[] = [];
    const length = this.sequence.length - 1;
    const greedyCount = Math.max(1, Math.floor(this.populationSize * 0.2));

    for (let i = 0; i < this.populationSize; i++) {
      arr.push(i < greedyCount
        ? { directions: this.generateGreedyDirections() }
        : createRandomProgram(length, this.possibleDirections));
    }

    return arr;
  }

  /**
   * Evaluează toată populația și returnează cel mai bun individ
   * Fitness pentru selecție, hpEnergy pentru raportare
   */
  private evaluatePopulationAndGetBest(): { directions: Direction[]; energy: number; fitness: number } {
    let bestFitness = Number.POSITIVE_INFINITY;
    let bestDirs: Direction[] = [];
    let bestHpEnergy = 0;

    for (const p of this.population) {
      const hpEnergy = EnergyCalculator.calculateHPEnergy(this.sequence, p.directions);
      const fitness  = EnergyCalculator.calculateFitness(this.sequence, p.directions, 100);
      p.fitness = fitness;
      p.hpEnergy = hpEnergy;

      if (fitness < bestFitness) {
        bestFitness = fitness;
        bestDirs = p.directions.slice();
        bestHpEnergy = hpEnergy;
      }
    }

    return { directions: bestDirs, energy: bestHpEnergy, fitness: bestFitness };
  }

  /**
   * SELECȚIE TURNIR
   * Alegem tournamentSize programe, cel cu cel mai bun fitness câștigă
   */
  private tournamentSelect(): Program {
    const picks: Program[] = [];

    for (let i = 0; i < this.tournamentSize; i++) {
      const randomIndex = Math.floor(Math.random() * this.population.length);
      picks.push(this.population[randomIndex]);
    }

    // Returnăm cel cu fitness-ul minim (energia minimă)
    return picks.reduce((b, c) =>
      ((b.fitness ?? Infinity) <= (c.fitness ?? Infinity) ? b : c),
      picks[0]
    );
  }

  /**
   * ELITISM - Selectează cele mai bune k programe
   */
  private getElitesPrograms(k: number): Program[] {
    return [...this.population]
      .sort((a, b) => (a.fitness ?? Infinity) - (b.fitness ?? Infinity))
      .slice(0, Math.min(k, this.population.length));
  }
}
