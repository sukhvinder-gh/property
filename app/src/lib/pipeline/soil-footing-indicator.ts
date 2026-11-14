/**
 * Indicative footing ground conditions from the regional Great Soil Group
 * (NSW Soils_GSG layer). Maps each group to the AS 2870 site-class range its
 * typical profile usually falls in:
 *
 *  - sands, shallow soils over rock, light alluvium → A–S (little shrink/swell)
 *  - massive "earths" and well-structured soils → S–M
 *  - texture-contrast soils with a clay subsoil (podzolics, solodics,
 *    red-brown earths …; e.g. most Wianamatta shale country in Western Sydney) → M–H1
 *  - cracking clays (black earths, grey/brown/red clays …) → H1–E
 *  - peats, gleys, saline soils → P (problem site) possible
 *
 * This is a regional-mapping indicator, not a site classification: only a
 * geotechnical investigation on the lot sets the actual AS 2870 class.
 */

export type FootingIndicator = {
  range: "A–S" | "S–M" | "M–H1" | "H1–E" | "P";
  summary: string;
  /** True when the likely ground adds real footing cost or design work. */
  costly: boolean;
};

const GROUPS: Record<FootingIndicator["range"], string[]> = {
  "A–S": ["SS", "ES", "KS", "P", "HP", "PP", "L", "Al", "TR", "R"],
  "S–M": ["YE", "REl", "REm", "KRE", "X", "K", "DL", "RBH", "GBK_RK", "BRE", "AHS"],
  "M–H1": ["RPm", "RPl", "YPm", "YPl", "GBP", "BP", "GP", "LP", "SC", "SDS", "SH", "RBE", "NKB", "SB", "E", "C", "Amh"],
  "H1–E": ["BE", "GC_BC_RC", "GCgs_BCgs_RCgs", "W", "CH", "PS"],
  P: ["ACP", "NP_AP", "HG", "SK"],
};

const SUMMARY: Record<FootingIndicator["range"], { summary: string; costly: boolean }> = {
  "A–S": { summary: "sandy, shallow or rocky ground — usually little shrink/swell, so standard slab and footings", costly: false },
  "S–M": { summary: "earthy soils with modest clay — usually standard to moderately stiffened slab", costly: false },
  "M–H1": { summary: "clay subsoil that swells and shrinks with moisture — expect a stiffened raft slab (common in Sydney)", costly: false },
  "H1–E": { summary: "highly reactive cracking clay — expect a heavily stiffened slab or piers, a noticeable cost", costly: true },
  P: { summary: "soft, organic, wet or saline ground possible — may need engineer-designed footings (class P)", costly: true },
};

export function footingIndicator(soilTypeCode: string | null | undefined): FootingIndicator | null {
  if (!soilTypeCode) return null;
  const range = (Object.keys(GROUPS) as FootingIndicator["range"][]).find((r) => GROUPS[r].includes(soilTypeCode));
  return range ? { range, ...SUMMARY[range] } : null;
}
