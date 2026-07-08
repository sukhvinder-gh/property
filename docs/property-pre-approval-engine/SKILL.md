---
name: property-pre-approval-engine
description: Run a pre-DA-approval feasibility assessment for a residential property or development site in any NSW council area (all Sydney LGAs and regional NSW). Use this skill whenever the user asks about DA approval likelihood, development feasibility, zoning checks, subdivision or dual-occupancy potential, complying development (CDC) eligibility, council approval risk, or "can I build X on this lot" for any NSW address — even if they don't say "pre-approval" explicitly. Also use it for one-off NSW planning questions (CDC vs DA, granny flat rules, setbacks, what a Section 10.7 certificate is) and when adding a planning Q&A chatbot to the product. Also use it when building or testing Property Wealth OS pre-approval features (assessment logic, scoring, council data ingestion) so the domain rules and data sources stay consistent.
---

# Property Pre-Approval Engine (Sydney / NSW)

This skill defines the workflow, domain rules, and data sources for assessing a property's development feasibility **before** a Development Application (DA) is lodged — the stage no mainstream builder tool (Buildxact, Buildertrend, Procore, Built Simple) currently serves.

The output of this engine is a **Pre-Approval Feasibility Report** with a confidence score, not a legal determination. Always state that clearly: only a council DA determination, a registered certifier's CDC, or a Section 10.7 planning certificate is authoritative.

## When you run this skill

1. **Assessment mode** — the user gives an address/lot and asks about feasibility. Follow the workflow below and produce the report format.
2. **Build mode** — the user is implementing pre-approval features in code (Property Wealth OS: Next.js 15, Supabase/PostGIS, Inngest). Use the same rules and pipeline stages as the source of truth for schema design, scoring logic, and API integration. See `references/data-sources.md` for endpoint details.
3. **Chat mode** — the user asks a one-off planning question ("what's a CDC?", "can I put a granny flat on 500m² in Penrith?", "why did my score drop for flood?") without wanting a full report. Answer conversationally but under the same domain rules: no invented control values, provenance for statutory claims, and the standard disclaimer when the answer could drive a purchase or build decision. If the question actually needs lot-level data to answer honestly, say so and offer to run a full assessment instead of guessing. See `references/chatbot.md` for the in-product chatbot design (system prompt, grounding, guardrails) when in build mode.

## Core workflow (assessment pipeline)

Run the stages in order. Each stage can short-circuit to "not feasible" or downgrade confidence — record why.

### Stage 1 — Site identification
Resolve the address to a Lot/DP (deposited plan) identifier and LGA (local government area). Capture:
- Lot size (m²), frontage (m), depth, corner lot status
- LGA, and from it the applicable planning instruments. **Never hardcode the LEP name — resolve it dynamically**: the ePlanning layers return the EPI (environmental planning instrument) name and amendment date with each lookup; use that. Every NSW LGA has a principal LEP plus a DCP; some lots instead fall under precinct/SEPP provisions (growth centres, activation precincts) which override the base LEP — check this first for greenfield areas.
- **Council tier** — is this a profiled council (deep profile exists in `references/councils.md`) or an unprofiled one (use the generic procedure in the same file, and downgrade score confidence accordingly)?
- **Registration status** — support unregistered lots (new estates, off-the-plan land, common in Blacktown release areas). For unregistered lots, source dimensions from the draft plan of subdivision/estate developer data, mark every derived figure as "subject to registration", and note that a CDC generally cannot be issued until the lot is registered.

If lot dimensions cannot be confirmed, flag the whole report as **indicative only**.

### Stage 2 — Planning controls lookup
Pull the statutory controls that apply to the lot:
- **Zoning** (R1–R5, RU, E zones etc.) — determines what land uses are permissible with/without consent
- **Minimum lot size** (LSZ map) — governs subdivision potential
- **FSR** (floor space ratio) and **HOB** (height of buildings) maps
- **Heritage** (item or conservation area), **biodiversity/vegetation** layers

Never guess a control value. If a live lookup isn't possible, state the value as "verify via NSW Planning Portal / Section 10.7 certificate" rather than inventing one.

### Stage 3 — Constraints and hazards
Check overlay layers that materially affect approval likelihood and cost:
- Flood planning area / flood control lots
- Bushfire prone land (triggers BAL assessment)
- Acid sulfate soils, contamination (SEPP Resilience and Hazards)
- Easements, sewer mains (Sydney Water), stormwater drainage
- Aircraft noise (ANEF) where relevant (e.g. Western Sydney Airport for Blacktown fringe)
- **Topography** — slope/fall across the lot from contour or LiDAR data. Classify: <10% gentle, 10–20% moderate (cut/fill, drop-edge slabs), >20% steep (retaining walls, split-level designs, possible CDC complications). Slope is both a cost-adder and a design constraint.
- **Aerial imagery check** — where imagery is available, verify existing structures, mature trees, pools, and driveway crossovers that map layers won't show; flag demolition or tree-removal needs.

Each constraint is not automatically a blocker — classify as **blocker / cost-adder / documentation-adder** with a short rationale.

