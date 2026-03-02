/**
 * Client-side DXF bounding-box and polygon extraction.
 * Parses ASCII DXF text format, extracts entity geometry,
 * computes bounding box, and optionally extracts outer polygon outline.
 */

export interface DxfBoundingBox {
  width_mm: number;
  height_mm: number;
  min_x: number;
  min_y: number;
  max_x: number;
  max_y: number;
}

export interface DxfPolygon {
  points: [number, number][];
  area: number;
  is_closed: boolean;
  layer: string;
}

export interface DxfExtractionResult {
  bbox: DxfBoundingBox | null;
  bbox_confidence: "high" | "medium" | "low";
  polygon: DxfPolygon | null;
  polygon_confidence: "high" | "medium" | "low" | null;
  outline_layer_used: string | null;
  notes: string[];
  entity_count: number;
  has_closed_polylines: boolean;
  detected_units: "mm" | "inch" | "unknown";
}

interface Point2D {
  x: number;
  y: number;
}

interface DxfEntity {
  type: string;
  layer: string;
  points: Point2D[];
  is_closed: boolean;
}

/**
 * Parse a DXF text string and extract geometry.
 */
export function extractFromDxf(
  dxfContent: string,
  options: {
    preferredOutlineLayer?: string;
    enablePolygon?: boolean;
    defaultUnits?: "mm" | "inch";
  } = {}
): DxfExtractionResult {
  const {
    preferredOutlineLayer = "OUTLINE",
    enablePolygon = false,
    defaultUnits = "mm",
  } = options;

  const notes: string[] = [];
  const lines = dxfContent.split(/\r?\n/);
  const entities = parseEntities(lines);
  const detectedUnits = detectUnits(lines, defaultUnits);

  if (detectedUnits === "unknown") {
    notes.push(`Unit metadata missing; assuming ${defaultUnits}`);
  }

  const unitScale = detectedUnits === "inch" ? 25.4 : 1;

  // Compute overall bounding box from all geometric entities
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  let geometricEntityCount = 0;
  let hasClosedPolylines = false;
  const closedPolylines: DxfEntity[] = [];

  for (const entity of entities) {
    if (entity.points.length === 0) continue;
    geometricEntityCount++;

    if (entity.is_closed && entity.points.length >= 3) {
      hasClosedPolylines = true;
      closedPolylines.push(entity);
    }

    for (const pt of entity.points) {
      const sx = pt.x * unitScale;
      const sy = pt.y * unitScale;
      if (sx < minX) minX = sx;
      if (sy < minY) minY = sy;
      if (sx > maxX) maxX = sx;
      if (sy > maxY) maxY = sy;
    }
  }

  if (geometricEntityCount === 0) {
    notes.push("No geometric entities found in DXF");
    return {
      bbox: null,
      bbox_confidence: "low",
      polygon: null,
      polygon_confidence: null,
      outline_layer_used: null,
      notes,
      entity_count: entities.length,
      has_closed_polylines: false,
      detected_units: detectedUnits === "unknown" ? defaultUnits : detectedUnits,
    };
  }

  const bboxWidth = maxX - minX;
  const bboxHeight = maxY - minY;

  // Determine bbox confidence
  let bboxConfidence: "high" | "medium" | "low" = "medium";
  if (hasClosedPolylines && geometricEntityCount >= 2) {
    bboxConfidence = "high";
  } else if (geometricEntityCount <= 2) {
    bboxConfidence = "low";
    notes.push("Very few entities; bbox may be unreliable");
  }
  if (detectedUnits === "unknown") {
    bboxConfidence = bboxConfidence === "high" ? "medium" : "low";
  }

  // Sanity checks
  if (bboxWidth <= 0 || bboxHeight <= 0) {
    notes.push("Degenerate bounding box (zero or negative dimension)");
    bboxConfidence = "low";
  }
  if (bboxWidth < 5 || bboxHeight < 5) {
    notes.push("Bounding box extremely small (<5mm); possible unit mismatch");
    bboxConfidence = "low";
  }
  if (bboxWidth > 10000 || bboxHeight > 10000) {
    notes.push("Bounding box very large (>10m); verify units");
    if (bboxConfidence === "high") bboxConfidence = "medium";
  }

  const bbox: DxfBoundingBox = {
    width_mm: Math.round(bboxWidth * 100) / 100,
    height_mm: Math.round(bboxHeight * 100) / 100,
    min_x: Math.round(minX * 100) / 100,
    min_y: Math.round(minY * 100) / 100,
    max_x: Math.round(maxX * 100) / 100,
    max_y: Math.round(maxY * 100) / 100,
  };

  // Polygon extraction (optional)
  let polygon: DxfPolygon | null = null;
  let polygonConfidence: "high" | "medium" | "low" | null = null;
  let outlineLayerUsed: string | null = null;

  if (enablePolygon && closedPolylines.length > 0) {
    // Prefer polylines on the preferred outline layer
    const onPreferredLayer = closedPolylines.filter(
      (e) => e.layer.toUpperCase() === preferredOutlineLayer.toUpperCase()
    );

    let selected: DxfEntity | null = null;

    if (onPreferredLayer.length === 1) {
      selected = onPreferredLayer[0];
      polygonConfidence = "high";
      outlineLayerUsed = selected.layer;
    } else if (onPreferredLayer.length > 1) {
      // Pick largest by area
      selected = pickLargestPolyline(onPreferredLayer, unitScale);
      polygonConfidence = "medium";
      outlineLayerUsed = selected.layer;
      notes.push(`Multiple polylines on ${preferredOutlineLayer} layer; selected largest`);
    } else {
      // Fallback: largest closed polyline on any layer
      selected = pickLargestPolyline(closedPolylines, unitScale);
      polygonConfidence = "medium";
      outlineLayerUsed = selected.layer;
      notes.push(`No polylines on ${preferredOutlineLayer} layer; using largest from '${selected.layer}'`);
    }

    if (selected) {
      const scaledPoints: [number, number][] = selected.points.map((p) => [
        Math.round(p.x * unitScale * 100) / 100,
        Math.round(p.y * unitScale * 100) / 100,
      ]);
      const area = computePolygonArea(scaledPoints);

      // Check for self-intersections (simplified: just check area > 0)
      if (area <= 0) {
        polygonConfidence = "low";
        notes.push("Polygon area is zero or negative; possible self-intersection");
      }

      polygon = {
        points: scaledPoints,
        area: Math.round(area * 100) / 100,
        is_closed: selected.is_closed,
        layer: selected.layer,
      };
    }
  }

  return {
    bbox,
    bbox_confidence: bboxConfidence,
    polygon,
    polygon_confidence: polygonConfidence,
    outline_layer_used: outlineLayerUsed,
    notes,
    entity_count: geometricEntityCount,
    has_closed_polylines: hasClosedPolylines,
    detected_units: detectedUnits === "unknown" ? defaultUnits : detectedUnits,
  };
}

