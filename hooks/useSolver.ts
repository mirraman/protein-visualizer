import { useState, useRef, useCallback } from 'react';
import type { SolverResult } from '@/lib/solvers/types';

export type SolverProgress = {
  iteration:     number;
  currentEnergy: number;
  bestEnergy:    number;
  progress:      number; // 0–100
};

export function useSolver() {
  const [result,   setResult]   = useState<SolverResult | null>(null);
  const [progress, setProgress] = useState<SolverProgress | null>(null);
  const [running,  setRunning]  = useState(false);
  const [error,    setError]    = useState<string | null>(null);
  const workerRef               = useRef<Worker | null>(null);

  const run = useCallback((algorithm: string, parameters: Record<string, any>) => {
    // Kill any previous run
    workerRef.current?.terminate();

    setRunning(true);
    setError(null);
    setResult(null);
    setProgress(null);

    // Next.js resolves this URL at build time — the worker is bundled automatically
    const worker = new Worker(
      new URL('../lib/solvers/solver.worker.ts', import.meta.url)
    );
    workerRef.current = worker;

    worker.onmessage = (e: MessageEvent) => {
      const { type, payload, message } = e.data;

      if (type === 'progress') {
        setProgress(payload);
      }
      if (type === 'result') {
        setResult(payload);
        setRunning(false);
      }
      if (type === 'error') {
        setError(message);
        setRunning(false);
      }
    };

    worker.onerror = (err) => {
      setError(err.message ?? 'Worker error');
      setRunning(false);
    };

    worker.postMessage({ algorithm, parameters });
  }, []);

  const stop = useCallback(() => {
    workerRef.current?.terminate();
    workerRef.current = null;
    setRunning(false);
  }, []);

  return { run, stop, result, progress, running, error };
}
