/**
 * NSW Standard Instrument—Principal LEP land use table, "permitted with
 * consent" column, for residential zones. This is the state-wide template
 * most councils build their own LEP from — but every council CAN and does
 * add/remove specific uses in their own Land Use Table, so this is
 * deliberately labelled "typical for this zone" everywhere it's surfaced,
 * never a confirmed list for a specific address. Administrative/
 * infrastructure entries (roads, signage) are omitted — this is about what
 * you can build, not zone administration.
 *
 * Sourced from the Standard Instrument (2026-08 web research against
 * legislation.nsw.gov.au-derived summaries, cross-checked across
 * independent searches) — only zones with reasonably complete, corroborated
 * source material are included. R1/R5 and rural zones are deliberately left
 * out rather than publish a list built from thin/uncertain sourcing; see
 * stage7-report.ts's buildPermittedUses for the honest fallback when a zone
 * isn't in this table.
 */
export const STANDARD_ZONE_LAND_USE_TABLE: Record<string, string[]> = {
  R2: [
    "Dwelling houses",
    "Attached dwellings",
    "Semi-detached dwellings",
    "Dual occupancies",
    "Multi dwelling housing",
    "Residential flat buildings",
    "Boarding houses",
    "Bed and breakfast accommodation",
    "Child care centres",
    "Community facilities",
    "Group homes",
    "Hostels",
    "Neighbourhood shops",
    "Places of public worship",
    "Seniors housing",
    "Serviced apartments",
    "Shop top housing",
  ],
  R3: [
    "Dwelling houses",
    "Attached dwellings",
    "Dual occupancies",
    "Multi dwelling housing",
    "Boarding houses",
    "Centre-based child care facilities",
    "Community facilities",
    "Group homes",
    "Neighbourhood shops",
    "Places of public worship",
    "Respite day care centres",
    "Seniors housing",
    "Residential flat buildings (in some LEPs)",
    "Terraces (in some LEPs)",
  ],
  R4: [
    "Residential flat buildings",
    "Multi dwelling housing",
    "Boarding houses",
    "Seniors housing",
    "Secondary dwellings",
    "Group homes",
    "Shop top housing",
    "Neighbourhood shops (in some LEPs)",
    "Child care centres (in some LEPs)",
  ],
};
