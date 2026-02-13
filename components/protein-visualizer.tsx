"use client";

import type React from "react";
import { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { Suspense } from "react";
import { Canvas } from "@react-three/fiber";
import { OrbitControls, OrthographicCamera } from "@react-three/drei";
import { Separator } from "@/components/ui/separator";
import { useToast } from "@/hooks/use-toast";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  Loader2,
  Save,
  Database,
  Download,
  Share2,
  BarChart2,
  Atom,
} from "lucide-react";
import { useSession } from "next-auth/react";

import dynamic from "next/dynamic";
const ProteinModel = dynamic(() => import("@/components/protein-model"), {
  ssr: false,
  loading: () => null,
});
const ProteinComparison = dynamic(
  () => import("@/components/protein-comparison"),
  { ssr: false, loading: () => null }
);
const ProteinSolver = dynamic(
  () => import("@/components/protein-solver"),
  { ssr: false, loading: () => null }
);
const ExportOptions = dynamic(() => import("@/components/export-options"), {
  ssr: false,
  loading: () => null,
});
const ConnectionDetailsTable = dynamic(
  () => import("@/components/connection-details-table").then(mod => ({ default: mod.ConnectionDetailsTable })),
  { ssr: false, loading: () => null }
);
const RealtimeAnalysisPanel = dynamic(
  () => import("@/components/realtime-analysis-panel").then(mod => ({ default: mod.RealtimeAnalysisPanel })),
  { ssr: false, loading: () => null }
);
import { getPublicProteins, saveProtein } from "@/app/actions";
import { SavedContentDialog } from "./saved-content-dialog";
import { Direction } from "@/lib/types";
import { parseDirections, directionsToString } from "@/lib/utils";

export type VisualizationType =
  | "3d"
  | "2d"
  | "ribbon"
  | "space-filling"
  | "surface";

export type ProteinSequence = {
  id?: number;
  _id?: string | unknown;
  name?: string;
  sequence: string;
  directions?: Direction[];
  userId?: string | unknown;
  description?: string;
  isPublic?: boolean | string;
  createdAt?: Date | string;
  updatedAt?: Date | string;
};

