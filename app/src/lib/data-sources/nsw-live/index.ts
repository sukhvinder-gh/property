import type {
  ConstraintsResult,
  DaStatsResult,
  DataSourceAdapter,
  GeocodeResult,
  PlanningControlsResult,
  TopographyResult,
} from "@/lib/data-sources/types";
import { queryArcGis, pointQuery, polygonCentroid, polygonAreaSqm, boundingBoxDims, polygonToLocalPoints, type ArcGisFeature } from "@/lib/data-sources/nsw-live/arcgis";
import { parseAddress } from "@/lib/data-sources/nsw-live/address-parser";
import { addressSimilarity, FUZZY_MATCH_THRESHOLD } from "@/lib/data-sources/nsw-live/fuzzy-match";
import { isCouncilProfiled } from "@/lib/pipeline/council-profiles";

/**
 * Live NSW government data adapter. Endpoints verified anonymous/CORS-open
 * 2026-07 — see the research summary in the PR/chat history for the
 * verification method (real queries against real coordinates, not docs).
 *
 * Coverage as of this build:
 *  - Stage 1 (site ID): live — NSW_Property (address search) + NSW_Cadastre (lot/DP + polygon)
 *  - Stage 2 (zoning/FSR/height/heritage): live — ePlanning Principal_Planning_Layers
 *  - Stage 3 (constraints): bushfire live via ePlanning hazard layer; flood/ASS/
 *    contamination/sewer/ANEF have no confirmed free live source yet — honest false/unknown
 *  - Topography (slope): no confirmed live DEM source yet — honest null
 *  - DA stats (Stage 6 input): NSW's Online DA Data API is broker-mediated
 *    (data.broker@environment.nsw.gov.au), not a public anonymous endpoint — honest null
 *
 * Never invents a value for anything not listed above as "live" — per
 * SKILL.md's "never guess a control value", gaps degrade to unknown/false
 * with a provenance note, not a fabricated fixture.
 */

const PROPERTY_SERVICE = "https://maps.six.nsw.gov.au/arcgis/rest/services/public/NSW_Property/MapServer";
const PROPERTY_LAYER_IDS = [1, 2, 3, 4]; // Large_Rural, Rural, Semi_Rural, Urban
const CADASTRE_SERVICE = "https://maps.six.nsw.gov.au/arcgis/rest/services/public/NSW_Cadastre/MapServer/9";
const PLANNING_SERVICE = "https://mapprod3.environment.nsw.gov.au/arcgis/rest/services/Planning/Principal_Planning_Layers/MapServer";
const ZONING_LAYER = `${PLANNING_SERVICE}/11`;
const FSR_LAYER = `${PLANNING_SERVICE}/4`;
const HEIGHT_LAYER = `${PLANNING_SERVICE}/7`;
const HERITAGE_LAYER = `${PLANNING_SERVICE}/8`;
const BUSHFIRE_LAYER = "https://mapprod3.environment.nsw.gov.au/arcgis/rest/services/ePlanning/Planning_Portal_Hazard/MapServer/229";

const UNRESOLVED_LGA = "Unresolved (NSW Planning Portal — address not matched)";

function nowIso() {
  return new Date().toISOString();
}

function titleCase(s: string): string {
  return s
    .toLowerCase()
    .split(" ")
    .map((w) => (w.length > 0 ? w[0].toUpperCase() + w.slice(1) : w))
    .join(" ");
}

// Note: `resultRecordCount` makes this endpoint return a 400 (verified — not
// a documented limitation, just how this particular MapServer behaves), so
// don't pass it; cap candidate volume client-side instead after fetching.
async function queryPropertyLayers(where: string): Promise<ArcGisFeature[]> {
  const found: ArcGisFeature[] = [];
  for (const layerId of PROPERTY_LAYER_IDS) {
    const features = await queryArcGis(`${PROPERTY_SERVICE}/${layerId}`, {
      where,
      outFields: "propid,housenumber,address",
      returnGeometry: "true",
      returnCentroid: "true",
    }).catch(() => [] as ArcGisFeature[]);
    found.push(...features);
  }
  return found;
}

export interface PropertyMatch {
  feature: ArcGisFeature;
  fuzzy: boolean;
  matchedAddress: string | null;
}

/**
 * Exact substring match first (fast path, no ambiguity). If that finds
 * nothing, NSW_Property's address search has no typo tolerance at all — a
 * single spelling variant (Allan/Alan, "St"/"Street") silently resolves to
 * zero results — so fall back to a broader query scoped by house number +
 * suburb (the last 1-2 tokens, less prone to street-level typos) and pick
 * the best fuzzy match against the full token list, only if it clears
 * FUZZY_MATCH_THRESHOLD. Below that, stays honestly unresolved rather than
 * guessing a property the user didn't mean.
 */