function parseEntities(lines: string[]): DxfEntity[] {
  const entities: DxfEntity[] = [];
  let inEntities = false;
  let i = 0;

  // Find ENTITIES section
  while (i < lines.length) {
    if (lines[i].trim() === "ENTITIES" && i > 0 && lines[i - 1].trim() === "2") {
      inEntities = true;
      i++;
      break;
    }
    i++;
  }

  if (!inEntities) return entities;

  while (i < lines.length) {
    const code = lines[i]?.trim();
    const value = lines[i + 1]?.trim();

    if (code === "0" && value === "ENDSEC") break;

    if (code === "0") {
      const entityType = value;
      if (entityType === "LINE") {
        const entity = parseLine(lines, i + 2);
        if (entity) entities.push(entity);
        i = entity ? entity._endIndex : i + 2;
      } else if (entityType === "LWPOLYLINE") {
        const entity = parseLwPolyline(lines, i + 2);
        if (entity) entities.push(entity);
        i = entity ? entity._endIndex : i + 2;
      } else if (entityType === "POLYLINE") {
        const entity = parsePolyline(lines, i + 2);
        if (entity) entities.push(entity);
        i = entity ? entity._endIndex : i + 2;
      } else if (entityType === "CIRCLE") {
        const entity = parseCircle(lines, i + 2);
        if (entity) entities.push(entity);
        i = entity ? entity._endIndex : i + 2;
      } else if (entityType === "ARC") {
        const entity = parseArc(lines, i + 2);
        if (entity) entities.push(entity);
        i = entity ? entity._endIndex : i + 2;
      } else if (entityType === "INSERT" || entityType === "SPLINE") {
        // Skip complex entities but still scan for bbox-relevant data
        i += 2;
      } else {
        i += 2;
      }
    } else {
      i += 2;
    }
  }

  return entities;
}

