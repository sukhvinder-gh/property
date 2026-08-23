import {
  NEW_DWELLING_HOUSE_DEFAULT_MIN_LOT_SQM,
  NEW_DWELLING_HOUSE_MIN_WIDTH_M,
  SECONDARY_DWELLING_MIN_FRONTAGE_M,
  SECONDARY_DWELLING_MIN_LOT_SQM,
} from "@/lib/pipeline/codes-sepp-constants";
import type { CouncilProfile } from "@/lib/pipeline/council-profiles";
import { getElectricityDistributor, getWaterUtility } from "@/lib/pipeline/electricity-distributor";
import { STANDARD_ZONE_LAND_USE_TABLE } from "@/lib/pipeline/zone-land-use-table";
import type {
  AccessSummary,
  ApprovalStrategySummary,
  BuildableEnvelope,
  Constraint,
  ConstructionFeasibilitySummary,
  CostAssessmentSummary,
  CouncilControlsSummary,
  CouncilTier,
  DevelopmentPotential,
  EngineeringSummary,
  EnvironmentalSummary,
  FeasibilitySummary,
  Pathway,
  PlanningControls,
  RiskRegisterEntry,
  ScoreResult,
  SiteProfile,
  UtilitiesSummary,
} from "@/types/assessment";

// NSW Land and Soil Capability ratings run 1 (best/least limiting) to 8
// (worst/most limiting) — verified live 2026-07. 5+ is where the scheme's
// confirmed class names cross from "Moderate" into progressively lower
// capability; used here only as an "elevated limitation" threshold, not a
// specific (unverified) class label for 6-8.
const LSC_ELEVATED_THRESHOLD = 5;

// Statewide facts, true regardless of whether a deep council profile exists —
// see docs/property-pre-approval-engine research notes: Standard Instrument
// LEP cl 5.9 is present in nearly every NSW LEP, and view-sharing principles
// (Tenacity v Waverley) are practically only invoked by coastal/harbour councils.
const TREE_PRESERVATION_STATEWIDE_NOTE =
  "Nearly all NSW LEPs include Standard Instrument clause 5.9 \"Preservation of trees or vegetation\" (Standard Instrument (Local Environmental Plans) Order 2006), prohibiting ringbarking/cutting/removal of council-\"prescribed\" trees or vegetation without consent. The specific species/size/location thresholds that count as \"prescribed\" are set by each council's own DCP and are not uniform statewide.";

const VIEW_SHARING_GENERIC_NOTE =
  "View-sharing provisions (the planning principles from Tenacity v Waverley) are typically only invoked by coastal/harbour-foreshore councils assessing view-loss objections — not modelled per-council here; check the applicable council's DCP if the site has a significant view line.";

function heritageControlText(planningControls: PlanningControls): string {
  if (planningControls.heritageItem && planningControls.heritageConservationArea) {
    return "This lot is both a listed heritage item and within a heritage conservation area — a heritage impact statement is required; a DA (not CDC) pathway applies.";
  }
  if (planningControls.heritageItem) {
    return "This lot is a listed heritage item — a heritage impact statement is required; a DA (not CDC) pathway applies.";
  }
  if (planningControls.heritageConservationArea) {
    return "This lot sits within a heritage conservation area — character/streetscape compatibility will be assessed; a DA (not CDC) pathway applies.";
  }
  return "No heritage item or conservation area mapped for this lot (live ePlanning heritage layer).";
}

export function buildCouncilControls(
  siteProfile: SiteProfile,
  planningControls: PlanningControls,
  councilProfile?: CouncilProfile | null
): CouncilControlsSummary {
  return {
    lepName: siteProfile.epiName,
    dcpName: councilProfile?.instrumentName ?? null,
    heritage: heritageControlText(planningControls),
    characterAndStreetscape: councilProfile?.streetscapeCharacter
      ? `${councilProfile.streetscapeCharacter.summary} (${councilProfile.streetscapeCharacter.instrumentRef})`
      : "Not deep-profiled in this engine — verify character/streetscape expectations via the applicable council DCP or a pre-DA meeting.",
    treePreservation: councilProfile?.treePreservation
      ? `${councilProfile.treePreservation.summary} (${councilProfile.treePreservation.instrumentRef})`
      : TREE_PRESERVATION_STATEWIDE_NOTE,
    stormwaterPolicy: councilProfile?.stormwaterPolicy
      ? `${councilProfile.stormwaterPolicy.summary} (${councilProfile.stormwaterPolicy.instrumentRef})`
      : "Not deep-profiled in this engine — a stormwater/on-site detention (OSD) concept plan is required under the Codes SEPP/council DCP for most dwellings; verify the specific council's engineering DCP chapter.",
    viewSharing: councilProfile?.viewSharing
      ? `${councilProfile.viewSharing.summary} (${councilProfile.viewSharing.instrumentRef})`
      : VIEW_SHARING_GENERIC_NOTE,
  };
}

export function buildUtilitiesSummary(siteProfile: SiteProfile): UtilitiesSummary {
  const distributor = getElectricityDistributor(siteProfile.lga);
  const waterUtility = getWaterUtility(siteProfile.lga);

  return {
    electricityDistributor: distributor
      ? `${distributor.name} (${
          distributor.byElimination
            ? "by elimination — this LGA isn't in Ausgrid's or Endeavour Energy's published metro/Hunter footprint, and Essential Energy's own territory is the rest of NSW"
            : "regional LGA-based estimate, from the distributor's own published network area"
        } — confirm via the distributor's postcode checker before relying on this).`
      : "Unknown — verify via the relevant distributor's postcode checker (Ausgrid, Endeavour Energy, or Essential Energy).",
    otherServicesNote: `Water/sewer: ${
      waterUtility ? `likely ${waterUtility} (regional estimate — confirm via a Section 10.7 planning certificate)` : "confirm via a Section 10.7 planning certificate — this LGA is outside Sydney/Hunter/Central Coast Water's areas, so it likely has its own local council-run water utility, which can't be named without confirming"
    }. Stormwater/OSD: this council's DCP (see this report's Engineering section for the specific policy where deep-profiled). NBN: check availability at nbnco.com.au. Gas: contact the relevant network operator (e.g. Jemena in Sydney). Before any excavation: commission a Dial Before You Dig (DBYD) enquiry.`,
  };
}

