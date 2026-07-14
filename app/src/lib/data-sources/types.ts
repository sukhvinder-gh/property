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

export interface SoilTypeResult {
  /** Great Soil Group name, e.g. "Yellow Podzolic Soils - more fertile". Regional soil-landscape classification, not a parcel-specific geotechnical result. */
  soilType: string | null;
  /** GSG code, e.g. "YPm". */
  soilTypeCode: string | null;
  provenance: Provenance;
}

export interface RoadAccessResult {
  /** Name of the nearest classified-road hierarchy level found within a small buffer (e.g. "Arterial Road"), or null if none nearby (presumed local/unclassified street). */
  nearbyClassifiedRoad: string | null;
  provenance: Provenance;
}

export interface LandCapabilityResult {
  /** NSW Land and Soil Capability rating, 1 (best/least limiting) to 8 (worst/most limiting). Null when unavailable. */
  shallowRockRating: number | null;
  massMovementRating: number | null;
  waterloggingRating: number | null;
  waterErosionRating: number | null;
  provenance: Provenance;
}

export interface EnvironmentalContextResult {
  /** ABS Mesh-Block-level tree canopy percentage (0-100). Area-level context, not a parcel-specific overshadowing result. Null when unavailable. */
  localTreeCanopyPercent: number | null;
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
  /** Real heritage item/HCA boundary (rings of local-metre points). Null when unavailable. */
  heritageZoneRings: LotPolygonPoint[][] | null;
  provenance: Provenance;
}

export interface ConstraintsResult {
  floodControlLot: boolean;
  bushfireProneLand: boolean;
  acidSulfateSoils: boolean;
  /** Real ASS class label (e.g. "Class 4"). Null when not present/unavailable. */
  acidSulfateSoilsClass: string | null;
  contamination: boolean;
  hasSewerEasement: boolean;
  aircraftNoiseAnef: boolean;
  /** Real ANEF contour band (e.g. "25 - 30"). Null when not present/unavailable. */
  anefContourBand: string | null;
  mineSubsidenceDistrict: boolean;
  /** Real district name (e.g. "LAKE MACQUARIE"). Null when not present/unavailable. */
  mineSubsidenceDistrictName: string | null;
  coastalManagementArea: boolean;
  /** Which Coastal Management SEPP area type matched, e.g. "Coastal Wetlands". Null when not present. */
  coastalManagementAreaType: string | null;
  groundwaterVulnerability: boolean;
  salinity: boolean;
  /** Real bushfire hazard-zone geometry (rings of local-metre points). Null when unavailable. */
  bushfireZoneRings: LotPolygonPoint[][] | null;
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
  soilType(lotDp: string | null, lga: string): Promise<SoilTypeResult>;
  roadAccess(lotDp: string | null, lga: string): Promise<RoadAccessResult>;
  landCapability(lotDp: string | null, lga: string): Promise<LandCapabilityResult>;
  environmentalContext(lotDp: string | null, lga: string): Promise<EnvironmentalContextResult>;
  planningControls(lotDp: string | null, lga: string, epiName: string): Promise<PlanningControlsResult>;
  constraints(lotDp: string | null, lga: string): Promise<ConstraintsResult>;
  daStats(lga: string, daType: string): Promise<DaStatsResult>;
  isCouncilProfiled(lga: string): boolean;
}
