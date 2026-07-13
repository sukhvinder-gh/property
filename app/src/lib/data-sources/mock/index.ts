import type {
  ConstraintsResult,
  DaStatsResult,
  DataSourceAdapter,
  GeocodeResult,
  PlanningControlsResult,
  RoadAccessResult,
  SoilTypeResult,
  TopographyResult,
} from "@/lib/data-sources/types";
import { isCouncilProfiled } from "@/lib/pipeline/council-profiles";

/**
 * Fixture-backed adapter standing in for the real NSW ePlanning / Spatial
 * Services / Planning Portal integrations described in
 * docs/property-pre-approval-engine/references/data-sources.md.
 *
 * Suburb keyword match picks a fixture. There is no live geocoding here —
 * an address that doesn't match one of the named demo fixtures below is
 * genuinely unresolved, and per the domain rule "never guess a control
 * value" (SKILL.md), an unresolved address must return unknowns, not a
 * plausible-looking default. Returning fabricated numbers for addresses
 * we can't actually place was the bug: it produced a confident, wrong
 * report for any address outside the four demo suburbs.
 */

export const UNRESOLVED_LGA = "Unresolved (mock adapter — no live NSW ePlanning integration)";

const DATA_RICH_LGAS = new Set(["City of Parramatta"]);

type Fixture = {
  matchesSuburb: (s: string) => boolean;
  lga: string;
  epiName: string;
  epiAmendmentDate: string;
  lotSizeSqm: number;
  frontageM: number;
  depthM: number;
  isCornerLot: boolean;
  registrationStatus: "registered" | "unregistered";
  slopePercent: number;
  zone: string;
  zoneDescription: string;
  minLotSizeSqm: number | null;
  fsr: number | null;
  heightOfBuildingM: number | null;
  heritageItem: boolean;
  heritageConservationArea: boolean;
  biodiversityOverlay: boolean;
  floodControlLot: boolean;
  bushfireProneLand: boolean;
  acidSulfateSoils: boolean;
  contamination: boolean;
  hasSewerEasement: boolean;
  aircraftNoiseAnef: boolean;
  determinationsLast12Months: number;
  approvalRatePercent: number | null;
  medianDeterminationDays: number | null;
};

const FIXTURES: Fixture[] = [
  {
    matchesSuburb: (s) => /marsden park|schofields|riverstone/i.test(s),
    lga: "Blacktown City Council",
    epiName: "Blacktown Local Environmental Plan 2015",
    epiAmendmentDate: "2025-11-03",
    lotSizeSqm: 450,
    frontageM: 14,
    depthM: 32,
    isCornerLot: false,
    registrationStatus: "unregistered",
    slopePercent: 4,
    zone: "R1",
    zoneDescription: "General Residential",
    minLotSizeSqm: 400,
    fsr: 0.5,
    heightOfBuildingM: 8.5,
    heritageItem: false,
    heritageConservationArea: false,
    biodiversityOverlay: false,
    floodControlLot: true,
    bushfireProneLand: false,
    acidSulfateSoils: false,
    contamination: false,
    hasSewerEasement: true,
    aircraftNoiseAnef: true,
    determinationsLast12Months: 214,
    approvalRatePercent: 87,
    medianDeterminationDays: 42,
  },
  {
    matchesSuburb: (s) => /kellyville|bella vista|showground/i.test(s),
    lga: "The Hills Shire Council",
    epiName: "The Hills Local Environmental Plan 2019",
    epiAmendmentDate: "2025-06-18",
    lotSizeSqm: 620,
    frontageM: 18,
    depthM: 34,
    isCornerLot: false,
    registrationStatus: "registered",
    slopePercent: 13,
    zone: "R2",
    zoneDescription: "Low Density Residential",
    minLotSizeSqm: 550,
    fsr: 0.5,
    heightOfBuildingM: 9,
    heritageItem: false,
    heritageConservationArea: false,
    biodiversityOverlay: false,
    floodControlLot: false,
    bushfireProneLand: true,
    acidSulfateSoils: false,
    contamination: false,
    hasSewerEasement: false,
    aircraftNoiseAnef: false,
    determinationsLast12Months: 61,
    approvalRatePercent: 74,
    medianDeterminationDays: 58,
  },
  {
    matchesSuburb: (s) => /parramatta/i.test(s),
    lga: "City of Parramatta",
    epiName: "Parramatta Local Environmental Plan 2023",
    epiAmendmentDate: "2025-02-10",
    lotSizeSqm: 500,
    frontageM: 15,
    depthM: 33,
    isCornerLot: true,
    registrationStatus: "registered",
    slopePercent: 6,
    zone: "R2",
    zoneDescription: "Low Density Residential",
    minLotSizeSqm: 450,
    fsr: 0.55,
    heightOfBuildingM: 9,
    heritageItem: false,
    heritageConservationArea: true,
    biodiversityOverlay: false,
    floodControlLot: false,
    bushfireProneLand: false,
    acidSulfateSoils: false,
    contamination: false,
    hasSewerEasement: false,
    aircraftNoiseAnef: false,
    determinationsLast12Months: 38,
    approvalRatePercent: 69,
    medianDeterminationDays: 71,
  },
];

