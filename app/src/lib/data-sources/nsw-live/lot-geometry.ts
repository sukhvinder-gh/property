/**
 * Small geometry helpers for lot-scale checks (easements, nearby sites).
 * Works on WGS84 lon/lat rings converted to a local metre grid around the lot
 * (equirectangular — under 0.1% distance error at the few-hundred-metre scale
 * these checks use, i.e. centimetres).
 */

export type LonLat = [number, number];
export type Ring = LonLat[];
export type XY = [number, number];

export interface LocalFrame {
  toLocal: (p: LonLat) => XY;
  /** Rough degree half-extents for a given radius in metres (for pre-filtering). */
  degreesFor: (metres: number) => { dLon: number; dLat: number };
}

const M_PER_DEG_LAT = 110574;

export function localFrame(origin: LonLat): LocalFrame {
  const mPerDegLon = 111320 * Math.cos((origin[1] * Math.PI) / 180);
  return {
    toLocal: ([lon, lat]) => [(lon - origin[0]) * mPerDegLon, (lat - origin[1]) * M_PER_DEG_LAT],
    degreesFor: (m) => ({ dLon: m / mPerDegLon, dLat: m / M_PER_DEG_LAT }),
  };
}

/** Mean of all ring vertices — good enough as an origin for the local grid. */
export function ringsOrigin(rings: Ring[]): LonLat {
  let x = 0;
  let y = 0;
  let n = 0;
  for (const r of rings) for (const [lon, lat] of r) (x += lon), (y += lat), n++;
  return [x / n, y / n];
}

export function ringsBbox(rings: Ring[]): { minLon: number; minLat: number; maxLon: number; maxLat: number } {
  let minLon = Infinity, minLat = Infinity, maxLon = -Infinity, maxLat = -Infinity;
  for (const r of rings)
    for (const [lon, lat] of r) {
      minLon = Math.min(minLon, lon);
      maxLon = Math.max(maxLon, lon);
      minLat = Math.min(minLat, lat);
      maxLat = Math.max(maxLat, lat);
    }
  return { minLon, minLat, maxLon, maxLat };
}

/** Even-odd point-in-polygon across all rings (outer rings and holes). */
export function pointInRings([px, py]: XY, rings: XY[][]): boolean {
  let inside = false;
  for (const ring of rings) {
    for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
      const [xi, yi] = ring[i];
      const [xj, yj] = ring[j];
      if (yi > py !== yj > py && px < ((xj - xi) * (py - yi)) / (yj - yi) + xi) inside = !inside;
    }
  }
  return inside;
}

function distToSegment([px, py]: XY, [ax, ay]: XY, [bx, by]: XY): number {
  const dx = bx - ax;
  const dy = by - ay;
  const len2 = dx * dx + dy * dy;
  const t = len2 === 0 ? 0 : Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / len2));
  return Math.hypot(px - (ax + t * dx), py - (ay + t * dy));
}

/** Shortest distance from a point to any ring edge, in the rings' units. */
export function distanceToRings(p: XY, rings: XY[][]): number {
  let best = Infinity;
  for (const ring of rings) for (let i = 1; i < ring.length; i++) best = Math.min(best, distToSegment(p, ring[i - 1], ring[i]));
  return best;
}

/** Points along every ring edge at roughly `step` spacing (vertices included). */
export function densify(rings: XY[][], step: number, maxPoints = 5000): XY[] {
  const out: XY[] = [];
  for (const ring of rings) {
    for (let i = 1; i < ring.length; i++) {
      const [ax, ay] = ring[i - 1];
      const [bx, by] = ring[i];
      const n = Math.max(1, Math.ceil(Math.hypot(bx - ax, by - ay) / step));
      for (let k = 0; k < n; k++) out.push([ax + ((bx - ax) * k) / n, ay + ((by - ay) * k) / n]);
      if (out.length > maxPoints) return out;
    }
  }
  return out;
}
