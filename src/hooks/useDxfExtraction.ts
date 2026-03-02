import { useState, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { extractFromDxfFile, DxfExtractionResult } from "@/lib/dxfExtractor";
import { toast } from "@/hooks/use-toast";

interface UseExtractionOptions {
  entityType: "part_library" | "parts";
  entityId?: string;
  enablePolygon?: boolean;
  defaultUnits?: "mm" | "inch";
  outlineLayerPreference?: string;
}

interface ExtractionState {
  extracting: boolean;
  result: DxfExtractionResult | null;
  error: string | null;
}

export function useDxfExtraction(options: UseExtractionOptions) {
  const { entityType, entityId, enablePolygon = false, defaultUnits = "mm", outlineLayerPreference = "OUTLINE" } = options;
  const [state, setState] = useState<ExtractionState>({ extracting: false, result: null, error: null });

  const extractFromFile = useCallback(async (file: File): Promise<DxfExtractionResult | null> => {
    setState({ extracting: true, result: null, error: null });

    try {
      const result = await extractFromDxfFile(file, {
        enablePolygon,
        defaultUnits,
        preferredOutlineLayer: outlineLayerPreference,
      });

      setState({ extracting: false, result, error: null });

      if (result.bbox) {
        if (result.bbox_confidence === "low") {
          toast({
            title: "DXF extraction: low confidence",
            description: result.notes.join("; ") || "Review extracted dimensions manually",
            variant: "destructive",
          });
        } else if (result.bbox_confidence === "medium") {
          toast({
            title: "DXF dimensions extracted",
            description: `${result.bbox.width_mm} × ${result.bbox.height_mm}mm (medium confidence)`,
          });
        } else {
          toast({
            title: "DXF dimensions extracted",
            description: `${result.bbox.width_mm} × ${result.bbox.height_mm}mm`,
          });
        }
      } else {
        toast({
          title: "No geometry found",
          description: "Could not extract dimensions from DXF",
          variant: "destructive",
        });
      }

      return result;
    } catch (err: any) {
      setState({ extracting: false, result: null, error: err.message });
      toast({ title: "DXF extraction failed", description: err.message, variant: "destructive" });
      return null;
    }
  }, [enablePolygon, defaultUnits, outlineLayerPreference]);

  const saveExtraction = useCallback(async (
    result: DxfExtractionResult,
    entityIdOverride?: string,
    dxfFileReference?: string
  ) => {
    const id = entityIdOverride || entityId;
    if (!id || !result.bbox) return;

    const updateData: Record<string, any> = {
      bbox_width_mm: result.bbox.width_mm,
      bbox_height_mm: result.bbox.height_mm,
      bbox_extracted_at: new Date().toISOString(),
      bbox_source: "dxf_extract",
      bbox_confidence: result.bbox_confidence,
      extraction_notes: result.notes.length > 0 ? result.notes.join("; ") : null,
    };

    if (result.polygon && enablePolygon) {
      updateData.outer_shape_type = "polygon";
      updateData.outer_polygon_points_json = result.polygon.points;
      updateData.polygon_source = "dxf_extract";
      updateData.polygon_confidence = result.polygon_confidence;
      updateData.outline_layer_name_used = result.outline_layer_used;
    }

    const { error } = await supabase
      .from(entityType)
      .update(updateData as any)
      .eq("id", id);

    if (error) {
      toast({ title: "Failed to save extraction", description: error.message, variant: "destructive" });
      return;
    }

    // Audit log
    const currentRecord = entityType === "part_library"
      ? await supabase.from("part_library").select("bbox_width_mm, bbox_height_mm, length_mm, width_mm").eq("id", id).single()
      : await supabase.from("parts").select("bbox_width_mm, bbox_height_mm, length_mm, width_mm").eq("id", id).single();

    await supabase.from("dxf_extraction_log").insert({
      entity_type: entityType,
      entity_id: id,
      dxf_file_reference: dxfFileReference || null,
      bbox_width_mm: result.bbox.width_mm,
      bbox_height_mm: result.bbox.height_mm,
      bbox_confidence: result.bbox_confidence,
      polygon_extracted: !!result.polygon,
      polygon_confidence: result.polygon_confidence,
      previous_bbox_width_mm: currentRecord.data?.bbox_width_mm || null,
      previous_bbox_height_mm: currentRecord.data?.bbox_height_mm || null,
      manual_override_exists: !!(currentRecord.data?.length_mm && currentRecord.data?.width_mm),
      notes: result.notes.join("; ") || null,
    } as any);

    toast({ title: "Extraction saved" });
  }, [entityType, entityId, enablePolygon]);

  return {
    ...state,
    extractFromFile,
    saveExtraction,
  };
}
