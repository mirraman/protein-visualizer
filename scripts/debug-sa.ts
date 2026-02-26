/**
 * Debug SA line-by-line: run a single trial with verbose logging.
 * Usage: npx ts-node -P tsconfig.scripts.json scripts/debug-sa.ts
 */

import { SimulatedAnnealingSolver } from "../lib/solvers/simulated-annealing";
import { EnergyCalculator } from "../lib/solvers/energy-calculator";
import type { Direction } from "../lib/types";

const SEQUENCE = "HPHPPHHPHPPHPHHPPHPH";

// Patch SA to add debug hooks
const config = {
  sequence: SEQUENCE,
  maxIterations: 5000, // shorter for debug
  initialTemperature: 8,
  finalTemperature: 0.001,
  coolingRate: 0.999,
  stagnationWindow: 1500,
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
  solverAny.generateNeighbor = function (conf: any) {
    const result = origGenNeighbor(conf);
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

  // Re-run with detailed iteration logging for first 200 iters
  console.log("\n--- Detailed trace (first 500 iterations) ---");
  const solver2 = new SimulatedAnnealingSolver(config);
  const hist: { i: number; current: number; best: number; T: number; accepted: boolean; delta: number }[] = [];
  let lastBest = Infinity;
  let lastCurrent = Infinity;

  // We need to instrument the solve loop - create a custom debug run
  const dirs = (solver2 as any).generateRandomDirections();
  let currentDirs = dirs;
  let currentEnergy = EnergyCalculator.calculateHPEnergy(SEQUENCE, currentDirs);
  let currentFitness = EnergyCalculator.calculateFitness(SEQUENCE, currentDirs, 100);
  let bestEnergy = currentEnergy;
  let bestDirs = currentDirs.slice();
  const T_init = 8;
  const T_final = 0.001;
  const maxIter = 500;

  for (let i = 1; i <= maxIter; i++) {
    const progress = i / maxIter;
    const exponent = progress * progress;
    const T = T_init * Math.pow(T_final / T_init, exponent);

    const conf = {
      sequence: SEQUENCE,
      directions: currentDirs,
      energy: currentEnergy,
      positions: EnergyCalculator.calculatePositions(SEQUENCE, currentDirs),
      fitness: currentFitness,
    };
    const neighbor = (solver2 as any).generateNeighbor(conf);
    const delta = neighbor.fitness - currentFitness;
    const accepted = (solver2 as any).acceptMove(currentFitness, neighbor.fitness, T);

    if (i <= 100 || (i % 100 === 0) || neighbor.energy <= -8) {
      hist.push({
        i,
        current: currentEnergy,
        best: bestEnergy,
        T: Math.round(T * 1000) / 1000,
        accepted,
        delta,
      });
    }

    if (accepted) {
      currentDirs = neighbor.directions.slice();
      currentEnergy = neighbor.energy;
      currentFitness = neighbor.fitness;
      if (neighbor.energy < bestEnergy) {
        bestEnergy = neighbor.energy;
        bestDirs = neighbor.directions.slice();
      }
    }
  }

  console.log("Iter | current | best  | T     | accept | Δfitness");
  for (const h of hist.slice(0, 30)) {
    console.log(
      `${String(h.i).padStart(4)} | ${h.current.toString().padStart(6)} | ${h.best.toString().padStart(5)} | ${h.T.toFixed(3)} | ${h.accepted ? "yes" : "no"}    | ${h.delta}`
    );
  }
  if (hist.length > 30) {
    console.log("...");
    for (const h of hist.slice(-5)) {
      console.log(
        `${String(h.i).padStart(4)} | ${h.current.toString().padStart(6)} | ${h.best.toString().padStart(5)} | ${h.T.toFixed(3)} | ${h.accepted ? "yes" : "no"}    | ${h.delta}`
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
    const n = (solver2 as any).generateNeighbor(c);
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
