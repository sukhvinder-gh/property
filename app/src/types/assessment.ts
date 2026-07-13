import { z } from "zod";

export const CouncilTierSchema = z.enum(["profiled", "unprofiled_data_rich", "unprofiled_data_thin"]);
export type CouncilTier = z.infer<typeof CouncilTierSchema>;

export const SlopeClassSchema = z.enum(["gentle", "moderate", "steep"]);
export type SlopeClass = z.infer<typeof SlopeClassSchema>;

export const RegistrationStatusSchema = z.enum(["registered", "unregistered"]);

export const ProvenanceSchema = z.object({
  source: z.string(),
  layerOrEpi: z.string().optional(),
  retrievedAt: z.string(),
});
export type Provenance = z.infer<typeof ProvenanceSchema>;

export const LotPolygonPointSchema = z.object({ x: z.number(), y: z.number() });
export type LotPolygonPoint = z.infer<typeof LotPolygonPointSchema>;

export const SiteProfileSchema = z.object({
  address: z.string(),
  lotDp: z.string().nullable(),
  lga: z.string(),
  epiName: z.string(),
  epiAmendmentDate: z.string().nullable(),
  lotSizeSqm: z.number().nullable(),
  frontageM: z.number().nullable(),
  depthM: z.number().nullable(),
  isCornerLot: z.boolean().nullable(),
  // Local metres, origin = the lot polygon's own centroid, true-north-oriented
  // (source CRS is already metric/true-north so no rotation correction is
  // needed). Null when no real polygon is available — never a guessed shape.
  lotPolygon: z.array(LotPolygonPointSchema).nullable(),
  registrationStatus: RegistrationStatusSchema,
  councilTier: CouncilTierSchema,
  slopeClass: SlopeClassSchema.nullable(),
  slopePercent: z.number().nullable(),
  // Great Soil Group regional soil-landscape classification — not a
  // parcel-specific geotechnical result. Null when not mapped.
  soilType: z.string().nullable(),
  soilTypeCode: z.string().nullable(),
  // Nearest classified road (Motorway/Primary/Arterial/Sub-Arterial/Distributor)
  // within a small proximity buffer — a proximity check, not a confirmed
  // frontage road. Null when none found nearby (presumed local street).
  nearbyClassifiedRoad: z.string().nullable(),
  indicativeOnly: z.boolean(),
  provenance: z.array(ProvenanceSchema),
});
export type SiteProfile = z.infer<typeof SiteProfileSchema>;

export const PlanningControlsSchema = z.object({
  zone: z.string(),
  zoneDescription: z.string(),
  minLotSizeSqm: z.number().nullable(),
  fsr: z.number().nullable(),
  heightOfBuildingM: z.number().nullable(),
  heritageItem: z.boolean(),
  heritageConservationArea: z.boolean(),
  biodiversityOverlay: z.boolean(),
  // Real heritage item/HCA boundary geometry (array of rings, each an array of
  // local-metre points sharing the same origin as SiteProfile.lotPolygon) when
  // a live source is available. Null when not present/unverified — never a
  // guessed shape.
  heritageZoneRings: z.array(z.array(LotPolygonPointSchema)).nullable().optional(),
  provenance: z.array(ProvenanceSchema),
});
export type PlanningControls = z.infer<typeof PlanningControlsSchema>;

export const ConstraintClassificationSchema = z.enum(["blocker", "cost-adder", "documentation-adder"]);

export const ConstraintSchema = z.object({
  name: z.string(),
  present: z.boolean(),
  classification: ConstraintClassificationSchema,
  rationale: z.string(),
  // Real overlay-zone geometry (currently only populated for bushfire on the
  // live path; mock fixtures may synthesize a clearly-labelled demo shape for
  // other constraint types). Array of rings sharing SiteProfile.lotPolygon's
  // origin. Null when not present/unavailable/unverified.
  zoneRings: z.array(z.array(LotPolygonPointSchema)).nullable().optional(),
});
export type Constraint = z.infer<typeof ConstraintSchema>;

export const BuildableEnvelopeSchema = z.object({
  envelopeAreaSqm: z.number().nullable(),
  envelopeWidthM: z.number().nullable(),
  envelopeDepthM: z.number().nullable(),
  assumptions: z.array(z.string()),
  targetFootprintFit: z
    .object({
      targetDescription: z.string(),
      fits: z.boolean(),
      marginSqm: z.number().nullable(),
    })
    .nullable(),
});
export type BuildableEnvelope = z.infer<typeof BuildableEnvelopeSchema>;

export const PathwaySchema = z.object({
  pathway: z.enum(["exempt", "cdc", "da", "state"]),
  reasoning: z.string(),
  cdcExclusionTriggers: z.array(z.string()),
  indicativeTimelineDays: z.string(),
});
export type Pathway = z.infer<typeof PathwaySchema>;

export const ScoreFactorSchema = z.object({
  factor: z.string(),
  weight: z.number(),
  contribution: z.number(),
  note: z.string(),
});
export type ScoreFactor = z.infer<typeof ScoreFactorSchema>;

