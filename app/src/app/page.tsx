"use client";

import { useEffect, useRef, useState } from "react";
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
  // Usage logging: a random id per browser tab (groups one visit's searches),
  // and whether the current address text came from an autocomplete pick.
  const sessionId = useRef<string>("");
  const pickedAddress = useRef<string | null>(null);
  useEffect(() => {
    try {
      sessionId.current = sessionStorage.getItem("pw-session") ?? crypto.randomUUID();
      sessionStorage.setItem("pw-session", sessionId.current);
    } catch {
      sessionId.current = crypto.randomUUID();
    }
  }, []);

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
          body: JSON.stringify({
            address,
            sessionId: sessionId.current || undefined,
            source: pickedAddress.current === address ? "autocomplete" : "typed",
          }),
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
        setDesignResult(await checkDesignFile(designFile, current, sessionId.current || undefined));
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
    <div className="flex min-h-screen flex-col">
      <nav className="bg-brand-900 text-white">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-4 py-3 sm:px-6">
          <div className="flex items-center gap-2.5">
            <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-accent-500 text-sm font-bold">P</span>
            <span className="font-semibold tracking-tight">Property Pre-Approval Engine</span>
          </div>
          <span className="rounded-full border border-white/20 px-2.5 py-0.5 text-xs text-white/80">NSW</span>
        </div>
      </nav>

      <header className="bg-gradient-to-b from-brand-900 to-brand-700 pb-16 pt-8 text-white">
        <div className="mx-auto max-w-6xl px-4 sm:px-6">
          <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">Can you build it? Find out before you buy.</h1>
          <p className="mt-2 max-w-2xl text-sm text-white/75">
            Instant pre-DA feasibility for any NSW address — zoning, controls, constraints, approval pathway and an
            approval-likelihood score, from live NSW Planning Portal data.
          </p>
        </div>
      </header>

      <main className="mx-auto -mt-10 w-full max-w-6xl flex-1 px-4 pb-12 sm:px-6">
        <div className="card">
          <label className="text-xs font-medium uppercase tracking-wide text-slate-500">Property address</label>
          <div className="mt-2 flex flex-col gap-2 sm:flex-row">
            <AddressAutocomplete
              className="w-full rounded-lg border border-slate-300 px-3.5 py-2.5 text-sm outline-none transition focus:border-brand-600 focus:ring-2 focus:ring-brand-100"
              placeholder="Start typing an address, e.g. 60 Oakhill Drive, Castle Hill"
              value={address}
              onChange={setAddress}
              onSelect={(picked) => (pickedAddress.current = picked)}
              onSubmit={run}
            />
            <button
              onClick={run}
              disabled={busy || !address.trim()}
              className="shrink-0 rounded-lg bg-accent-500 px-5 py-2.5 text-sm font-medium text-white shadow-sm transition hover:bg-accent-600 disabled:opacity-50"
            >
              {buttonLabel}
            </button>
          </div>

          <div className="mt-4 flex flex-wrap items-center gap-2 border-t border-slate-100 pt-4 text-sm">
            <span className="text-slate-600">House design (optional)</span>
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
              className="rounded-lg border border-slate-300 px-3 py-1.5 text-sm text-slate-700 transition hover:bg-slate-50 disabled:opacity-50"
            >
              {designFile ? "Change file" : "Upload plans"}
            </button>
            {designFile ? (
              <>
                <span className="truncate text-slate-700">{designFile.name}</span>
                <button
                  onClick={() => {
                    setDesignFile(null);
                    if (fileInput.current) fileInput.current.value = "";
                  }}
                  disabled={busy}
                  className="text-xs text-slate-500 underline"
                >
                  remove
                </button>
              </>
            ) : (
              <span className="text-xs text-slate-500">PDF or image — floor plan, elevations, and ideally a site plan</span>
            )}
          </div>
          {busy && (
            <p className="mt-3 flex items-center gap-2 text-sm text-brand-700">
              <span className="h-4 w-4 animate-spin rounded-full border-2 border-brand-100 border-t-brand-600" />
              {step === "design" ? "Reading the drawings — this can take up to a minute." : "Checking live NSW planning data…"}
            </p>
          )}
          {error && <p className="mt-3 text-sm text-red-600">{error}</p>}
        </div>

        <div className="mt-6 grid grid-cols-1 gap-6 lg:grid-cols-[2fr_1fr]">
          <div className="min-w-0">
            {record ? (
              <div className="space-y-5">
                {designError && <p className="card text-sm text-red-600">Design check: {designError}</p>}
                {designResult && <DesignCheckResults result={designResult} />}
                <ReportView record={record} designResult={designResult} />
              </div>
            ) : (
              <div className="card">
                <h2 className="section-title">How it works</h2>
                <ol className="grid gap-4 text-sm sm:grid-cols-3">
                  {[
                    ["1", "Enter an address", "Pick from the NSW property register so the right lot is matched."],
                    ["2", "We check the controls", "Zoning, lot size, FSR, height, heritage, bushfire, flood and more — live."],
                    ["3", "Get your report", "Approval checklist, pathway (CDC or DA), score and next steps."],
                  ].map(([n, title, text]) => (
                    <li key={n} className="rounded-lg bg-slate-50 p-4">
                      <span className="flex h-7 w-7 items-center justify-center rounded-full bg-brand-100 text-xs font-semibold text-brand-700">
                        {n}
                      </span>
                      <p className="mt-2 font-medium text-slate-800">{title}</p>
                      <p className="mt-1 text-slate-600">{text}</p>
                    </li>
                  ))}
                </ol>
              </div>
            )}
          </div>
          <div className="h-[600px] lg:sticky lg:top-6">
            <ChatPanel record={record} />
          </div>
        </div>
      </main>

      <footer className="border-t border-slate-200 bg-white">
        <div className="mx-auto max-w-6xl px-4 py-5 text-xs text-slate-500 sm:px-6">
          Indicative only — not legal or planning advice. Verify with a Section 10.7 planning certificate before buying or
          building.
        </div>
      </footer>
    </div>
  );
}
