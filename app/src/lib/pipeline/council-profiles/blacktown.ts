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
  // Sourced 2026-08 via web research corroborating the actual Blacktown LEP
  // 2015 Land Use Table content (legislation.nsw.gov.au direct fetch was
  // blocked; council's own fact-sheet PDF also blocked WebFetch). R2 is
  // corroborated across independent searches — treat as a strong indication.
  // R4 sourcing was thinner (one search only partially enumerated the list),
  // so it's a shorter, more conservatively hedged list. A specific numeric
  // dual-occupancy minimum lot size was also researched but NOT included
  // here — sources disagreed (500-600m², 450-500m², "varies by precinct")
  // and this engine doesn't publish a figure it can't pin down confidently.
  permittedUsesByZone: {
    R2: {
      list: [
        "Dwelling houses",
        "Dual occupancies",
        "Bed and breakfast accommodation",
        "Boarding houses",
        "Community facilities",
        "Group homes",
        "Seniors housing",
      ],
      summary:
        "The Blacktown LEP 2015 Zone R2 Land Use Table permits (with consent) at least: dwelling houses, dual occupancies, bed and breakfast accommodation, boarding houses, community facilities, group homes, and seniors housing.",
      instrumentRef: "Blacktown LEP 2015, Zone R2 Land Use Table",
    },
    R4: {
      list: ["Residential flat buildings", "Dwelling houses", "Boarding houses", "Community facilities"],
      summary:
        "The Blacktown LEP 2015 Zone R4 Land Use Table permits (with consent) at least: residential flat buildings, dwelling houses, boarding houses, and community facilities — sourcing for this zone was thinner than R2, so this list is more likely to be incomplete.",
      instrumentRef: "Blacktown LEP 2015, Zone R4 Land Use Table",
    },
  },
};
