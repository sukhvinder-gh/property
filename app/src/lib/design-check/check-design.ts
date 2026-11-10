import { getCouncilProfileForSite } from "@/lib/pipeline/council-profiles";
import {
  SECONDARY_DWELLING_MAX_FLOOR_SQM,
  SECONDARY_DWELLING_MIN_FRONTAGE_M,
  SECONDARY_DWELLING_MIN_LOT_SQM,
} from "@/lib/pipeline/codes-sepp-constants";
import {
  HOUSING_CODE_BUILT_TO_BOUNDARY_MAX_WIDTH_M,
  HOUSING_CODE_MAX_HEIGHT_M,
  HOUSING_CODE_MAX_STOREYS,
  HOUSING_CODE_SOURCE,
  housingCodeCarSpacesRequired,
  housingCodeMaxGarageDoorWidthM,
  housingCodeMaxGfaSqm,
  housingCodeMinFrontSetbackM,
  housingCodeMinLandscapedPercent,
  housingCodeMinPrivateOpenSpaceSqm,
  housingCodeMinRearSetbackM,
  housingCodeMinSideSetbackM,
} from "@/lib/design-check/housing-code-standards";
import type { DesignCheckItem, DesignCheckResult, DesignVerdict, ExtractedDesign } from "@/lib/design-check/schema";
import type { AssessmentRecord } from "@/types/assessment";

const m = (v: number) => `${Math.round(v * 100) / 100}m`;
const sqm = (v: number) => `${Math.round(v)}m²`;
const NOT_SHOWN = "Not shown on plans";

type Item = Omit<DesignCheckItem, "status" | "proposed"> & { proposed: number | null; fmt: (v: number) => string };

/** Minimum-type check: proposed must be ≥ required. */
function atLeast(item: Item, min: number | null): DesignCheckItem {
  const { proposed, fmt, ...rest } = item;
  const status = min === null || proposed === null ? "unknown" : proposed >= min ? "pass" : "fail";
  return { ...rest, proposed: proposed === null ? NOT_SHOWN : fmt(proposed), status, ...(status === "fail" ? {} : { fix: undefined }) };
}

/** Maximum-type check: proposed must be ≤ limit. */
function atMost(item: Item, max: number | null): DesignCheckItem {
  const { proposed, fmt, ...rest } = item;
  const status = max === null || proposed === null ? "unknown" : proposed <= max ? "pass" : "fail";
  return { ...rest, proposed: proposed === null ? NOT_SHOWN : fmt(proposed), status, ...(status === "fail" ? {} : { fix: undefined }) };
}

/**
 * Housing Code GFA excludes one car space. Derived only from figures on the
 * plans: living area + garage area minus one space's share of the garage.
 */
function estimateGfa(d: ExtractedDesign): number | null {
  if (d.livingAreaSqm === null) return null;
  if (!d.garageAreaSqm) return d.livingAreaSqm;
  const spaces = d.garageCarSpaces && d.garageCarSpaces > 0 ? d.garageCarSpaces : 1;
  return d.livingAreaSqm + (d.garageAreaSqm * (spaces - 1)) / spaces;
}

function minSide(d: ExtractedDesign): number | null {
  const sides = [d.sideSetbackLeftM, d.sideSetbackRightM].filter((v): v is number => v !== null);
  return sides.length ? Math.min(...sides) : null;
}