export function buildAccessSummary(siteProfile: SiteProfile): AccessSummary {
  let drivewayGradient: string;
  if (siteProfile.slopePercent === null || siteProfile.slopeClass === null) {
    drivewayGradient = "Insufficient data (no slope estimate available) to assess driveway gradient.";
  } else if (siteProfile.slopeClass === "steep") {
    drivewayGradient = `Slope ~${siteProfile.slopePercent}% (estimated from a 5m-resolution elevation model) — a graded or split driveway is likely required; check the driveway against the council's max-grade DCP control and AS2890.1 before design.`;
  } else if (siteProfile.slopeClass === "moderate") {
    drivewayGradient = `Slope ~${siteProfile.slopePercent}% (estimated from a 5m-resolution elevation model) — the driveway will likely need some grading; standard design should still absorb it, but check against the council's max-grade DCP control.`;
  } else {
    drivewayGradient = `Slope ~${siteProfile.slopePercent}% (estimated from a 5m-resolution elevation model) — minimal driveway grading expected.`;
  }

  const roadFrontage = siteProfile.nearbyClassifiedRoad
    ? `A ${siteProfile.nearbyClassifiedRoad} was found within 40m of the lot (live NSW classified-road layer) — this is a proximity check, not a confirmed frontage road; busier road classifications commonly attract extra vehicle-crossover/traffic-engineering conditions and may restrict new crossover locations. Verify which road the lot actually fronts before relying on this.`
    : "No classified road (Motorway/Primary/Arterial/Sub-Arterial/Distributor) found within 40m (live NSW classified-road layer, which does not include ordinary local streets) — consistent with local-street access, though this is not a confirmed absence of a busier road nearby.";

  return {
    drivewayGradient,
    roadFrontage,
    vehicleCrossover:
      "Vehicle crossover width/location and turning-circle requirements are set by the council's DCP and AS2890.1 (Parking facilities) — not computable from any spatial layer; confirm via the council DCP or a pre-DA meeting.",
    wasteAndConstructionAccess:
      "Waste collection access and construction access (site access for machinery, material storage) are site-specific and require a site inspection — not assessable from any spatial layer.",
  };
}

export function buildEngineeringSummary(
  siteProfile: SiteProfile,
  constraints: Constraint[],
  councilProfile?: CouncilProfile | null
): EngineeringSummary {
  const massMovement = siteProfile.massMovementRating;
  let retainingWalls: string;
  if (massMovement === null && siteProfile.slopeClass === null) {
    retainingWalls = "Insufficient data (no mass-movement rating or slope estimate available) to assess retaining wall likelihood.";
  } else if ((massMovement !== null && massMovement >= LSC_ELEVATED_THRESHOLD) || siteProfile.slopeClass === "steep") {
    retainingWalls = `Elevated mass-movement/slope-stability risk${massMovement !== null ? ` (NSW Land and Soil Capability mass-movement rating ${massMovement}/8, where 1 is best)` : ""}${siteProfile.slopeClass ? ` and ${siteProfile.slopeClass} slope` : ""} — retaining walls are likely required; commission a geotechnical assessment before design.`;
  } else {
    retainingWalls = `No elevated mass-movement risk found${massMovement !== null ? ` (NSW Land and Soil Capability mass-movement rating ${massMovement}/8, where 1 is best)` : ""} — retaining walls not indicated by these checks, though final design still depends on a geotechnical assessment.`;
  }

  const waterErosion = siteProfile.waterErosionRating;
  const cutAndFill =
    siteProfile.slopePercent === null
      ? "Insufficient data (no slope estimate available) to indicate cut/fill likely required."
      : `Slope ~${siteProfile.slopePercent}% (estimated from a 5m-resolution elevation model)${waterErosion !== null ? `; water erosion rating ${waterErosion}/8 (NSW Land and Soil Capability, where 1 is best)` : ""} — exact cut/fill volumes require a civil engineer's survey, not assessed from spatial layers alone.`;

  const shallowRock = siteProfile.shallowRockRating;
  const waterlogging = siteProfile.waterloggingRating;
  const groundwater = constraints.find((c) => c.name.startsWith("Groundwater"))?.present ?? false;
  const flood = constraints.find((c) => c.name.startsWith("Flood"))?.present ?? false;
  const basementConcerns: string[] = [];
  if (shallowRock !== null && shallowRock >= LSC_ELEVATED_THRESHOLD) basementConcerns.push(`shallow rock rating ${shallowRock}/8`);
  if (waterlogging !== null && waterlogging >= LSC_ELEVATED_THRESHOLD) basementConcerns.push(`waterlogging rating ${waterlogging}/8`);
  if (groundwater) basementConcerns.push("groundwater vulnerable area");
  if (flood) basementConcerns.push("flood planning area");
  const basementFeasibility =
    basementConcerns.length > 0
      ? `Elevated basement complexity indicated: ${basementConcerns.join(", ")} (all NSW Land and Soil Capability ratings are 1=best/8=worst) — likely to encounter rock and/or a high water table; commission a geotechnical/hydrogeological assessment before committing to a basement.`
      : "No elevated rock, waterlogging, groundwater, or flood risk found by these checks — a basement is not excluded, but a geotechnical/hydrogeological assessment is still required before committing to one.";

  const stormwaterConcept = councilProfile?.stormwaterPolicy
    ? `${councilProfile.stormwaterPolicy.summary} (${councilProfile.stormwaterPolicy.instrumentRef}) — a stormwater concept plan and on-site detention (OSD) are typically required under the Codes SEPP/council DCP for most dwellings.`
    : "Not deep-profiled in this engine — a stormwater concept plan and on-site detention (OSD) are typically required under the Codes SEPP/council DCP for most dwellings; verify the specific council's engineering DCP chapter.";

  return {
    stormwaterConcept,
    rainwaterTank:
      "BASIX commonly requires a rainwater tank connected to toilet/laundry/irrigation for most new NSW dwellings — the specific target depends on the BASIX index score, not this site's location; confirm via the BASIX certificate.",
    retainingWalls,
    cutAndFill,
    basementFeasibility,
    structuralFeasibility: "Structural feasibility requires a structural engineer's assessment — not computable from any spatial layer.",
  };
}

