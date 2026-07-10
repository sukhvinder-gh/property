import { randomUUID } from "crypto";
import { inngest, type AssessmentRequestedEvent } from "@/lib/inngest/client";
import { getDataSourceAdapter } from "@/lib/data-sources/get-adapter";
import { getSupabaseServerClient } from "@/lib/supabase/server";
import { getCouncilProfile } from "@/lib/pipeline/council-profiles";
import { runStage1SiteIdentification } from "@/lib/pipeline/stage1-site-identification";
import { runStage2PlanningControls } from "@/lib/pipeline/stage2-planning-controls";
import { runStage3Constraints } from "@/lib/pipeline/stage3-constraints";
import { runStage4BuildableEnvelope } from "@/lib/pipeline/stage4-envelope";
import { runStage5Pathway } from "@/lib/pipeline/stage5-pathway";
import { runStage6Scoring } from "@/lib/pipeline/stage6-scoring";
import {
  buildCostSignals,
  buildCouncilControls,
  buildDevelopmentPotential,
  buildDocumentChecklist,
  buildFeasibilitySummary,
  buildNextSteps,
  buildRiskRegister,
  buildRisksAndUnknowns,
} from "@/lib/pipeline/stage7-report";
import type { AssessmentRecord } from "@/types/assessment";

const adapter = getDataSourceAdapter();

/**
 * Background version of src/lib/pipeline/run-assessment.ts: each stage is
 * its own Inngest step so a failed lookup (e.g. a council API call) retries
 * without re-running the whole assessment (SKILL.md build-mode notes).
 */
export const assessProperty = inngest.createFunction(
  { id: "assess-property", retries: 3, triggers: { event: "assessment/requested" } },
  async ({ event, step }) => {
    const { assessmentId, address, targetDwelling } = event.data as AssessmentRequestedEvent["data"];
    const supabase = getSupabaseServerClient();

    if (supabase) {
      await step.run("mark-running", async () => {
        await supabase.from("assessments").update({ status: "running" }).eq("id", assessmentId);
      });
    }

    try {
      const siteProfile = await step.run("stage-1-site-identification", () =>
        runStage1SiteIdentification(adapter, address)
      );

      const councilProfile = getCouncilProfile(siteProfile.lga);

      const planningControls = await step.run("stage-2-planning-controls", () =>
        runStage2PlanningControls(adapter, siteProfile)
      );

      const constraints = await step.run("stage-3-constraints", () =>
        runStage3Constraints(adapter, siteProfile)
      );

      const buildableEnvelope = await step.run("stage-4-buildable-envelope", () =>
        runStage4BuildableEnvelope(siteProfile, constraints, targetDwelling, councilProfile)
      );

      const pathway = await step.run("stage-5-pathway", () =>
        runStage5Pathway(siteProfile, planningControls, constraints)
      );

      const daStats = await step.run("stage-5b-da-stats", () =>
        adapter.daStats(siteProfile.lga, pathway.pathway === "cdc" ? "CDC" : "DA")
      );

      const score = await step.run("stage-6-scoring", () =>
        runStage6Scoring(siteProfile, planningControls, constraints, daStats, buildableEnvelope, councilProfile)
      );

      const record = (await step.run("stage-7-report", () => {
        const costSignals = buildCostSignals(constraints, siteProfile);
        const documentChecklist = buildDocumentChecklist(pathway, constraints);
        const risksAndUnknowns = buildRisksAndUnknowns(siteProfile, buildableEnvelope, constraints);
        const riskRegister = buildRiskRegister(siteProfile, planningControls, constraints);
        const nextSteps = buildNextSteps(pathway, siteProfile);
        const developmentPotential = buildDevelopmentPotential(siteProfile, planningControls);
        const councilControls = buildCouncilControls(siteProfile, planningControls, councilProfile);
        const feasibilitySummary = buildFeasibilitySummary(siteProfile, planningControls, constraints, buildableEnvelope, pathway, score);

        return {
          id: assessmentId,
          createdAt: new Date().toISOString(),
          siteProfile,
          planningControls,
          constraints,
          buildableEnvelope,
          developmentPotential,
          councilControls,
          pathway,
          score,
          feasibilitySummary,
          costSignals,
          documentChecklist,
          risksAndUnknowns,
          riskRegister,
          nextSteps,
        };
      })) as AssessmentRecord;

      if (supabase) {
        await step.run("persist-complete", async () => {
          await supabase
            .from("assessments")
            .update({
              status: "complete",
              record,
              score: record.score.score,
              band_low: record.score.bandLow,
              band_high: record.score.bandHigh,
              is_banded: record.score.isBanded,
              completed_at: new Date().toISOString(),
            })
            .eq("id", assessmentId);
        });
      }

      return record;
    } catch (err) {
      if (supabase) {
        await step.run("persist-failed", async () => {
          await supabase
            .from("assessments")
            .update({ status: "failed", error: err instanceof Error ? err.message : String(err) })
            .eq("id", assessmentId);
        });
      }
      throw err;
    }
  }
);

export function newAssessmentId(): string {
  return randomUUID();
}
