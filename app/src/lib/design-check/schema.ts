import { z } from "zod";

const num = (describe: string) => z.number().nullable().describe(describe);

/**
 * What Claude reads off the uploaded drawings. Every field is nullable:
 * null means "not shown or not dimensioned on these plans" — the checker
 * reports that as unknown rather than guessing.
 */
export const ExtractedDesignSchema = z.object({
  drawingTypesFound: z
    .array(z.enum(["floor_plan", "elevation", "section", "site_plan", "area_schedule", "3d_render", "other"]))
    .describe("Which kinds of drawing are present in the upload."),
  designName: z.string().nullable().describe("Design/model name or title block name, if shown."),
  storeys: num("Number of storeys above ground."),
  maxBuildingHeightM: num(
    "Max height from natural/existing ground level to the highest point (ridge), in metres — only if dimensioned or labelled on an elevation/section."
  ),
  livingAreaSqm: num("Internal living/floor area across ALL floors, EXCLUDING garage, porch, alfresco and balconies, in m² — from the area schedule if there is one."),
  garageAreaSqm: num("Garage floor area in m²."),
  garageCarSpaces: num("Number of car spaces in the garage."),
  garageDoorWidthM: num("Total width of garage door(s) facing the street, in metres."),
  groundFloorFootprintSqm: num(
    "Ground-floor building footprint in m², including garage and any roofed alfresco/porch attached to the house."
  ),
  buildingWidthM: num("Overall building width across the lot (parallel to the street), in metres."),
  buildingDepthM: num("Overall building depth (front to back), in metres."),
  frontSetbackM: num("Setback from the front (street) boundary to the house, in metres — site plan only."),
  sideSetbackLeftM: num("Smallest ground-floor setback to the left side boundary, in metres — site plan only."),
  sideSetbackRightM: num("Smallest ground-floor setback to the right side boundary, in metres — site plan only."),
  rearSetbackM: num("Ground-floor setback to the rear boundary, in metres — site plan only."),
  upperFloorSideSetbackM: num("Smallest upper-floor setback to either side boundary, in metres — only if shown."),
  upperFloorRearSetbackM: num("Upper-floor setback to the rear boundary, in metres — only if shown."),
  landscapedAreaSqm: num("Landscaped (soft, permeable) area in m² — only if stated on the site plan."),
  privateOpenSpaceSqm: num("Principal private open space in m² — only if stated."),
  bedrooms: num("Number of bedrooms."),
  hasSecondaryDwelling: z.boolean().nullable().describe("Does the design include a separate secondary dwelling (granny flat)?"),
  secondaryDwellingAreaSqm: num("Floor area of the secondary dwelling, in m²."),
  isDualOccupancy: z.boolean().nullable().describe("Is this a dual occupancy (two dwellings on one lot, e.g. duplex)?"),
  lotAreaShownSqm: num("Lot area as written on the plans, if any."),
  lotFrontageShownM: num("Lot frontage/width as written on the plans, if any."),
  addressShown: z.string().nullable().describe("Site address in the title block, if any."),
  readingNotes: z
    .array(z.string())
    .describe("Short notes on anything ambiguous, illegible, or assumed while reading — e.g. which area schedule line was used."),
});
export type ExtractedDesign = z.infer<typeof ExtractedDesignSchema>;

export const CheckStatusSchema = z.enum(["pass", "fail", "unknown"]);
export type CheckStatus = z.infer<typeof CheckStatusSchema>;

export const DesignCheckItemSchema = z.object({
  id: z.string(),
  category: z.enum(["Planning controls", "Housing Code (CDC)", "Council DCP (DA)", "Site fit"]),
  rule: z.string(),
  required: z.string(),
  proposed: z.string(),
  status: CheckStatusSchema,
  source: z.string(),
  fix: z.string().optional(),
});
export type DesignCheckItem = z.infer<typeof DesignCheckItemSchema>;

export const DesignVerdictSchema = z.enum(["likely_cdc", "da_required", "unlikely", "cannot_confirm"]);
export type DesignVerdict = z.infer<typeof DesignVerdictSchema>;

export const DesignCheckResultSchema = z.object({
  verdict: DesignVerdictSchema,
  headline: z.string(),
  checks: z.array(DesignCheckItemSchema),
  caveats: z.array(z.string()),
  extracted: ExtractedDesignSchema,
});
export type DesignCheckResult = z.infer<typeof DesignCheckResultSchema>;
