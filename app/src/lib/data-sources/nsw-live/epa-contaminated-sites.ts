import { strFromU8, unzipSync } from "fflate";
import { distanceToRings, localFrame, pointInRings, ringsBbox, ringsOrigin, type Ring, type XY } from "@/lib/data-sources/nsw-live/lot-geometry";
import type { ContaminatedSiteFinding } from "@/lib/data-sources/types";

/**
 * NSW EPA "List of NSW contaminated sites notified to the EPA" — published
 * monthly as an Excel file (Suburb, SiteName, Address,
 * ContaminationActivityType, ManagementClass, Latitude, Longitude). There is
 * no query API, so the current file is located from the EPA page, downloaded,
 * parsed, and cached in memory for a day.
 *
 * The list only covers sites the EPA has been notified about. Absence from it
 * is not evidence the land is uncontaminated — callers must say so.
 */

const EPA_PAGE = "https://www.epa.nsw.gov.au/Your-environment/Contaminated-land/notified-and-regulated-contaminated-land/list-of-notified-sites";
const CACHE_TTL_MS = 24 * 60 * 60 * 1000;
const RETRY_AFTER_FAILURE_MS = 5 * 60 * 1000;
const FETCH_TIMEOUT_MS = 20000;
/** The workbook's notes sheet is padded to ~1M empty rows (68MB unzipped) — skip anything that large. */
const MAX_SHEET_BYTES = 20 * 1024 * 1024;

interface EpaSite {
  suburb: string;
  name: string;
  address: string;
  activity: string;
  status: string;
  lon: number;
  lat: number;
}

export interface EpaListing {
  sites: EpaSite[];
  /** e.g. "July 2026", from the published file name. */
  edition: string | null;
  sourceUrl: string;
}

let cached: { at: number; listing: EpaListing } | null = null;
let inFlight: Promise<EpaListing> | null = null;
let lastFailureAt = 0;

const decodeXml = (s: string) =>
  s.replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&amp;/g, "&");

function columnIndex(ref: string): number {
  return ref.replace(/\d+/g, "").split("").reduce((n, c) => n * 26 + c.charCodeAt(0) - 64, 0) - 1;
}

/** Rows of every (reasonably sized) worksheet in an .xlsx, as string arrays. */
function readWorkbook(bytes: Uint8Array): string[][][] {
  const files = unzipSync(bytes, {
    filter: (f) => f.name === "xl/sharedStrings.xml" || (/^xl\/worksheets\/sheet\d+\.xml$/.test(f.name) && f.originalSize <= MAX_SHEET_BYTES),
  });
  const shared = files["xl/sharedStrings.xml"] ? strFromU8(files["xl/sharedStrings.xml"]) : "";
  const strings = shared
    .split("<si>")
    .slice(1)
    .map((si) => decodeXml((si.match(/<t[^>]*>[^<]*<\/t>/g) ?? []).map((t) => t.replace(/<[^>]+>/g, "")).join("")));

  return Object.keys(files)
    .filter((k) => k.startsWith("xl/worksheets/"))
    .sort()
    .map((k) => {
      const rows: string[][] = [];
      for (const rowXml of strFromU8(files[k]).split("<row ").slice(1)) {
        const row: string[] = [];
        for (const cell of rowXml.split("<c ").slice(1)) {
          const ref = /r="([A-Z]+\d+)"/.exec(cell)?.[1];
          const raw = /<v>([^<]*)<\/v>/.exec(cell)?.[1] ?? /<t[^>]*>([^<]*)<\/t>/.exec(cell)?.[1];
          if (!ref || raw === undefined) continue;
          const isShared = / t="s"/.test(cell.slice(0, cell.indexOf(">")));
          row[columnIndex(ref)] = isShared ? strings[Number(raw)] ?? "" : decodeXml(raw);
        }
        if (row.some(Boolean)) rows.push(row);
      }
      return rows;
    });
}

