import { NextRequest, NextResponse } from "next/server";
import { getDataSourceAdapter } from "@/lib/data-sources/get-adapter";
import { runAssessment } from "@/lib/pipeline/run-assessment";
import { getSupabaseServerClient } from "@/lib/supabase/server";
import { AssessRequestSchema } from "@/types/assessment";

const adapter = getDataSourceAdapter();

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null);
  const parsed = AssessRequestSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  const { address, targetDwelling } = parsed.data;

  const record = await runAssessment(adapter, {
    address,
    targetDwelling: targetDwelling ? { description: targetDwelling, footprintSqm: 0 } : undefined,
  });

  const supabase = getSupabaseServerClient();
  if (supabase) {
    const { data: lot } = await supabase
      .from("lots")
      .insert({
        address: record.siteProfile.address,
        lot_dp: record.siteProfile.lotDp,
        lga: record.siteProfile.lga,
        epi_name: record.siteProfile.epiName,
        epi_amendment_date: record.siteProfile.epiAmendmentDate,
        lot_size_sqm: record.siteProfile.lotSizeSqm,
        frontage_m: record.siteProfile.frontageM,
        depth_m: record.siteProfile.depthM,
        is_corner_lot: record.siteProfile.isCornerLot,
        registration_status: record.siteProfile.registrationStatus,
      })
      .select("id")
      .single();

    if (lot) {
      await supabase.from("assessments").insert({
        id: record.id,
        lot_id: lot.id,
        status: "complete",
        record,
        score: record.score.score,
        band_low: record.score.bandLow,
        band_high: record.score.bandHigh,
        is_banded: record.score.isBanded,
        completed_at: record.createdAt,
      });
    }
  }

  return NextResponse.json({ record });
}
