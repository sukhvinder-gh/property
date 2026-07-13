/**
 * Thin client for NSW government ArcGIS REST Feature/MapServer endpoints.
 * All endpoints used by this adapter were verified live (2026-07) to be
 * anonymous, CORS-open, and free — see docs/property-pre-approval-engine
 * for the domain rules this adapter must follow (never guess a control
 * value; degrade to "unverified" on failure).
 *
 * Standardised on outSR 28356 (GDA94 / MGA Zone 56 — true metres, covers
 * the Sydney/Hunter/Illawarra/Central West region) so area and distance
 * math doesn't need Web Mercator latitude correction. Zone 56 does not
 * cover far-western NSW (e.g. Broken Hill) — a known limitation.
 */

const OUT_SR = 28356;
const REQUEST_TIMEOUT_MS = 8000;

export interface ArcGisGeometry {
  rings?: number[][][];
  x?: number;
  y?: number;
}

export interface ArcGisFeature {
  attributes: Record<string, unknown>;
  geometry?: ArcGisGeometry;
  centroid?: { x: number; y: number };
}

export async function queryArcGis(serviceUrl: string, params: Record<string, string>): Promise<ArcGisFeature[]> {
  const url = new URL(`${serviceUrl}/query`);
  url.searchParams.set("f", "json");
  url.searchParams.set("outSR", String(OUT_SR));
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  try {
    const res = await fetch(url.toString(), { signal: controller.signal });
    if (!res.ok) throw new Error(`ArcGIS query failed (${res.status}): ${serviceUrl}`);
    const json = await res.json();
    if (json.error) throw new Error(`ArcGIS error: ${JSON.stringify(json.error)}`);
    return (json.features as ArcGisFeature[]) ?? [];
  } finally {
    clearTimeout(timeout);
  }
}

export function pointQuery(point: { x: number; y: number }, outFields: string): Record<string, string> {
  return {
    geometry: `${point.x},${point.y}`,
    geometryType: "esriGeometryPoint",
    spatialRel: "esriSpatialRelIntersects",
    inSR: String(OUT_SR),
    outFields,
  };
}

export function polygonCentroid(feature: ArcGisFeature | undefined): { x: number; y: number } | null {
  if (!feature) return null;
  if (feature.centroid) return feature.centroid;
  if (feature.geometry?.x !== undefined && feature.geometry.y !== undefined) {
    return { x: feature.geometry.x, y: feature.geometry.y };
  }
  const ring = feature.geometry?.rings?.[0];
  if (!ring || ring.length === 0) return null;
  let x = 0;
  let y = 0;
  for (const [px, py] of ring) {
    x += px;
    y += py;
  }
  return { x: x / ring.length, y: y / ring.length };
}

/** Shoelace formula on the outer ring. Ignores holes — fine for typical suburban lots. */
export function polygonAreaSqm(feature: ArcGisFeature | undefined): number | null {
  const ring = feature?.geometry?.rings?.[0];
  if (!ring || ring.length < 3) return null;
  let area = 0;
  for (let i = 0; i < ring.length; i++) {
    const [x1, y1] = ring[i];
    const [x2, y2] = ring[(i + 1) % ring.length];
    area += x1 * y2 - x2 * y1;
  }
  return Math.abs(area / 2);
}

/**
 * Bounding-box width/height as a proxy for frontage/depth. This is an
 * approximation — the true frontage is a specific edge length, not the
 * bounding box — reasonable for typical rectangular suburban lots, weak
 * for irregular or battle-axe lots. Flagged as an assumption downstream.
 */
export function boundingBoxDims(feature: ArcGisFeature | undefined): { width: number; height: number } | null {
  const ring = feature?.geometry?.rings?.[0];
  if (!ring || ring.length === 0) return null;
  let minX = Infinity;
  let maxX = -Infinity;
  let minY = Infinity;
  let maxY = -Infinity;
  for (const [x, y] of ring) {
    minX = Math.min(minX, x);
    maxX = Math.max(maxX, x);
    minY = Math.min(minY, y);
    maxY = Math.max(maxY, y);
  }
  return { width: maxX - minX, height: maxY - minY };
}

/**
 * Real min/max corner coordinates of the outer ring's bounding box (unlike
 * boundingBoxDims, which only returns width/height) — used to pick two real
 * sample points for elevation lookups.
 */
