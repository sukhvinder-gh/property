"use client";

import { useMemo, useState } from "react";

type Mode = "margin" | "equity";

interface Inputs {
  grv: number;
  constructionCost: number;
  professionalFeesPct: number;
  statutoryFees: number;
  contingencyPct: number;
  sellingCostsPct: number;
  // margin mode
  targetMarginPct: number;
  financeCostsFlat: number;
  // equity mode
  loanToCostPct: number;
  interestRatePct: number;
  termMonths: number;
  targetEquityReturnPct: number;
}

const DEFAULTS: Inputs = {
  grv: 1200000,
  constructionCost: 450000,
  professionalFeesPct: 8,
  statutoryFees: 25000,
  contingencyPct: 5,
  sellingCostsPct: 3,
  targetMarginPct: 20,
  financeCostsFlat: 20000,
  loanToCostPct: 70,
  interestRatePct: 8,
  termMonths: 12,
  targetEquityReturnPct: 25,
};

function fmt(n: number): string {
  if (!Number.isFinite(n)) return "—";
  return n.toLocaleString("en-AU", { style: "currency", currency: "AUD", maximumFractionDigits: 0 });
}

function NumberField({
  label,
  value,
  onChange,
  suffix,
}: {
  label: string;
  value: number;
  onChange: (v: number) => void;
  suffix?: string;
}) {
  return (
    <label className="flex flex-col gap-1 text-xs">
      <span className="text-neutral-600">{label}</span>
      <div className="flex items-center gap-1">
        <input
          type="number"
          className="w-full rounded border px-2 py-1 text-sm"
          value={value}
          onChange={(e) => onChange(Number(e.target.value))}
        />
        {suffix && <span className="text-neutral-500">{suffix}</span>}
      </div>
    </label>
  );
}

/**
 * Reverse feasibility (residual land value) calculator. Every dollar figure
 * here comes from the user's own inputs, never invented — the pipeline's
 * live NSW data only ever produces qualitative cost-adder/documentation-adder
 * flags (see Site cost signals), consistent with SKILL.md's "never invent a
 * dollar estimate" rule. This is the "downstream module fed by those flags"
 * the docs anticipate.
 */