// A fourth, explicitly-triggered demo fixture for the unprofiled/data-thin
// council path (SKILL.md references/councils.md) — kept distinct from the
// "address not recognised" case so that branch stays demoable without
// silently swallowing every unmatched real address.
const RURAL_DEMO_FIXTURE: Fixture = {
  matchesSuburb: (s) => /wagga wagga|dubbo/i.test(s),
  lga: "Wagga Wagga City Council",
  epiName: "Wagga Wagga Local Environmental Plan 2010",
  epiAmendmentDate: "2024-09-01",
  lotSizeSqm: 800,
  frontageM: 20,
  depthM: 40,
  isCornerLot: false,
  registrationStatus: "registered",
  slopePercent: 9,
  zone: "R5",
  zoneDescription: "Large Lot Residential",
  minLotSizeSqm: 700,
  fsr: null,
  heightOfBuildingM: 8.5,
  heritageItem: false,
  heritageConservationArea: false,
  biodiversityOverlay: true,
  floodControlLot: false,
  bushfireProneLand: true,
  acidSulfateSoils: false,
  contamination: false,
  hasSewerEasement: false,
  aircraftNoiseAnef: false,
  determinationsLast12Months: 9,
  approvalRatePercent: 82,
  medianDeterminationDays: 65,
};

const ALL_FIXTURES = [...FIXTURES, RURAL_DEMO_FIXTURE];

function resolveFixture(address: string): Fixture | null {
  return ALL_FIXTURES.find((f) => f.matchesSuburb(address)) ?? null;
}

function nowIso() {
  return new Date().toISOString();
}

/** Synthetic 4-point rectangle centred on the origin — mock fixtures have no real
 * cadastre shape, so this is an honest stand-in, not a claim of real geometry. */
function rectanglePolygon(frontageM: number, depthM: number): { x: number; y: number }[] {
  const hw = frontageM / 2;
  const hd = depthM / 2;
  return [
    { x: -hw, y: -hd },
    { x: hw, y: -hd },
    { x: hw, y: hd },
    { x: -hw, y: hd },
  ];
}

/** Synthetic demo overlay patch covering roughly a third of the lot — not a real
 * hazard/heritage boundary, just illustrative shape for the mock data path. */
function partialLotRect(frontageM: number, depthM: number, edge: "right" | "rear"): { x: number; y: number }[] {
  const hw = frontageM / 2;
  const hd = depthM / 2;
  if (edge === "right") {
    const xStart = hw - frontageM / 3;
    return [
      { x: xStart, y: -hd },
      { x: hw, y: -hd },
      { x: hw, y: hd },
      { x: xStart, y: hd },
    ];
  }
  const yStart = hd - depthM / 3;
  return [
    { x: -hw, y: yStart },
    { x: hw, y: yStart },
    { x: hw, y: hd },
    { x: -hw, y: hd },
  ];
}

export class MockDataSourceAdapter implements DataSourceAdapter {
  isCouncilProfiled(lga: string): boolean {
    return isCouncilProfiled(lga);
  }

  private isDataRich(lga: string): boolean {
    return this.isCouncilProfiled(lga) || DATA_RICH_LGAS.has(lga);
  }

