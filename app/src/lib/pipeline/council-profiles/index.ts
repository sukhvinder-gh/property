import { blacktownProfile } from "@/lib/pipeline/council-profiles/blacktown";
import { hillsShireProfile } from "@/lib/pipeline/council-profiles/hills-shire";
import type { CouncilProfile } from "@/lib/pipeline/council-profiles/types";

const PROFILES: CouncilProfile[] = [blacktownProfile, hillsShireProfile];

/**
 * Single source of truth for which councils have a deep DCP profile —
 * both data adapters delegate their isCouncilProfiled() to this instead of
 * keeping their own separate keyword lists.
 */
export function getCouncilProfile(lga: string): CouncilProfile | null {
  const l = lga.toLowerCase();
  return PROFILES.find((p) => l.includes(p.lgaKeyword)) ?? null;
}

export function isCouncilProfiled(lga: string): boolean {
  return getCouncilProfile(lga) !== null;
}

export type { CouncilProfile } from "@/lib/pipeline/council-profiles/types";
