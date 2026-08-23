export interface ParsedAddress {
  houseNumber: string;
  /** Remaining address words (street + suburb, in original order) — deliberately not
   * split into "street" vs "suburb", since that boundary is ambiguous without a
   * punctuation cue and NSW suburbs are often multi-word (e.g. "The Ponds", "Bella
   * Vista"). Matched against the NSW_Property `address` field as an ordered chain of
   * wildcarded LIKE tokens instead. */
  tokens: string[];
}

/** Strips everything except letters/digits/spaces to neutralise ArcGIS `where`-clause injection. */
function sanitize(s: string): string {
  return s
    .toUpperCase()
    .replace(/[^A-Z0-9 ]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Same injection-safety as sanitize(), but keeps hyphens — NSW_Property
 * stores consolidated/amalgamated lots (e.g. "8-12 Poole Road Kellyville",
 * verified live) with a literal hyphenated housenumber field; stripping the
 * hyphen turns "8-12" into "8 12", which never matches.
 */
function sanitizeHouseNumber(s: string): string {
  return s
    .toUpperCase()
    .replace(/[^A-Z0-9-]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Common Australia Post street-type abbreviations, expanded to the full word
 * NSW_Property's `address` field consistently uses (verified live: "ROAD",
 * "STREET", "AVENUE" etc. are always spelled out there, never abbreviated).
 * Without this, an exact-match token like "RD" never matches a stored
 * "ROAD" — "RD" is not literally a substring of "ROAD" — so a correctly
 * spelled address using the everyday abbreviation would honestly, but
 * needlessly, fail to resolve.
 *
 * Deliberately excludes "ST": genuinely ambiguous between "Street" (a
 * suffix) and "Saint" (a suburb-name prefix — St Marys, St Ives, St Clair,
 * St Andrews are all real NSW suburbs), and nothing in a flat token list
 * reliably distinguishes which. Per the "never guess" rule, "St" is left
 * unexpanded rather than risk turning "St Marys" into "Street Marys".
 */
const STREET_TYPE_EXPANSIONS: Record<string, string> = {
  RD: "ROAD",
  AVE: "AVENUE",
  AV: "AVENUE",
  CRES: "CRESCENT",
  CT: "COURT",
  CRT: "COURT",
  DR: "DRIVE",
  PL: "PLACE",
  PDE: "PARADE",
  CL: "CLOSE",
  TCE: "TERRACE",
  HWY: "HIGHWAY",
  BVD: "BOULEVARD",
  BLVD: "BOULEVARD",
  GR: "GROVE",
  CCT: "CIRCUIT",
  SQ: "SQUARE",
  GDNS: "GARDENS",
  PKWY: "PARKWAY",
  ESP: "ESPLANADE",
  LN: "LANE",
  HTS: "HEIGHTS",
  GRN: "GREEN",
  RDGE: "RIDGE",
  ALY: "ALLEY",
  CIR: "CIRCLE",
  PLZ: "PLAZA",
  PROM: "PROMENADE",
  VLG: "VILLAGE",
};

function expandStreetType(token: string): string {
  return STREET_TYPE_EXPANSIONS[token] ?? token;
}

/**
 * Best-effort parser for "NUMBER STREET[, ]SUBURB [NSW] [POSTCODE]" style
 * addresses against the NSW_Property address field (verified live: `address`
 * is a combined "STREET SUBURB" string). Comma is optional and not load-
 * bearing — splitting on a fixed word count for the suburb breaks on
 * multi-word suburbs, so instead of guessing the street/suburb boundary,
 * every remaining word becomes its own wildcarded LIKE token in order.
 * Returns null on anything it can't confidently parse — per the "never
 * guess" domain rule, an unparseable address should resolve to unknown,
 * not a wrong guess.
 */
export function parseAddress(address: string): ParsedAddress | null {
  const stripped = address
    .replace(/\bNSW\b/gi, " ")
    .replace(/\bAustralia\b/gi, " ")
    .replace(/\b\d{4}\b/g, " ")
    .replace(/,/g, " ")
    .trim();
  if (!stripped) return null;

  // Allows a hyphenated range for consolidated/amalgamated lots (e.g. "8-12",
  // "84-86") in addition to a plain number or number+letter (e.g. "7A").
  const houseMatch = stripped.match(/^(\d+[A-Za-z]?(?:-\d+[A-Za-z]?)?)\s+(.+)$/);
  if (!houseMatch) return null;

  const [, houseNumber, rest] = houseMatch;
  const tokens = sanitize(rest)
    .split(" ")
    .filter((t) => t.length > 0)
    .map(expandStreetType);
  if (tokens.length < 2) return null;

  return { houseNumber: sanitizeHouseNumber(houseNumber), tokens };
}
