// Importăm tipul Direction care definește direcțiile posibile (L, R, U, D, F, B)
import { Direction } from "../types";

// Importăm clasele de bază și interfețele necesare
import { BaseSolver, MonteCarloParameters, SolverResult, Conformation } from "./types";

// Importăm calculatorul de energie pentru modelul HP
import { EnergyCalculator } from "./energy-calculator";

/**
 * Clasa MonteCarloSolver - Implementează algoritmul Monte Carlo
 * Moștenește din BaseSolver care conține funcționalități comune tuturor algoritmilor
 */
export class MonteCarloSolver extends BaseSolver {
  // Dimensiunea populației - câte conformații păstrăm în fiecare moment
  private populationSize: number;

  // Array-ul care conține populația curentă de conformații
  private population: Conformation[] = [];

  // Contor pentru numărul total de conformații generate (pentru statistici)
  private totalSampledCount: number = 0;

  /**
   * Constructor - Inițializează solver-ul cu parametrii primiți
   * @param parameters - Parametrii algoritmului (dimensiune populație, iterații, etc.)
   */
  constructor(parameters: MonteCarloParameters) {
    // Apelăm constructorul clasei părinte (BaseSolver)
    super(parameters);
    // Salvăm dimensiunea populației din parametri
    this.populationSize = parameters.populationSize;
  }

  /**
   * METODA PRINCIPALĂ - Rulează algoritmul Monte Carlo
   * @returns Promise<SolverResult> - Rezultatul final cu cea mai bună conformație găsită
   */
  async solve(): Promise<SolverResult> {
    // Marcăm timpul de start pentru a calcula durata execuției
    const startTime = Date.now();

    // Array pentru a stoca istoricul energiilor (pentru grafic)
    const energyHistory: { iteration: number; energy: number }[] = [];

    // PASUL 1: Inițializăm populația cu conformații aleatorii diverse
    this.initializePopulation();

    // Obținem cea mai bună conformație din populația inițială
    let bestConformation = this.getBestConformation();

    // Salvăm energia inițială în istoric (iterația 0) — bestConformation.energy = hpEnergy
    energyHistory.push({ iteration: 0, energy: bestConformation.energy });

    // PASUL 2: BUCLA PRINCIPALĂ - Eșantionare Monte Carlo
    // Iterăm de la 1 până la numărul maxim de iterații
    for (let iteration = 1; iteration <= this.maxIterations; iteration++) {
      if (this.isStopped) break;
      if (this.hasReachedTarget(bestConformation.energy)) break;

      // PASUL 3: Generăm noi eșantioane prin eșantionare aleatoare
      this.performSamplingIteration();

      // PASUL 4: Urmărim cea mai bună conformație găsită până acum
      const currentBest = this.getBestConformation();
      // Dacă am găsit o conformație mai bună, o salvăm
      if (currentBest.energy < bestConformation.energy) {
        bestConformation = { ...currentBest }; // Copiem conformația
      }

      // PASUL 5: Înregistrăm statistici la intervale regulate
      if (iteration % this.logInterval === 0) {
        // FIX: log best hpEnergy found so far, not population average
        energyHistory.push({
          iteration,
          energy: bestConformation.energy,  // this is hpEnergy after Step 3
        });

        this.onProgress?.({
          iteration,
          currentEnergy: bestConformation.energy,
          bestEnergy:    bestConformation.energy,
          progress:      (iteration / this.maxIterations) * 100,
        });
      }

      if (iteration % this.yieldInterval === 0) {
        await this.yieldToFrame();
      }
    }

    // Calculăm timpul total de execuție
    const convergenceTime = Date.now() - startTime;

    // PASUL 6: Returnăm rezultatul final
    return {
      bestConformation,     // Cea mai bună conformație găsită
      energyHistory,        // Istoricul energiilor (pentru grafic)
      totalIterations: this.maxIterations,  // Numărul total de iterații
      convergenceTime       // Timpul de execuție în milisecunde
    };
  }

  /**
   * Inițializează populația cu conformații aleatorii
   * Stochează hpEnergy în energy, fitness pentru selecție internă
   */
  private initializePopulation(): void {
    this.population = [];
    this.totalSampledCount = 0;

    for (let i = 0; i < this.populationSize; i++) {
      const directions = this.generateRandomDirections();
      const conformation = {
        ...EnergyCalculator.createConformation(this.sequence, directions),
        energy:  EnergyCalculator.calculateHPEnergy(this.sequence, directions),
        fitness: EnergyCalculator.calculateFitness(this.sequence, directions, 100),
      };
      this.population.push(conformation);
    }
    this.totalSampledCount = this.populationSize;
  }

