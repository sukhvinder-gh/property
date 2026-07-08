import type { DataSourceAdapter } from "@/lib/data-sources/types";
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
      ? "Flood control lot — raised floor levels and on-site detention (OSD) likely required; also a CDC exclusion trigger in most cases."
      : "No flood control lot flag returned; still verify via council flood study for creek-adjacent lots.",
  });

  constraints.push({
    name: "Bushfire prone land",
    present: c.bushfireProneLand,
    classification: c.bushfireProneLand ? "cost-adder" : "documentation-adder",
    rationale: c.bushfireProneLand
      ? "Triggers a Bushfire Attack Level (BAL) assessment and construction upgrades; can exclude CDC depending on BAL rating."
      : "Not mapped as bushfire prone; confirm via NSW RFS BPL layer if near bushland.",
  });

  constraints.push({
    name: "Acid sulfate soils",
    present: c.acidSulfateSoils,
    classification: c.acidSulfateSoils ? "documentation-adder" : "documentation-adder",
    rationale: c.acidSulfateSoils
      ? "ASS class mapped on this lot — soil management plan likely required for excavation works."
      : "No ASS class mapped for this lot.",
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
      ? "Within an ANEF contour (e.g. Western Sydney Airport) — acoustic treatment/construction requirements likely apply."
      : "No ANEF contour flagged for this lot.",
  });

  if (siteProfile.slopeClass) {
    constraints.push({
      name: "Topography / slope",
      present: siteProfile.slopeClass !== "gentle",
      classification: siteProfile.slopeClass === "steep" ? "cost-adder" : "documentation-adder",
      rationale:
        siteProfile.slopeClass === "steep"
          ? `Slope ~${siteProfile.slopePercent}% — retaining walls, split-level design, and possible CDC complications likely.`
          : siteProfile.slopeClass === "moderate"
            ? `Slope ~${siteProfile.slopePercent}% — expect cut/fill or a drop-edge slab; standard design should still absorb it.`
            : `Slope ~${siteProfile.slopePercent}% — minimal site works expected.`,
    });
  }

  return constraints;
}
