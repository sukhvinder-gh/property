import { generateText, Output } from "ai";
import { anthropic } from "@ai-sdk/anthropic";
import { z } from "zod";
import { ExtractedDesignSchema, type ExtractedDesign } from "@/lib/design-check/schema";

const SYSTEM_PROMPT = `You read residential house plans (floor plans, elevations, sections, site plans, area schedules) for an NSW planning compliance check.

Rules:
- Report only values that are dimensioned, labelled, or stated on the drawings, or that follow directly from dimensions shown (e.g. adding two labelled areas). Never estimate from scale or from what is typical.
- If a value is not shown, leave it out of "measurements". A missing value is far more useful than a guess — the checker will tell the user what's missing.
- Convert millimetres to metres. Areas in m².
- Builders' area schedules often list "Living", "Garage", "Porch", "Alfresco", "Total". Use the living line(s) for livingAreaSqm; don't include garage/porch/alfresco/balcony.
- Height must be measured from ground level to the highest point (ridge) — only report it if an elevation or section gives it (e.g. a ridge RL and ground RL, or a dimensioned overall height).
- Setbacks come from a site plan only. If there is no site plan, report no setbacks.
- Add a readingNotes entry for anything ambiguous or any arithmetic you did.`;

// Numeric fields of ExtractedDesign, each with what it means — reused as the
// measurement-key enum so Claude's output maps 1:1 onto the internal schema.
const NUMERIC_FIELDS = Object.entries(ExtractedDesignSchema.shape)
  .filter(([, s]) => s instanceof z.ZodNullable && s.unwrap() instanceof z.ZodNumber)
  .map(([key, s]) => ({ key, description: s.description ?? "" }));

const MeasurementKey = z.enum(NUMERIC_FIELDS.map((f) => f.key) as [string, ...string[]]);

/**
 * Claude's structured output caps how many nullable fields a schema may
 * have (16), so instead of ~20 nullable numbers Claude returns a list of
 * the measurements it actually found; anything absent becomes null below.
 */
const ClaudeOutputSchema = z.object({
  drawingTypesFound: ExtractedDesignSchema.shape.drawingTypesFound,
  designName: z.string().describe("Design name from the title block, or empty string."),
  addressShown: z.string().describe("Site address from the title block, or empty string."),
  hasSecondaryDwelling: z.boolean().describe("True only if the plans include a separate secondary dwelling (granny flat)."),
  isDualOccupancy: z.boolean().describe("True only if the plans show two dwellings on one lot (e.g. duplex)."),
  measurements: z
    .array(z.object({ key: MeasurementKey, value: z.number() }))
    .describe(`Values found on the plans. Keys:\n${NUMERIC_FIELDS.map((f) => `- ${f.key}: ${f.description}`).join("\n")}`),
  readingNotes: ExtractedDesignSchema.shape.readingNotes,
});

export async function extractDesign(file: { data: Uint8Array; mediaType: string }): Promise<ExtractedDesign> {
  const { output } = await generateText({
    model: anthropic("claude-sonnet-5-5"),
    system: SYSTEM_PROMPT,
    output: Output.object({ schema: ClaudeOutputSchema }),
    messages: [
      {
        role: "user",
        content: [
          { type: "file", data: file.data, mediaType: file.mediaType },
          { type: "text", text: "Read these house plans and return the design data." },
        ],
      },
    ],
  });

  const values = Object.fromEntries(NUMERIC_FIELDS.map((f) => [f.key, null as number | null]));
  for (const { key, value } of output.measurements) values[key] = value;

  return ExtractedDesignSchema.parse({
    ...values,
    drawingTypesFound: output.drawingTypesFound,
    designName: output.designName || null,
    addressShown: output.addressShown || null,
    hasSecondaryDwelling: output.hasSecondaryDwelling,
    isDualOccupancy: output.isDualOccupancy,
    readingNotes: output.readingNotes,
  });
}