const ProteinVisualizer = () => {
  const [sequence, setSequence] = useState<string>("");
  const [directions, setDirections] = useState<string>("");
  const [directionsError, setDirectionsError] = useState<string>("");
  const [proteinName, setProteinName] = useState<string>("");
  const [proteinNameError, setProteinNameError] = useState<string>("");
  const [proteinData, setProteinData] = useState<ProteinSequence | null>(null);
  const [visualizationType, setVisualizationType] =
    useState<VisualizationType>("3d");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState<boolean>(false);
  const [savedProteins, setSavedProteins] = useState<ProteinSequence[]>([]);
  const [savedComparisons, setSavedComparisons] = useState<any[]>([]);
  const [comparisonProteins, setComparisonProteins] = useState<
    ProteinSequence[]
  >([]);
  const [isCanvasFullscreen, setIsCanvasFullscreen] = useState(false);
  const [canvasReady, setCanvasReady] = useState(false);
  const [fullscreenCanvasReady, setFullscreenCanvasReady] = useState(false);
  const [showConnectionTable, setShowConnectionTable] = useState(false);
  // Store solver results separately
  const [solverResult, setSolverResult] = useState<{
    sequence: string;
    directions: Direction[];
    positions: Array<{ x: number; y: number; z: number }>;
    energy: number;
    hhContacts?: number;
  } | null>(null);
  const { toast } = useToast();
  const { data: session } = useSession();
  const [comparisonSaved, setComparisonSaved] = useState(false);
  // Rosetta job state
  const [rosettaProtocol, setRosettaProtocol] = useState<string>("relax");
  const [rosettaRepeats, setRosettaRepeats] = useState<number>(2);
  const [rosettaSeed, setRosettaSeed] = useState<string>("");
  const [rosettaBias, setRosettaBias] = useState<boolean>(true);
  const [rosettaJobId, setRosettaJobId] = useState<string | null>(null);
  const [rosettaStatus, setRosettaStatus] = useState<
    "idle" | "queued" | "running" | "succeeded" | "failed"
  >("idle");
  const [rosettaPolling, setRosettaPolling] = useState<NodeJS.Timeout | null>(
    null
  );
  const [rosettaPdbData, setRosettaPdbData] = useState<any>(null);
  const [pdbVisualizationType, setPdbVisualizationType] = useState<
    "ball-and-stick" | "cartoon" | "space-filling" | "stick"
  >("ball-and-stick");
  const [analysisMetrics, setAnalysisMetrics] = useState<any>(null);

  // Load saved proteins and comparisons from database on initial render
  useEffect(() => {
    const fetchSavedContent = async () => {
      try {
        // Fetch proteins
        const { data: proteinsData, error: proteinsError } =
          await getPublicProteins();
        if (proteinsError) {
          throw new Error(proteinsError);
        }
        if (proteinsData) {
          const convertedData = proteinsData.map((protein) => ({
            ...protein,
            directions:
              protein.directions && Array.isArray(protein.directions)
                ? (protein.directions as Direction[])
                : protein.directions && typeof protein.directions === "string"
                ? parseDirections(protein.directions)
                : undefined,
          }));
          setSavedProteins(convertedData);
        }

        // Fetch comparisons
        if (session?.user?.id) {
          const response = await fetch(
            `/api/comparisons?userId=${session.user.id}`
          );
          if (!response.ok) throw new Error("Failed to fetch comparisons");
          const comparisonsData = await response.json();
          setSavedComparisons(comparisonsData);
        }
      } catch (error) {
        console.error("Error fetching saved content:", error);
        toast({
          title: "Error",
          description: "Failed to fetch saved content.",
          variant: "destructive",
        });
      }
    };

    fetchSavedContent();
  }, [toast, session?.user?.id]);

  // Reset canvas ready states when visualization type changes
  useEffect(() => {
    setCanvasReady(false);
    setFullscreenCanvasReady(false);
  }, [visualizationType]);

  // Reset canvas ready states when protein data changes
  useEffect(() => {
    setCanvasReady(false);
    setFullscreenCanvasReady(false);
  }, [proteinData]);

  const handleVisualize = (e: React.FormEvent) => {
    e.preventDefault();
    console.log("Visualizing protein with sequence:", sequence);

    if (!sequence) {
      setError("Please enter a protein sequence");
      return;
    }

    // Validate directions if provided
    if (directions) {
      const parsedDirections = parseDirections(directions);
      if (parsedDirections.length === 0) {
        setError(
          "Invalid direction format. Please use only letters R (Right), U (Up), D (Down), L (Left), F (Forward), B (Backward). Example: RUDLFB or R U D L F B"
        );
        return;
      }
    }

    const newProteinData: ProteinSequence = {
      sequence,
      directions: directions ? parseDirections(directions) : undefined,
      name: proteinName,
    };

    console.log("Created new protein data:", newProteinData);
    setProteinData(newProteinData);
    setError(null);
  };

  const handleDirectionsChange = (value: string) => {
    setDirections(value);

    // Clear error if input is empty
    if (!value.trim()) {
      setDirectionsError("");
      return;
    }

    // Validate directions in real-time
    const parsedDirections = parseDirections(value);
    if (parsedDirections.length === 0) {
      setDirectionsError("Invalid format. Use only letters R, U, D, L, F, B");
    } else {
      setDirectionsError("");
    }
  };

  const handleReset = () => {
    setSequence("");
    setDirections("");
    setDirectionsError("");
    setProteinName("");
    setProteinNameError("");
    setProteinData(null);
    setError(null);
  };

  const handleRandomSequence = () => {
    const length = Math.floor(Math.random() * 10) + 5; // Random length between 5-14
    let randomSeq = "";
    for (let i = 0; i < length; i++) {
      randomSeq += Math.random() > 0.5 ? "H" : "P";
    }
    setSequence(randomSeq);
  };

  const handleSaveProtein = async () => {
    if (!session?.user?.id) {
      toast({
        title: "Authentication required",
        description: "Please sign in to save proteins",
        variant: "destructive",
      });
      return;
    }

    if (!proteinData) return;

    if (!proteinName.trim()) {
      setProteinNameError("Please provide a name for the protein");
      return;
    }

    setProteinNameError("");
    setLoading(true);
    try {
      const response = await fetch("/api/proteins", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          name: proteinName,
          sequence: proteinData.sequence,
          directions: proteinData.directions,
          isPublic: true,
          userId: session.user.id,
        }),
      });

      if (!response.ok) {
        throw new Error("Failed to save protein to database");
      }

      const data = await response.json();
      setSavedProteins((prev) => [...prev, data]);
      toast({
        title: "Protein Saved",
        description: `${proteinName} has been saved to the database.`,
      });
    } catch (error) {
      console.error("Error saving protein:", error);
      toast({
        title: "Error",
        description: "Failed to save protein to database.",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  const handleAddToComparison = (protein: ProteinSequence) => {
    console.log("Adding protein to comparison:", protein);
    if (!protein) {
      console.log("No protein provided");
      return;
    }

    // Ensure directions is an array
    const proteinWithDirections = {
      ...protein,
      directions: Array.isArray(protein.directions) ? protein.directions : [],
    };

    // Check if protein is already in comparison
    const exists = comparisonProteins.some(
      (p) => p.sequence === protein.sequence
    );

    console.log("Protein exists in comparison:", exists);
    console.log("Current comparison proteins:", comparisonProteins);

    if (!exists) {
      setComparisonProteins((prev) => {
        console.log("Adding protein to comparison list");
        return [...prev, proteinWithDirections];
      });
      toast({
        title: "Added to Comparison",
        description: `${
          protein.name || "Protein"
        } has been added to the comparison list.`,
      });
    } else {
      toast({
        title: "Already Added",
        description: "This protein is already in the comparison list.",
        variant: "destructive",
      });
    }
  };

  const handleOptimizationComplete = (
    optimizedDirections: Direction[],
    energy: number,
    positions?: Array<{ x: number; y: number; z: number }>,
    hhContacts?: number
  ) => {
    setDirections(directionsToString(optimizedDirections));
    setProteinData((prev) => {
      if (!prev) return null;
      return {
        ...prev,
        directions: optimizedDirections,
      };
    });

    // Store solver results for connection visualization
    // Use proteinData sequence if available, otherwise use the sequence from the solver
    const resultSequence = proteinData?.sequence || sequence;
    if (resultSequence) {
      setSolverResult({
        sequence: resultSequence,
        directions: optimizedDirections,
        positions: positions || [],
        energy,
        hhContacts,
      });
      
      // Also update proteinData with solver results for visualization
      if (proteinData) {
        setProteinData({
          ...proteinData,
          directions: optimizedDirections,
        });
      }
    }

    toast({
      title: "Solver Complete",
      description: `Found conformation with energy: ${energy}`,
    });
  };

  const handleSaveExport = async () => {
    if (!session?.user?.id) {
      toast({
        title: "Authentication required",
        description: "Please sign in to save exports",
        variant: "destructive",
      });
      return;
    }

    if (!proteinData) return;

    try {
      const response = await fetch("/api/exports", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          proteinId: proteinData.id,
          exportType: "pdb",
          userId: session.user.id,
        }),
      });

      if (!response.ok) {
        throw new Error("Failed to save export record");
      }
    } catch (error) {
      console.error("Error saving export record:", error);
    }
  };

  const handleSaveComparison = async () => {
    console.log("handleSaveComparison called");
    console.log("Current comparison proteins:", comparisonProteins);

    if (!session?.user?.id) {
      console.log("No user session found");
      toast({
        title: "Authentication required",
        description: "Please sign in to save comparisons",
        variant: "destructive",
      });
      return;
    }

    if (comparisonProteins.length < 2) {
      console.log(
        "Not enough proteins for comparison:",
        comparisonProteins.length
      );
      toast({
        title: "Error",
        description: "You need at least 2 proteins to create a comparison",
        variant: "destructive",
      });
      return;
    }

    try {
      console.log("Attempting to save comparison...");

      // First, ensure all proteins are saved to the database
      const savedProteins = await Promise.all(
        comparisonProteins.map(async (protein) => {
          if (!protein._id && !protein.id) {
            // Save the protein if it doesn't have an ID
            const response = await fetch("/api/proteins", {
              method: "POST",
              headers: {
                "Content-Type": "application/json",
              },
              body: JSON.stringify({
                name: protein.name || "Unnamed Protein",
                sequence: protein.sequence,
                directions: protein.directions,
                isPublic: true,
                userId: session.user.id,
              }),
            });

            if (!response.ok) {
              throw new Error("Failed to save protein");
            }

            const savedProtein = await response.json();
            return savedProtein;
          }
          return protein;
        })
      );

      // Extract protein IDs from saved proteins
      const proteinIds = savedProteins.map((p) => {
        const id = p._id || p.id;
        if (!id) {
          throw new Error("Protein missing ID after saving");
        }
        return id;
      });

      console.log("Saving comparison with protein IDs:", proteinIds);

      const response = await fetch("/api/comparisons", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          name: `Comparison of ${comparisonProteins.length} proteins`,
          description: `Comparison created on ${new Date().toLocaleDateString()}`,
          proteinIds: proteinIds,
          userId: session.user.id,
        }),
      });

      console.log("Save comparison response:", response);

      if (!response.ok) {
        const errorData = await response.json();
        console.error("Failed to save comparison:", errorData);
        throw new Error("Failed to save comparison");
      }

      const data = await response.json();
      console.log("Comparison saved successfully:", data);

      toast({
        title: "Comparison Saved",
        description: "Your comparison has been saved successfully.",
      });
      setComparisonProteins([]);
      setComparisonSaved((prev) => !prev); // Toggle to trigger refresh
    } catch (error) {
      console.error("Error saving comparison:", error);
      toast({
        title: "Error",
        description:
          error instanceof Error
            ? error.message
            : "Failed to save comparison to database.",
        variant: "destructive",
      });
    }
  };

  const handleRunRosetta = async () => {
    if (!sequence) {
      toast({
        title: "Sequence required",
        description: "Enter a sequence, then try again.",
        variant: "destructive",
      });
      return;
    }

    try {
      setRosettaStatus("queued");
      const response = await fetch("/api/rosetta/jobs", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          sequence,
          directions: directions ? parseDirections(directions) : undefined,
          params: {
            protocol: rosettaProtocol,
            repeats: rosettaRepeats,
            seed: rosettaSeed || undefined,
            biasToDirections: rosettaBias,
          },
        }),
      });
      if (!response.ok) throw new Error("Failed to queue Rosetta job");
      const { jobId } = await response.json();
      setRosettaJobId(jobId);
      toast({ title: "Rosetta job queued", description: `Job ${jobId}` });

      // start polling
      if (rosettaPolling) clearInterval(rosettaPolling);
      const t = setInterval(async () => {
        const s = await fetch(`/api/rosetta/jobs/${jobId}`);
        if (!s.ok) return;
        const data = await s.json();
        setRosettaStatus(data.status);
        if (data.status === "succeeded" || data.status === "failed") {
          clearInterval(t);
          setRosettaPolling(null);
          if (data.status === "succeeded") {
            toast({ title: "Rosetta complete", description: "Result ready." });

            // Fetch and parse PDB data for visualization
            try {
              const pdbRes = await fetch(`/api/rosetta/jobs/${jobId}/pdb`);
              if (pdbRes.ok) {
                const pdbText = await pdbRes.text();
                const { parsePDB } = await import("@/lib/parsers/pdb-parser");
                const parsed = parsePDB(pdbText);
                setRosettaPdbData(parsed);

                // Calculate analysis metrics if HP lattice data is available
                if (directions && directions.length > 0) {
                  try {
                    const { analyzeHPAccuracy } = await import(
                      "@/lib/parsers/structure-analysis"
                    );
                    // Parse directions if it's a string
                    const directionsArray =
                      typeof directions === "string"
                        ? directions.split(",").map((d) => d.trim() as any)
                        : directions;

                    const analysis = analyzeHPAccuracy(
                      sequence,
                      directionsArray,
                      parsed,
                      undefined, // HP energy (not stored in ProteinSequence)
                      data.energy
                    );
                    setAnalysisMetrics(analysis);
                  } catch (analysisErr) {
                    console.error("Failed to calculate analysis:", analysisErr);
                  }
                }
              }
            } catch (err) {
              console.error("Failed to parse PDB:", err);
            }
          } else {
            toast({
              title: "Rosetta failed",
              description: data.errorMessage || "Unknown error",
              variant: "destructive",
            });
          }
        }
        if (data.status === "running") setRosettaStatus("running");
      }, 2500);
      setRosettaPolling(t);
    } catch (e) {
      setRosettaStatus("failed");
      toast({
        title: "Rosetta error",
        description: String(e),
        variant: "destructive",
      });
    }
  };

  const handleDownloadRosettaPdb = async () => {
    if (!rosettaJobId) return;
    const res = await fetch(`/api/rosetta/jobs/${rosettaJobId}/pdb`);
    if (!res.ok) {
      toast({ title: "Download failed", variant: "destructive" });
      return;
    }
    const blob = await res.blob();
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${proteinName || "protein"}-rosetta.pdb`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleLoadProtein = (protein: ProteinSequence) => {
    setSequence(protein.sequence);
    setProteinName(protein.name || "Loaded Protein");
    setDirections(
      protein.directions ? directionsToString(protein.directions) : ""
    );
    setDirectionsError(""); // Clear any directions error when loading
  };

  const handleLoadComparison = (proteins: ProteinSequence[]) => {
    setComparisonProteins(proteins);
  };

  return (
    <div className="min-h-screen bg-background px-6 py-6">
      <div className="mx-auto max-w-[1800px] space-y-6">
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <Card className="p-6">
            <div className="space-y-6">
              <h2 className="text-2xl font-semibold">Input Protein Sequence</h2>
              <form onSubmit={handleVisualize} className="space-y-6">
                <div className="space-y-2">
                  <Label htmlFor="proteinName">Protein Name</Label>
                  <Input
                    id="proteinName"
                    value={proteinName}
                    onChange={(e) => {
                      setProteinName(e.target.value);
                      setProteinNameError("");
                    }}
                    placeholder="Enter protein name"
                    className={proteinNameError ? "border-red-500" : ""}
                  />
                  {proteinNameError && (
                    <p className="text-sm text-red-500 mt-1">
                      {proteinNameError}
                    </p>
                  )}
                </div>

                <div className="space-y-2">
                  <Label htmlFor="sequence">
                    Protein Sequence (H = hydrophobic, P = polar)
                  </Label>
                  <div className="flex gap-2">
                    <Input
                      id="sequence"
                      value={sequence}
                      onChange={(e) => setSequence(e.target.value)}
                      placeholder="e.g., HHPHPH"
                      className="flex-1"
                    />
                    <Button
                      type="button"
                      variant="outline"
                      onClick={handleRandomSequence}
                    >
                      Random
                    </Button>
                  </div>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="directions">
                    Folding Directions (Optional)
                  </Label>
                  <Input
                    id="directions"
                    value={directions}
                    onChange={(e) => handleDirectionsChange(e.target.value)}
                    placeholder="e.g., RUDLFB or R U D L F B"
                    className={directionsError ? "border-red-500" : ""}
                  />
                  {directionsError ? (
                    <p className="text-sm text-red-500">{directionsError}</p>
                  ) : (
                    <p className="text-sm text-muted-foreground">
                      Use letters R (Right), U (Up), D (Down), L (Left), F (Forward), B (Backward).
                    </p>
                  )}
                </div>

                <div className="space-y-2">
                  <Label htmlFor="visualizationType">Visualization Type</Label>
                  <Select
                    value={visualizationType}
                    onValueChange={(value: VisualizationType) =>
                      setVisualizationType(value)
                    }
                  >
                    <SelectTrigger id="visualizationType" className="w-full">
                      <SelectValue placeholder="Select visualization type" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="3d">3D Model</SelectItem>
                      <SelectItem value="2d">2D Model</SelectItem>
                      <SelectItem value="ribbon">Ribbon</SelectItem>
                      <SelectItem value="space-filling">
                        Space Filling
                      </SelectItem>
                      <SelectItem value="surface">Surface</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                {error && <p className="text-sm text-destructive">{error}</p>}

                <div className="flex gap-2">
                  <Button type="submit" className="flex-1">
                    Visualize
                  </Button>
                  <Button type="button" variant="outline" onClick={handleReset}>
                    Reset
                  </Button>
                </div>
              </form>
            </div>
          </Card>

          <Card className="p-6">
            <Tabs defaultValue="solver" className="h-full">
              <TabsList className="grid w-full grid-cols-4">
                <TabsTrigger value="solver">
                  <BarChart2 className="w-4 h-4 mr-2" />
                  Solver
                </TabsTrigger>
                <TabsTrigger value="comparison">
                  <Share2 className="w-4 h-4 mr-2" />
                  Comparison
                </TabsTrigger>
                <TabsTrigger value="export">
                  <Download className="w-4 h-4 mr-2" />
                  Export
                </TabsTrigger>
                <TabsTrigger value="rosetta">
                  <Atom className="w-4 h-4 mr-2" />
                  Rosetta
                </TabsTrigger>
              </TabsList>


              {/* Fullscreen Canvas Dialog */}
              <Dialog
                open={isCanvasFullscreen}
                onOpenChange={(open) => {
                  setIsCanvasFullscreen(open);
                  // Reset fullscreen canvas ready state when dialog is opened
                  if (open) {
                    setFullscreenCanvasReady(false);
                  }
                }}
              >
                <DialogContent className="max-w-[90vw] w-[90vw] h-[90vh]">
                  <DialogHeader>
                    <DialogTitle>Protein Visualization</DialogTitle>
                  </DialogHeader>
                  <div className="w-full h-full bg-gray-50 rounded-lg relative">
                    {!fullscreenCanvasReady && (
                      <div className="absolute inset-0 z-10 flex items-center justify-center p-4">
                        <Skeleton className="h-full w-full" />
                      </div>
                    )}
                    <Canvas
                      style={{ width: "100%", height: "100%" }}
                      onCreated={() => setFullscreenCanvasReady(true)}
                    >
                      <OrthographicCamera
                        makeDefault
                        position={
                          visualizationType === "2d" ? [0, 0, 20] : [0, 0, 10]
                        }
                        near={0.1}
                        far={1000}
                        zoom={visualizationType === "2d" ? 60 : 50}
                      />
                      <OrbitControls
                        enableRotate={visualizationType !== "2d"}
                        enablePan
                        enableZoom
                        screenSpacePanning
                        target={[0, 0, 0]}
                      />
                      <ambientLight intensity={0.8} />
                      <directionalLight position={[10, 10, 10]} intensity={1} />
                      <directionalLight
                        position={[-10, -10, -10]}
                        intensity={0.5}
                      />
                      {proteinData && (
                        <Suspense fallback={null}>
                          <ProteinModel
                            sequence={proteinData.sequence}
                            directions={proteinData.directions}
                            type={visualizationType}
                          />
                        </Suspense>
                      )}
                    </Canvas>
                  </div>
                </DialogContent>
              </Dialog>

              <TabsContent value="solver" className="mt-4">
                {/* Split View: Solver Controls + Visualization & Analysis */}
                {proteinData ? (
                  <div className="grid grid-cols-1 xl:grid-cols-3 gap-4">
                    {/* Left: Solver Controls (1 column) */}
                    <div className="xl:col-span-1">
                      <ProteinSolver
                        sequence={proteinData.sequence}
                        initialDirections={proteinData.directions}
                        onOptimizationComplete={handleOptimizationComplete}
                      />
                    </div>

                    {/* Right: Visualization & Analysis (2 columns) */}
                    <div className="xl:col-span-2 space-y-4">
                      {/* Visualization */}
                      <Card>
                        <CardHeader className="pb-3">
                          <div className="flex justify-between items-center">
                            <CardTitle className="text-lg font-semibold">3D Visualization</CardTitle>
                            <div className="flex gap-2">
                              <Select
                                value={visualizationType}
                                onValueChange={(value: VisualizationType) =>
                                  setVisualizationType(value)
                                }
                              >
                                <SelectTrigger className="w-[140px] h-9">
                                  <SelectValue />
                                </SelectTrigger>
                                <SelectContent>
                                  <SelectItem value="3d">3D Model</SelectItem>
                                  <SelectItem value="2d">2D Model</SelectItem>
                                  <SelectItem value="ribbon">Ribbon</SelectItem>
                                  <SelectItem value="space-filling">
                                    Space Filling
                                  </SelectItem>
                                  <SelectItem value="surface">Surface</SelectItem>
                                </SelectContent>
                              </Select>
                              <Button
                                variant="outline"
                                size="sm"
                                onClick={() => setIsCanvasFullscreen(true)}
                                title="Fullscreen"
                                className="h-9"
                              >
                                <svg
                                  xmlns="http://www.w3.org/2000/svg"
                                  width="16"
                                  height="16"
                                  viewBox="0 0 24 24"
                                  fill="none"
                                  stroke="currentColor"
                                  strokeWidth="2"
                                  strokeLinecap="round"
                                  strokeLinejoin="round"
                                >
                                  <path d="M15 3h6v6M9 21H3v-6M21 3l-7 7M3 21l7-7" />
                                </svg>
                              </Button>
                            </div>
                          </div>
                        </CardHeader>
                        <CardContent className="pb-4">
                          <div className="relative w-full h-[450px] bg-gray-50 rounded-lg border border-gray-200 overflow-hidden">
                            {!canvasReady && (
                              <div className="absolute inset-0 z-10 flex items-center justify-center p-4">
                                <Skeleton className="h-full w-full" />
                              </div>
                            )}
                            <Canvas
                              style={{ width: "100%", height: "100%" }}
                              onCreated={() => setCanvasReady(true)}
                            >
                              <OrthographicCamera
                                makeDefault
                                position={
                                  visualizationType === "2d" ? [0, 0, 20] : [0, 0, 10]
                                }
                                near={0.1}
                                far={1000}
                                zoom={visualizationType === "2d" ? 60 : 50}
                              />
                              <OrbitControls
                                enableRotate={visualizationType !== "2d"}
                                enablePan
                                enableZoom
                                screenSpacePanning
                                target={[0, 0, 0]}
                              />
                              <ambientLight intensity={0.8} />
                              <directionalLight
                                position={[10, 10, 10]}
                                intensity={1}
                              />
                              <directionalLight
                                position={[-10, -10, -10]}
                                intensity={0.5}
                              />
                              <Suspense fallback={null}>
                                <ProteinModel
                                  sequence={solverResult?.sequence || proteinData.sequence}
                                  directions={solverResult?.directions || proteinData.directions}
                                  type={visualizationType}
                                  showHHContacts={true}
                                />
                              </Suspense>
                            </Canvas>
                          </div>
                        </CardContent>
                      </Card>

                      {/* Real-time Analysis Panel */}
                      <Card>
                        <CardHeader className="pb-3">
                          <CardTitle className="text-lg font-semibold">Analysis & Connections</CardTitle>
                        </CardHeader>
                        <CardContent className="pb-4">
                          <div className="max-h-[500px] overflow-y-auto">
                            <RealtimeAnalysisPanel
                              sequence={solverResult?.sequence || proteinData.sequence}
                              directions={solverResult?.directions || proteinData.directions}
                              positions={solverResult?.positions}
                              currentEnergy={solverResult?.energy}
                              hhContacts={solverResult?.hhContacts}
                              showConnectionTable={showConnectionTable}
                              onToggleConnectionTable={() =>
                                setShowConnectionTable(!showConnectionTable)
                              }
                            />
                          </div>
                        </CardContent>
                      </Card>
                    </div>
                  </div>
                ) : (
                  <div className="space-y-4">
                    <Card>
                      <CardContent className="pt-6">
                        <div className="text-center text-muted-foreground py-12">
                          <div className="mb-4">
                            <svg
                              className="mx-auto h-12 w-12 text-gray-400"
                              fill="none"
                              viewBox="0 0 24 24"
                              stroke="currentColor"
                            >
                              <path
                                strokeLinecap="round"
                                strokeLinejoin="round"
                                strokeWidth={2}
                                d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"
                              />
                            </svg>
                          </div>
                          <p className="text-lg font-medium mb-2">Enter a protein sequence and click Visualize</p>
                          <p className="text-sm text-gray-500">
                            Then use the Solver to optimize the folding and see detailed connections
                          </p>
                        </div>
                      </CardContent>
                    </Card>
                    <ProteinSolver
                      sequence={sequence}
                      initialDirections={undefined}
                      onOptimizationComplete={handleOptimizationComplete}
                    />
                  </div>
                )}
              </TabsContent>

              <TabsContent
                value="comparison"
                className="mt-4 h-[500px] overflow-y-auto"
              >
                <ProteinComparison proteins={comparisonProteins} />
              </TabsContent>

              <TabsContent
                value="export"
                className="mt-4 h-[500px] overflow-y-auto"
              >
                {proteinData ? (
                  <ExportOptions
                    sequence={proteinData.sequence}
                    directions={proteinData.directions}
                    proteinName={proteinData.name}
                    onExport={handleSaveExport}
                  />
                ) : (
                  <Card>
                    <CardContent className="pt-6">
                      <div className="flex flex-col items-center justify-center space-y-4 py-8">
                        <p className="text-gray-600 text-center">
                          Please provide a protein sequence to export.
                        </p>
                      </div>
                    </CardContent>
                  </Card>
                )}
              </TabsContent>

              <TabsContent
                value="rosetta"
                className="mt-4 h-[500px] overflow-y-auto"
              >
                <div className="space-y-4">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label>Protocol</Label>
                      <Select
                        value={rosettaProtocol}
                        onValueChange={setRosettaProtocol as any}
                      >
                        <SelectTrigger className="w-full">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="relax">Relax</SelectItem>
                          <SelectItem value="fold">Fold</SelectItem>
                        </SelectContent>
                      </Select>
                      <p className="text-xs text-muted-foreground">
                        Relax: Energy minimization & side-chain optimization.
                        Fold: Monte Carlo-based ab initio folding.
                      </p>
                    </div>
                    <div className="space-y-2">
                      <Label>Repeats</Label>
                      <Input
                        type="number"
                        min={1}
                        max={10}
                        value={rosettaRepeats}
                        onChange={(e) =>
                          setRosettaRepeats(Number(e.target.value || 1))
                        }
                      />
                      <p className="text-xs text-muted-foreground">
                        Number of times to run the protocol. More repeats =
                        better results but slower.
                      </p>
                    </div>
                    <div className="space-y-2">
                      <Label>Seed (optional)</Label>
                      <Input
                        value={rosettaSeed}
                        onChange={(e) => setRosettaSeed(e.target.value)}
                        placeholder="random if empty"
                      />
                      <p className="text-xs text-muted-foreground">
                        Random seed for reproducibility. Same seed = same
                        results.
                      </p>
                    </div>
                    <div className="space-y-2">
                      <Label>Bias to Directions</Label>
                      <Select
                        value={rosettaBias ? "yes" : "no"}
                        onValueChange={(v) => setRosettaBias(v === "yes")}
                      >
                        <SelectTrigger className="w-full">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="yes">Yes</SelectItem>
                          <SelectItem value="no">No</SelectItem>
                        </SelectContent>
                      </Select>
                      <p className="text-xs text-muted-foreground">
                        Apply constraints based on HP model directions
                        (R/L/U/D).
                      </p>
                    </div>
                  </div>

                  <div className="flex gap-2">
                    <Button
                      onClick={handleRunRosetta}
                      disabled={!sequence || rosettaStatus === "running"}
                    >
                      Run Rosetta
                    </Button>
                    <Button
                      variant="outline"
                      onClick={handleDownloadRosettaPdb}
                      disabled={rosettaStatus !== "succeeded" || !rosettaJobId}
                    >
                      Download PDB
                    </Button>
                  </div>

                  <div className="text-sm text-gray-600">
                    Status: {rosettaStatus}
                    {rosettaJobId ? ` (job ${rosettaJobId})` : ""}
                  </div>

                  {/* Display Rosetta result when succeeded */}
                  {rosettaStatus === "succeeded" && rosettaPdbData && (
                    <div className="mt-4">
                      <div className="flex items-center justify-between mb-2">
                        <h3 className="text-lg font-semibold">
                          Rosetta Result (3D Structure)
                        </h3>
                        <div className="flex items-center gap-2">
                          <Label className="text-sm">Style:</Label>
                          <Select
                            value={pdbVisualizationType}
                            onValueChange={(v: any) =>
                              setPdbVisualizationType(v)
                            }
                          >
                            <SelectTrigger className="w-[160px]">
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="ball-and-stick">
                                Ball & Stick
                              </SelectItem>
                              <SelectItem value="cartoon">Cartoon</SelectItem>
                              <SelectItem value="space-filling">
                                Space-Filling
                              </SelectItem>
                              <SelectItem value="stick">Stick</SelectItem>
                            </SelectContent>
                          </Select>
                        </div>
                      </div>
                      <div className="border rounded-lg overflow-hidden bg-gray-50">
                        <Canvas
                          camera={{ position: [0, 0, 30], fov: 50 }}
                          style={{ height: "400px", width: "100%" }}
                        >
                          <OrbitControls enablePan enableZoom enableRotate />
                          <ambientLight intensity={0.5} />
                          <directionalLight
                            position={[10, 10, 10]}
                            intensity={0.8}
                          />
                          <directionalLight
                            position={[-10, -10, -10]}
                            intensity={0.3}
                          />
                          <ProteinModel
                            sequence={sequence}
                            type="3d"
                            pdbData={rosettaPdbData}
                            pdbVisualizationType={pdbVisualizationType}
                          />
                        </Canvas>
                      </div>
                      <p className="text-xs text-muted-foreground mt-2">
                        {rosettaPdbData.atoms.length} atoms •{" "}
                        {rosettaPdbData.bonds.length} bonds
                        {rosettaPdbData.title && ` • ${rosettaPdbData.title}`}
                      </p>

                      {/* Analysis Metrics */}
                      {analysisMetrics && (
                        <div className="mt-4 p-4 bg-blue-50 border border-blue-200 rounded-lg">
                          <h4 className="font-semibold text-blue-900 mb-2">
                            Structure Analysis
                          </h4>
                          <div className="grid grid-cols-2 gap-4 text-sm">
                            <div>
                              <p className="text-gray-600">
                                RMSD (HP vs Rosetta):
                              </p>
                              <p className="font-semibold text-lg">
                                {analysisMetrics.metrics.rmsd.toFixed(2)} Å
                              </p>
                            </div>
                            <div>
                              <p className="text-gray-600">
                                Alignment Quality:
                              </p>
                              <p className="font-semibold text-lg capitalize">
                                {analysisMetrics.alignmentQuality}
                                {analysisMetrics.alignmentQuality ===
                                  "excellent" && " ✨"}
                                {analysisMetrics.alignmentQuality === "good" &&
                                  " ✓"}
                              </p>
                            </div>
                            <div className="col-span-2">
                              <p className="text-gray-600 mb-1">Residues:</p>
                              <p className="font-semibold">
                                {analysisMetrics.metrics.residueCount}
                              </p>
                            </div>
                            {analysisMetrics.metrics.energyDifference !==
                              undefined && (
                              <div className="col-span-2">
                                <p className="text-gray-600">
                                  Energy Difference:
                                </p>
                                <p className="font-semibold">
                                  {analysisMetrics.metrics.energyDifference.toFixed(
                                    2
                                  )}
                                </p>
                                <p className="text-xs text-gray-500 italic">
                                  Note: HP and all-atom energies use different
                                  scales
                                </p>
                              </div>
                            )}
                          </div>
                          <div className="mt-3 pt-3 border-t border-blue-200">
                            <p className="text-xs font-semibold text-gray-700 mb-1">
                              Insights:
                            </p>
                            <ul className="text-xs text-gray-600 space-y-1">
                              {analysisMetrics.notes.map(
                                (note: string, idx: number) => (
                                  <li key={idx} className="flex items-start">
                                    <span className="mr-1">•</span>
                                    <span>{note}</span>
                                  </li>
                                )
                              )}
                            </ul>
                          </div>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              </TabsContent>
            </Tabs>
          </Card>
        </div>

        <div className="grid grid-cols-2 gap-4">
          <SavedContentDialog
            onLoadProtein={handleLoadProtein}
            onAddToComparison={handleAddToComparison}
            onLoadComparison={handleLoadComparison}
            onComparisonSaved={() => setComparisonSaved((prev) => !prev)}
          />

          {/* Actions Card */}
          {proteinData && (
            <Card className="p-4">
              <h2 className="text-lg font-semibold text-primary mb-4">
                Actions
              </h2>
              <div className="grid grid-cols-2 gap-2">
                <Button
                  variant="outline"
                  onClick={handleSaveProtein}
                  disabled={loading}
                >
                  {loading ? (
                    <>
                      <Loader2 className="w-4 h-4 mr-2 animate-spin" />{" "}
                      Saving...
                    </>
                  ) : (
                    <>
                      <Save className="w-4 h-4 mr-2" /> Save to Database
                    </>
                  )}
                </Button>
                <Button
                  variant="outline"
                  onClick={() => {
                    console.log("Add to Comparison button clicked");
                    console.log("Current proteinData:", proteinData);
                    handleAddToComparison(proteinData);
                  }}
                >
                  <Share2 className="w-4 h-4 mr-2" /> Add to Comparison
                </Button>
                {comparisonProteins.length > 0 && (
                  <Button
                    variant="outline"
                    onClick={handleSaveComparison}
                    className="col-span-2"
                  >
                    <Save className="w-4 h-4 mr-2" /> Save Comparison
                  </Button>
                )}
              </div>
            </Card>
          )}
        </div>
      </div>
    </div>
  );
};

export default ProteinVisualizer;
