// Importăm clasele de bază și tipurile
import { BaseSolver, type SolverResult, type Conformation, type GeneticAlgorithmParameters } from "./types";
import type { Direction } from "../types";
import { EnergyCalculator } from "./energy-calculator";

/**
 * Tipul Individual - Reprezintă un cromozom în algoritm
 * Conține direcțiile (genele), energia HP pură și numărul de coliziuni.
 *
 * Separăm energia HP pură (hpEnergy) de energia totală cu penalizări (energy).
 * - hpEnergy: contactele H-H reale (negative, ex: -8 pentru 8 contacte)
 * - energy:   hpEnergy + collision penalty (folosit intern pentru selecție)
 * - collisions: numărul de auto-intersecții
 */
type Individual = {
  directions: Direction[];  // kept for output and repair compatibility
  encoded:    Uint8Array;   // fast copy/mutate in hot loops
  hpEnergy:   number;
  energy:     number;
  collisions: number;
};

/**
 * Clasa GeneticAlgorithmSolver - Implementează Algoritmul Genetic
 *
 *
 * 1. SELECȚIE: Tournament → Rank-Based Selection (Linear Ranking)
 *    - Sortăm populația după fitness și atribuim ranguri
 *    - Probabilitatea de selecție este proporțională cu rangul, nu cu fitness-ul absolut
 *    - Avantaj: presiune de selecție uniformă, previne dominanța timpurie a câtorva indivizi
 *
 * 2. CROSSOVER: One-Point → Two-Point Crossover
 *    - Două puncte de tăiere în loc de unul
 *    - Păstrează mai bine segmente structurale contigue (mai relevant pentru protein folding)
 *
 * 3. FITNESS: Separat hpEnergy (raportare) de energy (selecție)
 *    - Elimină dubla penalizare a coliziunilor
 *
 * 4. Îmbunătățit cu SAW local de la punctul de coliziune
 */
export class GeneticAlgorithmSolver extends BaseSolver {
  private populationSize: number;
  private crossoverRate: number;
  private mutationRate: number;
  private eliteCount: number;
  private selectionPressure: number; // For rank-based selection

  private population: Individual[] = [];

  constructor(parameters: GeneticAlgorithmParameters) {
    super(parameters);
    this.populationSize = parameters.populationSize;
    this.crossoverRate = parameters.crossoverRate;
    this.mutationRate = parameters.mutationRate;
    this.eliteCount = parameters.eliteCount;
    this.selectionPressure = parameters.selectionPressure ?? 1.5;
  }

