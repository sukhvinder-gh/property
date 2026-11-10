import { NextRequest, NextResponse } from "next/server";

/**
 * Address suggestions. Primary source is NSW's own property address register
 * via the Planning Portal ePlanning API (keyless, ~0.2s): every suggestion is
 * a real NSW property, the same register the assessment's lot lookup uses, so
 * a picked suggestion always resolves. Google Places is a fallback when NSW
 * finds nothing (e.g. a non-address place name), if a key is configured.
 */

const NSW_ADDRESS_API = "https://api.apps1.nsw.gov.au/planning/viewersf/V1/ePlanningApi/address";
const MAX_SUGGESTIONS = 8;

// The NSW search matches whole words, so "st"/"dr" don't find "STREET"/"DRIVE".
const STREET_TYPES: Record<string, string> = {
  st: "street", rd: "road", dr: "drive", ave: "avenue", av: "avenue", pl: "place", cres: "crescent", cr: "crescent",
  ct: "court", cl: "close", pde: "parade", hwy: "highway", cct: "circuit", tce: "terrace", ln: "lane", bvd: "boulevard",
  blvd: "boulevard", gr: "grove", gdns: "gardens", wy: "way", esp: "esplanade", sq: "square", pkwy: "parkway",
};
const STREET_TYPE_WORDS = new Set([...Object.values(STREET_TYPES), "row", "rise", "glade", "mews", "loop", "walk", "track", "vista", "view", "link", "chase", "green"]);

// Rough NSW bounding box for the Google fallback.
const NSW_BOUNDS = {
  low: { latitude: -37.6, longitude: 140.9 },
  high: { latitude: -28.1, longitude: 153.7 },
};

interface PlacePrediction {
  placeId?: string;
  text?: { text?: string };
}

interface Suggestion {
  placeId: string;
  text: string;
}

function normaliseQuery(input: string): string {
  return input
    .toLowerCase()
    .replace(/,/g, " ")
    .replace(/\bnsw\b/g, " ")
    .split(/\s+/)
    .filter(Boolean)
    .map((w) => STREET_TYPES[w.replace(/\.$/, "")] ?? w)
    .join(" ");
}

const titleCase = (s: string) => s.toLowerCase().replace(/\b[a-z]/g, (c) => c.toUpperCase());

/** "60 OAKHILL DRIVE CASTLE HILL 2154" → "60 Oakhill Drive, Castle Hill NSW 2154". */
function formatNswAddress(raw: string): string {
  const words = raw.trim().split(/\s+/);
  const postcode = /^\d{4}$/.test(words[words.length - 1]) ? words.pop()! : null;
  let streetEnd = -1;
  words.forEach((w, i) => {
    if (i > 0 && STREET_TYPE_WORDS.has(w.toLowerCase())) streetEnd = i;
  });
  const street = streetEnd >= 0 ? words.slice(0, streetEnd + 1).join(" ") : words.join(" ");
  const suburb = streetEnd >= 0 ? words.slice(streetEnd + 1).join(" ") : "";
  return `${titleCase(street)}${suburb ? `, ${titleCase(suburb)}` : ""} NSW${postcode ? ` ${postcode}` : ""}`;
}

async function nswSuggestions(input: string): Promise<Suggestion[]> {
  const url = `${NSW_ADDRESS_API}?a=${encodeURIComponent(normaliseQuery(input))}&noOfRecords=${MAX_SUGGESTIONS}`;
  const res = await fetch(url, { signal: AbortSignal.timeout(5000) }).catch(() => null);
  if (!res?.ok) return [];
  const rows = (await res.json().catch(() => [])) as { address?: string; propId?: number }[];
  return rows
    .filter((r) => r.address && r.propId)
    .map((r) => ({ placeId: `nsw-${r.propId}`, text: formatNswAddress(r.address!) }));
}

async function googleSuggestions(input: string, sessionToken: unknown): Promise<Suggestion[]> {
  const apiKey = process.env.GOOGLE_PLACES_API_KEY;
  if (!apiKey) return [];
  const res = await fetch("https://places.googleapis.com/v1/places:autocomplete", {
    method: "POST",
    headers: { "Content-Type": "application/json", "X-Goog-Api-Key": apiKey },
    body: JSON.stringify({
      input,
      sessionToken: typeof sessionToken === "string" ? sessionToken : undefined,
      includedRegionCodes: ["au"],
      locationRestriction: { rectangle: { low: NSW_BOUNDS.low, high: NSW_BOUNDS.high } },
    }),
  }).catch(() => null);
  if (!res || !res.ok) return [];

  const json = await res.json();
  return ((json.suggestions ?? []) as { placePrediction?: PlacePrediction }[])
    .map((s) => s.placePrediction)
    .filter((p): p is PlacePrediction => Boolean(p?.placeId && p?.text?.text))
    .map((p) => ({ placeId: p.placeId as string, text: p.text!.text as string }));
}

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null);
  const input = typeof body?.input === "string" ? body.input.trim() : "";
  if (input.length < 3) return NextResponse.json({ suggestions: [] });

  const nsw = await nswSuggestions(input);
  const suggestions = nsw.length ? nsw : await googleSuggestions(input, body?.sessionToken);
  return NextResponse.json({ suggestions });
}
