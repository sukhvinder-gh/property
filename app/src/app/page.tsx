"use client";

import { useRef, useState } from "react";
import { ReportView } from "@/components/ReportView";
import { ChatPanel } from "@/components/ChatPanel";
import { AddressAutocomplete } from "@/components/AddressAutocomplete";
import { DesignCheckResults, checkDesignFile } from "@/components/DesignCheckPanel";
import type { DesignCheckResult } from "@/lib/design-check/schema";
import type { AssessmentRecord } from "@/types/assessment";

export default function Home() {
  const [address, setAddress] = useState("");
  const [designFile, setDesignFile] = useState<File | null>(null);
  const [record, setRecord] = useState<AssessmentRecord | null>(null);
  const [designResult, setDesignResult] = useState<DesignCheckResult | null>(null);
  const [step, setStep] = useState<"idle" | "address" | "design">("idle");
  const [error, setError] = useState<string | null>(null);
  const [designError, setDesignError] = useState<string | null>(null);
  // Address the current `record` was assessed for — lets a new design be
  // checked without re-running the whole address assessment.
  const assessedAddress = useRef<string | null>(null);
  const fileInput = useRef<HTMLInputElement>(null);

  async function run() {
    if (!address.trim()) return;
    setError(null);
    setDesignError(null);
    setDesignResult(null);

    let current = record;
    if (!current || assessedAddress.current !== address) {
      setStep("address");
      try {
        const res = await fetch("/api/assess", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ address }),
        });
        if (!res.ok) throw new Error(`Assessment failed (${res.status})`);
        current = (await res.json()).record as AssessmentRecord;
        setRecord(current);
        assessedAddress.current = address;
      } catch (e) {
        setError(e instanceof Error ? e.message : "Assessment failed");
        setStep("idle");
        return;
      }
    }

    if (designFile) {
      setStep("design");
      try {
        setDesignResult(await checkDesignFile(designFile, current));
      } catch (e) {
        setDesignError(e instanceof Error ? e.message : "Design check failed");
      }
    }
    setStep("idle");
  }

  const busy = step !== "idle";
  const buttonLabel =
    step === "address" ? "Checking address…" : step === "design" ? "Reading plans…" : designFile ? "Check address & design" : "Run assessment";

  return (
    <div className="mx-auto max-w-6xl px-6 py-10">
      <h1 className="text-2xl font-bold">Property Wealth OS — Pre-Approval Engine</h1>
      <p className="mt-1 text-sm text-neutral-600">
        NSW pre-DA feasibility assessment. Indicative only — not a legal determination.
      </p>

      <div className="mt-6 flex gap-2">
        <AddressAutocomplete
          className="w-full rounded border px-3 py-2 text-sm"
          placeholder="e.g. 12 Sample St, Marsden Park NSW"
          value={address}
          onChange={setAddress}
          onSubmit={run}
        />
        <button
          onClick={run}
          disabled={busy || !address.trim()}
          className="shrink-0 rounded bg-neutral-800 px-4 py-2 text-sm text-white disabled:opacity-50"
        >
          {buttonLabel}
        </button>
      </div>

      <div className="mt-3 flex flex-wrap items-center gap-2 text-sm">
        <span className="text-neutral-500">House design (optional):</span>
        <input
          ref={fileInput}
          type="file"
          accept="application/pdf,image/png,image/jpeg,image/webp"
          onChange={(e) => setDesignFile(e.target.files?.[0] ?? null)}
          className="hidden"
        />
        <button
          onClick={() => fileInput.current?.click()}
          disabled={busy}
          className="rounded border px-3 py-1.5 text-sm disabled:opacity-50"
        >
          {designFile ? "Change file" : "Upload plans"}
        </button>
        {designFile ? (
          <>
            <span className="truncate">{designFile.name}</span>
            <button
              onClick={() => {
                setDesignFile(null);
                if (fileInput.current) fileInput.current.value = "";
              }}
              disabled={busy}
              className="text-xs text-neutral-500 underline"
            >
              remove
            </button>
          </>
        ) : (
          <span className="text-xs text-neutral-500">PDF or image — floor plan, elevations, and ideally a site plan</span>
        )}
      </div>
      {step === "design" && <p className="mt-2 text-xs text-neutral-500">Reading the drawings can take up to a minute.</p>}
      {error && <p className="mt-2 text-sm text-red-600">{error}</p>}

      <div className="mt-8 grid grid-cols-1 gap-6 lg:grid-cols-[2fr_1fr]">
        <div className="rounded border p-4">
          {record ? (
            <div className="space-y-6">
              {designError && <p className="text-sm text-red-600">Design check: {designError}</p>}
              {designResult && <DesignCheckResults result={designResult} />}
              <ReportView record={record} designResult={designResult} />
            </div>
          ) : (
            <p className="text-sm text-neutral-500">
              Enter an address above (and optionally upload your house plans), then run the assessment to see the report.
            </p>
          )}
        </div>
        <div className="h-[600px]">
          <ChatPanel record={record} />
        </div>
      </div>
    </div>
  );
}
