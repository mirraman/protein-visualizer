/**
 * Quick SA-only benchmark: 30 runs, prints best/mean/median/std/success rate at -9.
 * Uses same SA_CONFIG as run-benchmarks.ts
 *
 * Run: npx ts-node --transpile-only -P tsconfig.scripts.json scripts/run-sa-only.ts
 */

import { SimulatedAnnealingSolver } from "../lib/solvers/simulated-annealing";

const SEQUENCE = "HPHPPHHPHPPHPHHPPHPH";
const RUNS = 30;
const LATTICE = "2D" as const;
const TARGET_ENERGY = -9;

const SA_CONFIG = {
  sequence: SEQUENCE,
  maxIterations: 10000,
  initialTemperature: 8,
  finalTemperature: 0.05,
  coolingRate: 0.999,
  stagnationWindow: 300,
  latticeType: LATTICE,
};

async function main() {
  const energies: number[] = [];

  console.log("Running Simulated Annealing - 30 trials...\n");

  for (let i = 0; i < RUNS; i++) {
    const solver = new SimulatedAnnealingSolver(SA_CONFIG);
    const result = await solver.solve();
    energies.push(result.bestConformation.energy);
    console.log("  Run " + String(i + 1).padStart(2, "0") + "/" + RUNS + "  ->  energy: " + result.bestConformation.energy);
  }

  const n = energies.length;
  const sorted = [...energies].sort((a, b) => a - b);
  const mean = energies.reduce((a, b) => a + b, 0) / n;
  const std = Math.sqrt(energies.reduce((acc, val) => acc + Math.pow(val - mean, 2), 0) / n);
  const median = n % 2 === 0 ? (sorted[n / 2 - 1] + sorted[n / 2]) / 2 : sorted[Math.floor(n / 2)];
  const successRate = (energies.filter((e) => e <= TARGET_ENERGY).length / n) * 100;

  console.log("\n" + "=".repeat(52));
  console.log("  Simulated Annealing - Stats");
  console.log("=".repeat(52));
  console.log("  Runs          : " + n);
  console.log("  Best energy   : " + sorted[0]);
  console.log("  Mean energy   : " + mean.toFixed(4));
  console.log("  Median energy : " + median.toFixed(4));
  console.log("  Std deviation : " + std.toFixed(4));
  console.log("  Success rate  : " + successRate.toFixed(1) + "%  (target: " + TARGET_ENERGY + ")");
  console.log("=".repeat(52));
}

main().catch(console.error);