function parseSites(sheets: string[][][]): EpaSite[] {
  for (const rows of sheets) {
    const headerAt = rows.findIndex((r) => r.some((c) => /^latitude$/i.test(c?.trim() ?? "")));
    if (headerAt < 0) continue;
    const header = rows[headerAt].map((c) => (c ?? "").trim().toLowerCase());
    const col = (name: string) => header.indexOf(name);
    const [iSuburb, iName, iAddr, iActivity, iStatus, iLat, iLon] = [
      col("suburb"),
      col("sitename"),
      col("address"),
      col("contaminationactivitytype"),
      col("managementclass"),
      col("latitude"),
      col("longitude"),
    ];
    if (iLat < 0 || iLon < 0) continue;
    return rows
      .slice(headerAt + 1)
      .map((r) => ({
        suburb: (r[iSuburb] ?? "").trim(),
        name: (r[iName] ?? "").trim(),
        address: (r[iAddr] ?? "").replace(/\s+/g, " ").trim(),
        activity: (r[iActivity] ?? "").trim(),
        status: (r[iStatus] ?? "").trim(),
        lat: Number(r[iLat]),
        lon: Number(r[iLon]),
      }))
      .filter((s) => Number.isFinite(s.lat) && Number.isFinite(s.lon) && s.lat !== 0);
  }
  throw new Error("EPA workbook has no sheet with Latitude/Longitude columns");
}

async function fetchWithTimeout(url: string): Promise<Response> {
  const res = await fetch(url, {
    signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
    headers: { "User-Agent": "PropertyPreApprovalEngine/1.0" },
  });
  if (!res.ok) throw new Error(`${url} returned ${res.status}`);
  return res;
}

async function loadListing(): Promise<EpaListing> {
  const page = await (await fetchWithTimeout(EPA_PAGE)).text();
  const href = /href="([^"]+\.xlsx)"/i.exec(page)?.[1];
  if (!href) throw new Error("No .xlsx link found on the EPA notified-sites page");
  const sourceUrl = new URL(href, EPA_PAGE).toString();
  const bytes = new Uint8Array(await (await fetchWithTimeout(sourceUrl)).arrayBuffer());
  const sites = parseSites(readWorkbook(bytes));
  if (sites.length < 100) throw new Error(`EPA list parsed to only ${sites.length} sites — format may have changed`);
  const edition = /([A-Z][a-z]+)(?:%20|\s|_)+(\d{4})\.xlsx$/.exec(sourceUrl);
  return { sites, edition: edition ? `${edition[1]} ${edition[2]}` : null, sourceUrl };
}

/** The current EPA list (cached a day). Throws if it can't be fetched or parsed. */
export async function fetchEpaContaminatedSites(): Promise<EpaListing> {
  if (cached && Date.now() - cached.at < CACHE_TTL_MS) return cached.listing;
  if (Date.now() - lastFailureAt < RETRY_AFTER_FAILURE_MS) throw new Error("EPA list unavailable (recent failure)");
  inFlight ??= loadListing()
    .then((listing) => {
      cached = { at: Date.now(), listing };
      return listing;
    })
    .catch((e) => {
      lastFailureAt = Date.now();
      throw e;
    })
    .finally(() => {
      inFlight = null;
    });
  return inFlight;
}

/** Statuses meaning the EPA is actively regulating, investigating or managing the site. */
const ACTIVE_STATUS = /currently regulated|preliminary investigation|under assessment|being finalised|ongoing maintenance|being managed/i;

/** EPA-notified sites on the lot (point inside the lot) or within `radiusM` of its boundary, nearest first. */
export function contaminatedSitesNearLot(listing: EpaListing, lotRings: Ring[], radiusM = 100): ContaminatedSiteFinding[] {
  const frame = localFrame(ringsOrigin(lotRings));
  const lot: XY[][] = lotRings.map((r) => r.map(frame.toLocal));
  const bbox = ringsBbox(lotRings);
  const pad = frame.degreesFor(radiusM);

  return listing.sites
    .filter((s) => s.lon >= bbox.minLon - pad.dLon && s.lon <= bbox.maxLon + pad.dLon && s.lat >= bbox.minLat - pad.dLat && s.lat <= bbox.maxLat + pad.dLat)
    .map((s) => {
      const p = frame.toLocal([s.lon, s.lat]);
      const onLot = pointInRings(p, lot);
      return {
        siteName: s.name,
        address: `${s.address}, ${s.suburb}`,
        activity: s.activity,
        status: s.status,
        onLot,
        distanceM: onLot ? 0 : Math.round(distanceToRings(p, lot)),
        activelyManaged: ACTIVE_STATUS.test(s.status),
      };
    })
    .filter((s) => s.onLot || s.distanceM <= radiusM)
    .sort((a, b) => a.distanceM - b.distanceM);
}
