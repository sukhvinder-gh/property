import type { Constraint, Pathway, PlanningControls, SiteProfile } from "@/types/assessment";

export function runStage5Pathway(
  siteProfile: SiteProfile,
  planningControls: PlanningControls,
  constraints: Constraint[]
): Pathway {
  const triggers: string[] = [];

  if (planningControls.heritageItem || planningControls.heritageConservationArea) {
    triggers.push("Heritage item or conservation area — CDC generally excluded, DA required.");
  }
  const flood = constraints.find((c) => c.name.startsWith("Flood"));
  if (flood?.present) {
    triggers.push("Flood control lot — CDC commonly excluded under the Codes SEPP; verify current exclusion wording.");
  }
  const bushfire = constraints.find((c) => c.name.startsWith("Bushfire"));
  if (bushfire?.present) {
    triggers.push("Bushfire prone land — CDC may be excluded depending on BAL rating; verify against current Codes SEPP bushfire provisions.");
  }
  // Minimum lot size for CDC eligibility is set per-development-type by the
  // relevant Codes SEPP/Housing SEPP division (single dwelling, dual
  // occupancy, secondary dwelling each differ) and is council/zone-specific
  // where a minimum applies at all — there is no single statewide number to
  // assume here. Only the live LSZ (Minimum Lot Size) layer for this lot's
  // own zone is a real figure; anything else would be guessing a control
  // value, which SKILL.md rules out. Frontage has no confirmed live
  // statewide minimum source, so it's never asserted as an exclusion here —
  // see the secondary-dwelling-specific check in stage7-report.ts, which
  // correctly uses the Housing SEPP granny-flat figures for that one
  // development type.
  if (planningControls.minLotSizeSqm !== null && siteProfile.lotSizeSqm !== null && siteProfile.lotSizeSqm < planningControls.minLotSizeSqm) {
    triggers.push(
      `Lot size ${siteProfile.lotSizeSqm}m² is below this zone's minimum lot size of ${planningControls.minLotSizeSqm}m² (live LSZ layer) — subdivision-dependent CDC pathways are likely excluded; a standalone dwelling on the existing lot may still be unaffected. Verify against the specific Codes SEPP/Housing SEPP division for the proposed development type.`
    );
  }
  if (siteProfile.registrationStatus === "unregistered") {
    triggers.push("Lot is unregistered — a CDC generally cannot be issued until the lot is registered.");
  }

  const pathway: Pathway["pathway"] = triggers.length > 0 ? "da" : "cdc";

  return {
    pathway,
    reasoning:
      pathway === "cdc"
        ? "No CDC exclusion triggers found against the checks run — a Complying Development Certificate via a private certifier is the likely fastest pathway, subject to full Codes SEPP compliance."
        : "One or more CDC exclusion triggers apply — a Development Application to council is the likely required pathway.",
    cdcExclusionTriggers: triggers,
    indicativeTimelineDays: pathway === "cdc" ? "~20 days (private certifier)" : "~40-90+ days (council DA, varies by LGA backlog)",
  };
}