  /**
   * Execută o iterație de eșantionare Monte Carlo
   * Generează noi conformații prin:
   * 1. Generare complet aleatoare (50%)
   * 2. Mutația conformațiilor bune (30%)
   */
  private performSamplingIteration(): void {
    // Array pentru noile eșantioane generate în această iterație
    const newSamples: Conformation[] = [];

    // === PARTEA 1: Generăm 50% conformații complet aleatorii ===
    const newSampleCount = Math.floor(this.populationSize * 0.5);
    for (let i = 0; i < newSampleCount; i++) {
      const directions = this.generateRandomDirections();
      const conformation = {
        ...EnergyCalculator.createConformation(this.sequence, directions),
        energy:  EnergyCalculator.calculateHPEnergy(this.sequence, directions),
        fitness: EnergyCalculator.calculateFitness(this.sequence, directions, 100),
      };
      newSamples.push(conformation);
    }

    // === PARTEA 2: Generăm 30% conformații prin mutația celor bune ===
    const mutationCount = Math.floor(this.populationSize * 0.3);

    // Selectăm jumătatea superioară a populației (cele mai bune după energie)
    // Sortăm crescător după energie (energia mai mică = mai bună)
    const topHalf = [...this.population]
      .sort((a, b) => a.energy - b.energy)
      .slice(0, Math.floor(this.populationSize / 2));

    // Generăm conformații mutate din părinți aleși aleatoriu din top 50%
    for (let i = 0; i < mutationCount; i++) {
      const parent = topHalf[Math.floor(Math.random() * topHalf.length)];
      const mutated = this.mutateConformation(parent);
      const conformation = {
        ...mutated,
        energy:  EnergyCalculator.calculateHPEnergy(this.sequence, mutated.directions),
        fitness: EnergyCalculator.calculateFitness(this.sequence, mutated.directions, 100),
      };
      newSamples.push(conformation);
    }

    // Adăugăm noile eșantioane în populație
    this.population.push(...newSamples);
    // Actualizăm contorul total de eșantioane generate
    this.totalSampledCount += newSamples.length;

    // Menținem diversitatea în populație (eliminăm excesul)
    this.maintainPopulationDiversity();
  }

  /**
   * Mutează o conformație existentă
   * Schimbă 1-3 direcții aleatorii din conformația părintelui
   * 
   * @param parent - Conformația de mutat
   * @returns Conformation - O nouă conformație mutată
   */
  private mutateConformation(parent: Conformation): Conformation {
    // Copiem direcțiile părintelui (nu modificăm originalul)
    const newDirections = [...parent.directions];

    // Alegem câte mutații să facem (1, 2 sau 3)
    const mutationCount = Math.floor(Math.random() * 3) + 1;

    // Obținem lista de direcții posibile (depinde de tipul latice: 2D sau 3D)
    const possibleDirections: Direction[] = this.possibleDirections;

    // Aplicăm mutațiile
    for (let i = 0; i < mutationCount; i++) {
      // Alegem o poziție aleatoare de mutat
      const randomIndex = Math.floor(Math.random() * newDirections.length);
      // Salvăm direcția curentă la acea poziție
      const currentDirection = newDirections[randomIndex];
      // Filtrăm direcțiile disponibile (excludem direcția curentă)
      const availableDirections = possibleDirections.filter(d => d !== currentDirection);
      // Alegem o nouă direcție aleatorie din cele disponibile
      newDirections[randomIndex] = availableDirections[Math.floor(Math.random() * availableDirections.length)];
    }

    // Creăm și returnăm noua conformație cu direcțiile mutate
    return EnergyCalculator.createConformation(this.sequence, newDirections);
  }

  /**
   * Menține diversitatea în populație
   * Păstrează 60% cele mai bune conformații + 40% aleatorii
   * Sortare după fitness (nu energy) pentru selecție internă
   */
  private maintainPopulationDiversity(): void {
    if (this.population.length > this.populationSize) {
      const sorted = [...this.population].sort((a, b) =>
        ((a as Conformation & { fitness?: number }).fitness ?? a.energy) -
        ((b as Conformation & { fitness?: number }).fitness ?? b.energy)
      );

      // Calculăm câte conformații păstrăm din fiecare categorie
      const keepBest = Math.floor(this.populationSize * 0.6);    // 60% cele mai bune
      const keepRandom = this.populationSize - keepBest;          // 40% aleatorii

      // Păstrăm cele mai bune 60%
      const newPopulation = sorted.slice(0, keepBest);

      // Adăugăm 40% aleatorii din conformațiile rămase (pentru diversitate)
      const remaining = sorted.slice(keepBest);
      for (let i = 0; i < keepRandom && remaining.length > 0; i++) {
        // Alegem o conformație aleatorie din cele rămase
        const randomIndex = Math.floor(Math.random() * remaining.length);
        // O adăugăm în noua populație și o eliminăm din remaining
        newPopulation.push(remaining.splice(randomIndex, 1)[0]);
      }

      // Înlocuim populația cu noua populație redusă
      this.population = newPopulation;
    }
  }

