import type { DataSourceAdapter } from "@/lib/data-sources/types";
import type { PlanningControls, SiteProfile } from "@/types/assessment";

export async function runStage2PlanningControls(
  adapter: DataSourceAdapter,
  siteProfile: SiteProfile
): Promise<PlanningControls> {
  const controls = await adapter.planningControls(siteProfile.lotDp, siteProfile.lga, siteProfile.epiName);

  return {
    zone: controls.zone,
    zoneDescription: controls.zoneDescription,
    minLotSizeSqm: controls.minLotSizeSqm,
    fsr: controls.fsr,
    heightOfBuildingM: controls.heightOfBuildingM,
    heritageItem: controls.heritageItem,
    heritageConservationArea: controls.heritageConservationArea,
    biodiversityOverlay: controls.biodiversityOverlay,
    provenance: [controls.provenance],
  };
}
