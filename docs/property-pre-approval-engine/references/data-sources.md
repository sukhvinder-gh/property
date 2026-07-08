# Data sources — NSW pre-approval pipeline

How each pipeline stage maps to NSW government data. Endpoint paths and layer names change; treat the entries below as the *category* of source to use and verify current endpoints in the NSW ePlanning developer documentation before wiring anything into production.

## Stage 1 — Site identification
- **NSW Spatial Services (Six Maps / NSW Point)**: address → geocode → Lot/DP resolution, cadastre polygons.
- **NSW Cadastre (Digital Cadastral Database)**: lot boundaries and dimensions for frontage/depth calculation via PostGIS.

## Stage 2 — Planning controls
- **NSW ePlanning Spatial Viewer / Planning Portal APIs**: statewide layers for land zoning, minimum lot size (LSZ), FSR, height of buildings (HOB), heritage. These are published per-EPI and aggregated statewide — always record the EPI name and amendment date returned with the layer.
- **Legislation NSW**: authoritative text of Blacktown LEP 2015, The Hills LEP 2019, Codes SEPP — for clause-level checks the spatial layers can't answer (e.g. dual-occ permissibility wording, Clause 4.6 provisions).

## Stage 3 — Constraints
- **Flood**: council flood studies + Planning Portal flood-related layers; "flood control lot" flags matter specifically for CDC eligibility.
- **Bushfire prone land**: NSW RFS BPL mapping (via Planning Portal layers).
- **Sydney Water**: sewer/water main locations (Tap in / eDeveloper products) — affects build-over-sewer and OSD requirements.
- **Acid sulfate soils / contamination**: LEP ASS maps; contamination is largely council records + s10.7.
- **Topography**: NSW Spatial Services elevation/LiDAR data (DEMs, contour derivation) via ELVIS / Foundation Spatial Data; derive lot slope % in PostGIS from the DEM clipped to the cadastre polygon.
- **Aerial imagery**: NSW Spatial Services aerial imagery services for baseline; commercial providers (e.g. Nearmap-class, quarterly refresh) if the product needs current-structure detection. Imagery is evidence for the "existing conditions" check, never a substitute for survey.

## Stage 4 — Buildable envelope
- Computed, not sourced: PostGIS negative buffers on the cadastre polygon using setback values from the applicable DCP/Codes SEPP, minus easement polygons (from the DP/title) and constraint extents from Stage 3 layers. Easement data quality varies — if the plan image can't be parsed, list easements as an unknown.

## Stage 5 — Pathway
- **Codes SEPP (State Environmental Planning Policy — Exempt and Complying Development Codes 2008)**: the rulebook for exempt/CDC eligibility. Encode exclusion triggers as data, not code branches, so they can be updated when the SEPP is amended.
- **Low and Mid-Rise Housing policy**: check current status via web search before relying on it — rollout and council carve-outs have shifted repeatedly since late 2024.

## Stage 6 — Approval likelihood
- **DA tracking (Planning Portal Online DA service / council DA registers)**: DAs lodged/determined per LGA, determination outcomes, assessment durations. This is the differentiating dataset — approval rates and mean determination days per DA type per council feed the scoring weights.
- Persist per-council rolling statistics (12-month window) rather than all-time averages; council behaviour drifts with staffing and policy.

## General rules
- Cache spatial lookups with layer version + retrieval timestamp; invalidate on EPI amendment, not on a fixed TTL.
- Every fact surfaced to a user carries provenance: source, layer/EPI, date retrieved.
- If a source is down, degrade to "unverified" for that field — never substitute a remembered or typical value.
