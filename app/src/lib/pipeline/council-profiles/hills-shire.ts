import type { CouncilProfile } from "@/lib/pipeline/council-profiles/types";

/**
 * Sourced 2026-07 from the actual The Hills DCP 2012 PDF (Part B Section 2 —
 * Residential, §2.14 Dwellings, in force 6 May 2022), not recalled/guessed.
 */
export const hillsShireProfile: CouncilProfile = {
  lgaKeyword: "hills shire",
  instrumentName: "The Hills Development Control Plan 2012, Part B Section 2 — Residential (§2.14, in force 6 May 2022)",
  instrumentUrl: "https://www.thehills.nsw.gov.au/files/assets/public/v/1/cms-docs/building/dcp/the-hills-dcp-part-b-section-2-residential.pdf",
  setbacks: {
    frontM: 10, // §2.14.1(a)-(d) — shire-wide default; several named precincts reduce this to 6-7.5m
    sideM: 0.9, // §2.14.1(g) — wall setback for 1-2 storeys
    rearM: 6, // §2.14.1(h),(j) — 2-3 storey figure for a typical modern dwelling; single-storey elements can go to 4m
  },
  siteCoverageMaxPercent: 60, // §2.14.2(a) — total impervious area; reduced to 30% on E4/mapped land, not modelled
  footprintMaxPercent: 45, // §2.14.2(b) — dwelling footprint specifically, within the 60% total
  landscapedAreaMinPercent: 40, // §2.14.5(b) — reduced to 70% on E4 land, not modelled
  notes: [
    "Kellyville, Bella Vista, and Showground sit in Metro Northwest growth precincts (see references/councils.md) with distinct precinct controls. The 10m front setback above is the shire-wide Part B Section 2 default; Bella Vista Residential precinct areas are separately documented at 6m, and Kellyville/Rouse Hill growth-precinct land is likely governed by a separate Part D precinct DCP section not verified in this pass — do not treat 10m as authoritative for those specific precincts.",
    "E4 Environmental Living zoned or mapped 'pink-shaded' land has much tighter controls (30% site coverage, 70% landscaped) — not modelled; only the standard R2-style shire-wide figures are used here.",
  ],
  // Tree preservation / streetscape / stormwater sourced 2026-07 directly from
  // the actual Part C Section 3 - Landscaping PDF (in force 5 Nov 2019), which
  // the user supplied after the council's site blocked direct WebFetch — this
  // Section applies shire-wide (not one housing type), so it's safe to use for
  // standard dwelling houses.
  treePreservation: {
    summary:
      'A "tree" is defined (State Environmental Planning Policy (Vegetation in Non-Rural Areas) 2017, applied via DCP §2.4) as a perennial plant with a self-supporting woody stem with a spread >3m, height >6m, or trunk diameter >300mm at the base. A listed set of exempt species (e.g. Privet, Camphor Laurel <10m, Radiata Pine) may be removed without approval (§2.4). Council approval is NOT required to prune or remove any tree within 5m of an existing approved dwelling or ancillary structure (§2.4). Where approval is required, an equal or greater number of replacement trees must be planted (§3.2(d)), and trees to be retained must be fenced at the drip line during construction (§3.2(f)).',
    instrumentRef: "The Hills DCP 2012 Part C Section 3 — Landscaping §2.4, §3.2",
  },
  streetscapeCharacter: {
    summary:
      'Council\'s stated intention is "to retain the predominantly natural landscapes by ensuring that new development does not have a negative impact on established streetscapes and natural environments" (§2.1); landscaping must "preserve and contribute to the Shire\'s environmental and visual character" (§1.2(i)). Street tree species/placement (where relevant) must follow §3.4.',
    instrumentRef: "The Hills DCP 2012 Part C Section 3 — Landscaping §1.2, §2.1, §3.4",
  },
  stormwaterPolicy: {
    summary:
      "Landscape works must include provision for adequate drainage, including collection/dispersal of stormwater run-off and prevention of ponding or discharge onto adjoining properties (§3.5(a)). On-site detention (OSD) tanks/above-ground structures should not be located in the front setback — the preferred location is within or under the driveway; if placed under a landscaped area, a minimum 300mm soil cover is required over the tank (§3.5(e)).",
    instrumentRef: "The Hills DCP 2012 Part C Section 3 — Landscaping §3.5",
  },
  // Sourced 2026-08 via web research corroborating the actual Hills LEP 2019
  // Land Use Table content (legislation.nsw.gov.au direct fetch was blocked;
  // this list is what multiple independent search results agreed on for
  // R2 — treat as a strong indication, not a substitute for reading the LEP
  // clause itself before relying on it for a specific proposal).
  permittedUsesByZone: {
    R2: {
      list: [
        "Dwelling houses",
        "Dual occupancies",
        "Group homes",
        "Centre-based child care facilities",
        "Respite day care centres",
        "Home-based child care",
        "Health consulting rooms",
        "Bed and breakfast accommodation",
      ],
      summary:
        "The Hills LEP 2019 Zone R2 Land Use Table permits (with consent) at least: dwelling houses, dual occupancies, group homes, centre-based child care facilities, respite day care centres, home-based child care, health consulting rooms, and bed and breakfast accommodation.",
      instrumentRef: "The Hills LEP 2019, Zone R2 Land Use Table",
    },
  },
};
