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

    // Calculăm energia medie a populației inițiale
    let averageEnergy = this.getAverageEnergy();

    // Salvăm energia inițială în istoric (iterația 0)
    energyHistory.push({ iteration: 0, energy: averageEnergy });

    // Calculăm intervalele pentru logare și pentru a permite UI-ului să se actualizeze
    // logInterval: la câte iterații salvăm în istoric (max ~2000 intrări în istoric)
    const logInterval = Math.max(1, Math.floor(this.maxIterations / 2000));
    // yieldInterval: la câte iterații cedăm controlul browser-ului (max ~1000 cedări)
    const yieldInterval = Math.max(1, Math.floor(this.maxIterations / 1000));

    // PASUL 2: BUCLA PRINCIPALĂ - Eșantionare Monte Carlo
    // Iterăm de la 1 până la numărul maxim de iterații
    for (let iteration = 1; iteration <= this.maxIterations; iteration++) {
      // Verificăm dacă utilizatorul a oprit execuția
      if (this.isStopped) {
        break; // Ieșim din buclă dacă s-a cerut oprirea
      }

      // PASUL 3: Generăm noi eșantioane prin eșantionare aleatoare
      this.performSamplingIteration();

      // PASUL 4: Urmărim cea mai bună conformație găsită până acum
      const currentBest = this.getBestConformation();
      // Dacă am găsit o conformație mai bună, o salvăm
      if (currentBest.energy < bestConformation.energy) {
        bestConformation = { ...currentBest }; // Copiem conformația
      }

      // PASUL 5: Înregistrăm statistici la intervale regulate
      if (iteration % logInterval === 0) {
        // Calculăm energia medie actuală a populației
        averageEnergy = this.getAverageEnergy();

        // Adăugăm în istoricul energiilor
        energyHistory.push({
          iteration,
          energy: averageEnergy
        });

        // Notificăm UI-ul despre progres (pentru bara de progres și grafic)
        this.onProgress?.({
          iteration,                                              // Iterația curentă
          currentEnergy: averageEnergy,                          // Energia medie actuală
          bestEnergy: bestConformation.energy,                   // Cea mai bună energie găsită
          progress: (iteration / this.maxIterations) * 100       // Procentul de completare
        });
      }

      // Cedăm controlul browser-ului periodic pentru a nu bloca UI-ul
      if (iteration % yieldInterval === 0) {
        await new Promise(resolve => setTimeout(resolve, 0));
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
   * Creează populationSize conformații cu direcții generate aleatoriu
   */
  private initializePopulation(): void {
    // Resetăm populația
    this.population = [];
    // Resetăm contorul de eșantioane
    this.totalSampledCount = 0;

    // Generăm populationSize conformații aleatorii
    for (let i = 0; i < this.populationSize; i++) {
      // Generăm un șir aleatoriu de direcții (L, R, U, D, F, B)
      const directions = this.generateRandomDirections();
      // Creăm conformația calculând pozițiile și energia
      const conformation = EnergyCalculator.createConformation(this.sequence, directions);
      // Adăugăm conformația în populație
      this.population.push(conformation);
    }
    // Actualizăm contorul total de eșantioane
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
      // Generăm direcții aleatorii
      const directions = this.generateRandomDirections();
      // Creăm conformația cu aceste direcții
      const conformation = EnergyCalculator.createConformation(this.sequence, directions);
      // Adăugăm în lista de noi eșantioane
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
      // Alegem un părinte aleatoriu din jumătatea superioară
      const parent = topHalf[Math.floor(Math.random() * topHalf.length)];
      // Mutăm conformația părintelui
      const mutatedConformation = this.mutateConformation(parent);
      // Adăugăm mutantul în lista de noi eșantioane
      newSamples.push(mutatedConformation);
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
   * Aceasta previne convergența prematură și menține explorarea
   */
  private maintainPopulationDiversity(): void {
    // Verificăm dacă populația a depășit dimensiunea țintă
    if (this.population.length > this.populationSize) {
      // Sortăm populația după energie (crescător - cele mai bune primele)
      const sorted = [...this.population].sort((a, b) => a.energy - b.energy);

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
   * Cea mai bună = energia cea mai mică (negativă)
   * 
   * @returns Conformation - Conformația cu energia minimă
   */
  private getBestConformation(): Conformation {
    // Dacă populația e goală, returnăm o conformație vidă
    if (this.population.length === 0) {
      return { sequence: this.sequence, directions: [], energy: 0, positions: [] };
    }
    // Găsim conformația cu energia minimă folosind reduce
    return this.population.reduce((best, current) =>
      current.energy < best.energy ? current : best
    );
  }

  /**
   * Calculează energia medie a populației
   * Ignoră conformațiile invalide (cu energie infinită)
   * 
   * @returns number - Energia medie a conformațiilor valide
   */
  private getAverageEnergy(): number {
    // Filtrăm conformațiile valide (energia finită)
    const validConformations = this.population.filter(c => c.energy !== Number.POSITIVE_INFINITY);

    // Dacă nu avem conformații valide, returnăm 0
    if (validConformations.length === 0) return 0;

    // Calculăm suma energiilor
    const totalEnergy = validConformations.reduce((sum, c) => sum + c.energy, 0);

    // Returnăm media
    return totalEnergy / validConformations.length;
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
