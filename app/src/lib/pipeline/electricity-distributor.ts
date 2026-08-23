/**
 * Best-effort regional table, NOT a live or verified source. NSW's three
 * electricity distributors (Ausgrid, Endeavour Energy, Essential Energy)
 * partition the whole state with no overlaps — their own published network
 * maps are the source here, not this engine's guess — but the exact LGA
 * boundary for a lot right on a network edge is not guaranteed; the report
 * always carries the "confirm before relying on this" caveat regardless of
 * which distributor is returned. See stage7-report.ts's buildUtilitiesSummary
 * for how an LGA matching neither metro list falls back to Essential Energy
 * by elimination (see below) rather than "unknown", since Essential Energy's
 * own territory is explicitly "everywhere else in NSW".
 */

// Ausgrid: "Southern, Eastern and Northern Sydney... Gosford, Wyong, Cessnock,
// Newcastle, Lake Macquarie, Port Stephens, Maitland, Singleton, Muswellbrook
// and Upper Hunter" (ausgrid.com.au). Gosford/Wyong merged into Central Coast
// Council in 2016. "Southern, Eastern and Northern Sydney" is Ausgrid's own
// wording for its well-documented, stable Sydney-metro LGA footprint.
const AUSGRID_LGA_KEYWORDS = [
  // Hunter / Central Coast
  "newcastle",
  "lake macquarie",
  "port stephens",
  "maitland",
  "cessnock",
  "singleton",
  "muswellbrook",
  "upper hunter",
  "central coast",
  // Sydney metro — inner, eastern, northern, southern (non-Endeavour) LGAs
  "city of sydney",
  "inner west",
  "canada bay",
  "burwood",
  "strathfield",
  "ryde",
  "hunters hill",
  "lane cove",
  "north sydney",
  "willoughby",
  "mosman",
  "ku-ring-gai",
  "hornsby",
  "northern beaches",
  "woollahra",
  "waverley",
  "randwick",
  "bayside",
  "georges river",
  "canterbury-bankstown",
  "sutherland",
];

// Endeavour Energy: "Greater Western Sydney, the Blue Mountains, the Southern
// Highlands and the Illawarra region" (endeavourenergy.com.au / Wikipedia).
// "Greater Western Sydney" is itself a well-established, standard NSW
// government/ABS regional grouping (not a boundary-guess) comprising these
// LGAs, plus "Blue Mountains" and "Wollongong" (Illawarra's principal LGA)
// and "Wingecarribee" (the LGA name for the Southern Highlands).
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
  "the hills shire",
  "wingecarribee",
];

/**
 * Returns the distributor name plus whether it was matched from a specific
 * LGA list (higher confidence) or reached by elimination (Essential Energy
 * covers the rest of NSW by definition, but the exact edge of the Ausgrid/
 * Endeavour metro footprints above isn't independently confirmed here).
 */
export function getElectricityDistributor(lga: string): { name: string; byElimination: boolean } | null {
  const l = lga.toLowerCase();
  if (l.startsWith("unresolved")) return null;
  if (AUSGRID_LGA_KEYWORDS.some((k) => l.includes(k))) return { name: "Ausgrid", byElimination: false };
  if (ENDEAVOUR_LGA_KEYWORDS.some((k) => l.includes(k))) return { name: "Endeavour Energy", byElimination: false };
  return { name: "Essential Energy", byElimination: true };
}

// Hunter Water's own service area: Newcastle, Lake Macquarie, Cessnock,
// Maitland, Port Stephens, Singleton, Dungog, and Muswellbrook
// (hunterwater.com.au). Central Coast Council runs its own water utility
// (not Hunter Water or Sydney Water). Sydney Water's area is, per its own
// published network, Greater Sydney, the Blue Mountains, and the Illawarra —
// i.e. the same metro/Illawarra footprint as the Ausgrid+Endeavour LGA lists
// above, minus the Hunter/Central Coast entries.
const HUNTER_WATER_LGA_KEYWORDS = ["newcastle", "lake macquarie", "cessnock", "maitland", "port stephens", "singleton", "dungog", "muswellbrook"];
const CENTRAL_COAST_KEYWORD = "central coast";
const SYDNEY_WATER_LGA_KEYWORDS = [...AUSGRID_LGA_KEYWORDS, ...ENDEAVOUR_LGA_KEYWORDS].filter(
  (k) => !HUNTER_WATER_LGA_KEYWORDS.includes(k) && k !== CENTRAL_COAST_KEYWORD
);

/** Returns null when the LGA is outside the Sydney/Hunter/Central Coast utilities — dozens of small regional NSW LGAs run their own local water utility and can't be named without guessing which one. */
export function getWaterUtility(lga: string): string | null {
  const l = lga.toLowerCase();
  if (l.startsWith("unresolved")) return null;
  if (HUNTER_WATER_LGA_KEYWORDS.some((k) => l.includes(k))) return "Hunter Water";
  if (l.includes(CENTRAL_COAST_KEYWORD)) return "Central Coast Council (operates its own water utility)";
  if (SYDNEY_WATER_LGA_KEYWORDS.some((k) => l.includes(k))) return "Sydney Water";
  return null;
}
