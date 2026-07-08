# Chatbot — conversational Q&A over pre-approval data

Design for the in-product chatbot ("ask about this property" / general planning Q&A) and
the rules Claude follows when answering planning questions conversationally.

## Two chat contexts

1. **Property-grounded chat** — the user is viewing a property that has an assessment
   record. Inject the full assessment JSON (site profile, controls with provenance,
   constraints, envelope, score factors, unknowns) into the system prompt. The bot
   answers *from that record*, quoting the stored provenance (layer, EPI, retrieval
   date) — it never re-derives control values from model memory.
2. **General planning chat** — no property in context. The bot answers concept and
   process questions (CDC vs DA, what a 10.7 certificate is, how setbacks work) and
   converts anything lot-specific into a prompt to run an assessment: "That depends on
   the lot's zone and minimum lot size — want me to check a specific address?"

## Answering rules (both contexts)

- **Grounding hierarchy**: assessment record > live lookup > "I don't have that —
  here's how to verify it". Model memory is never a source for a statutory number.
- **Score explainability**: when asked "why is my score X?", answer from the stored
  factor breakdown (Stage 6 weights and the top-3 drivers), in plain language. Never
  rationalise a score post-hoc from general knowledge.
- **Uncertainty is content, not failure**: for data-thin councils or unverified fields,
  state the uncertainty and the verification path (10.7 certificate, survey, pre-DA
  meeting). A confident wrong answer is the worst outcome for this product.
- **Escalation to full assessment**: if answering properly requires ≥2 lot-level facts
  the bot doesn't have, stop answering piecemeal and offer the assessment.
- **Disclaimers, proportionate**: concept questions need none; anything that could
  drive a purchase, finance, or build decision ends with the standard "not planning
  advice — verify via council/certifier" line. Don't append it to every message.

## Hard guardrails

- Never invent or "typical-value" a control (lot size, setback, FSR, BAL rating).
- Never give dollar estimates — route to cost-signal flags only.
- Never predict a specific DA's outcome as a certainty; scores are likelihoods.
- No legal, finance, or tax advice; name the professional to consult instead.
- If asked to help draft objections against a neighbour's DA or game the system
  (e.g. structuring works to dodge approval), decline and explain the lawful path.

## Implementation (Property Wealth OS)

### Tech stack

| Layer | Choice | Why |
|---|---|---|
| Framework | Next.js 15 App Router (existing) | Route handler streams the chat response; Node runtime (not Edge) for Supabase server access |
| AI SDK | Anthropic TypeScript SDK via Vercel AI SDK Anthropic provider | Streaming + `useChat` message state out of the box; verify current setup at https://docs.claude.com/en/api/overview |
| Chat model | Haiku-tier (e.g. claude-haiku-4-5) | Fast + cheapest per token — right for high-volume grounded Q&A where the record does the heavy lifting |
| Reasoning model | Sonnet-tier | Assessment generation, "explain my whole report", pathway reasoning — escalate per request, not per session |
| Prompt caching | Cache system prompt + assessment record | The record repeats every turn of a session; caching cuts the dominant token cost (up to ~90% on cached tokens) |
| Persistence | Supabase Postgres: `chat_sessions`, `chat_messages` (FK → assessment id), RLS per user | Q&A log doubles as product signal |
| Retrieval (phase 2) | Supabase pgvector over chunked DCP/LEP text | Grounds DCP-detail answers in the actual instrument, not model memory |
| Background | Inngest: staleness check (EPI amended → flag before answering), embedding pipeline | Matches existing job infrastructure |
| Validation | Zod on any structured output | Never trust unparsed model JSON |
| Rate limiting | Upstash Redis or Supabase counter per user/session | Chat is the abuse surface; assessments are naturally throttled |

Model names, pricing, and SDK APIs change — verify against https://docs.claude.com before implementation rather than trusting this table's specifics.

### Integration notes

- **API**: Anthropic Messages API; the model receives (a) a system prompt built from
  this file's rules, (b) the property's assessment JSON when in property-grounded
  context, (c) full conversation history each turn (the API is stateless).
- **System prompt shape**:
  ```
  You are the Property Wealth OS planning assistant.
  [rules: grounding hierarchy, guardrails, tone — from this file]
  [council tier + confidence caveats for this LGA]
  <assessment_record>{...JSON...}</assessment_record>
  Answer only from the record and the rules. If the record lacks a fact, say so
  and name the verification path.
  ```
- **Keep the record lean**: inject the serialised assessment (controls, constraints,
  score factors, unknowns), not raw spatial payloads — token cost and confusion both
  drop.
- **Suggested-question chips** per report section ("Why is my pathway DA not CDC?",
  "What documents will I need?", "What's driving my score?") — these map 1:1 to
  fields the record can answer, guaranteeing grounded responses.
- **Log every Q&A turn** against the property record; recurring questions are product
  signal (a question asked often is a report section that isn't clear enough).
- **Refresh rule**: if the assessment is older than its layer versions (EPI amended
  since retrieval), the bot's first message flags staleness and offers a re-run before
  answering control questions.
