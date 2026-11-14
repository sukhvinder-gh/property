import type { LocalProvision, LotPolygonPoint, Provenance } from "@/types/assessment";

export interface GeocodeResult {
  lotDp: string | null;
  /** NSW property ID (Six Maps propid = Planning Portal ePlanning propId). */
  propId: number | null;
  /** Planning Portal council name (e.g. "BLACKTOWN CITY COUNCIL"). Null when unresolved. */
  councilName: string | null;
  lga: string;
  epiName: string;
  epiAmendmentDate: string | null;
  lotSizeSqm: number | null;
  frontageM: number | null;
  depthM: number | null;
  isCornerLot: boolean | null;
  /** Local metres, origin = lot centroid, true-north-oriented. Null when no real polygon is available. */
  lotPolygon: LotPolygonPoint[] | null;
  registrationStatus: "registered" | "unregistered" | "unknown";
  provenance: Provenance;
}

export interface TopographyResult {
  slopePercent: number | null;
  /** Fall between the lot's highest and lowest sampled points, metres. */
  fallM?: number | null;
  /** Whether NSW contour lines confirm the elevation-model fall. */
  slopeCheck?: "agrees" | "differs" | "conflicts" | "unavailable" | null;
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
  /** Live Planning Portal fields — absent when the ePlanning API couldn't answer. */
  heritageListing?: string | null;
  legislationUrl?: string | null;
  localProvisions?: LocalProvision[];
  additionalPermittedUses?: string[];
  greenfieldHousingCodeArea?: boolean | null;
  precinct?: string | null;
  dcp?: { name: string; url: string | null } | null;
  provenance: Provenance;
}

/** A registered easement that falls on the lot (NSW cadastre Easement layer). */
export interface EasementFinding {
  /** e.g. "Easement for sewer", or "Easement (purpose not recorded in the cadastre)". */
  purpose: string;
  category: "sewer" | "drainage" | "water" | "electricity" | "gas" | "access" | "services" | "other" | "unspecified";
  /** As recorded, e.g. "3m"; null when the cadastre has no width. */
  width: string | null;
}

/** A site on the NSW EPA notified contaminated-sites list, on or near the lot. */
export interface ContaminatedSiteFinding {
  siteName: string;
  address: string;
  activity: string;
  /** EPA management class, e.g. "Contamination currently regulated under CLM Act". */
  status: string;
  onLot: boolean;
  /** Metres from the lot boundary (0 when on the lot). */
  distanceM: number;
  /** True when the EPA is actively regulating/investigating/managing the site. */
  activelyManaged: boolean;
}

export interface ConstraintsResult {
  floodControlLot: boolean;
  bushfireProneLand: boolean;
  acidSulfateSoils: boolean;
  /** Real ASS class label (e.g. "Class 4"). Null when not present/unavailable. */
  acidSulfateSoilsClass: string | null;
  contamination: boolean;
  hasSewerEasement: boolean;
  /**
   * Live easement lookup. Undefined: adapter doesn't do this lookup (use
   * hasSewerEasement). Null: lookup attempted but failed — unknown, not "none".
   */
  easements?: EasementFinding[] | null;
  /** Live EPA list matches within 100m. Undefined/null as for `easements`. */
  contaminatedSites?: ContaminatedSiteFinding[] | null;
  /** EPA list edition used, e.g. "July 2026". */
  contaminationListEdition?: string | null;
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
  withdrawnLast12Months?: number;
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
  planningControls(lotDp: string | null, lga: string, epiName: string, propId?: number | null): Promise<PlanningControlsResult>;
  constraints(lotDp: string | null, lga: string): Promise<ConstraintsResult>;
  daStats(lga: string, daType: string): Promise<DaStatsResult>;
  isCouncilProfiled(lga: string): boolean;
}
