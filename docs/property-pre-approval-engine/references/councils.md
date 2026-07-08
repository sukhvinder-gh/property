# Councils — generic procedure + deep profiles

The engine works for **all 128 NSW LGAs** because the statutory data is statewide:
zoning/LSZ/FSR/HOB/heritage layers come from the ePlanning platform for every LEP, DA
tracking covers every council via the Planning Portal, and the Codes SEPP applies
uniformly. What varies by council is (a) DCP detail, (b) precinct/SEPP overrides,
(c) planning culture, and (d) how much DA history exists to score against.

## Generic procedure (any council, no profile needed)

1. **Resolve instruments dynamically.** Take the EPI name returned by the spatial
   lookup (e.g. "Penrith LEP 2010") — do not guess it. Locate the council's DCP on
   the council website or the Planning Portal; note its date/amendment.
2. **Check for overrides before reading the base LEP**: growth-centre precincts,
   activation precincts, SEPP (Housing), transport-oriented development provisions,
   and the Low and Mid-Rise Housing reforms can each displace base controls. Verify
   the current reform status with a web search — this area moves fast.
3. **Run Stages 2–5 exactly as normal** — they are council-agnostic.
4. **Scoring (Stage 6) with degraded confidence**: pull the council's DA statistics
   from the Planning Portal for the relevant DA type over a rolling 12 months. Then
   apply the confidence rules below.
5. **Flag the DCP gap honestly.** Without a deep profile, DCP compliance headroom is
   assessed from the DCP text alone, without knowledge of how strictly the council
   applies it. Say so in Risks & unknowns.

## Confidence rules by council tier

| Tier | Definition | Effect on report |
|---|---|---|
| Profiled | Deep profile below | Full scoring, all weights active |
| Unprofiled, data-rich | ≥30 determinations of the relevant DA type in 12 months | Full scoring; add caveat that DCP culture is unmodelled |
| Unprofiled, data-thin | <30 determinations | Cap the "council approval rate" factor contribution at half weight; widen the verdict band (e.g. report "Viable–Marginal" ranges, not a point score) |

Never present a point score for a data-thin council as if it had profiled-council
reliability. Sparse statistics look precise and are not.

## Deep profile: Blacktown City Council
- **Instruments**: Blacktown LEP 2015 + Blacktown DCP (multi-part, per development type).
- **Character**: one of the largest and fastest-growing LGAs in NSW; heavy greenfield
  release-area activity (Marsden Park, Schofields, Riverstone precincts) governed
  partly by growth-centres/precinct provisions rather than the base LEP — always check
  whether the lot sits in a release-area precinct first.
- **Assessment patterns**:
  - Strong volume of dual-occupancy and secondary-dwelling DAs — good data density.
  - Flood behaviour along South/Eastern Creek catchments recurs; check flood layers
    even where terrain looks benign.
  - Western Sydney Airport ANEF contours clip parts of the LGA's west.
  - Many new-estate lots are unregistered — apply the Stage 1 unregistered-lot rules.
- **Ops notes**: high DA volume means determination times fluctuate with backlog; use
  rolling 12-month medians, not means.

## Deep profile: The Hills Shire Council
- **Instruments**: The Hills LEP 2019 + The Hills DCP 2012 (as amended).
- **Character**: larger-lot, amenity-protective planning culture; historically more
  conservative on dual-occupancy and small-lot subdivision than Blacktown. Growth
  concentrated around Metro Northwest precincts (Kellyville, Bella Vista, Showground)
  with distinct precinct controls vs. established acreage/rural-residential areas.
- **Assessment patterns**:
  - Minimum lot size and frontage are the dominant kill-factor for subdivision —
    check these before anything else.
  - Bushfire prone land is widespread on the fringes and interacts with CDC eligibility.
  - Tree preservation and landscaping DCP controls carry unusual weight — treat
    vegetation as a cost/design factor, not noise.
- **Ops notes**: lower DA volume per type than Blacktown → wider confidence intervals;
  surface that uncertainty rather than hiding it.

## Promoting a council to a deep profile

Promote when a council reaches sustained assessment volume (product decision) or a
design partner operates there. A deep profile requires, in this structure:
1. **Instruments** — confirmed LEP + DCP names and versions
2. **Character** — planning culture, precinct/override geography
3. **Assessment patterns** — the 3–5 factors that most often decide feasibility in
   that LGA, learned from real assessments and DA statistics
4. **Ops notes** — data quirks (volume, determination-time distribution, seasonal
   backlog)

Do not copy patterns between councils; every claim in a profile must trace to that
council's own instruments or data.

## Cross-council rules
- Never transfer a control value or approval-rate statistic between councils.
- Where councils' DCPs differ on the same topic, the feasibility report shows only the
  applicable council's control — comparisons belong in the product's
  suburb-intelligence layer, not this report.