  async geocode(address: string): Promise<GeocodeResult> {
    const f = resolveFixture(address);
    if (!f) {
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
          source: "NSW Spatial Services (Six Maps / NSW Point) — mock adapter has no fixture for this address",
          retrievedAt: nowIso(),
        },
      };
    }
    return {
      lotDp: f.registrationStatus === "unregistered" ? null : `Lot 42/DP${Math.floor(1000000 + Math.random() * 8999999)}`,
      lga: f.lga,
      epiName: f.epiName,
      epiAmendmentDate: f.epiAmendmentDate,
      lotSizeSqm: f.lotSizeSqm,
      frontageM: f.frontageM,
      depthM: f.depthM,
      isCornerLot: f.isCornerLot,
      lotPolygon: rectanglePolygon(f.frontageM, f.depthM),
      registrationStatus: f.registrationStatus,
      provenance: {
        source: "NSW Spatial Services (Six Maps / NSW Point) — mock fixture",
        layerOrEpi: f.epiName,
        retrievedAt: nowIso(),
      },
    };
  }

  async topography(_lotDp: string | null, lga: string): Promise<TopographyResult> {
    const f = ALL_FIXTURES.find((x) => x.lga === lga);
    return {
      slopePercent: f?.slopePercent ?? null,
      provenance: {
        source: f ? "NSW Spatial Services ELVIS LiDAR/DEM — mock fixture" : "NSW Spatial Services ELVIS LiDAR/DEM — no fixture for this LGA",
        retrievedAt: nowIso(),
      },
    };
  }

  async soilType(_lotDp: string | null, _lga: string): Promise<SoilTypeResult> {
    return {
      soilType: null,
      soilTypeCode: null,
      provenance: { source: "NSW Great Soil Group (GSG) Soil Type map — mock fixture, soil type not modelled", retrievedAt: nowIso() },
    };
  }

  async roadAccess(_lotDp: string | null, _lga: string): Promise<RoadAccessResult> {
    return {
      nearbyClassifiedRoad: null,
      provenance: { source: "NSW classified-road layer (Roads_Primary) — mock fixture, road classification not modelled", retrievedAt: nowIso() },
    };
  }

  async planningControls(_lotDp: string | null, lga: string, _epiName: string): Promise<PlanningControlsResult> {
    const f = ALL_FIXTURES.find((x) => x.lga === lga);
    if (!f) {
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
        provenance: {
          source: "NSW ePlanning Spatial Viewer — no fixture for this LGA",
          retrievedAt: nowIso(),
        },
      };
    }
    return {
      zone: f.zone,
      zoneDescription: f.zoneDescription,
      minLotSizeSqm: f.minLotSizeSqm,
      fsr: f.fsr,
      heightOfBuildingM: f.heightOfBuildingM,
      heritageItem: f.heritageItem,
      heritageConservationArea: f.heritageConservationArea,
      biodiversityOverlay: f.biodiversityOverlay,
      // Synthetic demo shape only — mock fixtures have no real heritage boundary.
      heritageZoneRings: f.heritageItem || f.heritageConservationArea ? [partialLotRect(f.frontageM, f.depthM, "right")] : null,
      provenance: {
        source: "NSW ePlanning Spatial Viewer — mock fixture",
        layerOrEpi: f.epiName,
        retrievedAt: nowIso(),
      },
    };
  }

  async constraints(_lotDp: string | null, lga: string): Promise<ConstraintsResult> {
    const f = ALL_FIXTURES.find((x) => x.lga === lga);
    return {
      floodControlLot: f?.floodControlLot ?? false,
      bushfireProneLand: f?.bushfireProneLand ?? false,
      acidSulfateSoils: f?.acidSulfateSoils ?? false,
      acidSulfateSoilsClass: null,
      contamination: f?.contamination ?? false,
      hasSewerEasement: f?.hasSewerEasement ?? false,
      aircraftNoiseAnef: f?.aircraftNoiseAnef ?? false,
      anefContourBand: null,
      // No mock fixture represents a real coalfield or coastal address.
      mineSubsidenceDistrict: false,
      mineSubsidenceDistrictName: null,
      coastalManagementArea: false,
      coastalManagementAreaType: null,
      groundwaterVulnerability: false,
      salinity: false,
      // Synthetic demo shape only — no real hazard boundary in mock fixtures.
      bushfireZoneRings: f?.bushfireProneLand ? [partialLotRect(f.frontageM, f.depthM, "rear")] : null,
      provenance: {
        source: f
          ? "Planning Portal constraint layers (flood/BPL/ASS) — mock fixture"
          : "Planning Portal constraint layers (flood/BPL/ASS) — no fixture for this LGA; none of these are verified, not confirmed absent",
        retrievedAt: nowIso(),
      },
    };
  }

  async daStats(lga: string, _daType: string): Promise<DaStatsResult> {
    const f = ALL_FIXTURES.find((x) => x.lga === lga);
    if (!f) {
      return {
        determinationsLast12Months: 0,
        approvalRatePercent: null,
        medianDeterminationDays: null,
        provenance: {
          source: "Planning Portal Online DA service — no fixture for this LGA",
          retrievedAt: nowIso(),
        },
      };
    }
    return {
      determinationsLast12Months: f.determinationsLast12Months,
      approvalRatePercent: f.approvalRatePercent,
      medianDeterminationDays: f.medianDeterminationDays,
      provenance: {
        source: "Planning Portal Online DA service — mock fixture (rolling 12mo)",
        retrievedAt: nowIso(),
      },
    };
  }
}