  /**
   * METODA PRINCIPALĂ - Rulează Algoritmul Genetic
   */
  async solve(): Promise<SolverResult> {
    const startTime = Date.now();
    const energyHistory: { iteration: number; energy: number }[] = [];

    // PASUL 1: INIȚIALIZARE
    this.population = this.initializePopulation();

    let best = this.getBestIndividual();
    energyHistory.push({ iteration: 0, energy: best.hpEnergy });

    // BUCLA PRINCIPALĂ
    for (let iteration = 1; iteration <= this.maxIterations; iteration++) {
      if (this.isStopped) break;
      if (this.hasReachedTarget(best.hpEnergy)) break;

      // PASUL 2: ELITISM
      const nextPopulation: Individual[] = this.getElites(this.eliteCount);

      // PASUL 3: SELECȚIE PRIN RANGURI + CROSSOVER + MUTAȚIE
      // Pre-calculăm distribuția de ranguri o singură dată per generație (eficiență)
      const rankedPopulation = this.computeRanks();

      while (nextPopulation.length < this.populationSize) {
        // Folosim rank-based selection în loc de tournament selection
        const parentA = this.rankSelect(rankedPopulation);
        const parentB = this.rankSelect(rankedPopulation);

        // Two-point crossover în loc de one-point
        let [childDirsA, childDirsB] = this.maybeCrossoverTwoPoint(parentA.directions, parentB.directions);

        // MUTAȚIE
        childDirsA = this.mutate(childDirsA);
        childDirsB = this.mutate(childDirsB);

        // REPAIR îmbunătățit
        childDirsA = this.repairChromosome(childDirsA);
        childDirsB = this.repairChromosome(childDirsB);

        // EVALUARE
        const childA = this.evaluateIndividual(childDirsA);
        const childB = this.evaluateIndividual(childDirsB);

        nextPopulation.push(childA);
        if (nextPopulation.length < this.populationSize) {
          nextPopulation.push(childB);
        }
      }

      this.population = nextPopulation;

      const currentBest = this.getBestIndividual();
      if (this.isBetter(currentBest, best)) {
        best = currentBest;
      }

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

    const endTime = Date.now();
    const bestConformation: Conformation = {
      sequence: this.sequence,
      directions: best.directions,
      positions: EnergyCalculator.calculatePositions(this.sequence, best.directions),
      energy: best.hpEnergy  // Returnăm energia HP pură ca rezultat final
    };

    this.population = [];

    return {
      bestConformation,
      energyHistory,
      totalIterations: this.maxIterations,
      convergenceTime: endTime - startTime
    };
  }

  /**
   * Evaluează un individ și returnează un obiect Individual complet.
   * Centralizat pentru a evita duplicarea logicii de calcul.
   *
   *  Separă hpEnergy (pură, pentru raportare) de energy (cu penalizări, pentru selecție)
   */
  private evaluateIndividual(directions: Direction[]): Individual {
    EnergyCalculator.calculatePositionsInto(
      this.sequence, directions, this.positionBuffer
    );
    const collisions = EnergyCalculator.countCollisionsInBuffer(
      this.positionBuffer, this.sequence.length
    );
    const hpEnergy = EnergyCalculator.calculateContactEnergyFromBuffer(
      this.sequence, this.positionBuffer
    );
    const energy  = hpEnergy + collisions * 100;
    const encoded = this.encodeDirections(directions);
    return { directions, encoded, hpEnergy, energy, collisions };
  }

  /**
   * Inițializează populația — 20% greedy, 80% random SAW
   */
  private initializePopulation(): Individual[] {
    const individuals: Individual[] = [];
    const greedyCount = Math.max(1, Math.floor(this.populationSize * 0.2));

    for (let i = 0; i < this.populationSize; i++) {
      const directions = i < greedyCount
        ? this.generateGreedyDirections()
        : this.generateInitialDirections();
      individuals.push(this.evaluateIndividual(directions));
    }

    return individuals;
  }

  /**
   * Generează direcții inițiale folosind Self-Avoiding Walk (SAW)
   */
  private generateInitialDirections(): Direction[] {
    const length = this.sequence.length - 1;
    let attempts = 0;

    while (attempts < 100) {
      const candidate = this.generateRandomDirections().slice(0, length);
      const positions = EnergyCalculator.calculatePositions(this.sequence, candidate);
      if (EnergyCalculator.isValid(positions)) {
        return candidate;
      }
      attempts++;
    }

    return this.generateRandomDirections().slice(0, length);
  }

  /**
   * ELITISM - Selectează cei mai buni k indivizi
   * Folosește comparare lexicografică: coliziuni mai întâi, apoi energie
   */
  private getElites(k: number): Individual[] {
    return [...this.population]
      .sort((a, b) => {
        if (a.collisions !== b.collisions) return a.collisions - b.collisions;
        return a.energy - b.energy;
      })
      .slice(0, Math.min(k, this.population.length));
  }

  /**
   * RANK-BASED SELECTION (Selecție prin Etichete / Ranguri)
   *
   * PRINCIPIU:
   * 1. Sortăm populația după fitness (cel mai bun = rang N, cel mai rău = rang 1)
   * 2. Probabilitatea de selecție = rang / suma_rangurilor
   * 3. Selectăm folosind roulette wheel pe distribuția de ranguri
   *
   * AVANTAJ față de tournament selection:
   * - Presiune de selecție uniformă și controlabilă
   * - Individul cel mai bun nu domină complet populația
   * - Individul cel mai slab are mereu o șansă mică (menține diversitate)
   * - Nu depinde de diferențele absolute de fitness, ci de ordinea relativă
   *
   * LINEAR RANKING: prob(rank_i) = rank_i / sum(1..N) = 2*rank_i / (N*(N+1))
   *
   * @param ranked - Populația sortată cu ranguri pre-calculate (de la computeRanks)
   * @returns Individul selectat
   */
  private rankSelect(ranked: { individual: Individual; rank: number; cumulativeProb: number }[]): Individual {
    const r = Math.random();

    // Căutăm individul corespunzător valorii aleatoare (roulette wheel)
    for (const entry of ranked) {
      if (r <= entry.cumulativeProb) {
        return entry.individual;
      }
    }

    // Fallback: returnăm ultimul (cel mai bun) individ
    return ranked[ranked.length - 1].individual;
  }

  /**
   * Pre-calculează distribuția de ranguri pentru întreaga populație.
   * Apelat o singură dată per generație pentru eficiență.
   *
   * Sortare: cel mai RĂU = rang 1, cel mai BUN = rang N
   * Probabilitate: prob(i) = rank(i) / sum(1..N)
   * Probabilitate cumulativă: pentru roulette wheel selection
   */
  private computeRanks(): { individual: Individual; rank: number; cumulativeProb: number }[] {
    const N = this.population.length;

    // Sortăm crescător (cel mai rău primul → rang 1)
    const sorted = [...this.population].sort((a, b) => {
      if (a.collisions !== b.collisions) return b.collisions - a.collisions; // mai multe coliziuni = mai rău
      return b.energy - a.energy; // energie mai mare = mai rău
    });

    const s = this.selectionPressure;
    let cumulative = 0;

    return sorted.map((individual, index) => {
      const rank = index + 1; // rang 1 (cel mai rău) până la N (cel mai bun)
      const prob = (2 - s) / N + (2 * rank * (s - 1)) / (N * (N + 1));
      cumulative += prob;
      return { individual, rank, cumulativeProb: cumulative };
    });
  }

  /**
   * TWO-POINT CROSSOVER (Crossover în Două Puncte)
   *
   * PRINCIPIU:
   * 1. Cu probabilitate crossoverRate, facem încrucișare
   * 2. Alegem DOUĂ puncte aleatorii în cromozom (point1 < point2)
   * 3. Copilul 1 = A[0..p1] + B[p1..p2] + A[p2..end]
   *    Copilul 2 = B[0..p1] + A[p1..p2] + B[p2..end]
   *
   * AVANTAJ față de one-point crossover:
   * - Păstrează mai bine segmente structurale contigue din AMBII părinți
   * - Mai relevant pentru protein folding unde segmente locale contează
   * - Reduce "positional bias" (genele de la capete nu avantajate vs mijloc)
   *
   * Exemplu (p1=2, p2=5):
   * Părinte A: [L, R, | U, D, L, | R, U]
   * Părinte B: [R, D, | L, U, R, | D, L]
   * Copil 1:   [L, R,   L, U, R,   R, U]  ← A + B_mid + A
   * Copil 2:   [R, D,   U, D, L,   D, L]  ← B + A_mid + B
   */
  private maybeCrossoverTwoPoint(a: Direction[], b: Direction[]): [Direction[], Direction[]] {
    if (Math.random() > this.crossoverRate) {
      return [a.slice(), b.slice()];
    }

    const length = Math.min(a.length, b.length);

    if (length < 3) {
      return [a.slice(), b.slice()];
    }

    // Alegem două puncte distincte (1 ≤ p1 < p2 < length)
    let point1 = 1 + Math.floor(Math.random() * (length - 2));
    let point2 = point1 + 1 + Math.floor(Math.random() * (length - point1 - 1));

    // Asigurăm că p1 < p2
    if (point1 >= point2) {
      point2 = Math.min(point1 + 1, length - 1);
    }

    // Creăm copiii
    const childA = [
      ...a.slice(0, point1),
      ...b.slice(point1, point2),
      ...a.slice(point2)
    ] as Direction[];

    const childB = [
      ...b.slice(0, point1),
      ...a.slice(point1, point2),
      ...b.slice(point2)
    ] as Direction[];

    return [childA, childB];
  }

  /**
   * MUTAȚIE - Uses Uint8Array for fast internal processing
   */
  private mutate(genes: Direction[]): Direction[] {
    const buf    = this.encodeDirections(genes);
    const maxDir = this.possibleDirections.length;

    for (let i = 0; i < buf.length; i++) {
      if (Math.random() < this.mutationRate) {
        const current = buf[i];
        let newVal = Math.floor(Math.random() * (maxDir - 1));
        if (newVal >= current) newVal++;
        buf[i] = newVal;
      }
    }

    return this.decodeDirections(buf);
  }

  /**
   * Repară cromozomii invalizi după mutație/crossover
   *
   * Versiunea veche resampela random de la punctul de coliziune, distrugând
   * materialul genetic al părinților. Noua versiune încearcă mai întâi să
   * găsească o direcție alternativă DOAR la poziția de coliziune (modificare minimă),
   * și abia dacă eșuează de mai multe ori, resampela mai agresiv.
   *
   * Strategie în cascadă:
   * 1. Detectează prima coliziune la indexul i
   * 2. Încearcă să schimbe DOAR direcția i cu una valabilă (repair minim)
   * 3. Dacă eșuează după maxLocalAttempts, resampelează de la i până la final
   * 4. Dacă tot eșuează, generează complet din nou folosind SAW
   */
  private repairChromosome(directions: Direction[]): Direction[] {
    const positions = EnergyCalculator.calculatePositions(this.sequence, directions);
    if (EnergyCalculator.countCollisions(positions) === 0) return directions;

    // Find first collision index (integer-packed keys for performance)
    const occupied = new Set<number>();
    let collisionIndex = -1;
    for (let i = 0; i < positions.length; i++) {
      const key = ((positions[i].z + 512) << 20) | ((positions[i].y + 512) << 10) | (positions[i].x + 512);
      if (occupied.has(key)) { collisionIndex = i; break; }
      occupied.add(key);
    }
    if (collisionIndex === -1) return directions;

    // Step 1: Try minimal single-gene repair at the collision point
    const repaired = directions.slice();
    const repairAt = collisionIndex - 1;
    if (repairAt >= 0) {
      const shuffled = [...this.possibleDirections].sort(() => Math.random() - 0.5);
      for (const newDir of shuffled) {
        if (newDir === repaired[repairAt]) continue;
        repaired[repairAt] = newDir;
        const newPos = EnergyCalculator.calculatePositions(this.sequence, repaired);
        if (EnergyCalculator.countCollisions(newPos) === 0) return repaired;
      }
    }

    // Step 2: Full SAW fallback
    return this.generateInitialDirections();
  }

  /**
   * Compară doi indivizi folosind lexicographic fitness
   * Primul criteriu: coliziuni (mai puține = mai bun)
   * Al doilea criteriu: energie (mai mică = mai bun)
   */
  private isBetter(a: Individual, b: Individual): boolean {
    if (a.collisions !== b.collisions) return a.collisions < b.collisions;
    return a.energy < b.energy;
  }

  /**
   * Găsește cel mai bun individ din populație (lexicographic fitness)
   */
  private getBestIndividual(): Individual {
    return this.population.reduce((best, cur) => {
      if (cur.collisions !== best.collisions) {
        return cur.collisions < best.collisions ? cur : best;
      }
      return cur.energy < best.energy ? cur : best;
    }, this.population[0]);
  }

}