export function buildEnvironmentalSummary(siteProfile: SiteProfile, constraints: Constraint[]): EnvironmentalSummary {
  const canopy = siteProfile.localTreeCanopyPercent;
  const canopyNote = canopy !== null ? ` The surrounding area has ~${canopy}% tree canopy cover (ABS Mesh-Block level, NSW UHGC data) — area-level context, not a parcel-specific measurement.` : "";

  const anef = constraints.find((c) => c.name.startsWith("Aircraft noise"))?.present ?? false;
  const busyRoad = siteProfile.nearbyClassifiedRoad !== null;
  const acousticTriggers: string[] = [];
  if (anef) acousticTriggers.push("within a mapped ANEF contour");
  if (busyRoad) acousticTriggers.push(`near a ${siteProfile.nearbyClassifiedRoad}`);
  const acousticRequirements =
    acousticTriggers.length > 0
      ? `This lot is ${acousticTriggers.join(" and ")} — acoustic treatment/glazing requirements are more likely; confirm via an acoustic consultant.`
      : "No elevated acoustic trigger (ANEF contour or nearby classified road) found by these checks.";

  return {
    basixAndNatHers:
      "A BASIX certificate is required (see document checklist), and NSW's BASIX thermal performance standard has required a minimum 7-star NatHERS rating since 1 October 2023 (aligned with NCC 2022) — except NatHERS climate zones 9, 10, and 11 (far-west NSW), which remain on the prior BASIX thermal standard. The specific achieved rating depends on the dwelling design, not this site's location.",
    solarAccess: `Solar access for a standard dwelling house is assessed against the council's own DCP private-open-space/solar-access provision (not modelled per-council here unless already in a deep council profile) — not the Apartment Design Guide's 2-3 hour rule, which applies only to apartment developments under SEPP 65.${canopyNote}`,
    overshadowingAndPrivacy: `Overshadowing and privacy impacts from neighbouring buildings cannot be assessed — no aerial imagery or building-footprint data source exists in this engine; a site inspection and shadow diagram are required.${canopyNote}`,
    acousticRequirements,
  };
}

export function buildConstructionFeasibilitySummary(
  siteProfile: SiteProfile,
  buildableEnvelope: BuildableEnvelope,
  councilProfile?: CouncilProfile | null
): ConstructionFeasibilitySummary {
  const frontage = siteProfile.frontageM;
  const accessConcerns: string[] = [];
  if (frontage !== null && frontage < 10) accessConcerns.push(`a narrow ${frontage}m frontage`);
  if (siteProfile.slopeClass === "steep") accessConcerns.push("a steep slope");
  const siteAccessForMachinery =
    accessConcerns.length > 0
      ? `${accessConcerns.join(" and ")} may complicate machinery access — confirm with the builder before mobilising equipment.`
      : `Frontage ${frontage ?? "unknown"}m, slope ${siteProfile.slopeClass ?? "unknown"} — no elevated machinery-access complexity indicated by these checks.`;
  const roadPermitNote =
    siteProfile.nearbyClassifiedRoad !== null
      ? ` This lot is near a ${siteProfile.nearbyClassifiedRoad} — a traffic-management plan/work-zone permit is more likely to be required for construction access.`
      : "";

  const canopy = siteProfile.localTreeCanopyPercent;
  const smallLot = siteProfile.lotSizeSqm !== null && siteProfile.lotSizeSqm < 450;
  const narrowFrontage = frontage !== null && frontage < 10;
  const craneReasons: string[] = [];
  if (smallLot || narrowFrontage) craneReasons.push("limited side access for material handling on this lot");
  if (canopy !== null && canopy >= 30) craneReasons.push(`the area's ~${canopy}% tree canopy cover, which may require overhead clearance coordination`);
  const craneRequirements =
    craneReasons.length > 0
      ? `A crane may be needed given ${craneReasons.join(" and ")} — final requirement is a builder's determination.`
      : "No factors indicating an elevated likelihood of crane use found by these checks — final requirement is still a builder's determination.";

  let materialStorage: string;
  if (buildableEnvelope.envelopeAreaSqm === null || siteProfile.lotSizeSqm === null) {
    materialStorage = "Insufficient data (buildable envelope or lot size unavailable) to assess on-site material storage room.";
  } else if (buildableEnvelope.envelopeAreaSqm > siteProfile.lotSizeSqm) {
    // The envelope is a bounding-box-derived rectangle (see boundingBoxDims in
    // arcgis.ts), which can exceed the true polygon area for irregular/corner-cut
    // lots — same guard as stage6-scoring.ts's DCP-coverage check; a margin here
    // would be nonsensical, not a real result.
    materialStorage = `This lot's shape is too irregular for the bounding-box envelope estimate to imply a reliable on-site storage margin — confirm available storage area with a site survey.`;
  } else {
    const margin = siteProfile.lotSizeSqm - buildableEnvelope.envelopeAreaSqm;
    materialStorage =
      margin > 200
        ? `The lot (${siteProfile.lotSizeSqm}m²) has ${margin}m² beyond the buildable envelope — on-site material storage is likely feasible.`
        : `The lot (${siteProfile.lotSizeSqm}m²) has only ~${margin}m² beyond the buildable envelope — on-site storage may be tight; a council road-occupancy permit or off-site storage may be needed.`;
  }

  const neighbourProtection = councilProfile
    ? `${councilProfile.setbacks.sideM}m side setback (${councilProfile.instrumentName}) — construction (hoarding, dust screens, protective works) will sit close to the side boundary; confirm neighbour-protection requirements with the builder.`
    : "Side setback not deep-profiled for this council in this engine (generic assumption used elsewhere in this report) — verify actual neighbour-protection requirements via the council DCP or a pre-DA meeting.";

  return {
    siteAccessForMachinery: siteAccessForMachinery + roadPermitNote,
    craneRequirements,
    materialStorage,
    neighbourProtection,
    temporaryFencing:
      "Temporary fencing/hoarding around the construction site is a statewide requirement under the Work Health and Safety Regulation 2017 (SafeWork NSW) — not site-specific, applies regardless of location.",
    existingRetainingWallsAndDemolition:
      "Existing retaining walls and demolition scope cannot be confirmed — no aerial imagery or building-footprint data source exists in this engine; a site inspection is required (see the superlot/registration notes in Risks & unknowns for related caveats).",
  };
}

