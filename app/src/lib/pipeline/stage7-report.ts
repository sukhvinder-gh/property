import type { BuildableEnvelope, Constraint, Pathway, SiteProfile } from "@/types/assessment";

export function buildCostSignals(constraints: Constraint[], siteProfile: SiteProfile): string[] {
  const signals: string[] = [];
  for (const c of constraints) {
    if (!c.present) continue;
    if (c.name.startsWith("Topography") && siteProfile.slopeClass === "steep") {
      signals.push("Slope: retaining walls and/or split-level design likely required.");
    } else if (c.name.startsWith("Topography") && siteProfile.slopeClass === "moderate") {
      signals.push("Slope: cut/fill or a drop-edge slab likely required.");
    } else if (c.name.startsWith("Flood")) {
      signals.push("Flood: raised floor levels and/or on-site detention (OSD) likely required.");
    } else if (c.name.startsWith("Bushfire")) {
      signals.push("Bushfire: BAL-rated construction upgrades likely required.");
    } else if (c.name.startsWith("Sewer")) {
      signals.push("Services: build-over-sewer approval and possible footprint relocation.");
    } else if (c.name.startsWith("Acid sulfate")) {
      signals.push("Soil: acid sulfate soil management plan likely required for excavation.");
    } else if (c.name.startsWith("Contamination")) {
      signals.push("Contamination: remediation/validation likely required before consent.");
    }
  }
  signals.push("Demolition/tree removal: confirm via aerial imagery or site inspection — not assessed from spatial layers alone.");
  return signals;
}

export function buildDocumentChecklist(pathway: Pathway, constraints: Constraint[]): string[] {
  const docs = new Set<string>(["Survey plan (current, registered surveyor)"]);
  if (pathway.pathway === "da") {
    docs.add("Statement of Environmental Effects");
  }
  docs.add("BASIX certificate");
  if (constraints.find((c) => c.name.startsWith("Bushfire") && c.present)) {
    docs.add("Bushfire assessment / BAL report");
  }
  if (constraints.find((c) => c.name.startsWith("Flood") && c.present)) {
    docs.add("Flood study / flood impact assessment");
  }
  if (constraints.find((c) => c.name.startsWith("Topography") && c.present)) {
    docs.add("Arborist report (if tree removal required) and geotechnical/site classification report");
  }
  docs.add("Waste management plan");
  docs.add("Section 10.7 (planning certificate)");
  return Array.from(docs);
}

export function buildRisksAndUnknowns(
  siteProfile: SiteProfile,
  envelope: BuildableEnvelope,
  constraints: Constraint[]
): string[] {
  const risks: string[] = [];
  if (siteProfile.indicativeOnly) {
    risks.push("Lot dimensions not fully confirmed — this report is indicative only; verify via survey or s10.7 certificate.");
  }
  if (siteProfile.registrationStatus === "unregistered") {
    risks.push("Lot is unregistered — figures are subject to registration; a CDC generally cannot issue until then.");
  }
  if (siteProfile.lotSizeSqm !== null && siteProfile.lotSizeSqm > 2000) {
    risks.push(
      `Lot size (${siteProfile.lotSizeSqm} m²) is unusually large for a standard suburban assessment — in a new-estate context this often means the address is recorded against an unsubdivided parent "superlot" rather than the final individual allotment. Verify the actual house-block dimensions via the estate's registered plan of subdivision or a current title search before relying on this figure.`
    );
  }
  if (siteProfile.councilTier !== "profiled") {
    risks.push("Council is not deep-profiled in this engine — DCP compliance culture is unmodelled; verify strictness via a council pre-DA meeting.");
  }
  for (const a of envelope.assumptions) {
    risks.push(`Assumption: ${a}`);
  }
  const easementConstraint = constraints.find((c) => c.name.startsWith("Sewer"));
  if (easementConstraint?.present) {
    risks.push("Easement geometry sourced from a flag, not the parsed DP — confirm exact easement location and width from title documents.");
  }
  return risks;
}

export function buildNextSteps(pathway: Pathway, siteProfile: SiteProfile): string[] {
  const steps: string[] = [];
  if (siteProfile.registrationStatus === "unregistered") {
    steps.push("Confirm estimated registration date with the developer/estate agent.");
  }
  steps.push("Order a Section 10.7 (Planning Certificate) to confirm statutory controls currently in force.");
  steps.push("Engage a registered surveyor to confirm lot dimensions and easements.");
  if (pathway.pathway === "cdc") {
    steps.push("Engage a private certifier to confirm CDC eligibility against the current Codes SEPP.");
  } else {
    steps.push("Book a council pre-DA meeting to confirm DCP compliance expectations before lodging.");
  }
  steps.push("Commission any flagged specialist reports (bushfire, flood, geotechnical) identified in the document checklist.");
  return steps;
}
