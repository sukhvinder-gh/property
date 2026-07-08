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
};
