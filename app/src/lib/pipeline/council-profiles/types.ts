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
}
