"use client";

import React, { useState, useEffect } from "react";
import { Canvas } from "@react-three/fiber";
import { OrbitControls } from "@react-three/drei";
import ProteinModel from "./protein-model";
import { Card, CardContent, CardHeader, CardTitle } from "./ui/card";
import { Button } from "./ui/button";
import { Slider } from "./ui/slider";
import type { IGAPopulation, IChromosome } from "@/lib/models/GAPopulation";

interface PopulationVisualizerProps {
  sequence: string;
  generations: IGAPopulation[]; // Toate generațiile salvate
  onChromosomeSelect?: (chromosome: IChromosome, generation: number) => void;
}

export const PopulationVisualizer: React.FC<PopulationVisualizerProps> = ({
  sequence,
  generations,
  onChromosomeSelect,
}) => {
  const [selectedGeneration, setSelectedGeneration] = useState(0);
  const [selectedChromosomeIndex, setSelectedChromosomeIndex] = useState(0);
  const [viewMode, setViewMode] = useState<"single" | "grid">("single");

  // Sortează generațiile după număr
  const sortedGenerations = [...generations].sort((a, b) => a.generation - b.generation);

  const currentGeneration = sortedGenerations[selectedGeneration];
  const currentChromosome = currentGeneration?.chromosomes[selectedChromosomeIndex];

  // Reset chromosome index when generation changes
  useEffect(() => {
    setSelectedChromosomeIndex(0);
  }, [selectedGeneration]);

  if (!currentChromosome || sortedGenerations.length === 0) {
    return (
      <Card>
        <CardContent className="pt-6">
          <div className="text-center text-gray-500 py-8">
            No population data available
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      {/* Controls */}
      <Card>
        <CardHeader>
          <CardTitle>Population Visualization</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Generation Selector */}
          <div>
            <label className="text-sm font-medium mb-2 block">
              Generation: {currentGeneration.generation}
            </label>
            <Slider
              value={[selectedGeneration]}
              onValueChange={([val]) => {
                setSelectedGeneration(val);
              }}
              min={0}
              max={sortedGenerations.length - 1}
              step={1}
            />
            <div className="flex justify-between text-xs text-gray-500 mt-1">
              <span>Gen 0</span>
              <span>Gen {sortedGenerations.length - 1}</span>
            </div>
          </div>

          {/* Chromosome Selector */}
          <div>
            <label className="text-sm font-medium mb-2 block">
              Chromosome: {selectedChromosomeIndex + 1} / {currentGeneration.chromosomes.length}
            </label>
            <Slider
              value={[selectedChromosomeIndex]}
              onValueChange={([val]) => setSelectedChromosomeIndex(val)}
              min={0}
              max={currentGeneration.chromosomes.length - 1}
              step={1}
            />
          </div>

          {/* View Mode Toggle */}
          <div className="flex gap-2">
            <Button
              variant={viewMode === "single" ? "default" : "outline"}
              onClick={() => setViewMode("single")}
              size="sm"
            >
              Single View
            </Button>
            <Button
              variant={viewMode === "grid" ? "default" : "outline"}
              onClick={() => setViewMode("grid")}
              size="sm"
            >
              Grid View (All {currentGeneration.chromosomes.length})
            </Button>
          </div>

          {/* Statistics */}
          <div className="grid grid-cols-3 gap-4 pt-2 border-t">
            <div>
              <div className="text-xs text-gray-600">Best Energy</div>
              <div className="text-lg font-bold text-green-600">
                {currentGeneration.bestEnergy.toFixed(2)}
              </div>
            </div>
            <div>
              <div className="text-xs text-gray-600">Avg Energy</div>
              <div className="text-lg font-bold">
                {currentGeneration.averageEnergy.toFixed(2)}
              </div>
            </div>
            <div>
              <div className="text-xs text-gray-600">Current Energy</div>
              <div className="text-lg font-bold text-blue-600">
                {currentChromosome.energy.toFixed(2)}
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Visualization */}
      {viewMode === "single" ? (
        <Card>
          <CardContent className="pt-6">
            <div className="h-[500px] bg-gray-50 rounded-md overflow-hidden">
              <Canvas>
                <ambientLight intensity={0.5} />
                <directionalLight position={[10, 10, 10]} intensity={1} />
                <OrbitControls enablePan enableZoom enableRotate />
                <ProteinModel
                  sequence={sequence}
                  directions={currentChromosome.directions as any}
                  type="3d"
                  showHHContacts={true}
                />
              </Canvas>
            </div>
            {currentChromosome.hhContacts !== undefined && (
              <div className="mt-2 text-sm text-center text-gray-600">
                H-H Contacts: {currentChromosome.hhContacts}
              </div>
            )}
          </CardContent>
        </Card>
      ) : (
        <Card>
          <CardContent className="pt-6">
            <div className="grid grid-cols-5 gap-2">
              {currentGeneration.chromosomes.map((chromosome, idx) => (
                <div
                  key={idx}
                  className={`h-[150px] bg-gray-50 rounded-md overflow-hidden cursor-pointer border-2 transition-colors ${
                    idx === selectedChromosomeIndex
                      ? "border-blue-500"
                      : "border-transparent hover:border-gray-300"
                  }`}
                  onClick={() => {
                    setSelectedChromosomeIndex(idx);
                    onChromosomeSelect?.(chromosome, currentGeneration.generation);
                  }}
                >
                  <Canvas>
                    <ambientLight intensity={0.5} />
                    <directionalLight position={[5, 5, 5]} intensity={0.5} />
                    <OrbitControls enablePan={false} enableZoom={false} enableRotate={false} />
                    <ProteinModel
                      sequence={sequence}
                      directions={chromosome.directions as any}
                      type="3d"
                      showHHContacts={true}
                    />
                  </Canvas>
                  <div className="text-xs text-center p-1 bg-white border-t">
                    <div className="font-semibold">#{idx + 1}</div>
                    <div className="text-gray-600">E: {chromosome.energy.toFixed(1)}</div>
                    {chromosome.hhContacts !== undefined && (
                      <div className="text-red-600">HH: {chromosome.hhContacts}</div>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
};
