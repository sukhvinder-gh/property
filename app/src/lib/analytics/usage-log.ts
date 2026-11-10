import { getSupabaseServerClient } from "@/lib/supabase/server";
import type { DesignCheckResult } from "@/lib/design-check/schema";
import type { AssessmentRecord } from "@/types/assessment";

/**
 * Usage logging to Supabase (tables from supabase/migrations/0002_usage_logging.sql).
 * Logging must never break or slow a user's request: every function here
 * swallows its own errors, and callers run it via next/server `after()`.
 */

const DESIGN_BUCKET = "designs";

export interface SearchLogInput {
  query: string;
  sessionId?: string;
  source?: "autocomplete" | "typed";
  record?: AssessmentRecord;
  durationMs: number;
  error?: string;
}

export async function logSearch(input: SearchLogInput): Promise<void> {
  const supabase = getSupabaseServerClient();
  if (!supabase) return;
  const r = input.record;
  const site = r?.siteProfile;
  const resolved = Boolean(site?.lotDp);
  try {
    const { error } = await supabase.from("search_events").insert({
      session_id: input.sessionId ?? null,
      query: input.query,
      source: input.source ?? null,
      resolved,
      // Stage 1's first provenance entry carries the geocoder's reason for a miss.
      unresolved_reason: !resolved ? (input.error ?? site?.provenance[0]?.source ?? null) : null,
      assessment_id: r?.id ?? null,
      matched_address: resolved ? site!.address : null,
      lot_dp: site?.lotDp ?? null,
      lga: site?.lga ?? null,
      council_name: site?.councilName ?? null,
      // Without a matched lot these are placeholders, not findings — leave them empty.
      zone: resolved ? r!.planningControls.zone : null,
      instrument: resolved ? site!.epiName : null,
      pathway: resolved ? r!.pathway.pathway : null,
      score: resolved ? r!.score.score : null,
      band: resolved ? r!.score.bandLow : null,
      duration_ms: Math.round(input.durationMs),
      error: input.error ?? null,
    });
    if (error) console.error("search log failed", error.message);
  } catch (e) {
    console.error("search log failed", e);
  }
}

export interface DesignLogInput {
  file: { bytes: Uint8Array; name: string; type: string };
  sessionId?: string;
  record: AssessmentRecord;
  result?: DesignCheckResult;
  durationMs: number;
  error?: string;
}

export async function saveDesignUpload(input: DesignLogInput): Promise<void> {
  const supabase = getSupabaseServerClient();
  if (!supabase) return;
  const { file, record, result } = input;
  try {
    const safeName = file.name.replace(/[^\w.-]+/g, "_").slice(-100);
    const path = `${new Date().toISOString().slice(0, 7)}/${crypto.randomUUID()}-${safeName}`;
    const upload = await supabase.storage.from(DESIGN_BUCKET).upload(path, file.bytes, { contentType: file.type });
    if (upload.error) console.error("design upload failed", upload.error.message);

    const { error } = await supabase.from("design_uploads").insert({
      session_id: input.sessionId ?? null,
      assessment_id: record.id,
      address: record.siteProfile.address,
      file_path: upload.error ? null : path,
      file_name: file.name,
      file_type: file.type,
      file_size_bytes: file.bytes.byteLength,
      verdict: result?.verdict ?? null,
      failing_checks: result ? result.checks.filter((c) => c.status === "fail").length : null,
      unknown_checks: result ? result.checks.filter((c) => c.status === "unknown").length : null,
      extracted: result?.extracted ?? null,
      result: result ?? null,
      duration_ms: Math.round(input.durationMs),
      error: input.error ?? null,
    });
    if (error) console.error("design log failed", error.message);
  } catch (e) {
    console.error("design log failed", e);
  }
}
