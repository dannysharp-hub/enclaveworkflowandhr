/**
 * Nesting Engine — Backward-compatible re-export
 * @deprecated Import from "@/lib/nesting" instead
 */
export {
  nestParts,
  nestPartsV2,
  expandParts,
  stableSort,
  packMaxRects,
  packSkyline,
  packGuillotine,
  packRemnantsFirst,
  computeResultHash,
} from "./nesting";

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
} from "./nesting";
