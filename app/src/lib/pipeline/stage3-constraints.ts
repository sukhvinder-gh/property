import type { DataSourceAdapter } from "@/lib/data-sources/types";
import { verifyZoneAlignment } from "@/lib/pipeline/geometry-utils";
import type { Constraint, SiteProfile } from "@/types/assessment";

export async function runStage3Constraints(
  adapter: DataSourceAdapter,
  siteProfile: SiteProfile
): Promise<Constraint[]> {
  const c = await adapter.constraints(siteProfile.lotDp, siteProfile.lga);
  const constraints: Constraint[] = [];

  constraints.push({
    name: "Flood planning area / flood control lot",
    present: c.floodControlLot,
    classification: c.floodControlLot ? "cost-adder" : "documentation-adder",
    rationale: c.floodControlLot
      ? "Live NSW ePlanning Flood Planning Map shows this lot within a mapped Flood Planning Area — raised floor levels and on-site detention (OSD) likely required; also a common CDC exclusion trigger."
      : "No Flood Planning Area mapped for this lot (live ePlanning Flood Planning Map) — still verify via council flood study for creek-adjacent lots, as not all floodplains are yet fully digitised.",
  });

  const bushfireZone = verifyZoneAlignment(c.bushfireZoneRings, siteProfile);
  constraints.push({
    name: "Bushfire prone land",
    present: c.bushfireProneLand,
    classification: c.bushfireProneLand ? "cost-adder" : "documentation-adder",
    rationale: c.bushfireProneLand
      ? bushfireZone.droppedReason
        ? `Triggers a Bushfire Attack Level (BAL) assessment and construction upgrades; can exclude CDC depending on BAL rating. Note: ${bushfireZone.droppedReason}.`
        : "Triggers a Bushfire Attack Level (BAL) assessment and construction upgrades; can exclude CDC depending on BAL rating."
      : "Not mapped as bushfire prone; confirm via NSW RFS BPL layer if near bushland.",
    zoneRings: bushfireZone.rings,
  });

  constraints.push({
    name: "Acid sulfate soils",
    present: c.acidSulfateSoils,
    classification: c.acidSulfateSoils ? "documentation-adder" : "documentation-adder",
    rationale: c.acidSulfateSoils
      ? `Live NSW ePlanning Acid Sulfate Soils map shows ${c.acidSulfateSoilsClass ?? "a mapped"} classification for this lot — soil management plan likely required for excavation works.`
      : "No Acid Sulfate Soils class mapped for this lot (live ePlanning ASS layer).",
  });

  constraints.push({
    name: "Contamination",
    present: c.contamination,
    classification: c.contamination ? "blocker" : "documentation-adder",
    rationale: c.contamination
      ? "Contamination recorded — a remediation/validation report will likely be required before consent, treat as a hard gate pending investigation."
      : "No contamination record found in council data reviewed; not exhaustive — confirm via s10.7 certificate.",
  });

  constraints.push({
    name: "Sewer main / easement",
    present: c.hasSewerEasement,
    classification: c.hasSewerEasement ? "cost-adder" : "documentation-adder",
    rationale: c.hasSewerEasement
      ? "Sewer main crosses or adjoins the lot — build-over-sewer approval from Sydney Water may be required, restricting footprint placement."
      : "No sewer easement flagged; confirm via Sydney Water Tap in / eDeveloper lookup.",
  });

  constraints.push({
    name: "Aircraft noise (ANEF)",
    present: c.aircraftNoiseAnef,
    classification: c.aircraftNoiseAnef ? "documentation-adder" : "documentation-adder",
    rationale: c.aircraftNoiseAnef
      ? `Live NSW ePlanning Airport Noise layer shows this lot within the ${c.anefContourBand ?? "a mapped"} ANEF contour — acoustic treatment/construction requirements likely apply.`
      : "No ANEF contour mapped for this lot (live ePlanning Airport Noise layer).",
  });

  constraints.push({
    name: "Mine subsidence district",
    present: c.mineSubsidenceDistrict,
    classification: c.mineSubsidenceDistrict ? "cost-adder" : "documentation-adder",
    rationale: c.mineSubsidenceDistrict
      ? `Lot falls within the ${c.mineSubsidenceDistrictName ?? "a"} Mine Subsidence District (live NSW Subsidence Advisory layer) — Mine Subsidence Board (Subsidence Advisory NSW) approval is required before development; additional footing/structural design likely required.`
      : "Not mapped within a Mine Subsidence District (live NSW Subsidence Advisory layer).",
  });

  constraints.push({
    name: "Coastal management SEPP area",
    present: c.coastalManagementArea,
    classification: c.coastalManagementArea ? "cost-adder" : "documentation-adder",
    rationale: c.coastalManagementArea
      ? `Lot falls within a ${c.coastalManagementAreaType ?? "Coastal Management SEPP"} area under State Environmental Planning Policy (Coastal Management) 2018 (live layer) — additional referral/consent requirements may apply; verify current provisions. Note: the dedicated Coastal Vulnerability Area (erosion) map has no statewide dataset published yet.`
      : "Not mapped within a Coastal Management SEPP wetlands/environment/use area (live layer). Note: the dedicated Coastal Vulnerability Area (erosion) map has no statewide dataset published yet — this is not a confirmed absence of coastal erosion risk for coastal lots.",
  });

  if (siteProfile.slopeClass) {
    constraints.push({
      name: "Topography / slope",
      present: siteProfile.slopeClass !== "gentle",
      classification: siteProfile.slopeClass === "steep" ? "cost-adder" : "documentation-adder",
      rationale:
        (siteProfile.slopeClass === "steep"
          ? `Slope ~${siteProfile.slopePercent}% — retaining walls, split-level design, and possible CDC complications likely.`
          : siteProfile.slopeClass === "moderate"
            ? `Slope ~${siteProfile.slopePercent}% — expect cut/fill or a drop-edge slab; standard design should still absorb it.`
            : `Slope ~${siteProfile.slopePercent}% — minimal site works expected.`) +
        " (estimated from a 5m-resolution elevation model — not a surveyed cross-section).",
    });
  }

  return constraints;
}