interface ParsedEntity extends DxfEntity {
  _endIndex: number;
}

function parseLine(lines: string[], startIndex: number): ParsedEntity | null {
  let layer = "0";
  let x1 = 0, y1 = 0, x2 = 0, y2 = 0;
  let i = startIndex;

  while (i < lines.length) {
    const code = parseInt(lines[i]?.trim());
    const val = lines[i + 1]?.trim();
    if (isNaN(code)) break;

    if (code === 0) break;
    if (code === 8) layer = val;
    if (code === 10) x1 = parseFloat(val);
    if (code === 20) y1 = parseFloat(val);
    if (code === 11) x2 = parseFloat(val);
    if (code === 21) y2 = parseFloat(val);
    i += 2;
  }

  return {
    type: "LINE",
    layer,
    points: [{ x: x1, y: y1 }, { x: x2, y: y2 }],
    is_closed: false,
    _endIndex: i,
  };
}

function parseLwPolyline(lines: string[], startIndex: number): ParsedEntity | null {
  let layer = "0";
  let closed = false;
  const points: Point2D[] = [];
  let i = startIndex;
  let currentX: number | null = null;

  while (i < lines.length) {
    const code = parseInt(lines[i]?.trim());
    const val = lines[i + 1]?.trim();
    if (isNaN(code)) break;
    if (code === 0) break;

    if (code === 8) layer = val;
    if (code === 70) closed = (parseInt(val) & 1) === 1;
    if (code === 10) {
      if (currentX !== null) {
        points.push({ x: currentX, y: 0 });
      }
      currentX = parseFloat(val);
    }
    if (code === 20) {
      if (currentX !== null) {
        points.push({ x: currentX, y: parseFloat(val) });
        currentX = null;
      }
    }
    i += 2;
  }
  if (currentX !== null) {
    points.push({ x: currentX, y: 0 });
  }

  return {
    type: "LWPOLYLINE",
    layer,
    points,
    is_closed: closed,
    _endIndex: i,
  };
}

function parsePolyline(lines: string[], startIndex: number): ParsedEntity | null {
  let layer = "0";
  let closed = false;
  const points: Point2D[] = [];
  let i = startIndex;

  // Read POLYLINE header
  while (i < lines.length) {
    const code = parseInt(lines[i]?.trim());
    const val = lines[i + 1]?.trim();
    if (isNaN(code)) break;
    if (code === 0) break;
    if (code === 8) layer = val;
    if (code === 70) closed = (parseInt(val) & 1) === 1;
    i += 2;
  }

  // Read VERTEXes
  while (i < lines.length) {
    const code = lines[i]?.trim();
    const val = lines[i + 1]?.trim();
    if (code === "0" && val === "SEQEND") {
      i += 2;
      break;
    }
    if (code === "0" && val === "VERTEX") {
      let vx = 0, vy = 0;
      i += 2;
      while (i < lines.length) {
        const vc = parseInt(lines[i]?.trim());
        const vv = lines[i + 1]?.trim();
        if (isNaN(vc) || vc === 0) break;
        if (vc === 10) vx = parseFloat(vv);
        if (vc === 20) vy = parseFloat(vv);
        i += 2;
      }
      points.push({ x: vx, y: vy });
    } else {
      i += 2;
    }
  }

  return { type: "POLYLINE", layer, points, is_closed: closed, _endIndex: i };
}

