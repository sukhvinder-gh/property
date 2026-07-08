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
  provenance: z.array(ProvenanceSchema),
});
export type PlanningControls = z.infer<typeof PlanningControlsSchema>;

export const ConstraintClassificationSchema = z.enum(["blocker", "cost-adder", "documentation-adder"]);

export const ConstraintSchema = z.object({
  name: z.string(),
  present: z.boolean(),
  classification: ConstraintClassificationSchema,
  rationale: z.string(),
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

export const AssessmentRecordSchema = z.object({
  id: z.string(),
  createdAt: z.string(),
  siteProfile: SiteProfileSchema,
  planningControls: PlanningControlsSchema,
  constraints: z.array(ConstraintSchema),
  buildableEnvelope: BuildableEnvelopeSchema,
  pathway: PathwaySchema,
  score: ScoreResultSchema,
  costSignals: z.array(z.string()),
  documentChecklist: z.array(z.string()),
  risksAndUnknowns: z.array(z.string()),
  nextSteps: z.array(z.string()),
});
export type AssessmentRecord = z.infer<typeof AssessmentRecordSchema>;

export const AssessRequestSchema = z.object({
  address: z.string().min(3),
  targetDwelling: z.string().optional(),
});
export type AssessRequest = z.infer<typeof AssessRequestSchema>;
