import { NextRequest, NextResponse } from "next/server";

// Rough NSW bounding box — biases/restricts results to the state this
// product covers, rather than autocompleting addresses Australia-wide.
const NSW_BOUNDS = {
  low: { latitude: -37.6, longitude: 140.9 },
  high: { latitude: -28.1, longitude: 153.7 },
};

interface PlacePrediction {
  placeId?: string;
  text?: { text?: string };
}

export async function POST(req: NextRequest) {
  const apiKey = process.env.GOOGLE_PLACES_API_KEY;
  if (!apiKey) return NextResponse.json({ suggestions: [] });

  const body = await req.json().catch(() => null);
  const input = typeof body?.input === "string" ? body.input.trim() : "";
  if (input.length < 3) return NextResponse.json({ suggestions: [] });

  const res = await fetch("https://places.googleapis.com/v1/places:autocomplete", {
    method: "POST",
    headers: { "Content-Type": "application/json", "X-Goog-Api-Key": apiKey },
    body: JSON.stringify({
      input,
      sessionToken: typeof body?.sessionToken === "string" ? body.sessionToken : undefined,
      includedRegionCodes: ["au"],
      locationRestriction: { rectangle: { low: NSW_BOUNDS.low, high: NSW_BOUNDS.high } },
    }),
  }).catch(() => null);

  if (!res || !res.ok) return NextResponse.json({ suggestions: [] });

  const json = await res.json();
  const suggestions = ((json.suggestions ?? []) as { placePrediction?: PlacePrediction }[])
    .map((s) => s.placePrediction)
    .filter((p): p is PlacePrediction => Boolean(p?.placeId && p?.text?.text))
    .map((p) => ({ placeId: p.placeId as string, text: p.text!.text as string }));

  return NextResponse.json({ suggestions });
}
