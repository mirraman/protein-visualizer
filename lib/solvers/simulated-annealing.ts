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

  /**
   * Constructor - Inițializează solver-ul cu parametrii de temperatură
   */
  constructor(parameters: SimulatedAnnealingParameters) {
    super(parameters);
    this.initialTemperature = parameters.initialTemperature;  // Ex: 100
    this.finalTemperature = parameters.finalTemperature;      // Ex: 0.001
    this.coolingRate = parameters.coolingRate;                // Ex: 0.995
  }

  /**
   * METODA PRINCIPALĂ - Rulează algoritmul Simulated Annealing
   */
  async solve(): Promise<SolverResult> {
    // Marcăm timpul de start
    const startTime = Date.now();

    // Array pentru istoricul energiilor
    const energyHistory: { iteration: number; energy: number }[] = [];

    // PASUL 1: Inițializăm temperatura la valoarea inițială (ridicată)
    let temperature = this.initialTemperature;

    // PASUL 2: Generăm o conformație inițială aleatoare
    let currentDirections = this.generateRandomDirections();
    let currentHpEnergy = EnergyCalculator.calculateHPEnergy(this.sequence, currentDirections);
    let currentFitness  = EnergyCalculator.calculateFitness(this.sequence, currentDirections, 100);
    let bestHpEnergy    = currentHpEnergy;
    let bestDirections  = currentDirections;

    // Salvăm energia inițială în istoric
    energyHistory.push({ iteration: 0, energy: bestHpEnergy });

    // Calculăm intervalele pentru logare și actualizare UI
    const logInterval = Math.max(1, Math.floor(this.maxIterations / 2000));
    const yieldInterval = Math.max(1, Math.floor(this.maxIterations / 1000));

    // PASUL 3: BUCLA PRINCIPALĂ - Optimizare Simulated Annealing
    for (let iteration = 1; iteration <= this.maxIterations; iteration++) {
      // Verificăm dacă s-a cerut oprirea
      if (this.isStopped) {
        break;
      }

      // PASUL 4: Generăm o conformație vecină (o mică modificare)
      const currentConformation = { directions: currentDirections, fitness: currentFitness };
      const neighbor = this.generateNeighbor(currentConformation);

      // PASUL 5: Decidem dacă acceptăm sau respingem mișcarea
      // Folosim criteriul Metropolis (formula Boltzmann) — compare fitness, not hpEnergy
      if (this.acceptMove(currentFitness, neighbor.fitness, temperature)) {
        // Acceptăm mișcarea - trecem la conformația vecină
        currentDirections = neighbor.directions.slice();
        currentHpEnergy = neighbor.hpEnergy;
        currentFitness  = neighbor.fitness;

        // Verificăm dacă e cea mai bună conformație găsită până acum
        if (neighbor.hpEnergy < bestHpEnergy) {
          bestHpEnergy   = neighbor.hpEnergy;
          bestDirections = neighbor.directions.slice();
        }
      }
      // Dacă nu acceptăm, rămânem la conformația curentă

      // PASUL 6: Răcim temperatura conform programului de răcire
      temperature = this.updateTemperature(temperature, iteration);

      // PASUL 7: Înregistrăm statistici la intervale regulate
      if (iteration % logInterval === 0) {
        energyHistory.push({
          iteration,
          energy: bestHpEnergy  // Salvăm cea mai bună hpEnergy găsită
        });

        // Notificăm UI-ul despre progres
        this.onProgress?.({
          iteration,
          currentEnergy: currentHpEnergy,
          bestEnergy: bestHpEnergy,
          progress: (iteration / this.maxIterations) * 100
        });
      }

      // Cedăm controlul browser-ului periodic
      if (iteration % yieldInterval === 0) {
        await new Promise(resolve => setTimeout(resolve, 0));
      }

      // TERMINARE TIMPURIE: dacă temperatura a scăzut sub pragul minim
      if (temperature < this.finalTemperature) {
        break;
      }
    }

    // Calculăm timpul de execuție
    const convergenceTime = Date.now() - startTime;

    // Returnăm rezultatul final — energy = hpEnergy pură
    const bestConformation: Conformation = {
      sequence: this.sequence,
      directions: bestDirections,
      positions: EnergyCalculator.calculatePositions(this.sequence, bestDirections),
      energy: bestHpEnergy
    };

    return {
      bestConformation,
      energyHistory,
      totalIterations: this.maxIterations,
      convergenceTime
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
   * Generează o conformație vecină prin mutație mică
   * Schimbă O SINGURĂ direcție din conformația curentă
   * Verifică validitatea cu EnergyCalculator.countCollisions() (nu Infinity)
   */
  private generateNeighbor(conformation: Conformation & { fitness: number }): Conformation & { fitness: number } {
    const maxAttempts = 10;

    for (let attempt = 0; attempt < maxAttempts; attempt++) {
      const newDirections = [...conformation.directions];
      const randomIndex   = Math.floor(Math.random() * newDirections.length);
      const current       = newDirections[randomIndex];
      const available     = this.possibleDirections.filter(d => d !== current);

      newDirections[randomIndex] = available[Math.floor(Math.random() * available.length)];

      const positions  = EnergyCalculator.calculatePositions(this.sequence, newDirections);
      const collisions = EnergyCalculator.countCollisions(positions);

      // Accept if valid (no collisions) OR if we've exhausted all attempts
      if (collisions === 0 || attempt === maxAttempts - 1) {
        return {
          sequence:   this.sequence,
          directions: newDirections,
          positions,
          energy:  EnergyCalculator.calculateHPEnergy(this.sequence, newDirections),
          fitness: EnergyCalculator.calculateFitness(this.sequence, newDirections, 100),
        };
      }
    }

    // Fallback: return original conformation unchanged
    return conformation;
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
   * Actualizează temperatura conform programului de răcire exponențial
   * 
   * FORMULA: T(t) = T_initial * (T_final / T_initial)^(t / t_max)
   * 
   * Aceasta oferă o răcire lentă care permite explorarea adecvată:
   * - La început: temperatura scade încet (explorăm mult)
   * - La sfârșit: temperatura scade rapid (convergem la soluție)
   * 
   * @param currentTemperature - Temperatura curentă (nu este folosită în această formulă)
   * @param iteration - Iterația curentă
   * @returns number - Noua temperatură
   */
  private updateTemperature(currentTemperature: number, iteration: number): number {
    // Calculăm factorul de răcire bazat pe progresul în algoritm
    // (T_final / T_initial)^(iteration / maxIterations)
    const coolingFactor = Math.pow(
      this.finalTemperature / this.initialTemperature,
      iteration / this.maxIterations
    );

    // Noua temperatură = T_initial * factorul de răcire
    const newTemperature = this.initialTemperature * coolingFactor;

    // Ne asigurăm că temperatura nu scade sub valoarea finală minimă
    return Math.max(newTemperature, this.finalTemperature);
  }

  /**
   * Metodă auxiliară pentru a obține temperatura la o anumită iterație
   * Utilă pentru monitorizare și debugging
   */
  getCurrentTemperature(iteration: number): number {
    return this.updateTemperature(this.initialTemperature, iteration);
  }
}
