import { MonteCarloSolver }            from './monte-carlo';
import { SimulatedAnnealingSolver }    from './simulated-annealing';
import { GeneticAlgorithmSolver }      from './genetic-algorithm';
import { EvolutionStrategiesSolver }   from './evolution-strategies';
import { EvolutionaryProgrammingSolver } from './evolutionary-programming';
import { GeneticProgrammingSolver }    from './genetic-programming';

const SOLVERS: Record<string, any> = {
  'monte-carlo':             MonteCarloSolver,
  'simulated-annealing':     SimulatedAnnealingSolver,
  'genetic-algorithm':       GeneticAlgorithmSolver,
  'evolution-strategies':    EvolutionStrategiesSolver,
  'evolutionary-programming': EvolutionaryProgrammingSolver,
  'genetic-programming':     GeneticProgrammingSolver,
};

self.onmessage = async (e: MessageEvent) => {
  const { algorithm, parameters } = e.data;

  const SolverClass = SOLVERS[algorithm];
  if (!SolverClass) {
    self.postMessage({ type: 'error', message: `Unknown algorithm: ${algorithm}` });
    return;
  }

  const solver = new SolverClass({
    ...parameters,
    // Progress updates are sent back to the main thread via postMessage
    onProgress: (progress: any) => {
      self.postMessage({ type: 'progress', payload: progress });
    },
  });

  try {
    const result = await solver.solve();
    self.postMessage({ type: 'result', payload: result });
  } catch (err: any) {
    self.postMessage({ type: 'error', message: err?.message ?? 'Unknown error' });
  }
};