export function buildCostAssessmentSummary(costSignals: string[]): CostAssessmentSummary {
  return {
    landValueAndConstruction:
      "Land value, construction, demolition, site preparation, excavation, rock removal, retaining wall, and landscaping costs are market-rate figures with no authoritative live source this engine can verify — commission a current real estate valuation and a quantity surveyor/builder quote rather than relying on any figure in this report.",
    siteSpecificCostDrivers:
      costSignals.length > 0
        ? "See Site cost signals above for the constraint-driven cost items identified for this lot (e.g. bushfire, flood, slope, mine subsidence, geotechnical)."
        : "No constraint-driven cost signals were identified for this lot by these checks — see Site cost signals above.",
    statutoryFeesAndLevies:
      "Three real NSW statutory fees/levies (not market estimates): (1) DA lodgement fees are calculated on a tiered scale based on estimated development cost, using a fee unit of $113.90 for FY2025/26 (Schedule 4, Environmental Planning and Assessment Regulation 2021) — confirm the exact fee with the council's current fees and charges schedule; (2) a Long Service Levy of 0.25% applies to building work valued at $250,000 or more (NSW Long Service Corporation, rate/threshold changed 31 December 2022); (3) Home Building Compensation Fund (home warranty) insurance is required for residential building work over $20,000 (Home Building Act 1989 s92).",
    contingency:
      "A 10-15% contingency allowance is a common industry convention at feasibility stage, particularly where the risk register above shows unresolved items — not a site-specific calculation.",
  };
}

export function buildApprovalStrategySummary(
  pathway: Pathway,
  constraints: Constraint[],
  planningControls: PlanningControls,
  councilTier: CouncilTier,
  riskRegister: RiskRegisterEntry[]
): ApprovalStrategySummary {
  const consentAuthority: Record<Pathway["pathway"], string> = {
    cdc: "A registered/accredited private certifier (or council, at the applicant's election) issues the Complying Development Certificate — no council merit assessment applies.",
    da: "Council is the consent authority for a development of this scale. Large/complex developments can shift to a Sydney district/regional planning panel or the Independent Planning Commission, but that is not expected for a single dwelling, dual occupancy, or standard subdivision.",
    exempt: "No consent authority required — exempt development.",
    state: "A state significant/state-led pathway applies — confirm the specific consent authority with the NSW Planning Portal.",
  };

  const integratedApprovalLines: string[] = [];
  const bushfire = constraints.find((c) => c.name.startsWith("Bushfire"));
  if (bushfire?.present) {
    integratedApprovalLines.push(
      "Bushfire prone land: likely to require a bushfire report addressing Planning for Bush Fire Protection. A full NSW RFS Section 100B Bush Fire Safety Authority referral applies to subdivision of bushfire-prone land or special-fire-protection-purpose developments, not automatically to a standard single dwelling/dual-occupancy DA — confirm the current referral requirement with council or the certifier (state agency referral processes changed with the Development Coordination Authority from 1 July 2026)."
    );
  }
  const mineSubsidence = constraints.find((c) => c.name.startsWith("Mine subsidence"));
  if (mineSubsidence?.present) {
    integratedApprovalLines.push(
      "Mine subsidence district: approval from Subsidence Advisory NSW is required before work starts. Council/certifier may determine without a separate referral only where the development meets specific published guidelines (Guidelines 2, 3, 3A, 6, 8) — otherwise an integrated referral applies."
    );
  }
  if (planningControls.heritageItem || planningControls.heritageConservationArea) {
    integratedApprovalLines.push(
      "Heritage item / conservation area: expect council heritage advisor review; state-significant items may also require Heritage NSW referral."
    );
  }
  const integratedApprovals =
    integratedApprovalLines.length > 0
      ? integratedApprovalLines.join(" ")
      : "No integrated/concurrent agency referrals are indicated by the constraints identified — standard council/certifier assessment is expected.";

  const hasBlockerConstraint = constraints.some((c) => c.present && c.classification === "blocker");
  const hasHighImpactRisk = riskRegister.some((r) => r.impact === "high");
  const preDaConsultation =
    hasBlockerConstraint || councilTier === "unprofiled_data_thin" || hasHighImpactRisk
      ? "A pre-lodgement meeting with council is recommended before finalising design — this site has a blocker-classified constraint, a high-impact risk register item, or falls under a council this engine has limited profiled data for, any of which raise the value of confirming council's position early."
      : "A pre-lodgement meeting with council is optional for a site with no blocker constraints or high-impact risks identified here, but can still shorten assessment time on complex designs.";

  const reviewAndAppealRights =
    "Three real, fixed NSW review/appeal rights (not case-specific estimates): (1) a DA not determined within 40 days of lodgement (60 days for designated/integrated development) is taken to be refused on that date — 'deemed refusal' (Environmental Planning and Assessment Act 1979 s8.10(1)); (2) a Section 8.2 internal review of a refusal or conditions may be requested within 6 months of determination, not available for designated or Crown development (EP&A Act 1979 s8.2/s8.3); (3) a Class 1 merit appeal to the NSW Land and Environment Court may be lodged within 6 months of the determination or deemed-refusal date (EP&A Act 1979 s8.7/s8.9/s8.10).";

  return {
    consentAuthority: consentAuthority[pathway.pathway],
    integratedApprovals,
    preDaConsultation,
    reviewAndAppealRights,
  };
}

