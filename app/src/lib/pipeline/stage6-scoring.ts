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
    gap: zonePermits ? undefined : "The zone must permit residential development — check the instrument's Land Use Table, or a rezoning/planning proposal would be needed.",
  });

  // 10 points for meeting the minimum, +1 per 5% of headroom above it, so
  // full marks need a lot 50% larger than the minimum.
  let lotSizeContribution = 10;
  const portalAnswered = planningControls.provenance.some((p) => /ePlanning API/.test(p.source));
  let lotSizeNote = portalAnswered
    ? "No Lot Size Map applies to this lot (Planning Portal) — neutral credit."
    : "Minimum lot size control unavailable — partial credit only; verify via LSZ map.";
  let lotSizeGap = portalAnswered
    ? "No Lot Size Map applies to this lot (confirmed via the Planning Portal), so there's no minimum to measure headroom against — a neutral 10/20 is given. Nothing to fix; it only affects subdivision potential."
    : "No minimum lot size is mapped for this lot, so half credit (10/20) is given — a Section 10.7 planning certificate would confirm the control.";
  if (planningControls.minLotSizeSqm !== null && siteProfile.lotSizeSqm !== null) {
    const min = planningControls.minLotSizeSqm;
    const marginPct = ((siteProfile.lotSizeSqm - min) / min) * 100;
    lotSizeContribution = Math.max(0, Math.min(20, 10 + marginPct / 5));
    lotSizeNote = `Lot size ${siteProfile.lotSizeSqm}m² vs minimum ${min}m² (${marginPct >= 0 ? "+" : ""}${marginPct.toFixed(0)}% margin).`;
    lotSizeGap =
      siteProfile.lotSizeSqm >= min
        ? `Not a failure — the lot meets the ${min}m² minimum. This factor rewards headroom above it: full marks need ${Math.round(min * 1.5)}m² (+50%); this lot is ${siteProfile.lotSizeSqm}m² (+${marginPct.toFixed(0)}%). Points can't be gained without a larger lot (e.g. amalgamation).`
        : `The lot is ${min - siteProfile.lotSizeSqm}m² under the ${min}m² minimum lot size. That doesn't stop a house on the existing lot — the minimum governs creating new lots — but it means no subdivision headroom.`;
  }
  factors.push({
    factor: "Lot size/frontage vs controls",
    weight: 20,
    contribution: Math.round(lotSizeContribution),
    note: lotSizeNote,
    gap: Math.round(lotSizeContribution) < 20 ? lotSizeGap : undefined,
  });

  const presentBlockers = constraints.filter((c) => c.present && c.classification === "blocker");
  const presentCostAdders = constraints.filter((c) => c.present && c.classification === "cost-adder");
  const blockers = presentBlockers.length;
  const costAdders = presentCostAdders.length;
  let constraintContribution = 20 - blockers * 15 - costAdders * 4;
  constraintContribution = Math.max(0, Math.min(20, constraintContribution));
  factors.push({
    factor: "Constraint severity",
    weight: 20,
    contribution: Math.round(constraintContribution),
    note: `${blockers} blocker(s), ${costAdders} cost-adder(s) among checked constraints.`,
    gap:
      blockers + costAdders > 0
        ? `Each blocker costs 15 points and each cost-adder 4: ${[...presentBlockers.map((c) => `${c.name} (blocker)`), ...presentCostAdders.map((c) => `${c.name} (cost-adder)`)].join(", ")}. These are site conditions — addressed through reports/design, not removable.`
        : undefined,
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
  // With no approval-rate figure (the public DA feed doesn't publish
  // outcomes; CDC history can be empty), the factor is left out and the
  // score is scaled to the points that could be assessed — missing data
  // shouldn't read as a mark against the site.
  const hasApprovalRate = daStats.approvalRatePercent !== null;
  const approvalRateWeight = !hasApprovalRate ? 0 : isDataThin ? 7.5 : 15;
  let approvalContribution = 0;
  let approvalNote = `Not scored — no approval-rate data. ${daStats.provenance.source}.`;
  if (daStats.approvalRatePercent !== null) {
    approvalContribution = (daStats.approvalRatePercent / 100) * approvalRateWeight;
    approvalNote = `${daStats.approvalRatePercent}% approval rate over ${daStats.determinationsLast12Months} decisions (rolling 12mo)${
      daStats.medianDeterminationDays !== null ? `, median ${daStats.medianDeterminationDays} days to decision` : ""
    }${
      isDataThin ? (shouldBandOverallScore ? " — data-thin council, weight halved and verdict banded" : " — data-thin, weight halved, but council is deep-profiled so the overall verdict stays a point score") : ""
    }. ${daStats.provenance.source}.`;
  }
  factors.push({
    factor: "Council historical approval rate for this DA type",
    weight: approvalRateWeight,
    contribution: Math.round(approvalContribution * 10) / 10,
    note: approvalNote,
    gap:
      daStats.approvalRatePercent !== null && daStats.approvalRatePercent < 100
        ? `Scored in proportion to the council's ${daStats.approvalRatePercent}% approval rate — a council-wide statistic, not something this site can change.`
        : undefined,
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
    gap:
      Math.round(dcpContribution) < 10
        ? dcpContribution === 7
          ? "Default 7/10 — headroom against the council's DCP controls (setbacks, landscaping, parking) isn't measured for this lot yet. Uploading your plans runs the actual setback/landscaping checks."
          : "Full marks need more margin between the buildable envelope's site coverage and the DCP's maximum footprint."
        : undefined,
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
    gap: neighbourNotes.length > 0 ? `−2 for a corner lot: two street frontages mean more neighbours and more overlooking/streetscape scrutiny.` : undefined,
  });

  const available = factors.reduce((sum, f) => sum + f.weight, 0);
  const rawScore = (factors.reduce((sum, f) => sum + f.contribution, 0) / available) * 100;
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
