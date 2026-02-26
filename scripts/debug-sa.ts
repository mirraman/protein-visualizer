/**
 * Debug SA line-by-line: run a single trial with verbose logging.
 * Usage: npx ts-node -P tsconfig.scripts.json scripts/debug-sa.ts
 */

import { SimulatedAnnealingSolver } from "../lib/solvers/simulated-annealing";
import { EnergyCalculator } from "../lib/solvers/energy-calculator";
import type { Direction } from "../lib/types";

const SEQUENCE = "HPHPPHHPHPPHPHHPPHPH";

// Patch SA to add debug hooks — use same config as run-benchmarks (geometric cooling, stagnationWindow=300)
const config = {
  sequence: SEQUENCE,
  maxIterations: 5000, // shorter for debug
  initialTemperature: 8,
  finalTemperature: 0.05,
  coolingRate: 0.999, // ignored — auto-computed in constructor
  stagnationWindow: 300,
  latticeType: "2D" as const,
  targetEnergy: -9,
};

async function main() {
  const stats = {
    fallbacks: 0,
    accepted: 0,
    acceptedBetter: 0,
    acceptedWorse: 0,
    rejected: 0,
    pivotMoves: 0,
    pullMoves: 0,
    singleFlipMoves: 0,
    restarts: 0,
    bestAtIter: [] as number[],
  };

  // Create solver and run with progress callback
  const solver = new SimulatedAnnealingSolver({
    ...config,
    onProgress: (p) => {
      if (p.bestEnergy <= -8 && stats.bestAtIter.length < 20) {
        stats.bestAtIter.push(p.iteration);
      }
    },
  });

  // Monkey-patch generateNeighbor to count move types and fallbacks
  const origSolve = solver.solve.bind(solver);
  const solverAny = solver as any;

  const origGenNeighbor = solverAny.generateNeighbor.bind(solverAny);
  solverAny.generateNeighbor = function (conf: any, temperature: number) {
    const result = origGenNeighbor(conf, temperature);
    if (result.directions === conf.directions && result.energy === conf.energy) {
      stats.fallbacks++;
    }
    return result;
  };

  const result = await origSolve();

  console.log("\n=== SA DEBUG RUN ===\n");
  console.log("Final energy:", result.bestConformation.energy);
  console.log("Target: -9");
  console.log("\n--- Stats (estimated from progress intervals) ---");
  console.log("Restarts: (check iteration gaps in energy history)");

  // Re-run with detailed iteration logging — use ACTUAL solver logic (geometric cooling + stagnation restart)
  console.log("\n--- Detailed trace (first 600 iterations, geometric cooling + stagnationWindow=300) ---");
  const solver2 = new SimulatedAnnealingSolver(config);
  const hist: { i: number; current: number; best: number; T: number; accepted: boolean; delta: number; restart?: boolean }[] = [];
  const stagnationWindow = 300;
  const T_init = 8;
  const T_final = 0.05;
  const coolingRate = Math.pow(T_final / T_init, 1 / stagnationWindow);
  const maxIter = 600;

  const useGreedy = Math.random() < 0.5;
  let currentDirs = useGreedy
    ? (solver2 as any).generateGreedyDirections()
    : (solver2 as any).generateRandomDirections();
  let currentEnergy = EnergyCalculator.calculateHPEnergy(SEQUENCE, currentDirs);
  let currentFitness = EnergyCalculator.calculateFitness(SEQUENCE, currentDirs, 100);
  let bestEnergy = currentEnergy;
  let bestDirs = currentDirs.slice();
  let temperature = T_init;
  let lastImprovedAt = 0;

  for (let i = 1; i <= maxIter; i++) {
    let didRestart = false;
    // Stagnation restart (same logic as solve())
    if (i - lastImprovedAt > stagnationWindow) {
      currentDirs = (solver2 as any).perturbBest(bestDirs);
      currentEnergy = EnergyCalculator.calculateHPEnergy(SEQUENCE, currentDirs);
      currentFitness = EnergyCalculator.calculateFitness(SEQUENCE, currentDirs, 100);
      temperature = T_init;
      lastImprovedAt = i;
      didRestart = true;
    }

    const conf = {
      sequence: SEQUENCE,
      directions: currentDirs,
      energy: currentEnergy,
      positions: EnergyCalculator.calculatePositions(SEQUENCE, currentDirs),
      fitness: currentFitness,
    };
    const neighbor = (solver2 as any).generateNeighbor(conf, temperature);
    const delta = neighbor.fitness - currentFitness;
    const accepted = (solver2 as any).acceptMove(currentFitness, neighbor.fitness, temperature);

    const shouldLog = i <= 100 || i % 100 === 0 || i >= maxIter - 10 || neighbor.energy <= -8 || didRestart;
    if (shouldLog) {
      hist.push({
        i,
        current: currentEnergy,
        best: bestEnergy,
        T: Math.round(temperature * 1000) / 1000,
        accepted,
        delta,
        restart: didRestart,
      });
    }

    if (accepted) {
      currentDirs = neighbor.directions.slice();
      currentEnergy = neighbor.energy;
      currentFitness = neighbor.fitness;
      if (neighbor.energy < bestEnergy) {
        bestEnergy = neighbor.energy;
        bestDirs = neighbor.directions.slice();
        lastImprovedAt = i;
      }
    }

    temperature = Math.max(temperature * coolingRate, T_final);
  }

  console.log("Iter | current | best  | T     | accept | Δfitness | restart");
  for (const h of hist.slice(0, 35)) {
    const restart = (h as any).restart ? " RESTART" : "";
    console.log(
      `${String(h.i).padStart(4)} | ${h.current.toString().padStart(6)} | ${h.best.toString().padStart(5)} | ${h.T.toFixed(3)} | ${h.accepted ? "yes" : "no"}    | ${h.delta.toString().padStart(6)}${restart}`
    );
  }
  if (hist.length > 35) {
    console.log("...");
    for (const h of hist.slice(-8)) {
      const restart = (h as any).restart ? " RESTART" : "";
      console.log(
        `${String(h.i).padStart(4)} | ${h.current.toString().padStart(6)} | ${h.best.toString().padStart(5)} | ${h.T.toFixed(3)} | ${h.accepted ? "yes" : "no"}    | ${h.delta.toString().padStart(6)}${restart}`
      );
    }
  }

  console.log("\n--- Fallback rate check ---");
  let fallbackCount = 0;
  for (let trial = 0; trial < 100; trial++) {
    const d = (solver2 as any).generateRandomDirections();
    const c = {
      sequence: SEQUENCE,
      directions: d,
      energy: 0,
      positions: [],
      fitness: 0,
    };
    (c as any).positions = EnergyCalculator.calculatePositions(SEQUENCE, d);
    (c as any).energy = EnergyCalculator.calculateHPEnergy(SEQUENCE, d);
    (c as any).fitness = EnergyCalculator.calculateFitness(SEQUENCE, d, 100);
    const n = (solver2 as any).generateNeighbor(c, 4); // temp=4 for fallback rate check
    if (n.directions === c.directions) fallbackCount++;
  }
  console.log(`Fallback rate: ${fallbackCount}% (over 100 neighbor samples)`);

  console.log("\n--- Energy distribution from random starts ---");
  const randEnergies: number[] = [];
  for (let i = 0; i < 50; i++) {
    const d = (solver2 as any).generateRandomDirections();
    randEnergies.push(EnergyCalculator.calculateHPEnergy(SEQUENCE, d));
  }
  randEnergies.sort((a, b) => a - b);
  console.log("Random init energies:", randEnergies.slice(0, 15).join(", "), "...");
  console.log("Random Min:", Math.min(...randEnergies), "Max:", Math.max(...randEnergies));

  console.log("\n--- Energy distribution from greedy starts ---");
  const greedyEnergies: number[] = [];
  for (let i = 0; i < 50; i++) {
    const d = (solver2 as any).generateGreedyDirections();
    greedyEnergies.push(EnergyCalculator.calculateHPEnergy(SEQUENCE, d));
  }
  greedyEnergies.sort((a, b) => a - b);
  console.log("Greedy init energies:", greedyEnergies.slice(0, 15).join(", "), "...");
  console.log("Greedy Min:", Math.min(...greedyEnergies), "Max:", Math.max(...greedyEnergies));
}

main().catch(console.error);
