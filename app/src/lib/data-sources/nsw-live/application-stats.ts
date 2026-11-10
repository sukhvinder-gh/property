/**
 * Council approval statistics from the NSW Planning Portal's open
 * application feeds (anonymous, keyless; verified live 2026-11):
 *
 *  - OnlineCDC — every CDC lodged on the Portal, with its real outcome
 *    (Approved / Refused / Declined / Withdrawn). Gives a true approval rate.
 *  - OnlineDA — every DA lodged on the Portal. A decided DA is only marked
 *    "Determined"; the feed does not say approved vs refused (see the DA Open
 *    APIs data dictionary), so no DA approval rate can be derived from it.
 *
 * Filters are passed as a JSON `filters` header; `TotalCount` on a one-row
 * page gives a count without downloading records. Council names must match
 * the Portal's own (e.g. "BLACKTOWN CITY COUNCIL", from ePlanning `council`).
 */

const CDC_FEED = "https://api.apps1.nsw.gov.au/eplanning/data/v0/OnlineCDC";
const DA_FEED = "https://api.apps1.nsw.gov.au/eplanning/data/v0/OnlineDA";
const REQUEST_TIMEOUT_MS = 20000;
const CACHE_TTL_MS = 12 * 60 * 60 * 1000;
const SAMPLE_SIZE = 300; // records fetched to compute a median processing time

interface FeedPage {
  TotalCount: number;
  Application?: { LodgementDate?: string; DeterminationDate?: string }[];
}

export interface CouncilApplicationStats {
  kind: "CDC" | "DA";
  windowFrom: string;
  /** Applications decided in the window (CDC: approved + refused + declined; DA: determined). */
  decided: number;
  approved: number | null;
  refused: number | null;
  declined: number | null;
  withdrawn: number;
  /** Null for DAs — the public DA feed doesn't publish outcomes. */
  approvalRatePercent: number | null;
  medianDays: number | null;
}

const cache = new Map<string, { at: number; stats: CouncilApplicationStats }>();

async function page(feed: string, filters: Record<string, unknown>, size: number): Promise<FeedPage> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  try {
    const res = await fetch(feed, {
      headers: { PageSize: String(size), PageNumber: "1", filters: JSON.stringify({ filters }) },
      signal: controller.signal,
    });
    if (!res.ok) throw new Error(`Application feed failed (${res.status})`);
    return (await res.json()) as FeedPage;
  } finally {
    clearTimeout(timeout);
  }
}

const count = async (feed: string, filters: Record<string, unknown>) => (await page(feed, filters, 1)).TotalCount ?? 0;

function medianDays(apps: FeedPage["Application"]): number | null {
  const days = (apps ?? [])
    .filter((a) => a.LodgementDate && a.DeterminationDate)
    .map((a) => (Date.parse(a.DeterminationDate!) - Date.parse(a.LodgementDate!)) / 86400000)
    .filter((d) => Number.isFinite(d) && d >= 0)
    .sort((a, b) => a - b);
  return days.length ? Math.round(days[Math.floor(days.length / 2)]) : null;
}

function twelveMonthsAgo(): string {
  const d = new Date();
  d.setFullYear(d.getFullYear() - 1);
  return d.toISOString().slice(0, 10);
}

export async function fetchCouncilApplicationStats(councilName: string, kind: "CDC" | "DA"): Promise<CouncilApplicationStats> {
  const key = `${kind}:${councilName.toUpperCase()}`;
  const hit = cache.get(key);
  if (hit && Date.now() - hit.at < CACHE_TTL_MS) return hit.stats;

  const from = twelveMonthsAgo();
  const council = { CouncilName: [councilName] };
  let stats: CouncilApplicationStats;

  if (kind === "CDC") {
    // Declined (rejected at lodgement) and Withdrawn carry no determination
    // date, so they're windowed on last update instead.
    const [approvedPage, refused, declined, withdrawn] = await Promise.all([
      page(CDC_FEED, { ...council, ApplicationStatus: ["Approved"], DeterminationDateFrom: from }, SAMPLE_SIZE),
      count(CDC_FEED, { ...council, ApplicationStatus: ["Refused"], DeterminationDateFrom: from }),
      count(CDC_FEED, { ...council, ApplicationStatus: ["Declined"], ApplicationLastUpdatedFrom: from }),
      count(CDC_FEED, { ...council, ApplicationStatus: ["Withdrawn"], ApplicationLastUpdatedFrom: from }),
    ]);
    const approved = approvedPage.TotalCount ?? 0;
    const decided = approved + refused + declined;
    stats = {
      kind,
      windowFrom: from,
      decided,
      approved,
      refused,
      declined,
      withdrawn,
      approvalRatePercent: decided > 0 ? Math.round((approved / decided) * 1000) / 10 : null,
      medianDays: medianDays(approvedPage.Application),
    };
  } else {
    const residentialDa = { ...council, ApplicationType: ["Development Application"], DevelopmentCategory: ["Residential"] };
    const [determinedPage, withdrawn] = await Promise.all([
      page(DA_FEED, { ...residentialDa, ApplicationStatus: ["Determined"], DeterminationDateFrom: from }, SAMPLE_SIZE),
      count(DA_FEED, { ...residentialDa, ApplicationStatus: ["Withdrawn"], LodgementDateFrom: from }),
    ]);
    stats = {
      kind,
      windowFrom: from,
      decided: determinedPage.TotalCount ?? 0,
      approved: null,
      refused: null,
      declined: null,
      withdrawn,
      approvalRatePercent: null,
      medianDays: medianDays(determinedPage.Application),
    };
  }

  cache.set(key, { at: Date.now(), stats });
  return stats;
}