// Mitigation text for each real, present constraint name (from stage3-constraints.ts).
// Kept separate from buildCostSignals' phrasing (a cost flag) — this is framed
// as an action to take, matching the professional risk-register convention.
const CONSTRAINT_MITIGATIONS: Record<string, string> = {
  "Flood planning area / flood control lot":
    "Commission a flood study; raise finished floor levels to the flood planning level and budget for on-site detention (OSD).",
  "Bushfire prone land": "Commission a bushfire assessment / Bushfire Attack Level (BAL) rating before finalising design.",
  "Acid sulfate soils": "Commission an acid sulfate soil management plan before any excavation.",
  Contamination: "Commission a contamination assessment and remediation/validation report before lodging.",
  "Sewer main / easement": "Confirm exact easement location and width from title documents; may require Sydney Water build-over-sewer approval.",
  "Aircraft noise (ANEF)": "Confirm acoustic construction requirements against the current ANEF contour before design.",
  "Topography / slope": "Commission a geotechnical assessment; budget for retaining walls and/or cut-fill.",
  "Mine subsidence district": "Contact Subsidence Advisory NSW / the Mine Subsidence Board before design; budget for additional footing and structural engineering.",
  "Coastal management SEPP area": "Confirm referral/consent requirements under the Coastal Management SEPP; commission a coastal engineer if near a wetland or the shoreline.",
  "Groundwater vulnerability": "Account for groundwater vulnerability in on-site wastewater/stormwater infiltration design; confirm with a geotechnical/hydrogeological assessment.",
  Salinity: "Specify corrosion-resistant fittings and salinity-rated concrete/footing materials; confirm via a geotechnical assessment.",
};

export function buildRiskRegister(
  siteProfile: SiteProfile,
  planningControls: PlanningControls,
  constraints: Constraint[]
): RiskRegisterEntry[] {
  const isUnresolvedAddress = siteProfile.lotDp === null && siteProfile.lotSizeSqm === null;
  if (isUnresolvedAddress) {
    return [
      {
        risk: "Address unresolved",
        impact: "high",
        mitigation:
          "Confirm the correct address, lot, and DP via an NSW Property/cadastre search or title document — nothing else in this report has been verified against real data.",
      },
    ];
  }

  const register: RiskRegisterEntry[] = [];

  if (planningControls.heritageItem) {
    register.push({
      risk: "Heritage item",
      impact: "high",
      mitigation:
        "Engage a heritage consultant early; a DA (not CDC) generally applies and design must respond to the item's statement of significance.",
    });
  }
  if (planningControls.heritageConservationArea) {
    register.push({
      risk: "Heritage conservation area",
      impact: "high",
      mitigation: "Engage a heritage consultant early; check the HCA's specific DCP character/streetscape controls before design.",
    });
  }

  // classification already reflects how the engine treats each constraint
  // elsewhere (scoring weight, CDC exclusion) — reused here rather than
  // inventing a second, inconsistent severity scale.
  const impactForClassification: Record<Constraint["classification"], RiskRegisterEntry["impact"]> = {
    blocker: "high",
    "cost-adder": "medium",
    "documentation-adder": "low",
  };
  for (const c of constraints) {
    if (!c.present) continue;
    register.push({
      risk: c.name,
      impact: impactForClassification[c.classification],
      mitigation: CONSTRAINT_MITIGATIONS[c.name] ?? "Verify via a specialist report before relying on this.",
    });
  }

  if (siteProfile.registrationStatus === "unregistered") {
    register.push({
      risk: "Lot is unregistered",
      impact: "high",
      mitigation: "Confirm estimated registration date with the developer/estate agent — a CDC generally cannot be issued until the lot is registered.",
    });
  }
  if (siteProfile.indicativeOnly) {
    register.push({
      risk: "Lot dimensions not fully confirmed",
      impact: "medium",
      mitigation: "Verify exact lot dimensions via a registered survey or a Section 10.7 planning certificate before relying on this report.",
    });
  }
  if (siteProfile.lotSizeSqm !== null && siteProfile.lotSizeSqm > 2000) {
    register.push({
      risk: "Unusually large recorded lot size (possible unsubdivided \"superlot\")",
      impact: "medium",
      mitigation: "Verify actual house-block dimensions via the estate's registered plan of subdivision or a current title search.",
    });
  }
  if (siteProfile.councilTier !== "profiled") {
    register.push({
      risk: "Council DCP compliance culture unmodelled",
      impact: "low",
      mitigation: "Book a council pre-DA meeting to confirm how strictly this council applies its DCP controls in practice.",
    });
  }

  return register;
}

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
    } else if (c.name.startsWith("Mine subsidence")) {
      signals.push("Mine subsidence: additional footings/engineering design and Mine Subsidence Board approval likely required.");
    } else if (c.name.startsWith("Coastal management")) {
      signals.push("Coastal: additional referral/consent requirements likely apply (Coastal Management SEPP).");
    } else if (c.name.startsWith("Groundwater")) {
      signals.push("Groundwater: infiltration/OSD design should account for groundwater vulnerability.");
    } else if (c.name.startsWith("Salinity")) {
      signals.push("Salinity: corrosion-resistant fittings and salinity-rated concrete likely required.");
    }
  }
  signals.push("Demolition/tree removal: confirm via aerial imagery or site inspection — not assessed from spatial layers alone.");
  signals.push("Geotechnical: AS2870 site classification (soil reactivity) required for footing design — not assessed from spatial layers alone.");
  return signals;
}

