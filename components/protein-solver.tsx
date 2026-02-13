"use client";

import React, { useState, useRef, forwardRef, useImperativeHandle } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Slider } from "@/components/ui/slider";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Progress } from "@/components/ui/progress";
import { Canvas, useThree } from "@react-three/fiber";
import { OrbitControls, OrthographicCamera } from "@react-three/drei";
import ProteinModel from "./protein-model";
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from "recharts";
import { ChevronDown, ChevronUp, Download } from "lucide-react";
import { Direction } from "@/lib/types";
import {
  MonteCarloSolver,
  SimulatedAnnealingSolver,
  GeneticAlgorithmSolver,
  EvolutionStrategiesSolver,
  EvolutionaryProgrammingSolver,
  GeneticProgrammingSolver,
  type SolverResult,
  type Conformation,
} from "@/lib/solvers";

interface ProteinSolverProps {
  sequence: string;
  initialDirections?: Direction[];
  onOptimizationComplete: (
    directions: Direction[],
    energy: number,
    positions?: Array<{ x: number; y: number; z: number }>,
    hhContacts?: number
  ) => void;
}

interface ScreenshotHandle {
  capture: () => string;
}

const CanvasScreenshot = forwardRef<ScreenshotHandle>((_, ref) => {
  const { gl, scene, camera } = useThree();
  useImperativeHandle(ref, () => ({
    capture: () => {
      gl.render(scene, camera);
      return gl.domElement.toDataURL("image/png");
    },
  }));
  return null;
});

type AlgorithmType =
  | "monte-carlo"
  | "simulated-annealing"
  | "ga"
  | "es"
  | "ep"
  | "gp";

