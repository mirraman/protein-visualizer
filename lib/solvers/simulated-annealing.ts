/**
 * =============================================================================
 * ALGORITM SIMULATED ANNEALING (RECOACERE SIMULATĂ) PENTRU PLIEREA PROTEINELOR
 * =============================================================================
 * 
 * Simulated Annealing este inspirat din procesul metalurgic de recoacere, unde
 * un metal este încălzit și apoi răcit lent pentru a-i reduce defectele.
 * 
 * PRINCIPIUL DE FUNCȚIONARE:
 * 1. Începem cu o temperatură inițială ridicată (T_initial)
 * 2. La fiecare iterație:
 *    a) Generăm un vecin (conformație similară cu mutație mică)
 *    b) Dacă vecinul e mai bun (energie mai mică) -> ACCEPTĂM întotdeauna
 *    c) Dacă vecinul e mai rău -> ACCEPTĂM cu probabilitate P = exp(-ΔE/T)
 * 3. Răcim temperatura treptat conform unui program de răcire
 * 4. La temperaturi mari: acceptăm mișcări proaste (explorare)
 *    La temperaturi mici: acceptăm doar mișcări bune (exploatare)
 * 
 * FORMULA BOLTZMANN (criteriul de acceptare):
 * P(accept) = exp((E_curent - E_nou) / T)
 * - Când T e mare, P e aproape 1 -> acceptăm aproape orice
 * - Când T e mic, P e aproape 0 pentru mișcări proaste -> selectiv
 * 
 * AVANTAJE:
 * - Poate scăpa din minime locale (la temperaturi mari)
 * - Converge la soluții bune (la temperaturi mici)
 * - Echilibru între explorare și exploatare
 * =============================================================================
 */

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
    let currentConformation = this.initializeConformation();
    
    // Salvăm cea mai bună conformație găsită (inițial = cea curentă)
    let bestConformation = { ...currentConformation };

    // Salvăm energia inițială în istoric
    energyHistory.push({ iteration: 0, energy: currentConformation.energy });

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
      const neighborConformation = this.generateNeighbor(currentConformation);

      // PASUL 5: Decidem dacă acceptăm sau respingem mișcarea
      // Folosim criteriul Metropolis (formula Boltzmann)
      if (this.acceptMove(currentConformation.energy, neighborConformation.energy, temperature)) {
        // Acceptăm mișcarea - trecem la conformația vecină
        currentConformation = neighborConformation;

        // Verificăm dacă e cea mai bună conformație găsită până acum
        if (currentConformation.energy < bestConformation.energy) {
          bestConformation = { ...currentConformation };
        }
      }
      // Dacă nu acceptăm, rămânem la conformația curentă

      // PASUL 6: Răcim temperatura conform programului de răcire
      temperature = this.updateTemperature(temperature, iteration);

      // PASUL 7: Înregistrăm statistici la intervale regulate
      if (iteration % logInterval === 0) {
        energyHistory.push({
          iteration,
          energy: bestConformation.energy  // Salvăm cea mai bună energie găsită
        });

        // Notificăm UI-ul despre progres
        this.onProgress?.({
          iteration,
          currentEnergy: currentConformation.energy,
          bestEnergy: bestConformation.energy,
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

    // Returnăm rezultatul final
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
   * 
   * Aceasta este o mutație LOCALĂ - explorăm vecinătatea soluției curente
   * 
   * @param conformation - Conformația curentă
   * @returns Conformation - O conformație vecină (cu o mutație)
   */
  private generateNeighbor(conformation: Conformation): Conformation {
    // Încercăm de mai multe ori să generăm un vecin valid
    const maxAttempts = 10;

    for (let attempt = 0; attempt < maxAttempts; attempt++) {
      // Copiem direcțiile curente
      const newDirections = [...conformation.directions];
      
      // Alegem o poziție aleatoare de mutat
      const randomIndex = Math.floor(Math.random() * newDirections.length);
      
      // Obținem direcțiile posibile (2D: L,R,U,D sau 3D: L,R,U,D,F,B)
      const possibleDirections: Direction[] = this.possibleDirections;

      // Salvăm direcția curentă la poziția aleasă
      const currentDirection = newDirections[randomIndex];
      
      // Alegem o direcție diferită (excludem direcția curentă)
      const availableDirections = possibleDirections.filter(d => d !== currentDirection);
      const newDirection = availableDirections[Math.floor(Math.random() * availableDirections.length)];

      // Aplicăm mutația
      newDirections[randomIndex] = newDirection;

      // Creăm conformația vecină
      const neighbor = EnergyCalculator.createConformation(this.sequence, newDirections);

      // Dacă vecinul e valid (nu are auto-intersecție) sau am epuizat încercările, îl returnăm
      if (neighbor.energy !== Number.POSITIVE_INFINITY || attempt === maxAttempts - 1) {
        return neighbor;
      }
      // Altfel, încercăm din nou cu altă mutație
    }

    // Caz extrem: returnăm conformația originală dacă nu găsim un vecin valid
    return conformation;
  }

  /**
   * CRITERIUL METROPOLIS - Decide dacă acceptăm o mișcare
   * 
   * REGULI:
   * 1. Dacă noua energie e mai mică (mai bună) -> ACCEPTĂM întotdeauna
   * 2. Dacă noua energie e mai mare (mai proastă) -> ACCEPTĂM cu probabilitate P
   *    P = exp((E_curent - E_nou) / T) = exp(-ΔE / T)
   * 
   * @param currentEnergy - Energia conformației curente
   * @param newEnergy - Energia conformației vecine
   * @param temperature - Temperatura curentă
   * @returns boolean - true dacă acceptăm mișcarea, false altfel
   */
  private acceptMove(currentEnergy: number, newEnergy: number, temperature: number): boolean {
    // CAZURI SPECIALE pentru energii infinite (conformații invalide)
    
    // Caz 1: Ambele sunt invalide -> nu acceptăm
    if (currentEnergy === Number.POSITIVE_INFINITY && newEnergy === Number.POSITIVE_INFINITY) {
      return false;
    }

    // Caz 2: Curentă e invalidă, nouă e validă -> ACCEPTĂM întotdeauna
    if (currentEnergy === Number.POSITIVE_INFINITY && newEnergy !== Number.POSITIVE_INFINITY) {
      return true;
    }

    // Caz 3: Curentă e validă, nouă e invalidă -> acceptăm cu probabilitate foarte mică
    if (currentEnergy !== Number.POSITIVE_INFINITY && newEnergy === Number.POSITIVE_INFINITY) {
      if (temperature > 0) {
        // Probabilitate foarte mică de a accepta soluții invalide
        const acceptanceProbability = Math.exp(-10 / temperature);
        return Math.random() < acceptanceProbability;
      }
      return false;
    }

    // CAZUL NORMAL: Ambele energii sunt finite
    
    // Dacă noua conformație e MAI BUNĂ (energie mai mică) -> ACCEPTĂM întotdeauna
    if (newEnergy < currentEnergy) {
      return true;
    }

    // Dacă noua conformație e MAI PROASTĂ -> acceptăm cu probabilitate Boltzmann
    if (temperature > 0) {
      // Formula Boltzmann: P = exp(-ΔE / T)
      // ΔE = newEnergy - currentEnergy (pozitiv, pentru că newEnergy > currentEnergy)
      // Echivalent: P = exp((currentEnergy - newEnergy) / T)
      const acceptanceProbability = Math.exp((currentEnergy - newEnergy) / temperature);
      
      // Generăm un număr aleatoriu între 0 și 1 și comparăm cu probabilitatea
      return Math.random() < acceptanceProbability;
    }

    // Temperatura e 0 și mișcarea e proastă -> nu acceptăm
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
