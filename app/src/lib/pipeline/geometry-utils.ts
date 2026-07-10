import type { LotPolygonPoint, SiteProfile } from "@/types/assessment";

const ALIGNMENT_TOLERANCE_M = 20;
// A real bushfire hazard polygon can be a huge regional shape (verified live:
// one rural-fringe lot's zone had 86 rings / 38,556 points in a single ring) —
// rendering that in Three.js would be a serious performance risk for very
// little visual payoff (it would just fill the entire visible ground). Cap
// total vertices and drop to a text-only fact above this, rather than ship a
// multi-megabyte shape through the API/JSON/Supabase storage and the browser.
const MAX_TOTAL_VERTICES = 1500;

interface Bbox {
  minX: number;
  maxX: number;
  minY: number;
  maxY: number;
}

function bboxOf(points: LotPolygonPoint[]): Bbox | null {
  if (points.length === 0) return null;
  let minX = Infinity;
  let maxX = -Infinity;
  let minY = Infinity;
  let maxY = -Infinity;
  for (const p of points) {
    minX = Math.min(minX, p.x);
    maxX = Math.max(maxX, p.x);
    minY = Math.min(minY, p.y);
    maxY = Math.max(maxY, p.y);
  }
  return { minX, maxX, minY, maxY };
}

function lotBboxFromSiteProfile(siteProfile: SiteProfile): Bbox | null {
  if (siteProfile.lotPolygon && siteProfile.lotPolygon.length > 0) return bboxOf(siteProfile.lotPolygon);
  if (siteProfile.frontageM !== null && siteProfile.depthM !== null) {
    const hw = siteProfile.frontageM / 2;
    const hd = siteProfile.depthM / 2;
    return { minX: -hw, maxX: hw, minY: -hd, maxY: hd };
  }
  return null;
}

export interface ZoneVerificationResult {
  rings: LotPolygonPoint[][] | null;
  /** Set only when input rings existed but were dropped — explains why to the report reader. */
  droppedReason: string | null;
}

/**
 * Overlay-zone rings (bushfire/heritage) are computed by the adapter in the
 * same local coordinate frame as SiteProfile.lotPolygon, but their origin is
 * independently re-resolved (see nsw-live/index.ts's resolvePointForLot) —
 * not provably the exact same point as lotPolygon's origin every time.
 * Rather than confidently render a hazard shape that might be silently
 * offset, do a cheap bounding-box-overlap sanity check first and drop the
 * geometry (not the underlying boolean/fact) if it fails. Also drops
 * (with a distinct reason) shapes too large/complex to usefully or safely
 * render — see MAX_TOTAL_VERTICES.
 */
export function verifyZoneAlignment(zoneRings: LotPolygonPoint[][] | null | undefined, siteProfile: SiteProfile): ZoneVerificationResult {
  if (!zoneRings || zoneRings.length === 0) return { rings: null, droppedReason: null };

  const totalVertices = zoneRings.reduce((sum, ring) => sum + ring.length, 0);
  if (totalVertices > MAX_TOTAL_VERTICES) {
    return {
      rings: null,
      droppedReason: `mapped zone geometry is too large/complex to render (${totalVertices} vertices) — confirmed present, but not shown in the 3D view`,
    };
  }

  const lotBbox = lotBboxFromSiteProfile(siteProfile);
  if (!lotBbox) return { rings: null, droppedReason: "lot geometry unavailable — cannot verify overlay alignment" };

  const zoneBbox = bboxOf(zoneRings.flat());
  if (!zoneBbox) return { rings: null, droppedReason: null };

  const overlaps =
    lotBbox.minX <= zoneBbox.maxX + ALIGNMENT_TOLERANCE_M &&
    lotBbox.maxX >= zoneBbox.minX - ALIGNMENT_TOLERANCE_M &&
    lotBbox.minY <= zoneBbox.maxY + ALIGNMENT_TOLERANCE_M &&
    lotBbox.maxY >= zoneBbox.minY - ALIGNMENT_TOLERANCE_M;

  if (!overlaps) {
    return { rings: null, droppedReason: "zone geometry could not be verified as aligned with this lot — not shown in the 3D view" };
  }
  return { rings: zoneRings, droppedReason: null };
}
