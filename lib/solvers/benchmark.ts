import type { SolverResult } from "./types";

export type BenchmarkStats = {
  runs:      number;
  best:      number;
  worst:     number;
  mean:      number;
  std:       number;   // standard deviation
  median:    number;
};

/**
 * Runs a solver N times and returns energy statistics across all runs.
 * Usage:
 *   const stats = await runBenchmark(
 *     () => new SimulatedAnnealingSolver({ sequence, maxIterations: 10000, ... }),
 *     30
 *   );
 */
export async function runBenchmark(
  createSolver: () => { solve: () => Promise<SolverResult> },
  runs: number = 30
): Promise<BenchmarkStats> {
  const energies: number[] = [];

  for (let i = 0; i < runs; i++) {
    const solver = createSolver();
    const result = await solver.solve();
    energies.push(result.bestConformation.energy);
  }

  energies.sort((a, b) => a - b);

  const mean   = energies.reduce((a, b) => a + b, 0) / runs;
  const std    = Math.sqrt(
    energies.reduce((acc, val) => acc + Math.pow(val - mean, 2), 0) / runs
  );
  const median = runs % 2 === 0
    ? (energies[runs / 2 - 1] + energies[runs / 2]) / 2
    : energies[Math.floor(runs / 2)];

  return {
    runs,
    best:   energies[0],
    worst:  energies[runs - 1],
    mean:   parseFloat(mean.toFixed(4)),
    std:    parseFloat(std.toFixed(4)),
    median: parseFloat(median.toFixed(4)),
  };
}
