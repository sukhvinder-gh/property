/**
 * NSW Housing SEPP 2021 secondary dwelling (granny flat) CDC thresholds.
 * Verified current 2026-07 via NSW Planning Portal — see
 * docs/property-pre-approval-engine/SKILL.md's "data recency" domain rule
 * (these figures have changed repeatedly since 2024, so they're deliberately
 * centralised here rather than duplicated, and dated so a future check knows
 * when to re-verify).
 *
 * These happen to coincide with the primary dwelling's own assumed CDC lot
 * size/frontage minimums (stage5-pathway.ts) — shared here so both only need
 * updating in one place if either Codes SEPP figure changes.
 */
export const SECONDARY_DWELLING_MIN_LOT_SQM = 450;
export const SECONDARY_DWELLING_MIN_FRONTAGE_M = 12;

/**
 * Housing Code (Codes SEPP) default minimums for a NEW dwelling house via
 * CDC — distinct from the secondary-dwelling figures above. Verified live
 * 2026-08 against the NSW Planning Portal's own Housing Code page
 * (planningportal.nsw.gov.au/development-assessment/codes-sepp/housing-code):
 * "The area of the lot must not be less than 200 square metres" and "the
 * width of the lot must not be less than 6m measured at the building line".
 * This is the Code's own default — where the site's LEP specifies its own
 * minimum lot size (planningControls.minLotSizeSqm, live LSZ layer), that
 * LEP figure applies instead of the 200m² default, per the Housing Code's
 * cross-reference to the applicable LEP standard.
 */
export const NEW_DWELLING_HOUSE_DEFAULT_MIN_LOT_SQM = 200;
export const NEW_DWELLING_HOUSE_MIN_WIDTH_M = 6;
