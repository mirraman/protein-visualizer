"use client";

import { useState, useEffect } from "react";
import { useSession } from "next-auth/react";
import { useToast } from "@/components/ui/use-toast";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Database, Trash2, Loader2 } from "lucide-react";
import { getPublicProteins } from "@/app/actions";
import type { ProteinSequence } from "./protein-visualizer";
import { Direction } from "@/lib/types";
import { parseDirections } from "@/lib/utils";

interface SavedContentDialogProps {
  onLoadProtein: (protein: ProteinSequence) => void;
  onAddToComparison: (protein: ProteinSequence) => void;
  onLoadComparison: (proteins: ProteinSequence[]) => void;
  onComparisonSaved?: () => void;
}

export function SavedContentDialog({
  onLoadProtein,
  onAddToComparison,
  onLoadComparison,
  onComparisonSaved,
}: SavedContentDialogProps) {
  const { data: session } = useSession();
  const { toast } = useToast();
  const [open, setOpen] = useState(false);
  const [savedProteins, setSavedProteins] = useState<ProteinSequence[]>([]);
  const [savedComparisons, setSavedComparisons] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [deletingProteinId, setDeletingProteinId] = useState<string | null>(
    null
  );
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);
  const [proteinToDelete, setProteinToDelete] =
    useState<ProteinSequence | null>(null);

  const fetchSavedContent = async () => {
    try {
      setLoading(true);
      // Fetch proteins
      const { data: proteinsData, error: proteinsError } =
        await getPublicProteins();
      if (proteinsError) {
        throw new Error(proteinsError);
      }
      if (proteinsData) {
        console.log("Raw proteins data from database:", proteinsData);
        const processedProteins = proteinsData.map((protein) => {
          console.log(
            "Processing protein:",
            protein.name,
            "Raw directions:",
            protein.directions
          );
          const processedProtein = {
            ...protein,
            directions:
              protein.directions && Array.isArray(protein.directions)
                ? (protein.directions as Direction[])
                : protein.directions && typeof protein.directions === "string"
                ? parseDirections(protein.directions)
                : undefined,
          };
          console.log("Processed directions:", processedProtein.directions);
          return processedProtein;
        });
        console.log("Final processed proteins:", processedProteins);
        setSavedProteins(processedProteins);
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
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    // Fetch only when dialog is opened to avoid background flicker/refetches
    if (open) {
      fetchSavedContent();
    }
  }, [open, session?.user?.id]);

  // Note: onComparisonSaved is a callback from this dialog to parent, not a signal to refetch here.
  // Removing the effect that watched onComparisonSaved prevents unnecessary refetch/flicker.

  const handleDeleteClick = (protein: ProteinSequence) => {
    setProteinToDelete(protein);
    setShowDeleteDialog(true);
  };

  const handleDeleteConfirm = async () => {
    if (!proteinToDelete || !session?.user?.id) return;

    try {
      const proteinId =
        proteinToDelete._id?.toString() || proteinToDelete.id?.toString();
      setDeletingProteinId(proteinId || null);

      const response = await fetch("/api/proteins", {
        method: "DELETE",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          proteinId: proteinToDelete._id || proteinToDelete.id,
          userId: session.user.id,
        }),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || "Failed to delete protein");
      }

      // Remove from local state
      setSavedProteins((prev) =>
        prev.filter(
          (p) => (p._id || p.id) !== (proteinToDelete._id || proteinToDelete.id)
        )
      );

      toast({
        title: "Protein Deleted",
        description: `"${proteinToDelete.name}" has been deleted successfully.`,
      });
    } catch (error) {
      console.error("Error deleting protein:", error);
      toast({
        title: "Error",
        description:
          error instanceof Error ? error.message : "Failed to delete protein.",
        variant: "destructive",
      });
    } finally {
      setDeletingProteinId(null);
      setShowDeleteDialog(false);
      setProteinToDelete(null);
    }
  };

  const handleDeleteCancel = () => {
    setShowDeleteDialog(false);
    setProteinToDelete(null);
  };

  const handleLoadComparison = async (comparison: any) => {
    try {
      setLoading(true);
      console.log("=== Starting to load comparison ===");
      console.log(
        "Full comparison object:",
        JSON.stringify(comparison, null, 2)
      );

      // If proteins are not populated, fetch them using proteinIds
      const proteinIds = Array.isArray(comparison.proteins)
        ? comparison.proteins
        : comparison.proteinIds
        ? Array.isArray(comparison.proteinIds)
          ? comparison.proteinIds
          : [comparison.proteinIds]
        : [];

      console.log("Protein IDs to fetch:", proteinIds);

      if (proteinIds.length === 0) {
        console.log("No protein IDs found in comparison");
        toast({
          title: "Error",
          description: "No proteins found in this comparison",
          variant: "destructive",
        });
        return;
      }

      // Fetch full protein data for each protein in the comparison
      console.log("Starting to fetch protein data...");
      const proteinsWithData = await Promise.all(
        proteinIds.map(async (proteinId: string) => {
          console.log(`Fetching protein with ID: ${proteinId}`);
          try {
            const response = await fetch(`/api/proteins?id=${proteinId}`);
            console.log(
              `Response status for protein ${proteinId}:`,
              response.status
            );

            if (!response.ok) {
              console.error(
                `Failed to fetch protein ${proteinId}:`,
                response.status,
                response.statusText
              );
              throw new Error(
                `Failed to fetch protein: ${response.statusText}`
              );
            }

            const data = await response.json();
            console.log(`Successfully fetched protein ${proteinId}:`, data);

            // Ensure the protein data has the required fields
            if (!data.sequence) {
              throw new Error(`Protein ${proteinId} is missing sequence data`);
            }

            return {
              ...data,
              directions:
                data.directions && Array.isArray(data.directions)
                  ? (data.directions as Direction[])
                  : data.directions && typeof data.directions === "string"
                  ? parseDirections(data.directions)
                  : undefined,
            };
          } catch (error) {
            console.error(`Error fetching protein ${proteinId}:`, error);
            throw error;
          }
        })
      );

      console.log("=== All proteins loaded successfully ===");
      console.log("Final proteins data:", proteinsWithData);

      // Verify all proteins have sequence data
      const invalidProteins = proteinsWithData.filter((p) => !p.sequence);
      if (invalidProteins.length > 0) {
        throw new Error(
          `Some proteins are missing sequence data: ${invalidProteins
            .map((p) => p._id || p.id)
            .join(", ")}`
        );
      }

      onLoadComparison(proteinsWithData);
    } catch (error) {
      console.error("=== Error in handleLoadComparison ===");
      console.error("Error details:", error);
      toast({
        title: "Error",
        description:
          error instanceof Error
            ? error.message
            : "Failed to load comparison data. Please try again.",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button className="w-full">
          <Database className="w-4 h-4 mr-2" /> Browse Saved Content
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-3xl overflow-hidden">
        <DialogHeader>
          <DialogTitle>Saved Content</DialogTitle>
        </DialogHeader>
        <Tabs defaultValue="proteins" className="w-full">
          <TabsList className="grid w-full grid-cols-2">
            <TabsTrigger value="proteins">Saved Proteins</TabsTrigger>
            <TabsTrigger value="comparisons">Saved Comparisons</TabsTrigger>
          </TabsList>
          <TabsContent value="proteins" className="mt-4">
            <div className="max-h-[60vh] overflow-y-auto overflow-x-hidden">
              <table className="w-full border-collapse">
                <thead>
                  <tr>
                    <th className="border p-2 text-left">Name</th>
                    <th className="border p-2 text-left">Sequence</th>
                    <th className="border p-2 text-left">Directions</th>
                    <th className="border p-2 text-left">Length</th>
                    <th className="border p-2 text-left">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {loading ? (
                    <>
                      {Array.from({ length: 5 }).map((_, i) => (
                        <tr key={i}>
                          <td className="border p-2">
                            <Skeleton className="h-4 w-full max-w-[8rem]" />
                          </td>
                          <td className="border p-2">
                            <Skeleton className="h-4 w-full max-w-[16rem]" />
                          </td>
                          <td className="border p-2">
                            <Skeleton className="h-4 w-full max-w-[10rem]" />
                          </td>
                          <td className="border p-2">
                            <Skeleton className="h-4 w-full max-w-[3rem]" />
                          </td>
                          <td className="border p-2 overflow-hidden">
                            <div className="flex gap-2">
                              <Skeleton className="h-8 w-16" />
                              <Skeleton className="h-8 w-20" />
                              <Skeleton className="h-8 w-8" />
                            </div>
                          </td>
                        </tr>
                      ))}
                    </>
                  ) : savedProteins.length > 0 ? (
                    savedProteins.map((protein, index) => (
                      <tr
                        key={
                          (protein as any)._id?.toString?.() ||
                          (protein as any).id?.toString?.() ||
                          `${index}`
                        }
                        className={index % 2 === 0 ? "bg-gray-50" : ""}
                      >
                        <td className="border p-2">{protein.name}</td>
                        <td className="border p-2 font-mono">
                          {protein.sequence}
                        </td>
                        <td className="border p-2">
                          {protein.directions &&
                          protein.directions.length > 0 ? (
                            <div className="font-mono text-sm">
                              {protein.directions.map((dir, i) => (
                                <span
                                  key={i}
                                  className="inline-block w-4 text-center"
                                >
                                  {dir}
                                </span>
                              ))}
                            </div>
                          ) : (
                            <span className="text-gray-400">No directions</span>
                          )}
                        </td>
                        <td className="border p-2">
                          {protein.sequence.length}
                        </td>
                        <td className="border p-2">
                          <div className="flex gap-2 items-center flex-nowrap">
                            <Button
                              size="sm"
                              variant="outline"
                              className="shrink-0"
                              onClick={() => {
                                onLoadProtein(protein);
                                toast({
                                  title: "Sequence Loaded",
                                  description: `${
                                    protein.name || "Protein"
                                  } sequence loaded into the editor.`,
                                });
                                setOpen(false);
                              }}
                            >
                              Load
                            </Button>
                            <Button
                              size="sm"
                              variant="outline"
                              className="shrink-0"
                              onClick={() => onAddToComparison(protein)}
                            >
                              Compare
                            </Button>
                            {(session?.user?.id === protein.userId ||
                              !protein.userId) && (
                              <Button
                                size="sm"
                                variant="destructive"
                                className="shrink-0"
                                onClick={() => handleDeleteClick(protein)}
                                disabled={
                                  deletingProteinId ===
                                  (protein._id || protein.id?.toString())
                                }
                              >
                                {deletingProteinId ===
                                (protein._id || protein.id?.toString()) ? (
                                  <Loader2 className="w-3 h-3 animate-spin" />
                                ) : (
                                  <Trash2 className="w-3 h-3" />
                                )}
                              </Button>
                            )}
                          </div>
                        </td>
                      </tr>
                    ))
                  ) : (
                    <tr>
                      <td
                        colSpan={4}
                        className="border p-4 text-center text-gray-500"
                      >
                        No saved proteins found
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </TabsContent>
          <TabsContent value="comparisons" className="mt-4">
            <div className="max-h-[60vh] overflow-y-auto overflow-x-hidden">
              <table className="w-full border-collapse">
                <thead>
                  <tr>
                    <th className="border p-2 text-left">Name</th>
                    <th className="border p-2 text-left">Proteins</th>
                    <th className="border p-2 text-left">Created</th>
                    <th className="border p-2 text-left">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {loading ? (
                    <>
                      {Array.from({ length: 4 }).map((_, i) => (
                        <tr key={i}>
                          <td className="border p-2">
                            <Skeleton className="h-4 w-full max-w-[12rem]" />
                          </td>
                          <td className="border p-2">
                            <Skeleton className="h-4 w-full max-w-[2rem]" />
                          </td>
                          <td className="border p-2">
                            <Skeleton className="h-4 w-full max-w-[6rem]" />
                          </td>
                          <td className="border p-2">
                            <Skeleton className="h-8 w-20" />
                          </td>
                        </tr>
                      ))}
                    </>
                  ) : savedComparisons.length > 0 ? (
                    savedComparisons.map((comparison) => (
                      <tr key={comparison._id}>
                        <td className="border p-2">{comparison.name}</td>
                        <td className="border p-2">
                          {comparison.proteins.length}
                        </td>
                        <td className="border p-2">
                          {new Date(comparison.createdAt).toLocaleDateString()}
                        </td>
                        <td className="border p-2">
                          <div className="flex gap-2">
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => handleLoadComparison(comparison)}
                            >
                              Load
                            </Button>
                          </div>
                        </td>
                      </tr>
                    ))
                  ) : (
                    <tr>
                      <td
                        colSpan={4}
                        className="border p-4 text-center text-gray-500"
                      >
                        No saved comparisons found
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </TabsContent>
        </Tabs>
      </DialogContent>

      {/* Delete Confirmation Dialog */}
      <AlertDialog open={showDeleteDialog} onOpenChange={setShowDeleteDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Protein</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete "{proteinToDelete?.name}"? This
              action cannot be undone.
              <br />
              <span className="text-sm text-muted-foreground mt-2 block">
                Sequence:{" "}
                <code className="bg-gray-100 px-1 rounded">
                  {proteinToDelete?.sequence}
                </code>
              </span>
              {proteinToDelete?.directions &&
                proteinToDelete.directions.length > 0 && (
                  <span className="text-sm text-muted-foreground mt-1 block">
                    Directions:{" "}
                    <code className="bg-gray-100 px-1 rounded font-mono">
                      {proteinToDelete.directions.join("")}
                    </code>
                  </span>
                )}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={handleDeleteCancel}>
              Cancel
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDeleteConfirm}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {deletingProteinId ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  Deleting...
                </>
              ) : (
                <>
                  <Trash2 className="w-4 h-4 mr-2" />
                  Delete
                </>
              )}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Dialog>
  );
}
