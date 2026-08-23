"use client";

import { useState } from "react";
import { ReportView } from "@/components/ReportView";
import { ChatPanel } from "@/components/ChatPanel";
import { AddressAutocomplete } from "@/components/AddressAutocomplete";
import type { AssessmentRecord } from "@/types/assessment";

export default function Home() {
  const [address, setAddress] = useState("");
  const [record, setRecord] = useState<AssessmentRecord | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function runAssessment() {
    if (!address.trim()) return;
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/assess", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ address }),
      });
      if (!res.ok) throw new Error(`Assessment failed (${res.status})`);
      const data = await res.json();
      setRecord(data.record);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Assessment failed");
    } finally {
      setLoading(false);
    }
  }

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
          onSubmit={runAssessment}
        />
        <button
          onClick={runAssessment}
          disabled={loading}
          className="rounded bg-neutral-800 px-4 py-2 text-sm text-white disabled:opacity-50"
        >
          {loading ? "Assessing…" : "Run assessment"}
        </button>
      </div>
      {error && <p className="mt-2 text-sm text-red-600">{error}</p>}

      <div className="mt-8 grid grid-cols-1 gap-6 lg:grid-cols-[2fr_1fr]">
        <div className="rounded border p-4">
          {record ? (
            <ReportView record={record} />
          ) : (
            <p className="text-sm text-neutral-500">Enter an address above and run an assessment to see the report.</p>
          )}
        </div>
        <div className="h-[600px]">
          <ChatPanel record={record} />
        </div>
      </div>
    </div>
  );
}
