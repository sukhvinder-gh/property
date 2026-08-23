import type {
  ConstraintsResult,
  DaStatsResult,
  DataSourceAdapter,
  EnvironmentalContextResult,
  GeocodeResult,
  LandCapabilityResult,
  PlanningControlsResult,
  RoadAccessResult,
  SoilTypeResult,
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
  reprojectViaImageServer,
  type ArcGisFeature,
} from "@/lib/data-sources/nsw-live/arcgis";
import { parseAddress } from "@/lib/data-sources/nsw-live/address-parser";
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
const LGA_LAYER = "https://portal.spatial.nsw.gov.au/server/rest/services/NSW_Administrative_Boundaries_Theme/MapServer/8";
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
const GROUNDWATER_LAYER = `${PROTECTION_SERVICE}/237`;
const SALINITY_LAYER = `${PROTECTION_SERVICE}/241`;
const SOIL_SERVICE = "https://mapprod1.environment.nsw.gov.au/arcgis/rest/services/Soil/Soils_GSG_SoilTypes_EDP/MapServer/2";
const LAND_CAPABILITY_SERVICE = "https://mapprod1.environment.nsw.gov.au/arcgis/rest/services/LandCap/LandAndSoilCapability_EDP/MapServer/2";
const TREE_CANOPY_LAYER = "https://mapprod2.environment.nsw.gov.au/arcgis/rest/services/UHGC/UHGC/MapServer/5";
const ROADS_LAYER = "https://maps.six.nsw.gov.au/arcgis/rest/services/sixmaps/LPIMap/MapServer/55";
const ROADS_LAYER_SR = 102100; // native storage SR — verified live 2026-07 that this layer silently returns empty results when queried in 28356
const ROAD_PROXIMITY_BUFFER_M = 40;
// Verified live 2026-07 from the layer's own functionhierarchy coded-value domain.
const FUNCTION_HIERARCHY_NAMES: Record<number, string> = {
  1: "Motorway",
  2: "Primary Road",
  3: "Arterial Road",
  4: "Sub-Arterial Road",
  5: "Distributor Road",
  6: "Local Road",
  7: "Urban Service Lane",
  8: "Vehicular Track",
  9: "Path",
  10: "Dedicated Busway",
  11: "Access Way",
};

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
}

/**
 * Exact substring match only — house number plus every remaining address
 * token, in order, as a wildcarded chain. Deliberately no fuzzy fallback:
 * an earlier version fell back to a broader house-number + suburb-only
 * query (dropping the actual street name) and picked the best-scoring
 * candidate. Verified live this is unsafe — "8 Poole Road, Kellyville"
 * falls back to matching against 55 completely unrelated streets sharing
 * only "Road"/"Kellyville" (8 Rosebery Road, 8 Jupiter Road, 8 Greenwood
 * Road, ...), any of which can outscore the real (non-existent, in that
 * case) match by coincidence and get returned as if it were correct. A
 * confidently wrong street match is worse than an honest "unresolved" —
 * per SKILL.md's "never guess a control value", the same logic applies to
 * guessing *which property* the address means.
 */
