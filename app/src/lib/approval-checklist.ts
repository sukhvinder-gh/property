import type { DesignCheckResult } from "@/lib/design-check/schema";
import { footingIndicator } from "@/lib/pipeline/soil-footing-indicator";
import type { AssessmentRecord } from "@/types/assessment";

export type Status = "pass" | "fail" | "warn" | "unknown" | "points";

export interface Row {
  group: string;
  requirement: string;
  status: Status;
  detail: string;
}

const fmtPts = (n: number) => (Number.isInteger(n) ? String(n) : n.toFixed(1));

const fromBool = (v: boolean | null): Status => (v === null ? "unknown" : v ? "pass" : "fail");

/** Every requirement checked for the address (and the design, if uploaded), in one list with its status. */
export function buildRows(record: AssessmentRecord, design: DesignCheckResult | null): Row[] {
  const { siteProfile: site, planningControls: pc, constraints, pathway, developmentPotential: dp } = record;
  const rows: Row[] = [];
  const addr = "Address & lot";

  rows.push({
    group: addr,
    requirement: "Lot identified in NSW records",
    status: site.lotDp ? "pass" : site.registrationStatus === "unknown" ? "unknown" : "fail",
    detail: site.lotDp
      ? `Lot ${site.lotDp}, ${site.lotSizeSqm ?? "?"}m², ${site.frontageM ?? "?"}m wide`
      : site.registrationStatus === "unknown"
        ? "Address found, but the NSW lot register couldn't be reached just now — try again shortly; lot-based checks below are unverified."
        : "Address not matched — nothing below is verified.",
  });
  if (site.registrationStatus === "unregistered") {
    rows.push({ group: addr, requirement: "Lot is registered", status: "warn", detail: "Unregistered lot — a CDC generally can't be issued until the lot is registered." });
  }
  rows.push({
    group: addr,
    requirement: "Zoning permits a dwelling house",
    status: pc.zone === "Unknown" ? "unknown" : /^R/.test(pc.zone) ? "pass" : "fail",
    detail: `Zone ${pc.zone} (${pc.zoneDescription}) under ${site.epiName}`,
  });
  rows.push({
    group: addr,
    requirement: "Lot meets the minimum size/width for a new house (CDC)",
    status: fromBool(dp.newDwellingHouse.eligible),
    detail: dp.newDwellingHouse.reasoning,
  });
  rows.push({
    group: addr,
    requirement: "Height limit known",
    status: pc.heightOfBuildingM !== null ? "pass" : "unknown",
    detail: pc.heightOfBuildingM !== null ? `Max ${pc.heightOfBuildingM}m (mapped)` : "No height map value — check the planning instrument.",
  });
  // A missing FSR is only a gap when the Planning Portal itself wasn't asked —
  // many councils simply don't map an FSR on low-density residential land.
  const portalAnswered = pc.provenance.some((p) => /ePlanning API/.test(p.source));
  rows.push({
    group: addr,
    requirement: "Floor space ratio",
    status: pc.fsr !== null || portalAnswered ? "pass" : "unknown",
    detail:
      pc.fsr !== null
        ? `Max ${pc.fsr}:1 (mapped)`
        : portalAnswered
          ? "No FSR is mapped for this lot (confirmed via the Planning Portal) — floor area is controlled by the Housing Code for a CDC, or the council DCP for a DA."
          : "FSR map couldn't be confirmed — check the Planning Portal. If none applies, the Housing Code floor-area limit governs a CDC.",
  });
  // Same logic as FSR: a confirmed "no Lot Size Map" is an answer, not a gap.
  // It only matters for subdivision, never for building on the existing lot.
  const density = (pc.localProvisions ?? []).find((p) => /dwelling density/i.test(p.name));
  rows.push({
    group: addr,
    requirement: "Minimum lot size (for subdivision)",
    status: pc.minLotSizeSqm !== null || portalAnswered ? "pass" : "unknown",
    detail:
      pc.minLotSizeSqm !== null
        ? `${pc.minLotSizeSqm}m² (mapped)`
        : portalAnswered
          ? `No Lot Size Map applies to this lot (confirmed via the Planning Portal) — it doesn't affect building on the existing lot.${
              density
                ? ` Subdivision here is governed by the precinct's minimum dwelling density map (area ${density.value}, ${density.instrument}) and the precinct DCP.`
                : " Any subdivision would be assessed against the instrument's subdivision clauses and the council DCP."
            }`
          : "Lot size map couldn't be confirmed — check the Planning Portal or a Section 10.7 certificate (only matters for subdivision).",
  });
  rows.push({
    group: addr,
    requirement: "Not a heritage item or in a conservation area",
    status: pc.heritageItem || pc.heritageConservationArea ? "fail" : "pass",
    detail: pc.heritageItem ? "Heritage item — CDC excluded, DA with heritage report needed." : pc.heritageConservationArea ? "In a heritage conservation area — CDC usually excluded." : "No heritage listing found.",
  });
  rows.push({
    group: addr,
    requirement: "No biodiversity overlay",
    status: pc.biodiversityOverlay ? "warn" : "pass",
    detail: pc.biodiversityOverlay ? "Biodiversity mapping applies — ecological assessment likely needed." : "No biodiversity overlay found.",
  });

  for (const c of constraints) {
    rows.push({
      group: "Site constraints",
      requirement: `No ${c.name.toLowerCase()}`,
      status: c.verified === false ? "unknown" : !c.present ? "pass" : c.classification === "blocker" ? "fail" : "warn",
      detail: c.rationale,
    });
  }
  const footing = footingIndicator(site.soilTypeCode);
  rows.push({
    group: "Site constraints",
    requirement: "Ground suitable for standard footings",
    status: !footing ? "unknown" : footing.costly ? "warn" : "pass",
    detail: footing
      ? `Regional soil mapping: ${site.soilType} — ${footing.summary} (indicative AS 2870 site class ${footing.range}). A geotechnical report on the lot sets the actual class.`
      : "No regional soil mapping for this lot — a geotechnical report will set the footing class.",
  });

  rows.push({
    group: "Approval pathway",
    requirement: "Eligible for a fast CDC (private certifier)",
    status: pathway.pathway === "cdc" ? "pass" : pathway.pathway === "exempt" ? "pass" : "warn",
    detail:
      pathway.pathway === "cdc"
        ? `${pathway.reasoning} (${pathway.indicativeTimelineDays})`
        : `${pathway.reasoning}${pathway.cdcExclusionTriggers.length ? ` Triggers: ${pathway.cdcExclusionTriggers.join(", ")}.` : ""}`,
  });

  if (!design || design.extracted.hasSecondaryDwelling) {
    rows.push({ group: "Optional extras", requirement: "Granny flat via CDC", status: fromBool(dp.secondaryDwelling.eligible), detail: dp.secondaryDwelling.reasoning });
  }
  if (!design || design.extracted.isDualOccupancy) {
    rows.push({ group: "Optional extras", requirement: "Dual occupancy", status: fromBool(dp.dualOccupancy.likelyPermitted), detail: dp.dualOccupancy.reasoning });
  }

  if (design) {
    for (const c of design.checks) {
      rows.push({
        group: `Your design — ${c.category}`,
        requirement: c.rule,
        status: c.status,
        detail: `Required ${c.required}; plans show ${c.proposed}.${c.status === "fail" && c.fix ? ` ${c.fix}` : ""}`,
      });
    }
  }

  // Score factors that didn't earn full marks — mostly margins/headroom,
  // not failed requirements, so they get their own status.
  for (const f of record.score.factors) {
    const lost = f.weight - f.contribution;
    if (lost < 0.05) continue;
    rows.push({
      group: "Score — points not earned",
      requirement: `${f.factor} (${fmtPts(f.contribution)}/${fmtPts(f.weight)})`,
      status: "points",
      detail: `−${fmtPts(lost)} pts. ${f.gap ?? f.note}`,
    });
  }
  if (record.score.capNote) {
    rows.push({ group: "Score — points not earned", requirement: "Score cap", status: "fail", detail: record.score.capNote });
  }
  return rows;
}
