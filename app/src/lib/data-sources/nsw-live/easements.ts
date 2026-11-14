import { queryArcGis } from "@/lib/data-sources/nsw-live/arcgis";
import { densify, distanceToRings, localFrame, pointInRings, ringsBbox, ringsOrigin, type Ring, type XY } from "@/lib/data-sources/nsw-live/lot-geometry";
import type { EasementFinding } from "@/lib/data-sources/types";

/**
 * Registered easements from the NSW cadastre (Land Parcel and Property Theme,
 * Easement layer — the successor to the legacy Six Maps cadastre). Each
 * feature is an easement polygon drawn on the burdened land, with a coded type
 * and width. The layer itself publishes no code list; the codes below come
 * from the same cadastral schema as published (with its domain) by NSW DCCEEW:
 * maptest.environment.nsw.gov.au/.../Common/Admin_3857/MapServer/24 —
 * subtype 1 "Primary", subtype 2 "Secondary".
 *
 * Only easements registered on title appear. A sewer main crossing a lot with
 * no registered easement (common for older Sydney Water mains) is NOT here.
 */

const EASEMENT_LAYER = "https://portal.spatial.nsw.gov.au/server/rest/services/NSW_Land_Parcel_Property_Theme/MapServer/9";

const PRIMARY_TYPES: Record<number, string> = {
  1: "Gas easement",
  2: "Electricity easement",
  3: "Water easement",
  4: "Right of way",
};

const SECONDARY_TYPES: Record<number, string> = {
  1: "Easement for access",
  2: "Easement for batter",
  3: "Cross easement",
  4: "Easement for support",
  5: "Easement for water main",
  6: "Easement to drain water",
  7: "Easement for rising main",
  8: "Easement for services",
  9: "Easement for sewer",
  10: "Easement for sewerage",
  11: "Easement for sewerage purposes",
  12: "Easement to drain sewerage",
  13: "Right of sewerage",
  14: "Easement for railway transmission line",
  15: "Easement for railway purposes",
  16: "Easement for railway viaduct",
  17: "Easement for electricity purposes",
  18: "Easement in stratum",
  19: "Right of footway",
  20: "Easement for elevated road",
  21: "Easement for light and air",
  22: "Easement for overhanging eaves and gutters",
  23: "Easement for party wall",
  24: "Easement for telemetry line",
  25: "Easement for river gauging station",
  26: "Easement for scour and overflow",
  27: "Easement for tunnel",
  28: "Easement for construction",
  29: "Easement for stock yards",
};

function describe(subtype: number | null, code: number | null): Pick<EasementFinding, "purpose" | "category"> {
  const purpose = (subtype === 2 ? SECONDARY_TYPES : PRIMARY_TYPES)[code ?? 0] ?? null;
  if (!purpose) return { purpose: "Easement (purpose not recorded in the cadastre)", category: "unspecified" };
  const p = purpose.toLowerCase();
  const category: EasementFinding["category"] = /sewer/.test(p)
    ? "sewer"
    : /drain|scour/.test(p)
      ? "drainage"
      : /water|rising main/.test(p)
        ? "water"
        : /electric|transmission/.test(p)
          ? "electricity"
          : /gas/.test(p)
            ? "gas"
            : /access|right of way|footway/.test(p)
              ? "access"
              : /services/.test(p)
                ? "services"
                : "other";
  return { purpose, category };
}

/** How far inside the lot boundary an easement must reach to count — absorbs tiny cadastre mismatches along shared boundaries. */
const BOUNDARY_TOLERANCE_M = 0.5;

/**
 * Easements that fall on the lot (WGS84 rings). Throws if the layer can't be
 * queried, so the caller can report "couldn't check" rather than "none".
 */
export async function fetchEasementsOnLot(lotRings: Ring[]): Promise<EasementFinding[]> {
  const bbox = ringsBbox(lotRings);
  const features = await queryArcGis(EASEMENT_LAYER, {
    geometry: [bbox.minLon, bbox.minLat, bbox.maxLon, bbox.maxLat].join(","),
    geometryType: "esriGeometryEnvelope",
    inSR: "4326",
    outSR: "4326",
    spatialRel: "esriSpatialRelIntersects",
    outFields: "easementtype,easementwidth,classsubtype",
    returnGeometry: "true",
  });

  const frame = localFrame(ringsOrigin(lotRings));
  const lot: XY[][] = lotRings.map((r) => r.map(frame.toLocal));
  const lotCentre: XY = [0, 0];

  const found: EasementFinding[] = [];
  for (const f of features) {
    const rings = (f.geometry?.rings ?? []).map((r) => r.map((p) => frame.toLocal([p[0], p[1]])));
    if (rings.length === 0) continue;
    // On the lot if any point along the easement's outline sits inside the lot
    // and clear of its boundary, or the lot itself sits inside the easement.
    const onLot =
      densify(rings, 0.5).some((p) => pointInRings(p, lot) && distanceToRings(p, lot) > BOUNDARY_TOLERANCE_M) ||
      pointInRings(lotCentre, rings);
    if (!onLot) continue;

    const a = f.attributes;
    const width = typeof a.easementwidth === "string" && a.easementwidth.trim() ? a.easementwidth.trim() : null;
    found.push({
      ...describe(typeof a.classsubtype === "number" ? a.classsubtype : null, typeof a.easementtype === "number" ? a.easementtype : null),
      width: width && /^\d+(\.\d+)?$/.test(width) ? `${width}m` : width,
    });
  }
  return found;
}
