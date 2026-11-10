import { NextRequest, NextResponse, after } from "next/server";
import { saveDesignUpload } from "@/lib/analytics/usage-log";
import { checkDesign } from "@/lib/design-check/check-design";
import { extractDesign } from "@/lib/design-check/extract-design";
import { AssessmentRecordSchema } from "@/types/assessment";

// Reading multi-page plans with Claude can take a while.
export const maxDuration = 120;

const ALLOWED_TYPES = ["application/pdf", "image/png", "image/jpeg", "image/webp"];
const MAX_PDF_BYTES = 30 * 1024 * 1024;
const MAX_IMAGE_BYTES = 5 * 1024 * 1024;

export async function POST(req: NextRequest) {
  const form = await req.formData().catch(() => null);
  const file = form?.get("file");
  const recordRaw = form?.get("record");
  if (!(file instanceof File) || typeof recordRaw !== "string") {
    return NextResponse.json({ error: "Upload a plan file and run an assessment first." }, { status: 400 });
  }

  const record = AssessmentRecordSchema.safeParse(JSON.parse(recordRaw));
  if (!record.success) {
    return NextResponse.json({ error: "The assessment data was invalid — run the assessment again." }, { status: 400 });
  }
  if (!ALLOWED_TYPES.includes(file.type)) {
    return NextResponse.json({ error: "Upload a PDF, PNG, JPG or WebP file." }, { status: 400 });
  }
  const limit = file.type === "application/pdf" ? MAX_PDF_BYTES : MAX_IMAGE_BYTES;
  if (file.size > limit) {
    return NextResponse.json({ error: `File is too large (max ${limit / 1024 / 1024}MB for this type).` }, { status: 400 });
  }

  const sessionIdRaw = form?.get("sessionId");
  const sessionId = typeof sessionIdRaw === "string" ? sessionIdRaw.slice(0, 100) : undefined;
  const bytes = new Uint8Array(await file.arrayBuffer());
  const saved = { bytes, name: file.name, type: file.type };
  const started = Date.now();

  try {
    const extracted = await extractDesign({ data: bytes, mediaType: file.type });
    const result = checkDesign(record.data, extracted);
    after(() => saveDesignUpload({ file: saved, sessionId, record: record.data, result, durationMs: Date.now() - started }));
    return NextResponse.json({ result });
  } catch (e) {
    console.error("design-check failed", e);
    const error = e instanceof Error ? e.message : String(e);
    after(() => saveDesignUpload({ file: saved, sessionId, record: record.data, durationMs: Date.now() - started, error }));
    return NextResponse.json({ error: "Couldn't read the plans — try a clearer PDF or image." }, { status: 502 });
  }
}
