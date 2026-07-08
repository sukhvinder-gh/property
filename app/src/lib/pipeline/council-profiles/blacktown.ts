import type { CouncilProfile } from "@/lib/pipeline/council-profiles/types";

/**
 * Sourced 2026-07 from the actual Blacktown DCP 2015 PDF (Part C — Development
 * in the Residential Areas, §3 Dwelling houses), not recalled/guessed.
 */
export const blacktownProfile: CouncilProfile = {
  lgaKeyword: "blacktown",
  instrumentName: "Blacktown Development Control Plan 2015, Part C — Dwelling houses (§3.2)",
  instrumentUrl:
    "https://www.blacktown.nsw.gov.au/files/assets/public/v/4/building-and-planning/dcps-amp-lap/part-c-development-in-the-residential-areas_waste.pdf",
  setbacks: {
    frontM: 6, // §3.2.3 — standard min building line (Stanhope Gardens precinct 4.5m, not modelled)
    sideM: 0.9, // §3.2.4 — wall setback for buildings up to 2 storeys
    rearM: 3, // §3.2.3–3.2.5 — upper-storey figure for a typical 2-storey dwelling; ground floor alone can be as little as 0.9m
  },
  notes: [
    'Blacktown DCP 2015 sets no numeric site coverage or landscaped-area percentage for standard dwelling houses — only an 80m² / 6m×4m private open space minimum (§3.5.4). DCP compliance headroom scoring falls back to the generic method for that factor.',
    "Front/side setbacks (6m / 0.9m) happen to match this engine's generic statewide assumption; the rear setback (3m, upper storey) is tighter than the generic 6m default — ground-floor-only rear elements can go to 0.9m.",
    "Stanhope Gardens precinct has a reduced 4.5m front setback — not modelled here; verify separately if the lot falls in that precinct.",
  ],
};
