/**
 * =============================================================================
 * ALGORITM GENETIC (GA) PENTRU PLIEREA PROTEINELOR
 * =============================================================================
 * 
 * Algoritmul Genetic este inspirat din teoria evoluției lui Darwin:
 * "Supraviețuirea celui mai adaptat" (survival of the fittest)
 * 
 * PRINCIPIUL DE FUNCȚIONARE:
 * 1. INIȚIALIZARE: Creăm o populație de indivizi (conformații) aleatorii
 * 2. EVALUARE: Calculăm fitness-ul fiecărui individ (energia - mai mică = mai bună)
 * 3. SELECȚIE: Alegem părinții pentru reproducere (cei mai buni au șanse mai mari)
 * 4. ÎNCRUCIȘARE (Crossover): Combinăm genele a doi părinți pentru a crea copii
 * 5. MUTAȚIE: Modificăm aleatoriu unele gene pentru diversitate
 * 6. ELITISM: Păstrăm cei mai buni indivizi în generația următoare
 * 7. Repetăm pașii 2-6 până la convergență
 * 
 * OPERATORI GENETICI:
 * - SELECȚIE TURNIR: Alegem k indivizi aleatoriu, cel mai bun câștigă
 * - CROSSOVER UN-PUNCT: Tăiem cromozomii într-un punct și schimbăm părțile
 * - MUTAȚIE: Schimbăm o genă (direcție) cu o altă valoare aleatorie
 * 
 * TERMINOLOGIE:
 * - Cromozom/Individ = o conformație (secvență de direcții)
 * - Genă = o direcție individuală (L, R, U, D, F, B)
 * - Fitness = calitatea soluției (energia - mai mică = mai bună)
 * - Generație = o iterație completă a algoritmului
 * =============================================================================
 */

// Importăm calculatorul de energie
import { EnergyCalculator } from "./energy-calculator";

// Importăm clasele de bază și tipurile
import { BaseSolver, type SolverResult, type Conformation, type GeneticAlgorithmParameters } from "./types";
import type { Direction } from "../types";

/**
 * Tipul Individual - Reprezintă un cromozom în algoritm
 * Conține direcțiile (genele) și energia (fitness-ul)
 */
type Individual = {
  directions: Direction[];  // Cromozomul - secvența de direcții
  energy: number;           // Fitness-ul - energia (mai mică = mai bună)
};

/**
 * Clasa GeneticAlgorithmSolver - Implementează Algoritmul Genetic simplu
 */
export class GeneticAlgorithmSolver extends BaseSolver {
  // Dimensiunea populației - câți indivizi avem în fiecare generație
  private populationSize: number;
  
  // Rata de crossover - probabilitatea de a face încrucișare (ex: 0.9 = 90%)
  private crossoverRate: number;
  
  // Rata de mutație - probabilitatea de a muta o genă (ex: 0.1 = 10%)
  private mutationRate: number;
  
  // Numărul de elită - câți dintre cei mai buni sunt copiați direct
  private eliteCount: number;
  
  // Dimensiunea turnirului - câți indivizi participă la selecție
  private tournamentSize: number;

  // Populația curentă de indivizi
  private population: Individual[] = [];

  /**
   * Constructor - Inițializează algoritmul cu parametrii genetici
   */
  constructor(parameters: GeneticAlgorithmParameters) {
    super(parameters);
    this.populationSize = parameters.populationSize;      // Ex: 100 indivizi
    this.crossoverRate = parameters.crossoverRate;        // Ex: 0.9 (90%)
    this.mutationRate = parameters.mutationRate;          // Ex: 0.1 (10%)
    this.eliteCount = parameters.eliteCount;              // Ex: 3 indivizi
    this.tournamentSize = parameters.tournamentSize;      // Ex: 3 indivizi
  }

