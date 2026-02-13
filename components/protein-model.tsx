"use client";

import React, { useMemo } from "react";
import {
  Line,
  Text,
  Sphere,
  Cylinder,
  MeshTransmissionMaterial,
} from "@react-three/drei";
import type { Direction } from "@/lib/types";
import { directionToPosition } from "@/lib/utils";
import type { ParsedPDB } from "@/lib/parsers/pdb-parser";
import { getElementColor, getVdwRadius } from "@/lib/parsers/pdb-parser";
// No THREE types needed since we removed runtime rotation

export type PDBVisualizationType =
  | "ball-and-stick"
  | "cartoon"
  | "space-filling"
  | "stick";

interface ProteinModelProps {
  sequence: string;
  directions?: Direction[];
  type: "2d" | "3d" | "ribbon" | "space-filling" | "surface";
  // NEW: Optional PDB data for Rosetta results
  pdbData?: ParsedPDB;
  pdbVisualizationType?: PDBVisualizationType;
  showHHContacts?: boolean; // Show H-H contact lines (default: true)
}

interface Position {
  x: number;
  y: number;
  z: number;
}

/**
 * Calculează contactele H-H (hidrofobice) între aminoacizi
 * Un contact H-H = doi aminoacizi H care sunt vecini în spațiu (distanță Manhattan = 1)
 * dar NU sunt adiacenți în secvență
 */
function calculateHHContacts(sequence: string, positions: Position[]): [number, number][] {
  const contacts: [number, number][] = [];
  
  for (let i = 0; i < sequence.length; i++) {
    if (sequence[i] === "H") {
      // Începem de la i+2 pentru a evita contactele adiacente în secvență
      for (let j = i + 2; j < sequence.length; j++) {
        if (sequence[j] === "H") {
          const dx = Math.abs(positions[i].x - positions[j].x);
          const dy = Math.abs(positions[i].y - positions[j].y);
          const dz = Math.abs(positions[i].z - positions[j].z);
          
          // Distanța Manhattan = 1 înseamnă că sunt vecini pe grilă (contact!)
          if (dx + dy + dz === 1) {
            contacts.push([i, j]);
          }
        }
      }
    }
  }
  
  return contacts;
}

