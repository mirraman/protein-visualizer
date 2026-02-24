"use client";

import React, { useState, useCallback, Suspense, useRef, forwardRef, useImperativeHandle, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Slider } from "@/components/ui/slider";
import { Checkbox } from "@/components/ui/checkbox";
import { useSession } from "next-auth/react";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Progress } from "@/components/ui/progress";
import { Skeleton } from "@/components/ui/skeleton";
import { Canvas, useThree } from "@react-three/fiber";
import { OrbitControls, OrthographicCamera, Html } from "@react-three/drei";
import ProteinModel from "./protein-model";
import { PopulationVisualizer } from "./population-visualizer";
import { ConnectionDetailsTable } from "./connection-details-table";
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
  ProteinSolverService,
  type SolverConfig,
  type SolverProgress,
} from "@/lib/services/protein-solver-service";
import type { SolverResult, Conformation } from "@/lib/solvers";

interface ProteinSolverRefactoredProps {
  sequence: string;
  initialDirections?: Direction[];
  onOptimizationComplete: (directions: Direction[], energy: number) => void;
}

type AlgorithmType =
  | "monte-carlo"
  | "simulated-annealing"
  | "ga"
  | "es"
  | "ep"
  | "gp";

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

const ProteinSolverRefactored: React.FC<ProteinSolverRefactoredProps> = ({
  sequence,
  initialDirections,
  onOptimizationComplete,
}) => {
  // Use provided sequence
  const activeSequence = sequence;

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
  const [selectionPressure, setSelectionPressure] = useState([1.5]);

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
  const [progress, setProgress] = useState<SolverProgress | null>(null);
  const [currentResult, setCurrentResult] = useState<SolverResult | null>(null);
  const [bestConformation, setBestConformation] = useState<Conformation | null>(
    null
  );

  // UI state
  const [showDetails, setShowDetails] = useState(false);
  const [saveGenerations, setSaveGenerations] = useState(false);
  const [showPopulationView, setShowPopulationView] = useState(false);
  const [savedGenerations, setSavedGenerations] = useState<any[]>([]);
  const [showConnectionTable, setShowConnectionTable] = useState(false);

  // Session for userId
  const { data: session } = useSession();

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

  // Solver service instance
  const [solverService] = useState(() => new ProteinSolverService());

  const runSolver = useCallback(async () => {
    if (!activeSequence) return;

    // Validate sequence before running
    if (!validateSequence(activeSequence)) return;

    setIsRunning(true);
    setProgress(null);
    setCurrentResult(null);
    setBestConformation(null);

    try {
      const config: SolverConfig = {
        algorithm: algorithmType,
        sequence: activeSequence,
        initialDirections,
        maxIterations: iterations[0],
        latticeType,
        populationSize:
          algorithmType === "monte-carlo" ||
          algorithmType === "ga" ||
          algorithmType === "ep" ||
          algorithmType === "gp"
            ? populationSize[0]
            : undefined,
        initialTemperature:
          algorithmType === "simulated-annealing" ? temperature[0] : undefined,
        finalTemperature:
          algorithmType === "simulated-annealing" ? 0.01 : undefined,
        coolingRate: algorithmType === "simulated-annealing" ? 0.95 : undefined,
        // GA parameters
        crossoverRate: algorithmType === "ga" ? crossoverRate[0] : undefined,
        mutationRate:
          algorithmType === "ga" || algorithmType === "ep"
            ? algorithmType === "ga"
              ? mutationRate[0]
              : epMutationRate[0]
            : undefined,
        eliteCount:
          algorithmType === "ga" || algorithmType === "gp"
            ? eliteCount[0]
            : undefined,
        tournamentSize:
          algorithmType === "ep" ||
          algorithmType === "gp"
            ? tournamentSize[0]
            : undefined,
        selectionPressure:
          algorithmType === "ga"
            ? selectionPressure[0]
            : undefined,
        // ES parameters
        mu: algorithmType === "es" ? mu[0] : undefined,
        lambda: algorithmType === "es" ? lambda[0] : undefined,
        initialMutationRate:
          algorithmType === "es" ? initialMutationRate[0] : undefined,
        // GP parameters
        maxTreeDepth: algorithmType === "gp" ? maxTreeDepth[0] : undefined,
        // Population saving (only for GA)
        saveGenerations: algorithmType === "ga" ? saveGenerations : false,
        userId: algorithmType === "ga" && saveGenerations && session?.user?.id ? session.user.id : undefined,
        experimentName: algorithmType === "ga" && saveGenerations ? `GA-${activeSequence.substring(0, 10)}-${Date.now()}` : undefined,
      };

      const result = await solverService.solve(config, {
        onProgress: (progressData) => {
          setProgress(progressData);
        },
        onComplete: async (result) => {
          setCurrentResult(result);
          setBestConformation(result.bestConformation);
          setProgress({ ...progress!, progress: 100 });
          
          // Load saved generations if GA was used with saveGenerations enabled
          if (algorithmType === "ga" && saveGenerations && session?.user?.id) {
            try {
              const response = await fetch(
                `/api/ga-populations?sequence=${encodeURIComponent(activeSequence)}&userId=${session.user.id}`
              );
              if (response.ok) {
                const data = await response.json();
                setSavedGenerations(data.data || []);
                if (data.data && data.data.length > 0) {
                  setShowPopulationView(true);
                }
              }
            } catch (error) {
              console.error("Failed to load saved generations:", error);
            }
          }
          
          // Only call onOptimizationComplete if we have initialDirections (meaning we're working with existing protein data)
          if (initialDirections) {
            onOptimizationComplete(
              result.bestConformation.directions,
              result.bestConformation.energy
            );
          }
        },
        onError: (error) => {
          console.error("Solver error:", error);
        },
      });
    } catch (error) {
      console.error("Solver execution failed:", error);
    } finally {
      setIsRunning(false);
    }
  }, [
    activeSequence,
    algorithmType,
    iterations,
    populationSize,
    temperature,
    latticeType,
    initialDirections,
    solverService,
    onOptimizationComplete,
    saveGenerations,
    session?.user?.id,
    activeSequence,
  ]);

  const stopSolver = useCallback(() => {
    solverService.stop();
    setIsRunning(false);
  }, [solverService]);

  const validateSequence = (seq: string) => {
    if (!seq) {
      return false;
    }
    if (!/^[HP]+$/.test(seq)) {
      return false;
    }
    if (seq.length < 2) {
      return false;
    }
    return true;
  };

  if (!activeSequence) {
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
      {/* Main Layout Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Left Column: Configuration + Energy */}
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
                      max={1000}
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
                      Selection Pressure: {selectionPressure[0].toFixed(1)}
                    </Label>
                    <Slider
                      value={selectionPressure}
                      onValueChange={setSelectionPressure}
                      min={1.0}
                      max={2.0}
                      step={0.1}
                      disabled={isRunning}
                    />
                  </div>
                  <div className="flex items-center space-x-2 pt-2">
                    <Checkbox
                      id="saveGenerations"
                      checked={saveGenerations}
                      onCheckedChange={(checked) => setSaveGenerations(checked === true)}
                      disabled={isRunning || !session?.user?.id}
                    />
                    <Label
                      htmlFor="saveGenerations"
                      className="text-sm font-normal cursor-pointer"
                    >
                      Save all generations to database
                      {!session?.user?.id && (
                        <span className="text-xs text-gray-500 block">
                          (Sign in required)
                        </span>
                      )}
                    </Label>
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

              <div className="flex gap-2">
                <Button
                  onClick={runSolver}
                  disabled={isRunning}
                  className="flex-1"
                >
                  {isRunning ? "Running..." : "Start Optimization"}
                </Button>
                {isRunning && (
                  <Button
                    onClick={stopSolver}
                    variant="outline"
                    className="flex-1"
                  >
                    Stop
                  </Button>
                )}
              </div>

              {isRunning && progress && (
                <div className="space-y-2">
                  <div className="flex justify-between text-sm">
                    <span>Progress</span>
                    <span>{Math.round(progress.progress)}%</span>
                  </div>
                  <Progress value={progress.progress} />
                  <div className="flex justify-between text-xs text-gray-600">
                    <span>Iteration: {progress.iteration}</span>
                    <span>Energy: {progress.bestEnergy}</span>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>

          {/* Energy Windows - Smaller */}
          {isRunning && !currentResult ? (
            <div className="grid grid-cols-2 gap-2">
              <Card>
                <CardContent className="pt-3 pb-3">
                  <Skeleton className="h-6 w-24 mx-auto" />
                  <Skeleton className="h-3 w-20 mx-auto mt-2" />
                </CardContent>
              </Card>
              <Card>
                <CardContent className="pt-3 pb-3">
                  <Skeleton className="h-6 w-24 mx-auto" />
                  <Skeleton className="h-3 w-20 mx-auto mt-2" />
                </CardContent>
              </Card>
            </div>
          ) : currentResult ? (
            <div className="grid grid-cols-2 gap-2">
              <Card>
                <CardContent className="pt-3 pb-3">
                  <div className="text-center">
                    <div className="text-lg font-bold text-blue-600">
                      {progress?.currentEnergy ||
                        currentResult.bestConformation.energy}
                    </div>
                    <div className="text-xs text-gray-600">Current Energy</div>
                  </div>
                </CardContent>
              </Card>
              <Card>
                <CardContent className="pt-3 pb-3">
                  <div className="text-center">
                    <div className="text-lg font-bold text-green-600">
                      {progress?.bestEnergy ||
                        currentResult.bestConformation.energy}
                    </div>
                    <div className="text-xs text-gray-600">Best Energy</div>
                  </div>
                </CardContent>
              </Card>
            </div>
          ) : (
            <div className="grid grid-cols-2 gap-2">
              <Card>
                <CardContent className="pt-3 pb-3">
                  <div className="text-center text-gray-500">
                    <div className="text-sm">No results yet</div>
                    <div className="text-xs mt-1">Run solver to begin</div>
                  </div>
                </CardContent>
              </Card>
              <Card>
                <CardContent className="pt-3 pb-3">
                  <div className="text-center text-gray-500">
                    <div className="text-sm">No results yet</div>
                    <div className="text-xs mt-1">Run solver to begin</div>
                  </div>
                </CardContent>
              </Card>
            </div>
          )}
        </div>

        {/* Right Column: Visualization + Energy Evolution */}
        {isRunning && !currentResult ? (
          <div className="space-y-4">
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-lg">Visualization</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="h-48 bg-gray-50 rounded-md overflow-hidden flex items-center justify-center">
                  <Skeleton className="h-40 w-full" />
                </div>
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-lg">Energy Evolution</CardTitle>
              </CardHeader>
              <CardContent>
                <Skeleton className="h-48 w-full" />
              </CardContent>
            </Card>
          </div>
        ) : currentResult ? (
          <div className="space-y-4">
            {/* Primary Visualization */}
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-lg flex justify-between items-center">
                  <span>Visualization</span>
                  <div className="flex gap-2">
                    <Button 
                      variant="outline" 
                      size="sm" 
                      onClick={() => setShowConnectionTable(!showConnectionTable)}
                      title="Show Connection Details"
                    >
                      {showConnectionTable ? "Hide" : "Show"} Connections
                    </Button>
                    <Button variant="outline" size="sm" onClick={handleExportImage} title="Export as Image">
                      <Download className="h-4 w-4 mr-1" />
                      Export
                    </Button>
                  </div>
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="h-48 bg-gray-50 rounded-md overflow-hidden">
                  <Canvas
                    gl={{ preserveDrawingBuffer: true }}
                    key={`solver-canvas-${
                      bestConformation?.sequence || "empty"
                    }`}
                  >
                    <OrthographicCamera
                      makeDefault
                      position={[0, 0, 10]}
                      near={0.1}
                      far={1000}
                      zoom={40}
                    />
                    <ambientLight intensity={0.5} />
                    <directionalLight position={[10, 10, 10]} intensity={1} />
                    <OrbitControls
                      enableRotate
                      enablePan
                      enableZoom
                      screenSpacePanning
                      target={[0, 0, 0]}
                    />
                    {bestConformation ? (
                      <Suspense
                        fallback={
                          <Html center>
                            <div className="text-center text-gray-500">
                              Loading visualization...
                            </div>
                          </Html>
                        }
                      >
                        <ProteinModel
                          sequence={bestConformation.sequence}
                          directions={bestConformation.directions}
                          type={latticeType.toLowerCase() as "2d" | "3d"}
                        />
                        <CanvasScreenshot ref={screenshotRef} />
                      </Suspense>
                    ) : (
                      <Html center>
                        <div className="text-center text-gray-500">
                          <div className="text-sm">
                            No visualization available
                          </div>
                          <div className="text-xs mt-1">
                            Run solver to generate a preview
                          </div>
                        </div>
                      </Html>
                    )}
                  </Canvas>
                </div>
                
                {/* Connection Details Table */}
                {showConnectionTable && bestConformation && (
                  <ConnectionDetailsTable
                    sequence={bestConformation.sequence}
                    directions={bestConformation.directions}
                    positions={bestConformation.positions}
                    title={`Connection Details - Best Conformation (${algorithmType.toUpperCase()})`}
                  />
                )}
              </CardContent>
            </Card>

            {/* Detailed Energy Evolution */}
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-lg">Energy Evolution</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="h-48">
                  {currentResult.energyHistory &&
                  currentResult.energyHistory.length > 0 ? (
                    <ResponsiveContainer width="100%" height="100%">
                      <LineChart data={currentResult.energyHistory}>
                        <CartesianGrid strokeDasharray="3 3" />
                        <XAxis dataKey="iteration" />
                        <YAxis />
                        <Tooltip />
                        <Legend />
                        <Line
                          type="monotone"
                          dataKey="energy"
                          stroke="#8884d8"
                          strokeWidth={2}
                          dot={false}
                        />
                      </LineChart>
                    </ResponsiveContainer>
                  ) : (
                    <div className="flex items-center justify-center h-full">
                      <div className="text-center text-gray-500">
                        <div className="text-sm">No energy data available</div>
                        <div className="text-xs mt-1">
                          Run solver to generate energy evolution
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              </CardContent>
            </Card>
          </div>
        ) : (
          <div className="space-y-4">
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-lg">Visualization</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="h-48 bg-gray-50 rounded-md overflow-hidden flex items-center justify-center">
                  <div className="text-center text-gray-500">
                    <div className="text-sm">No visualization available</div>
                    <div className="text-xs mt-1">
                      Run solver to generate a preview
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-lg">Energy Evolution</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="h-48 bg-gray-50 rounded-md overflow-hidden flex items-center justify-center">
                  <div className="text-center text-gray-500">
                    <div className="text-sm">No energy data available</div>
                    <div className="text-xs mt-1">
                      Run solver to generate energy evolution
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>
        )}
      </div>

      {/* Population Visualization Section */}
      {showPopulationView && savedGenerations.length > 0 && algorithmType === "ga" && (
        <div className="space-y-4">
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <CardTitle>Population Evolution</CardTitle>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setShowPopulationView(false)}
                >
                  Hide
                </Button>
              </div>
            </CardHeader>
            <CardContent>
              <PopulationVisualizer
                sequence={activeSequence}
                generations={savedGenerations}
                onChromosomeSelect={(chromosome, generation) => {
                  setBestConformation({
                    sequence: activeSequence,
                    directions: chromosome.directions as Direction[],
                    positions: chromosome.positions,
                    energy: chromosome.energy,
                  });
                }}
              />
            </CardContent>
          </Card>
        </div>
      )}

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
                
                {/* Connection Details Table in Details Section */}
                {showConnectionTable && currentResult.bestConformation && (
                  <div className="mt-4">
                    <ConnectionDetailsTable
                      sequence={currentResult.bestConformation.sequence}
                      directions={currentResult.bestConformation.directions}
                      positions={currentResult.bestConformation.positions}
                      title={`Connection Details - Best Conformation (${algorithmType.toUpperCase()})`}
                    />
                  </div>
                )}
              </CardContent>
            </Card>
          )}
        </div>
      )}
    </div>
  );
};

export default React.memo(ProteinSolverRefactored);
