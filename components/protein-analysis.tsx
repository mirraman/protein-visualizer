"use client";

import React from "react";
import type { ProteinSequence } from "./protein-visualizer";
import { Progress } from "@/components/ui/progress";
import { EnergyCalculator } from "@/lib/solvers/energy-calculator";
import { Direction } from "@/lib/types";

interface ProteinAnalysisProps {
  proteinData: ProteinSequence;
}

const ProteinAnalysis: React.FC<ProteinAnalysisProps> = ({ proteinData }) => {
  const { sequence, directions } = proteinData;

  // Calculate basic statistics
  const totalResidues = sequence.length;
  const hydrophobicCount = (sequence.match(/H/g) || []).length;
  const polarCount = (sequence.match(/P/g) || []).length;
  const hydrophobicPercentage = (hydrophobicCount / totalResidues) * 100;
  const polarPercentage = (polarCount / totalResidues) * 100;

  // Calculate real metrics using the energy calculator
  const calculateMetrics = () => {
    if (!directions || directions.length === 0) {
      return {
        energy: 0,
        collisions: 0,
        hydrophobicContacts: 0,
        isValid: true,
      };
    }

    try {
      // Use the proper energy calculator
      const energy = EnergyCalculator.calculateEnergy(sequence, directions);

      // Calculate positions to check for collisions
      const positions = EnergyCalculator.calculatePositions(
        sequence,
        directions
      );

      // Count collisions (self-intersections)
      const occupied = new Set<string>();
      let collisions = 0;

      for (const pos of positions) {
        const posKey = `${pos.x},${pos.y},${pos.z}`;
        if (occupied.has(posKey)) {
          collisions++;
        } else {
          occupied.add(posKey);
        }
      }

      // Count H-H contacts for display
      let hydrophobicContacts = 0;
      if (energy !== Number.POSITIVE_INFINITY) {
        for (let i = 0; i < sequence.length; i++) {
          if (sequence[i] === "H") {
            for (let j = i + 2; j < sequence.length; j++) {
              if (sequence[j] === "H") {
                const dx = Math.abs(positions[i].x - positions[j].x);
                const dy = Math.abs(positions[i].y - positions[j].y);
                const dz = Math.abs(positions[i].z - positions[j].z);
                if (dx + dy + dz === 1) {
                  hydrophobicContacts++;
                }
              }
            }
          }
        }
      }

      return {
        energy: energy === Number.POSITIVE_INFINITY ? 0 : energy,
        collisions,
        hydrophobicContacts,
        isValid: energy !== Number.POSITIVE_INFINITY,
      };
    } catch (error) {
      console.error("Error calculating metrics:", error);
      return {
        energy: 0,
        collisions: 0,
        hydrophobicContacts: 0,
        isValid: false,
      };
    }
  };

  const metrics = React.useMemo(
    () => calculateMetrics(),
    [sequence, directions]
  );

  return (
    <div className="space-y-4">
      {/* Real-time Metrics */}
      <div className="grid grid-cols-2 gap-4">
        <div className="bg-gray-50 p-3 rounded-md">
          <h3 className="text-sm font-medium text-gray-700">Total Residues</h3>
          <p className="text-2xl font-bold text-indigo-700">{totalResidues}</p>
        </div>
        <div
          className={`p-3 rounded-md ${
            metrics.isValid ? "bg-green-50" : "bg-red-50"
          }`}
        >
          <h3 className="text-sm font-medium text-gray-700">Energy Score</h3>
          <p
            className={`text-2xl font-bold ${
              metrics.isValid ? "text-green-700" : "text-red-700"
            }`}
          >
            {metrics.energy}
          </p>
        </div>
      </div>

      {/* Collision and Contact Metrics */}
      <div className="grid grid-cols-2 gap-4">
        <div
          className={`p-3 rounded-md ${
            metrics.collisions > 0 ? "bg-red-50" : "bg-green-50"
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
        </div>
        <div className="bg-gray-50 p-3 rounded-md">
          <h3 className="text-sm font-medium text-gray-700">H-H Contacts</h3>
          <p className="text-2xl font-bold text-blue-700">
            {metrics.hydrophobicContacts}
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

      <div className="space-y-2">
        <div>
          <div className="flex justify-between mb-1">
            <span className="text-sm font-medium text-gray-700">
              Hydrophobic (H)
            </span>
            <span className="text-sm font-medium text-gray-700">
              {hydrophobicCount} ({hydrophobicPercentage.toFixed(1)}%)
            </span>
          </div>
          <Progress
            value={hydrophobicPercentage}
            className="h-2 bg-gray-200 [&>div]:bg-red-500"
          />
        </div>

        <div>
          <div className="flex justify-between mb-1">
            <span className="text-sm font-medium text-gray-700">Polar (P)</span>
            <span className="text-sm font-medium text-gray-700">
              {polarCount} ({polarPercentage.toFixed(1)}%)
            </span>
          </div>
          <Progress
            value={polarPercentage}
            className="h-2 bg-gray-200 [&>div]:bg-blue-500"
          />
        </div>
      </div>

      <div className="bg-gray-50 p-3 rounded-md">
        <h3 className="text-sm font-medium text-gray-700 mb-2">
          Sequence Pattern
        </h3>
        <div className="flex flex-wrap gap-1">
          {sequence.split("").map((residue, index) => (
            <div
              key={`${sequence}-${index}-${residue}`}
              className={`w-8 h-8 flex items-center justify-center rounded-md text-white font-medium ${
                residue === "H" ? "bg-red-500" : "bg-blue-500"
              }`}
            >
              {residue}
            </div>
          ))}
        </div>
      </div>

      <div>
        <h3 className="text-sm font-medium text-gray-700 mb-2">
          Real-time Analysis
        </h3>
        <p className="text-sm text-gray-600">
          Energy: {metrics.energy} (lower is better), Collisions:{" "}
          {metrics.collisions} (0 is optimal), H-H Contacts:{" "}
          {metrics.hydrophobicContacts}. In the HP model, hydrophobic contacts
          contribute -1 energy each and are the primary driving force for
          protein folding.
        </p>
      </div>
    </div>
  );
};

export default React.memo(ProteinAnalysis);
