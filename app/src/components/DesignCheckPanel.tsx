"use client";

import type { DesignCheckItem, DesignCheckResult, DesignVerdict } from "@/lib/design-check/schema";
import type { AssessmentRecord } from "@/types/assessment";

const VERDICT_STYLE: Record<DesignVerdict, { label: string; className: string }> = {
  likely_cdc: { label: "✅ Likely approvable (CDC)", className: "border-green-500 bg-green-50 text-green-900" },
  cannot_confirm: { label: "❔ Can't fully confirm", className: "border-amber-400 bg-amber-50 text-amber-900" },
  da_required: { label: "⚠️ Needs changes or a DA", className: "border-orange-400 bg-orange-50 text-orange-900" },
  unlikely: { label: "❌ Unlikely as designed", className: "border-red-400 bg-red-50 text-red-900" },
};

const STATUS_ICON: Record<DesignCheckItem["status"], string> = { pass: "✅", fail: "❌", unknown: "❔" };

/** Sends the plans plus the address's assessment to /api/design-check. */
export async function checkDesignFile(file: File, record: AssessmentRecord, sessionId?: string): Promise<DesignCheckResult> {
  const body = new FormData();
  body.append("file", file);
  body.append("record", JSON.stringify(record));
  if (sessionId) body.append("sessionId", sessionId);
  const res = await fetch("/api/design-check", { method: "POST", body });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error ?? `Design check failed (${res.status})`);
  return data.result;
}

export function DesignCheckResults({ result }: { result: DesignCheckResult }) {
  const failing = result.checks.filter((c) => c.status === "fail");
  const unknown = result.checks.filter((c) => c.status === "unknown");

  return (
    <div className="card space-y-4 text-sm">
      <div>
        <h2 className="section-title text-lg">
          House design check{result.extracted.designName ? ` — ${result.extracted.designName}` : ""}
        </h2>
        <p className="text-xs text-neutral-600">
          Your plans checked against this lot&apos;s controls and the Housing Code. Indicative only — a certifier or
          council makes the actual decision.
        </p>
      </div>

      <>
        <div className="space-y-4">
          <div className={`rounded-lg border px-4 py-3 ${VERDICT_STYLE[result.verdict].className}`}>
            <div className="font-semibold">{VERDICT_STYLE[result.verdict].label}</div>
            <div>{result.headline}</div>
          </div>

          {failing.length > 0 && (
            <div>
              <h3 className="font-semibold">What needs to change</h3>
              <ol className="mt-1 list-decimal space-y-1 pl-5">
                {failing.map((c) => (
                  <li key={c.id}>
                    <strong>{c.rule}</strong>: plans show {c.proposed}, required {c.required}.
                    {c.fix && <span className="text-neutral-700"> {c.fix}</span>}
                  </li>
                ))}
              </ol>
            </div>
          )}

          {unknown.length > 0 && (
            <div>
              <h3 className="font-semibold">Couldn&apos;t check from these plans</h3>
              <ul className="mt-1 list-disc pl-5 text-neutral-700">
                {unknown.map((c) => (
                  <li key={c.id}>
                    {c.rule} (required {c.required})
                  </li>
                ))}
              </ul>
            </div>
          )}

          <div className="overflow-x-auto">
            <table className="w-full border-collapse text-xs">
              <thead>
                <tr className="border-b text-left">
                  <th className="py-1 pr-2" />
                  <th className="py-1 pr-2">Check</th>
                  <th className="py-1 pr-2">Required</th>
                  <th className="py-1 pr-2">Your plans</th>
                </tr>
              </thead>
              <tbody>
                {result.checks.map((c) => (
                  <tr key={c.id} className="border-b align-top">
                    <td className="py-1 pr-2">{STATUS_ICON[c.status]}</td>
                    <td className="py-1 pr-2">
                      {c.rule}
                      <div className="text-neutral-500">
                        {c.category} · {c.source}
                      </div>
                    </td>
                    <td className="py-1 pr-2">{c.required}</td>
                    <td className="py-1 pr-2">{c.proposed}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {(result.caveats.length > 0 || result.extracted.readingNotes.length > 0) && (
            <div className="text-xs text-neutral-600">
              <h3 className="font-semibold text-neutral-800">Notes</h3>
              <ul className="mt-1 list-disc pl-5">
                {result.caveats.map((c) => (
                  <li key={c}>{c}</li>
                ))}
                {result.extracted.readingNotes.map((n) => (
                  <li key={n}>Reading the plans: {n}</li>
                ))}
              </ul>
            </div>
          )}
        </div>
      </>
    </div>
  );
}
