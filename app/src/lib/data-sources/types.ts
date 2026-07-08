import type { LotPolygonPoint, Provenance } from "@/types/assessment";

export interface GeocodeResult {
  lotDp: string | null;
  lga: string;
  epiName: string;
  epiAmendmentDate: string | null;
  lotSizeSqm: number | null;
  frontageM: number | null;
  depthM: number | null;
  isCornerLot: boolean | null;
  /** Local metres, origin = lot centroid, true-north-oriented. Null when no real polygon is available. */
  lotPolygon: LotPolygonPoint[] | null;
  registrationStatus: "registered" | "unregistered";
  provenance: Provenance;
}

export interface TopographyResult {
  slopePercent: number | null;
  provenance: Provenance;
}

export interface PlanningControlsResult {
  zone: string;
  zoneDescription: string;
  minLotSizeSqm: number | null;
  fsr: number | null;
  heightOfBuildingM: number | null;
  heritageItem: boolean;
  heritageConservationArea: boolean;
  biodiversityOverlay: boolean;
  provenance: Provenance;
}

export interface ConstraintsResult {
  floodControlLot: boolean;
  bushfireProneLand: boolean;
  acidSulfateSoils: boolean;
  contamination: boolean;
  hasSewerEasement: boolean;
  aircraftNoiseAnef: boolean;
  provenance: Provenance;
}

export interface DaStatsResult {
  determinationsLast12Months: number;
  approvalRatePercent: number | null;
  medianDeterminationDays: number | null;
  provenance: Provenance;
}

/**
 * All lookups are async and return null/unknown fields rather than invented
 * values when a source can't answer — see docs/property-pre-approval-engine
 * domain rule "never guess a control value".
 */
export interface DataSourceAdapter {
  geocode(address: string): Promise<GeocodeResult>;
  topography(lotDp: string | null, lga: string): Promise<TopographyResult>;
  planningControls(lotDp: string | null, lga: string, epiName: string): Promise<PlanningControlsResult>;
  constraints(lotDp: string | null, lga: string): Promise<ConstraintsResult>;
  daStats(lga: string, daType: string): Promise<DaStatsResult>;
  isCouncilProfiled(lga: string): boolean;
}
