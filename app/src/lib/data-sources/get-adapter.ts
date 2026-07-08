import { MockDataSourceAdapter } from "@/lib/data-sources/mock";
import { NswPlanningPortalAdapter } from "@/lib/data-sources/nsw-live";
import type { DataSourceAdapter } from "@/lib/data-sources/types";

let cached: DataSourceAdapter | null = null;

/**
 * Live NSW Planning Portal / Spatial Services data by default. Set
 * USE_MOCK_DATA_SOURCE=true to fall back to the curated demo fixtures
 * (useful for offline dev or showcasing the profiled-council scoring path).
 */
export function getDataSourceAdapter(): DataSourceAdapter {
  if (cached) return cached;
  cached = process.env.USE_MOCK_DATA_SOURCE === "true" ? new MockDataSourceAdapter() : new NswPlanningPortalAdapter();
  return cached;
}
