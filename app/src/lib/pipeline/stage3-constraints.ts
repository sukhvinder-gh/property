import type { ConstraintsResult, DataSourceAdapter } from "@/lib/data-sources/types";
import { verifyZoneAlignment } from "@/lib/pipeline/geometry-utils";
import type { Constraint, SiteProfile } from "@/types/assessment";

/** Constraint names other stages look up — keep in one place. */
export const CONTAMINATION_CONSTRAINT = "Contamination";
export const EASEMENT_CONSTRAINT = "Easement on title";

const S10_7 = "confirm via the Section 10.7 planning certificate";

function contaminationConstraint(c: ConstraintsResult): Constraint {
  const base = { name: CONTAMINATION_CONSTRAINT };
  // Adapter without a live lookup (mock data): keep the plain flag.
  if (c.contaminatedSites === undefined) {
    return {
      ...base,
      present: c.contamination,
      classification: c.contamination ? "blocker" : "documentation-adder",
      rationale: c.contamination
        ? "Contamination recorded — a remediation/validation report will likely be required before consent."
        : `No contamination record in the data checked — ${S10_7}.`,
    };
  }
  if (c.contaminatedSites === null) {
    return {
      ...base,
      present: false,
      verified: false,
      classification: "documentation-adder",
      rationale: `Couldn't reach the NSW EPA contaminated-sites list just now — ${S10_7}.`,
    };
  }

  const edition = c.contaminationListEdition ? ` (${c.contaminationListEdition} edition)` : "";
  const onLot = c.contaminatedSites.filter((s) => s.onLot);
  if (onLot.length > 0) {
    const active = onLot.some((s) => s.activelyManaged);
    const list = onLot.map((s) => `${s.siteName} — ${s.activity}; EPA status: ${s.status}`).join(". ");
    return {
      ...base,
      present: true,
      classification: active ? "blocker" : "cost-adder",
      rationale: active
        ? `This lot is on the NSW EPA list of notified contaminated sites${edition}: ${list}. The EPA is still regulating or investigating it — expect a contamination assessment, likely remediation, and a DA rather than a CDC.`
        : `This lot is on the NSW EPA list of notified contaminated sites${edition}: ${list}. The EPA isn't actively regulating it, but a preliminary site investigation is still likely before approval.`,
    };
  }

  const nearby = c.contaminatedSites;
  if (nearby.length > 0) {
    const list = nearby
      .slice(0, 3)
      .map((s) => `${s.siteName} (${s.activity}, ~${s.distanceM}m away; ${s.status})`)
      .join("; ");
    return {
      ...base,
      present: true,
      classification: "documentation-adder",
      rationale: `Not on the NSW EPA contaminated-sites list, but ${nearby.length} notified site${nearby.length > 1 ? "s are" : " is"} within 100m: ${list}. Council or a certifier may ask for a preliminary site investigation — ${S10_7}.`,
    };
  }

  return {
    ...base,
    present: false,
    classification: "documentation-adder",
    rationale: `Not on the NSW EPA list of notified contaminated sites, and none within 100m${edition}. The list only covers sites reported to the EPA, so this isn't a clean bill of health — ${S10_7}.`,
  };
}

function easementConstraint(c: ConstraintsResult): Constraint {
  const base = { name: EASEMENT_CONSTRAINT };
  const sewerNote = "Sewer mains without a registered easement aren't on title — check Sydney Water's Tap in service before finalising the design.";
  if (c.easements === undefined) {
    return {
      ...base,
      present: c.hasSewerEasement,
      classification: c.hasSewerEasement ? "cost-adder" : "documentation-adder",
      rationale: c.hasSewerEasement
        ? "Sewer main crosses or adjoins the lot — build-over-sewer approval from Sydney Water may be required, restricting footprint placement."
        : `No easement flagged. ${sewerNote}`,
    };
  }
  if (c.easements === null) {
    return {
      ...base,
      present: false,
      verified: false,
      classification: "documentation-adder",
      rationale: `Couldn't reach the NSW cadastre easement layer just now — check the title/deposited plan. ${sewerNote}`,
    };
  }
  if (c.easements.length === 0) {
    return {
      ...base,
      present: false,
      classification: "documentation-adder",
      rationale: `No registered easement on this lot in the NSW cadastre. ${sewerNote}`,
    };
  }

  const list = c.easements.map((e) => `${e.purpose}${e.width ? `, ${e.width} wide` : ""}`).join("; ");
  const sewerish = c.easements.some((e) => e.category === "sewer" || e.category === "drainage");
  return {
    ...base,
    present: true,
    classification: "cost-adder",
    rationale: `Registered easement${c.easements.length > 1 ? "s" : ""} on this lot (NSW cadastre): ${list}. Keep the house and slab off ${c.easements.length > 1 ? "them" : "it"}${
      sewerish ? "; building over or next to a sewer or drainage line needs Sydney Water / council approval" : ""
    } — confirm the exact position and terms on the title and deposited plan.`,
  };
}

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

  constraints.push(contaminationConstraint(c));
  constraints.push(easementConstraint(c));

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

  constraints.push({
    name: "Groundwater vulnerability",
    present: c.groundwaterVulnerability,
    classification: c.groundwaterVulnerability ? "documentation-adder" : "documentation-adder",
    rationale: c.groundwaterVulnerability
      ? "Live NSW ePlanning Groundwater Vulnerability layer shows this lot as groundwater vulnerable — on-site wastewater/stormwater infiltration design should account for this; verify current provisions."
      : "Not mapped as groundwater vulnerable for this lot (live ePlanning Groundwater Vulnerability layer).",
  });

  constraints.push({
    name: "Salinity",
    present: c.salinity,
    classification: c.salinity ? "cost-adder" : "documentation-adder",
    rationale: c.salinity
      ? "Live NSW ePlanning Salinity layer shows this lot as saline land — corrosion-resistant fittings and salinity-rated concrete/footing specification are likely required."
      : "Not mapped as saline land for this lot (live ePlanning Salinity layer).",
  });

  if (siteProfile.slopeClass) {
    const pct = siteProfile.slopePercent;
    const fall = siteProfile.slopeFallM != null ? `falls ~${siteProfile.slopeFallM}m across the lot (~${pct}%)` : `slope ~${pct}%`;
    const effect =
      siteProfile.slopeClass === "steep"
        ? "retaining walls, split-level design, and possible CDC complications likely."
        : siteProfile.slopeClass === "moderate"
          ? "expect cut/fill or a drop-edge slab; standard design should still absorb it."
          : "minimal site works expected.";
    const source =
      siteProfile.slopeCheck === "agrees"
        ? "NSW 5m elevation model, consistent with NSW contour mapping — not a survey."
        : siteProfile.slopeCheck === "differs"
          ? "NSW 5m elevation model; older NSW contour mapping gives a somewhat different fall, likely from earthworks since — not a survey."
          : siteProfile.slopeCheck === "conflicts"
          ? "NSW 5m elevation model and NSW contour lines disagree for this lot — get levels surveyed before relying on this."
          : "NSW 5m elevation model only (no accurate contours to cross-check) — not a survey.";
    constraints.push({
      name: "Topography / slope",
      present: siteProfile.slopeClass !== "gentle",
      classification: siteProfile.slopeClass === "steep" ? "cost-adder" : "documentation-adder",
      rationale: `Lot ${fall} — ${effect} (${source})`,
      ...(siteProfile.slopeCheck === "conflicts" ? { verified: false } : {}),
    });
  }

  return constraints;
}