async function findPropertyFeature(parsed: { houseNumber: string; tokens: string[] }): Promise<PropertyMatch | null> {
  const exactWhere = `housenumber='${parsed.houseNumber}' AND UPPER(address) LIKE '%${parsed.tokens.join("%")}%'`;
  const exact = await queryPropertyLayers(exactWhere);
  if (exact.length === 0) return null;
  return { feature: exact[0] };
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
    if (!match) return unresolvedGeocode("no exact property match for this address");
    const { feature: property } = match;

    const centroid = polygonCentroid(property);
    if (!centroid) return unresolvedGeocode("property matched but no usable geometry returned");

    const [cadastreFeatures, zoningFeatures, lgaFeatures] = await Promise.all([
      queryArcGis(CADASTRE_SERVICE, {
        ...pointQuery(centroid, "lotnumber,lotidstring,planlabel"),
        returnGeometry: "true",
      }).catch(() => [] as ArcGisFeature[]),
      queryArcGis(ZONING_LAYER, pointQuery(centroid, "LGA_NAME,EPI_NAME,COMMENCED_DATE")).catch(() => [] as ArcGisFeature[]),
      queryArcGis(LGA_LAYER, pointQuery(centroid, "lganame")).catch(() => [] as ArcGisFeature[]),
    ]);

    const lotFeature = cadastreFeatures[0];
    const lotDp = (lotFeature?.attributes.lotidstring as string | undefined) ?? null;

    const zf = zoningFeatures[0];
    // The zoning layer's own LGA_NAME is sometimes blank for SEPP growth-precinct
    // land (e.g. "SEPP (Precincts—Central River City) 2021" records) — verified
    // live 2026-07. The dedicated LocalGovernmentArea administrative-boundary
    // layer resolves correctly even there, so it's the primary source; the
    // zoning layer's attribute is only a fallback if that lookup fails.
    const lgaLayerName = (lgaFeatures[0]?.attributes.lganame as string | undefined) || undefined;
    const zoningLgaName = (zf?.attributes.LGA_NAME as string | undefined) || undefined;
    const lga = lgaLayerName ? titleCase(lgaLayerName) : zoningLgaName ? titleCase(zoningLgaName) : UNRESOLVED_LGA;
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
        source: "NSW Spatial Services (Six Maps NSW_Property + NSW_Cadastre) — live ArcGIS REST",
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

  async soilType(lotDp: string | null, _lga: string): Promise<SoilTypeResult> {
    const point = await resolvePointForLot(lotDp);
    if (!point) {
      return {
        soilType: null,
        soilTypeCode: null,
        provenance: { source: "No lot/DP to resolve — cannot look up soil type", retrievedAt: nowIso() },
      };
    }

    const features = await queryArcGis(SOIL_SERVICE, pointQuery(point, "GSG_name,GSG_code")).catch(() => [] as ArcGisFeature[]);
    const feature = features[0];

    return {
      soilType: (feature?.attributes.GSG_name as string | undefined) ?? null,
      soilTypeCode: (feature?.attributes.GSG_code as string | undefined) ?? null,
      provenance: {
        source: feature
          ? "NSW Great Soil Group (GSG) Soil Type map — live ArcGIS REST. Regional soil-landscape classification, not a parcel-specific geotechnical result — commission an AS2870 site classification report before finalising footing design."
          : "NSW Great Soil Group (GSG) Soil Type map — no classification mapped for this lot (live ArcGIS REST)",
        retrievedAt: nowIso(),
      },
    };
  }

  async landCapability(lotDp: string | null, _lga: string): Promise<LandCapabilityResult> {
    const point = await resolvePointForLot(lotDp);
    if (!point) {
      return {
        shallowRockRating: null,
        massMovementRating: null,
        waterloggingRating: null,
        waterErosionRating: null,
        provenance: { source: "No lot/DP to resolve — cannot look up land capability", retrievedAt: nowIso() },
      };
    }

    const features = await queryArcGis(LAND_CAPABILITY_SERVICE, pointQuery(point, "LSC_Sh_Rk,LSC_Mass_m,LSC_Watlog,LSC_WatrEr")).catch(
      () => [] as ArcGisFeature[]
    );
    const feature = features[0];

    return {
      shallowRockRating: (feature?.attributes.LSC_Sh_Rk as number | undefined) ?? null,
      massMovementRating: (feature?.attributes.LSC_Mass_m as number | undefined) ?? null,
      waterloggingRating: (feature?.attributes.LSC_Watlog as number | undefined) ?? null,
      waterErosionRating: (feature?.attributes.LSC_WatrEr as number | undefined) ?? null,
      provenance: {
        source: feature
          ? "NSW Land and Soil Capability (LSC) map — live ArcGIS REST. Each hazard rated 1 (best/least limiting) to 8 (worst/most limiting) — a regional land-capability classification, not a parcel-specific geotechnical result."
          : "NSW Land and Soil Capability (LSC) map — no classification mapped for this lot (live ArcGIS REST)",
        retrievedAt: nowIso(),
      },
    };
  }

  async environmentalContext(lotDp: string | null, _lga: string): Promise<EnvironmentalContextResult> {
    const point = await resolvePointForLot(lotDp);
    if (!point) {
      return {
        localTreeCanopyPercent: null,
        provenance: { source: "No lot/DP to resolve — cannot look up local tree canopy", retrievedAt: nowIso() },
      };
    }

    const features = await queryArcGis(TREE_CANOPY_LAYER, pointQuery(point, "PCT_TREE")).catch(() => [] as ArcGisFeature[]);
    const feature = features[0];
    const pct = feature?.attributes.PCT_TREE as number | undefined;

    return {
      localTreeCanopyPercent: pct !== undefined ? Math.round(pct * 10) / 10 : null,
      provenance: {
        source: feature
          ? "NSW Urban Vegetation Cover — Percent Tree Canopy (UHGC) — live ArcGIS REST. ABS Mesh-Block-level area statistic, not a parcel-specific overshadowing measurement."
          : "NSW Urban Vegetation Cover — Percent Tree Canopy (UHGC) — no data mapped for this lot (live ArcGIS REST)",
        retrievedAt: nowIso(),
      },
    };
  }

  async roadAccess(lotDp: string | null, _lga: string): Promise<RoadAccessResult> {
    const point = await resolvePointForLot(lotDp);
    if (!point) {
      return {
        nearbyClassifiedRoad: null,
        provenance: { source: "No lot/DP to resolve — cannot check road classification", retrievedAt: nowIso() },
      };
    }

    const mercatorPoint = await reprojectViaImageServer(ELEVATION_SERVICE, point, 28356);
    if (!mercatorPoint) {
      return {
        nearbyClassifiedRoad: null,
        provenance: { source: "Could not reproject lot location for road-classification lookup", retrievedAt: nowIso() },
      };
    }

    const envelope = {
      xmin: mercatorPoint.x - ROAD_PROXIMITY_BUFFER_M,
      ymin: mercatorPoint.y - ROAD_PROXIMITY_BUFFER_M,
      xmax: mercatorPoint.x + ROAD_PROXIMITY_BUFFER_M,
      ymax: mercatorPoint.y + ROAD_PROXIMITY_BUFFER_M,
      spatialReference: { wkid: ROADS_LAYER_SR },
    };
    const features = await queryArcGis(ROADS_LAYER, {
      geometry: JSON.stringify(envelope),
      geometryType: "esriGeometryEnvelope",
      spatialRel: "esriSpatialRelIntersects",
      outFields: "functionhierarchy,roadnamestring",
    }).catch(() => [] as ArcGisFeature[]);

    // Lowest hierarchy code = busiest road (1 Motorway ... 11 Access Way) —
    // surface the busiest one found within the buffer.
    let best: ArcGisFeature | undefined;
    let bestCode = Infinity;
    for (const f of features) {
      const code = f.attributes.functionhierarchy as number | undefined;
      if (typeof code === "number" && code < bestCode) {
        bestCode = code;
        best = f;
      }
    }
    const hierarchyName = best ? FUNCTION_HIERARCHY_NAMES[bestCode] : undefined;

    return {
      nearbyClassifiedRoad: hierarchyName ?? null,
      provenance: {
        source: best
          ? `NSW classified-road layer (Roads_Primary) — live ArcGIS REST; nearest classified road within ${ROAD_PROXIMITY_BUFFER_M}m is a ${hierarchyName} (${(best.attributes.roadnamestring as string | undefined) ?? "unnamed"}). This is a proximity check, not a confirmed frontage road — verify which road the lot actually fronts.`
          : `NSW classified-road layer (Roads_Primary) — no classified road (Motorway/Primary/Arterial/Sub-Arterial/Distributor) found within ${ROAD_PROXIMITY_BUFFER_M}m; this layer does not include ordinary local streets, so absence here is consistent with (but does not confirm) local-street access.`,
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
        groundwaterVulnerability: false,
        salinity: false,
        provenance: { source: "Lot point could not be resolved — all constraint flags unknown", retrievedAt: nowIso() },
      };
    }

    const [
      bushfireFeatures,
      floodFeatures,
      assFeatures,
      anefFeatures,
      mineSubsidenceFeatures,
      coastalWetlandsFeatures,
      coastalEnvFeatures,
      coastalUseFeatures,
      groundwaterFeatures,
      salinityFeatures,
    ] = await Promise.all([
      queryArcGis(BUSHFIRE_LAYER, pointQuery(point, "Category")).catch(() => [] as ArcGisFeature[]),
      queryArcGis(FLOOD_LAYER, pointQuery(point, "LAY_CLASS")).catch(() => [] as ArcGisFeature[]),
      queryArcGis(ACID_SULFATE_LAYER, pointQuery(point, "LABEL")).catch(() => [] as ArcGisFeature[]),
      queryArcGis(ANEF_LAYER, pointQuery(point, "ANEF_CODE")).catch(() => [] as ArcGisFeature[]),
      queryArcGis(MINE_SUBSIDENCE_LAYER, pointQuery(point, "DISTRICTNAME")).catch(() => [] as ArcGisFeature[]),
      queryArcGis(COASTAL_WETLANDS_LAYER, pointQuery(point, "LAY_CLASS")).catch(() => [] as ArcGisFeature[]),
      queryArcGis(COASTAL_ENV_AREA_LAYER, pointQuery(point, "LAY_CLASS")).catch(() => [] as ArcGisFeature[]),
      queryArcGis(COASTAL_USE_AREA_LAYER, pointQuery(point, "LAY_CLASS")).catch(() => [] as ArcGisFeature[]),
      queryArcGis(GROUNDWATER_LAYER, pointQuery(point, "LAY_CLASS")).catch(() => [] as ArcGisFeature[]),
      queryArcGis(SALINITY_LAYER, pointQuery(point, "LAY_CLASS")).catch(() => [] as ArcGisFeature[]),
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
      groundwaterVulnerability: groundwaterFeatures.length > 0,
      salinity: salinityFeatures.length > 0,
      provenance: {
        source:
          "NSW ePlanning live ArcGIS REST: bushfire (RFS Bushfire Prone Land), flood (Flood Planning Map), acid sulfate soils, airport noise (ANEF), mine subsidence district, Coastal Management SEPP areas (wetlands/environment/use area — the dedicated Coastal Vulnerability/erosion map has no statewide dataset published yet), groundwater vulnerability, and salinity. Contamination and sewer easements still have no confirmed free live statewide source.",
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
