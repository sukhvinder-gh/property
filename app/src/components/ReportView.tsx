import dynamic from "next/dynamic";
import type { AssessmentRecord } from "@/types/assessment";
import type { DesignCheckResult } from "@/lib/design-check/schema";
import { ApprovalChecklist } from "@/components/ApprovalChecklist";
import { footingIndicator } from "@/lib/pipeline/soil-footing-indicator";
import { FinancialFeasibilityCalculator } from "@/components/FinancialFeasibilityCalculator";

// Hidden for now; flip to true to bring the calculator back.
const SHOW_FINANCIAL_CALCULATOR = false;

const MassingView = dynamic(() => import("@/components/MassingView").then((m) => m.MassingView), {
  ssr: false,
  loading: () => <div className="flex h-80 items-center justify-center rounded border bg-neutral-50 text-sm text-neutral-500">Loading 3D view…</div>,
});

function bandLabel(record: AssessmentRecord) {
  const { score } = record;
  if (!score.isBanded) return `${score.score} — ${score.bandLow}`;
  return score.bandLow === score.bandHigh ? score.bandLow : `${score.bandHigh}–${score.bandLow}`;
}

function feasibilityLabel(rating: string) {
  if (rating === "yes") return "✅ Yes";
  if (rating === "no") return "❌ No";
  return "❔ Insufficient data";
}

function recommendationLabel(recommendation: string) {
  switch (recommendation) {
    case "proceed":
      return "Proceed";
    case "proceed_with_changes":
      return "Proceed with changes";
    case "do_not_proceed":
      return "Do not proceed";
    default:
      return "Insufficient data";
  }
}

const titleCase = (s: string) => s.toLowerCase().replace(/\b[a-z]/g, (c) => c.toUpperCase());

function bandStyle(band: string) {
  if (band === "Strong") return "border-emerald-200 bg-emerald-50 text-emerald-800";
  if (band === "Viable") return "border-sky-200 bg-sky-50 text-sky-800";
  if (band === "Marginal") return "border-amber-200 bg-amber-50 text-amber-800";
  return "border-red-200 bg-red-50 text-red-800";
}

const fmtPts = (n: number) => String(Math.round(n * 10) / 10);

/** Line-by-line breakdown of how the approval-likelihood score is built (stage6-scoring.ts). */
function ScoreBreakdown({ score }: { score: AssessmentRecord["score"] }) {
  const total = score.factors.reduce((s, f) => s + f.contribution, 0);
  const available = score.factors.reduce((s, f) => s + f.weight, 0);
  const scaled = available > 0 && available < 100;
  return (
    <div className="mt-5 border-t border-slate-100 pt-4">
      <h4 className="font-semibold text-brand-900">How the score is calculated</h4>
      <p className="text-xs text-neutral-600">
        Each factor has a maximum number of points; the site earns some or all of them. The score is the sum.
      </p>
      <div className="mt-2 overflow-x-auto">
        <table className="w-full border-collapse text-xs">
          <thead>
            <tr className="border-b text-left">
              <th className="py-1 pr-2">Factor</th>
              <th className="py-1 pr-2 text-right">Max</th>
              <th className="py-1 pr-2 text-right">Scored</th>
              <th className="py-1 pr-2 text-right">Lost</th>
              <th className="py-1 pr-2">Why</th>
            </tr>
          </thead>
          <tbody>
            {score.factors.map((f) => (
              <tr key={f.factor} className="border-b align-top">
                <td className="py-1 pr-2">{f.factor}</td>
                <td className="py-1 pr-2 text-right">{fmtPts(f.weight)}</td>
                <td className="py-1 pr-2 text-right font-medium">{fmtPts(f.contribution)}</td>
                <td className={`py-1 pr-2 text-right ${f.weight - f.contribution > 0 ? "text-red-700" : "text-neutral-400"}`}>
                  {f.weight - f.contribution > 0 ? `−${fmtPts(f.weight - f.contribution)}` : "0"}
                </td>
                <td className="py-1 pr-2 text-neutral-700">{f.note}</td>
              </tr>
            ))}
            <tr className="font-semibold">
              <td className="py-1 pr-2">Total</td>
              <td className="py-1 pr-2 text-right">{fmtPts(available)}</td>
              <td className="py-1 pr-2 text-right">{fmtPts(total)}</td>
              <td className="py-1 pr-2 text-right text-red-700">−{fmtPts(available - total)}</td>
              <td className="py-1 pr-2 font-normal text-neutral-700">
                {score.isBanded
                  ? `Data-thin council — shown as a band (${score.bandHigh}–${score.bandLow}) rather than a point score.`
                  : scaled
                    ? `${fmtPts(total)} of ${fmtPts(available)} assessable points = ${score.score}/100 → ${score.bandLow}.`
                    : `${score.score}/100 → ${score.bandLow}.`}
                {score.capNote && ` ${score.capNote}`}
              </td>
            </tr>
          </tbody>
        </table>
      </div>
      {scaled && (
        <p className="mt-1 text-xs text-neutral-600">
          Only {fmtPts(available)} points could be assessed here — the council approval-rate factor is reduced or
          left out when live approval data is thin or unavailable — so the score is scaled to 100 from those points.
          Missing data doesn&apos;t count against the site.
        </p>
      )}
      <p className="mt-1 text-xs text-neutral-600">
        Bands: Strong 75–100 · Viable 50–74 · Marginal 30–49 · Unlikely below 30.
      </p>
    </div>
  );
}