function parseCircle(lines: string[], startIndex: number): ParsedEntity | null {
  let layer = "0";
  let cx = 0, cy = 0, r = 0;
  let i = startIndex;

  while (i < lines.length) {
    const code = parseInt(lines[i]?.trim());
    const val = lines[i + 1]?.trim();
    if (isNaN(code)) break;
    if (code === 0) break;
    if (code === 8) layer = val;
    if (code === 10) cx = parseFloat(val);
    if (code === 20) cy = parseFloat(val);
    if (code === 40) r = parseFloat(val);
    i += 2;
  }

  // Represent circle bbox as 4 extreme points
  return {
    type: "CIRCLE",
    layer,
    points: [
      { x: cx - r, y: cy - r },
      { x: cx + r, y: cy - r },
      { x: cx + r, y: cy + r },
      { x: cx - r, y: cy + r },
    ],
    is_closed: true,
    _endIndex: i,
  };
}

function parseArc(lines: string[], startIndex: number): ParsedEntity | null {
  let layer = "0";
  let cx = 0, cy = 0, r = 0;
  let startAngle = 0, endAngle = 360;
  let i = startIndex;

  while (i < lines.length) {
    const code = parseInt(lines[i]?.trim());
    const val = lines[i + 1]?.trim();
    if (isNaN(code)) break;
    if (code === 0) break;
    if (code === 8) layer = val;
    if (code === 10) cx = parseFloat(val);
    if (code === 20) cy = parseFloat(val);
    if (code === 40) r = parseFloat(val);
    if (code === 50) startAngle = parseFloat(val);
    if (code === 51) endAngle = parseFloat(val);
    i += 2;
  }

  // For bbox: conservative approach using full circle extent
  const points: Point2D[] = [];
  for (let a = 0; a < 360; a += 15) {
    const rad = (a * Math.PI) / 180;
    points.push({ x: cx + r * Math.cos(rad), y: cy + r * Math.sin(rad) });
  }

  return { type: "ARC", layer, points, is_closed: false, _endIndex: i };
}

function detectUnits(lines: string[], defaultUnits: "mm" | "inch"): "mm" | "inch" | "unknown" {
  // Look for $INSUNITS in header
  for (let i = 0; i < Math.min(lines.length, 500); i++) {
    if (lines[i]?.trim() === "$INSUNITS") {
      const valLine = lines[i + 2]?.trim();
      if (valLine) {
        const unitCode = parseInt(valLine);
        if (unitCode === 4) return "mm";
        if (unitCode === 1) return "inch";
      }
    }
    // Also check $MEASUREMENT
    if (lines[i]?.trim() === "$MEASUREMENT") {
      const valLine = lines[i + 2]?.trim();
      if (valLine === "1") return "mm";
      if (valLine === "0") return "inch";
    }
  }
  return "unknown";
}

function pickLargestPolyline(polylines: DxfEntity[], unitScale: number): DxfEntity {
  let largest = polylines[0];
  let largestArea = 0;

  for (const pl of polylines) {
    const scaled: [number, number][] = pl.points.map((p) => [p.x * unitScale, p.y * unitScale]);
    const area = Math.abs(computePolygonArea(scaled));
    if (area > largestArea) {
      largestArea = area;
      largest = pl;
    }
  }

  return largest;
}

function computePolygonArea(points: [number, number][]): number {
  let area = 0;
  const n = points.length;
  for (let i = 0; i < n; i++) {
    const j = (i + 1) % n;
    area += points[i][0] * points[j][1];
    area -= points[j][0] * points[i][1];
  }
  return Math.abs(area / 2);
}

/**
 * Read a File object as text and extract DXF geometry.
 */
export async function extractFromDxfFile(
  file: File,
  options: {
    preferredOutlineLayer?: string;
    enablePolygon?: boolean;
    defaultUnits?: "mm" | "inch";
  } = {}
): Promise<DxfExtractionResult> {
  const text = await file.text();
  return extractFromDxf(text, options);
}
