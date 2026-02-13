"use client";

import React from "react";
import { Card, CardContent, CardHeader, CardTitle } from "./ui/card";
import { Progress } from "./ui/progress";

interface SequencePatternAnalysisProps {
  sequence: string;
  title?: string;
}

/**
 * Sequence Pattern Analysis Component
 * Shows visual H/P pattern with statistics
 */
export const SequencePatternAnalysis: React.FC<SequencePatternAnalysisProps> = ({
  sequence,
  title = "Sequence Pattern Analysis",
}) => {
  // Calculate statistics
  const totalResidues = sequence.length;
  const hydrophobicCount = (sequence.match(/H/g) || []).length;
  const polarCount = (sequence.match(/P/g) || []).length;
  const hydrophobicPercentage = (hydrophobicCount / totalResidues) * 100;
  const polarPercentage = (polarCount / totalResidues) * 100;

  // Find hydrophobic clusters (consecutive H's)
  const findHydrophobicClusters = () => {
    const clusters: Array<{ start: number; end: number; length: number }> = [];
    let currentStart = -1;

    for (let i = 0; i < sequence.length; i++) {
      if (sequence[i] === "H") {
        if (currentStart === -1) {
          currentStart = i;
        }
      } else {
        if (currentStart !== -1) {
          clusters.push({
            start: currentStart,
            end: i - 1,
            length: i - currentStart,
          });
          currentStart = -1;
        }
      }
    }
    // Handle case where sequence ends with H
    if (currentStart !== -1) {
      clusters.push({
        start: currentStart,
        end: sequence.length - 1,
        length: sequence.length - currentStart,
      });
    }

    return clusters;
  };

  const clusters = React.useMemo(() => findHydrophobicClusters(), [sequence]);

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-lg">{title}</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        {/* Statistics Grid */}
        <div className="grid grid-cols-2 gap-3">
          <div className="bg-red-50 p-3 rounded-md border border-red-200">
            <h3 className="text-sm font-medium text-gray-700">Hydrophobic (H)</h3>
            <p className="text-2xl font-bold text-red-700">{hydrophobicCount}</p>
            <p className="text-xs text-gray-600">
              {hydrophobicPercentage.toFixed(1)}% of sequence
            </p>
          </div>
          <div className="bg-blue-50 p-3 rounded-md border border-blue-200">
            <h3 className="text-sm font-medium text-gray-700">Polar (P)</h3>
            <p className="text-2xl font-bold text-blue-700">{polarCount}</p>
            <p className="text-xs text-gray-600">
              {polarPercentage.toFixed(1)}% of sequence
            </p>
          </div>
        </div>

        {/* Progress Bars */}
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
              className="h-3 bg-gray-200 [&>div]:bg-red-500"
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
              className="h-3 bg-gray-200 [&>div]:bg-blue-500"
            />
          </div>
        </div>

        {/* Visual Sequence Pattern */}
        <div>
          <h3 className="text-sm font-medium text-gray-700 mb-2">
            Visual Pattern
          </h3>
          <div className="bg-gray-50 p-3 rounded-md border">
            <div className="flex flex-wrap gap-1">
              {sequence.split("").map((residue, index) => (
                <div
                  key={`${sequence}-${index}-${residue}`}
                  className={`w-8 h-8 flex items-center justify-center rounded-md text-white font-bold text-sm shadow-sm ${
                    residue === "H" ? "bg-red-500 hover:bg-red-600" : "bg-blue-500 hover:bg-blue-600"
                  }`}
                  title={`Position ${index + 1}: ${residue === "H" ? "Hydrophobic" : "Polar"}`}
                >
                  {residue}
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Hydrophobic Clusters Analysis */}
        {clusters.length > 0 && (
          <div>
            <h3 className="text-sm font-medium text-gray-700 mb-2">
              Hydrophobic Clusters
            </h3>
            <div className="space-y-2">
              {clusters.map((cluster, idx) => (
                <div
                  key={idx}
                  className="bg-red-50 p-2 rounded-md border border-red-200 text-sm"
                >
                  <span className="font-semibold text-red-700">
                    Cluster {idx + 1}:
                  </span>{" "}
                  <span className="text-gray-700">
                    Positions {cluster.start + 1}-{cluster.end + 1} (Length: {cluster.length})
                  </span>
                </div>
              ))}
            </div>
            <p className="text-xs text-gray-600 mt-2">
              {clusters.length} hydrophobic cluster{clusters.length !== 1 ? "s" : ""} found.
              These regions are likely to form the hydrophobic core.
            </p>
          </div>
        )}

        {/* Sequence Info */}
        <div className="bg-gray-50 p-3 rounded-md border">
          <div className="grid grid-cols-2 gap-4 text-sm">
            <div>
              <span className="text-gray-600">Total Length:</span>
              <span className="font-semibold ml-2">{totalResidues}</span>
            </div>
            <div>
              <span className="text-gray-600">H/P Ratio:</span>
              <span className="font-semibold ml-2">
                {polarCount > 0
                  ? (hydrophobicCount / polarCount).toFixed(2)
                  : "∞"}{" "}
                : 1
              </span>
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
};
