/**
 * Client for the NSW Planning Portal's ePlanning property API — the same
 * anonymous, keyless API the Portal's own Spatial Viewer uses (endpoints
 * listed in https://www.planningportal.nsw.gov.au/spatialviewer/assets/app.config.json,
 * verified live 2026-11).
 *
 * One `layerintersect` call per property returns every planning map layer
 * that applies to it — zone and governing instrument, height, FSR, minimum
 * lot size, heritage, LEP local provisions (e.g. dual occupancy prohibition
 * maps), additional permitted uses, the council DCP (with a document link),
 * precinct boundaries and the Greenfield Housing Code area — each tagged
 * with its instrument and clause. Property IDs are the same `propid` that
 * Six Maps NSW_Property returns, so no separate address match is needed.
 */

const EPLANNING_API = "https://api.apps1.nsw.gov.au/planning/viewersf/V1/ePlanningApi";
const REQUEST_TIMEOUT_MS = 10000;
const CACHE_TTL_MS = 10 * 60 * 1000;

export interface EPlanningLayer {
  layerId: string;
  layerName: string;
  results: Record<string, string>[];
}

export interface LocalProvision {
  /** Map/provision type, e.g. "Dual Occupancy Prohibitions". */
  name: string;
  /** Mapped value for this lot, e.g. "Dual Occupancy Subdivision Prohibited". */
  value: string;
  clause: string | null;
  instrument: string;
}

export interface EPlanningPropertyPlanning {
  zone: string | null;
  zoneDescription: string | null;
  instrumentName: string | null;
  instrumentType: string | null;
  legislationUrl: string | null;
  lgaName: string | null;
  heightOfBuildingM: number | null;
  fsr: number | null;
  minLotSizeSqm: number | null;
  minLotSizeClause: string | null;
  heritage: { type: string; name: string | null; clause: string | null } | null;
  localProvisions: LocalProvision[];
  additionalPermittedUses: string[];
  greenfieldHousingCodeArea: boolean;
  precinct: string | null;
  dcp: { name: string; url: string | null } | null;
}

const cache = new Map<number, { at: number; layers: EPlanningLayer[] }>();

async function getJson(path: string): Promise<unknown> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  try {
    const res = await fetch(`${EPLANNING_API}/${path}`, { signal: controller.signal });
    if (!res.ok) throw new Error(`ePlanning API ${path} failed (${res.status})`);
    return await res.json();
  } finally {
    clearTimeout(timeout);
  }
}

/** All planning layers intersecting a property. Cached briefly — geocode and planning controls both need it. */
export async function fetchPropertyLayers(propId: number): Promise<EPlanningLayer[]> {
  const hit = cache.get(propId);
  if (hit && Date.now() - hit.at < CACHE_TTL_MS) return hit.layers;

  const raw = (await getJson(`layerintersect?type=property&id=${propId}`)) as {
    id: string;
    layerName: string;
    results: Record<string, unknown>[];
  }[];
  const layers = raw.map((l) => ({
    layerId: String(l.id),
    layerName: l.layerName,
    results: (l.results ?? []).map((r) =>
      Object.fromEntries(Object.entries(r).map(([k, v]) => [k, v === null || v === undefined ? "" : String(v)]))
    ),
  }));
  cache.set(propId, { at: Date.now(), layers });
  return layers;
}

/** The Portal's official council name for a property, e.g. "BLACKTOWN CITY COUNCIL" — the key the application feeds filter on. */
export async function fetchCouncilName(propId: number): Promise<string | null> {
  const names = (await getJson(`council?propId=${propId}`)) as string[];
  return names?.[0] ?? null;
}

const num = (v: string | undefined): number | null => {
  if (v === undefined || v.trim() === "") return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
};

const clause = (r: Record<string, string>): string | null => {
  const c = r["Legislative Clause"]?.trim();
  return c && c !== "<Null>" ? c : null;
};

function results(layers: EPlanningLayer[], name: RegExp): Record<string, string>[] {
  return layers.filter((l) => name.test(l.layerName)).flatMap((l) => l.results);
}

// Lot Size is a bare number with a sibling Units field — only convert units
// we've seen live; anything else degrades to unknown rather than a guess.
function lotSizeSqm(r: Record<string, string> | undefined): number | null {
  const size = num(r?.["Lot Size"]);
  if (size === null) return null;
  const units = r?.Units?.trim().toLowerCase();
  if (units === "m²" || units === "m2" || units === "sqm") return size;
  if (units === "ha" || units === "hectares") return size * 10000;
  return null;
}

export function summarisePlanning(layers: EPlanningLayer[]): EPlanningPropertyPlanning {
  const zoning = results(layers, /^Land Zoning Map$/i)[0];
  const height = results(layers, /^Height of Buildings Map$/i)[0];
  const fsr = results(layers, /^Floor Space Ratio Map$/i)[0];
  const lot = results(layers, /^Lot Size Map$/i)[0];
  const heritage = results(layers, /^Heritage Map$/i)[0];
  const dcp = results(layers, /^Development Control Plan/i)[0];
  const precinct = results(layers, /^Precinct Boundaries$/i)[0];

  const localProvisions: LocalProvision[] = results(layers, /^Local Provisions$|^Additional Controls$/i)
    // Statewide SEPP buffers (e.g. Aerotropolis wind-turbine zone) aren't site controls.
    .filter((r) => !/wind turbine/i.test(r.Type ?? ""))
    .map((r) => ({
      name: r.Type || r.title,
      value: r.Description || r.Class || r.title,
      clause: clause(r),
      instrument: r["EPI Name"] ?? "",
    }));
  // Growth-centre precincts control subdivision through dwelling density
  // bands rather than a Lot Size Map.
  for (const r of results(layers, /^Minimum Dwelling Density Area$/i)) {
    localProvisions.push({
      name: "Minimum Dwelling Density Area",
      value: r.Code || r.Type || r.title,
      clause: clause(r),
      instrument: r["EPI Name"] ?? "",
    });
  }

  return {
    zone: zoning?.Zone || null,
    zoneDescription: zoning?.["Land Use"] || null,
    instrumentName: zoning?.["EPI Name"] || null,
    instrumentType: zoning?.["EPI Type"] || null,
    legislationUrl: zoning?.legislationUrl || null,
    lgaName: zoning?.["LGA Name"] || dcp?.["LGA Name"] || null,
    heightOfBuildingM: num(height?.["Maximum Building Height"]),
    fsr: num(fsr?.["Floor Space Ratio"]),
    minLotSizeSqm: lotSizeSqm(lot),
    minLotSizeClause: lot ? clause(lot) : null,
    heritage: heritage
      ? { type: heritage["Heritage Type"] || heritage.title, name: heritage["Item Name"] || null, clause: clause(heritage) }
      : null,
    localProvisions,
    additionalPermittedUses: results(layers, /^Additional Permitted Uses/i).map((r) => r.Description || r.Class || r.title),
    greenfieldHousingCodeArea: results(layers, /^Greenfield Housing Code Area$/i).length > 0,
    precinct: precinct?.PRECINCT || precinct?.LABEL || null,
    dcp: dcp ? { name: dcp["Plan Name"] || dcp.title, url: dcp["DCP URL"] || null } : null,
  };
}
