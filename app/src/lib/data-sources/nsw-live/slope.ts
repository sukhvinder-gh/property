import { queryArcGis, type ArcGisFeature } from "@/lib/data-sources/nsw-live/arcgis";
import { densify, distanceToRings, type XY } from "@/lib/data-sources/nsw-live/lot-geometry";

/**
 * Lot slope from two independent NSW sources (all in GDA94 / MGA zone 56 metres):
 *
 *  1. NSW 5m elevation model (ImageServer getSamples) sampled at ~40 points just
 *     inside the lot boundary plus the centre → highest/lowest point, the fall
 *     between them, and the gradient along that line.
 *  2. NSW Elevation and Depth Theme contour lines (layer 2: `elevation`,
 *     `verticalaccuracy`) — elevation interpolated at the same high/low points
 *     from the nearest contours, as a cross-check on the fall.
 *
 * Neither is a survey. Contours in Sydney are typically 2m interval at ±1m.
 */

const ELEVATION_SERVICE = "https://maps.six.nsw.gov.au/arcgis/rest/services/public/NSW_5M_Elevation/ImageServer";
const CONTOUR_LAYER = "https://portal.spatial.nsw.gov.au/server/rest/services/NSW_Elevation_and_Depth_Theme/MapServer/2";
const SR = 28356;
/** Boundary samples are pulled this far toward the lot centre so they read the lot, not the kerb or the neighbour. */
const INSET_M = 1.5;
/** Contours worse than this vertical accuracy (e.g. ±5m from 1:25,000 mapping) are too coarse to check a house lot. */
const MAX_CONTOUR_ACCURACY_M = 2;

export interface SlopeEstimate {
  slopePercent: number;
  fallM: number;
  highM: number;
  lowM: number;
  /** Horizontal distance between the high and low sample points. */
  runM: number;
  check:
    | { status: "agrees" | "differs" | "conflicts"; contourFallM: number; contourIntervalM: number; contourYear: number | null }
    | { status: "unavailable"; reason: string };
}

function centroidOf(ring: XY[]): XY {
  const n = ring.length;
  return [ring.reduce((s, p) => s + p[0], 0) / n, ring.reduce((s, p) => s + p[1], 0) / n];
}

function samplePoints(rings: XY[][]): XY[] {
  const outer = rings[0];
  const c = centroidOf(outer);
  const perimeter = outer.reduce((s, p, i) => (i ? s + Math.hypot(p[0] - outer[i - 1][0], p[1] - outer[i - 1][1]) : 0), 0);
  // ~40 points around the boundary, at least 5m apart (the DEM's resolution).
  const step = Math.max(5, perimeter / 40);
  const inset = densify([outer], step, 80).map(([x, y]): XY => {
    const d = Math.hypot(c[0] - x, c[1] - y);
    const k = d > INSET_M ? INSET_M / d : 0;
    return [x + (c[0] - x) * k, y + (c[1] - y) * k];
  });
  return [c, ...inset];
}

async function sampleElevations(points: XY[]): Promise<(number | null)[]> {
  const url = new URL(`${ELEVATION_SERVICE}/getSamples`);
  url.searchParams.set("f", "json");
  url.searchParams.set("geometryType", "esriGeometryMultipoint");
  url.searchParams.set("geometry", JSON.stringify({ points, spatialReference: { wkid: SR } }));
  url.searchParams.set("returnFirstValueOnly", "true");
  url.searchParams.set("interpolation", "RSP_BilinearInterpolation");
  const res = await fetch(url, { signal: AbortSignal.timeout(10000) });
  if (!res.ok) throw new Error(`Elevation getSamples failed (${res.status})`);
  const json = await res.json();
  if (json.error) throw new Error(`Elevation getSamples error: ${JSON.stringify(json.error)}`);
  const out: (number | null)[] = points.map(() => null);
  for (const s of json.samples ?? []) {
    const v = Number(s.value);
    if (Number.isFinite(v) && v > -100) out[s.locationId] = v;
  }
  return out;
}

interface Contour {
  z: number;
  lines: XY[][];
}

/** Elevation at a point from the nearest contour and the nearest contour at a different height. */
function interpolateFromContours(p: XY, contours: Contour[]): number | null {
  const byDistance = contours.map((c) => ({ z: c.z, d: distanceToRings(p, c.lines) })).sort((a, b) => a.d - b.d);
  const first = byDistance[0];
  if (!first || first.d > 60) return null;
  const second = byDistance.find((c) => c.z !== first.z);
  if (!second) return first.z;
  return first.z + ((second.z - first.z) * first.d) / (first.d + second.d);
}

