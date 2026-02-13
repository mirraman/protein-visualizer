"use client";

import React from "react";
import { Card, CardContent, CardHeader, CardTitle } from "./ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "./ui/tabs";
import { EnergyCalculator } from "@/lib/solvers/energy-calculator";
import type { Direction } from "@/lib/types";
import { ConnectionDetailsTable } from "./connection-details-table";
import { SequencePatternAnalysis } from "./sequence-pattern-analysis";

interface RealtimeAnalysisPanelProps {
  sequence: string;
  directions?: Direction[];
  positions?: Array<{ x: number; y: number; z: number }>;
  currentEnergy?: number;
  hhContacts?: number;
  collisions?: number;
  showConnectionTable?: boolean;
  onToggleConnectionTable?: () => void;
}

/**
 * Real-time Analysis Panel Component
 * Shows comprehensive analysis with tabs for different views
 */
export const RealtimeAnalysisPanel: React.FC<RealtimeAnalysisPanelProps> = ({
  sequence,
  directions,
  positions,
  currentEnergy,
  hhContacts,
  collisions,
  showConnectionTable = false,
  onToggleConnectionTable,
}) => {
  // Calculate metrics
  const metrics = React.useMemo(() => {
    if (!directions || directions.length === 0) {
      return {
        energy: currentEnergy ?? 0,
        collisions: collisions ?? 0,
        hydrophobicContacts: hhContacts ?? 0,
        isValid: true,
      };
    }

    try {
      const energy = EnergyCalculator.calculateEnergy(sequence, directions);
      const calculatedPositions =
        positions || EnergyCalculator.calculatePositions(sequence, directions);

      // Count collisions
      const occupied = new Set<string>();
      let collisionCount = 0;
      for (const pos of calculatedPositions) {
        const posKey = `${pos.x},${pos.y},${pos.z}`;
        if (occupied.has(posKey)) {
          collisionCount++;
        } else {
          occupied.add(posKey);
        }
      }

      // Count H-H contacts
      let contactCount = 0;
      if (energy !== Number.POSITIVE_INFINITY) {
        for (let i = 0; i < sequence.length; i++) {
          if (sequence[i] === "H") {
            for (let j = i + 2; j < sequence.length; j++) {
              if (sequence[j] === "H") {
                const dx = Math.abs(calculatedPositions[i].x - calculatedPositions[j].x);
                const dy = Math.abs(calculatedPositions[i].y - calculatedPositions[j].y);
                const dz = Math.abs(calculatedPositions[i].z - calculatedPositions[j].z);
                if (dx + dy + dz === 1) {
                  contactCount++;
                }
              }
            }
          }
        }
      }

      return {
        energy: energy === Number.POSITIVE_INFINITY ? 0 : energy,
        collisions: collisionCount,
        hydrophobicContacts: contactCount,
        isValid: energy !== Number.POSITIVE_INFINITY,
      };
    } catch (error) {
      console.error("Error calculating metrics:", error);
      return {
        energy: currentEnergy ?? 0,
        collisions: collisions ?? 0,
        hydrophobicContacts: hhContacts ?? 0,
        isValid: false,
      };
    }
  }, [sequence, directions, positions, currentEnergy, hhContacts, collisions]);

  return (
    <div className="h-full overflow-y-auto">
      <Tabs defaultValue="metrics" className="w-full">
        <TabsList className="grid w-full grid-cols-3">
          <TabsTrigger value="metrics">Metrics</TabsTrigger>
          <TabsTrigger value="sequence">Sequence</TabsTrigger>
          <TabsTrigger value="connections">Connections</TabsTrigger>
        </TabsList>

        {/* Metrics Tab */}
        <TabsContent value="metrics" className="space-y-4 mt-4">
          {/* Real-time Metrics */}
          <div className="grid grid-cols-2 gap-4">
            <div className="bg-gray-50 p-3 rounded-md border">
              <h3 className="text-sm font-medium text-gray-700">Total Residues</h3>
              <p className="text-2xl font-bold text-indigo-700">{sequence.length}</p>
            </div>
            <div
              className={`p-3 rounded-md border ${
                metrics.isValid ? "bg-green-50 border-green-200" : "bg-red-50 border-red-200"
              }`}
            >
              <h3 className="text-sm font-medium text-gray-700">Energy Score</h3>
              <p
                className={`text-2xl font-bold ${
                  metrics.isValid ? "text-green-700" : "text-red-700"
                }`}
              >
                {metrics.energy.toFixed(2)}
              </p>
              <p className="text-xs text-gray-600 mt-1">
                {metrics.energy < 0 ? "Good (negative)" : metrics.energy === 0 ? "Neutral" : "Poor"}
              </p>
            </div>
          </div>

          {/* Collision and Contact Metrics */}
          <div className="grid grid-cols-2 gap-4">
            <div
              className={`p-3 rounded-md border ${
                metrics.collisions > 0
                  ? "bg-red-50 border-red-200"
                  : "bg-green-50 border-green-200"
              }`}
            >
              <h3 className="text-sm font-medium text-gray-700">Collisions</h3>
              <p
                className={`text-2xl font-bold ${
                  metrics.collisions > 0 ? "text-red-700" : "text-green-700"
                }`}
              >
                {metrics.collisions}
              </p>
              <p className="text-xs text-gray-600 mt-1">
                {metrics.collisions === 0 ? "Valid" : "Invalid"}
              </p>
            </div>
            <div className="bg-blue-50 p-3 rounded-md border border-blue-200">
              <h3 className="text-sm font-medium text-gray-700">H-H Contacts</h3>
              <p className="text-2xl font-bold text-blue-700">
                {metrics.hydrophobicContacts}
              </p>
              <p className="text-xs text-gray-600 mt-1">
                Non-consecutive contacts
              </p>
            </div>
          </div>

          {/* Status Indicator */}
          {!metrics.isValid && (
            <div className="bg-red-100 border border-red-300 text-red-700 px-4 py-3 rounded-md">
              <strong>Invalid Configuration:</strong> The current folding directions
              create collisions or are invalid.
            </div>
          )}

          {/* Analysis Summary */}
          <Card>
            <CardHeader>
              <CardTitle className="text-sm">Analysis Summary</CardTitle>
            </CardHeader>
            <CardContent className="text-sm text-gray-600 space-y-2">
              <p>
                <strong>Energy:</strong> {metrics.energy.toFixed(2)} (lower is better)
              </p>
              <p>
                <strong>Collisions:</strong> {metrics.collisions} (0 is optimal)
              </p>
              <p>
                <strong>H-H Contacts:</strong> {metrics.hydrophobicContacts}
              </p>
              <p className="text-xs mt-3 pt-3 border-t">
                In the HP model, hydrophobic contacts contribute -1 energy each and
                are the primary driving force for protein folding.
              </p>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Sequence Tab */}
        <TabsContent value="sequence" className="mt-4">
          <SequencePatternAnalysis sequence={sequence} />
        </TabsContent>

        {/* Connections Tab */}
        <TabsContent value="connections" className="mt-4">
          {directions && directions.length > 0 ? (
            <ConnectionDetailsTable
              sequence={sequence}
              directions={directions}
              positions={positions}
              title="Chain Connection Details"
            />
          ) : (
            <Card>
              <CardContent className="pt-6">
                <p className="text-center text-gray-500">
                  No directions provided. Run solver to see connection details.
                </p>
              </CardContent>
            </Card>
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
};