  /**
   * METODA PRINCIPALĂ - Rulează Algoritmul Genetic
   */
  async solve(): Promise<SolverResult> {
    const startTime = Date.now();
    const energyHistory: { iteration: number; energy: number }[] = [];

    // PASUL 1: INIȚIALIZARE - Creăm populația inițială
    this.population = this.initializePopulation();

    // Găsim cel mai bun individ din populația inițială
    let best = this.getBestIndividual();
    energyHistory.push({ iteration: 0, energy: best.energy });

    // Calculăm intervalele pentru logging și UI
    const logInterval = Math.max(1, Math.floor(this.maxIterations / 2000));
    const yieldInterval = Math.max(1, Math.floor(this.maxIterations / 1000));

    // BUCLA PRINCIPALĂ - Evoluție pe generații
    for (let iteration = 1; iteration <= this.maxIterations; iteration++) {
      // Verificăm dacă s-a cerut oprirea
      if (this.isStopped) break;

      // PASUL 2: ELITISM - Copiem cei mai buni indivizi direct în noua generație
      // Aceștia nu sunt modificați - păstrăm cele mai bune soluții găsite
      const nextPopulation: Individual[] = this.getElites(this.eliteCount);

      // PASUL 3: CREĂM RESTUL POPULAȚIEI prin selecție, crossover și mutație
      while (nextPopulation.length < this.populationSize) {
        // SELECȚIE: Alegem doi părinți prin turnir
        const parentA = this.tournamentSelect();  // Primul părinte
        const parentB = this.tournamentSelect();  // Al doilea părinte

        // CROSSOVER: Combinăm genele părinților pentru a crea doi copii
        let [childDirsA, childDirsB] = this.maybeCrossover(parentA.directions, parentB.directions);

        // MUTAȚIE: Aplicăm mutații aleatorii pe genele copiilor
        childDirsA = this.mutate(childDirsA);
        childDirsB = this.mutate(childDirsB);

        // EVALUARE: Calculăm fitness-ul (energia) copiilor
        const childA: Individual = {
          directions: childDirsA,
          energy: EnergyCalculator.calculateEnergy(this.sequence, childDirsA)
        };
        const childB: Individual = {
          directions: childDirsB,
          energy: EnergyCalculator.calculateEnergy(this.sequence, childDirsB)
        };

        // Adăugăm copiii în noua generație
        nextPopulation.push(childA);
        if (nextPopulation.length < this.populationSize) {
          nextPopulation.push(childB);
        }
      }

      // Înlocuim vechea generație cu cea nouă
      this.population = nextPopulation;
      
      // Găsim cel mai bun individ din noua generație
      const currentBest = this.getBestIndividual();
      
      // Actualizăm cel mai bun global dacă am găsit ceva mai bun
      if (currentBest.energy < best.energy) {
        best = currentBest;
      }

      // Logging și actualizare UI la intervale regulate
      if (iteration % logInterval === 0) {
        energyHistory.push({ iteration, energy: best.energy });
        this.onProgress?.({
          iteration,
          currentEnergy: currentBest.energy,
          bestEnergy: best.energy,
          progress: (iteration / this.maxIterations) * 100
        });
      }

      // Cedăm controlul browser-ului
      if (iteration % yieldInterval === 0) {
        await new Promise(resolve => setTimeout(resolve, 0));
      }
    }

    // Construim conformația finală pentru rezultat
    const endTime = Date.now();
    const bestConformation: Conformation = {
      sequence: this.sequence,
      directions: best.directions,
      positions: EnergyCalculator["calculatePositions" as any]
        ? (EnergyCalculator as any).calculatePositions(this.sequence, best.directions)
        : [],
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
   * Fiecare individ are un cromozom (direcții) generat aleatoriu
   */
  private initializePopulation(): Individual[] {
    const individuals: Individual[] = [];
    
    // Creăm populationSize indivizi
    for (let i = 0; i < this.populationSize; i++) {
      // Generăm un cromozom aleatoriu
      const directions = this.generateInitialDirections();
      // Calculăm fitness-ul (energia)
      const energy = EnergyCalculator.calculateEnergy(this.sequence, directions);
      // Adăugăm individul în populație
      individuals.push({ directions, energy });
    }
    
    return individuals;
  }

  /**
   * Generează direcții inițiale pentru un cromozom
   * Lungimea = lungimea secvenței - 1 (între aminoacizi consecutivi)
   */
  private generateInitialDirections(): Direction[] {
    const length = this.sequence.length - 1;
    // Generăm direcții aleatorii
    const base = this.generateRandomDirections();
    // Ne asigurăm că avem lungimea corectă
    return base.slice(0, length);
  }

  /**
   * ELITISM - Selectează cei mai buni k indivizi
   * Aceștia sunt copiați direct în noua generație fără modificări
   * 
   * @param k - Numărul de elită de selectat
   * @returns Array cu cei mai buni k indivizi
   */
  private getElites(k: number): Individual[] {
    // Sortăm populația după energie (crescător - cei mai buni primii)
    // și luăm primii k indivizi
    return [...this.population]
      .sort((a, b) => a.energy - b.energy)
      .slice(0, Math.min(k, this.population.length));
  }

  /**
   * SELECȚIE TURNIR - Selectează un părinte pentru reproducere
   * 
   * PRINCIPIU:
   * 1. Alegem tournamentSize indivizi aleatoriu din populație
   * 2. Cel cu cel mai bun fitness (energie minimă) câștigă
   * 
   * Avantaj: presiune de selecție ajustabilă prin dimensiunea turnirului
   * - Turnir mare (5-10) = presiune mare (doar cei foarte buni se reproduc)
   * - Turnir mic (2-3) = presiune mică (și indivizii mediocri au șanse)
   */
  private tournamentSelect(): Individual {
    const picks: Individual[] = [];
    
    // Alegem tournamentSize indivizi aleatoriu
    for (let i = 0; i < this.tournamentSize; i++) {
      const idx = Math.floor(Math.random() * this.population.length);
      picks.push(this.population[idx]);
    }
    
    // Returnăm cel mai bun din turnir (energia minimă)
    return picks.reduce((best, cur) => 
      (cur.energy < best.energy ? cur : best), 
      picks[0]
    );
  }

  /**
   * CROSSOVER UN-PUNCT (One-Point Crossover)
   * 
   * PRINCIPIU:
   * 1. Cu probabilitate crossoverRate, facem încrucișare
   * 2. Alegem un punct aleatoriu în cromozom
   * 3. Copilul 1 = prima parte din A + a doua parte din B
   *    Copilul 2 = prima parte din B + a doua parte din A
   * 
   * Exemplu (punct = 3):
   * Părinte A: [L, R, U, D, L, R]
   * Părinte B: [R, D, L, U, R, D]
   * Copil 1:   [L, R, U, | U, R, D]  (A până la 3, B de la 3)
   * Copil 2:   [R, D, L, | D, L, R]  (B până la 3, A de la 3)
   * 
   * @returns Tuplu cu direcțiile celor doi copii
   */
  private maybeCrossover(a: Direction[], b: Direction[]): [Direction[], Direction[]] {
    // Cu probabilitate (1 - crossoverRate), nu facem crossover
    if (Math.random() > this.crossoverRate) {
      return [a.slice(), b.slice()];  // Returnăm copii ai părinților
    }
    
    // Calculăm lungimea minimă (pentru siguranță)
    const length = Math.min(a.length, b.length);
    
    // Dacă cromozomul e prea scurt, nu putem face crossover
    if (length < 2) {
      return [a.slice(), b.slice()];
    }
    
    // Alegem punctul de tăiere aleatoriu (între 1 și length-1)
    const point = 1 + Math.floor(Math.random() * (length - 1));
    
    // Creăm copiii prin schimbul părților
    const childA = a.slice(0, point).concat(b.slice(point));  // A[0..point] + B[point..end]
    const childB = b.slice(0, point).concat(a.slice(point));  // B[0..point] + A[point..end]
    
    return [childA as Direction[], childB as Direction[]];
  }

  /**
   * MUTAȚIE - Modifică aleatoriu genele unui cromozom
   * 
   * PRINCIPIU:
   * Pentru fiecare genă (direcție), cu probabilitate mutationRate:
   * - Înlocuim gena cu o altă valoare aleatorie diferită
   * 
   * ROL: Introduce diversitate în populație, previne convergența prematură
   * 
   * @param genes - Cromozomul de mutat
   * @returns Cromozomul mutat
   */
  private mutate(genes: Direction[]): Direction[] {
    // Copiem genele (nu modificăm originalul)
    const dirs: Direction[] = genes.slice();
    
    // Alfabetul de gene (direcțiile posibile)
    const alphabet: Direction[] = this.possibleDirections;
    
    // Pentru fiecare genă
    for (let i = 0; i < dirs.length; i++) {
      // Cu probabilitate mutationRate
      if (Math.random() < this.mutationRate) {
        // Înlocuim cu o altă direcție (diferită de cea curentă)
        const current = dirs[i];
        const choices = alphabet.filter(d => d !== current);
        dirs[i] = choices[Math.floor(Math.random() * choices.length)];
      }
    }
    
    return dirs;
  }

  /**
   * Găsește și returnează cel mai bun individ din populație
   * (cel cu energia minimă)
   */
  private getBestIndividual(): Individual {
    return this.population.reduce((best, cur) => 
      (cur.energy < best.energy ? cur : best), 
      this.population[0]
    );
  }
}