export function checkDesign(record: AssessmentRecord, d: ExtractedDesign): DesignCheckResult {
  const { siteProfile: site, planningControls: pc, buildableEnvelope: env, pathway, constraints, developmentPotential: dp } = record;
  const lot = site.lotSizeSqm;
  const width = site.frontageM;
  const checks: DesignCheckItem[] = [];
  const caveats: string[] = [];
  const instrument = site.epiName;

  // ---- Planning controls (statutory — apply on any pathway) ----
  const residentialZone = /^R/.test(pc.zone);
  const housesListed = dp.permittedUses.list.some((u) => /dwelling houses/i.test(u));
  checks.push({
    id: "zone",
    category: "Planning controls",
    rule: `Zoning permits a ${d.isDualOccupancy ? "dual occupancy" : "dwelling house"}`,
    required: `Permitted in zone ${pc.zone}`,
    proposed: d.isDualOccupancy ? "Dual occupancy" : "Dwelling house",
    status: d.isDualOccupancy
      ? dp.dualOccupancy.likelyPermitted === null
        ? "unknown"
        : dp.dualOccupancy.likelyPermitted
          ? "pass"
          : "fail"
      : pc.zone === "Unknown"
        ? "unknown"
        : housesListed || residentialZone
          ? "pass"
          : "fail",
    source: d.isDualOccupancy ? dp.dualOccupancy.reasoning : dp.permittedUses.source,
    fix: d.isDualOccupancy
      ? "Dual occupancy doesn't meet this lot's rules — consider a single dwelling (optionally with a granny flat), or confirm with council."
      : `This use isn't permitted in zone ${pc.zone} — it can't be approved here without a rezoning.`,
  });

  checks.push(
    atMost(
      {
        id: "hob",
        category: "Planning controls",
        rule: "Maximum building height",
        required: pc.heightOfBuildingM === null ? "No height map value found" : `≤ ${m(pc.heightOfBuildingM)}`,
        proposed: d.maxBuildingHeightM,
        fmt: m,
        source: `Height of Buildings map — ${instrument}`,
        fix: "Lower the roof (reduce pitch or ceiling heights) — exceeding the mapped height needs a Clause 4.6 variation through a DA, which is hard to win.",
      },
      pc.heightOfBuildingM
    )
  );

  const gfa = estimateGfa(d);
  if (pc.fsr !== null) {
    checks.push(
      atMost(
        {
          id: "fsr",
          category: "Planning controls",
          rule: "Floor space ratio",
          required: `≤ ${pc.fsr}:1${lot ? ` (${sqm(pc.fsr * lot)} on this lot)` : ""}`,
          proposed: gfa,
          fmt: (v) => `${sqm(v)}${lot ? ` (${(v / lot).toFixed(2)}:1)` : ""}`,
          source: `Floor Space Ratio map — ${instrument}`,
          fix: "Reduce total floor area — exceeding the mapped FSR needs a Clause 4.6 variation through a DA.",
        },
        lot ? pc.fsr * lot : null
      )
    );
  }

  const blockers = constraints.filter((c) => c.present && c.classification === "blocker");
  if (blockers.length) {
    checks.push({
      id: "blockers",
      category: "Planning controls",
      rule: "No blocking site constraints",
      required: "None",
      proposed: blockers.map((c) => c.name).join(", "),
      status: "fail",
      source: "Site constraints in the assessment report",
      fix: "These constraints need specialist reports and usually a DA — see the report's constraint section.",
    });
  }

  if (d.hasSecondaryDwelling) {
    const lotOk = lot !== null && lot >= SECONDARY_DWELLING_MIN_LOT_SQM;
    const frontOk = width !== null && width >= SECONDARY_DWELLING_MIN_FRONTAGE_M;
    checks.push({
      id: "granny-lot",
      category: "Housing Code (CDC)",
      rule: "Lot qualifies for a CDC granny flat",
      required: `Lot ≥ ${SECONDARY_DWELLING_MIN_LOT_SQM}m² and frontage ≥ ${SECONDARY_DWELLING_MIN_FRONTAGE_M}m`,
      proposed: `${lot ?? "?"}m², ${width ?? "?"}m frontage`,
      status: lot === null || width === null ? "unknown" : lotOk && frontOk ? "pass" : "fail",
      source: "Housing SEPP 2021 (secondary dwellings)",
      fix: "This lot is too small/narrow for a CDC granny flat — remove it, or lodge a DA and ask council.",
    });
    checks.push(
      atMost(
        {
          id: "granny-size",
          category: "Housing Code (CDC)",
          rule: "Granny flat floor area",
          required: `≤ ${SECONDARY_DWELLING_MAX_FLOOR_SQM}m²`,
          proposed: d.secondaryDwellingAreaSqm,
          fmt: sqm,
          source: "Housing SEPP 2021 (secondary dwellings)",
          fix: `Reduce the granny flat to ${SECONDARY_DWELLING_MAX_FLOOR_SQM}m² or less.`,
        },
        SECONDARY_DWELLING_MAX_FLOOR_SQM
      )
    );
  }

  // ---- Housing Code (CDC) — new dwelling house on a standard lot ----
  const cdcOffered = pathway.pathway === "cdc";
  const housingCodeApplies = !d.isDualOccupancy && lot !== null && width !== null;
  if (d.isDualOccupancy) {
    caveats.push("Dual occupancies fall under the Low Rise Housing Diversity Code or a DA, not the Housing Code — those detailed standards aren't checked here.");
  }
  if (!cdcOffered) {
    caveats.push(`The assessment found CDC isn't available for this lot (${pathway.reasoning}) — Housing Code results below are for reference; this design would go to council as a DA.`);
  }
  if (site.isCornerLot) {
    caveats.push("This is a corner lot — the Housing Code has a separate corner-lot table (secondary road setbacks differ). These checks use the standard-lot table.");
  } else if (site.isCornerLot === null) {
    caveats.push("Corner/battle-axe status wasn't confirmed — these checks assume a standard lot.");
  }
  if (pc.greenfieldHousingCodeArea) {
    caveats.push("The Planning Portal maps this lot inside a Greenfield Housing Code area (Codes SEPP Part 3C). A CDC here is assessed under the Greenfield Housing Code, whose standards differ from the Housing Code table used below — confirm the figures with your certifier.");
  } else if ((pc.greenfieldHousingCodeArea ?? null) === null && /state environmental planning policy/i.test(instrument)) {
    // Greenfield area unknown (older record / API unavailable) — fall back to the SEPP-zoning hint.
    caveats.push(`This lot is zoned under ${instrument}. Greenfield release areas can be covered by the Greenfield Housing Code instead of the Housing Code, with different standards — confirm which code applies with your certifier.`);
  }

  if (housingCodeApplies) {
    const height = d.maxBuildingHeightM;
    const twoStorey = (d.storeys ?? 1) > 1 || (height !== null && height > 4.5);
    checks.push(
      atMost(
        { id: "hc-storeys", category: "Housing Code (CDC)", rule: "Number of storeys", required: `≤ ${HOUSING_CODE_MAX_STOREYS}`, proposed: d.storeys, fmt: String, source: `${HOUSING_CODE_SOURCE}, cl 3.1`, fix: "Reduce to 2 storeys or lodge a DA." },
        HOUSING_CODE_MAX_STOREYS
      ),
      atMost(
        { id: "hc-height", category: "Housing Code (CDC)", rule: "Building height", required: `≤ ${m(HOUSING_CODE_MAX_HEIGHT_M)}`, proposed: height, fmt: m, source: `${HOUSING_CODE_SOURCE}, cl 3.8`, fix: "Lower the ridge (reduce roof pitch or ceiling heights) to 8.5m or less." },
        HOUSING_CODE_MAX_HEIGHT_M
      ),
      atMost(
        {
          id: "hc-gfa",
          category: "Housing Code (CDC)",
          rule: "Gross floor area (1 car space excluded)",
          required: `≤ ${sqm(housingCodeMaxGfaSqm(lot))}`,
          proposed: gfa,
          fmt: sqm,
          source: `${HOUSING_CODE_SOURCE}, cl 3.9`,
          fix: `Cut about ${gfa !== null ? sqm(gfa - housingCodeMaxGfaSqm(lot)) : "the excess"} of floor area (e.g. a smaller upper floor or a single garage).`,
        },
        housingCodeMaxGfaSqm(lot)
      ),
      atLeast(
        {
          id: "hc-front",
          category: "Housing Code (CDC)",
          rule: "Front (primary road) setback",
          required: `≥ ${m(housingCodeMinFrontSetbackM(lot))} (or the average of the 2 nearest houses within 40m, if there are 2)`,
          proposed: d.frontSetbackM,
          fmt: m,
          source: `${HOUSING_CODE_SOURCE}, cl 3.10(1)&(3)`,
          fix: "Move the house back from the street boundary.",
        },
        housingCodeMinFrontSetbackM(lot)
      ),
      atLeast(
        {
          id: "hc-side",
          category: "Housing Code (CDC)",
          rule: "Side setback (ground floor)",
          required: `≥ ${m(housingCodeMinSideSetbackM(width, 4.5))}`,
          proposed: minSide(d),
          fmt: m,
          source: `${HOUSING_CODE_SOURCE}, cl 3.10(4)`,
          fix:
            width <= HOUSING_CODE_BUILT_TO_BOUNDARY_MAX_WIDTH_M
              ? "Widen the side setback — or, on a lot this narrow, the wall may be built to the boundary if cl 3.10(5)–(9) conditions are met (ask your certifier)."
              : "Narrow the house to widen the side setback.",
        },
        housingCodeMinSideSetbackM(width, 4.5)
      ),
      atLeast(
        { id: "hc-rear", category: "Housing Code (CDC)", rule: "Rear setback (ground floor, up to 4.5m high)", required: `≥ ${m(housingCodeMinRearSetbackM(lot, false)!)}`, proposed: d.rearSetbackM, fmt: m, source: `${HOUSING_CODE_SOURCE}, cl 3.10(10)`, fix: "Shorten the house or move it forward to increase the rear setback." },
        housingCodeMinRearSetbackM(lot, false)
      )
    );
    if (twoStorey) {
      const upperRear = housingCodeMinRearSetbackM(lot, true);
      const upperSide = height !== null ? housingCodeMinSideSetbackM(width, height) : null;
      checks.push(
        atLeast(
          {
            id: "hc-rear-upper",
            category: "Housing Code (CDC)",
            rule: "Rear setback (parts above 4.5m)",
            required: upperRear === null ? "Lesser of 10m or the average of the 2 adjoining houses" : `≥ ${m(upperRear)}`,
            proposed: d.upperFloorRearSetbackM ?? d.rearSetbackM,
            fmt: m,
            source: `${HOUSING_CODE_SOURCE}, cl 3.10(10)`,
            fix: "Pull the upper floor forward, away from the rear boundary.",
          },
          upperRear
        ),
        atLeast(
          {
            id: "hc-side-upper",
            category: "Housing Code (CDC)",
            rule: "Side setback (upper floor)",
            required: upperSide === null ? "Depends on building height (not shown)" : `≥ ${m(upperSide)} at ${m(height!)} high`,
            proposed: d.upperFloorSideSetbackM ?? minSide(d),
            fmt: m,
            source: `${HOUSING_CODE_SOURCE}, cl 3.10(4)`,
            fix: "Step the upper floor in from the side boundaries.",
          },
          upperSide
        )
      );
    }
    const minLand = (housingCodeMinLandscapedPercent(lot) / 100) * lot;
    checks.push(
      atLeast(
        { id: "hc-landscape", category: "Housing Code (CDC)", rule: "Landscaped area", required: `≥ ${sqm(minLand)} (${housingCodeMinLandscapedPercent(lot)}% of lot), half behind the building line`, proposed: d.landscapedAreaSqm, fmt: sqm, source: `${HOUSING_CODE_SOURCE}, cl 3.13`, fix: "Reduce paving/hardstand or the footprint to free up landscaped area." },
        minLand
      ),
      atLeast(
        { id: "hc-pos", category: "Housing Code (CDC)", rule: "Principal private open space", required: `≥ ${sqm(housingCodeMinPrivateOpenSpaceSqm(width))}`, proposed: d.privateOpenSpaceSqm, fmt: sqm, source: `${HOUSING_CODE_SOURCE}, cl 3.13(4)`, fix: "Provide a larger open space area off the living room." },
        housingCodeMinPrivateOpenSpaceSqm(width)
      ),
      atMost(
        { id: "hc-garage-door", category: "Housing Code (CDC)", rule: "Garage door width facing the street", required: `≤ ${m(housingCodeMaxGarageDoorWidthM(width))}`, proposed: d.garageDoorWidthM, fmt: m, source: `${HOUSING_CODE_SOURCE}, cl 3.16(6)`, fix: "Use a single garage door (or set a double garage further back via a DA)." },
        housingCodeMaxGarageDoorWidthM(width)
      ),
      atLeast(
        { id: "hc-parking", category: "Housing Code (CDC)", rule: "Car spaces on the lot", required: `≥ ${housingCodeCarSpacesRequired(width)}`, proposed: d.garageCarSpaces, fmt: String, source: `${HOUSING_CODE_SOURCE}, cl 3.16`, fix: "Provide at least one car space on the lot." },
        housingCodeCarSpacesRequired(width)
      )
    );
  }

  // ---- Council DCP — what council weighs if this goes to a DA ----
  const profile = getCouncilProfileForSite(site.lga, site.epiName);
  if (profile && (!cdcOffered || d.isDualOccupancy)) {
    const ref = profile.instrumentName;
    checks.push(
      atLeast({ id: "dcp-front", category: "Council DCP (DA)", rule: "Front setback", required: `≥ ${m(profile.setbacks.frontM)}`, proposed: d.frontSetbackM, fmt: m, source: ref, fix: "Move the house back, or justify the variation in the Statement of Environmental Effects." }, profile.setbacks.frontM),
      atLeast({ id: "dcp-side", category: "Council DCP (DA)", rule: "Side setback", required: `≥ ${m(profile.setbacks.sideM)}`, proposed: minSide(d), fmt: m, source: ref, fix: "Increase the side setback or justify the variation." }, profile.setbacks.sideM),
      atLeast({ id: "dcp-rear", category: "Council DCP (DA)", rule: "Rear setback", required: `≥ ${m(profile.setbacks.rearM)}`, proposed: d.upperFloorRearSetbackM ?? d.rearSetbackM, fmt: m, source: ref, fix: "Increase the rear setback or justify the variation." }, profile.setbacks.rearM)
    );
  }

  // ---- Site fit (approximate) ----
  if (width !== null) {
    checks.push(
      atMost(
        { id: "fit-width", category: "Site fit", rule: "House fits across the lot", required: `≤ ${m(Math.max(0, Math.round((width - 1.8) * 100) / 100))} (lot width ${m(width)} less 0.9m each side)`, proposed: d.buildingWidthM, fmt: m, source: "Lot width from NSW cadastre (bounding box)", fix: "This design is too wide for the lot — choose a narrower design." },
        Math.max(0, Math.round((width - 1.8) * 100) / 100)
      )
    );
  }
  if (env.envelopeAreaSqm !== null) {
    checks.push(
      atMost(
        { id: "fit-footprint", category: "Site fit", rule: "Footprint fits the buildable area", required: `≤ ${sqm(env.envelopeAreaSqm)} (approx. area inside setbacks)`, proposed: d.groundFloorFootprintSqm, fmt: sqm, source: "Buildable envelope from the assessment (bounding-box estimate)", fix: "The ground floor is larger than the space left after setbacks — reduce the footprint." },
        env.envelopeAreaSqm
      )
    );
  }

  // ---- Plan vs lot sanity ----
  if (d.lotAreaShownSqm !== null && lot !== null && Math.abs(d.lotAreaShownSqm - lot) / lot > 0.1) {
    caveats.unshift(`The plans show a lot area of ${sqm(d.lotAreaShownSqm)}, but NSW records give ${sqm(lot)} for this address — check the plans are for this lot.`);
  }
  if (!d.drawingTypesFound.includes("site_plan")) {
    caveats.push("No site plan was found, so setbacks, landscaping and open space couldn't be checked — upload a site plan for a complete check.");
  }
  if (gfa !== null && d.garageAreaSqm) {
    caveats.push("Gross floor area is estimated from the plan's area schedule (living + garage, less one car space). Builders' areas are often measured to the outside of walls, so the true GFA is usually a little lower.");
  }

  // ---- Verdict ----
  const fails = (cat?: DesignCheckItem["category"]) => checks.filter((c) => c.status === "fail" && (!cat || c.category === cat));
  const unknowns = checks.filter((c) => c.status === "unknown");
  const planningFails = fails("Planning controls");
  const cdcFails = fails("Housing Code (CDC)");
  const fitFails = fails("Site fit");

  let verdict: DesignVerdict;
  let headline: string;
  if (planningFails.length || fitFails.length) {
    verdict = "unlikely";
    headline = `Unlikely to be approved as designed — ${planningFails.length + fitFails.length} issue(s) against the lot's statutory controls or size. See the fixes below.`;
  } else if (!cdcOffered || d.isDualOccupancy || cdcFails.length) {
    verdict = "da_required";
    headline = cdcFails.length
      ? `Doesn't meet the Housing Code on ${cdcFails.length} item(s), so it can't get a fast CDC as drawn. Fix those items for a CDC, or lodge a DA where council can consider variations.`
      : "No statutory issues found, but this design would need a DA (council approval) rather than a CDC.";
  } else if (unknowns.length) {
    verdict = "cannot_confirm";
    headline = `No issues found in what could be checked, but ${unknowns.length} item(s) aren't shown on these plans — add them to confirm CDC compliance.`;
  } else {
    verdict = "likely_cdc";
    headline = "Meets every Housing Code standard checked — likely approvable as a CDC through a private certifier (about 20 days).";
  }

  return { verdict, headline, checks, caveats, extracted: d };
}
