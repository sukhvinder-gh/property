import type { Constraint, Pathway, PlanningControls, SiteProfile } from "@/types/assessment";

const ASSUMED_CDC_MIN_LOT_SQM = 450;
const ASSUMED_CDC_MIN_FRONTAGE_M = 12;

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
  if (siteProfile.lotSizeSqm !== null && siteProfile.lotSizeSqm < ASSUMED_CDC_MIN_LOT_SQM) {
    triggers.push(
      `Lot size ${siteProfile.lotSizeSqm}m² is below the assumed CDC minimum of ${ASSUMED_CDC_MIN_LOT_SQM}m² — verify current Codes SEPP figure.`
    );
  }
  if (siteProfile.frontageM !== null && siteProfile.frontageM < ASSUMED_CDC_MIN_FRONTAGE_M) {
    triggers.push(
      `Frontage ${siteProfile.frontageM}m is below the assumed CDC minimum of ${ASSUMED_CDC_MIN_FRONTAGE_M}m — verify current Codes SEPP figure.`
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
