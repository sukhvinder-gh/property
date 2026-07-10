import type {
  ConstraintsResult,
  DaStatsResult,
  DataSourceAdapter,
  GeocodeResult,
  PlanningControlsResult,
  TopographyResult,
} from "@/lib/data-sources/types";
import {
  queryArcGis,
  pointQuery,
  polygonCentroid,
  polygonAreaSqm,
  boundingBoxDims,
  polygonBoundingBoxCorners,
  polygonToLocalPoints,
  polygonToLocalRings,
  identifyImagePixel,
  type ArcGisFeature,
} from "@/lib/data-sources/nsw-live/arcgis";
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
const ELEVATION_SERVICE = "https://maps.six.nsw.gov.au/arcgis/rest/services/public/NSW_5M_Elevation/ImageServer";
const PLANNING_SERVICE = "https://mapprod3.environment.nsw.gov.au/arcgis/rest/services/Planning/Principal_Planning_Layers/MapServer";
const ZONING_LAYER = `${PLANNING_SERVICE}/11`;
const FSR_LAYER = `${PLANNING_SERVICE}/4`;
const HEIGHT_LAYER = `${PLANNING_SERVICE}/7`;
const HERITAGE_LAYER = `${PLANNING_SERVICE}/8`;
const MIN_LOT_SIZE_LAYER = `${PLANNING_SERVICE}/14`;
const HAZARD_SERVICE = "https://mapprod3.environment.nsw.gov.au/arcgis/rest/services/ePlanning/Planning_Portal_Hazard/MapServer";
const BUSHFIRE_LAYER = `${HAZARD_SERVICE}/229`;
const FLOOD_LAYER = `${HAZARD_SERVICE}/230`;
const PROTECTION_SERVICE = "https://mapprod3.environment.nsw.gov.au/arcgis/rest/services/ePlanning/Planning_Portal_Protection/MapServer";
const ACID_SULFATE_LAYER = `${PROTECTION_SERVICE}/234`;
const ANEF_LAYER = `${PROTECTION_SERVICE}/235`;
const TERRESTRIAL_BIODIVERSITY_LAYER = `${PROTECTION_SERVICE}/243`;
const SUBSIDENCE_SERVICE = "https://mapprod3.environment.nsw.gov.au/arcgis/rest/services/ePlanning/Planning_Portal_Subsidence_Advisory/MapServer";
const MINE_SUBSIDENCE_LAYER = `${SUBSIDENCE_SERVICE}/248`;
const COASTAL_SERVICE = "https://mapprod1.environment.nsw.gov.au/arcgis/rest/services/CoastalManagementSEPP/CoastalManagementSEPP/MapServer";
const COASTAL_WETLANDS_LAYER = `${COASTAL_SERVICE}/1`;
const COASTAL_ENV_AREA_LAYER = `${COASTAL_SERVICE}/6`;
const COASTAL_USE_AREA_LAYER = `${COASTAL_SERVICE}/7`;

const UNRESOLVED_LGA = "Unresolved (NSW Planning Portal — address not matched)";

function nowIso() {
  return new Date().toISOString();
}

