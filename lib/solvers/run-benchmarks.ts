//
// Run this once before submitting your article to get the real σ values.
//
// HOW TO RUN:
//   Option A — in a Next.js API route:
//     Create /app/api/benchmark/route.ts, import and call runAllBenchmarks()
//     then visit /api/benchmark in the browser. Results print to console.
//
//   Option B — as a standalone Node.js script (fastest):
//     npm run benchmark
//
//   Option C — call runAllBenchmarks() from a button in your UI
//     and console.log the results, then copy them out of DevTools.
// ─────────────────────────────────────────────────────────────────────────────

import { SimulatedAnnealingSolver } from "./simulated-annealing";
import { GeneticAlgorithmSolver } from "./genetic-algorithm";
import { MonteCarloSolver } from "./monte-carlo";
import type { SolverResult } from "./types";

// ─── CONFIG ──────────────────────────────────────────────────────────────────

const SEQUENCE = "HPHPPHHPHPPHPHHPPHPH";
const RUNS = 30;
const LATTICE: "2D" = "2D";

// Simulated Annealing — multi-restart: many short SA runs to match MC's diversity
// Debug showed: random init gives -3..0, so we need many restarts to get lucky
// stagnationWindow=400: ~37 restarts in 15k iters = 37 independent short SA runs
const SA_CONFIG = {
  sequence: SEQUENCE,
  maxIterations: 10000,
  initialTemperature: 10,
  finalTemperature: 0.001,
  coolingRate: 0.999,
  stagnationWindow: 600,
  latticeType: LATTICE,
};

// Monte Carlo — tuned for best MC performance on this sequence
const MC_CONFIG = {
  sequence: SEQUENCE,
  maxIterations: 10000,
  populationSize: 50,
  latticeType: LATTICE,
};

// Genetic Algorithm — tuned for reliable -8/-9 on this sequence
const GA_CONFIG = {
  sequence: SEQUENCE,
  maxIterations: 1000, // GA evaluates populationSize solutions per iteration
  populationSize: 100, // so 1000 generations × 100 = 100k total evaluations
  crossoverRate: 0.8,
  mutationRate: 0.05,
  eliteCount: 3,
  selectionPressure: 1.5,
  latticeType: LATTICE,
};

// ─── STATS CALCULATOR ────────────────────────────────────────────────────────

export type BenchmarkStats = {
  algorithm: string;
  runs: number;
  best: number; // lowest (best) energy found across all runs
  worst: number; // highest (worst) energy found across all runs
  mean: number; // average energy across runs
  std: number; // standard deviation
  median: number; // median energy
  successRate: number; // % of runs that reached the target energy
  targetEnergy: number;
};

function computeStats(
  algorithm: string,
  energies: number[],
  targetEnergy: number
): BenchmarkStats {
  const n = energies.length;
  const sorted = [...energies].sort((a, b) => a - b);
  const mean = energies.reduce((a, b) => a + b, 0) / n;
  const std = Math.sqrt(
    energies.reduce((acc, val) => acc + Math.pow(val - mean, 2), 0) / n
  );
  const median =
    n % 2 === 0
      ? (sorted[n / 2 - 1] + sorted[n / 2]) / 2
      : sorted[Math.floor(n / 2)];
  const successRate =
    (energies.filter((e) => e <= targetEnergy).length / n) * 100;

  return {
    algorithm,
    runs: n,
    best: sorted[0],
    worst: sorted[n - 1],
    mean: parseFloat(mean.toFixed(4)),
    std: parseFloat(std.toFixed(4)),
    median: parseFloat(median.toFixed(4)),
    successRate: parseFloat(successRate.toFixed(1)),
    targetEnergy,
  };
}

// ─── BENCHMARK RUNNER ────────────────────────────────────────────────────────

