import type { DesignCheckResult } from "@/lib/design-check/schema";
import { buildRows, type Status } from "@/lib/approval-checklist";
import type { AssessmentRecord } from "@/types/assessment";

const STATUS: Record<Status, { icon: string; label: string; className: string }> = {
  pass: { icon: "✓", label: "Met", className: "bg-emerald-50 text-emerald-700 ring-emerald-200" },
  fail: { icon: "✕", label: "Not met", className: "bg-red-50 text-red-700 ring-red-200" },
  warn: { icon: "!", label: "Extra step", className: "bg-amber-50 text-amber-800 ring-amber-200" },
  unknown: { icon: "?", label: "To verify", className: "bg-slate-50 text-slate-600 ring-slate-200" },
  points: { icon: "−", label: "Points lost", className: "bg-slate-50 text-slate-600 ring-slate-200" },
};

export function ApprovalChecklist({ record, design }: { record: AssessmentRecord; design: DesignCheckResult | null }) {
  const rows = buildRows(record, design);
  const count = (s: Status) => rows.filter((r) => r.status === s).length;
  const groups = [...new Set(rows.map((r) => r.group))];

  return (
    <div>
      <h3 className="section-title">Approval checklist — everything checked</h3>
      <p className="text-xs text-slate-500">
        {count("pass")} met · {count("fail")} not met · {count("warn")} need an extra step · {count("unknown")} to verify ·{" "}
        {count("points")} score factors short of full marks
        {design ? " · includes your uploaded design" : " · upload your plans to add design checks"}
      </p>
      <div className="mt-2 overflow-x-auto">
        <table className="w-full border-collapse text-xs">
          <thead>
            <tr className="border-b text-left">
              <th className="py-1 pr-2">Requirement</th>
              <th className="py-1 pr-2">Status</th>
              <th className="py-1 pr-2">Detail</th>
            </tr>
          </thead>
          {groups.map((g) => (
            <tbody key={g}>
              <tr>
                <td colSpan={3} className="pt-4 pb-1.5 text-[0.7rem] font-semibold uppercase tracking-wide text-brand-700">
                  {g}
                </td>
              </tr>
              {rows
                .filter((r) => r.group === g)
                .map((r, i) => (
                  <tr key={`${g}-${i}`} className="border-b align-top">
                    <td className="py-1 pr-2">{r.requirement}</td>
                    <td className="whitespace-nowrap py-1 pr-2">
                      <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[0.7rem] font-medium ring-1 ring-inset ${STATUS[r.status].className}`}>
                        <span aria-hidden>{STATUS[r.status].icon}</span> {STATUS[r.status].label}
                      </span>
                    </td>
                    <td className="py-1 pr-2 text-slate-600">{r.detail}</td>
                  </tr>
                ))}
            </tbody>
          ))}
        </table>
      </div>
    </div>
  );
}
