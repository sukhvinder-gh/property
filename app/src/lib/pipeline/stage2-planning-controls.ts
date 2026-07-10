import type { DataSourceAdapter } from "@/lib/data-sources/types";
import { verifyZoneAlignment } from "@/lib/pipeline/geometry-utils";
import type { PlanningControls, SiteProfile } from "@/types/assessment";

export async function runStage2PlanningControls(
  adapter: DataSourceAdapter,
  siteProfile: SiteProfile
): Promise<PlanningControls> {
  const controls = await adapter.planningControls(siteProfile.lotDp, siteProfile.lga, siteProfile.epiName);
  const heritageZone = verifyZoneAlignment(controls.heritageZoneRings, siteProfile);

  const provenance = [controls.provenance];
  if (heritageZone.droppedReason) {
    provenance.push({ source: `Heritage zone geometry: ${heritageZone.droppedReason}`, retrievedAt: controls.provenance.retrievedAt });
  }

  return {
    zone: controls.zone,
    zoneDescription: controls.zoneDescription,
    minLotSizeSqm: controls.minLotSizeSqm,
    fsr: controls.fsr,
    heightOfBuildingM: controls.heightOfBuildingM,
    heritageItem: controls.heritageItem,
    heritageConservationArea: controls.heritageConservationArea,
    biodiversityOverlay: controls.biodiversityOverlay,
    heritageZoneRings: heritageZone.rings,
    provenance,
  };
}
