import type { CouncilProfile } from "@/lib/pipeline/council-profiles";
import type { BuildableEnvelope, Constraint, SiteProfile } from "@/types/assessment";

const ASSUMED_FRONT_SETBACK_M = 6;
const ASSUMED_SIDE_SETBACK_M = 0.9;
const ASSUMED_REAR_SETBACK_M = 6;
const ASSUMED_SEWER_EASEMENT_STRIP_M = 3;

export function runStage4BuildableEnvelope(
  siteProfile: SiteProfile,
  constraints: Constraint[],
  targetDwelling?: { description: string; footprintSqm: number },
  councilProfile?: CouncilProfile | null
): BuildableEnvelope {
  const frontM = councilProfile?.setbacks.frontM ?? ASSUMED_FRONT_SETBACK_M;
  const sideM = councilProfile?.setbacks.sideM ?? ASSUMED_SIDE_SETBACK_M;
  const rearM = councilProfile?.setbacks.rearM ?? ASSUMED_REAR_SETBACK_M;

  const assumptions: string[] = councilProfile
    ? [
        `Front setback ${frontM}m, side ${sideM}m, rear ${rearM}m per ${councilProfile.instrumentName}.`,
        ...councilProfile.notes,
      ]
    : [
        `Front setback assumed ${frontM}m (verify against applicable DCP or Codes SEPP pathway).`,
        `Side setbacks assumed ${sideM}m each (verify against applicable DCP or Codes SEPP pathway).`,
        `Rear setback assumed ${rearM}m (verify against applicable DCP or Codes SEPP pathway).`,
      ];

  if (siteProfile.frontageM === null || siteProfile.depthM === null) {
    return {
      envelopeAreaSqm: null,
      envelopeWidthM: null,
      envelopeDepthM: null,
      assumptions: [...assumptions, "Lot frontage/depth not confirmed — envelope cannot be computed; treat report as indicative only."],
      targetFootprintFit: null,
    };
  }

  let sideSetbackTotal = sideM * 2;
  if (siteProfile.isCornerLot) {
    sideSetbackTotal += frontM - sideM; // secondary street frontage
    assumptions.push("Corner lot — secondary street setback applied in place of one side setback.");
  }

  const width = Math.max(0, siteProfile.frontageM - sideSetbackTotal);
  let depth = Math.max(0, siteProfile.depthM - frontM - rearM);

  const hasSewerEasement = constraints.find((c) => c.name.startsWith("Sewer") && c.present);
  if (hasSewerEasement) {
    depth = Math.max(0, depth - ASSUMED_SEWER_EASEMENT_STRIP_M);
    assumptions.push(
      `Depth reduced by an assumed ${ASSUMED_SEWER_EASEMENT_STRIP_M}m build-over-sewer offset strip — confirm exact alignment from the DP/title.`
    );
  }

  const floodConstraint = constraints.find((c) => c.name.startsWith("Flood") && c.present);
  if (floodConstraint) {
    depth = depth * 0.85;
    assumptions.push("Depth reduced ~15% for an assumed flood extent clipping the rear of the lot — confirm against the council flood study.");
  }

  const envelopeAreaSqm = Math.round(width * depth);

  let targetFootprintFit: BuildableEnvelope["targetFootprintFit"] = null;
  if (targetDwelling) {
    const margin = envelopeAreaSqm - targetDwelling.footprintSqm;
    targetFootprintFit = {
      targetDescription: targetDwelling.description,
      fits: margin >= 0,
      marginSqm: margin,
    };
  }

  return {
    envelopeAreaSqm,
    envelopeWidthM: Math.round(width * 10) / 10,
    envelopeDepthM: Math.round(depth * 10) / 10,
    assumptions,
    targetFootprintFit,
  };
}
