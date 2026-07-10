"use client";

import { useMemo } from "react";
import { Canvas } from "@react-three/fiber";
import { Grid, Line, OrbitControls } from "@react-three/drei";
import * as THREE from "three";
import type { AssessmentRecord, LotPolygonPoint } from "@/types/assessment";

const LAYER_Y_STEP = 0.02;

/** Synthetic rectangle, used only when no real cadastre polygon is available. */
function rectangleFallback(frontageM: number, depthM: number): LotPolygonPoint[] {
  const hw = frontageM / 2;
  const hd = depthM / 2;
  return [
    { x: -hw, y: -hd },
    { x: hw, y: -hd },
    { x: hw, y: hd },
    { x: -hw, y: hd },
  ];
}

/**
 * Renders each ring in `rings` as its own independent translucent ground
 * patch — a deliberate simplification: true donut-hole semantics (an inner
 * ring cut out of an outer one, per winding order) are not resolved, so a
 * hole would incorrectly render as a second filled patch rather than a gap.
 * Reasonable for the lot boundary (always single-ring) and for hazard/
 * heritage overlays (verified to sometimes have multiple *disjoint* rings,
 * e.g. separate vegetation patches, which is the common case this simplifies
 * correctly).
 *
 * Local (x, y) plan points -> world (x, 0, y): ground is the XZ plane, Y is
 * up. Pre-negating y before feeding THREE.Shape (which lives in its own XY
 * plane) cancels out the -90°-about-X rotation used to lay the shape flat,
 * so every other point in this component (outlines, the envelope box) can
 * use the same (local x, local y) -> (world x, world z) mapping unchanged.
 */
function GroundShape({
  rings,
  fillColor,
  outlineColor,
  opacity,
  yOffset,
}: {
  rings: LotPolygonPoint[][];
  fillColor: string;
  outlineColor: string;
  opacity: number;
  yOffset: number;
}) {
  const shapes = useMemo(
    () =>
      rings.map((ring) => {
        const s = new THREE.Shape();
        ring.forEach((p, i) => {
          if (i === 0) s.moveTo(p.x, -p.y);
          else s.lineTo(p.x, -p.y);
        });
        s.closePath();
        return s;
      }),
    [rings]
  );

  const outlines = useMemo(
    () =>
      rings.map((ring) => {
        const closed = ring.length > 0 ? [...ring, ring[0]] : ring;
        return closed.map((p) => new THREE.Vector3(p.x, yOffset + 0.01, p.y));
      }),
    [rings, yOffset]
  );

  return (
    <>
      {shapes.map((shape, i) => (
        <mesh key={i} rotation={[-Math.PI / 2, 0, 0]} position={[0, yOffset, 0]}>
          <shapeGeometry args={[shape]} />
          <meshStandardMaterial color={fillColor} transparent opacity={opacity} side={THREE.DoubleSide} />
        </mesh>
      ))}
      {outlines.map((outline, i) => (
        <Line key={i} points={outline} color={outlineColor} lineWidth={2} />
      ))}
    </>
  );
}

function EnvelopeBox({ widthM, depthM, heightM }: { widthM: number; depthM: number; heightM: number }) {
  return (
    <mesh position={[0, heightM / 2, 0]}>
      <boxGeometry args={[widthM, heightM, depthM]} />
      <meshStandardMaterial color="#f97316" transparent opacity={0.45} />
    </mesh>
  );
}

export function MassingView({ record }: { record: AssessmentRecord }) {
  const { siteProfile, planningControls, buildableEnvelope, constraints } = record;

  if (buildableEnvelope.envelopeAreaSqm === null || buildableEnvelope.envelopeWidthM === null || buildableEnvelope.envelopeDepthM === null) {
    return (
      <div className="flex h-72 items-center justify-center rounded border bg-neutral-50 text-sm text-neutral-500">
        Not enough data for a 3D massing view — lot dimensions unconfirmed.
      </div>
    );
  }

  const lotPoints =
    siteProfile.lotPolygon && siteProfile.lotPolygon.length >= 3
      ? siteProfile.lotPolygon
      : siteProfile.frontageM !== null && siteProfile.depthM !== null
        ? rectangleFallback(siteProfile.frontageM, siteProfile.depthM)
        : null;

  const bushfireZoneRings = constraints.find((c) => c.name.startsWith("Bushfire"))?.zoneRings ?? null;
  const heritageZoneRings = planningControls.heritageZoneRings ?? null;

  const heightM = planningControls.heightOfBuildingM ?? 8.5;
  const heightIsIndicative = planningControls.heightOfBuildingM === null;
  const orbitTarget: [number, number, number] = [0, heightM / 2, 0];

  const isLiveLot = !!siteProfile.lotPolygon;
  const isMockOverlay = !isLiveLot; // mock fixtures are the only source of overlays when the lot itself is a rectangle fallback

  return (
    <div>
      <div className="h-80 w-full overflow-hidden rounded border bg-sky-50">
        <Canvas camera={{ position: [28, 22, 28], fov: 42 }}>
          <ambientLight intensity={0.7} />
          <directionalLight position={[20, 30, 10]} intensity={0.9} />
          <Grid args={[100, 100]} cellSize={5} sectionSize={20} fadeDistance={80} infiniteGrid position={[0, -0.02, 0]} />
          {lotPoints && <GroundShape rings={[lotPoints]} fillColor="#bbd0a8" outlineColor="#4d7c0f" opacity={0.55} yOffset={0} />}
          {bushfireZoneRings && (
            <GroundShape rings={bushfireZoneRings} fillColor="#dc2626" outlineColor="#7f1d1d" opacity={0.3} yOffset={LAYER_Y_STEP} />
          )}
          {heritageZoneRings && (
            <GroundShape rings={heritageZoneRings} fillColor="#d97706" outlineColor="#78350f" opacity={0.3} yOffset={2 * LAYER_Y_STEP} />
          )}
          <EnvelopeBox widthM={buildableEnvelope.envelopeWidthM} depthM={buildableEnvelope.envelopeDepthM} heightM={heightM} />
          <OrbitControls target={orbitTarget} />
        </Canvas>
      </div>
      <p className="mt-1 text-xs text-neutral-500">
        {siteProfile.lotPolygon ? "Lot outline: real cadastre shape." : "Lot outline: rectangle approximation (no real polygon available)."} Buildable
        envelope shown to {heightIsIndicative ? "an indicative" : "the zoned"} height limit ({heightM}m)
        {heightIsIndicative ? " — height control unverified, showing a typical figure" : ""}. Envelope box is axis-aligned to the lot&apos;s bounding
        box, not rotation-matched to the real polygon&apos;s edges.
        {(bushfireZoneRings || heritageZoneRings) && (
          <>
            {" "}
            {bushfireZoneRings && <span className="text-red-700">Red tint = bushfire prone land.</span>}{" "}
            {heritageZoneRings && <span className="text-amber-700">Amber tint = heritage item/conservation area.</span>}{" "}
            {isMockOverlay
              ? "Shown as a synthetic demo shape (mock data — not a real hazard/heritage boundary)."
              : "Shown at full mapped extent, not clipped to the lot boundary — it may visually extend beyond the lot outline; that's expected, not a bug."}
          </>
        )}
        {" "}Flood/acid-sulfate-soils/contamination/aircraft-noise have no live overlay source and are never shown here.
      </p>
    </div>
  );
}
