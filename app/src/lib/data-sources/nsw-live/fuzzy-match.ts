/**
 * Fuzzy fallback for address resolution. The NSW_Property address search is
 * exact-substring only — a common spelling variant (Allan/Alan, "St"/"Street")
 * silently resolves to nothing. This module scores candidate records against
 * the parsed query tokens so a near-miss on the *street name* still resolves
 * to the correct, real property — it never changes what data is returned for
 * a matched property, only which real record counts as "the match".
 */

const STREET_TYPE_CANON: Record<string, string> = {
  ST: "STREET",
  STREET: "STREET",
  RD: "ROAD",
  ROAD: "ROAD",
  AV: "AVENUE",
  AVE: "AVENUE",
  AVENUE: "AVENUE",
  PL: "PLACE",
  PLACE: "PLACE",
  DR: "DRIVE",
  DRIVE: "DRIVE",
  CT: "COURT",
  COURT: "COURT",
  CRES: "CRESCENT",
  CRESCENT: "CRESCENT",
  CL: "CLOSE",
  CLOSE: "CLOSE",
  PDE: "PARADE",
  PARADE: "PARADE",
  HWY: "HIGHWAY",
  HIGHWAY: "HIGHWAY",
  LN: "LANE",
  LANE: "LANE",
  BVD: "BOULEVARDE",
  BLVD: "BOULEVARDE",
  BOULEVARD: "BOULEVARDE",
  BOULEVARDE: "BOULEVARDE",
  CCT: "CIRCUIT",
  CIRCUIT: "CIRCUIT",
  ESP: "ESPLANADE",
  ESPLANADE: "ESPLANADE",
  TCE: "TERRACE",
  TERRACE: "TERRACE",
};

function canon(token: string): string {
  return STREET_TYPE_CANON[token] ?? token;
}

function levenshtein(a: string, b: string): number {
  const dp: number[][] = Array.from({ length: a.length + 1 }, () => new Array(b.length + 1).fill(0));
  for (let i = 0; i <= a.length; i++) dp[i][0] = i;
  for (let j = 0; j <= b.length; j++) dp[0][j] = j;
  for (let i = 1; i <= a.length; i++) {
    for (let j = 1; j <= b.length; j++) {
      dp[i][j] = a[i - 1] === b[j - 1] ? dp[i - 1][j - 1] : 1 + Math.min(dp[i - 1][j - 1], dp[i - 1][j], dp[i][j - 1]);
    }
  }
  return dp[a.length][b.length];
}

function tokenSimilarity(a: string, b: string): number {
  const ca = canon(a);
  const cb = canon(b);
  if (ca === cb) return 1;
  const maxLen = Math.max(ca.length, cb.length);
  if (maxLen === 0) return 1;
  return 1 - levenshtein(ca, cb) / maxLen;
}

/** Average, over each query token, of its best similarity to any token in the candidate text. */
export function addressSimilarity(queryTokens: string[], candidateAddress: string): number {
  const candidateTokens = candidateAddress
    .toUpperCase()
    .split(/\s+/)
    .filter(Boolean);
  if (queryTokens.length === 0 || candidateTokens.length === 0) return 0;

  let total = 0;
  for (const qt of queryTokens) {
    let best = 0;
    for (const ct of candidateTokens) {
      const sim = tokenSimilarity(qt, ct);
      if (sim > best) best = sim;
    }
    total += best;
  }
  return total / queryTokens.length;
}

/** Below this, treat as unresolved rather than guessing — tuned so a single-letter
 * street-name typo (e.g. Allan/Alan) still passes but an unrelated street doesn't. */
export const FUZZY_MATCH_THRESHOLD = 0.72;
