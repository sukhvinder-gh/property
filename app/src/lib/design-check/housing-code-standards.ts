/**
 * Housing Code (Codes SEPP Part 3) development standards for a new 1–2
 * storey dwelling house on a STANDARD lot (not battle-axe, corner, or
 * parallel-road), transcribed 2026-10 from the NSW Department of Planning
 * "Summary of Development Standards — Standard Lot" table (June 2018), the
 * table the current Planning Portal Housing Code page links to:
 * https://www.planningportal.nsw.gov.au/development-assessment/codes-sepp/housing-code
 * The 8.5m height limit was separately confirmed on that live page.
 *
 * The department labels the summary table "guidance only — read with the
 * Housing Code itself", so every check built on it says "verify with a
 * certifier". Lot width uses the bounding-box frontage as a proxy for width
 * at the building line (same proxy as stage7-report.ts).
 */
export const HOUSING_CODE_SOURCE = "Housing Code (Codes SEPP Part 3) — NSW Summary of Development Standards, Standard Lot";

export const HOUSING_CODE_MAX_STOREYS = 2; // cl 3.1
export const HOUSING_CODE_MAX_HEIGHT_M = 8.5; // cl 3.8

/** cl 3.9 — max gross floor area (1 car space is excluded from GFA). */
export function housingCodeMaxGfaSqm(lotSqm: number): number {
  const pctPlus = (pct: number, plus = 0) => Math.round(lotSqm * pct + plus);
  if (lotSqm <= 250) return pctPlus(0.78);
  if (lotSqm <= 300) return pctPlus(0.75);
  if (lotSqm <= 350) return 235;
  if (lotSqm <= 450) return pctPlus(0.25, 150);
  if (lotSqm <= 560) return 290;
  if (lotSqm <= 600) return pctPlus(0.25, 150);
  if (lotSqm <= 740) return 335;
  if (lotSqm <= 900) return pctPlus(0.25, 150);
  if (lotSqm <= 920) return 380;
  if (lotSqm <= 1000) return pctPlus(0.25, 150);
  return 400;
}

/**
 * cl 3.10(1)&(3) — min primary road setback where there AREN'T 2 dwelling
 * houses within 40m on the same side of the road. Where there are, the
 * setback is the average of the 2 nearest — not knowable from plans alone.
 */
export function housingCodeMinFrontSetbackM(lotSqm: number): number {
  if (lotSqm <= 300) return 3;
  if (lotSqm <= 900) return 4.5;
  if (lotSqm <= 1500) return 6.5;
  return 10;
}

/**
 * cl 3.10(10) — min rear setback for the part of the building at the given
 * height band. Returns null for the 200–250m² upper band, which is "lesser
 * of 10m or the average of the 2 adjoining dwellings" (needs neighbour data).
 */
export function housingCodeMinRearSetbackM(lotSqm: number, upperPart: boolean): number | null {
  if (!upperPart) {
    if (lotSqm <= 900) return 3;
    if (lotSqm <= 1500) return 5;
    return 10;
  }
  if (lotSqm <= 250) return null;
  if (lotSqm <= 900) return 8;
  if (lotSqm <= 1500) return 12;
  return 15;
}

/** cl 3.10(4) — min side setback for a given building height nearest that side. */
export function housingCodeMinSideSetbackM(lotWidthM: number, heightM: number): number {
  const round = (n: number) => Math.round(n * 100) / 100;
  if (lotWidthM <= 10) return heightM <= 5.5 ? 0.9 : round((heightM - 5.5) / 4 + 0.9);
  if (lotWidthM <= 18) return heightM <= 4.5 ? 0.9 : round((heightM - 4.5) / 4 + 0.9);
  if (lotWidthM <= 24) return heightM <= 4.5 ? 1.5 : round((heightM - 4.5) / 4 + 1.5);
  return 2.5;
}

/** cl 3.10(5)&(6) — lots up to 12.5m wide may build to a side boundary in some cases. */
export const HOUSING_CODE_BUILT_TO_BOUNDARY_MAX_WIDTH_M = 12.5;

/** cl 3.13(1)&(2) — min landscaped area as a % of lot area. */
export function housingCodeMinLandscapedPercent(lotSqm: number): number {
  if (lotSqm <= 300) return 10;
  if (lotSqm <= 450) return 15;
  if (lotSqm <= 600) return 20;
  if (lotSqm <= 900) return 30;
  if (lotSqm <= 1500) return 40;
  return 45;
}

/** cl 3.13(4) — min principal private open space. */
export function housingCodeMinPrivateOpenSpaceSqm(lotWidthM: number): number {
  return lotWidthM <= 10 ? 16 : 24;
}

/** cl 3.16(6) — max width of garage doors facing the road. */
export function housingCodeMaxGarageDoorWidthM(lotWidthM: number): number {
  if (lotWidthM <= 10) return 3.2;
  if (lotWidthM <= 18) return lotWidthM <= 12 ? 3.2 : 6;
  return 6;
}

/** cl 3.16 — on-lot car parking (lots 6–8m wide are exempt). */
export function housingCodeCarSpacesRequired(lotWidthM: number): number {
  return lotWidthM <= 8 ? 0 : 1;
}
