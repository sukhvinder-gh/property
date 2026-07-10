/**
 * NSW Housing SEPP 2021 secondary dwelling (granny flat) CDC thresholds.
 * Verified current 2026-07 via NSW Planning Portal — see
 * docs/property-pre-approval-engine/SKILL.md's "data recency" domain rule
 * (these figures have changed repeatedly since 2024, so they're deliberately
 * centralised here rather than duplicated, and dated so a future check knows
 * when to re-verify).
 *
 * These happen to coincide with the primary dwelling's own assumed CDC lot
 * size/frontage minimums (stage5-pathway.ts) — shared here so both only need
 * updating in one place if either Codes SEPP figure changes.
 */
export const SECONDARY_DWELLING_MIN_LOT_SQM = 450;
export const SECONDARY_DWELLING_MIN_FRONTAGE_M = 12;
