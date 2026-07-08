import { randomUUID } from "crypto";
import type { DataSourceAdapter } from "@/lib/data-sources/types";
import { getCouncilProfile } from "@/lib/pipeline/council-profiles";
import { runStage1SiteIdentification } from "@/lib/pipeline/stage1-site-identification";
import { runStage2PlanningControls } from "@/lib/pipeline/stage2-planning-controls";
import { runStage3Constraints } from "@/lib/pipeline/stage3-constraints";
import { runStage4BuildableEnvelope } from "@/lib/pipeline/stage4-envelope";
import { runStage5Pathway } from "@/lib/pipeline/stage5-pathway";
import { runStage6Scoring } from "@/lib/pipeline/stage6-scoring";
import { buildCostSignals, buildDocumentChecklist, buildNextSteps, buildRisksAndUnknowns } from "@/lib/pipeline/stage7-report";
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
  const nextSteps = buildNextSteps(pathway, siteProfile);

  return {
    id: randomUUID(),
    createdAt: new Date().toISOString(),
    siteProfile,
    planningControls,
    constraints,
    buildableEnvelope,
    pathway,
    score,
    costSignals,
    documentChecklist,
    risksAndUnknowns,
    nextSteps,
  };
}
