"use client";

import React, { useRef } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "./ui/card";
import { Button } from "./ui/button";
import { Download } from "lucide-react";
import type { Direction } from "@/lib/types";
import { directionToPosition } from "@/lib/utils";
import { exportDomToPng } from "@/lib/export-utils";

interface Position {
  x: number;
  y: number;
  z: number;
}

interface ConnectionDetailsTableProps {
  sequence: string;
  directions?: Direction[];
  positions?: Position[];
  title?: string;
}

/**
 * Connection Details Table Component
 * Shows a table with Index, Direction, Coordinates, and Residue for each position
 * Similar to the example table provided by the user
 */
export const ConnectionDetailsTable: React.FC<ConnectionDetailsTableProps> = ({
  sequence,
  directions,
  positions: providedPositions,
  title = "Chain Connection Details",
}) => {
  // Calculate positions if not provided
  const positions = React.useMemo(() => {
    if (providedPositions) {
      return providedPositions;
    }

    const computedPositions: Position[] = [];
    computedPositions.push({ x: 0, y: 0, z: 0 }); // Start at origin

    if (directions) {
      for (let i = 1; i < sequence.length; i++) {
        const prevPos = computedPositions[i - 1];
        const direction = directions[i - 1];
        const positionChange = directionToPosition(direction);
        
        computedPositions.push({
          x: prevPos.x + positionChange.x,
          y: prevPos.y + positionChange.y,
          z: prevPos.z + positionChange.z,
        });
      }
    }

    return computedPositions;
  }, [sequence, directions, providedPositions]);

  // Build table data
  const tableData = React.useMemo(() => {
    const data: Array<{
      index: number;
      direction: string;
      coordinates: string;
      residue: string;
    }> = [];

    // First residue (no direction)
    data.push({
      index: 1,
      direction: "start",
      coordinates: `(${positions[0].x},${positions[0].y}${positions[0].z !== 0 ? `,${positions[0].z}` : ""})`,
      residue: sequence[0],
    });

    // Subsequent residues with directions
    for (let i = 1; i < sequence.length; i++) {
      const direction = directions && directions[i - 1] ? directions[i - 1] : "?";
      const pos = positions[i];
      data.push({
        index: i + 1,
        direction: direction,
        coordinates: `(${pos.x},${pos.y}${pos.z !== 0 ? `,${pos.z}` : ""})`,
        residue: sequence[i],
      });
    }

    return data;
  }, [sequence, directions, positions]);

  // Get direction color for styling
  const getDirectionColor = (direction: string): string => {
    switch (direction) {
      case "R": return "text-blue-600 font-semibold";
      case "L": return "text-red-600 font-semibold";
      case "U": return "text-green-600 font-semibold";
      case "D": return "text-orange-600 font-semibold";
      case "F": return "text-purple-600 font-semibold";
      case "B": return "text-pink-600 font-semibold";
      case "start": return "text-gray-500 italic";
      default: return "text-gray-600";
    }
  };

  // Get residue color
  const getResidueColor = (residue: string): string => {
    return residue === "H" ? "text-red-600 font-bold" : "text-blue-600 font-semibold";
  };

  const cardRef = useRef<HTMLDivElement>(null);

  const handleExportTable = async () => {
    if (cardRef.current) {
      try {
        await exportDomToPng(cardRef.current, `connection-details`);
      } catch (err) {
        console.error("Failed to export table:", err);
      }
    }
  };

  return (
    <Card ref={cardRef}>
      <CardHeader>
        <div className="flex justify-between items-center">
          <CardTitle className="text-lg">{title}</CardTitle>
          <Button
            variant="ghost"
            size="icon"
            className="h-8 w-8"
            onClick={handleExportTable}
            title="Export table as PNG"
            data-export-exclude
          >
            <Download className="h-4 w-4" />
          </Button>
        </div>
      </CardHeader>
      <CardContent>
        <div className="overflow-x-auto">
          <table className="w-full text-sm border-collapse">
            <thead>
              <tr className="border-b-2 border-gray-300">
                <th className="text-left p-2 font-semibold">Index</th>
                <th className="text-left p-2 font-semibold">Direction</th>
                <th className="text-left p-2 font-semibold">Coordinates</th>
                <th className="text-left p-2 font-semibold">Residue</th>
              </tr>
            </thead>
            <tbody>
              {tableData.map((row, idx) => (
                <tr
                  key={idx}
                  className={`border-b border-gray-200 hover:bg-gray-50 ${
                    row.residue === "H" ? "bg-red-50/30" : "bg-blue-50/30"
                  }`}
                >
                  <td className="p-2 font-mono">{row.index}</td>
                  <td className={`p-2 ${getDirectionColor(row.direction)}`}>
                    {row.direction}
                  </td>
                  <td className="p-2 font-mono">{row.coordinates}</td>
                  <td className={`p-2 ${getResidueColor(row.residue)}`}>
                    {row.residue}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        
        {/* Legend */}
        <div className="mt-4 pt-4 border-t border-gray-200">
          <div className="text-xs text-gray-600 space-y-1">
            <div className="font-semibold mb-2">Direction Colors:</div>
            <div className="flex flex-wrap gap-4">
              <span className="text-blue-600">R = Right</span>
              <span className="text-red-600">L = Left</span>
              <span className="text-green-600">U = Up</span>
              <span className="text-orange-600">D = Down</span>
              {directions?.some(d => d === "F" || d === "B") && (
                <>
                  <span className="text-purple-600">F = Forward</span>
                  <span className="text-pink-600">B = Backward</span>
                </>
              )}
            </div>
            <div className="mt-2">
              <span className="text-red-600 font-bold">H = Hydrophobic</span>
              {" | "}
              <span className="text-blue-600 font-semibold">P = Polar</span>
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
};