export function polygonBoundingBoxCorners(
  feature: ArcGisFeature | undefined
): { min: { x: number; y: number }; max: { x: number; y: number } } | null {
  const ring = feature?.geometry?.rings?.[0];
  if (!ring || ring.length === 0) return null;
  let minX = Infinity;
  let maxX = -Infinity;
  let minY = Infinity;
  let maxY = -Infinity;
  for (const [x, y] of ring) {
    minX = Math.min(minX, x);
    maxX = Math.max(maxX, x);
    minY = Math.min(minY, y);
    maxY = Math.max(maxY, y);
  }
  return { min: { x: minX, y: minY }, max: { x: maxX, y: maxY } };
}

/**
 * Identify operation for ArcGIS ImageServer (pixel/raster) endpoints — a
 * different REST operation from queryArcGis's /query (feature layers).
 * Verified live 2026-07: the point geometry must be JSON-encoded with an
 * explicit spatialReference — a bare "x,y" + separate sr param returns
 * "NoData" even for a valid point. Returns null for "NoData"/non-numeric
 * (degrade to unknown, never guess).
 */
export async function identifyImagePixel(serviceUrl: string, point: { x: number; y: number }): Promise<number | null> {
  const url = new URL(`${serviceUrl}/identify`);
  url.searchParams.set("f", "json");
  url.searchParams.set("geometryType", "esriGeometryPoint");
  url.searchParams.set("returnGeometry", "false");
  url.searchParams.set("geometry", JSON.stringify({ x: point.x, y: point.y, spatialReference: { wkid: OUT_SR } }));

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  try {
    const res = await fetch(url.toString(), { signal: controller.signal });
    if (!res.ok) throw new Error(`ArcGIS identify failed (${res.status}): ${serviceUrl}`);
    const json = await res.json();
    if (json.error) throw new Error(`ArcGIS error: ${JSON.stringify(json.error)}`);
    const value = json.value;
    if (typeof value !== "string" || value === "NoData") return null;
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  } finally {
    clearTimeout(timeout);
  }
}

/**
 * Reprojects a point by piggybacking on an ArcGIS ImageServer identify
 * operation's echoed "location" field, rather than implementing/trusting a
 * hand-rolled UTM<->Web-Mercator conversion. Verified live 2026-07: a GDA94
 * MGA Zone 56 point at ~151°E longitude reprojected to Web Mercator
 * x≈16,807,820, matching the expected R×lon(rad) value (R=6378137) — the
 * server's own reprojection, not a guessed formula. Returns null on any
 * failure rather than falling back to an unverified conversion.
 */
export async function reprojectViaImageServer(
  serviceUrl: string,
  point: { x: number; y: number },
  fromWkid: number
): Promise<{ x: number; y: number } | null> {
  const url = new URL(`${serviceUrl}/identify`);
  url.searchParams.set("f", "json");
  url.searchParams.set("geometryType", "esriGeometryPoint");
  url.searchParams.set("returnGeometry", "false");
  url.searchParams.set("geometry", JSON.stringify({ x: point.x, y: point.y, spatialReference: { wkid: fromWkid } }));

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  try {
    const res = await fetch(url.toString(), { signal: controller.signal });
    if (!res.ok) return null;
    const json = await res.json();
    if (json.error) return null;
    const loc = json.location;
    if (!loc || typeof loc.x !== "number" || typeof loc.y !== "number") return null;
    return { x: loc.x, y: loc.y };
  } catch {
    return null;
  } finally {
    clearTimeout(timeout);
  }
}

/**
 * Outer ring re-based to local metres around a given origin (typically the
 * polygon's own centroid) — the source CRS (GDA94 MGA Zone 56) is already
 * metric and true-north-aligned, so this is a plain translation, no rotation
 * or scale correction needed.
 */
export function polygonToLocalPoints(feature: ArcGisFeature | undefined, origin: { x: number; y: number }): { x: number; y: number }[] | null {
  const ring = feature?.geometry?.rings?.[0];
  if (!ring || ring.length === 0) return null;
  return ring.map(([x, y]) => ({ x: x - origin.x, y: y - origin.y }));
}

/**
 * All rings re-based to local metres around a given origin — unlike
 * polygonToLocalPoints (single ring, fine for cadastre lots), overlay/hazard
 * features can have multiple rings (verified live: a sample bushfire feature
 * had 3). Each ring is treated as an independent filled patch by callers —
 * true donut-hole semantics from winding order are not resolved here.
 */
export function polygonToLocalRings(feature: ArcGisFeature | undefined, origin: { x: number; y: number }): { x: number; y: number }[][] | null {
  const rings = feature?.geometry?.rings;
  if (!rings || rings.length === 0) return null;
  return rings.map((ring) => ring.map(([x, y]) => ({ x: x - origin.x, y: y - origin.y })));
}
