import type { DaStatsResult } from "@/lib/data-sources/types";
import type { CouncilProfile } from "@/lib/pipeline/council-profiles";
import type { BuildableEnvelope, Constraint, PlanningControls, ScoreBand, ScoreFactor, ScoreResult, SiteProfile } from "@/types/assessment";

const DATA_THIN_THRESHOLD = 30;

function bandForScore(score: number): ScoreBand {
  if (score >= 75) return "Strong";
  if (score >= 50) return "Viable";
  if (score >= 30) return "Marginal";
  return "Unlikely";
}

export function runStage6Scoring(
  siteProfile: SiteProfile,
  planningControls: PlanningControls,
  constraints: Constraint[],
  daStats: DaStatsResult,
  buildableEnvelope: BuildableEnvelope,
  councilProfile?: CouncilProfile | null
): ScoreResult {
  const factors: ScoreFactor[] = [];

  const zonePermits = /^R/.test(planningControls.zone);
  factors.push({
    factor: "Zoning permits proposed use",
    weight: 30,
    contribution: zonePermits ? 30 : 0,
    note: zonePermits
      ? `Zone ${planningControls.zone} (${planningControls.zoneDescription}) generally permits residential development.`
      : `Zone ${planningControls.zone} (${planningControls.zoneDescription}) does not read as a standard residential zone — verify permissibility before proceeding; hard gate applied.`,
  });

  let lotSizeContribution = 10;
  let lotSizeNote = "Minimum lot size control unavailable — partial credit only; verify via LSZ map.";
  if (planningControls.minLotSizeSqm !== null && siteProfile.lotSizeSqm !== null) {
    const marginPct = ((siteProfile.lotSizeSqm - planningControls.minLotSizeSqm) / planningControls.minLotSizeSqm) * 100;
    lotSizeContribution = Math.max(0, Math.min(20, 10 + marginPct / 5));
    lotSizeNote = `Lot size ${siteProfile.lotSizeSqm}m² vs minimum ${planningControls.minLotSizeSqm}m² (${marginPct >= 0 ? "+" : ""}${marginPct.toFixed(0)}% margin).`;
  }
  factors.push({ factor: "Lot size/frontage vs controls", weight: 20, contribution: Math.round(lotSizeContribution), note: lotSizeNote });

  const blockers = constraints.filter((c) => c.present && c.classification === "blocker").length;
  const costAdders = constraints.filter((c) => c.present && c.classification === "cost-adder").length;
  let constraintContribution = 20 - blockers * 15 - costAdders * 4;
  constraintContribution = Math.max(0, Math.min(20, constraintContribution));
  factors.push({
    factor: "Constraint severity",
    weight: 20,
    contribution: Math.round(constraintContribution),
    note: `${blockers} blocker(s), ${costAdders} cost-adder(s) among checked constraints.`,
  });

  // Per references/councils.md's confidence-by-tier table, a profiled council
  // (deep profile below — councilProfile is non-null exactly then) gets full
  // scoring regardless of DA-stats volume; the deep profile itself is the
  // confidence source. DA-stats data-thinness only bands the verdict for
  // unprofiled councils. The approval-rate sub-factor's own weight still
  // halves on thin DA stats either way — that's a real gap in that one input,
  // independent of overall tier confidence.
  const isDataThin = daStats.determinationsLast12Months < DATA_THIN_THRESHOLD;
  const isProfiled = Boolean(councilProfile);
  const shouldBandOverallScore = !isProfiled && isDataThin;
  const approvalRateWeight = isDataThin ? 7.5 : 15;
  let approvalContribution = 0;
  let approvalNote = "No DA determination history available for this council/DA type.";
  if (daStats.approvalRatePercent !== null) {
    approvalContribution = (daStats.approvalRatePercent / 100) * approvalRateWeight;
    approvalNote = `${daStats.approvalRatePercent}% approval rate over ${daStats.determinationsLast12Months} determinations (rolling 12mo)${
      isDataThin ? (shouldBandOverallScore ? " — data-thin council, weight halved and verdict banded" : " — data-thin, weight halved, but council is deep-profiled so the overall verdict stays a point score") : ""
    }.`;
  }
  factors.push({
    factor: "Council historical approval rate for this DA type",
    weight: approvalRateWeight,
    contribution: Math.round(approvalContribution * 10) / 10,
    note: approvalNote,
  });

  // Generic procedure per references/councils.md: DCP text alone, culture unmodelled without a deep profile.
  let dcpContribution = 7;
  let dcpNote = "Assessed from DCP text/assumed setbacks only — council's applied strictness is unmodelled without a deep profile.";
  if (councilProfile?.footprintMaxPercent && siteProfile.lotSizeSqm && buildableEnvelope.envelopeAreaSqm !== null) {
    const impliedCoveragePct = (buildableEnvelope.envelopeAreaSqm / siteProfile.lotSizeSqm) * 100;
    if (impliedCoveragePct > 100) {
      // The envelope is a bounding-box-derived rectangle (see boundingBoxDims in
      // arcgis.ts), which can exceed the true polygon area for irregular/corner-cut
      // lots — an implied coverage over 100% is impossible, not a real result.
      // Fall back to the generic contribution rather than surface a nonsensical figure.
      dcpNote = `${councilProfile.instrumentName} specifies a ${councilProfile.footprintMaxPercent}% max footprint, but this lot's shape is too irregular for the bounding-box envelope estimate to imply a reliable coverage % — generic headroom credit applied instead.`;
    } else {
      const marginPct = councilProfile.footprintMaxPercent - impliedCoveragePct;
      dcpContribution = Math.max(0, Math.min(10, 5 + marginPct / 4));
      dcpNote = `Buildable envelope implies ~${impliedCoveragePct.toFixed(0)}% site coverage vs ${councilProfile.footprintMaxPercent}% max footprint per ${councilProfile.instrumentName} (${marginPct >= 0 ? "+" : ""}${marginPct.toFixed(0)}pt margin).`;
    }
  } else if (councilProfile) {
    dcpNote = `${councilProfile.instrumentName} does not specify a numeric site-coverage/footprint control for standard dwellings — generic headroom credit applied.`;
  }
  factors.push({
    factor: "DCP compliance headroom (setbacks, landscaping, parking)",
    weight: 10,
    contribution: Math.round(dcpContribution),
    note: dcpNote,
  });

  let neighbourContribution = 5;
  const neighbourNotes: string[] = [];
  if (siteProfile.isCornerLot) {
    neighbourContribution -= 2;
    neighbourNotes.push("corner lot (secondary street frontage/overlooking)");
  }
  factors.push({
    factor: "Neighbour/objection risk proxies",
    weight: 5,
    contribution: Math.max(0, neighbourContribution),
    note: neighbourNotes.length > 0 ? `Risk factors: ${neighbourNotes.join(", ")}.` : "No elevated neighbour/objection risk proxies detected.",
  });

  const rawScore = factors.reduce((sum, f) => sum + f.contribution, 0);
  const cappedScore = zonePermits ? rawScore : Math.min(rawScore, 10);
  const score = Math.round(Math.max(0, Math.min(100, cappedScore)));

  const sortedDrivers = [...factors].sort((a, b) => b.contribution / b.weight - a.contribution / a.weight);
  const topDrivers = sortedDrivers.slice(0, 3).map((f) => `${f.factor}: ${f.note}`);

  if (shouldBandOverallScore) {
    const band = bandForScore(score);
    const bandOrder: ScoreBand[] = ["Unlikely", "Marginal", "Viable", "Strong"];
    const idx = bandOrder.indexOf(band);
    const lowerBand = bandOrder[Math.max(0, idx - 1)];
    return {
      score: null,
      bandLow: lowerBand,
      bandHigh: band,
      isBanded: true,
      topDrivers,
      factors,
    };
  }

  const band = bandForScore(score);
  return {
    score,
    bandLow: band,
    bandHigh: band,
    isBanded: false,
    topDrivers,
    factors,
  };
}
