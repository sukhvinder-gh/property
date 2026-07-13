import type { DataSourceAdapter } from "@/lib/data-sources/types";
import type { CouncilTier, SiteProfile } from "@/types/assessment";

function classifySlope(slopePercent: number | null): SiteProfile["slopeClass"] {
  if (slopePercent === null) return null;
  if (slopePercent < 10) return "gentle";
  if (slopePercent <= 20) return "moderate";
  return "steep";
}

export async function runStage1SiteIdentification(
  adapter: DataSourceAdapter,
  address: string
): Promise<SiteProfile> {
  const geo = await adapter.geocode(address);
  const topo = await adapter.topography(geo.lotDp, geo.lga);
  const soil = await adapter.soilType(geo.lotDp, geo.lga);
  const road = await adapter.roadAccess(geo.lotDp, geo.lga);

  const councilTier: CouncilTier = adapter.isCouncilProfiled(geo.lga)
    ? "profiled"
    : "unprofiled_data_rich"; // Stage 6 downgrades to data_thin once DA volume is known.

  const dimensionsUnknown = geo.lotSizeSqm === null || geo.frontageM === null || geo.depthM === null;

  return {
    address,
    lotDp: geo.lotDp,
    lga: geo.lga,
    epiName: geo.epiName,
    epiAmendmentDate: geo.epiAmendmentDate,
    lotSizeSqm: geo.lotSizeSqm,
    frontageM: geo.frontageM,
    depthM: geo.depthM,
    isCornerLot: geo.isCornerLot,
    lotPolygon: geo.lotPolygon,
    registrationStatus: geo.registrationStatus,
    councilTier,
    slopeClass: classifySlope(topo.slopePercent),
    slopePercent: topo.slopePercent,
    soilType: soil.soilType,
    soilTypeCode: soil.soilTypeCode,
    nearbyClassifiedRoad: road.nearbyClassifiedRoad,
    indicativeOnly: dimensionsUnknown || geo.registrationStatus === "unregistered",
    provenance: [geo.provenance, topo.provenance, soil.provenance, road.provenance],
  };
}