// Minimum Lot Size layer's LOT_SIZE is a bare number whose unit is given by
// the sibling UNITS field — verified live 2026-07 (Hills Shire rural feature:
// LOT_SIZE 2, UNITS "ha" = 2 hectares, not 2m²). Only convert units we've
// actually confirmed; an unrecognised units string degrades to unknown (null)
// rather than risking a silently wrong conversion ("never guess").
function lotSizeSqmFromFeature(feature: ArcGisFeature | undefined): number | null {
  const rawSize = feature?.attributes.LOT_SIZE as number | undefined;
  if (rawSize === undefined || rawSize === null) return null;
  const units = (feature?.attributes.UNITS as string | undefined)?.trim().toLowerCase();
  if (units === "m2" || units === "m²" || units === "sqm" || units === "sq m") return rawSize;
  if (units === "ha" || units === "hectare" || units === "hectares") return rawSize * 10000;
  return null;
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

  async topography(lotDp: string | null, _lga: string): Promise<TopographyResult> {
    if (!lotDp) {
      return {
        slopePercent: null,
        provenance: { source: "No lot/DP to resolve — cannot sample elevation", retrievedAt: nowIso() },
      };
    }

    const escaped = lotDp.replace(/'/g, "''");
    const features = await queryArcGis(CADASTRE_SERVICE, {
      where: `lotidstring='${escaped}'`,
      outFields: "lotidstring",
      returnGeometry: "true",
    }).catch(() => [] as ArcGisFeature[]);

    const bbox = polygonBoundingBoxCorners(features[0]);
    if (!bbox) {
      return {
        slopePercent: null,
        provenance: { source: "Lot polygon could not be re-resolved for elevation sampling", retrievedAt: nowIso() },
      };
    }

    const [elevMin, elevMax] = await Promise.all([
      identifyImagePixel(ELEVATION_SERVICE, bbox.min).catch(() => null),
      identifyImagePixel(ELEVATION_SERVICE, bbox.max).catch(() => null),
    ]);

    if (elevMin === null || elevMax === null) {
      return {
        slopePercent: null,
        provenance: { source: "NSW 5m Elevation model (ImageServer) returned no data for this lot", retrievedAt: nowIso() },
      };
    }

    const dx = bbox.max.x - bbox.min.x;
    const dy = bbox.max.y - bbox.min.y;
    const diagonal = Math.sqrt(dx * dx + dy * dy);
    const slopePercent = diagonal > 0 ? Math.round(((Math.abs(elevMax - elevMin) / diagonal) * 100) * 10) / 10 : 0;

    return {
      slopePercent,
      provenance: {
        source: `Estimated from the NSW 5m-resolution elevation model (stereo-imagery-derived DEM, live ArcGIS ImageServer), sampled at the lot's bounding-box diagonal corners (${elevMin.toFixed(1)}m and ${elevMax.toFixed(1)}m AHD) — an indicative gradient across the lot, not a surveyed cross-section; local micro-relief (retaining walls, existing cut/fill) is not captured.`,
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
        heritageZoneRings: null,
        provenance: { source: "NSW ePlanning Spatial Viewer — lot could not be re-resolved", retrievedAt: nowIso() },
      };
    }

    const [zoningF, fsrF, heightF, heritageF, minLotSizeF, biodiversityF] = await Promise.all([
      queryArcGis(ZONING_LAYER, pointQuery(point, "SYM_CODE,LAY_CLASS")).catch(() => [] as ArcGisFeature[]),
      queryArcGis(FSR_LAYER, pointQuery(point, "FSR")).catch(() => [] as ArcGisFeature[]),
      queryArcGis(HEIGHT_LAYER, pointQuery(point, "MAX_B_H")).catch(() => [] as ArcGisFeature[]),
      queryArcGis(HERITAGE_LAYER, pointQuery(point, "*")).catch(() => [] as ArcGisFeature[]),
      queryArcGis(MIN_LOT_SIZE_LAYER, pointQuery(point, "LOT_SIZE,UNITS,LEGIS_REF_CLAUSE")).catch(() => [] as ArcGisFeature[]),
      queryArcGis(TERRESTRIAL_BIODIVERSITY_LAYER, pointQuery(point, "LAY_CLASS")).catch(() => [] as ArcGisFeature[]),
    ]);

    const zf = zoningF[0];
    const heritageFeature = heritageF[0];
    // LAY_CLASS on the heritage layer distinguishes item vs conservation area
    // (verified live 2026-07, e.g. "Item - General"); a substring check is a
    // reasonable read on an unfamiliar-but-real enum rather than a guess.
    const heritageClass = (heritageFeature?.attributes.LAY_CLASS as string | undefined)?.toLowerCase() ?? "";
    const minLotSizeFeature = minLotSizeF[0];
    return {
      zone: (zf?.attributes.SYM_CODE as string | undefined) ?? "Unknown",
      zoneDescription: (zf?.attributes.LAY_CLASS as string | undefined) ?? "Not resolved — verify via NSW Planning Portal",
      minLotSizeSqm: lotSizeSqmFromFeature(minLotSizeFeature),
      fsr: (fsrF[0]?.attributes.FSR as number | undefined) ?? null,
      heightOfBuildingM: (heightF[0]?.attributes.MAX_B_H as number | undefined) ?? null,
      biodiversityOverlay: biodiversityF.length > 0,
      heritageItem: heritageF.length > 0,
      heritageConservationArea: heritageClass.includes("conservation"),
      heritageZoneRings: heritageFeature ? polygonToLocalRings(heritageFeature, point) : null,
      provenance: {
        source: minLotSizeFeature
          ? `NSW ePlanning Spatial Viewer (Principal_Planning_Layers) — live ArcGIS REST; min lot size per ${minLotSizeFeature.attributes.LEGIS_REF_CLAUSE ?? "LEP clause (unspecified)"}`
          : "NSW ePlanning Spatial Viewer (Principal_Planning_Layers) — live ArcGIS REST",
        layerOrEpi: epiName,
        retrievedAt: nowIso(),
      },
    };
  }

  async constraints(lotDp: string | null, _lga: string): Promise<ConstraintsResult> {
    const point = await resolvePointForLot(lotDp);

    if (!point) {
      return {
        bushfireProneLand: false,
        bushfireZoneRings: null,
        floodControlLot: false,
        acidSulfateSoils: false,
        acidSulfateSoilsClass: null,
        contamination: false,
        hasSewerEasement: false,
        aircraftNoiseAnef: false,
        anefContourBand: null,
        mineSubsidenceDistrict: false,
        mineSubsidenceDistrictName: null,
        coastalManagementArea: false,
        coastalManagementAreaType: null,
        provenance: { source: "Lot point could not be resolved — all constraint flags unknown", retrievedAt: nowIso() },
      };
    }

    const [bushfireFeatures, floodFeatures, assFeatures, anefFeatures, mineSubsidenceFeatures, coastalWetlandsFeatures, coastalEnvFeatures, coastalUseFeatures] =
      await Promise.all([
        queryArcGis(BUSHFIRE_LAYER, pointQuery(point, "Category")).catch(() => [] as ArcGisFeature[]),
        queryArcGis(FLOOD_LAYER, pointQuery(point, "LAY_CLASS")).catch(() => [] as ArcGisFeature[]),
        queryArcGis(ACID_SULFATE_LAYER, pointQuery(point, "LABEL")).catch(() => [] as ArcGisFeature[]),
        queryArcGis(ANEF_LAYER, pointQuery(point, "ANEF_CODE")).catch(() => [] as ArcGisFeature[]),
        queryArcGis(MINE_SUBSIDENCE_LAYER, pointQuery(point, "DISTRICTNAME")).catch(() => [] as ArcGisFeature[]),
        queryArcGis(COASTAL_WETLANDS_LAYER, pointQuery(point, "LAY_CLASS")).catch(() => [] as ArcGisFeature[]),
        queryArcGis(COASTAL_ENV_AREA_LAYER, pointQuery(point, "LAY_CLASS")).catch(() => [] as ArcGisFeature[]),
        queryArcGis(COASTAL_USE_AREA_LAYER, pointQuery(point, "LAY_CLASS")).catch(() => [] as ArcGisFeature[]),
      ]);

    const bushfireFeature = bushfireFeatures[0];
    const coastalMatch = coastalWetlandsFeatures.length > 0
      ? "Coastal Wetlands"
      : coastalEnvFeatures.length > 0
        ? "Coastal Environment Area"
        : coastalUseFeatures.length > 0
          ? "Coastal Use Area"
          : null;

    return {
      bushfireProneLand: bushfireFeatures.length > 0,
      bushfireZoneRings: bushfireFeature ? polygonToLocalRings(bushfireFeature, point) : null,
      floodControlLot: floodFeatures.length > 0,
      acidSulfateSoils: assFeatures.length > 0,
      acidSulfateSoilsClass: (assFeatures[0]?.attributes.LABEL as string | undefined) ?? null,
      // No confirmed free live statewide source for these yet — honest false, not a verified absence.
      contamination: false,
      hasSewerEasement: false,
      aircraftNoiseAnef: anefFeatures.length > 0,
      anefContourBand: (anefFeatures[0]?.attributes.ANEF_CODE as string | undefined) ?? null,
      mineSubsidenceDistrict: mineSubsidenceFeatures.length > 0,
      mineSubsidenceDistrictName: (mineSubsidenceFeatures[0]?.attributes.DISTRICTNAME as string | undefined) ?? null,
      coastalManagementArea: coastalMatch !== null,
      coastalManagementAreaType: coastalMatch,
      provenance: {
        source:
          "NSW ePlanning live ArcGIS REST: bushfire (RFS Bushfire Prone Land), flood (Flood Planning Map), acid sulfate soils, airport noise (ANEF), mine subsidence district, and Coastal Management SEPP areas (wetlands/environment/use area — the dedicated Coastal Vulnerability/erosion map has no statewide dataset published yet). Contamination and sewer easements still have no confirmed free live statewide source.",
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