export function FinancialFeasibilityCalculator() {
  const [mode, setMode] = useState<Mode>("margin");
  const [inputs, setInputs] = useState<Inputs>(DEFAULTS);

  function set<K extends keyof Inputs>(key: K, value: number) {
    setInputs((prev) => ({ ...prev, [key]: value }));
  }

  const result = useMemo(() => {
    const buildCosts =
      inputs.constructionCost * (1 + inputs.professionalFeesPct / 100 + inputs.contingencyPct / 100) +
      inputs.statutoryFees;
    const sellingCosts = inputs.grv * (inputs.sellingCostsPct / 100);

    if (mode === "margin") {
      const profitTarget = inputs.grv * (inputs.targetMarginPct / 100);
      const residualLandValue = inputs.grv - buildCosts - inputs.financeCostsFlat - sellingCosts - profitTarget;
      return {
        residualLandValue,
        breakdown: [
          { label: "Construction + fees + contingency", value: buildCosts },
          { label: "Statutory/council fees", value: inputs.statutoryFees, included: true },
          { label: "Finance/holding costs", value: inputs.financeCostsFlat },
          { label: "Selling costs", value: sellingCosts },
          { label: `Target margin (${inputs.targetMarginPct}% of GRV)`, value: profitTarget },
        ],
      };
    }

    // Equity mode: solve L such that Profit / Equity = targetROI, where
    // Loan = LCR*(L+C), Equity = (1-LCR)*(L+C), Finance = Loan * (rate * term/12).
    const lcr = inputs.loanToCostPct / 100;
    const financeRate = (inputs.interestRatePct / 100) * (inputs.termMonths / 12);
    const targetRoi = inputs.targetEquityReturnPct / 100;
    const denominator = 1 + lcr * financeRate + targetRoi * (1 - lcr);
    const landPlusCost = (inputs.grv * (1 - inputs.sellingCostsPct / 100)) / denominator;
    const residualLandValue = landPlusCost - buildCosts;

    const totalCostExclFinance = landPlusCost;
    const loanAmount = lcr * totalCostExclFinance;
    const equity = (1 - lcr) * totalCostExclFinance;
    const financeCost = loanAmount * financeRate;
    const profit = inputs.grv - sellingCosts - totalCostExclFinance - financeCost;

    return {
      residualLandValue,
      breakdown: [
        { label: "Construction + fees + contingency + statutory", value: buildCosts },
        { label: `Loan amount (${inputs.loanToCostPct}% of land+cost)`, value: loanAmount },
        { label: `Equity required`, value: equity },
        { label: `Finance cost (${inputs.interestRatePct}% p.a. × ${inputs.termMonths}mo)`, value: financeCost },
        { label: "Selling costs", value: sellingCosts },
        { label: `Profit at target (${inputs.targetEquityReturnPct}% equity return)`, value: profit },
      ],
    };
  }, [mode, inputs]);

  return (
    <section className="rounded border px-3 py-2">
      <h3 className="font-semibold">Financial feasibility calculator</h3>
      <p className="mt-1 text-xs text-neutral-600">
        Every number here is your input, not a live lookup — this engine never invents dollar figures. Use the
        qualitative cost signals above to inform your construction/contingency assumptions, then work out the
        maximum land price this deal supports.
      </p>

      <div className="mt-3 flex gap-2 text-xs">
        <button
          className={`rounded px-3 py-1 ${mode === "margin" ? "bg-neutral-800 text-white" : "border"}`}
          onClick={() => setMode("margin")}
        >
          Target margin (% of GRV)
        </button>
        <button
          className={`rounded px-3 py-1 ${mode === "equity" ? "bg-neutral-800 text-white" : "border"}`}
          onClick={() => setMode("equity")}
        >
          Target equity return
        </button>
      </div>

      <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-3">
        <NumberField label="Gross Realisation Value (GRV)" value={inputs.grv} onChange={(v) => set("grv", v)} suffix="$" />
        <NumberField
          label="Construction cost"
          value={inputs.constructionCost}
          onChange={(v) => set("constructionCost", v)}
          suffix="$"
        />
        <NumberField
          label="Professional fees"
          value={inputs.professionalFeesPct}
          onChange={(v) => set("professionalFeesPct", v)}
          suffix="% of build"
        />
        <NumberField
          label="Statutory/council fees"
          value={inputs.statutoryFees}
          onChange={(v) => set("statutoryFees", v)}
          suffix="$"
        />
        <NumberField
          label="Contingency"
          value={inputs.contingencyPct}
          onChange={(v) => set("contingencyPct", v)}
          suffix="% of build"
        />
        <NumberField
          label="Selling costs"
          value={inputs.sellingCostsPct}
          onChange={(v) => set("sellingCostsPct", v)}
          suffix="% of GRV"
        />

        {mode === "margin" ? (
          <>
            <NumberField
              label="Target margin"
              value={inputs.targetMarginPct}
              onChange={(v) => set("targetMarginPct", v)}
              suffix="% of GRV"
            />
            <NumberField
              label="Finance/holding costs"
              value={inputs.financeCostsFlat}
              onChange={(v) => set("financeCostsFlat", v)}
              suffix="$"
            />
          </>
        ) : (
          <>
            <NumberField
              label="Loan-to-cost ratio"
              value={inputs.loanToCostPct}
              onChange={(v) => set("loanToCostPct", v)}
              suffix="%"
            />
            <NumberField
              label="Interest rate"
              value={inputs.interestRatePct}
              onChange={(v) => set("interestRatePct", v)}
              suffix="% p.a."
            />
            <NumberField label="Loan term" value={inputs.termMonths} onChange={(v) => set("termMonths", v)} suffix="months" />
            <NumberField
              label="Target equity return"
              value={inputs.targetEquityReturnPct}
              onChange={(v) => set("targetEquityReturnPct", v)}
              suffix="%"
            />
          </>
        )}
      </div>

      <div className="mt-4 rounded border bg-neutral-50 px-3 py-2">
        <p className="text-sm font-medium">
          Residual land value:{" "}
          <span className={result.residualLandValue < 0 ? "text-red-700" : "text-neutral-900"}>
            {fmt(result.residualLandValue)}
          </span>
        </p>
        {result.residualLandValue < 0 && (
          <p className="mt-1 text-xs text-red-700">
            Negative — these costs and target return don&apos;t leave room to pay for land at all. Revisit assumptions.
          </p>
        )}
        <ul className="mt-2 space-y-0.5 text-xs text-neutral-600">
          {result.breakdown.map((b, i) => (
            <li key={i} className="flex justify-between gap-4">
              <span>{b.label}</span>
              <span>{fmt(b.value)}</span>
            </li>
          ))}
        </ul>
      </div>

      <p className="mt-2 text-xs text-neutral-500">
        Simplified model: finance cost assumes interest-only on the full loan for the stated term, not a drawdown
        schedule. Not financial advice — verify with a quantity surveyor and your lender before committing to a
        price.
      </p>
    </section>
  );
}