const ProteinSolver: React.FC<ProteinSolverProps> = ({
  sequence,
  initialDirections,
  onOptimizationComplete,
}) => {
  // Algorithm selection and parameters
  const [algorithmType, setAlgorithmType] =
    useState<AlgorithmType>("monte-carlo");
  const [iterations, setIterations] = useState([1000]);
  const [populationSize, setPopulationSize] = useState([50]); // For Monte Carlo
  const [temperature, setTemperature] = useState([10]); // For Simulated Annealing
  
  // Lattice Parameter
  const [latticeType, setLatticeType] = useState<"2D" | "3D">("2D");

  // GA parameters
  const [crossoverRate, setCrossoverRate] = useState([0.9]);
  const [mutationRate, setMutationRate] = useState([0.1]);
  const [eliteCount, setEliteCount] = useState([3]);
  const [tournamentSize, setTournamentSize] = useState([3]);

  // ES parameters
  const [mu, setMu] = useState([25]);
  const [lambda, setLambda] = useState([150]);
  const [initialMutationRate, setInitialMutationRate] = useState([0.1]);

  // EP parameters
  const [epMutationRate, setEpMutationRate] = useState([0.1]);

  // GP parameters
  const [maxTreeDepth, setMaxTreeDepth] = useState([4]);
  const [gpCrossoverRate, setGpCrossoverRate] = useState([0.9]);
  const [gpMutationRate, setGpMutationRate] = useState([0.2]);

  // Solver state
  const [isRunning, setIsRunning] = useState(false);
  const [progress, setProgress] = useState(0);
  const [currentResult, setCurrentResult] = useState<SolverResult | null>(null);
  const [bestConformation, setBestConformation] = useState<Conformation | null>(
    null
  );

  // UI state
  const [showDetails, setShowDetails] = useState(false);
  
  // Ref for export
  const screenshotRef = useRef<ScreenshotHandle>(null);

  const handleExportImage = () => {
    if (screenshotRef.current) {
      try {
        const dataUrl = screenshotRef.current.capture();
        const link = document.createElement("a");
        link.download = `protein-visualization-${latticeType}.png`;
        link.href = dataUrl;
        link.click();
      } catch (err) {
        console.error("Failed to export image:", err);
      }
    }
  };

  const runSolver = async () => {
    if (!sequence) return;

    setIsRunning(true);
    setProgress(0);
    setCurrentResult(null);
    setBestConformation(null);

    try {
      let solver;

      if (algorithmType === "monte-carlo") {
        solver = new MonteCarloSolver({
          sequence,
          maxIterations: iterations[0],
          populationSize: populationSize[0],
          initialDirections,
          latticeType,
        });
      } else if (algorithmType === "simulated-annealing") {
        solver = new SimulatedAnnealingSolver({
          sequence,
          maxIterations: iterations[0],
          initialTemperature: temperature[0],
          finalTemperature: 0.01,
          coolingRate: 0.95,
          initialDirections,
          latticeType,
        });
      } else if (algorithmType === "ga") {
        solver = new GeneticAlgorithmSolver({
          sequence,
          maxIterations: iterations[0],
          populationSize: populationSize[0],
          crossoverRate: crossoverRate[0],
          mutationRate: mutationRate[0],
          eliteCount: eliteCount[0],
          tournamentSize: tournamentSize[0],
          initialDirections,
          latticeType,
        });
      } else if (algorithmType === "es") {
        solver = new EvolutionStrategiesSolver({
          sequence,
          maxIterations: iterations[0],
          mu: mu[0],
          lambda: lambda[0],
          initialMutationRate: initialMutationRate[0],
          mutationDecay: 0.97,
          mutationBoost: 1.1,
          stagnationWindow: 10,
          plusSelection: true,
          initialDirections,
          latticeType,
        });
      } else if (algorithmType === "ep") {
        solver = new EvolutionaryProgrammingSolver({
          sequence,
          maxIterations: iterations[0],
          populationSize: populationSize[0],
          mutationRate: epMutationRate[0],
          tournamentSize: tournamentSize[0],
          eliteCount: 2,
          initialDirections,
          latticeType,
        });
      } else if (algorithmType === "gp") {
        solver = new GeneticProgrammingSolver({
          sequence,
          maxIterations: iterations[0],
          populationSize: populationSize[0],
          maxTreeDepth: maxTreeDepth[0],
          crossoverRate: gpCrossoverRate[0],
          mutationRate: gpMutationRate[0],
          eliteCount: eliteCount[0],
          tournamentSize: tournamentSize[0],
          rolloutCount: 1,
          initialDirections,
          latticeType,
        });
      } else {
        throw new Error(`Unknown algorithm type: ${algorithmType}`);
      }

      // Run solver with progress updates
      const result = await solver.solve();

      setCurrentResult(result);
      setBestConformation(result.bestConformation);
      setProgress(100);

      // Calculate H-H contacts for the best conformation
      let hhContacts = 0;
      for (let i = 0; i < result.bestConformation.sequence.length; i++) {
        if (result.bestConformation.sequence[i] === "H") {
          for (let j = i + 2; j < result.bestConformation.sequence.length; j++) {
            if (result.bestConformation.sequence[j] === "H") {
              const dx = Math.abs(result.bestConformation.positions[i].x - result.bestConformation.positions[j].x);
              const dy = Math.abs(result.bestConformation.positions[i].y - result.bestConformation.positions[j].y);
              const dz = Math.abs(result.bestConformation.positions[i].z - result.bestConformation.positions[j].z);
              if (dx + dy + dz === 1) {
                hhContacts++;
              }
            }
          }
        }
      }

      // Notify parent component with full results
      onOptimizationComplete(
        result.bestConformation.directions,
        result.bestConformation.energy,
        result.bestConformation.positions,
        hhContacts
      );
    } catch (error) {
      console.error("Solver error:", error);
    } finally {
      setIsRunning(false);
    }
  };

  if (!sequence) {
    return (
      <Card>
        <CardContent className="pt-6">
          <div className="flex flex-col items-center justify-center space-y-4 py-8">
            <p className="text-gray-600 text-center">
              Please provide a protein sequence to use the solver. The sequence
              should consist of H (hydrophobic) and P (polar) residues.
            </p>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      {/* Configuration Card */}
      <div className="space-y-4">
          {/* Compact Algorithm Configuration */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-lg">Solver Configuration</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="space-y-2">
                <Label>Algorithm</Label>
                <Select
                  value={algorithmType}
                  onValueChange={(value: AlgorithmType) =>
                    setAlgorithmType(value)
                  }
                  disabled={isRunning}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="monte-carlo">
                      Monte Carlo Sampling
                    </SelectItem>
                    <SelectItem value="simulated-annealing">
                      Simulated Annealing
                    </SelectItem>
                    <SelectItem value="ga">Genetic Algorithm (GA)</SelectItem>
                    <SelectItem value="es">
                      Evolution Strategies (ES)
                    </SelectItem>
                    <SelectItem value="ep">
                      Evolutionary Programming (EP)
                    </SelectItem>
                    <SelectItem value="gp">Genetic Programming (GP)</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label>Lattice Type</Label>
                <Select
                  value={latticeType}
                  onValueChange={(value: "2D" | "3D") => {
                    setLatticeType(value);
                    setCurrentResult(null);
                    setBestConformation(null);
                  }}
                  disabled={isRunning}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="2D">2D Square Lattice</SelectItem>
                    <SelectItem value="3D">3D Cubic Lattice</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label className="text-sm">Iterations: {iterations[0]}</Label>
                <Slider
                  value={iterations}
                  onValueChange={setIterations}
                  min={100}
                  max={10000}
                  step={100}
                  disabled={isRunning}
                />
              </div>

              {algorithmType === "monte-carlo" && (
                <div className="space-y-2">
                  <Label className="text-sm">
                    Population Size: {populationSize[0]}
                  </Label>
                  <Slider
                    value={populationSize}
                    onValueChange={setPopulationSize}
                    min={10}
                    max={200}
                    step={10}
                    disabled={isRunning}
                  />
                </div>
              )}

              {algorithmType === "simulated-annealing" && (
                <div className="space-y-2">
                  <Label className="text-sm">
                    Initial Temperature: {temperature[0]}
                  </Label>
                  <Slider
                    value={temperature}
                    onValueChange={setTemperature}
                    min={1}
                    max={50}
                    step={1}
                    disabled={isRunning}
                  />
                </div>
              )}

              {algorithmType === "ga" && (
                <div className="space-y-3">
                  <div className="space-y-2">
                    <Label className="text-sm">
                      Population Size: {populationSize[0]}
                    </Label>
                    <Slider
                      value={populationSize}
                      onValueChange={setPopulationSize}
                      min={20}
                      max={200}
                      step={10}
                      disabled={isRunning}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label className="text-sm">
                      Crossover Rate: {crossoverRate[0].toFixed(2)}
                    </Label>
                    <Slider
                      value={crossoverRate}
                      onValueChange={setCrossoverRate}
                      min={0.1}
                      max={1.0}
                      step={0.05}
                      disabled={isRunning}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label className="text-sm">
                      Mutation Rate: {mutationRate[0].toFixed(2)}
                    </Label>
                    <Slider
                      value={mutationRate}
                      onValueChange={setMutationRate}
                      min={0.01}
                      max={0.5}
                      step={0.01}
                      disabled={isRunning}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label className="text-sm">
                      Elite Count: {eliteCount[0]}
                    </Label>
                    <Slider
                      value={eliteCount}
                      onValueChange={setEliteCount}
                      min={1}
                      max={10}
                      step={1}
                      disabled={isRunning}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label className="text-sm">
                      Tournament Size: {tournamentSize[0]}
                    </Label>
                    <Slider
                      value={tournamentSize}
                      onValueChange={setTournamentSize}
                      min={2}
                      max={10}
                      step={1}
                      disabled={isRunning}
                    />
                  </div>
                </div>
              )}

              {algorithmType === "es" && (
                <div className="space-y-3">
                  <div className="space-y-2">
                    <Label className="text-sm">Parents (μ): {mu[0]}</Label>
                    <Slider
                      value={mu}
                      onValueChange={setMu}
                      min={10}
                      max={50}
                      step={5}
                      disabled={isRunning}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label className="text-sm">
                      Offspring (λ): {lambda[0]}
                    </Label>
                    <Slider
                      value={lambda}
                      onValueChange={setLambda}
                      min={50}
                      max={300}
                      step={10}
                      disabled={isRunning}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label className="text-sm">
                      Initial Mutation Rate: {initialMutationRate[0].toFixed(2)}
                    </Label>
                    <Slider
                      value={initialMutationRate}
                      onValueChange={setInitialMutationRate}
                      min={0.01}
                      max={0.5}
                      step={0.01}
                      disabled={isRunning}
                    />
                  </div>
                </div>
              )}

              {algorithmType === "ep" && (
                <div className="space-y-3">
                  <div className="space-y-2">
                    <Label className="text-sm">
                      Population Size: {populationSize[0]}
                    </Label>
                    <Slider
                      value={populationSize}
                      onValueChange={setPopulationSize}
                      min={20}
                      max={200}
                      step={10}
                      disabled={isRunning}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label className="text-sm">
                      Mutation Rate: {epMutationRate[0].toFixed(2)}
                    </Label>
                    <Slider
                      value={epMutationRate}
                      onValueChange={setEpMutationRate}
                      min={0.01}
                      max={0.5}
                      step={0.01}
                      disabled={isRunning}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label className="text-sm">
                      Tournament Size: {tournamentSize[0]}
                    </Label>
                    <Slider
                      value={tournamentSize}
                      onValueChange={setTournamentSize}
                      min={2}
                      max={10}
                      step={1}
                      disabled={isRunning}
                    />
                  </div>
                </div>
              )}

              {algorithmType === "gp" && (
                <div className="space-y-3">
                  <div className="space-y-2">
                    <Label className="text-sm">
                      Population Size: {populationSize[0]}
                    </Label>
                    <Slider
                      value={populationSize}
                      onValueChange={setPopulationSize}
                      min={20}
                      max={200}
                      step={10}
                      disabled={isRunning}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label className="text-sm">
                      Max Tree Depth: {maxTreeDepth[0]}
                    </Label>
                    <Slider
                      value={maxTreeDepth}
                      onValueChange={setMaxTreeDepth}
                      min={2}
                      max={8}
                      step={1}
                      disabled={isRunning}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label className="text-sm">
                      Crossover Rate: {gpCrossoverRate[0].toFixed(2)}
                    </Label>
                    <Slider
                      value={gpCrossoverRate}
                      onValueChange={setGpCrossoverRate}
                      min={0.1}
                      max={1.0}
                      step={0.05}
                      disabled={isRunning}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label className="text-sm">
                      Mutation Rate: {gpMutationRate[0].toFixed(2)}
                    </Label>
                    <Slider
                      value={gpMutationRate}
                      onValueChange={setGpMutationRate}
                      min={0.01}
                      max={0.5}
                      step={0.01}
                      disabled={isRunning}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label className="text-sm">
                      Elite Count: {eliteCount[0]}
                    </Label>
                    <Slider
                      value={eliteCount}
                      onValueChange={setEliteCount}
                      min={1}
                      max={10}
                      step={1}
                      disabled={isRunning}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label className="text-sm">
                      Tournament Size: {tournamentSize[0]}
                    </Label>
                    <Slider
                      value={tournamentSize}
                      onValueChange={setTournamentSize}
                      min={2}
                      max={10}
                      step={1}
                      disabled={isRunning}
                    />
                  </div>
                </div>
              )}

              <Button
                onClick={runSolver}
                disabled={isRunning}
                className="w-full"
              >
                {isRunning ? "Running..." : "Start Optimization"}
              </Button>

              {isRunning && (
                <div className="space-y-2">
                  <Label className="text-sm">Progress</Label>
                  <Progress value={progress} />
                </div>
              )}
            </CardContent>
          </Card>

          {/* Energy Results - Compact */}
          {currentResult && (
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-base font-semibold">Results</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid grid-cols-2 gap-3">
                  <div className="text-center p-3 bg-blue-50 rounded-lg border border-blue-200">
                    <div className="text-xl font-bold text-blue-700">
                      {currentResult.bestConformation.energy.toFixed(2)}
                    </div>
                    <div className="text-xs text-gray-600 mt-1">Best Energy</div>
                  </div>
                  <div className="text-center p-3 bg-green-50 rounded-lg border border-green-200">
                    <div className="text-xl font-bold text-green-700">
                      {currentResult.totalIterations}
                    </div>
                    <div className="text-xs text-gray-600 mt-1">Iterations</div>
                  </div>
                </div>
                
                {/* Energy Evolution Chart - Compact */}
                {currentResult.energyHistory && currentResult.energyHistory.length > 0 && (
                  <div>
                    <div className="text-sm font-medium mb-2 text-gray-700">Energy Evolution</div>
                    <div className="h-32">
                      <ResponsiveContainer width="100%" height="100%">
                        <LineChart data={currentResult.energyHistory}>
                          <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                          <XAxis 
                            dataKey="iteration" 
                            tick={{ fontSize: 10 }}
                            stroke="#6b7280"
                          />
                          <YAxis 
                            tick={{ fontSize: 10 }}
                            stroke="#6b7280"
                          />
                          <Tooltip 
                            contentStyle={{ 
                              fontSize: '12px',
                              padding: '8px',
                              backgroundColor: 'white',
                              border: '1px solid #e5e7eb',
                              borderRadius: '6px'
                            }}
                          />
                          <Line
                            type="monotone"
                            dataKey="energy"
                            stroke="#3b82f6"
                            strokeWidth={2}
                            dot={false}
                          />
                        </LineChart>
                      </ResponsiveContainer>
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>
          )}
        </div>

      {/* Show Details Section */}
      {currentResult && (
        <div className="space-y-4">
          {/* Expandable Details Button */}
          <Button
            variant="outline"
            onClick={() => setShowDetails(!showDetails)}
            className="w-full"
          >
            {showDetails ? (
              <>
                <ChevronUp className="w-4 h-4 mr-2" />
                Hide Details
              </>
            ) : (
              <>
                <ChevronDown className="w-4 h-4 mr-2" />
                Show Details
              </>
            )}
          </Button>

          {/* Detailed Results - Expandable */}
          {showDetails && (
            <Card>
              <CardHeader>
                <CardTitle>Detailed Results</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                  <div className="text-center">
                    <div className="text-xl font-bold text-green-600">
                      {currentResult.bestConformation.energy}
                    </div>
                    <div className="text-sm text-gray-600">Best Energy</div>
                  </div>
                  <div className="text-center">
                    <div className="text-xl font-bold">
                      {currentResult.totalIterations}
                    </div>
                    <div className="text-sm text-gray-600">Iterations</div>
                  </div>
                  <div className="text-center">
                    <div className="text-xl font-bold">
                      {currentResult.convergenceTime}ms
                    </div>
                    <div className="text-sm text-gray-600">Time</div>
                  </div>
                  <div className="text-center">
                    <div className="text-xl font-bold font-mono">
                      {currentResult.bestConformation.directions.join("")}
                    </div>
                    <div className="text-sm text-gray-600">Best Directions</div>
                  </div>
                </div>
              </CardContent>
            </Card>
          )}
        </div>
      )}
    </div>
  );
};

export default ProteinSolver;