  /**
   * Găsește și returnează cea mai bună conformație din populație
   * Compară după fitness (nu energy) — energy conține hpEnergy pentru raportare
   */
  private getBestConformation(): Conformation {
    if (this.population.length === 0) {
      return { sequence: this.sequence, directions: [], energy: 0, positions: [] };
    }
    const withFitness = this.population as (Conformation & { fitness?: number })[];
    return withFitness.reduce((best, current) =>
      ((current.fitness ?? current.energy) < (best.fitness ?? best.energy) ? current : best)
    );
  }

  /**
   * Returnează o copie a populației curente
   * Util pentru analiză și debugging
   */
  getPopulation(): Conformation[] {
    return [...this.population];
  }

  /**
   * Metodă depreciată - returnează populația curentă în loc de toate eșantioanele
   * @deprecated - Schimbat pentru performanță (nu mai stocăm toate eșantioanele)
   */
  getAllSampledConformations(): Conformation[] {
    console.warn("getAllSampledConformations returns only current population in high-performance mode");
    return [...this.population];
  }

  /**
   * Calculează și returnează statistici despre populație
   * Include: energie minimă/maximă/medie, număr de conformații valide, diversitate
   */
  getPopulationStats() {
    // Filtrăm conformațiile valide
    const valid = this.population.filter(c => c.energy !== Number.POSITIVE_INFINITY);
    // Extragem energiile
    const energies = valid.map(c => c.energy);

    // Caz special: nu avem conformații valide
    if (energies.length === 0) {
      return {
        bestEnergy: 0,
        worstEnergy: 0,
        averageEnergy: 0,
        validConformations: 0,
        totalSampled: this.totalSampledCount,
        diversityScore: 0
      };
    }

    // Calculăm energia medie
    const avgEnergy = energies.reduce((sum, e) => sum + e, 0) / energies.length;

    // Calculăm varianța (pentru scorul de diversitate)
    const variance = energies.reduce((sum, e) => sum + Math.pow(e - avgEnergy, 2), 0) / energies.length;

    return {
      bestEnergy: Math.min(...energies),           // Cea mai bună energie (minimă)
      worstEnergy: Math.max(...energies),          // Cea mai proastă energie (maximă)
      averageEnergy: avgEnergy,                     // Energia medie
      validConformations: valid.length,             // Numărul de conformații valide
      totalSampled: this.totalSampledCount,         // Total conformații generate
      diversityScore: Math.sqrt(variance)           // Scor de diversitate (deviația standard)
    };
  }

  /**
   * Generează o histogramă a distribuției energiilor
   * Util pentru vizualizarea peisajului energetic
   * 
   * @param bins - Numărul de intervale pentru histogramă (default: 10)
   * @returns Array cu energia centrală și numărul de conformații pentru fiecare interval
   */
  getEnergyDistribution(bins: number = 10): { energy: number; count: number }[] {
    // Filtrăm conformațiile valide
    const validConformations = this.population.filter(c => c.energy !== Number.POSITIVE_INFINITY);
    const energies = validConformations.map(c => c.energy);

    // Dacă nu avem energii, returnăm array gol
    if (energies.length === 0) return [];

    // Găsim energia minimă și maximă
    const minEnergy = Math.min(...energies);
    const maxEnergy = Math.max(...energies);

    // Calculăm dimensiunea fiecărui interval
    // Evităm împărțirea la zero dacă toate energiile sunt egale
    const binSize = maxEnergy === minEnergy ? 1 : (maxEnergy - minEnergy) / bins;

    // Construim histograma
    const histogram: { energy: number; count: number }[] = [];

    for (let i = 0; i < bins; i++) {
      // Calculăm limitele intervalului
      const binStart = minEnergy + i * binSize;
      const binEnd = binStart + binSize;

      // Numărăm conformațiile din acest interval
      // Pentru ultimul interval, includem și valoarea maximă
      const count = energies.filter(e =>
        e >= binStart && (i === bins - 1 ? e <= binEnd : e < binEnd)
      ).length;

      // Adăugăm în histogramă (folosim centrul intervalului ca energie reprezentativă)
      histogram.push({
        energy: binStart + binSize / 2,
        count
      });
    }

    return histogram;
  }
}
