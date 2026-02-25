import { useState, useRef, useCallback } from 'react';
import type { SolverResult } from '@/lib/solvers/types';

export type ParallelProgress = {
  workerId:   number;
  iteration:  number;
  bestEnergy: number;
  progress:   number;
};

export type ParallelResult = {
  best:        SolverResult;
  allResults:  SolverResult[];
  workerCount: number;
};

export function useParallelSolver() {
  const [result,   setResult]   = useState<ParallelResult | null>(null);
  const [progress, setProgress] = useState<ParallelProgress[]>([]);
  const [running,  setRunning]  = useState(false);
  const [error,    setError]    = useState<string | null>(null);
  const workersRef              = useRef<Worker[]>([]);
  const resultsRef              = useRef<(SolverResult | null)[]>([]);
  const progressRef             = useRef<ParallelProgress[]>([]);

  const runParallel = useCallback((
    algorithm:   string,
    parameters:  Record<string, any>,
    workerCount: number = navigator.hardwareConcurrency ?? 4
  ) => {
    // Kill any existing workers
    workersRef.current.forEach(w => w.terminate());

    setRunning(true);
    setError(null);
    setResult(null);
    setProgress([]);

    resultsRef.current  = new Array(workerCount).fill(null);
    progressRef.current = new Array(workerCount).fill(null).map((_, i) => ({
      workerId: i, iteration: 0, bestEnergy: 0, progress: 0,
    }));

    let completedWorkers = 0;

    workersRef.current = Array.from({ length: workerCount }, (_, workerId) => {
      const worker = new Worker(
        new URL('../lib/solvers/solver.worker.ts', import.meta.url)
      );

      worker.onmessage = (e: MessageEvent) => {
        const { type, payload, message } = e.data;

        if (type === 'progress') {
          progressRef.current[workerId] = { ...payload, workerId };
          setProgress([...progressRef.current]);
        }

        if (type === 'result') {
          resultsRef.current[workerId] = payload;
          completedWorkers++;

          if (completedWorkers === workerCount) {
            const allResults = resultsRef.current.filter(Boolean) as SolverResult[];
            const best = allResults.reduce((b, r) =>
              r.bestConformation.energy < b.bestConformation.energy ? r : b,
              allResults[0]
            );
            setResult({ best, allResults, workerCount });
            setRunning(false);
          }
        }

        if (type === 'error') {
          setError(`Worker ${workerId}: ${message}`);
          setRunning(false);
        }
      };

      worker.onerror = (err) => {
        setError(`Worker ${workerId} crashed: ${err.message}`);
        setRunning(false);
      };

      // Slight maxIterations variation per worker so populations diverge
      worker.postMessage({
        algorithm,
        parameters: { ...parameters, maxIterations: parameters.maxIterations + workerId },
      });

      return worker;
    });
  }, []);

  const stop = useCallback(() => {
    workersRef.current.forEach(w => w.terminate());
    workersRef.current = [];
    setRunning(false);
  }, []);

  return { runParallel, stop, result, progress, running, error };
}