### Stage 4 — Buildable envelope & footprint fit
Derive the buildable envelope by subtracting from the lot polygon: front/side/rear setbacks (per DCP or Codes SEPP depending on pathway), easements, sewer-main offsets, flood extents, and required landscaped/private open space. Then:
- Report the envelope area and its usable dimensions — this is the honest answer to "what can I actually fit here"
- If the user has a target dwelling (e.g. a builder's standard design, dual-occ pair, granny flat), test whether its footprint fits inside the envelope with driveway/parking, and report the margin or the breach
- Check site coverage and landscaped-area ratios against the applicable controls
- Note orientation effects (solar access, overshadowing to the south) as design risk, not blockers

In build mode this is the PostGIS negative-buffer operation over the lot polygon; in assessment mode without spatial tooling, compute it arithmetically from lot dimensions and state the assumptions.

### Stage 5 — Pathway determination
Determine the fastest viable approval pathway, in this order of preference:
1. **Exempt development** — no approval needed (minor works only)
2. **Complying Development Certificate (CDC)** under the Codes SEPP — private certifier, typically ~20 days; check exclusion triggers (heritage, flood control lot, bushfire in some cases, lot size/frontage minimums)
3. **DA to council** — required when CDC exclusions apply or the proposal exceeds code limits
4. **State pathways** (rare for this product's scope)

Also check whether the NSW **Low and Mid-Rise Housing** reforms or dual-occupancy permissibility changes affect the site — these have been changing since 2024, so verify current status with a web search rather than relying on memory.

### Stage 6 — Approval likelihood scoring
Produce a 0–100 confidence score from weighted factors. Default weights (tune per council as data accumulates):

| Factor | Weight | Notes |
|---|---|---|
| Zoning permits proposed use | 30 | Hard gate — if impermissible, score caps at 10 |
| Lot size/frontage vs controls | 20 | Include % margin above minimums |
| Constraint severity | 20 | Blockers weigh heaviest |
| Council historical approval rate for this DA type | 15 | From DA tracking data (Planning Portal) — apply the council-tier confidence rules in `references/councils.md` (data-thin councils get half weight and a banded verdict, not a point score) |
| DCP compliance headroom (setbacks, landscaping, parking) | 10 | |
| Neighbour/objection risk proxies | 5 | Corner lots, battle-axe, overshadowing south neighbours |

Report the score with a band: **Strong (75+), Viable (50–74), Marginal (30–49), Unlikely (<30)** and always list the top 3 score drivers.

### Stage 7 — Report generation
Use this exact structure:

```
# Pre-Approval Feasibility Report — [Address]
## Verdict
[Band + score + one-sentence summary + recommended pathway (CDC/DA)]
## Site profile
[Lot/DP, LGA, zone, lot size, frontage, registration status, slope class, key map controls]
## What you can likely build
[Permissible uses relevant to the user's goal; subdivision/dual-occ/granny-flat potential]
## Buildable envelope
[Envelope area & dimensions after setbacks/easements; footprint fit result if a design was tested]
## Constraints
[Table: constraint | classification (blocker/cost/docs) | impact]
## Site cost signals
[Indicative cost-adders only, no dollar figures unless the user supplies rates: slope/cut-fill,
retaining, flood (raised floor/OSD), bushfire (BAL construction), rock risk, service connections,
demolition/tree removal from imagery check]
## Approval pathway & timeline
[CDC vs DA, indicative timeline, certifier vs council]
## Document checklist
[What the chosen pathway will require, e.g.: survey plan, BASIX certificate, statement of
environmental effects (DA), bushfire assessment/BAL report, flood study, arborist report,
waste management plan, Section 10.7 certificate — tailored to the constraints found]
## Risks & unknowns
[Everything unverified, with how to verify it — 10.7 certificate, survey, council pre-DA meeting]
## Next steps
[Ordered, concrete actions]
## Disclaimer
[Not legal/planning advice; controls change; verify against current LEP/Portal]
```

Site cost signals are qualitative flags, not a quote — this engine identifies *what will cost money*, not *how much*. Never invent dollar estimates; if the user wants costing, that's a downstream module fed by these flags.

## Domain rules to hold constant

- **LEP beats DCP**: LEP controls are statutory; DCP controls are guidelines councils weigh under s4.15. A DCP variation is arguable; an LEP breach usually needs a Clause 4.6 variation request (hard).
- **Granny flats (secondary dwellings)**: broadly available via CDC in residential zones on lots ≥450 m² (max 60 m² dwelling) — but verify current Codes SEPP figures before quoting them.
- **Dual occupancy and subdivision rules are the most council-divergent controls** — never generalise from Blacktown to Hills Shire or vice versa. See the per-council reference files.
- **Battle-axe lots**: access handle width and lot-size-excluding-handle rules commonly break otherwise-viable subdivisions; check them explicitly.
- **Data recency**: NSW planning law reformed heavily 2024–2026. For anything statutory quoted with a number (lot sizes, FSR, reform status), verify with a live source when available.

## Reference files

- `references/data-sources.md` — NSW Planning Portal / ePlanning APIs, spatial layers, DA tracking feeds, and how they map to pipeline stages. Read when in build mode or doing live lookups.
- `references/councils.md` — how to assess in **any** NSW council: the generic per-council procedure, confidence rules for unprofiled councils, deep profiles for Blacktown City and The Hills Shire, and the template for promoting a council to a deep profile. Read for every assessment.
- `references/chatbot.md` — chat-mode answering rules and the in-product chatbot design (grounding hierarchy, guardrails, system prompt shape, Anthropic API integration). Read when answering conversational planning questions or building the chatbot feature.

## Build-mode notes (Property Wealth OS)

- Model each pipeline stage as an Inngest step so a failed council API call retries without re-running the whole assessment.
- Store raw control lookups (with source, timestamp, layer version) separately from derived scores in Supabase — scores are recomputable; raw evidence is not.
- Use PostGIS for overlay intersection (lot polygon × flood/bushfire/heritage layers) instead of point-in-polygon on the address centroid; centroids miss partial-lot constraints.
- Every report must serialise its "unknowns" list — the UI should never render a score without its caveats.
