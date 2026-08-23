export interface CouncilControlNote {
  /** Real, cited qualitative text — never fabricated. */
  summary: string;
  /** Citation, e.g. "Blacktown DCP 2015 §1.4(e)". */
  instrumentRef: string;
}

export interface CouncilProfile {
  /** Substring match against the resolved LGA name (lowercased). */
  lgaKeyword: string;
  /** Cited DCP name, part/section, and currency date — surfaced in report provenance. */
  instrumentName: string;
  instrumentUrl: string;
  setbacks: {
    frontM: number;
    sideM: number;
    rearM: number;
  };
  /** Total impervious/site coverage cap, if the DCP specifies one. */
  siteCoverageMaxPercent?: number;
  /** Dwelling footprint cap specifically, if distinct from siteCoverageMaxPercent. */
  footprintMaxPercent?: number;
  landscapedAreaMinPercent?: number;
  /** Qualitative caveats — precinct overrides, storey-dependent nuance, what's NOT modelled. */
  notes: string[];
  // Section 2 "Council Controls" topics — each optional; omit rather than guess
  // when no verified, correctly-scoped (standard dwelling house) source was found.
  treePreservation?: CouncilControlNote;
  streetscapeCharacter?: CouncilControlNote;
  stormwaterPolicy?: CouncilControlNote;
  viewSharing?: CouncilControlNote;
  /**
   * LEP Land Use Table "permitted with consent" entries, verified against
   * this specific council's own LEP for the given zone code — takes
   * priority over the generic Standard Instrument table in
   * zone-land-use-table.ts when present. Keyed by zone code (e.g. "R2").
   * Omit a zone rather than guess its list from another council's LEP.
   */
  permittedUsesByZone?: Record<string, CouncilControlNote & { list: string[] }>;
}
