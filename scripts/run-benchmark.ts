/**
 * Run solver benchmarks from terminal:
 *   npm run benchmark
 *
 * Runs SA, MC, and GA × 30 trials each and prints stats + LaTeX table.
 */

import { runAllBenchmarks } from "../lib/solvers/run-benchmarks";

runAllBenchmarks().catch(console.error);
