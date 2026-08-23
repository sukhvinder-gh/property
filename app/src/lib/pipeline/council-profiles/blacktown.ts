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
  streetscapeCharacter: {
    summary:
      'General DCP objective: "encourage high quality development that contributes to the existing or desired future character of the area, with particular emphasis on the integration of buildings with a landscaped setting."',
    instrumentRef: "Blacktown DCP 2015 §1.4(e)",
  },
  stormwaterPolicy: {
    summary:
      "Development plans must include a drainage plan showing the proposed means of connecting stormwater discharge into an acceptable drainage system; larger developments also engage Part J (Water Sensitive Urban Design / Integrated Water Cycle Management).",
    instrumentRef: "Blacktown DCP 2015 §2.2, Part J",
  },
  treePreservation: {
    summary:
      "Ties into \"prescribed trees\" under Blacktown LEP 2015 cl 5.9 — existing trees are to be preserved where feasible; changing ground levels near retained trees should be avoided, with retaining walls preferred over filling around root zones.",
    instrumentRef: "Blacktown DCP 2015 §4.3 / Blacktown LEP 2015 cl 5.9",
  },
  // Full text of the Land Use Table supplied directly by the user 2026-08,
  // copied from the current in-force page at legislation.nsw.gov.au (every
  // automated fetch of this instrument was blocked from this session).
  // Superseded and corrected an earlier, web-research-sourced version of
  // this list that turned out to be wrong in places once checked against
  // the real table — e.g. R2 does NOT include "Boarding houses", R3 does
  // NOT include "Dual occupancies" — exactly the failure mode careful
  // sourcing is meant to catch. Lists below are the full "permitted with
  // consent" column, minus pure infrastructure/admin/niche entries (roads,
  // signage, aquaculture, water reticulation, environmental/flood works)
  // that aren't meaningful answers to "what can I build".
  permittedUsesByZone: {
    R1: {
      list: [
        "Attached dwellings",
        "Bed and breakfast accommodation",
        "Boarding houses",
        "Centre-based child care facilities",
        "Community facilities",
        "Dual occupancies",
        "Dwelling houses",
        "Group homes",
        "Hostels",
        "Multi dwelling housing",
        "Neighbourhood shops",
        "Places of public worship",
        "Residential flat buildings",
        "Respite day care centres",
        "Semi-detached dwellings",
        "Seniors housing",
        "Shop top housing",
      ],
      summary: "The Blacktown LEP 2015 Zone R1 Land Use Table's full \"permitted with consent\" list (infrastructure/admin entries omitted).",
      instrumentRef: "Blacktown LEP 2015, Zone R1 Land Use Table (full text, supplied by user)",
    },
    R2: {
      list: [
        "Bed and breakfast accommodation",
        "Centre-based child care facilities",
        "Community facilities",
        "Dual occupancies",
        "Dwelling houses",
        "Group homes",
        "Health consulting rooms",
        "Places of public worship",
        "Respite day care centres",
        "Seniors housing",
      ],
      summary: "The Blacktown LEP 2015 Zone R2 Land Use Table's full \"permitted with consent\" list (infrastructure/admin entries omitted). Notably does NOT include boarding houses, multi dwelling housing, or residential flat buildings.",
      instrumentRef: "Blacktown LEP 2015, Zone R2 Land Use Table (full text, supplied by user)",
    },
    R3: {
      list: [
        "Attached dwellings",
        "Bed and breakfast accommodation",
        "Boarding houses",
        "Centre-based child care facilities",
        "Community facilities",
        "Dwelling houses",
        "Group homes",
        "Home occupations",
        "Multi dwelling housing",
        "Neighbourhood shops",
        "Places of public worship",
        "Respite day care centres",
        "Seniors housing",
        "Shop top housing",
      ],
      summary: "The Blacktown LEP 2015 Zone R3 Land Use Table's full \"permitted with consent\" list (infrastructure/admin entries omitted). Notably does NOT include dual occupancies or residential flat buildings.",
      instrumentRef: "Blacktown LEP 2015, Zone R3 Land Use Table (full text, supplied by user)",
    },
    R4: {
      list: [
        "Boarding houses",
        "Centre-based child care facilities",
        "Community facilities",
        "Dwelling houses",
        "Home occupations",
        "Hotel or motel accommodation",
        "Neighbourhood shops",
        "Places of public worship",
        "Residential flat buildings",
        "Respite day care centres",
        "Seniors housing",
        "Serviced apartments",
        "Shop top housing",
      ],
      summary: "The Blacktown LEP 2015 Zone R4 Land Use Table's full \"permitted with consent\" list (infrastructure/admin entries omitted). Notably does NOT include dual occupancies or multi dwelling housing.",
      instrumentRef: "Blacktown LEP 2015, Zone R4 Land Use Table (full text, supplied by user)",
    },
  },
  // Full text of cl 4.1B and 4.1C supplied directly by the user 2026-08
  // (same session, same blocked-fetch situation as the Land Use Table
  // above). Blacktown's table is narrower than Hills Shire's cl 4.1A — no
  // R4 entries at all, and no "manor house" provision exists in this LEP.
  // "Attached dwelling" (R3, 900m²) is its own distinct row, separate from
  // dual occupancy.
  minLotSizeByUseAndZone: {
    "Attached dwelling": {
      R3: { areaSqm: 900, clauseRef: "Blacktown LEP 2015 cl 4.1B" },
    },
    "Dual occupancy (attached)": {
      R2: { areaSqm: 500, clauseRef: "Blacktown LEP 2015 cl 4.1B" },
    },
    "Dual occupancy (detached)": {
      // cl 4.1B (500/600m²) only gates DEVELOPMENT CONSENT to build it —
      // splitting it into 2 separately-titled lots afterward is a further,
      // separate test under cl 4.1C: each resulting lot must independently
      // meet this site's own Lot Size Map minimum (planningControls.
      // minLotSizeSqm), UNLESS it's a corner lot with each dwelling
      // fronting a different road, in which case each lot only needs
      // ≥300m². This is the actual "can I get 2 separate Torrens titles"
      // test for a Blacktown detached duplex — surfaced in the clause
      // citation itself so it reaches the report/chat without a new field.
      R2: {
        areaSqm: 600,
        clauseRef:
          "Blacktown LEP 2015 cl 4.1B (consent to build). Splitting it into 2 separate titles afterward is a further test under cl 4.1C: each resulting lot must meet this site's own Lot Size Map minimum, or ≥300m² each if it's a corner lot with each dwelling fronting a different road",
      },
    },
    "Multi dwelling housing": {
      R3: { areaSqm: 1800, clauseRef: "Blacktown LEP 2015 cl 4.1B" },
    },
  },
};