const ProteinModel: React.FC<ProteinModelProps> = ({
  sequence,
  directions,
  type,
  pdbData,
  pdbVisualizationType = "ball-and-stick",
  showHHContacts = true,
}) => {
  // Model is static; no rotation/animation refs required

  // Generate positions for each amino acid in the sequence
  const { positions, bonds, hhContacts, computedDirections } = useMemo(() => {
    const positions: Position[] = [];
    const bonds: [number, number][] = [];

    // If no directions provided, generate a default folding pattern
    const defaultDirections: Direction[] = [];
    if (!directions) {
      for (let i = 0; i < sequence.length - 1; i++) {
        // Simple alternating pattern
        defaultDirections.push(i % 2 === 0 ? "R" : i % 4 === 1 ? "U" : "D");
      }
    }

    const dirs = directions || defaultDirections;

    // Start with the first amino acid at the origin
    positions.push({ x: 0, y: 0, z: 0 });

    // Place each subsequent amino acid based on the directions
    for (let i = 1; i < sequence.length; i++) {
      const prevPos = positions[i - 1];
      const direction = dirs[i - 1];

      const positionChange = directionToPosition(direction);
      const newPos: Position = {
        x: prevPos.x + positionChange.x,
        y: prevPos.y + positionChange.y,
        z: prevPos.z + positionChange.z,
      };

      positions.push(newPos);
      bonds.push([i - 1, i]);
    }

    // Force a strictly planar layout: all positions on the same Z=0 plane
    // Force a strictly planar layout: all positions on the same Z=0 plane
    if (type === "2d") {
      for (let i = 0; i < positions.length; i++) {
        positions[i].z = 0;
      }
    }

    // Calculate H-H contacts
    const hhContacts = calculateHHContacts(sequence, positions);

    return { positions, bonds, hhContacts, computedDirections: dirs };
  }, [sequence, directions, type]);

  // No animation: the protein model remains completely static

  // Center the model
  const center = useMemo(() => {
    const x = positions.reduce((sum, pos) => sum + pos.x, 0) / positions.length;
    const y = positions.reduce((sum, pos) => sum + pos.y, 0) / positions.length;
    const z = positions.reduce((sum, pos) => sum + pos.z, 0) / positions.length;
    return { x, y, z };
  }, [positions]);

  // Generate a smooth curve for ribbon visualization
  const ribbonPoints = useMemo(() => {
    if (type !== "ribbon") return [];

    // Create a smooth curve through the positions
    const points: [number, number, number][] = [];
    for (let i = 0; i < positions.length; i++) {
      points.push([positions[i].x, positions[i].y, positions[i].z]);
    }
    return points;
  }, [positions, type]);

  // NEW: Render PDB data if provided
  if (pdbData && pdbData.atoms.length > 0) {
    // Center the PDB structure
    const pdbCenter = useMemo(() => {
      const x =
        pdbData.atoms.reduce((sum, atom) => sum + atom.x, 0) /
        pdbData.atoms.length;
      const y =
        pdbData.atoms.reduce((sum, atom) => sum + atom.y, 0) /
        pdbData.atoms.length;
      const z =
        pdbData.atoms.reduce((sum, atom) => sum + atom.z, 0) /
        pdbData.atoms.length;
      return { x, y, z };
    }, [pdbData]);

    // Get CA atoms for cartoon/ribbon representation
    const caAtoms = useMemo(() => {
      return pdbData.atoms
        .filter((atom) => atom.name === "CA")
        .sort((a, b) => a.resSeq - b.resSeq);
    }, [pdbData]);

    // Ball and Stick rendering
    if (pdbVisualizationType === "ball-and-stick") {
      return (
        <group position={[-pdbCenter.x, -pdbCenter.y, -pdbCenter.z]}>
          {/* Render atoms as small spheres */}
          {pdbData.atoms.map((atom, index) => (
            <Sphere
              key={`atom-${index}`}
              position={[atom.x, atom.y, atom.z]}
              args={[0.3, 16, 16]}
            >
              <meshStandardMaterial
                color={getElementColor(atom.element)}
                roughness={0.5}
              />
            </Sphere>
          ))}

          {/* Render bonds as lines */}
          {pdbData.bonds.map(([i, j], index) => {
            const atom1 = pdbData.atoms[i];
            const atom2 = pdbData.atoms[j];
            if (!atom1 || !atom2) return null;

            return (
              <Line
                key={`bond-${index}`}
                points={[
                  [atom1.x, atom1.y, atom1.z],
                  [atom2.x, atom2.y, atom2.z],
                ]}
                color="#666666"
                lineWidth={1.5}
              />
            );
          })}
        </group>
      );
    }

    // Cartoon/Ribbon rendering (backbone only)
    if (pdbVisualizationType === "cartoon") {
      const ribbonPoints: [number, number, number][] = caAtoms.map((atom) => [
        atom.x,
        atom.y,
        atom.z,
      ]);

      return (
        <group position={[-pdbCenter.x, -pdbCenter.y, -pdbCenter.z]}>
          {/* Render smooth ribbon through CA atoms */}
          {ribbonPoints.length > 1 && (
            <Line points={ribbonPoints} color="#4dabf7" lineWidth={8} />
          )}

          {/* Mark CA positions */}
          {caAtoms.map((atom, index) => (
            <Sphere
              key={`ca-${index}`}
              position={[atom.x, atom.y, atom.z]}
              args={[0.2, 12, 12]}
            >
              <meshStandardMaterial color="#4dabf7" roughness={0.4} />
            </Sphere>
          ))}
        </group>
      );
    }

    // Space-filling rendering (van der Waals radii)
    if (pdbVisualizationType === "space-filling") {
      return (
        <group position={[-pdbCenter.x, -pdbCenter.y, -pdbCenter.z]}>
          {pdbData.atoms.map((atom, index) => (
            <Sphere
              key={`atom-${index}`}
              position={[atom.x, atom.y, atom.z]}
              args={[getVdwRadius(atom.element) * 0.3, 24, 24]}
            >
              <meshStandardMaterial
                color={getElementColor(atom.element)}
                roughness={0.3}
              />
            </Sphere>
          ))}
        </group>
      );
    }

    // Stick rendering (bonds only, no atoms)
    if (pdbVisualizationType === "stick") {
      return (
        <group position={[-pdbCenter.x, -pdbCenter.y, -pdbCenter.z]}>
          {pdbData.bonds.map(([i, j], index) => {
            const atom1 = pdbData.atoms[i];
            const atom2 = pdbData.atoms[j];
            if (!atom1 || !atom2) return null;

            return (
              <Line
                key={`bond-${index}`}
                points={[
                  [atom1.x, atom1.y, atom1.z],
                  [atom2.x, atom2.y, atom2.z],
                ]}
                color="#888888"
                lineWidth={3}
              />
            );
          })}
        </group>
      );
    }
  }

  // EXISTING: Render HP lattice (unchanged)
  return (
    <group position={[-center.x, -center.y, -center.z]}>
      {/* Render based on visualization type */}
      {type === "2d" || type === "3d" ? (
        <>
          {/* Render H-H contacts as highlighted red lines (if enabled) */}
          {showHHContacts && hhContacts.map(([i, j], index) => (
            <Line
              key={`hh-contact-${index}`}
              points={[
                [positions[i].x, positions[i].y, positions[i].z],
                [positions[j].x, positions[j].y, positions[j].z],
              ]}
              color="#ff6b6b" // Red for H-H contacts
              lineWidth={3}
            />
          ))}

          {/* Render sequential bonds as lines with direction-based colors */}
          {bonds.map(([i, j], index) => {
            // Get direction for this bond to color-code it
            const direction = computedDirections && computedDirections[index] ? computedDirections[index] : null;
            let bondColor = "#666666"; // Default gray
            
            // Color-code by direction for better visibility
            if (direction) {
              switch (direction) {
                case "R": bondColor = "#3b82f6"; break; // Blue for Right
                case "L": bondColor = "#ef4444"; break; // Red for Left
                case "U": bondColor = "#10b981"; break; // Green for Up
                case "D": bondColor = "#f59e0b"; break; // Orange for Down
                case "F": bondColor = "#8b5cf6"; break; // Purple for Forward
                case "B": bondColor = "#ec4899"; break; // Pink for Backward
              }
            }
            
            return (
              <Line
                key={`bond-${index}`}
                points={[
                  [positions[i].x, positions[i].y, positions[i].z],
                  [positions[j].x, positions[j].y, positions[j].z],
                ]}
                color={bondColor}
                lineWidth={2.5} // Thicker for better visibility
              />
            );
          })}

          {/* Render amino acids: flat discs for 2D, spheres for 3D */}
          {positions.map((pos, index) => (
            <group key={`amino-${index}`} position={[pos.x, pos.y, pos.z]}>
              <mesh rotation={type === "2d" ? [-Math.PI / 2, 0, 0] : [0, 0, 0]}>
                {type === "2d" ? (
                  <>
                    <circleGeometry args={[0.35, 32]} />
                    <meshBasicMaterial
                      color={sequence[index] === "H" ? "#ff6b6b" : "#4dabf7"}
                    />
                  </>
                ) : (
                  <>
                    <sphereGeometry args={[0.3, 16, 16]} />
                    <meshStandardMaterial
                      color={sequence[index] === "H" ? "#ff6b6b" : "#4dabf7"}
                      roughness={0.5}
                    />
                  </>
                )}
              </mesh>
              <Text
                position={[0, type === "2d" ? 0.01 : 0.5, 0]}
                fontSize={0.3}
                color="black"
                anchorX="center"
                anchorY="middle"
              >
                {sequence[index]}
              </Text>
            </group>
          ))}
        </>
      ) : type === "ribbon" ? (
        <>
          {/* Render a smooth ribbon through the positions */}
          <Line
            points={ribbonPoints}
            color="#4dabf7"
            lineWidth={5}
            dashed={false}
          />

          {/* Add spheres at hydrophobic positions */}
          {positions.map(
            (pos, index) =>
              sequence[index] === "H" && (
                <mesh key={`h-${index}`} position={[pos.x, pos.y, pos.z]}>
                  <sphereGeometry args={[0.2, 16, 16]} />
                  <meshStandardMaterial color="#ff6b6b" roughness={0.5} />
                </mesh>
              )
          )}
        </>
      ) : type === "space-filling" ? (
        <>
          {/* Render amino acids as larger spheres */}
          {positions.map((pos, index) => (
            <Sphere
              key={`sphere-${index}`}
              position={[pos.x, pos.y, pos.z]}
              args={[0.5, 32, 32]}
            >
              <meshStandardMaterial
                color={sequence[index] === "H" ? "#ff6b6b" : "#4dabf7"}
                roughness={0.3}
              />
            </Sphere>
          ))}
        </>
      ) : type === "surface" ? (
        <>
          {/* Render a surface representation */}
          {positions.map((pos, index) => (
            <Sphere
              key={`surface-${index}`}
              position={[pos.x, pos.y, pos.z]}
              args={[0.6, 32, 32]}
            >
              <MeshTransmissionMaterial
                backside
                samples={4}
                thickness={0.5}
                chromaticAberration={0.1}
                anisotropy={0.1}
                distortion={0.1}
                distortionScale={0.1}
                temporalDistortion={0.1}
                color={sequence[index] === "H" ? "#ff6b6b" : "#4dabf7"}
                opacity={0.7}
              />
            </Sphere>
          ))}
        </>
      ) : null}
    </group>
  );
};

export default React.memo(ProteinModel);