async function findPropertyFeature(parsed: { houseNumber: string; tokens: string[] }): Promise<PropertyMatch | null> {
  const exactWhere = `housenumber='${parsed.houseNumber}' AND UPPER(address) LIKE '%${parsed.tokens.join("%")}%'`;
  const exact = await queryPropertyLayers(exactWhere);
  if (exact.length > 0) {
    return { feature: exact[0], fuzzy: false, matchedAddress: (exact[0].attributes.address as string | undefined) ?? null };
  }

  // Score every candidate — a growth-area suburb like Box Hill can return 100+
  // same-house-number results (repetitive street-naming themes), and the
  // real match is not guaranteed to be near the front of an unsorted list.
  const suburbTokens = parsed.tokens.slice(-Math.min(2, parsed.tokens.length));
  const broadWhere = `housenumber='${parsed.houseNumber}' AND UPPER(address) LIKE '%${suburbTokens.join("%")}%'`;
  const candidates = await queryPropertyLayers(broadWhere);
  if (candidates.length === 0) return null;

  let best: ArcGisFeature | null = null;
  let bestScore = 0;
  for (const candidate of candidates) {
    const address = candidate.attributes.address as string | undefined;
    if (!address) continue;
    const score = addressSimilarity(parsed.tokens, address);
    if (score > bestScore) {
      bestScore = score;
      best = candidate;
    }
  }
  if (bestScore < FUZZY_MATCH_THRESHOLD || !best) return null;
  return { feature: best, fuzzy: true, matchedAddress: (best.attributes.address as string | undefined) ?? null };
}

