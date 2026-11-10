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

/**
 * The council profile scoped to the instrument that actually governs this
 * lot. LGA alone isn't enough: growth-centre precinct land in Blacktown is
 * zoned under SEPP (Precincts—Central River City) 2021, not Blacktown LEP
 * 2015, so that LEP's Land Use Table and lot-size clauses must not be
 * applied there. Those LEP-only fields are dropped whenever the live EPI
 * isn't the profile's LEP (including when the EPI couldn't be resolved) —
 * an honest "verify" beats applying the wrong instrument's numbers.
 */
export function getCouncilProfileForSite(lga: string, epiName: string): CouncilProfile | null {
  const profile = getCouncilProfile(lga);
  if (!profile) return null;
  if (epiName.trim().toLowerCase() === profile.lepName.toLowerCase()) return profile;

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const { permittedUsesByZone, minLotSizeByUseAndZone, ...dcpOnly } = profile;
  const isSepp = /state environmental planning policy/i.test(epiName);
  const note = isSepp
    ? `This lot is zoned under ${epiName}, not ${profile.lepName} — ${profile.lepName}'s Land Use Table and lot-size clauses are not applied. SEPP precinct land usually has its own precinct DCP too, so the ${profile.instrumentName} setbacks used here may not apply — verify the precinct controls with council or a Section 10.7 certificate.`
    : `The governing planning instrument for this lot could not be confirmed as ${profile.lepName} — that LEP's Land Use Table and lot-size clauses are not applied. Verify via the NSW Planning Portal or a Section 10.7 certificate.`;
  return { ...dcpOnly, notes: [...profile.notes, note] };
}

export function isCouncilProfiled(lga: string): boolean {
  return getCouncilProfile(lga) !== null;
}

export type { CouncilProfile } from "@/lib/pipeline/council-profiles/types";