export const ScoreBandSchema = z.enum(["Strong", "Viable", "Marginal", "Unlikely"]);
export type ScoreBand = z.infer<typeof ScoreBandSchema>;

export const ScoreResultSchema = z.object({
  score: z.number().min(0).max(100).nullable(),
  bandLow: ScoreBandSchema,
  bandHigh: ScoreBandSchema,
  isBanded: z.boolean(),
  topDrivers: z.array(z.string()),
  factors: z.array(ScoreFactorSchema),
});
export type ScoreResult = z.infer<typeof ScoreResultSchema>;

export const DevelopmentPotentialSchema = z.object({
  secondaryDwelling: z.object({
    // null = insufficient data (never a guessed false); true/false only when
    // zone + lot size + frontage are all known.
    eligible: z.boolean().nullable(),
    reasoning: z.string(),
  }),
  // Deliberately always null — dual-occ permissibility is council-DCP-divergent,
  // not a state-level rule (see references/councils.md); a computed yes/no here
  // would be exactly the kind of overconfident guess this app avoids elsewhere.
  dualOccupancy: z.object({
    likelyPermitted: z.null(),
    reasoning: z.string(),
  }),
  subdivision: z.object({
    potentialLots: z.number().nullable(),
    reasoning: z.string(),
  }),
});
export type DevelopmentPotential = z.infer<typeof DevelopmentPotentialSchema>;

export const FeasibilityRatingSchema = z.enum(["yes", "no", "insufficient_data"]);
export type FeasibilityRating = z.infer<typeof FeasibilityRatingSchema>;

export const FeasibilitySummarySchema = z.object({
  planningFeasibility: FeasibilityRatingSchema,
  engineeringFeasibility: FeasibilityRatingSchema,
  // No live geotechnical/site-access source exists in this engine (Sections
  // 4-5, 7, 10 of the professional Pre-DA framework) — always "insufficient_data"
  // rather than a guessed yes/no. See reasoning string for what to commission.
  constructionFeasibility: FeasibilityRatingSchema,
  // No live land-value/construction-cost source exists — costSignals are
  // qualitative flags, not a verified $ estimate — always "insufficient_data".
  financialFeasibility: FeasibilityRatingSchema,
  overallRiskRating: z.enum(["low", "medium", "high", "unknown"]),
  recommendation: z.enum(["proceed", "proceed_with_changes", "do_not_proceed", "insufficient_data"]),
  reasoning: z.string(),
});
export type FeasibilitySummary = z.infer<typeof FeasibilitySummarySchema>;

export const CouncilControlsSummarySchema = z.object({
  lepName: z.string(),
  dcpName: z.string().nullable(),
  heritage: z.string(),
  characterAndStreetscape: z.string(),
  treePreservation: z.string(),
  stormwaterPolicy: z.string(),
  viewSharing: z.string(),
});
export type CouncilControlsSummary = z.infer<typeof CouncilControlsSummarySchema>;

export const UtilitiesSummarySchema = z.object({
  electricityDistributor: z.string(),
  otherServicesNote: z.string(),
});
export type UtilitiesSummary = z.infer<typeof UtilitiesSummarySchema>;

export const AccessSummarySchema = z.object({
  drivewayGradient: z.string(),
  roadFrontage: z.string(),
  vehicleCrossover: z.string(),
  wasteAndConstructionAccess: z.string(),
});
export type AccessSummary = z.infer<typeof AccessSummarySchema>;

export const RiskImpactSchema = z.enum(["low", "medium", "high"]);
export type RiskImpact = z.infer<typeof RiskImpactSchema>;

export const RiskRegisterEntrySchema = z.object({
  risk: z.string(),
  impact: RiskImpactSchema,
  mitigation: z.string(),
});
export type RiskRegisterEntry = z.infer<typeof RiskRegisterEntrySchema>;

export const AssessmentRecordSchema = z.object({
  id: z.string(),
  createdAt: z.string(),
  siteProfile: SiteProfileSchema,
  planningControls: PlanningControlsSchema,
  constraints: z.array(ConstraintSchema),
  buildableEnvelope: BuildableEnvelopeSchema,
  developmentPotential: DevelopmentPotentialSchema,
  councilControls: CouncilControlsSummarySchema,
  utilities: UtilitiesSummarySchema,
  access: AccessSummarySchema,
  pathway: PathwaySchema,
  score: ScoreResultSchema,
  feasibilitySummary: FeasibilitySummarySchema,
  costSignals: z.array(z.string()),
  documentChecklist: z.array(z.string()),
  risksAndUnknowns: z.array(z.string()),
  riskRegister: z.array(RiskRegisterEntrySchema),
  nextSteps: z.array(z.string()),
});
export type AssessmentRecord = z.infer<typeof AssessmentRecordSchema>;

export const AssessRequestSchema = z.object({
  address: z.string().min(3),
  targetDwelling: z.string().optional(),
});
export type AssessRequest = z.infer<typeof AssessRequestSchema>;