export function ReportView({ record, designResult }: { record: AssessmentRecord; designResult?: DesignCheckResult | null }) {
  const { siteProfile, planningControls, constraints, buildableEnvelope, pathway, score } = record;
  // A wholly unresolved address has no lot/DP at all — distinct from an
  // LGA name specifically missing from one layer's attributes (e.g. some
  // SEPP-precinct-zoned parcels don't carry LGA_NAME) while the address
  // otherwise resolved fine.
  const isUnresolvedAddress = siteProfile.lotDp === null && siteProfile.lotSizeSqm === null;
  const isLgaUnresolved = siteProfile.lga.toLowerCase().startsWith("unresolved");

  return (
    <div className="space-y-5 text-sm">
      <details className="rounded-lg border border-slate-200 bg-white px-4 py-2.5 text-xs text-slate-600">
        <summary className="cursor-pointer font-medium text-slate-700">
          About the data — live NSW sources, and what isn&apos;t covered yet
        </summary>
        <p className="mt-2">
          Site ID, zoning/FSR/height, heritage, biodiversity, bushfire, flood, acid sulfate soils, aircraft noise (ANEF),
          mine subsidence, Coastal Management SEPP areas, groundwater vulnerability, and salinity come from live NSW
          Spatial Services / ePlanning ArcGIS layers. Slope comes from the NSW 5m elevation model sampled across the
          lot and cross-checked against NSW contour mapping (much of it from the 1970s, before many suburbs were
          regraded). Soil and the indicative footing class come from regional soil mapping. Neither replaces a survey or a
          geotechnical report. Registered easements come from the NSW cadastre, and contamination from the NSW EPA list of
          notified contaminated sites (updated monthly). The EPA list only covers sites reported to the EPA, and sewer
          mains without a registered easement aren&apos;t on title, so confirm both via the Section 10.7 certificate and
          Sydney Water&apos;s Tap in service. Council approval history comes live from the Planning Portal&apos;s CDC and DA
          feeds; the public DA feed doesn&apos;t say whether a DA was approved or refused, so only CDC approval rates
          count towards the score.
        </p>
      </details>
      {isUnresolvedAddress && (
        <div className="rounded-lg border border-red-300 bg-red-50 px-4 py-2.5 text-xs text-red-900">
          This address could not be resolved against NSW property/cadastre data — every control and constraint below
          is an unverified unknown, not a real lookup. The low score reflects that unresolved zoning is treated as a
          hard gate, not an actual assessment of this property.
        </div>
      )}
      {!isUnresolvedAddress && isLgaUnresolved && (
        <div className="rounded-lg border border-amber-300 bg-amber-50 px-4 py-2.5 text-xs text-amber-900">
          The lot resolved correctly, but this parcel&apos;s zoning record didn&apos;t carry an LGA name (common for
          precinct/growth-centre SEPP-zoned land) — verify the council via a Section 10.7 certificate.
        </div>
      )}
      <header className="card">
        <div className="flex flex-col gap-5 sm:flex-row sm:items-start sm:justify-between">
          <div className="min-w-0">
            <p className="text-xs font-medium uppercase tracking-wide text-slate-500">Pre-approval feasibility report</p>
            <h2 className="mt-1 text-xl font-semibold tracking-tight text-brand-900">{siteProfile.address}</h2>
            <dl className="mt-3 grid grid-cols-2 gap-x-6 gap-y-2 text-xs sm:grid-cols-4">
              {[
                ["Lot / DP", siteProfile.lotDp ?? "Unknown"],
                ["Council", titleCase(siteProfile.councilName ?? siteProfile.lga)],
                ["Zone", planningControls.zone],
                ["Lot size", siteProfile.lotSizeSqm ? `${siteProfile.lotSizeSqm} m²` : "Unknown"],
              ].map(([k, v]) => (
                <div key={k}>
                  <dt className="text-slate-500">{k}</dt>
                  <dd className="font-medium text-slate-800">{v}</dd>
                </div>
              ))}
            </dl>
          </div>
          <div className={`shrink-0 rounded-xl border px-5 py-4 text-center ${bandStyle(score.bandLow)}`}>
            <div className="text-4xl font-semibold leading-none">
              {score.score ?? "—"}
              {score.score !== null && <span className="text-base font-normal opacity-60">/100</span>}
            </div>
            <div className="mt-1.5 text-sm font-medium">{score.isBanded ? bandLabel(record) : score.bandLow}</div>
            <div className="mt-2 inline-block rounded-full bg-white/70 px-2.5 py-0.5 text-xs font-medium uppercase tracking-wide">
              {pathway.pathway} pathway
            </div>
          </div>
        </div>
        <p className="mt-4 border-t border-slate-100 pt-3 text-sm text-slate-700">
          <span className="font-medium text-slate-900">Recommendation:</span>{" "}
          {recommendationLabel(record.feasibilitySummary.recommendation)} — overall risk{" "}
          {record.feasibilitySummary.overallRiskRating}.
        </p>
        {siteProfile.indicativeOnly && (
          <p className="mt-1 text-xs text-amber-700">Indicative only — lot dimensions or registration not fully confirmed.</p>
        )}
      </header>

      <section className="card">
        <ApprovalChecklist record={record} design={designResult ?? null} />
        <p className="mt-3 text-xs text-slate-500">
          See how the score is calculated in the Feasibility summary at the end of the report.
        </p>
      </section>

      <section className="card">
        <h3 className="section-title">Site profile</h3>
        <ul className="mt-1 list-disc pl-5">
          <li>Lot/DP: {siteProfile.lotDp ?? "unregistered / unknown"}</li>
          <li>LGA: {siteProfile.lga}</li>
          <li>
            EPI: {siteProfile.epiName} {siteProfile.epiAmendmentDate ? `(amended ${siteProfile.epiAmendmentDate})` : ""}
          </li>
          <li>
            Lot size: {siteProfile.lotSizeSqm ?? "unknown"} m² · Frontage: {siteProfile.frontageM ?? "unknown"} m · Depth:{" "}
            {siteProfile.depthM ?? "unknown"} m
          </li>
          <li>Registration: {siteProfile.registrationStatus}</li>
          <li>
            Slope: {siteProfile.slopeClass ?? "unknown"} ({siteProfile.slopePercent ?? "?"}%)
            {siteProfile.slopeFallM != null && ` — falls ~${siteProfile.slopeFallM}m across the lot`}
          </li>
          <li>
            Soil type: {siteProfile.soilType ? `${siteProfile.soilType} (${siteProfile.soilTypeCode})` : "not mapped"}
            {footingIndicator(siteProfile.soilTypeCode)
              ? ` — ${footingIndicator(siteProfile.soilTypeCode)!.summary}; indicative site class ${footingIndicator(siteProfile.soilTypeCode)!.range}`
              : ""}{" "}
            (regional mapping, not a geotechnical result)
          </li>
          <li>Council tier: {siteProfile.councilTier.replace(/_/g, " ")}</li>
        </ul>
      </section>

      <section className="card">
        <h3 className="section-title">Planning controls</h3>
        <ul className="mt-1 list-disc pl-5">
          <li>
            Zone: {planningControls.zone} — {planningControls.zoneDescription}
          </li>
          <li>Min lot size: {planningControls.minLotSizeSqm ?? "verify via Planning Portal"} m²</li>
          <li>FSR: {planningControls.fsr ?? "verify via Planning Portal"}</li>
          <li>Height of buildings: {planningControls.heightOfBuildingM ?? "verify via Planning Portal"} m</li>
          <li>Heritage item: {planningControls.heritageItem ? "yes" : "no"}</li>
          <li>Heritage conservation area: {planningControls.heritageConservationArea ? "yes" : "no"}</li>
          {planningControls.heritageListing && <li>Heritage listing: {planningControls.heritageListing}</li>}
          {planningControls.precinct && <li>Precinct: {planningControls.precinct}</li>}
          {planningControls.greenfieldHousingCodeArea && (
            <li>Greenfield Housing Code area (Codes SEPP Part 3C) — CDCs here use the Greenfield code&apos;s standards</li>
          )}
          {(planningControls.localProvisions ?? []).map((p, i) => (
            <li key={i}>
              {p.name}: {p.value}
              {p.clause ? ` (${p.clause})` : ""}
            </li>
          ))}
        </ul>
        {planningControls.legislationUrl && (
          <p className="mt-1 text-xs text-neutral-600">
            Governing instrument:{" "}
            <a href={planningControls.legislationUrl} target="_blank" rel="noreferrer" className="underline">
              {siteProfile.epiName}
            </a>{" "}
            — its Land Use Table is the legal word on what&apos;s permitted in this zone.
          </p>
        )}
      </section>

      <section className="card">
        <h3 className="section-title">Council controls</h3>
        <ul className="mt-1 list-disc pl-5">
          <li>LEP: {record.councilControls.lepName}</li>
          <li>
            DCP:{" "}
            {planningControls.dcp?.url ? (
              <a href={planningControls.dcp.url} target="_blank" rel="noreferrer" className="underline">
                {planningControls.dcp.name}
              </a>
            ) : (
              (record.councilControls.dcpName ?? "Not found — locate via the council website")
            )}
          </li>
          <li>Heritage: {record.councilControls.heritage}</li>
          <li>Character &amp; streetscape: {record.councilControls.characterAndStreetscape}</li>
          <li>Tree preservation: {record.councilControls.treePreservation}</li>
          <li>Stormwater policy: {record.councilControls.stormwaterPolicy}</li>
          <li>View-sharing: {record.councilControls.viewSharing}</li>
        </ul>
      </section>

      <section className="card">
        <h3 className="section-title">Utilities &amp; services</h3>
        <ul className="mt-1 list-disc pl-5">
          <li>Electricity distributor: {record.utilities.electricityDistributor}</li>
          <li>{record.utilities.otherServicesNote}</li>
        </ul>
      </section>

      <section className="card">
        <h3 className="section-title">Access</h3>
        <ul className="mt-1 list-disc pl-5">
          <li>Driveway gradient: {record.access.drivewayGradient}</li>
          <li>Road frontage: {record.access.roadFrontage}</li>
          <li>Vehicle crossover: {record.access.vehicleCrossover}</li>
          <li>Waste &amp; construction access: {record.access.wasteAndConstructionAccess}</li>
        </ul>
      </section>

      <section className="card">
        <h3 className="section-title">Engineering</h3>
        <ul className="mt-1 list-disc pl-5">
          <li>Stormwater concept: {record.engineering.stormwaterConcept}</li>
          <li>Rainwater tank: {record.engineering.rainwaterTank}</li>
          <li>Retaining walls: {record.engineering.retainingWalls}</li>
          <li>Cut &amp; fill: {record.engineering.cutAndFill}</li>
          <li>Basement feasibility: {record.engineering.basementFeasibility}</li>
          <li>Structural feasibility: {record.engineering.structuralFeasibility}</li>
        </ul>
      </section>

      <section className="card">
        <h3 className="section-title">Environmental</h3>
        <ul className="mt-1 list-disc pl-5">
          <li>BASIX &amp; NatHERS: {record.environmental.basixAndNatHers}</li>
          <li>Solar access: {record.environmental.solarAccess}</li>
          <li>Overshadowing &amp; privacy: {record.environmental.overshadowingAndPrivacy}</li>
          <li>Acoustic requirements: {record.environmental.acousticRequirements}</li>
        </ul>
      </section>

      <section className="card">
        <h3 className="section-title">Construction feasibility</h3>
        <ul className="mt-1 list-disc pl-5">
          <li>Site access for machinery: {record.constructionFeasibility.siteAccessForMachinery}</li>
          <li>Crane requirements: {record.constructionFeasibility.craneRequirements}</li>
          <li>Material storage: {record.constructionFeasibility.materialStorage}</li>
          <li>Neighbour protection: {record.constructionFeasibility.neighbourProtection}</li>
          <li>Temporary fencing: {record.constructionFeasibility.temporaryFencing}</li>
          <li>Existing retaining walls &amp; demolition: {record.constructionFeasibility.existingRetainingWallsAndDemolition}</li>
        </ul>
      </section>

      <section className="card">
        <h3 className="section-title">Cost assessment</h3>
        <ul className="mt-1 list-disc pl-5">
          <li>Land value &amp; construction: {record.costAssessment.landValueAndConstruction}</li>
          <li>Site-specific cost drivers: {record.costAssessment.siteSpecificCostDrivers}</li>
          <li>Statutory fees &amp; levies: {record.costAssessment.statutoryFeesAndLevies}</li>
          <li>Contingency: {record.costAssessment.contingency}</li>
        </ul>
      </section>

      <section className="card">
        <h3 className="section-title">What you can likely build</h3>
        {record.developmentPotential.permittedUses.list.length > 0 && (
          <div className="mt-1 text-sm">
            <p>
              Permitted uses for zone {planningControls.zone} ({record.developmentPotential.permittedUses.source}):
            </p>
            <ul className="mt-1 list-disc pl-5">
              {record.developmentPotential.permittedUses.list.map((u, i) => (
                <li key={i}>{u}</li>
              ))}
            </ul>
            <p className="mt-1 text-xs text-neutral-600">{record.developmentPotential.permittedUses.note}</p>
          </div>
        )}
        <ul className="mt-2 list-disc pl-5">
          <li>
            New dwelling house:{" "}
            {record.developmentPotential.newDwellingHouse.eligible === null
              ? "insufficient data"
              : record.developmentPotential.newDwellingHouse.eligible
                ? "likely eligible"
                : "unlikely eligible"}{" "}
            — {record.developmentPotential.newDwellingHouse.reasoning}
          </li>
          <li>
            Secondary dwelling (granny flat):{" "}
            {record.developmentPotential.secondaryDwelling.eligible === null
              ? "insufficient data"
              : record.developmentPotential.secondaryDwelling.eligible
                ? "likely eligible"
                : "unlikely eligible"}{" "}
            — {record.developmentPotential.secondaryDwelling.reasoning}
          </li>
          <li>
            Dual occupancy:{" "}
            {record.developmentPotential.dualOccupancy.likelyPermitted === null
              ? "requires council-specific check"
              : record.developmentPotential.dualOccupancy.likelyPermitted
                ? "likely eligible"
                : "unlikely eligible"}{" "}
            — {record.developmentPotential.dualOccupancy.reasoning}
          </li>
          <li>
            Subdivision:{" "}
            {record.developmentPotential.subdivision.potentialLots === null
              ? "insufficient data"
              : `~${record.developmentPotential.subdivision.potentialLots} lot(s) at the LEP minimum`}{" "}
            — {record.developmentPotential.subdivision.reasoning}
          </li>
        </ul>
      </section>

      <section className="card">
        <h3 className="section-title">Buildable envelope</h3>
        {buildableEnvelope.envelopeAreaSqm !== null ? (
          <p className="mt-1">
            ~{buildableEnvelope.envelopeAreaSqm} m² ({buildableEnvelope.envelopeWidthM}m × {buildableEnvelope.envelopeDepthM}m)
          </p>
        ) : (
          <p className="mt-1 text-amber-700">Cannot compute — lot dimensions unconfirmed.</p>
        )}
        {buildableEnvelope.targetFootprintFit && (
          <p className="mt-1">
            Target ({buildableEnvelope.targetFootprintFit.targetDescription}):{" "}
            {buildableEnvelope.targetFootprintFit.fits ? "fits" : "does not fit"} — margin{" "}
            {buildableEnvelope.targetFootprintFit.marginSqm} m²
          </p>
        )}
        <ul className="mt-1 list-disc pl-5 text-xs text-neutral-600">
          {buildableEnvelope.assumptions.map((a, i) => (
            <li key={i}>{a}</li>
          ))}
        </ul>
      </section>

      <section className="card">
        <h3 className="section-title">3D massing (indicative)</h3>
        <MassingView record={record} />
      </section>

      <section className="card">
        <h3 className="section-title">Constraints</h3>
        <table className="mt-1 w-full border-collapse text-left text-xs">
          <thead>
            <tr className="border-b">
              <th className="py-1 pr-2">Constraint</th>
              <th className="py-1 pr-2">Present</th>
              <th className="py-1 pr-2">Classification</th>
              <th className="py-1">Rationale</th>
            </tr>
          </thead>
          <tbody>
            {constraints.map((c) => (
              <tr key={c.name} className="border-b align-top">
                <td className="py-1 pr-2 font-medium">{c.name}</td>
                <td className="py-1 pr-2">{c.present ? "yes" : "no"}</td>
                <td className="py-1 pr-2">{c.classification}</td>
                <td className="py-1">{c.rationale}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>

      <section className="card">
        <h3 className="section-title">Site cost signals</h3>
        <ul className="mt-1 list-disc pl-5">
          {record.costSignals.map((c, i) => (
            <li key={i}>{c}</li>
          ))}
        </ul>
      </section>

      {SHOW_FINANCIAL_CALCULATOR && <FinancialFeasibilityCalculator />}

      <section className="card">
        <h3 className="section-title">Approval pathway & timeline</h3>
        <p className="mt-1">{pathway.reasoning}</p>
        <p className="mt-1">Indicative timeline: {pathway.indicativeTimelineDays}</p>
        {pathway.cdcExclusionTriggers.length > 0 && (
          <ul className="mt-1 list-disc pl-5">
            {pathway.cdcExclusionTriggers.map((t, i) => (
              <li key={i}>{t}</li>
            ))}
          </ul>
        )}
      </section>

      <section className="card">
        <h3 className="section-title">Approval strategy</h3>
        <ul className="mt-1 list-disc pl-5">
          <li>Consent authority: {record.approvalStrategy.consentAuthority}</li>
          <li>Integrated/concurrent approvals: {record.approvalStrategy.integratedApprovals}</li>
          <li>Pre-DA consultation: {record.approvalStrategy.preDaConsultation}</li>
          <li>Review &amp; appeal rights: {record.approvalStrategy.reviewAndAppealRights}</li>
        </ul>
      </section>

      <section className="card">
        <h3 className="section-title">Approval likelihood — top drivers</h3>
        <ul className="mt-1 list-disc pl-5">
          {score.topDrivers.map((d, i) => (
            <li key={i}>{d}</li>
          ))}
        </ul>
      </section>

      <section className="card">
        <h3 className="section-title">Document checklist</h3>
        <ul className="mt-1 list-disc pl-5">
          {record.documentChecklist.map((d, i) => (
            <li key={i}>{d}</li>
          ))}
        </ul>
      </section>

      <section className="card">
        <h3 className="section-title">Risks & unknowns</h3>
        <ul className="mt-1 list-disc pl-5">
          {record.risksAndUnknowns.map((r, i) => (
            <li key={i}>{r}</li>
          ))}
        </ul>
      </section>

      <section className="card">
        <h3 className="section-title">Risk register</h3>
        {record.riskRegister.length === 0 ? (
          <p className="mt-1 text-neutral-600">
            No material risks identified from the checks run — this does not mean the site is risk-free, only that no red
            flags were found in the data sources checked.
          </p>
        ) : (
          <table className="mt-1 w-full border-collapse text-left text-xs">
            <thead>
              <tr className="border-b">
                <th className="py-1 pr-2">Risk</th>
                <th className="py-1 pr-2">Impact</th>
                <th className="py-1">Mitigation</th>
              </tr>
            </thead>
            <tbody>
              {record.riskRegister.map((r, i) => (
                <tr key={i} className="border-b align-top">
                  <td className="py-1 pr-2 font-medium">{r.risk}</td>
                  <td className="py-1 pr-2 capitalize">{r.impact}</td>
                  <td className="py-1">{r.mitigation}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>

      <section className="card">
        <h3 className="section-title">Next steps</h3>
        <ol className="mt-1 list-decimal pl-5">
          {record.nextSteps.map((s, i) => (
            <li key={i}>{s}</li>
          ))}
        </ol>
      </section>

      <section className="card">
        <h3 className="section-title">Feasibility summary</h3>
        <ul className="mt-1 list-disc pl-5">
          <li>Planning feasibility: {feasibilityLabel(record.feasibilitySummary.planningFeasibility)}</li>
          <li>Engineering feasibility: {feasibilityLabel(record.feasibilitySummary.engineeringFeasibility)}</li>
          <li>Construction feasibility: {feasibilityLabel(record.feasibilitySummary.constructionFeasibility)}</li>
          <li>Financial feasibility: {feasibilityLabel(record.feasibilitySummary.financialFeasibility)}</li>
        </ul>
        <p className="mt-2">
          <span className="font-medium">Overall risk rating:</span> {record.feasibilitySummary.overallRiskRating}
        </p>
        <p className="mt-1">
          <span className="font-medium">Recommendation:</span> {recommendationLabel(record.feasibilitySummary.recommendation)}
        </p>
        <p className="mt-1 text-neutral-700">{record.feasibilitySummary.reasoning}</p>
        <ScoreBreakdown score={score} />
      </section>

      <p className="px-1 text-xs text-slate-500">
        Not legal or planning advice. Planning controls change — verify current figures against the LEP, Codes SEPP, and
        NSW Planning Portal, or via a Section 10.7 planning certificate, before making a purchase or build decision.
      </p>
    </div>
  );
}