export function buildDocumentChecklist(pathway: Pathway, constraints: Constraint[]): string[] {
  const docs = new Set<string>(["Survey plan (current, registered surveyor)"]);
  if (pathway.pathway === "da") {
    docs.add("Statement of Environmental Effects");
  }
  docs.add("BASIX certificate");
  // AS2870 site classification (soil reactivity) is required for essentially
  // every new residential footing design in NSW, regardless of slope — not
  // conditional on the Topography constraint.
  docs.add("Geotechnical / site classification report (AS2870)");
  if (constraints.find((c) => c.name.startsWith("Bushfire") && c.present)) {
    docs.add("Bushfire assessment / BAL report");
  }
  if (constraints.find((c) => c.name.startsWith("Flood") && c.present)) {
    docs.add("Flood study / flood impact assessment");
  }
  if (constraints.find((c) => c.name.startsWith("Topography") && c.present)) {
    docs.add("Arborist report (if tree removal required)");
  }
  if (constraints.find((c) => c.name.startsWith("Mine subsidence") && c.present)) {
    docs.add("Mine Subsidence Board approval");
  }
  if (constraints.find((c) => c.name.startsWith("Coastal management") && c.present)) {
    docs.add("Coastal risk or referral assessment");
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
  risks.push(
    "Restrictive covenants, rights of carriageway, encroachments, existing structures, boundary fencing, and significant individual trees are not visible from any spatial layer this engine checks — confirm via a title search (Section 10.7 certificate + title/DP) and a site survey before relying on this report for these items."
  );
  risks.push(
    "Slope/levels above are a DEM-derived estimate (5m resolution), not a surveyed cross-section — exact levels, existing service locations, existing tree locations, and neighbouring structures still require a registered surveyor's detail/boundary survey."
  );
  risks.push(
    "Soil type above (Great Soil Group) is a regional soil-landscape classification, not a parcel-specific geotechnical result — rock depth, fill material, foundation type, excavation risk, and retaining wall requirements cannot be determined from any spatial layer; commission a geotechnical investigation (boreholes/test pits, AS2870 site classification) before finalising footing design."
  );
  return risks;
}

export function buildPermittedUses(
  planningControls: PlanningControls,
  councilProfile?: CouncilProfile | null
): DevelopmentPotential["permittedUses"] {
  if (planningControls.zone === "Unknown") {
    return { list: [], source: "Not available", note: "Zone could not be resolved — no permitted-use list can be determined." };
  }

  const zoneOverlay = councilProfile?.permittedUsesByZone?.[planningControls.zone];
  if (zoneOverlay) {
    return {
      list: zoneOverlay.list,
      source: zoneOverlay.instrumentRef,
      note: `${zoneOverlay.summary} This list is drawn from web research corroborating the LEP's own Land Use Table, not a direct legislative-text fetch — it may be incomplete; verify the full table before relying on it for a specific proposal.`,
    };
  }

  const generic = STANDARD_ZONE_LAND_USE_TABLE[planningControls.zone];
  if (generic) {
    return {
      list: generic,
      source: "NSW Standard Instrument—Principal LEP (generic template)",
      note: `Typical "permitted with consent" uses for ${planningControls.zone} zones under the Standard Instrument template that most NSW LEPs are built from — this council's own LEP Land Use Table can add or remove specific uses, so treat this as a starting point, not a confirmed list for this address. Verify via the applicable LEP or a Section 10.7 planning certificate.`,
    };
  }

  return {
    list: [],
    source: "Not available",
    note: `No verified permitted-use list is available in this engine for zone ${planningControls.zone} — check this council's LEP Land Use Table directly via the NSW Planning Portal or a Section 10.7 planning certificate.`,
  };
}

function buildDualOccupancy(
  siteProfile: SiteProfile,
  planningControls: PlanningControls,
  councilProfile?: CouncilProfile | null
): DevelopmentPotential["dualOccupancy"] {
  const zone = planningControls.zone;
  const attached = councilProfile?.minLotSizeByUseAndZone?.["Dual occupancy (attached)"]?.[zone];
  const detached = councilProfile?.minLotSizeByUseAndZone?.["Dual occupancy (detached)"]?.[zone];

  if (!attached && !detached) {
    return {
      likelyPermitted: null,
      reasoning:
        "Dual-occupancy permissibility is set by each council's own LEP Land Use Table and varies materially between councils — never generalised from one LGA to another in this engine. Check the specific zone's permitted-use table for this LGA, or book a council pre-DA meeting.",
    };
  }
  if (siteProfile.lotSizeSqm === null) {
    return {
      likelyPermitted: null,
      reasoning: "Insufficient data (lot size unconfirmed) to check dual occupancy against this council's verified minimum lot size.",
    };
  }

  const parts: string[] = [];
  let anyEligible = false;
  if (attached) {
    const ok = siteProfile.lotSizeSqm >= attached.areaSqm;
    anyEligible = anyEligible || ok;
    parts.push(`Attached dual occupancy: ${ok ? "eligible" : "ineligible"} by lot size (needs ≥${attached.areaSqm}m², this lot is ${siteProfile.lotSizeSqm}m² — ${attached.clauseRef}).`);
  }
  if (detached) {
    const ok = siteProfile.lotSizeSqm >= detached.areaSqm;
    anyEligible = anyEligible || ok;
    parts.push(`Detached dual occupancy: ${ok ? "eligible" : "ineligible"} by lot size (needs ≥${detached.areaSqm}m², this lot is ${siteProfile.lotSizeSqm}m² — ${detached.clauseRef}).`);
  }

  // Bonus detail, same clause family — manor house and multi dwelling housing
  // often come up alongside dual occupancy for a lot this size; surface them
  // if this council has verified figures for this zone, rather than making
  // the user ask a second question to get it.
  const manor = councilProfile?.minLotSizeByUseAndZone?.["Manor house"]?.[zone];
  if (manor) {
    const ok = siteProfile.lotSizeSqm >= manor.areaSqm;
    parts.push(`Manor house: ${ok ? "eligible" : "ineligible"} by lot size (needs ≥${manor.areaSqm}m² — ${manor.clauseRef}).`);
  }
  const multiDwelling = councilProfile?.minLotSizeByUseAndZone?.["Multi dwelling housing"]?.[zone];
  if (multiDwelling) {
    const ok = siteProfile.lotSizeSqm >= multiDwelling.areaSqm;
    parts.push(`Multi dwelling housing: ${ok ? "eligible" : "below the standard threshold"} by lot size (needs ≥${multiDwelling.areaSqm}m² — ${multiDwelling.clauseRef}).`);
  }

  parts.push("Lot size is only one test — zoning permissibility, frontage, and DCP controls also apply before relying on this.");

  return { likelyPermitted: anyEligible, reasoning: parts.join(" ") };
}

export function buildDevelopmentPotential(
  siteProfile: SiteProfile,
  planningControls: PlanningControls,
  councilProfile?: CouncilProfile | null
): DevelopmentPotential {
  const zonePermitsResidential = /^R/.test(planningControls.zone); // same check as stage6-scoring.ts's hard gate
  const permittedUses = buildPermittedUses(planningControls, councilProfile);

  let newDwellingEligible: boolean | null = null;
  let newDwellingReasoning: string;
  if (siteProfile.lotSizeSqm === null || siteProfile.frontageM === null) {
    newDwellingReasoning = "Insufficient data (lot size and/or frontage unconfirmed) to determine new dwelling house CDC eligibility.";
  } else if (!zonePermitsResidential) {
    newDwellingEligible = false;
    newDwellingReasoning = `Zone ${planningControls.zone} does not read as a standard residential zone — a new dwelling house is a residential-zone CDC pathway.`;
  } else {
    const effectiveMinLotSqm = planningControls.minLotSizeSqm ?? NEW_DWELLING_HOUSE_DEFAULT_MIN_LOT_SQM;
    const lotSizeSource = planningControls.minLotSizeSqm !== null ? "this lot's own LEP minimum lot size (live LSZ layer)" : "the Housing Code's 200m² default (no LEP-specific minimum found)";
    const lotSizeOk = siteProfile.lotSizeSqm >= effectiveMinLotSqm;
    const widthOk = siteProfile.frontageM >= NEW_DWELLING_HOUSE_MIN_WIDTH_M;
    newDwellingEligible = lotSizeOk && widthOk;
    const shortfalls: string[] = [];
    if (!lotSizeOk) shortfalls.push(`lot size ${siteProfile.lotSizeSqm}m² (needs ≥${effectiveMinLotSqm}m², from ${lotSizeSource})`);
    if (!widthOk) shortfalls.push(`width ${siteProfile.frontageM}m (needs ≥${NEW_DWELLING_HOUSE_MIN_WIDTH_M}m at the building line — this uses the lot's bounding-box frontage as a proxy, not the exact building-line width)`);
    newDwellingReasoning = newDwellingEligible
      ? `Lot size ${siteProfile.lotSizeSqm}m² and width ${siteProfile.frontageM}m meet the Housing Code CDC minimums for a new dwelling house (≥${effectiveMinLotSqm}m² from ${lotSizeSource}, ≥${NEW_DWELLING_HOUSE_MIN_WIDTH_M}m width) — verify current figures and full Codes SEPP compliance (setbacks, height, site coverage) before relying on this.`
      : `Falls short of the Housing Code CDC minimums for a new dwelling house on ${shortfalls.join(" and ")} — CDC is unlikely, though a DA pathway may still be possible.`;
  }

  let secondaryEligible: boolean | null = null;
  let secondaryReasoning: string;
  if (siteProfile.lotSizeSqm === null || siteProfile.frontageM === null) {
    secondaryReasoning = "Insufficient data (lot size and/or frontage unconfirmed) to determine secondary dwelling eligibility.";
  } else if (!zonePermitsResidential) {
    secondaryEligible = false;
    secondaryReasoning = `Zone ${planningControls.zone} does not read as a standard residential zone — secondary dwellings are a residential-zone CDC pathway.`;
  } else {
    const lotSizeOk = siteProfile.lotSizeSqm >= SECONDARY_DWELLING_MIN_LOT_SQM;
    const frontageOk = siteProfile.frontageM >= SECONDARY_DWELLING_MIN_FRONTAGE_M;
    secondaryEligible = lotSizeOk && frontageOk;
    const shortfalls: string[] = [];
    if (!lotSizeOk) shortfalls.push(`lot size ${siteProfile.lotSizeSqm}m² (needs ≥${SECONDARY_DWELLING_MIN_LOT_SQM}m²)`);
    if (!frontageOk) shortfalls.push(`frontage ${siteProfile.frontageM}m (needs ≥${SECONDARY_DWELLING_MIN_FRONTAGE_M}m)`);
    secondaryReasoning = secondaryEligible
      ? `Lot size ${siteProfile.lotSizeSqm}m² and frontage ${siteProfile.frontageM}m meet the NSW Housing SEPP 2021 CDC minimums (≥${SECONDARY_DWELLING_MIN_LOT_SQM}m², ≥${SECONDARY_DWELLING_MIN_FRONTAGE_M}m frontage, max 60m² dwelling) — verify current figures before relying on this.`
      : `Falls short of the NSW Housing SEPP 2021 secondary-dwelling CDC minimums on ${shortfalls.join(" and ")} — a secondary dwelling via CDC is unlikely, though a DA pathway may still be possible.`;
  }

  let potentialLots: number | null = null;
  let subdivisionReasoning: string;
  if (planningControls.minLotSizeSqm === null || siteProfile.lotSizeSqm === null) {
    subdivisionReasoning = "Insufficient data (minimum lot size and/or actual lot size unconfirmed) to assess subdivision potential.";
  } else {
    potentialLots = Math.floor(siteProfile.lotSizeSqm / planningControls.minLotSizeSqm);
    subdivisionReasoning =
      potentialLots >= 2
        ? `Lot area (${siteProfile.lotSizeSqm}m²) could support ${potentialLots} lots at the ${planningControls.minLotSizeSqm}m² LEP minimum — area only; this does not check per-lot frontage, battle-axe access-handle rules, or council DCP subdivision controls, any of which can independently block subdivision.`
        : `Lot area (${siteProfile.lotSizeSqm}m²) does not support multiple lots at the ${planningControls.minLotSizeSqm}m² LEP minimum.`;
  }

  return {
    permittedUses,
    newDwellingHouse: { eligible: newDwellingEligible, reasoning: newDwellingReasoning },
    secondaryDwelling: { eligible: secondaryEligible, reasoning: secondaryReasoning },
    dualOccupancy: buildDualOccupancy(siteProfile, planningControls, councilProfile),
    subdivision: { potentialLots, reasoning: subdivisionReasoning },
  };
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

export function buildFeasibilitySummary(
  siteProfile: SiteProfile,
  planningControls: PlanningControls,
  constraints: Constraint[],
  buildableEnvelope: BuildableEnvelope,
  pathway: Pathway,
  score: ScoreResult
): FeasibilitySummary {
  const isUnresolvedAddress = siteProfile.lotDp === null && siteProfile.lotSizeSqm === null;
  const zonePermitsResidential = /^R/.test(planningControls.zone); // same check as stage6-scoring.ts's hard gate

  if (isUnresolvedAddress) {
    return {
      planningFeasibility: "insufficient_data",
      engineeringFeasibility: "insufficient_data",
      constructionFeasibility: "insufficient_data",
      financialFeasibility: "insufficient_data",
      overallRiskRating: "unknown",
      recommendation: "insufficient_data",
      reasoning:
        "This address could not be resolved against NSW property/cadastre data, so no control was actually looked up — every feasibility flag below is unknown, not a real assessment.",
    };
  }

  const planningFeasibility: FeasibilitySummary["planningFeasibility"] =
    planningControls.zone === "Unknown" ? "insufficient_data" : zonePermitsResidential ? "yes" : "no";

  const engineeringFeasibility: FeasibilitySummary["engineeringFeasibility"] =
    buildableEnvelope.envelopeAreaSqm === null
      ? "insufficient_data"
      : buildableEnvelope.targetFootprintFit && !buildableEnvelope.targetFootprintFit.fits
        ? "no"
        : "yes";

  // Sections 4-5, 7, 10 of the professional Pre-DA framework (survey, geotechnical,
  // site access, construction methodology) have no live data source integrated in
  // this engine yet — reporting "yes" or "no" here would be exactly the kind of
  // guess SKILL.md prohibits. Always insufficient_data until a real source exists.
  const constructionFeasibility: FeasibilitySummary["constructionFeasibility"] = "insufficient_data";

  // Land value, construction cost, and consultant/council fee data (Section 11)
  // are not sourced live — costSignals are qualitative flags, not a verified
  // dollar estimate, so a real financial feasibility verdict can't be computed here.
  const financialFeasibility: FeasibilitySummary["financialFeasibility"] = "insufficient_data";

  const blockers = constraints.filter((c) => c.present && c.classification === "blocker").length;
  const costAdders = constraints.filter((c) => c.present && c.classification === "cost-adder").length;

  let overallRiskRating: FeasibilitySummary["overallRiskRating"];
  if (planningFeasibility === "insufficient_data") {
    overallRiskRating = "unknown";
  } else if (planningFeasibility === "no" || blockers >= 1) {
    overallRiskRating = "high";
  } else if (costAdders >= 2 || pathway.pathway === "da") {
    overallRiskRating = "medium";
  } else {
    overallRiskRating = "low";
  }

  let recommendation: FeasibilitySummary["recommendation"];
  if (planningFeasibility === "insufficient_data") {
    recommendation = "insufficient_data";
  } else if (planningFeasibility === "no") {
    recommendation = "do_not_proceed";
  } else if (overallRiskRating === "high" || engineeringFeasibility === "no") {
    recommendation = "proceed_with_changes";
  } else if (overallRiskRating === "medium") {
    recommendation = "proceed_with_changes";
  } else {
    recommendation = "proceed";
  }

  const scoreDescription =
    score.score !== null
      ? `a score of ${score.score}/100 (${score.bandLow})`
      : `a banded verdict of ${score.bandLow}-${score.bandHigh} (data-thin council, unscored)`;

  let reasoning: string;
  if (recommendation === "do_not_proceed") {
    reasoning = `Zone ${planningControls.zone} (${planningControls.zoneDescription}) does not read as a standard residential zone — this is a hard planning blocker, not a cost or design issue. Verify permissibility via a Section 10.7 certificate before spending further on this site.`;
  } else if (recommendation === "proceed_with_changes") {
    const reasons: string[] = [];
    if (blockers >= 1) reasons.push(`${blockers} blocking constraint(s) present`);
    if (pathway.pathway === "da") reasons.push("a DA (not CDC) pathway applies");
    if (engineeringFeasibility === "no") reasons.push("the stated target dwelling does not fit the buildable envelope");
    if (costAdders >= 2) reasons.push(`${costAdders} cost-adding constraint(s) present`);
    reasoning = `Planning permits the use and ${scoreDescription} suggests the site is workable, but ${reasons.join("; ")} — design changes and/or specialist reports are likely needed before this is a clean proceed. Construction and financial feasibility are not assessed here (no live geotechnical, site-access, or cost data source) — commission a builder/QS estimate and geotechnical report before committing.`;
  } else {
    reasoning = `Planning permits the use, no blocking constraints were found, and ${scoreDescription} — this reads as a workable site subject to normal due diligence. Construction and financial feasibility are still not assessed here (no live geotechnical, site-access, or cost data source) — commission a builder/QS estimate and geotechnical report before committing.`;
  }

  return {
    planningFeasibility,
    engineeringFeasibility,
    constructionFeasibility,
    financialFeasibility,
    overallRiskRating,
    recommendation,
    reasoning,
  };
}