async function resolvePointForLot(lotDp: string | null): Promise<{ x: number; y: number } | null> {
  if (!lotDp) return null;
  const escaped = lotDp.replace(/'/g, "''");
  const features = await queryArcGis(CADASTRE_SERVICE, {
    where: `lotidstring='${escaped}'`,
    outFields: "lotidstring",
    returnGeometry: "true",
  }).catch(() => [] as ArcGisFeature[]);
  return polygonCentroid(features[0]);
}

function unresolvedGeocode(reason: string): GeocodeResult {
  return {
    lotDp: null,
    lga: UNRESOLVED_LGA,
    epiName: "Unknown — verify via NSW Planning Portal",
    epiAmendmentDate: null,
    lotSizeSqm: null,
    frontageM: null,
    depthM: null,
    isCornerLot: null,
    lotPolygon: null,
    registrationStatus: "registered",
    provenance: {
      source: `NSW Spatial Services (Six Maps) — ${reason}`,
      retrievedAt: nowIso(),
    },
  };
}

export class NswPlanningPortalAdapter implements DataSourceAdapter {
  isCouncilProfiled(lga: string): boolean {
    return isCouncilProfiled(lga);
  }

  async geocode(address: string): Promise<GeocodeResult> {
    const parsed = parseAddress(address);
    if (!parsed) return unresolvedGeocode("could not parse address into house number / street / suburb");

    const match = await findPropertyFeature(parsed);
    if (!match) return unresolvedGeocode("no property match for this address");
    const { feature: property, fuzzy, matchedAddress } = match;

    const centroid = polygonCentroid(property);
    if (!centroid) return unresolvedGeocode("property matched but no usable geometry returned");

    const [cadastreFeatures, zoningFeatures] = await Promise.all([
      queryArcGis(CADASTRE_SERVICE, {
        ...pointQuery(centroid, "lotnumber,lotidstring,planlabel"),
        returnGeometry: "true",
      }).catch(() => [] as ArcGisFeature[]),
      queryArcGis(ZONING_LAYER, pointQuery(centroid, "LGA_NAME,EPI_NAME,COMMENCED_DATE")).catch(() => [] as ArcGisFeature[]),
    ]);

    const lotFeature = cadastreFeatures[0];
    const lotDp = (lotFeature?.attributes.lotidstring as string | undefined) ?? null;

    const zf = zoningFeatures[0];
    const lga = zf?.attributes.LGA_NAME ? titleCase(zf.attributes.LGA_NAME as string) : UNRESOLVED_LGA;
    const epiName = (zf?.attributes.EPI_NAME as string | undefined) ?? "Unknown — verify via NSW Planning Portal";
    const commencedRaw = zf?.attributes.COMMENCED_DATE as number | undefined;
    const epiAmendmentDate = commencedRaw ? new Date(commencedRaw).toISOString().slice(0, 10) : null;

    const areaSqm = polygonAreaSqm(lotFeature);
    const bbox = boundingBoxDims(lotFeature);
    // Origin the polygon on the lot's own centroid (tighter than the
    // property-search centroid used for the point-in-polygon query above).
    const lotCentroid = polygonCentroid(lotFeature);
    const lotPolygon = lotCentroid ? polygonToLocalPoints(lotFeature, lotCentroid) : null;

    return {
      lotDp,
      lga,
      epiName,
      epiAmendmentDate,
      lotSizeSqm: areaSqm !== null ? Math.round(areaSqm) : null,
      frontageM: bbox ? Math.round(Math.min(bbox.width, bbox.height) * 10) / 10 : null,
      depthM: bbox ? Math.round(Math.max(bbox.width, bbox.height) * 10) / 10 : null,
      isCornerLot: null,
      lotPolygon,
      registrationStatus: lotDp ? "registered" : "unregistered",
      provenance: {
        source: fuzzy
          ? `NSW Spatial Services (Six Maps NSW_Property + NSW_Cadastre) — live ArcGIS REST; fuzzy-matched "${address}" to "${matchedAddress}" (no exact match found)`
          : "NSW Spatial Services (Six Maps NSW_Property + NSW_Cadastre) — live ArcGIS REST",
        layerOrEpi: epiName,
        retrievedAt: nowIso(),
      },
    };
  }

  async topography(_lotDp: string | null, _lga: string): Promise<TopographyResult> {
    return {
      slopePercent: null,
      provenance: {
        source: "No confirmed live NSW elevation/LiDAR source integrated yet — verify via site survey",
        retrievedAt: nowIso(),
      },
    };
  }

  async planningControls(lotDp: string | null, lga: string, epiName: string): Promise<PlanningControlsResult> {
    const point = await resolvePointForLot(lotDp);
    if (!point) {
      return {
        zone: "Unknown",
        zoneDescription: "Not resolved — verify via NSW Planning Portal / Section 10.7 certificate",
        minLotSizeSqm: null,
        fsr: null,
        heightOfBuildingM: null,
        heritageItem: false,
        heritageConservationArea: false,
        biodiversityOverlay: false,
        provenance: { source: "NSW ePlanning Spatial Viewer — lot could not be re-resolved", retrievedAt: nowIso() },
      };
    }

    const [zoningF, fsrF, heightF, heritageF] = await Promise.all([
      queryArcGis(ZONING_LAYER, pointQuery(point, "SYM_CODE,LAY_CLASS")).catch(() => [] as ArcGisFeature[]),
      queryArcGis(FSR_LAYER, pointQuery(point, "FSR")).catch(() => [] as ArcGisFeature[]),
      queryArcGis(HEIGHT_LAYER, pointQuery(point, "MAX_B_H")).catch(() => [] as ArcGisFeature[]),
      queryArcGis(HERITAGE_LAYER, pointQuery(point, "*")).catch(() => [] as ArcGisFeature[]),
    ]);

    const zf = zoningF[0];
    return {
      zone: (zf?.attributes.SYM_CODE as string | undefined) ?? "Unknown",
      zoneDescription: (zf?.attributes.LAY_CLASS as string | undefined) ?? "Not resolved — verify via NSW Planning Portal",
      // Lot Size Zoning (LSZ) layer not verified in this integration pass — honest unknown.
      minLotSizeSqm: null,
      fsr: (fsrF[0]?.attributes.FSR as number | undefined) ?? null,
      heightOfBuildingM: (heightF[0]?.attributes.MAX_B_H as number | undefined) ?? null,
      // Heritage layer schema (item vs conservation-area sub-type) not verified — any
      // returned feature is treated as a heritage item; conservation-area status unknown.
      heritageItem: heritageF.length > 0,
      heritageConservationArea: false,
      biodiversityOverlay: false,
      provenance: {
        source: "NSW ePlanning Spatial Viewer (Principal_Planning_Layers) — live ArcGIS REST",
        layerOrEpi: epiName,
        retrievedAt: nowIso(),
      },
    };
  }

  async constraints(lotDp: string | null, _lga: string): Promise<ConstraintsResult> {
    const point = await resolvePointForLot(lotDp);
    const bushfireFeatures = point ? await queryArcGis(BUSHFIRE_LAYER, pointQuery(point, "Category")).catch(() => [] as ArcGisFeature[]) : [];

    return {
      bushfireProneLand: bushfireFeatures.length > 0,
      // No confirmed free live source for these yet — honest false, not a verified absence.
      floodControlLot: false,
      acidSulfateSoils: false,
      contamination: false,
      hasSewerEasement: false,
      aircraftNoiseAnef: false,
      provenance: {
        source: point
          ? "NSW RFS Bushfire Prone Land (via ePlanning hazard layer) — live for bushfire only; flood/ASS/contamination/sewer/ANEF have no confirmed free live source yet"
          : "Lot point could not be resolved — all constraint flags unknown",
        retrievedAt: nowIso(),
      },
    };
  }

  async daStats(_lga: string, _daType: string): Promise<DaStatsResult> {
    return {
      determinationsLast12Months: 0,
      approvalRatePercent: null,
      medianDeterminationDays: null,
      provenance: {
        source: "NSW Planning Portal Online DA Data API requires broker registration (data.broker@environment.nsw.gov.au) — not yet configured",
        retrievedAt: nowIso(),
      },
    };
  }
}
