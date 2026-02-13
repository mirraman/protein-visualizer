"use client";

import type React from "react";
import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Canvas } from "@react-three/fiber";
import { OrbitControls, OrthographicCamera } from "@react-three/drei";
import ProteinModel from "./protein-model";
import { Progress } from "@/components/ui/progress";
import { Download, Save } from "lucide-react";

import { Direction } from "@/lib/types";

export interface ProteinData {
  id?: number;
  name: string;
  sequence: string;
  directions?: Direction[];
}

interface ProteinSequence {
  id?: number;
  name?: string;
  sequence: string;
  directions?: Direction[];
}

interface ProteinComparisonProps {
  proteins: ProteinSequence[];
  onSaveComparison?: (name: string, description: string) => void;
}

const ProteinComparison: React.FC<ProteinComparisonProps> = ({
  proteins,
  onSaveComparison,
}) => {
  const [visualizationType, setVisualizationType] = useState<
    "2d" | "3d" | "ribbon" | "space-filling" | "surface"
  >("3d");
  const [comparisonName, setComparisonName] = useState("");

  if (proteins.length < 2) {
    return (
      <Card>
        <CardContent className="pt-6">
          <p className="text-center text-gray-500">
            Select at least two proteins to compare
          </p>
        </CardContent>
      </Card>
    );
  }

  // Calculate similarity score (simple implementation)
  const calculateSimilarity = (seq1: string, seq2: string) => {
    const minLength = Math.min(seq1.length, seq2.length);
    let matches = 0;

    for (let i = 0; i < minLength; i++) {
      if (seq1[i] === seq2[i]) {
        matches++;
      }
    }

    return (matches / minLength) * 100;
  };

  // Calculate similarity matrix
  const similarityMatrix = proteins.map((p1, i) =>
    proteins.map((p2, j) =>
      i === j ? 100 : calculateSimilarity(p1.sequence, p2.sequence)
    )
  );

  // Calculate sequence statistics
  const calculateStats = (sequence: string) => {
    const hydrophobicCount = (sequence.match(/H/g) || []).length;
    const polarCount = (sequence.match(/P/g) || []).length;
    return {
      length: sequence.length,
      hydrophobicCount,
      polarCount,
      hydrophobicPercentage: (hydrophobicCount / sequence.length) * 100,
      polarPercentage: (polarCount / sequence.length) * 100,
    };
  };

  const handleSaveComparison = () => {
    if (onSaveComparison && comparisonName) {
      onSaveComparison(
        comparisonName,
        `Comparison of ${proteins.map((p) => p.name).join(", ")}`
      );
      setComparisonName("");
    }
  };

  const handleExport = () => {
    const exportData = {
      name: comparisonName || "Protein Comparison",
      proteins: proteins.map((protein) => ({
        name: protein.name,
        sequence: protein.sequence,
        directions: protein.directions,
      })),
      similarityMatrix,
      createdAt: new Date().toISOString(),
    };

    const blob = new Blob([JSON.stringify(exportData, null, 2)], {
      type: "application/json",
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${comparisonName || "protein_comparison"}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  return (
    <Card className="w-full">
      <CardHeader>
        <CardTitle className="flex justify-between items-center">
          <span>Protein Comparison</span>
          <div className="flex items-center gap-2">
            <Select
              value={visualizationType}
              onValueChange={(value: any) => setVisualizationType(value)}
            >
              <SelectTrigger className="w-[180px]">
                <SelectValue placeholder="Visualization Type" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="2d">2D Model</SelectItem>
                <SelectItem value="3d">3D Model</SelectItem>
                <SelectItem value="ribbon">Ribbon</SelectItem>
                <SelectItem value="space-filling">Space Filling</SelectItem>
                <SelectItem value="surface">Surface</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </CardTitle>
      </CardHeader>
      <CardContent>
        <Tabs defaultValue="visual">
          <TabsList className="grid w-full grid-cols-3">
            <TabsTrigger value="visual">Visual Comparison</TabsTrigger>
            <TabsTrigger value="sequence">Sequence Analysis</TabsTrigger>
            <TabsTrigger value="similarity">Similarity Matrix</TabsTrigger>
          </TabsList>

          <TabsContent value="visual" className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {proteins.map((protein, index) => (
                <div
                  key={index}
                  className="h-[300px] bg-gray-50 rounded-md overflow-hidden"
                >
                  <div className="bg-gray-100 p-2 text-sm font-medium">
                    {protein.name}
                  </div>
                  <Canvas>
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
                    <ProteinModel
                      sequence={protein.sequence}
                      directions={protein.directions?.map((d) => d as any)}
                      type={visualizationType}
                    />
                  </Canvas>
                </div>
              ))}
            </div>

            <div className="flex justify-between items-center">
              <div className="flex items-center gap-2">
                <input
                  type="text"
                  placeholder="Comparison name"
                  className="px-3 py-1 border rounded-md"
                  value={comparisonName}
                  onChange={(e) => setComparisonName(e.target.value)}
                />
              </div>
              <Button size="sm" variant="outline" onClick={handleExport}>
                <Download className="w-4 h-4 mr-1" /> Export Comparison
              </Button>
            </div>
          </TabsContent>

          <TabsContent value="sequence" className="space-y-4">
            {proteins.map((protein, index) => {
              const stats = calculateStats(protein.sequence);
              return (
                <Card key={index}>
                  <CardContent className="pt-6">
                    <h3 className="text-lg font-medium mb-2">{protein.name}</h3>
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-4">
                      <div className="bg-gray-50 p-2 rounded-md">
                        <div className="text-sm text-gray-500">Length</div>
                        <div className="text-lg font-medium">
                          {stats.length}
                        </div>
                      </div>
                      <div className="bg-gray-50 p-2 rounded-md">
                        <div className="text-sm text-gray-500">
                          Hydrophobic (H)
                        </div>
                        <div className="text-lg font-medium">
                          {stats.hydrophobicCount} (
                          {stats.hydrophobicPercentage.toFixed(1)}%)
                        </div>
                      </div>
                      <div className="bg-gray-50 p-2 rounded-md">
                        <div className="text-sm text-gray-500">Polar (P)</div>
                        <div className="text-lg font-medium">
                          {stats.polarCount} ({stats.polarPercentage.toFixed(1)}
                          %)
                        </div>
                      </div>
                    </div>

                    <div className="space-y-2">
                      <div>
                        <div className="flex justify-between mb-1">
                          <span className="text-sm font-medium text-gray-700">
                            Hydrophobic (H)
                          </span>
                          <span className="text-sm font-medium text-gray-700">
                            {stats.hydrophobicCount} (
                            {stats.hydrophobicPercentage.toFixed(1)}%)
                          </span>
                        </div>
                        <Progress
                          value={stats.hydrophobicPercentage}
                          className="h-2 bg-gray-200 [&>div]:bg-red-500"
                        />
                      </div>
                      <div>
                        <div className="flex justify-between mb-1">
                          <span className="text-sm font-medium text-gray-700">
                            Polar (P)
                          </span>
                          <span className="text-sm font-medium text-gray-700">
                            {stats.polarCount} (
                            {stats.polarPercentage.toFixed(1)}%)
                          </span>
                        </div>
                        <Progress
                          value={stats.polarPercentage}
                          className="h-2 bg-gray-200 [&>div]:bg-blue-500"
                        />
                      </div>
                    </div>

                    <div className="mt-4">
                      <div className="text-sm font-medium mb-2">Sequence</div>
                      <div className="bg-gray-50 p-2 rounded-md overflow-x-auto">
                        <div className="flex flex-wrap gap-1">
                          {protein.sequence.split("").map((residue, i) => (
                            <div
                              key={`${protein.sequence}-${i}-${residue}`}
                              className={`w-8 h-8 flex items-center justify-center rounded-md text-white font-medium ${
                                residue === "H" ? "bg-red-500" : "bg-blue-500"
                              }`}
                            >
                              {residue}
                            </div>
                          ))}
                        </div>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              );
            })}
          </TabsContent>

          <TabsContent value="similarity">
            <div className="overflow-x-auto">
              <table className="min-w-full border-collapse">
                <thead>
                  <tr>
                    <th className="border p-2 bg-gray-50"></th>
                    {proteins.map((protein, index) => (
                      <th key={index} className="border p-2 bg-gray-50">
                        {protein.name}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {proteins.map((protein, i) => (
                    <tr key={i}>
                      <th className="border p-2 bg-gray-50">{protein.name}</th>
                      {similarityMatrix[i].map((similarity, j) => (
                        <td
                          key={j}
                          className={`border p-2 text-center ${
                            i === j ? "bg-gray-100" : ""
                          }`}
                        >
                          {similarity.toFixed(1)}%
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </TabsContent>
        </Tabs>
      </CardContent>
    </Card>
  );
};

export default ProteinComparison;
