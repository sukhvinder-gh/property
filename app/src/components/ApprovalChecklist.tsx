import type { DesignCheckResult } from "@/lib/design-check/schema";
import { buildRows, type Status } from "@/lib/approval-checklist";
import type { AssessmentRecord } from "@/types/assessment";

const STATUS: Record<Status, { icon: string; label: string; className: string }> = {
  pass: { icon: "✅", label: "Met", className: "text-green-700" },
  fail: { icon: "❌", label: "Not met", className: "text-red-700" },
  warn: { icon: "⚠️", label: "Extra step", className: "text-amber-700" },
  unknown: { icon: "❔", label: "To verify", className: "text-neutral-500" },
  points: { icon: "➖", label: "Points lost", className: "text-neutral-600" },
};

export function ApprovalChecklist({ record, design }: { record: AssessmentRecord; design: DesignCheckResult | null }) {
  const rows = buildRows(record, design);
  const count = (s: Status) => rows.filter((r) => r.status === s).length;
  const groups = [...new Set(rows.map((r) => r.group))];

  return (
    <div>
      <h3 className="font-semibold">Approval checklist — everything checked</h3>
      <p className="text-xs text-neutral-600">
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
                <td colSpan={3} className="pt-3 pb-1 font-semibold text-neutral-800">
                  {g}
                </td>
              </tr>
              {rows
                .filter((r) => r.group === g)
                .map((r, i) => (
                  <tr key={`${g}-${i}`} className="border-b align-top">
                    <td className="py-1 pr-2">{r.requirement}</td>
                    <td className={`whitespace-nowrap py-1 pr-2 ${STATUS[r.status].className}`}>
                      {STATUS[r.status].icon} {STATUS[r.status].label}
                    </td>
                    <td className="py-1 pr-2 text-neutral-700">{r.detail}</td>
                  </tr>
                ))}
            </tbody>
          ))}
        </table>
      </div>
    </div>
  );
}
