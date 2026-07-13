import dynamic from "next/dynamic";
import type { AssessmentRecord } from "@/types/assessment";

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

export function ReportView({ record }: { record: AssessmentRecord }) {
  const { siteProfile, planningControls, constraints, buildableEnvelope, pathway, score } = record;
  // A wholly unresolved address has no lot/DP at all — distinct from an
  // LGA name specifically missing from one layer's attributes (e.g. some
  // SEPP-precinct-zoned parcels don't carry LGA_NAME) while the address
  // otherwise resolved fine.
  const isUnresolvedAddress = siteProfile.lotDp === null && siteProfile.lotSizeSqm === null;
  const isLgaUnresolved = siteProfile.lga.toLowerCase().startsWith("unresolved");

  return (
    <div className="space-y-6 text-sm">
      <div className="rounded border border-amber-400 bg-amber-50 px-3 py-2 text-xs text-amber-900">
        <strong>Live NSW data (partial coverage).</strong> Site ID, zoning/FSR/height, heritage, biodiversity, bushfire,
        flood, acid sulfate soils, aircraft noise (ANEF), mine subsidence, Coastal Management SEPP areas, groundwater
        vulnerability, and salinity come from live NSW Spatial Services / ePlanning ArcGIS layers. Slope is a live
        estimate from a 5m-resolution elevation model, and soil type is a regional soil-landscape classification —
        neither is a substitute for a survey or geotechnical report. Contamination, sewer easements, and DA
        approval-rate history have no confirmed free live source yet and are honestly reported as unknown rather than
        guessed — see Risks &amp; unknowns below.
      </div>
      {isUnresolvedAddress && (
        <div className="rounded border border-red-400 bg-red-50 px-3 py-2 text-xs text-red-900">
          This address could not be resolved against NSW property/cadastre data — every control and constraint below
          is an unverified unknown, not a real lookup. The low score reflects that unresolved zoning is treated as a
          hard gate, not an actual assessment of this property.
        </div>
      )}
      {!isUnresolvedAddress && isLgaUnresolved && (
        <div className="rounded border border-amber-400 bg-amber-50 px-3 py-2 text-xs text-amber-900">
          The lot resolved correctly, but this parcel&apos;s zoning record didn&apos;t carry an LGA name (common for
          precinct/growth-centre SEPP-zoned land) — verify the council via a Section 10.7 certificate.
        </div>
      )}
      <header>
        <h2 className="text-lg font-semibold">Pre-Approval Feasibility Report — {siteProfile.address}</h2>
        <p className="mt-1">
          <span className="font-medium">Verdict:</span> {bandLabel(record)} — recommended pathway:{" "}
          <span className="uppercase">{pathway.pathway}</span>
        </p>
        {siteProfile.indicativeOnly && (
          <p className="mt-1 text-amber-700">Indicative only — lot dimensions or registration not fully confirmed.</p>
        )}
      </header>

      <section>
        <h3 className="font-semibold">Site profile</h3>
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
          </li>
          <li>
            Soil type: {siteProfile.soilType ? `${siteProfile.soilType} (${siteProfile.soilTypeCode})` : "not mapped"} —
            regional indicator only, not a geotechnical result
          </li>
          <li>Council tier: {siteProfile.councilTier.replace(/_/g, " ")}</li>
        </ul>
      </section>

      <section>
        <h3 className="font-semibold">Planning controls</h3>
        <ul className="mt-1 list-disc pl-5">
          <li>
            Zone: {planningControls.zone} — {planningControls.zoneDescription}
          </li>
          <li>Min lot size: {planningControls.minLotSizeSqm ?? "verify via Planning Portal"} m²</li>
          <li>FSR: {planningControls.fsr ?? "verify via Planning Portal"}</li>
          <li>Height of buildings: {planningControls.heightOfBuildingM ?? "verify via Planning Portal"} m</li>
          <li>Heritage item: {planningControls.heritageItem ? "yes" : "no"}</li>
          <li>Heritage conservation area: {planningControls.heritageConservationArea ? "yes" : "no"}</li>
        </ul>
      </section>

      <section>
        <h3 className="font-semibold">Council controls</h3>
        <ul className="mt-1 list-disc pl-5">
          <li>LEP: {record.councilControls.lepName}</li>
          <li>DCP: {record.councilControls.dcpName ?? "Not deep-profiled in this engine — locate via the council website"}</li>
          <li>Heritage: {record.councilControls.heritage}</li>
          <li>Character &amp; streetscape: {record.councilControls.characterAndStreetscape}</li>
          <li>Tree preservation: {record.councilControls.treePreservation}</li>
          <li>Stormwater policy: {record.councilControls.stormwaterPolicy}</li>
          <li>View-sharing: {record.councilControls.viewSharing}</li>
        </ul>
      </section>

      <section>
        <h3 className="font-semibold">Utilities &amp; services</h3>
        <ul className="mt-1 list-disc pl-5">
          <li>Electricity distributor: {record.utilities.electricityDistributor}</li>
          <li>{record.utilities.otherServicesNote}</li>
        </ul>
      </section>

      <section>
        <h3 className="font-semibold">Access</h3>
        <ul className="mt-1 list-disc pl-5">
          <li>Driveway gradient: {record.access.drivewayGradient}</li>
          <li>Road frontage: {record.access.roadFrontage}</li>
          <li>Vehicle crossover: {record.access.vehicleCrossover}</li>
          <li>Waste &amp; construction access: {record.access.wasteAndConstructionAccess}</li>
        </ul>
      </section>

      <section>
        <h3 className="font-semibold">What you can likely build</h3>
        <ul className="mt-1 list-disc pl-5">
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
            Dual occupancy: requires council-specific check — {record.developmentPotential.dualOccupancy.reasoning}
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

      <section>
        <h3 className="font-semibold">Buildable envelope</h3>
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

      <section>
        <h3 className="font-semibold">3D massing (indicative)</h3>
        <MassingView record={record} />
      </section>

      <section>
        <h3 className="font-semibold">Constraints</h3>
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

      <section>
        <h3 className="font-semibold">Site cost signals</h3>
        <ul className="mt-1 list-disc pl-5">
          {record.costSignals.map((c, i) => (
            <li key={i}>{c}</li>
          ))}
        </ul>
      </section>

      <section>
        <h3 className="font-semibold">Approval pathway & timeline</h3>
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

      <section>
        <h3 className="font-semibold">Approval likelihood — top drivers</h3>
        <ul className="mt-1 list-disc pl-5">
          {score.topDrivers.map((d, i) => (
            <li key={i}>{d}</li>
          ))}
        </ul>
      </section>

      <section>
        <h3 className="font-semibold">Document checklist</h3>
        <ul className="mt-1 list-disc pl-5">
          {record.documentChecklist.map((d, i) => (
            <li key={i}>{d}</li>
          ))}
        </ul>
      </section>

      <section>
        <h3 className="font-semibold">Risks & unknowns</h3>
        <ul className="mt-1 list-disc pl-5">
          {record.risksAndUnknowns.map((r, i) => (
            <li key={i}>{r}</li>
          ))}
        </ul>
      </section>

      <section>
        <h3 className="font-semibold">Risk register</h3>
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

      <section>
        <h3 className="font-semibold">Next steps</h3>
        <ol className="mt-1 list-decimal pl-5">
          {record.nextSteps.map((s, i) => (
            <li key={i}>{s}</li>
          ))}
        </ol>
      </section>

      <section className="rounded border px-3 py-2">
        <h3 className="font-semibold">Feasibility summary</h3>
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
      </section>

      <p className="border-t pt-3 text-xs text-neutral-500">
        Not legal or planning advice. Planning controls change — verify current figures against the LEP, Codes SEPP, and
        NSW Planning Portal, or via a Section 10.7 planning certificate, before making a purchase or build decision.
      </p>
    </div>
  );
}
