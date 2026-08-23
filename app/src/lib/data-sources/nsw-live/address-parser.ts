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

  const houseMatch = stripped.match(/^(\d+[A-Za-z]?)\s+(.+)$/);
  if (!houseMatch) return null;

  const [, houseNumber, rest] = houseMatch;
  const tokens = sanitize(rest)
    .split(" ")
    .filter((t) => t.length > 0);
  if (tokens.length < 2) return null;

  return { houseNumber: sanitize(houseNumber), tokens };
}
