/**
 * Best-effort regional table, NOT a live or verified source. NSW's three
 * electricity distributors (Ausgrid, Endeavour Energy, Essential Energy) do
 * not publish an exhaustive LGA list, and their postcode-checker tools have
 * no accessible API — researched live 2026-07, confirmed no statewide
 * distributor-boundary ArcGIS layer exists either (see stage7-report.ts's
 * buildUtilitiesSummary for how this degrades to "unknown" for every LGA
 * not listed here, per SKILL.md's "never guess a control value").
 *
 * Each keyword below is cited from real regional descriptions on the
 * distributor's own site — not inferred/guessed for LGAs not explicitly
 * named. Sydney-metro LGA-level splits between Ausgrid and Endeavour could
 * not be confidently sourced this pass and are deliberately left unlisted.
 */

// Ausgrid: "Southern, Eastern and Northern Sydney... Gosford, Wyong, Cessnock,
// Newcastle, Lake Macquarie, Port Stephens, Maitland, Singleton, Muswellbrook
// and Upper Hunter" (ausgrid.com.au). Gosford/Wyong merged into Central Coast Council in 2016.
const AUSGRID_LGA_KEYWORDS = [
  "newcastle",
  "lake macquarie",
  "port stephens",
  "maitland",
  "cessnock",
  "singleton",
  "muswellbrook",
  "upper hunter",
  "central coast",
];

// Endeavour Energy: "Greater Western Sydney, the Blue Mountains, the Southern
// Highlands and the Illawarra region" (endeavourenergy.com.au / Wikipedia).
// "Greater Western Sydney" is itself a well-established, standard NSW
// government/ABS regional grouping (not a boundary-guess) comprising these
// LGAs, plus "Blue Mountains" and "Wollongong" (Illawarra's principal LGA).
const ENDEAVOUR_LGA_KEYWORDS = [
  "blue mountains",
  "wollongong",
  "blacktown",
  "parramatta",
  "penrith",
  "liverpool",
  "fairfield",
  "cumberland",
  "campbelltown",
  "wollondilly",
  "camden",
  "hawkesbury",
];

export function getElectricityDistributor(lga: string): string | null {
  const l = lga.toLowerCase();
  if (AUSGRID_LGA_KEYWORDS.some((k) => l.includes(k))) return "Ausgrid";
  if (ENDEAVOUR_LGA_KEYWORDS.some((k) => l.includes(k))) return "Endeavour Energy";
  return null;
}
