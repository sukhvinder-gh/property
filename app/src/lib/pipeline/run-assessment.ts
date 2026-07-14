import { randomUUID } from "crypto";
import type { DataSourceAdapter } from "@/lib/data-sources/types";
import { getCouncilProfile } from "@/lib/pipeline/council-profiles";
import { runStage1SiteIdentification } from "@/lib/pipeline/stage1-site-identification";
import { runStage2PlanningControls } from "@/lib/pipeline/stage2-planning-controls";
import { runStage3Constraints } from "@/lib/pipeline/stage3-constraints";
import { runStage4BuildableEnvelope } from "@/lib/pipeline/stage4-envelope";
import { runStage5Pathway } from "@/lib/pipeline/stage5-pathway";
import { runStage6Scoring } from "@/lib/pipeline/stage6-scoring";
import {
  buildAccessSummary,
  buildApprovalStrategySummary,
  buildConstructionFeasibilitySummary,
  buildCostAssessmentSummary,
  buildCostSignals,
  buildCouncilControls,
  buildDevelopmentPotential,
  buildDocumentChecklist,
  buildEngineeringSummary,
  buildEnvironmentalSummary,
  buildFeasibilitySummary,
  buildNextSteps,
  buildRiskRegister,
  buildRisksAndUnknowns,
  buildUtilitiesSummary,
} from "@/lib/pipeline/stage7-report";
import type { AssessmentRecord } from "@/types/assessment";

export interface RunAssessmentInput {
  address: string;
  targetDwelling?: { description: string; footprintSqm: number };
}

/**
 * Orchestrates Stages 1-7 of the pre-approval pipeline
 * (docs/property-pre-approval-engine/SKILL.md). Each stage is a pure
 * function so it can also be invoked individually as an Inngest step
 * (see src/lib/inngest/functions/assess.ts) with per-stage retry.
 */
export async function runAssessment(adapter: DataSourceAdapter, input: RunAssessmentInput): Promise<AssessmentRecord> {
  const siteProfile = await runStage1SiteIdentification(adapter, input.address);
  const councilProfile = getCouncilProfile(siteProfile.lga);
  const planningControls = await runStage2PlanningControls(adapter, siteProfile);
  const constraints = await runStage3Constraints(adapter, siteProfile);
  const buildableEnvelope = runStage4BuildableEnvelope(siteProfile, constraints, input.targetDwelling, councilProfile);
  const pathway = runStage5Pathway(siteProfile, planningControls, constraints);
  const daStats = await adapter.daStats(siteProfile.lga, pathway.pathway === "cdc" ? "CDC" : "DA");
  const score = runStage6Scoring(siteProfile, planningControls, constraints, daStats, buildableEnvelope, councilProfile);

  const costSignals = buildCostSignals(constraints, siteProfile);
  const documentChecklist = buildDocumentChecklist(pathway, constraints);
  const risksAndUnknowns = buildRisksAndUnknowns(siteProfile, buildableEnvelope, constraints);
  const riskRegister = buildRiskRegister(siteProfile, planningControls, constraints);
  const nextSteps = buildNextSteps(pathway, siteProfile);
  const developmentPotential = buildDevelopmentPotential(siteProfile, planningControls);
  const councilControls = buildCouncilControls(siteProfile, planningControls, councilProfile);
  const utilities = buildUtilitiesSummary(siteProfile);
  const access = buildAccessSummary(siteProfile);
  const engineering = buildEngineeringSummary(siteProfile, constraints);
  const environmental = buildEnvironmentalSummary(siteProfile, constraints);
  const constructionFeasibility = buildConstructionFeasibilitySummary(siteProfile, buildableEnvelope, councilProfile);
  const costAssessment = buildCostAssessmentSummary(costSignals);
  const approvalStrategy = buildApprovalStrategySummary(pathway, constraints, planningControls, siteProfile.councilTier, riskRegister);
  const feasibilitySummary = buildFeasibilitySummary(siteProfile, planningControls, constraints, buildableEnvelope, pathway, score);

  return {
    id: randomUUID(),
    createdAt: new Date().toISOString(),
    siteProfile,
    planningControls,
    constraints,
    buildableEnvelope,
    developmentPotential,
    councilControls,
    utilities,
    access,
    engineering,
    environmental,
    constructionFeasibility,
    costAssessment,
    approvalStrategy,
    pathway,
    score,
    feasibilitySummary,
    costSignals,
    documentChecklist,
    risksAndUnknowns,
    riskRegister,
    nextSteps,
  };
}