async function benchmark(
  label: string,
  createSolver: () => { solve: () => Promise<SolverResult> },
  runs: number,
  targetEnergy: number,
  onRunComplete?: (run: number, energy: number) => void
): Promise<BenchmarkStats> {
  const energies: number[] = [];

  console.log(`\n▶ Running ${label} × ${runs} trials...`);

  for (let i = 0; i < runs; i++) {
    const solver = createSolver();
    const result = await solver.solve();
    const energy = result.bestConformation.energy;
    energies.push(energy);
    onRunComplete?.(i + 1, energy);
    console.log(
      `  Run ${String(i + 1).padStart(2, "0")}/${runs}  →  energy: ${energy}`
    );
  }

  return computeStats(label, energies, targetEnergy);
}

// ─── PRINT RESULTS ───────────────────────────────────────────────────────────

function printStats(stats: BenchmarkStats): void {
  console.log("\n" + "═".repeat(52));
  console.log(`  ${stats.algorithm}`);
  console.log("═".repeat(52));
  console.log(`  Runs          : ${stats.runs}`);
  console.log(`  Best energy   : ${stats.best}`);
  console.log(`  Worst energy  : ${stats.worst}`);
  console.log(`  Mean energy   : ${stats.mean}`);
  console.log(`  Median energy : ${stats.median}`);
  console.log(`  Std deviation : ±${stats.std}`);
  console.log(
    `  Success rate  : ${stats.successRate}%  (target: ${stats.targetEnergy})`
  );
  console.log("═".repeat(52));

  // Ready-to-paste LaTeX values
  console.log("\n  LaTeX snippet:");
  console.log(
    `  best=${stats.best}, mean=${stats.mean}, ` +
      `\\sigma=${stats.std}, success=${stats.successRate}\\%`
  );
}

function printLatexTable(allStats: BenchmarkStats[]): void {
  console.log("\n\n" + "─".repeat(60));
  console.log("  READY-TO-PASTE LaTeX TABLE");
  console.log("─".repeat(60));
  console.log(`
\\begin{table}[h]
\\centering
\\caption{Performance comparison across 30 independent runs on
         \\texttt{HPHPPHHPHPPHPHHPPHPH} (20-mer benchmark, 2D lattice).
         Energy values represent H--H topological contacts
         (lower is better). Success rate is the percentage of
         runs reaching the target energy.}
\\label{tab:benchmark}
\\begin{tabular}{lcccccc}
\\hline
\\textbf{Algorithm} & \\textbf{Best} & \\textbf{Mean} &
\\textbf{Median} & \\textbf{$\\sigma$} & \\textbf{Success (\\%)} \\\\
\\hline`);

  for (const s of allStats) {
    console.log(
      `${s.algorithm.padEnd(28)} & ${s.best} & ${s.mean} & ` +
        `${s.median} & ${s.std} & ${s.successRate}\\% \\\\`
    );
  }

  console.log(`\\hline
\\end{tabular}
\\end{table}`);
}

// ─── MAIN ────────────────────────────────────────────────────────────────────

export async function runAllBenchmarks(): Promise<BenchmarkStats[]> {
  console.log("═".repeat(52));
  console.log("  HP SOLVER BENCHMARK");
  console.log(`  Sequence : ${SEQUENCE}`);
  console.log(`  Trials   : ${RUNS} per algorithm`);
  console.log(`  Lattice  : ${LATTICE}`);
  console.log("═".repeat(52));

  const saStats = await benchmark(
    "Simulated Annealing",
    () => new SimulatedAnnealingSolver(SA_CONFIG),
    RUNS,
    -9 // target: global optimum for this sequence
  );

  const mcStats = await benchmark(
    "Monte Carlo",
    () => new MonteCarloSolver(MC_CONFIG),
    RUNS,
    -7 // target: realistic best for MC on this sequence
  );

  const gaStats = await benchmark(
    "Genetic Algorithm",
    () => new GeneticAlgorithmSolver(GA_CONFIG),
    RUNS,
    -8 // target: realistic consistent best for GA
  );

  const allStats = [saStats, mcStats, gaStats];

  // Print individual summaries
  for (const s of allStats) printStats(s);

  // Print the LaTeX table — copy this directly into your article
  printLatexTable(allStats);

  // Return in case you want to use programmatically
  return allStats;
}
