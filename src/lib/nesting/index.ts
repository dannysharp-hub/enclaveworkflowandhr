/**
 * Nesting Engine V2 — Public API
 * 
 * Re-exports all types and the main entry points.
 */

export type {
  NestPart,
  NestSettings,
  NestResult,
  NestCandidate,
  Placement,
  SheetLayout,
  AlgorithmName,
  RemnantInput,
  ExpandedItem,
} from "./types";

export { expandParts, stableSort, computeResultHash } from "./types";
export { packMaxRects } from "./maxrects";
export { packSkyline } from "./skyline";
export { packGuillotine } from "./guillotine";
export { packRemnantsFirst } from "./remnantStrategy";
export { nestPartsV2 } from "./runner";

// Backward-compatible wrapper matching the V1 API
import { NestPart, NestSettings, NestResult } from "./types";
import { nestPartsV2 } from "./runner";

export function nestParts(parts: NestPart[], settings: NestSettings): NestResult {
  const { best } = nestPartsV2(parts, settings);
  return best;
}