async function contourCheck(rings: XY[][], high: XY, low: XY, demFall: number): Promise<SlopeEstimate["check"]> {
  const xs = rings[0].map((p) => p[0]);
  const ys = rings[0].map((p) => p[1]);
  const pad = 60;
  const features: ArcGisFeature[] = await queryArcGis(CONTOUR_LAYER, {
    geometry: [Math.min(...xs) - pad, Math.min(...ys) - pad, Math.max(...xs) + pad, Math.max(...ys) + pad].join(","),
    geometryType: "esriGeometryEnvelope",
    inSR: String(SR),
    spatialRel: "esriSpatialRelIntersects",
    where: `verticalaccuracy <= ${MAX_CONTOUR_ACCURACY_M}`,
    outFields: "elevation,verticalaccuracy,featurereliabilitydate",
    returnGeometry: "true",
  });

  const byZ = new Map<number, XY[][]>();
  const years: number[] = [];
  for (const f of features) {
    const date = Number(f.attributes.featurereliabilitydate);
    if (Number.isFinite(date) && date !== 0) years.push(new Date(date).getUTCFullYear());
    const z = Number(f.attributes.elevation);
    // Contour geometry is a polyline (`paths`), not a polygon.
    const paths = ((f.geometry as { paths?: number[][][] } | undefined)?.paths ?? []).map((p) => p.map((q): XY => [q[0], q[1]]));
    if (!Number.isFinite(z) || paths.length === 0) continue;
    byZ.set(z, [...(byZ.get(z) ?? []), ...paths]);
  }
  const contours = [...byZ.entries()].map(([z, lines]) => ({ z, lines }));
  if (contours.length < 2) return { status: "unavailable", reason: `only ${contours.length} accurate contour line(s) near the lot` };

  const zs = contours.map((c) => c.z).sort((a, b) => a - b);
  const interval = Math.min(...zs.slice(1).map((z, i) => z - zs[i]).filter((d) => d > 0));
  const zHigh = interpolateFromContours(high, contours);
  const zLow = interpolateFromContours(low, contours);
  if (zHigh === null || zLow === null) return { status: "unavailable", reason: "no contour close enough to the lot" };

  const contourFall = Math.abs(zHigh - zLow);
  const diff = Math.abs(contourFall - demFall);
  // Contours are ±1m and interpolation between them adds up to half an interval.
  const tolerance = Math.max(1.5, interval / 2 + 1, demFall * 0.4);
  // The accurate contours in Sydney date from 1970s large-scale mapping, before
  // many suburbs were built and regraded, so a moderate difference is expected;
  // only a gross one suggests a source is wrong for this lot.
  const gross = diff > 3 && Math.max(contourFall, demFall) > 2 * Math.min(contourFall, demFall);
  return {
    status: diff <= tolerance ? "agrees" : gross ? "conflicts" : "differs",
    contourFallM: Math.round(contourFall * 10) / 10,
    contourIntervalM: interval,
    contourYear: years.length ? Math.min(...years) : null,
  };
}

/** Slope for a lot polygon (rings in MGA56 metres). Throws if the elevation model can't be read. */
export async function estimateLotSlope(rings: XY[][]): Promise<SlopeEstimate> {
  const points = samplePoints(rings);
  const values = await sampleElevations(points);
  const valid = points.map((p, i) => ({ p, z: values[i] })).filter((s): s is { p: XY; z: number } => s.z !== null);
  if (valid.length < 3) throw new Error("Elevation model returned too few samples for this lot");

  const high = valid.reduce((a, b) => (b.z > a.z ? b : a));
  const low = valid.reduce((a, b) => (b.z < a.z ? b : a));
  const fall = high.z - low.z;
  const run = Math.hypot(high.p[0] - low.p[0], high.p[1] - low.p[1]);
  // Gradient along the fall line; guard against a tiny run from DEM noise.
  const slopePercent = run >= 5 ? (fall / run) * 100 : 0;

  const check = await contourCheck(rings, high.p, low.p, fall).catch(
    (e): SlopeEstimate["check"] => ({ status: "unavailable", reason: e instanceof Error ? e.message : "contour layer unavailable" }),
  );

  return {
    slopePercent: Math.round(slopePercent * 10) / 10,
    fallM: Math.round(fall * 10) / 10,
    highM: Math.round(high.z * 10) / 10,
    lowM: Math.round(low.z * 10) / 10,
    runM: Math.round(run),
    check,
  };
}
