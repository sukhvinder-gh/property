"use client";

import { useMemo } from "react";
import { Canvas } from "@react-three/fiber";
import { Grid, Line, OrbitControls } from "@react-three/drei";
import * as THREE from "three";
import type { AssessmentRecord } from "@/types/assessment";

/** Synthetic rectangle, used only when no real cadastre polygon is available. */
function rectangleFallback(frontageM: number, depthM: number): { x: number; y: number }[] {
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
 * Local (x, y) plan points -> world (x, 0, y): ground is the XZ plane, Y is up.
 * Pre-negating y before feeding THREE.Shape (which lives in its own XY plane)
 * cancels out the -90°-about-X rotation used to lay the shape flat, so every
 * other point in this component (the outline, the envelope box) can use the
 * same (local x, local y) -> (world x, world z) mapping without a sign flip.
 */
function LotGround({ points }: { points: { x: number; y: number }[] }) {
  const shape = useMemo(() => {
    const s = new THREE.Shape();
    points.forEach((p, i) => {
      if (i === 0) s.moveTo(p.x, -p.y);
      else s.lineTo(p.x, -p.y);
    });
    s.closePath();
    return s;
  }, [points]);

  const outline = useMemo(() => {
    const closed = [...points, points[0]];
    return closed.map((p) => new THREE.Vector3(p.x, 0.05, p.y));
  }, [points]);

  return (
    <>
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0, 0]}>
        <shapeGeometry args={[shape]} />
        <meshStandardMaterial color="#bbd0a8" transparent opacity={0.55} side={THREE.DoubleSide} />
      </mesh>
      <Line points={outline} color="#4d7c0f" lineWidth={2} />
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
  const { siteProfile, planningControls, buildableEnvelope } = record;

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

  const heightM = planningControls.heightOfBuildingM ?? 8.5;
  const heightIsIndicative = planningControls.heightOfBuildingM === null;
  const orbitTarget: [number, number, number] = [0, heightM / 2, 0];

  return (
    <div>
      <div className="h-80 w-full overflow-hidden rounded border bg-sky-50">
        <Canvas camera={{ position: [28, 22, 28], fov: 42 }}>
          <ambientLight intensity={0.7} />
          <directionalLight position={[20, 30, 10]} intensity={0.9} />
          <Grid args={[100, 100]} cellSize={5} sectionSize={20} fadeDistance={80} infiniteGrid position={[0, -0.02, 0]} />
          {lotPoints && <LotGround points={lotPoints} />}
          <EnvelopeBox widthM={buildableEnvelope.envelopeWidthM} depthM={buildableEnvelope.envelopeDepthM} heightM={heightM} />
          <OrbitControls target={orbitTarget} />
        </Canvas>
      </div>
      <p className="mt-1 text-xs text-neutral-500">
        {siteProfile.lotPolygon ? "Lot outline: real cadastre shape." : "Lot outline: rectangle approximation (no real polygon available)."} Buildable
        envelope shown to {heightIsIndicative ? "an indicative" : "the zoned"} height limit ({heightM}m)
        {heightIsIndicative ? " — height control unverified, showing a typical figure" : ""}. Envelope box is axis-aligned to the lot&apos;s bounding
        box, not rotation-matched to the real polygon&apos;s edges.
      </p>
    </div>
  );
}
