import type { SubfloorReview } from "./subfloor";
import type { SubfloorAdhesiveReview } from "./subfloorAdhesive";
import type { SubfloorFasteningReview } from "./subfloorFastening";
import type { SubfloorJoistReview } from "./subfloorJoists";
import { DrawingReferenceMesh } from "./DrawingReferenceMesh";
import type { WallTracePoint } from "./wallTrace";
import { drawingReferenceBounds } from "./drawingReference";
import { Suspense, useEffect, useLayoutEffect, useMemo, useRef, type RefObject } from "react";
import {
  Canvas,
  useFrame,
  useThree,
  type ThreeEvent,
} from "@react-three/fiber";
import {
  Edges,
  Grid,
  Html,
  Line,
  OrbitControls,
  TransformControls,
} from "@react-three/drei";
import * as THREE from "three";
import { bounds, type Finding } from "./engine";
import { fitPerspectiveBounds, workshopViewOffset, WORKSHOP_MAX_POLAR_ANGLE, type PerspectiveBounds } from "./cameraFit";
import { motionViewport, unionBounds } from "./motionCamera";
import { isWaterFitting, waterFittingProducts } from "./waterFittingReference";
import { waterStop } from "./waterStopReference";
import { sinkTrap } from "./sinkDrainReference";
import { isWaterSupport, waterSupportProducts, waterSupportReference, type WaterSupportId } from "./waterSupportReference";
import { pexPipes } from "./wallWaterReference";
import { isPexPipe } from "./wallWaterReference";
import { DryerDuctMarkers } from "./DryerDuctMarkers";
import { reviewDryerDuctLayout } from "./dryerDuctLayout";
import type { DryerDuctLayout } from "./dryerExhaustSchema";
import { clipBox, triangulateSolid } from "./cutProfiles";
import { pieceThroughOpenings, throughOpeningTriangles } from "./throughOpenings";
import { alignNearbyFaces, surfacePlacement } from "./editing";
import { createWoodGroupSlide, createWoodSlide, placeWood, woodSlideStopLabel } from "./placement";
import { movingSectionIds, snapSectionOrigin } from "./sections";
import { liftDistanceInches } from "./editorMotion";
import { composeRotation } from "./spatial";
import type { SaunaHeaterReview } from "./saunaHeaters";
import { SaunaVentilationMarkers } from "./SaunaVentilationMarkers";
import type { SaunaVentilationReview } from "./saunaVentilation";
import { cedarbrookLining } from "./saunaLiningReference";
import type { SunliteProfileRun } from "./sunliteTakeoff";
import type { TrimSeamMarker } from "./trimSeamGeometry";
import type { OpeningFlashingPreview } from "./openingFlashing";
import { OpeningFlashingMarkers } from "./OpeningFlashingMarkers";
import { DrawerSlideMountMarkers } from "./DrawerSlideMountMarkers";
import { GreenhouseLatchMarkers } from "./GreenhouseLatchMarkers";
import { RodSupportMarkers } from "./RodSupportMarkers";
import { GreenhouseFoundationMarker } from "./GreenhouseFoundationMarker";
import type { reviewGreenhouseFoundation } from "./greenhouseFoundation";
import { SiteClearanceMarkers } from "./SiteClearanceMarkers";
import { PlumbingVentMarkers } from "./PlumbingVentMarkers";
import { ventLayoutBounds } from "./plumbingVentLayout";
import type { PlumbingVentLayout } from "./plumbingVentSchema";
import { CheckAreaMarkers } from "./CheckAreaMarkers";
import { AttachmentMarkers } from "./AttachmentMarkers";
import { RestraintMarkers } from "./RestraintMarkers";
import { DriverAccessMarker } from "./DriverAccessMarker";
import type { DriverAccessLocation } from "./fastenerAccess";
import { FastenerMarkers, type FastenerLayoutMarkerPreview } from "./FastenerMarkers";
import { HingeMarkers } from "./HingeMarkers";
import { ConnectorMarkers } from "./ConnectorMarkers";
import type { ConnectorReview } from "./connectors";
import { FittedStockGeometry, StockGhost } from "./FittedStockGeometry";
import type { FittedFaceRef, FittedStockPreview } from "./fittedStock";
import { visibleStagePieces, visibleStockPieces } from "./sceneVisibility";
import type { MotionPreview } from "./mechanismMotion";
import { lidAxisSegment, reviewLidTravel, type LidPreview } from "./lidMotion";
import { formatMeasurement, measureBetween } from "./measurement";
import {
  material,
  type Piece,
  type Project,
  type Section,
  type V3,
} from "./model";
export type SceneProps = {
  project: Project;
  selected: string | null;
  /** Virtual loose stock is optional display data, always retained in Project. */
  showOffcuts?: boolean;
  shownSiteClearanceId?: string | null;
  shownFoundation?: ReturnType<typeof reviewGreenhouseFoundation>;
  shownTrimSeam?: TrimSeamMarker;
  shownSubfloor?: SubfloorReview["layout"];
  shownSubfloorAdhesive?: SubfloorAdhesiveReview;
  shownSubfloorFasteners?: SubfloorFasteningReview;
  shownSubfloorJoists?: SubfloorJoistReview;
  shownPlateSeal?: { top?: boolean; start: V3; outdated: boolean; runs: { points: [V3, V3]; problem: string }[] };
  shownSillGasket?: { points: V3[]; needsReview: boolean };
  shownRimSeal?: ReadonlyArray<{ id: string; outline: V3[] }>;
  shownRoofValley?: [V3, V3];
  shownRoofVent?: { center: V3; flange: V3[]; layout: V3[] };
  shownOpeningFlashing?: OpeningFlashingPreview;
  shownPlumbingVentLayout?: PlumbingVentLayout;
  shownDryerDuctLayout?: DryerDuctLayout;
  shownCheckArea?: Finding["area"];
  shownLatchId?: string | null;
  shownDrawerMountId?: string | null;
  shownRodSupportId?: string | null;
  shownProfileRun?: SunliteProfileRun;
  shownBandingEdge?: { points: [V3, V3]; label: string } | null;
  shownSaunaHeater?: SaunaHeaterReview | null;
  shownSaunaVentilation?: SaunaVentilationReview | null;
  /** Transient read-only pose; never changes the saved project. */
  lidPreview?: LidPreview | null;
  motionPreview?: MotionPreview | null;
  motionBounds?: PerspectiveBounds | null;
  focusedMotion?: boolean;
  readOnly?: boolean;
  onSelect: (id: string) => void;
  onMove: (id: string, position: V3, rotation: V3) => void;
  selectedSectionId: string | null;
  onSectionMove: (id: string, origin: V3, deltaRotation: V3, previewed?: boolean) => void;
  mode: "select" | "move" | "lift" | "rotate" | "screw" | "measure" | "fastener" | "fit-face" | "trace-wall";
  interferenceIds?: readonly string[];
  onPickFastenerEntrance?: (pieceId: string, localPoint: V3, localInward: V3) => void;
  onPickFittedFace?: (pieceId: string, localPoint: V3, localOutward: V3) => void;
  fittedStockPreview?: FittedStockPreview | null;
  fittedStockFaces?: { first: FittedFaceRef | null; second: FittedFaceRef | null };
  baseRailPreview?: Piece | null;
  guidePartFocus?: { pieceId: string; label: string; isolated: boolean };
  measurement?: { a: V3 | null; b: V3 | null };
  onMeasurePoint?: (point: V3) => void;
  wallTrace?: { a: WallTracePoint | null; b: WallTracePoint | null; outline?: WallTracePoint[]; footprints: V3[][]; blocked: boolean };
  outlineReferenceLines?: Project["planLines"];
  onWallTracePoint?: (point: V3) => void;
  snap: boolean;
  explode: boolean;
  xray: boolean;
  stage: number | null;
  view: { preset: string; nonce: number };
  /** Opt in for a complete padded framing in compact read-only previews. */
  fitToView?: boolean;
  animateView?: boolean;
  showAttachments?: boolean;
  showRestraints?: boolean;
  showFasteners?: boolean;
  driverAccessPreview?: DriverAccessLocation | null;
  fastenerLayoutPreview?: FastenerLayoutMarkerPreview | null;
  showHinges?: boolean;
  showConnectors?: boolean;
  selectedConnectorPlanId?: string | null;
  connectorPreview?: ConnectorReview | null;
  focusedConnectorEntryId?: string | null;
  selectedFastenerPlanId?: string | null;
  focusedFastenerLocationId?: string | null;
  selectedAttachmentPlanId?: string | null;
  onSelectAttachmentPlan?: (id: string | null) => void;
  onSelectAttachmentPart?: (id: string) => void;
  onCamera: (camera: THREE.Camera, getTarget: () => THREE.Vector3) => void;
  materialDropMarker?: RefObject<((point: V3 | null) => void) | null>;
};
function woodTexture() {
  const canvas = document.createElement("canvas");
  canvas.width = 128;
  canvas.height = 512;
  const ctx = canvas.getContext("2d")!;
  ctx.fillStyle = "#dfc49b";
  ctx.fillRect(0, 0, 128, 512);
  let seed = 123;
  const random = () => {
    seed = (seed * 16807) % 2147483647;
    return seed / 2147483647;
  };
  for (let i = 0; i < 90; i++) {
    ctx.strokeStyle = `rgba(92,61,27,${random() * 0.12})`;
    ctx.lineWidth = random() * 2;
    ctx.beginPath();
    const x = random() * 128;
    ctx.moveTo(x, 0);
    ctx.bezierCurveTo(
      x + random() * 10,
      128,
      x - random() * 10,
      380,
      x + random() * 4,
      512,
    );
    ctx.stroke();
  }
  const tex = new THREE.CanvasTexture(canvas);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  return tex;
}
function wireTexture(size: V3) {
  const canvas = document.createElement("canvas");
  canvas.width = canvas.height = 64;
  const ctx = canvas.getContext("2d")!;
  ctx.clearRect(0, 0, 64, 64);
  ctx.strokeStyle = "#fff";
  ctx.lineWidth = 1;
  for (let n = 0; n <= 64; n += 8) {
    ctx.beginPath();
    ctx.moveTo(n, 0);
    ctx.lineTo(n, 64);
    ctx.moveTo(0, n);
    ctx.lineTo(64, n);
    ctx.stroke();
  }
  const texture = new THREE.CanvasTexture(canvas);
  texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
  const thin = size.indexOf(Math.min(...size));
  const axes = thin === 0 ? [2, 1] : thin === 1 ? [0, 2] : [0, 1];
  texture.repeat.set(size[axes[0]] / 4, size[axes[1]] / 4);
  return texture;
}
function WaterSupportMesh({ size, color, id, fitted }: { size: V3; color: string; id: WaterSupportId; fitted: boolean }) {
  const hole = pexPipes[waterSupportProducts[id].pipe].outside / 24;
  const flange = fitted ? size[0] : size[0] / 16;
  const depth = waterSupportReference.depth / 12;
  const outline = useMemo(() => {
    const outer = new THREE.Shape();
    outer.absellipse(0, 0, size[2] / 2, size[1] / 2, 0, Math.PI * 2, false, 0);
    const bore = new THREE.Path();
    bore.absarc(0, 0, hole, 0, Math.PI * 2, true);
    outer.holes.push(bore);
    return outer;
  }, [hole, size[1], size[2]]);
  const start = -size[0] / 2;
  const sleeve = Math.max(0, depth - flange);
  return <>
    <mesh position={[start, 0, 0]} rotation={[0, Math.PI / 2, 0]} castShadow receiveShadow>
      <extrudeGeometry args={[outline, { depth: flange, bevelEnabled: false, curveSegments: 16 }]} />
      <meshStandardMaterial color={color} roughness={0.62} />
    </mesh>
    {sleeve > 0 && <mesh position={[start + flange + sleeve / 2, 0, 0]} rotation={[0, 0, -Math.PI / 2]} castShadow>
      <cylinderGeometry args={[waterSupportReference.bore / 24, waterSupportReference.bore / 24, sleeve, 24, 1, true]} />
      <meshStandardMaterial color={color} roughness={0.62} side={THREE.DoubleSide} />
    </mesh>}
  </>;
}

function SinkTrapMesh({ size, color, outletDrop }: { size: V3; color: string; outletDrop: number }) {
  const [length, height, width] = size;
  const radius = sinkTrap.diameter / 24;
  const path = useMemo(() => {
    const lip = height / 2 - Math.max(0, radius - outletDrop / 12);
    const outlet = lip - outletDrop / 12;
    const low = -height / 2 + radius;
    const inletX = (width - length) / 2;
    const outletX = length / 2;
    const curve = new THREE.CurvePath<THREE.Vector3>();
    const v = (x: number, y: number) => new THREE.Vector3(x, y, 0);
    const middle = (inletX + outletX) / 2;
    curve.add(new THREE.LineCurve3(v(inletX, lip), v(inletX, low + 0.4 * radius)));
    curve.add(new THREE.CubicBezierCurve3(v(inletX, low + 0.4 * radius), v(inletX + radius * 0.15, low),
      v(middle - radius * 0.4, low), v(middle, low)));
    curve.add(new THREE.CubicBezierCurve3(v(middle, low), v(outletX - radius, low),
      v(outletX - radius, outlet), v(outletX, outlet)));
    return curve;
  }, [height, length, width, outletDrop, radius]);
  return <mesh castShadow receiveShadow>
    <tubeGeometry args={[path, 32, radius, 12, false]} />
    <meshStandardMaterial color={color} roughness={0.55} />
  </mesh>;
}

function WaterStopMesh({ size, color }: { size: V3; color: string }) {
  const [length, height, width] = size;
  const center = (width - height) / 2;
  const radius = width / 2;
  return <>
    <mesh position={[-length * 0.08, center, 0]} rotation={[0, 0, Math.PI / 2]} castShadow>
      <cylinderGeometry args={[radius, radius * 0.9, length * 0.84, 12]} />
      <meshStandardMaterial color={color} metalness={0.5} roughness={0.38} />
    </mesh>
    <mesh position={[length * 0.21, center + height * 0.28, 0]} castShadow>
      <cylinderGeometry args={[radius * 0.62, radius * 0.73, height * 0.75, 8]} />
      <meshStandardMaterial color={color} metalness={0.45} roughness={0.4} />
    </mesh>
    <mesh position={[length * 0.42, center, 0]} rotation={[0, 0, Math.PI / 2]} castShadow>
      <cylinderGeometry args={[radius * 0.9, radius, length * 0.16, 16]} />
      <meshStandardMaterial color="#7f8d92" metalness={0.32} roughness={0.44} />
    </mesh>
  </>;
}

function WaterFittingMesh({ size, color, kind }: { size: V3; color: string; kind: "coupling" | "elbow" | "tee" }) {
  const [x, y, diameter] = size;
  const radius = diameter / 2;
  const socket = (axis: "x" | "y", length: number, position: V3, end: -1 | 1) => {
    const collar = Math.min(length / 3, diameter / 4);
    return <group position={position} rotation={axis === "x" ? [0, 0, -Math.PI / 2] : [0, 0, 0]}>
      <mesh castShadow receiveShadow>
        <cylinderGeometry args={[radius * 0.82, radius * 0.82, length, 20, 1, true]} />
        <meshStandardMaterial color={color} metalness={0.55} roughness={0.35} side={THREE.DoubleSide} />
      </mesh>
      <mesh position={[0, end * (length - collar) / 2, 0]} castShadow>
        <cylinderGeometry args={[radius, radius, collar, 20, 1, true]} />
        <meshStandardMaterial color="#aeb5b2" metalness={0.6} roughness={0.34} side={THREE.DoubleSide} />
      </mesh>
    </group>;
  };
  if (kind !== "elbow") {
    const tee = kind === "tee", inlineY = tee ? radius - y / 2 : 0;
    return <>
      {socket("x", x / 2, [-x / 4, inlineY, 0], -1)}
      {socket("x", x / 2, [x / 4, inlineY, 0], 1)}
      {tee && socket("y", y - radius, [0, radius / 2, 0], 1)}
    </>;
  }
  const corner: V3 = [radius - x / 2, radius - y / 2, 0];
  return <>
    <mesh position={corner} castShadow>
      <sphereGeometry args={[radius * 0.82, 18, 12]} />
      <meshStandardMaterial color={color} metalness={0.55} roughness={0.35} />
    </mesh>
    {socket("x", x - radius, [radius / 2, corner[1], 0], 1)}
    {socket("y", y - radius, [corner[0], radius / 2, 0], 1)}
  </>;
}

function PedestalBenchMesh({ size, color, texture }: {
  size: V3;
  color: string;
  texture: THREE.Texture;
}) {
  const [width, height, depth] = size;
  const slat = depth / 8;
  const top = height * 0.16;
  const leg = height * 0.12;
  // The drawing suggests the prebuilt top and pedestal. Sizing, measurement
  // and collision use the verified rectangular envelope.
  const boxes: { size: V3; at: V3; key: string }[] = [
    ...Array.from({ length: 8 }, (_, i) => ({
      size: [width, top, slat * 0.89] as V3,
      at: [0, (height - top) / 2, (i - 3.5) * slat] as V3,
      key: `slat-${i}`,
    })),
    ...[-1, 1].flatMap((side) => [
      { size: [width, top, slat * 0.34] as V3, at: [0, height / 2 - top * 1.4, side * (depth - slat * 0.34) / 2] as V3, key: `rail-${side}` },
      { size: [leg, height - top, leg * 1.1] as V3, at: [side * width * 0.36, -top / 2, 0] as V3, key: `leg-${side}` },
      { size: [leg * 1.2, leg * 0.6, depth] as V3, at: [side * width * 0.36, -height / 2 + leg * 0.3, 0] as V3, key: `foot-${side}` },
    ]),
    { size: [width * 0.72, leg * 0.65, leg * 0.7], at: [0, -height * 0.23, 0], key: "brace" },
  ];
  return (
    <group>
      {boxes.map((box) => (
        <mesh key={box.key} position={box.at} castShadow receiveShadow>
          <boxGeometry args={box.size} />
          <meshStandardMaterial color={color} map={texture} roughness={0.9} />
        </mesh>
      ))}
    </group>
  );
}
function PartMesh({
  piece,
  selected,
  onSelect,
  xray,
  explode,
  stepIndex,
  texture,
  onPointerDown,
  measuring = false,
  onMeasurePoint,
  fastenerPicking = false,
  onPickFastenerEntrance,
  fittedFacePicking = false,
  onPickFittedFace,
  readOnly = false,
  interference = false,
  clearanceReview = false,
  sinkOutletDrop,
}: {
  piece: Piece;
  sinkOutletDrop?: number;
  selected: boolean;
  onSelect: (id: string) => void;
  xray: boolean;
  explode: boolean;
  stepIndex: number;
  texture: THREE.Texture;
  onPointerDown?: (event: ThreeEvent<PointerEvent>) => void;
  measuring?: boolean;
  onMeasurePoint?: (point: V3) => void;
  fastenerPicking?: boolean;
  onPickFastenerEntrance?: SceneProps["onPickFastenerEntrance"];
  fittedFacePicking?: boolean;
  onPickFittedFace?: SceneProps["onPickFittedFace"];
  readOnly?: boolean;
  interference?: boolean;
  clearanceReview?: boolean;
}) {
  const mesh = useRef<THREE.Group>(null);
  const invalidate = useThree((s) => s.invalidate);
  const unitScale = useMemo(() => new THREE.Vector3(1, 1, 1), []);
  const wire = useMemo(
    () => (piece.material === "mesh" ? wireTexture(piece.size) : null),
    [piece.material, ...piece.size],
  );
  useEffect(() => () => wire?.dispose(), [wire]);
  const profile = useMemo(() => {
    const openings = pieceThroughOpenings(piece);
    if (!piece.cutPlanes?.length && !openings.length) return null;
    const through = openings.length
      ? throughOpeningTriangles(piece.size, openings)
      : null;
    const triangles = through ?? triangulateSolid(clipBox(piece.size, piece.cutPlanes));
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute(
      "position",
      new THREE.Float32BufferAttribute(
        triangles.positions.map((v) => v / 12),
        3,
      ),
    );
    geometry.setAttribute(
      "normal",
      new THREE.Float32BufferAttribute(triangles.normals, 3),
    );
    const uv: number[] = [];
    for (let i = 0; i < triangles.positions.length; i += 3) {
      const normalMagnitude = triangles.normals.slice(i, i + 3).map(Math.abs);
      const dominant = normalMagnitude.indexOf(Math.max(...normalMagnitude));
      const u = (dominant + 1) % 3,
        v = (dominant + 2) % 3;
      uv.push(
        triangles.positions[i + u] / piece.size[u] + 0.5,
        triangles.positions[i + v] / piece.size[v] + 0.5,
      );
    }
    geometry.setAttribute("uv", new THREE.Float32BufferAttribute(uv, 2));
    geometry.computeBoundingBox();
    geometry.computeBoundingSphere();
    const outline = through ? new THREE.BufferGeometry().setAttribute(
      "position", new THREE.Float32BufferAttribute(through.outline.map((v) => v / 12), 3),
    ) : null;
    return { geometry, outline };
  }, [piece.cutPlanes, piece.roundOpenings, piece.rectangularOpenings, ...piece.size]);
  useEffect(() => () => {
    profile?.geometry.dispose();
    profile?.outline?.dispose();
  }, [profile]);
  const m = material(piece.material);
  const wood = m.wood;
  const seeThrough = xray && (
    ["siding", "roof", cedarbrookLining.materialId].includes(piece.material) ||
    m.shape === "door-leaf-envelope" || m.orderRollWidth !== undefined
  );
  useEffect(() => {
    mesh.current?.scale.setScalar(0.9);
  }, [...piece.size]);
  const target = explode ? stepIndex * 0.65 : 0;
  useFrame((_, delta) => {
    if (mesh.current) {
      mesh.current.position.y = THREE.MathUtils.damp(
        mesh.current.position.y,
        target,
        7,
        delta,
      );
      mesh.current.scale.lerp(unitScale, Math.min(1, delta * 12));
      if (Math.abs(mesh.current.position.y - target) <= 0.001)
        mesh.current.position.y = target;
      if (mesh.current.scale.distanceToSquared(unitScale) <= 0.000001)
        mesh.current.scale.copy(unitScale);
      if (
        Math.abs(mesh.current.position.y - target) > 0.001 ||
        mesh.current.scale.distanceToSquared(unitScale) > 0.000001
      )
        invalidate();
    }
  });
  const color = interference ? "#d64e39" : clearanceReview ? "#d29528"
    : selected ? "#f2a16b" : piece.offcut ? "#b5ada0" : m.color;
  const size = piece.size.map((v) => v / 12) as V3;
  const metal = (
    <meshStandardMaterial color={color} metalness={0.65} roughness={0.45} />
  );
  const radius =
    (m.headDiameter ? m.headDiameter / 12 : Math.min(size[0], size[2])) / 2;
  const shankRadius = m.shankDiameter ? m.shankDiameter / 24 : radius * 0.42;
  const headHeight = Math.min(size[1] * 0.05, 0.008);
  const leg = Math.min(size[0], size[1], size[2]) * 0.07;
  return (
    <group ref={mesh} scale={[0.92, 0.92, 0.92]}>
      <group
        onPointerDown={readOnly || measuring || fastenerPicking || fittedFacePicking ? undefined : onPointerDown}
        onClick={(e: ThreeEvent<MouseEvent>) => {
          if (readOnly) return;
          e.stopPropagation();
          if (fittedFacePicking) {
            if (e.button === 0 && e.delta <= 4 && e.face) {
              const local = e.object.worldToLocal(e.point.clone()).multiplyScalar(12);
              onPickFittedFace?.(piece.id, local.toArray() as V3, e.face.normal.clone().normalize().toArray() as V3);
            }
            return;
          }
          if (fastenerPicking) {
            if (e.button === 0 && e.delta <= 4 && e.face) {
              const local = e.object.worldToLocal(e.point.clone()).multiplyScalar(12);
              onPickFastenerEntrance?.(piece.id, local.toArray() as V3, e.face.normal.clone().negate().normalize().toArray() as V3);
            }
            return;
          }
          if (measuring) {
            if (e.button === 0 && e.delta <= 4)
              onMeasurePoint?.(e.point.toArray().map((v) => v * 12) as V3);
            return;
          }
          onSelect(piece.id);
        }}
        onPointerOver={(e) => {
          if (readOnly) return;
          e.stopPropagation();
          document.body.style.cursor = measuring || fastenerPicking || fittedFacePicking ? "crosshair" : "grab";
        }}
        onPointerOut={() => (document.body.style.cursor = "auto")}
      >
        {m.shape === "pedestal-bench-envelope" && !measuring && !fastenerPicking && !fittedFacePicking ? (
          <PedestalBenchMesh size={size} color={color} texture={texture} />
        ) : isWaterFitting(m.id) && !measuring && !fastenerPicking && !fittedFacePicking ? (
          <WaterFittingMesh size={size} color={color} kind={waterFittingProducts[m.id].kind} />
        ) : m.id === sinkTrap.id && !measuring && !fastenerPicking && !fittedFacePicking ? (
          <SinkTrapMesh size={size} color={color} outletDrop={sinkOutletDrop ?? 0.5} />
        ) : m.id === waterStop.id && !measuring && !fastenerPicking && !fittedFacePicking ? (
          <WaterStopMesh size={size} color={color} />
        ) : isWaterSupport(m.id) && !measuring && !fastenerPicking && !fittedFacePicking ? (
          <WaterSupportMesh size={size} color={color} id={m.id} fitted={piece.designRole === "water-stud-isolator"} />
        ) : m.shape === "tube-envelope" ? (
          <mesh castShadow receiveShadow>
            <cylinderGeometry
              args={[size[0] / 2, size[2] / 2, size[1], 24, 1, true]}
            />
            <meshStandardMaterial
              color={color}
              side={THREE.DoubleSide}
              metalness={isPexPipe(m.id) ? 0 : 0.6}
              roughness={isPexPipe(m.id) ? 0.58 : 0.35}
              transparent={xray || piece.offcut}
              opacity={piece.offcut ? 0.45 : 1}
            />
            <Edges color={selected ? "#f28146" : "#646b67"} />
          </mesh>
        ) : m.stockKind === "fastener" ? (
          <group>
            <mesh castShadow receiveShadow>
              <cylinderGeometry
                args={[
                  shankRadius,
                  shankRadius * 0.4,
                  size[1] - headHeight,
                  10,
                ]}
              />
              {metal}
            </mesh>
            <mesh position={[0, (size[1] - headHeight) / 2, 0]} castShadow>
              <cylinderGeometry args={[radius, radius, headHeight, 14]} />
              {metal}
            </mesh>
            {piece.material !== "nail" &&
              m.fastenerType !== "nail" &&
              Array.from({ length: 6 }, (_, i) => (
                <mesh
                  key={i}
                  position={[0, -size[1] * 0.3 + (i * size[1]) / 10, 0]}
                  rotation={[Math.PI / 2, 0, 0]}
                >
                  <torusGeometry args={[radius * 0.45, radius * 0.12, 4, 10]} />
                  {metal}
                </mesh>
              ))}
          </group>
        ) : m.stockKind === "connector" ? (
          <group>
            <mesh
              position={[0, -size[1] / 2 + leg / 2, 0]}
              castShadow
              receiveShadow
            >
              <boxGeometry args={[size[0], leg, size[2]]} />
              {metal}
              <Edges
                color={selected ? "#f28146" : "#3c392b"}
                transparent
                opacity={0.3}
              />
            </mesh>
            <mesh
              position={[-size[0] / 2 + leg / 2, 0, 0]}
              castShadow
              receiveShadow
            >
              <boxGeometry args={[leg, size[1], size[2]]} />
              {metal}
              <Edges
                color={selected ? "#f28146" : "#3c392b"}
                transparent
                opacity={0.3}
              />
            </mesh>
          </group>
        ) : (
          <mesh
            castShadow
            receiveShadow
            geometry={profile?.geometry}
          >
            {!profile && <boxGeometry args={size} />}
            <meshStandardMaterial
              color={color}
              map={wire ?? (wood || m.stockKind === "equipment" ? texture : null)}
              alphaTest={wire ? 0.15 : 0}
              roughness={piece.material === "roof" ? 0.6 : 0.9}
              metalness={piece.material === "roof" ? 0.4 : 0}
              transparent={
                xray ||
                piece.offcut ||
                piece.material === "mesh" ||
                m.shape === "glazing-envelope"
              }
              opacity={
                piece.offcut
                  ? 0.45
                  : seeThrough
                    ? 0.16
                    : m.shape === "glazing-envelope"
                      ? 0.38
                      : piece.material === "mesh"
                        ? 0.85
                        : 1
              }
            />
            {profile?.outline ? (
              <lineSegments geometry={profile.outline} raycast={() => null}>
                <lineBasicMaterial color={selected ? "#f28146" : "#3c392b"} opacity={selected ? 0.9 : 0.35} transparent />
              </lineSegments>
            ) : (
              <Edges
                threshold={25}
                color={selected ? "#f28146" : m.orderRollWidth ? "#4f6e7e" : "#3c392b"}
                opacity={selected ? 0.9 : m.orderRollWidth ? 0.5 : 0.14}
                transparent
              />
            )}
          </mesh>
        )}
      </group>
    </group>
  );
}

function setContactMarker(marker: HTMLSpanElement | null, message: string) {
  // Updating the marker without rerendering keeps TransformControls attached during the gesture.
  if (!marker || marker.textContent === message) return;
  marker.textContent = message;
  marker.hidden = !message;
}

function PlacedPart({
  p,
  props,
  texture,
}: {
  p: Piece;
  props: SceneProps;
  texture: THREE.Texture;
}) {
  const ref = useRef<THREE.Group>(null!);
  const { gl, camera, controls, invalidate } = useThree();
  const gestureCleanup = useRef<(() => void) | null>(null);
  const gizmoSlide = useRef<ReturnType<typeof createWoodSlide>>(null);
  const placementContact = useRef<HTMLSpanElement>(null);
  function showPlacementContact(message: string) {
    setContactMarker(placementContact.current, message);
  }
  useEffect(() => () => gestureCleanup.current?.(), []);
  useEffect(() => {
    gizmoSlide.current = null;
    showPlacementContact("");
  }, [props.mode]);
  const beginDrag = (event: ThreeEvent<PointerEvent>) => {
    if (
      event.button !== 0 ||
      props.readOnly ||
      (props.mode !== "select" && props.mode !== "lift") ||
      props.stage !== null ||
      props.explode
    )
      return;
    // Precision tools own their pointer stream; a mesh drag must never
    // overwrite a gizmo transform when both overlap on screen.
    event.stopPropagation();
    props.onSelect(p.id);
    gestureCleanup.current?.();
    const startX = event.clientX,
      startY = event.clientY;
    const startPosition = [...p.position] as V3,
      startRotation = [...p.rotation] as V3;
    const lift = props.mode === "lift" || event.altKey;
    const rotate = event.shiftKey && !lift;
    const slide = rotate ? null : createWoodSlide(props.project, p);
    const liftCameraDistance = camera.position.distanceTo(event.point);
    const liftViewportHeight = gl.domElement.getBoundingClientRect().height;
    const plane = new THREE.Plane(
      new THREE.Vector3(0, 1, 0),
      -p.position[1] / 12,
    );
    const ray = new THREE.Raycaster();
    const pointAt = (x: number, y: number, height = p.position[1] / 12) => {
      const rect = gl.domElement.getBoundingClientRect();
      ray.setFromCamera(
        new THREE.Vector2(
          ((x - rect.left) / rect.width) * 2 - 1,
          -((y - rect.top) / rect.height) * 2 + 1,
        ),
        camera,
      );
      plane.constant = -height;
      return ray.ray.intersectPlane(plane, new THREE.Vector3());
    };
    const grabOffset = event.point
      .toArray()
      .map((v, i) => v * 12 - startPosition[i]) as V3;
    const bottom = bounds({ ...p, position: [0, 0, 0] }).min[1];
    const orbit = controls as unknown as
      | { enabled: boolean; dispatchEvent?: (event: { type: string }) => void }
      | undefined;
    const previousEnabled = orbit?.enabled;
    if (orbit) {
      orbit.enabled = false;
      orbit.dispatchEvent?.({ type: "start" });
    }
    let changed = false;
    let position = [...startPosition] as V3,
      rotation = [...startRotation] as V3;
    const preview = () => {
      if (!ref.current) return;
      ref.current.position.set(...(position.map((v) => v / 12) as V3));
      ref.current.rotation.set(...rotation);
      invalidate();
    };
    const move = (e: PointerEvent) => {
      if (e.pointerId !== event.pointerId) return;
      if (Math.hypot(e.clientX - startX, e.clientY - startY) < 4 && !changed)
        return;
      changed = true;
      try {
        if (lift) {
          const delta = liftDistanceInches(
            e.clientY - startY,
            liftCameraDistance,
            liftViewportHeight,
            (camera as THREE.PerspectiveCamera).fov ?? 38,
          );
          position = [
            startPosition[0],
            startPosition[1] + (props.snap ? Math.round(delta) : delta),
            startPosition[2],
          ];
        } else if (rotate) {
          let angle = (e.clientX - startX) * 0.012;
          if (props.snap)
            angle = Math.round(angle / (Math.PI / 12)) * (Math.PI / 12);
          rotation = composeRotation([0, angle, 0], startRotation);
        } else {
          // Pick the supporting face first, then preserve the actual grabbed point
          // at the new height so a board does not jump when the gesture starts.
          pointAt(e.clientX, e.clientY);
          const surface = surfacePlacement(
            props.project,
            ray.ray.origin.toArray().map((v) => v * 12) as V3,
            ray.ray.direction.toArray() as V3,
            p.id,
          );
          if (!surface) return;
          const centerY = Math.max(startPosition[1], surface[1] - bottom);
          const point = pointAt(
            e.clientX,
            e.clientY,
            (centerY + grabOffset[1]) / 12,
          );
          if (!point) return;
          position = [
            point.x * 12 - grabOffset[0],
            centerY,
            point.z * 12 - grabOffset[2],
          ];
          if (props.snap) {
            position = [
              Math.round(position[0]),
              position[1],
              Math.round(position[2]),
            ];
            position = alignNearbyFaces(props.project, p, position, rotation);
          }
        }
        if (slide) {
          // A surface drag can raise the piece before it moves across a supporting face.
          const raised = slide([startPosition[0], position[1], startPosition[2]]);
          const placed = lift
            ? raised
            : slide(
                [position[0], raised.position[1], position[2]],
                raised.position,
              );
          position = placed.position;
          showPlacementContact(
            woodSlideStopLabel(props.project, placed.stop ?? raised.stop),
          );
        } else {
          const clear = placeWood(
            props.project,
            p,
            position,
            rotation,
            lift ? 1 : undefined,
          );
          position = clear.blocked ? startPosition : clear.position;
          if (clear.blocked) rotation = startRotation;
          showPlacementContact(clear.blocked ? "Choose a clear position" : "");
        }
      } catch {
        position = startPosition;
        rotation = startRotation;
        showPlacementContact("Review the overlapping parts");
      }
      preview();
    };
    const cleanup = () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", finish);
      window.removeEventListener("pointercancel", cancel);
      window.removeEventListener("keydown", keydown);
      if (orbit && previousEnabled !== undefined)
        orbit.enabled = previousEnabled;
      document.body.style.cursor = "auto";
      gestureCleanup.current = null;
      showPlacementContact("");
    };
    const cancel = () => {
      position = startPosition;
      rotation = startRotation;
      preview();
      cleanup();
    };
    const finish = (e: PointerEvent) => {
      if (e.pointerId !== event.pointerId) return;
      cleanup();
      if (changed) props.onMove(p.id, position, rotation);
    };
    const keydown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        cancel();
      }
    };
    gestureCleanup.current = cancel;
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", finish);
    window.addEventListener("pointercancel", cancel);
    window.addEventListener("keydown", keydown);
    document.body.style.cursor = rotate ? "ew-resize" : "grabbing";
  };
  const selected = props.selected === p.id;
  const transform =
    selected && !props.readOnly && (props.mode === "move" || props.mode === "rotate");
  const mesh = (
    <group
      ref={ref}
      position={p.position.map((v) => v / 12) as V3}
      rotation={p.rotation}
    >
      <PartMesh
        piece={p}
        sinkOutletDrop={p.material === sinkTrap.id ? props.project.sinkDrains?.find(({ bodyId }) => bodyId === p.id)?.outletDrop : undefined}
        selected={selected}
        onSelect={props.onSelect}
        xray={props.xray}
        explode={props.mode !== "measure" && props.mode !== "fastener" && props.mode !== "fit-face" && props.explode && !selected}
        stepIndex={props.project.steps.findIndex((s) => s.id === p.stepId)}
        texture={texture}
        onPointerDown={beginDrag}
        measuring={props.mode === "measure"}
        onMeasurePoint={props.onMeasurePoint}
        fastenerPicking={props.mode === "fastener"}
        onPickFastenerEntrance={props.onPickFastenerEntrance}
        fittedFacePicking={props.mode === "fit-face"}
        onPickFittedFace={props.onPickFittedFace}
        readOnly={props.readOnly || props.mode === "trace-wall"}
        clearanceReview={props.lidPreview?.stayArmReviewIds?.includes(p.id)}
        interference={props.lidPreview?.interferenceIds?.includes(p.id) ||
          props.lidPreview?.stayArmHitIds?.includes(p.id) ||
          (props.lidPreview?.piece.id === p.id && !!(props.lidPreview.siteFaceHits?.length || props.lidPreview.interferenceIds?.length)) ||
          props.interferenceIds?.includes(p.id)}
      />
      {selected && !props.readOnly && (
        <Html center position={[0, 0, 0]} style={{ pointerEvents: "none" }}>
          <span ref={placementContact} className="placement-contact" role="status" hidden />
        </Html>
      )}
    </group>
  );
  if (transform)
    return (
      <TransformControls
        object={ref}
        enabled={true}
        mode={props.mode === "rotate" ? "rotate" : "translate"}
        size={0.8}
        translationSnap={props.snap ? 1 / 12 : null}
        rotationSnap={props.snap ? Math.PI / 12 : null}
        onMouseDown={() => {
          gizmoSlide.current = props.mode === "move" ? createWoodSlide(props.project, p) : null;
        }}
        onObjectChange={() => {
          const obj=ref.current;if(!obj)return;
          try {
            const position=obj.position.toArray().map((n)=>n*12) as V3;
            if (gizmoSlide.current) {
              const placed = gizmoSlide.current(position);
              obj.position.set(...(placed.position.map((n) => n / 12) as V3));
              showPlacementContact(woodSlideStopLabel(props.project, placed.stop));
              invalidate();
              return;
            }
            const axes=[0,1,2].filter((i)=>Math.abs(position[i]-p.position[i])>1e-7);
            const clear=placeWood(props.project,p,position,[obj.rotation.x,obj.rotation.y,obj.rotation.z],props.mode==="move"&&axes.length===1?axes[0] as 0|1|2:undefined);
            obj.position.set(...((clear.blocked?p.position:clear.position).map((n)=>n/12) as V3));
            if (clear.blocked) obj.rotation.set(...p.rotation);
            showPlacementContact(clear.blocked ? "Choose a clear position" : "");
            invalidate();
          } catch {
            obj.position.set(...(p.position.map((n)=>n/12) as V3));
            obj.rotation.set(...p.rotation);
            showPlacementContact("Review the overlapping parts");
          }
        }}
        onMouseUp={() => {
          const obj = ref.current;
          gizmoSlide.current = null;
          showPlacementContact("");
          if (obj)
            props.onMove(
              p.id,
              obj.position
                .toArray()
                .map((v) => v * 12) as V3,
              [obj.rotation.x, obj.rotation.y, obj.rotation.z],
            );
        }}
      >
        {mesh}
      </TransformControls>
    );
  return mesh;
}
function SectionGroup({
  section,
  pieces,
  props,
  texture,
}: {
  section: Section;
  pieces: Piece[];
  props: SceneProps;
  texture: THREE.Texture;
}) {
  const group = useRef<THREE.Group>(null!);
  const contact = useRef<HTMLSpanElement>(null);
  const slide = useRef<ReturnType<typeof createWoodGroupSlide>>(null);
  const stopped = useRef(false);
  const translating = props.mode === "move" || props.mode === "lift";
  const invalidate = useThree((state) => state.invalidate);
  const memberBounds = pieces.length ? unionBounds(pieces.map(bounds)) : null;
  const labelPoint = section.origin.map((n, i) =>
    memberBounds
      ? ((memberBounds.min[i] + memberBounds.max[i]) / 2 - n) / 12
      : 0,
  ) as V3;
  const content = (
    <group
      ref={group}
      position={section.origin.map((v) => v / 12) as V3}
      rotation={[0, 0, 0]}
    >
      {pieces.map((p) => (
        <group
          key={p.id}
          position={
            p.position.map((v, i) => (v - section.origin[i]) / 12) as V3
          }
          rotation={p.rotation}
        >
          <PartMesh
            piece={p}
            selected
            onSelect={props.onSelect}
            xray={props.xray}
            explode={false}
            interference={props.interferenceIds?.includes(p.id)}
            stepIndex={0}
            texture={texture}
            measuring={props.mode === "measure"}
            onMeasurePoint={props.onMeasurePoint}
          />
        </group>
      ))}
      {translating && (
        <Html center position={labelPoint} style={{ pointerEvents: "none" }}>
          <span
            ref={contact}
            className="placement-contact"
            role="status"
            hidden
          />
        </Html>
      )}
    </group>
  );
  if (props.mode !== "move" && props.mode !== "rotate" && props.mode !== "lift")
    return content;
  return (
    <TransformControls
      object={group}
      enabled
      mode={props.mode === "rotate" ? "rotate" : "translate"}
      showX={props.mode !== "lift"}
      showZ={props.mode !== "lift"}
      size={0.8}
      translationSnap={props.snap ? 1 / 12 : null}
      rotationSnap={props.snap ? Math.PI / 12 : null}
      onMouseDown={() => {
        stopped.current = false;
        if (!translating) return;
        const ids = new Set(section.pieceIds);
        const members = props.project.pieces.filter((piece) =>
          ids.has(piece.id),
        );
        slide.current = createWoodGroupSlide(
          props.project,
          members,
          section.origin,
        );
      }}
      onObjectChange={() => {
        const obj = group.current;
        if (!obj || !translating || !slide.current) return;
        const target = obj.position.toArray().map((n) => n * 12) as V3;
        if (props.mode === "lift") {
          target[0] = section.origin[0];
          target[2] = section.origin[2];
        }
        const placed = slide.current(target);
        stopped.current = placed.stop !== null;
        obj.position.set(...(placed.position.map((n) => n / 12) as V3));
        setContactMarker(
          contact.current,
          woodSlideStopLabel(props.project, placed.stop),
        );
        invalidate();
      }}
      onMouseUp={() => {
        const obj = group.current;
        const finishSlide = translating ? slide.current : null;
        slide.current = null;
        setContactMarker(contact.current, "");
        if (!obj) return;
        let origin = obj.position.toArray().map((n) => n * 12) as V3;
        if (finishSlide && props.snap && !stopped.current) {
          try {
            const axes = [0, 1, 2].filter(
              (i) => Math.abs(origin[i] - section.origin[i]) > 1e-7,
            );
            const snapped = snapSectionOrigin(
              props.project,
              section.id,
              origin,
              section.rotation,
              0.8,
              axes,
            );
            const placed = finishSlide(snapped);
            if (!placed.stop) origin = placed.position;
          } catch {
            // The commit path validates the preview position if a snap cannot be resolved.
          }
        }
        props.onSectionMove(
          section.id,
          origin,
          [obj.rotation.x, obj.rotation.y, obj.rotation.z],
          !!finishSlide,
        );
      }}
    >
      {content}
    </TransformControls>
  );
}
function JointMarker({ a, b }: { a: Piece; b: Piece }) {
  const invalidate = useThree((s) => s.invalidate);
  const ref = useRef<THREE.Group>(null);
  const elapsed = useRef(0);
  const aa = bounds(a),
    bb = bounds(b);
  const position = [0, 1, 2].map(
    (i) =>
      (Math.max(aa.min[i], bb.min[i]) + Math.min(aa.max[i], bb.max[i])) / 24,
  ) as V3;
  useFrame((_, dt) => {
    elapsed.current = Math.min(1, elapsed.current + dt * 2);
    if (ref.current) {
      ref.current.position.y = (1 - elapsed.current) * 0.35;
      ref.current.rotation.y = elapsed.current * Math.PI * 6;
      if (elapsed.current < 1) invalidate();
    }
  });
  return (
    <group position={position}>
      <group ref={ref}>
        <mesh>
          <cylinderGeometry args={[0.025, 0.025, 0.22, 10]} />
          <meshStandardMaterial
            color="#ce6e39"
            metalness={0.7}
            roughness={0.3}
          />
        </mesh>
        <mesh position={[0, 0.12, 0]}>
          <cylinderGeometry args={[0.08, 0.06, 0.035, 16]} />
          <meshStandardMaterial
            color="#e58a4f"
            metalness={0.5}
            roughness={0.3}
          />
        </mesh>
        <mesh position={[0, 0.14, 0]} rotation={[-Math.PI / 2, 0, 0]}>
          <ringGeometry args={[0.07, 0.105, 20]} />
          <meshBasicMaterial color="#f3a35d" side={THREE.DoubleSide} />
        </mesh>
      </group>
    </group>
  );
}
function CameraRig({
  view,
  project,
  onCamera,
  fitToView = false,
  animateView = !fitToView,
  motionBounds = null,
  siteBounds = null,
  drawingBounds = null,
  framePieces,
  stockFrameKey,
}: {
  view: SceneProps["view"];
  project: Project;
  onCamera: SceneProps["onCamera"];
  fitToView?: boolean;
  animateView?: boolean;
  motionBounds?: PerspectiveBounds | null;
  siteBounds?: PerspectiveBounds | null;
  drawingBounds?: PerspectiveBounds | null;
  framePieces: readonly Piece[];
  stockFrameKey: string;
}) {
  const { camera, gl, invalidate, size } = useThree();
  const controls = useRef<any>(null);
  const destination = useRef(new THREE.Vector3(12, 9, 14));
  const target = useRef(new THREE.Vector3(0, 3, 0));
  const moving = useRef(false);
  const framedBounds = useRef<PerspectiveBounds | null>(null);
  useEffect(() => {
    onCamera(camera, () => controls.current?.target ?? target.current);
  }, [camera, onCamera]);
  useEffect(() => {
    const active = framePieces;
    let min = [-36, 0, -24],
      max = [36, 84, 24];
    const zone = project.workZone;
    if (zone && !active.length) {
      min = [-zone.width / 2, 0, -zone.depth / 2];
      max = [zone.width / 2, zone.height, zone.depth / 2];
    }
    if (active.length) {
      const bs = active.map(bounds);
      min = [0, 1, 2].map((i) => Math.min(...bs.map((b) => b.min[i])));
      max = [0, 1, 2].map((i) => Math.max(...bs.map((b) => b.max[i])));
    }
    const referenceView = view.preset === "drawing" || view.preset === "plan";
    const referenceFrame = drawingBounds && (referenceView || !active.length && !zone);
    if (referenceFrame && !motionBounds && !siteBounds) {
      min = drawingBounds.min;
      max = drawingBounds.max;
    }
    const overlayBounds = motionBounds ?? siteBounds;
    if (overlayBounds) {
      const combined = siteBounds && !active.length && !zone
        ? overlayBounds
        : unionBounds([{ min: min as V3, max: max as V3 }, overlayBounds]);
      min = combined.min;
      max = combined.max;
    }
    const worldBounds = {
      min: min.map((n) => n / 12) as V3,
      max: max.map((n) => n / 12) as V3,
    };
    framedBounds.current = motionBounds ? worldBounds : null;
    const center = new THREE.Vector3(
      ...(min.map((v, i) => (v + max[i]) / 24) as V3),
    );
    const radius = Math.max(6, ...max.map((v, i) => (v - min[i]) / 12));
    target.current = center;
    const offset = new THREE.Vector3(...workshopViewOffset(referenceView ? "top" : view.preset, radius));
    destination.current = center.clone().add(offset);
    if (camera instanceof THREE.PerspectiveCamera) {
      camera.far = 500;
      camera.updateProjectionMatrix();
    }
    if ((fitToView || referenceFrame) && camera instanceof THREE.PerspectiveCamera) {
      const fitted = fitPerspectiveBounds(
        worldBounds,
        {
          verticalFovDegrees: camera.fov,
          aspect: Math.max(1, size.width) / Math.max(1, size.height),
          direction: offset.toArray() as V3,
          padding: referenceFrame ? 1.24 : 1.1,
          minDistance: 2,
          nearClip: camera.near,
          viewportInsets: overlayBounds ? motionViewport(size.width, size.height).insets : undefined,
        },
      );
      destination.current.set(...fitted.position);
      if (referenceFrame && fitted.farDistance * 1.2 > camera.far) {
        camera.far = fitted.farDistance * 1.2;
        camera.updateProjectionMatrix();
      }
      if (animateView) moving.current = true;
      else {
        camera.position.copy(destination.current);
        controls.current?.target.copy(center);
        controls.current?.update();
        moving.current = false;
      }
    } else moving.current = true;
    invalidate();
  }, [
    view.nonce,
    view.preset,
    fitToView,
    animateView,
    fitToView || drawingBounds ? size.width : 0,
    fitToView || drawingBounds ? size.height : 0,
    project.workZone?.width,
    project.workZone?.depth,
    project.workZone?.height,
    motionBounds,
    siteBounds,
    drawingBounds,
    stockFrameKey,
  ]);
  useFrame((_, dt) => {
    if (moving.current && controls.current) {
      camera.position.lerp(destination.current, Math.min(1, dt * 5));
      controls.current.target.lerp(target.current, Math.min(1, dt * 5));
      controls.current.update();
      invalidate();
      if (camera.position.distanceTo(destination.current) < 0.005 && controls.current.target.distanceTo(target.current) < 0.005) {
        camera.position.copy(destination.current);
        controls.current.target.copy(target.current);
        controls.current.update();
        moving.current = false;
      }
    }
    camera.updateMatrixWorld();
    gl.domElement.dataset.workshopCamera = JSON.stringify({
      position: camera.position.toArray(),
      projectionMatrix: camera.projectionMatrix.elements,
      matrixWorldInverse: camera.matrixWorldInverse.elements,
      viewport: { width: size.width, height: size.height },
      settled: !moving.current,
      units: "feet",
    });
    if (motionBounds && framedBounds.current) {
      camera.updateMatrixWorld();
      gl.domElement.dataset.motionCamera = JSON.stringify({
        position: camera.position.toArray(),
        quaternion: camera.quaternion.toArray(),
        projectionMatrix: camera.projectionMatrix.toArray(),
        matrixWorldInverse: camera.matrixWorldInverse.toArray(),
        target: controls.current?.target.toArray() ?? target.current.toArray(),
        settled: !moving.current,
        framingBounds: framedBounds.current,
        safeRect: motionViewport(size.width, size.height).safeRect,
        viewport: { width: size.width, height: size.height },
        units: "feet",
      });
    } else delete gl.domElement.dataset.motionCamera;
  });
  return (
    <OrbitControls
      ref={controls}
      makeDefault
      // A demand-rendered scrub must not resume leftover orbit inertia.
      enableDamping={!motionBounds}
      mouseButtons={{
        LEFT: THREE.MOUSE.ROTATE,
        MIDDLE: THREE.MOUSE.PAN,
        RIGHT: THREE.MOUSE.ROTATE,
      }}
      minDistance={2}
      maxDistance={drawingBounds ? 6000 : 400}
      maxPolarAngle={WORKSHOP_MAX_POLAR_ANGLE}
      target={[0, 3, 0]}
      onStart={() => (moving.current = false)}
    />
  );
}
function MaterialDropMarker({ marker }: { marker: NonNullable<SceneProps["materialDropMarker"]> }) {
  const group = useRef<THREE.Group>(null);
  const { invalidate, gl } = useThree();
  useLayoutEffect(() => {
    const node = group.current!;
    marker.current = (point) => {
      if (!point && !node.visible) return;
      if (point) {
        node.position.set(point[0] / 12, point[1] / 12 + 0.035, point[2] / 12);
        gl.domElement.dataset.materialDropPoint = JSON.stringify(point);
      } else {
        delete gl.domElement.dataset.materialDropPoint;
      }
      node.visible = point !== null;
      invalidate();
    };
    return () => {
      marker.current = null;
      delete gl.domElement.dataset.materialDropPoint;
    };
  }, [gl, invalidate, marker]);
  return <group ref={group} visible={false}>
    <mesh rotation={[-Math.PI / 2, 0, 0]} raycast={() => null}>
      <ringGeometry args={[0.19, 0.25, 32]} />
      <meshBasicMaterial color="#356c3d" />
    </mesh>
    <mesh position={[0, 0.09, 0]} raycast={() => null}>
      <sphereGeometry args={[0.052, 12, 8]} />
      <meshBasicMaterial color="#356c3d" />
    </mesh>
  </group>;
}
function WorkZone({ project }: { project: Project }) {
  const zone = project.workZone;
  if (!zone) return null;
  const w = zone.width / 24,
    d = zone.depth / 24,
    h = zone.height / 12;
  const floor: V3[] = [
    [-w, 0.015, -d],
    [w, 0.015, -d],
    [w, 0.015, d],
    [-w, 0.015, d],
    [-w, 0.015, -d],
  ];
  return (
    <group>
      <mesh
        position={[0, 0.005, 0]}
        rotation={[-Math.PI / 2, 0, 0]}
        raycast={() => null}
      >
        <planeGeometry args={[w * 2, d * 2]} />
        <meshBasicMaterial
          color="#a8bc95"
          transparent
          opacity={0.15}
          depthWrite={false}
        />
      </mesh>
      <Line points={floor} color="#6a8754" lineWidth={2} raycast={() => null} />
      <Line
        points={floor.map(([x, , z]) => [x, h, z]) as V3[]}
        color="#8ba279"
        lineWidth={1}
        dashed
        dashSize={0.2}
        gapSize={0.15}
        raycast={() => null}
      />
      {floor.slice(0, 4).map(([x, , z], i) => (
        <Line
          key={i}
          points={[
            [x, 0, z],
            [x, h, z],
          ]}
          color="#8ba279"
          lineWidth={1}
          dashed
          dashSize={0.2}
          gapSize={0.15}
          raycast={() => null}
        />
      ))}
    </group>
  );
}
function Measurement({
  measurement,
}: {
  measurement: SceneProps["measurement"];
}) {
  const a = measurement?.a,
    b = measurement?.b;
  if (!a) return null;
  const first = a.map((v) => v / 12) as V3;
  const second = b?.map((v) => v / 12) as V3;
  const midpoint = second
    ? (first.map((v, i) => (v + second[i]) / 2) as V3)
    : first;
  return (
    <group>
      {[first, ...(second ? [second] : [])].map((point, i) => (
        <mesh key={i} position={point} renderOrder={1000} raycast={() => null}>
          <sphereGeometry args={[0.045, 14, 10]} />
          <meshBasicMaterial color="#287c9b" depthTest={false} />
        </mesh>
      ))}
      {second && (
        <Line
          points={[first, second]}
          color="#287c9b"
          lineWidth={2}
          depthTest={false}
          renderOrder={1000}
          raycast={() => null}
        />
      )}
      <Html
        center
        position={[midpoint[0], midpoint[1] + 0.18, midpoint[2]]}
        style={{
          pointerEvents: "none",
          whiteSpace: "nowrap",
          color: "#145c76",
          fontSize: 12,
          fontWeight: 600,
          background: "#f4fcffeF",
          border: "1px solid #8eb8c8",
          borderRadius: 5,
          padding: "5px 8px",
        }}
      >
        <span data-testid="measurement-label">
          {b
            ? formatMeasurement(measureBetween(a, b).distance)
            : "Start point · choose end point"}
        </span>
      </Html>
    </group>
  );
}
function WallTraceOverlay({ a, b, outline, footprints, blocked }: NonNullable<SceneProps["wallTrace"]>) {
  const points = [a, b].flatMap((point) => point ? [[point[0] / 12, 0.02, point[1] / 12] as V3] : []);
  const color = blocked ? "#b6402b" : "#1c6b63";
  return <group>
    {points.length === 2 && <Line points={points} lineWidth={1.5} color={color} transparent opacity={0.6} depthTest={false} renderOrder={1001} raycast={() => null} />}
    {outline && <Line points={[...outline, outline[0]].map(([x, z]): V3 => [x / 12, 0.025, z / 12])}
      lineWidth={2} color="#246e88" dashed dashSize={0.2} gapSize={0.1} depthTest={false} renderOrder={1001} raycast={() => null} />}
    {footprints.map((outline, index) => <Line key={index}
      points={outline.map(([x, y, z]): V3 => [x / 12, y / 12 + 0.02, z / 12])}
      lineWidth={2.5} color={color} depthTest={false} renderOrder={1001} raycast={() => null} />)}
    {[a, b].map((point, index) => point && <Html key={index} center
      position={[point[0] / 12, 0.035, point[1] / 12]} style={{ pointerEvents: "none" }}>
      <span className="wall-trace-point" aria-hidden="true">{index === 0 ? "A" : "B"}</span>
    </Html>)}
  </group>;
}
function World(props: SceneProps) {
  const renderer = useThree((state) => state.gl);
  const texture = useMemo(woodTexture, []);
  useEffect(() => () => texture.dispose(), [texture]);
  const vent = props.shownPlumbingVentLayout;
  const ductLayout = props.shownDryerDuctLayout;
  const ductRuns = useMemo(() => ductLayout ? reviewDryerDuctLayout(props.project, ductLayout) : [], [props.project, ductLayout]);
  const siteBounds = useMemo(() => vent ? ventLayoutBounds(vent) : ductRuns.length ? unionBounds(ductRuns.map(({ bounds }) => bounds)) : null, [vent, ductRuns]);
  const assemblyOnly = !!vent || !!ductLayout || !!props.guidePartFocus || !!props.motionPreview || !!props.lidPreview || !!props.fittedStockFaces || !!props.showFasteners || !!props.showConnectors || !!props.showHinges || !!props.showAttachments || !!props.showRestraints || props.mode === "fit-face" || props.mode === "fastener";
  const selectedOffcut = props.project.pieces.find((piece) => piece.id === props.selected && piece.offcut)?.id ?? null;
  const visibility = { showOffcuts: props.showOffcuts, selectedId: selectedOffcut, assemblyOnly };
  const stagePieces = visibleStagePieces(props.project, { ...visibility, stage: props.stage });
  const guidePiece = stagePieces.find((piece) => piece.id === props.guidePartFocus?.pieceId);
  const isolated = guidePiece && props.guidePartFocus?.isolated;
  const visible = isolated ? [guidePiece] : stagePieces;
  const reference = props.project.drawingReference;
  const drawing = !isolated && !props.focusedMotion && !props.readOnly && reference?.calibration.visible ? reference : null;
  const planLines = props.outlineReferenceLines ?? props.project.planLines;
  const referencePoints = useMemo(() => planLines.flatMap(({ a, b }) => [
    a.map((value) => value / 12) as V3,
    b.map((value) => value / 12) as V3,
  ]), [planLines]);
  const drawingBounds = useMemo(() => {
    if (drawing && props.view.preset !== "plan") return drawingReferenceBounds(drawing, drawing.calibration);
    if (!planLines.length || (props.view.preset !== "plan" && props.view.preset !== "drawing")) return null;
    const points = planLines.flatMap(({ a, b }) => [a, b]);
    return {
      min: [0, 1, 2].map((axis) => Math.min(...points.map((point) => point[axis]))) as V3,
      max: [0, 1, 2].map((axis) => Math.max(...points.map((point) => point[axis]))) as V3,
    };
  }, [drawing, planLines, props.view.preset]);
  const framePieces = guidePiece ? visible : visibleStockPieces(props.project, visibility);
  const stockFrameKey = guidePiece ? `guide:${guidePiece.id}:${props.guidePartFocus?.isolated}`
    : assemblyOnly ? "assembly" : props.showOffcuts ? "all-offcuts" : selectedOffcut ?? "assembly";
  const renderedIds = JSON.stringify(visible.map((piece) => piece.id));
  useEffect(() => { renderer.domElement.dataset.renderedPartIds = renderedIds; }, [renderer, renderedIds]);
  const section = props.project.sections.find(
    (s) => s.id === props.selectedSectionId,
  );
  const grouped = section ? movingSectionIds(props.project, section) : new Set<string>();
  const markedRun = props.shownTrimSeam ?? props.shownBandingEdge ?? props.shownProfileRun;
  return (
    <>
      <color attach="background" args={["#eeeee5"]} />
      <fog attach="fog" args={["#eeeee5", 45, 110]} />
      <ambientLight intensity={1.35} />
      <hemisphereLight args={["#fffaf0", "#a8b39b", 1.8]} />
      <directionalLight
        castShadow
        position={[-8, 16, 10]}
        intensity={2.5}
        shadow-mapSize={[2048, 2048]}
        shadow-camera-left={-20}
        shadow-camera-right={20}
        shadow-camera-top={20}
        shadow-camera-bottom={-20}
        shadow-bias={-0.0005}
      />
      <mesh
        rotation={[-Math.PI / 2, 0, 0]}
        position={[0, -0.025, 0]}
        receiveShadow
      >
        <planeGeometry args={[400, 400]} />
        <meshStandardMaterial color="#eeeee5" roughness={1} />
      </mesh>
      {drawing && <DrawingReferenceMesh drawing={drawing} />}
      <Grid
        position={[0, -0.01, 0]}
        // Match the rendered floor. Oversized infinite-grid triangles can disappear on some renderers.
        args={[400, 400]}
        cellSize={1}
        cellThickness={0.55}
        cellColor="#cccfbf"
        sectionSize={4}
        sectionThickness={1}
        sectionColor="#b6bba7"
        fadeDistance={38}
        fadeStrength={1.5}
      />
      {(props.mode === "measure" || props.mode === "trace-wall") && (
        <mesh
          rotation={[-Math.PI / 2, 0, 0]}
          onClick={(e: ThreeEvent<MouseEvent>) => {
            e.stopPropagation();
            if (e.button === 0 && e.delta <= 4) {
              const point: V3 = [e.point.x * 12, 0, e.point.z * 12];
              if (props.mode === "trace-wall") props.onWallTracePoint?.(point);
              else props.onMeasurePoint?.(point);
            }
          }}
          onPointerOver={() => {
            document.body.style.cursor = "crosshair";
          }}
          onPointerOut={() => {
            document.body.style.cursor = "auto";
          }}
        >
          <planeGeometry args={props.mode === "trace-wall" ? [2000, 2000] : [400, 400]} />
          <meshBasicMaterial transparent opacity={0} depthWrite={false} />
        </mesh>
      )}
      {!isolated && !props.focusedMotion && <WorkZone project={props.project} />}
      {props.materialDropMarker && <MaterialDropMarker marker={props.materialDropMarker} />}
      {props.shownCheckArea && !props.explode && props.stage === null && (
        <CheckAreaMarkers area={props.shownCheckArea} />
      )}
      {!props.focusedMotion && (props.lidPreview?.shownSiteFaceId ? (
        <SiteClearanceMarkers project={props.project} id={props.lidPreview.shownSiteFaceId}
          shortfall={props.lidPreview.siteFaceHits?.includes(props.lidPreview.shownSiteFaceId)} />
      ) : props.motionPreview?.shownSiteFaceId ? (
        <SiteClearanceMarkers project={props.project} id={props.motionPreview.shownSiteFaceId}
          shortfall={props.motionPreview.siteFaceHits.includes(props.motionPreview.shownSiteFaceId)} />
      ) : props.shownSiteClearanceId && !props.explode && props.stage === null && !props.lidPreview && !props.motionPreview && (
        <SiteClearanceMarkers project={props.project} id={props.shownSiteClearanceId} />
      ))}
      {!isolated && props.shownFoundation && !props.explode && props.stage === null && !props.lidPreview && !props.motionPreview && (
        <GreenhouseFoundationMarker review={props.shownFoundation} />
      )}
      {!isolated && props.shownSubfloor && !props.explode && props.stage === null && !props.lidPreview && !props.motionPreview && (
        <SubfloorMarkers layout={props.shownSubfloor} fastening={props.shownSubfloorFasteners} />
      )}
      {!isolated && props.shownSubfloorAdhesive?.layout && !props.explode && props.stage === null && !props.lidPreview && !props.motionPreview && (
        <SubfloorAdhesiveMarkers layout={props.shownSubfloorAdhesive.layout} />
      )}
      {!isolated && props.shownSubfloorJoists?.center && !props.explode && props.stage === null && !props.lidPreview && !props.motionPreview && (
        <SubfloorJoistMarkers review={props.shownSubfloorJoists} center={props.shownSubfloorJoists.center} />
      )}
      {!isolated && props.shownPlateSeal && !props.explode && props.stage === null && !props.lidPreview && !props.motionPreview && (
        <group>
          {props.shownPlateSeal.runs.map(({ points, problem }, index) =>
            <Line key={index} points={points.map((point) => point.map((n) => n / 12) as V3)}
              color={problem || props.shownPlateSeal?.outdated ? "#ba4c2b" : "#35748c"} lineWidth={4} depthTest={false} raycast={() => null} />)}
          <Html center position={props.shownPlateSeal.start.map((n, i) => (n + (i === 1 ? 1 : 0)) / 12) as V3}
            zIndexRange={[35, 0]} style={{ pointerEvents: "none" }}>
            <span className="site-clearance-marker" data-testid={props.shownPlateSeal.top ? "top-plate-seam-start" : "bottom-plate-seam-start"}>
              Bead start · {props.shownPlateSeal.outdated ? "Review changed seam" : props.shownPlateSeal.top ? "Top plate air seal" : "Bottom plate air seal"}
            </span>
          </Html>
        </group>
      )}
      {!isolated && props.shownRoofValley && !props.explode && props.stage === null && !props.lidPreview && !props.motionPreview && (
        <group>
          <Line points={props.shownRoofValley.map((point) => point.map((value) => value / 12) as V3)}
            color="#28677d" lineWidth={4} depthTest={false} raycast={() => null} />
          <Html position={props.shownRoofValley[0].map((value) => value / 12) as V3} style={{ pointerEvents: "none" }}>
            <span className="site-clearance-marker" data-testid="roof-valley-marker">Valley centerline · eave</span>
          </Html>
        </group>
      )}
      {!isolated && props.shownRoofVent && !props.explode && props.stage === null && !props.lidPreview && !props.motionPreview && (
        <group>
          {[props.shownRoofVent.flange, props.shownRoofVent.layout].map((points, index) =>
            <Line key={index} points={[...points, points[0]].map((point) => point.map((value) => value / 12) as V3)}
              color={index === 0 ? "#28677d" : "#af5a20"} lineWidth={3} depthTest={false} raycast={() => null} />)}
          <Html position={props.shownRoofVent.center.map((value, index) => (value + (index === 1 ? 1 : 0)) / 12) as V3}
            style={{ pointerEvents: "none" }}>
            <span className="site-clearance-marker" data-testid="roof-vent-marker">Vent center · opening and flange</span>
          </Html>
        </group>
      )}
      {!isolated && !props.explode && props.stage === null && !props.lidPreview && !props.motionPreview &&
        props.shownRimSeal?.map(({ id, outline }, index) => (
          <group key={id}>
            <Line points={outline.map((point) => point.map((value) => value / 12) as V3)}
              color="#ad4e75" lineWidth={3} depthTest={false} raycast={() => null} />
            {index === 0 && <Html position={outline[0].map((value) => value / 12) as V3} style={{ pointerEvents: "none" }}>
              <span className="site-clearance-marker" data-testid="rim-seal-marker">Rim foam cuts</span>
            </Html>}
          </group>
        ))}
      {!isolated && props.shownSillGasket && !props.explode && props.stage === null && !props.lidPreview && !props.motionPreview && (
        <group>
          <Line points={props.shownSillGasket.points.map((point) => point.map((n) => n / 12) as V3)}
            color={props.shownSillGasket.needsReview ? "#ba4c2b" : "#35748c"} lineWidth={3} depthTest={false} raycast={() => null} />
          <Html center position={props.shownSillGasket.points[0].map((n) => n / 12) as V3}
            zIndexRange={[35, 0]} style={{ pointerEvents: "none" }}>
            <span className="site-clearance-marker" data-testid="sill-gasket-marker">
              {props.shownSillGasket.needsReview ? "Sill gasket · Needs review" : "Sill gasket footprint"}
            </span>
          </Html>
        </group>
      )}
      {!isolated && props.shownOpeningFlashing && !props.explode && props.stage === null && !props.lidPreview && !props.motionPreview && (
        <OpeningFlashingMarkers preview={props.shownOpeningFlashing} />
      )}
      {vent && !props.lidPreview && !props.motionPreview && <PlumbingVentMarkers layout={vent} />}
      {!!ductRuns.length && !props.lidPreview && !props.motionPreview && <DryerDuctMarkers runs={ductRuns} />}
      {props.motionPreview?.clearanceCeiling && (
        <mesh position={props.motionPreview.clearanceCeiling.center.map((n) => n / 12) as V3} raycast={() => null}>
          <boxGeometry args={props.motionPreview.clearanceCeiling.size.map((n) => n / 12) as V3} />
          <meshBasicMaterial color="#4aa3c1" transparent opacity={0.12} depthWrite={false} />
          <Edges color="#4a8ea3" depthWrite={false} />
          <Html position={[0, 0.12, 0]} center style={{ pointerEvents: "none" }}>
            <span className="site-clearance-marker" data-testid="casework-measured-ceiling">Measured ceiling</span>
          </Html>
        </mesh>
      )}
      {props.motionPreview?.obstaclePieces?.map((piece) => {
        const hit = props.motionPreview?.interferenceIds.includes(piece.id);
        return (
          <mesh key={piece.id} position={piece.position.map((n) => n / 12) as V3}
            rotation={piece.rotation} raycast={() => null}>
            <boxGeometry args={piece.size.map((n) => n / 12) as V3} />
            <meshStandardMaterial color={hit ? "#b92e2e" : "#474a4c"} roughness={0.48} metalness={0.4} />
            <Edges color={hit ? "#ed5555" : "#424d51"} depthTest={false} depthWrite={false} renderOrder={6} />
            <Html center position={[0, piece.size[1] / 24, 0]} style={{ pointerEvents: "none" }}>
              <span className="site-clearance-marker" data-testid="motion-obstacle" data-contact={hit ? "ahead" : "clear"}>{piece.name}</span>
            </Html>
          </mesh>
        );
      })}
      {props.shownSaunaHeater?.layout && !props.explode && props.stage === null && !props.motionPreview && !props.lidPreview && (
        <>
          <mesh position={props.shownSaunaHeater.layout.body.center.map((n) => n / 12) as V3}
            rotation={props.shownSaunaHeater.layout.rotation} raycast={() => null}>
            <boxGeometry args={props.shownSaunaHeater.layout.body.size.map((n) => n / 12) as V3} />
            <meshStandardMaterial color="#474a4c" roughness={0.48} metalness={0.4} />
            <Edges color="#424d51" lineWidth={2} depthTest={false} depthWrite={false} renderOrder={6} />
            {!props.shownSaunaHeater.layout.clearance && (
              <Html center position={[0, props.shownSaunaHeater.layout.body.size[1] / 24, 0]} style={{ pointerEvents: "none" }}>
                <span className="site-clearance-marker" data-testid="sauna-heater-marker">Harvia listed body</span>
              </Html>
            )}
          </mesh>
          {props.shownSaunaHeater.layout.clearance && <mesh position={props.shownSaunaHeater.layout.clearance.center.map((n) => n / 12) as V3}
            rotation={props.shownSaunaHeater.layout.rotation} raycast={() => null}>
            <boxGeometry args={props.shownSaunaHeater.layout.clearance.size.map((n) => n / 12) as V3} />
            <meshBasicMaterial transparent opacity={0.1} depthWrite={false}
              color={props.shownSaunaHeater.ready ? "#2382a5" : "#ba4c2b"} />
            <Edges color={props.shownSaunaHeater.ready ? "#2382a5" : "#ba4c2b"}
              lineWidth={2} depthTest={false} depthWrite={false} renderOrder={7}
              dashed dashSize={0.13} gapSize={0.08} />
            <Html center position={[0, props.shownSaunaHeater.layout.clearance.size[1] / 24, 0]} style={{ pointerEvents: "none" }}>
              <span className="site-clearance-marker" data-testid="sauna-heater-marker">STEEL 6 clearance</span>
            </Html>
          </mesh>}
        </>
      )}
      {props.shownSaunaVentilation && !props.explode && props.stage === null && !props.motionPreview && !props.lidPreview && (
        <SaunaVentilationMarkers review={props.shownSaunaVentilation} />
      )}
      {markedRun && !props.explode && props.stage === null && !props.motionPreview && !props.lidPreview && (
        <group>
          {(props.shownTrimSeam?.segments ?? [{ points: markedRun.points, open: false }]).map(({ points, open }, i) =>
            <Line key={i} points={points.map((point) => point.map((v) => v / 12) as V3)}
              color={open ? "#b75b22" : "#2382a5"} dashed={open} dashSize={0.045} gapSize={0.03}
              lineWidth={4} depthTest={false} raycast={() => null} />,
          )}
          {props.shownTrimSeam && (
            <mesh position={markedRun.points[0].map((v) => v / 12) as V3} renderOrder={9} raycast={() => null}>
              <sphereGeometry args={[0.022, 12, 8]} />
              <meshBasicMaterial color="#195b73" depthTest={false} depthWrite={false} />
            </mesh>
          )}
          <Html center position={markedRun.points[0].map((v, i) =>
            props.shownTrimSeam
              ? v / 12 + (i === 1 ? 0.08 : 0)
              : (v + markedRun.points[1][i]) / 24) as V3}
            zIndexRange={[35, 0]} style={{ pointerEvents: "none" }}>
            <span className="site-clearance-marker" data-testid={props.shownTrimSeam ? "trim-seam-marker" : props.shownBandingEdge ? "edge-banding-marker" : "sunlite-profile-marker"}>
              {props.shownTrimSeam && <><strong data-testid="trim-seam-start">Start</strong>{" · "}</>}
              {markedRun.label}
            </span>
          </Html>
        </group>
      )}
      {props.shownDrawerMountId && !props.explode && props.stage === null && !props.lidPreview && !props.motionPreview && (
        <DrawerSlideMountMarkers project={props.project} motionId={props.shownDrawerMountId} />
      )}
      {props.shownLatchId && !props.explode && props.stage === null && !props.lidPreview && !props.motionPreview && (
        <GreenhouseLatchMarkers project={props.project} motionId={props.shownLatchId} />
      )}
      {props.shownRodSupportId && !props.explode && props.stage === null && !props.lidPreview && (
        <RodSupportMarkers project={props.project} rodId={props.shownRodSupportId} />
      )}
      {props.fittedStockFaces && <FittedStockGeometry project={props.project} preview={props.fittedStockPreview ?? null} faces={props.fittedStockFaces} />}
      {props.baseRailPreview && !props.explode && props.stage === null && (
        <group>
          <StockGhost piece={props.baseRailPreview} />
          <Html center position={props.baseRailPreview.position.map((value) => value / 12) as V3}
            zIndexRange={[35, 0]} style={{ pointerEvents: "none" }}>
            <span className="fitted-stock-ghost-label" data-testid="base-rail-preview">Proposed rail position</span>
          </Html>
        </group>
      )}
      {guidePiece && props.guidePartFocus && (
        <Html center position={guidePiece.position.map((value) => value / 12) as V3}
          zIndexRange={[35, 0]} style={{ pointerEvents: "none" }}>
          <span className="fitted-stock-ghost-label" data-testid="guide-part-marker" data-piece-id={guidePiece.id}>
            {props.guidePartFocus.label}
          </span>
        </Html>
      )}
      {!props.focusedMotion && (props.lidPreview || props.motionPreview) && (
        <Line
          points={(props.motionPreview?.guideLine ?? lidAxisSegment(props.lidPreview!))
            .map((point) => point.map((value) => value / 12) as V3)}
          color="#287c9b"
          lineWidth={3}
          dashed
          dashSize={0.12}
          gapSize={0.08}
          depthTest={!props.motionPreview}
          depthWrite={!props.motionPreview}
          renderOrder={props.motionPreview ? 10 : 0}
          raycast={() => null}
        />
      )}
      {!props.focusedMotion && props.lidPreview?.stayLinks?.map((link) => link.arms?.length ? (
        <group key={link.id}>
          {link.arms.map((arm, index) => (
            <mesh key={index} position={arm.position.map((value) => value / 12) as V3}
              rotation={arm.rotation} renderOrder={9} raycast={() => null}>
              <boxGeometry args={arm.size.map((value) => value / 12) as V3} />
              <meshBasicMaterial color={arm.hitIds.length ? "#b2482d"
                : props.lidPreview?.stayArmReviewFitId === link.id ? "#d29528" : "#316d64"}
                transparent opacity={0.8} depthTest={false} depthWrite={false} />
            </mesh>
          ))}
        </group>
      ) : (
        <Line
          key={link.id}
          points={link.points.map((point) => point.map((value) => value / 12) as V3)}
          color={link.state === "reachable" ? "#316d64" : "#b2482d"}
          dashed={link.state !== "reachable"}
          dashSize={0.08}
          gapSize={0.04}
          depthTest={false}
          depthWrite={false}
          renderOrder={9}
          lineWidth={3}
          raycast={() => null}
        />
      ))}
      {props.driverAccessPreview && <DriverAccessMarker row={props.driverAccessPreview} />}
      {props.showFasteners && <FastenerMarkers project={props.project} selectedPlanId={props.selectedFastenerPlanId} focusedLocationId={props.focusedFastenerLocationId} layoutPreview={props.fastenerLayoutPreview} />}
      {props.showConnectors && !props.explode && props.stage === null && <ConnectorMarkers project={props.project} selectedPlanId={props.selectedConnectorPlanId} review={props.connectorPreview} focusedEntryId={props.focusedConnectorEntryId} />}
      {props.showHinges && !props.readOnly && !props.explode && props.stage === null && <HingeMarkers project={props.project} sectionId={props.selectedSectionId} />}
      {props.showRestraints && <RestraintMarkers project={props.project} />}
      {props.showAttachments && (
        <AttachmentMarkers
          project={props.project}
          readOnly={props.readOnly}
          selectedPlanId={props.selectedAttachmentPlanId}
          onSelectPlan={props.onSelectAttachmentPlan}
          onSelectPart={props.onSelectAttachmentPart ?? props.onSelect}
        />
      )}
      {props.mode === "measure" && (
        <Measurement measurement={props.measurement} />
      )}
      {props.mode === "trace-wall" && props.wallTrace && <WallTraceOverlay {...props.wallTrace} />}
      {section && (
        <SectionGroup
          key={`${section.id}:${section.origin.join(",")}:${section.rotation.join(",")}`}
          section={section}
          pieces={visible.filter((p) => grouped.has(p.id))}
          props={props}
          texture={texture}
        />
      )}
      {visible
        .filter((p) => !grouped.has(p.id))
        .map((p) => (
          <PlacedPart key={p.id} p={p} props={props} texture={texture} />
        ))}
      {!isolated && referencePoints.length > 0 && <Line segments points={referencePoints}
        color="#548d9b" lineWidth={props.outlineReferenceLines ? 1.5 : 2} raycast={() => null} />}
      {!props.readOnly && props.mode !== "trace-wall" && props.project.joints.map((j) => {
        const a = visible.find((p) => p.id === j.a),
          b = visible.find((p) => p.id === j.b);
        if (!a || !b) return null;
        return <JointMarker key={j.id} a={a} b={b} />;
      })}
      <CameraRig
        view={props.view}
        project={props.project}
        onCamera={props.onCamera}
        fitToView={props.fitToView}
        animateView={props.animateView}
        motionBounds={props.motionBounds}
        siteBounds={siteBounds}
        drawingBounds={drawingBounds}
        framePieces={framePieces}
        stockFrameKey={stockFrameKey}
      />
    </>
  );
}
export function Scene(props: SceneProps) {
  const preview = props.lidPreview;
  const motion = props.motionPreview;
  // Stable through scrubbing: frame the full swing once on entry, then let
  // the user orbit freely. The shown pose never becomes saved project geometry.
  const motionBounds = useMemo(() => preview
    ? unionBounds([
      ...props.project.pieces.filter((p) => !p.offcut).map(bounds),
      preview.travelBounds ?? reviewLidTravel(props.project, preview.sectionId).bounds,
    ])
    : null, [props.project, preview?.sectionId, preview?.travelBounds]);
  const posed = useMemo(() => {
    if (!motion && !preview) return null;
    const hidden = new Set(motion?.hiddenPieceIds);
    const poses = new Map(motion?.pieces.map((piece) => [piece.id, piece]));
    const pieces = props.project.pieces.filter((piece) => !hidden.has(piece.id))
      .map((piece) => piece.id === preview?.piece.id ? preview.piece : poses.get(piece.id) ?? piece);
    if (motion?.draftGeometry) {
      const committedIds = new Set(props.project.pieces.map(({ id }) => id));
      pieces.push(...motion.pieces.filter(({ id }) => !committedIds.has(id)));
    }
    const focus = motion?.focusPair ?? preview?.focusPair;
    const pair = focus ? pieces.filter((piece) => !piece.offcut && focus.includes(piece.id)) : [];
    return pair.length === 2
      ? { pieces: pair, pairBounds: unionBounds(pair.map(bounds)) }
      : { pieces, pairBounds: null };
  }, [props.project, motion, preview]);
  const shown: SceneProps = preview || motion ? {
    ...props,
    project: {
      ...props.project,
      pieces: posed?.pieces ?? props.project.pieces,
    },
    readOnly: true,
    motionBounds: posed?.pairBounds ?? motion?.bounds ?? motionBounds,
    focusedMotion: !!posed?.pairBounds,
    interferenceIds: motion?.interferenceIds ?? [],
    selected: null,
    selectedSectionId: null,
    mode: "move",
    onSelect: () => {},
    onMove: () => {},
    onSectionMove: () => {},
    stage: null,
    guidePartFocus: undefined,
    explode: false,
    showAttachments: false,
    showRestraints: false,
    showFasteners: false,
    showConnectors: false,
    showHinges: motion ? false : props.showHinges,
  } : props;
  return (
    <Canvas
      frameloop="demand"
      shadows
      dpr={[1, 2]}
      camera={{ position: [12, 9, 14], fov: 38, near: 0.05, far: 500 }}
      gl={{ antialias: true, preserveDrawingBuffer: true }}
      onContextMenu={(event) => event.preventDefault()}
      fallback={
        <div className="empty">
          This workshop needs a browser with WebGL enabled.
        </div>
      }
      onPointerMissed={() => {
        if (shown.readOnly) return;
        if (props.mode !== "screw" && props.mode !== "measure" && props.mode !== "fastener" && props.mode !== "fit-face" && props.mode !== "trace-wall")
          props.onSelect("");
      }}
    >
      <Suspense fallback={null}>
        <World {...shown} />
      </Suspense>
    </Canvas>
  );
}

function SubfloorAdhesiveMarkers({ layout }: { layout: NonNullable<SubfloorAdhesiveReview["layout"]> }) {
  const feet = (point: V3) => point.map((value) => value / 12) as V3;
  return <group>
    {layout.runs.map(({ points, supportId }, index) => <Line key={`${supportId}-${index}`}
      points={points.map(feet)} color="#8d4200" lineWidth={4} depthTest={false} renderOrder={10} raycast={() => null} />)}
    <Html center position={feet([layout.center[0], layout.center[1] + 4, layout.center[2]])}
      zIndexRange={[35, 0]} style={{ pointerEvents: "none" }}>
      <span className="site-clearance-marker" data-testid="subfloor-adhesive-marker">
        Adhesive · {layout.runs.length} framing bead runs
      </span>
    </Html>
  </group>;
}

function SubfloorJoistMarkers({ review, center }: { review: SubfloorJoistReview; center: V3 }) {
  const feet = (point: V3) => point.map((value) => value / 12) as V3;
  const problems = review.rows.filter((row) => row.issue || row.ends.some(({ issue }) => issue)).length;
  return <group>
    {review.rows.flatMap(({ id, marks }) => marks.map(({ points, problem }, index) =>
      <Line key={`${id}/${index}`} points={points.map(feet)} color={problem ? "#bd481d" : "#206575"}
        lineWidth={problem ? 6 : 3} depthTest={false} renderOrder={10} raycast={() => null} />))}
    <Html center position={feet([center[0], center[1] + 4, center[2]])}
      zIndexRange={[35, 0]} style={{ pointerEvents: "none" }}>
      <span className="site-clearance-marker" data-testid="subfloor-joists-marker">
        {problems ? `Joists · ${problems} to review` : review.referenceProblem ? "Joists · Check span reference"
          : `Joists · ${review.rows.length} bearing lines`}
      </span>
    </Html>
  </group>;
}

function SubfloorMarkers({ layout, fastening }: {
  layout: NonNullable<SubfloorReview["layout"]>;
  fastening?: SubfloorFasteningReview;
}) {
  const feet = (point: V3) => point.map((value) => value / 12) as V3;
  const { marks, conflicts } = useMemo(() => {
    const bad = new Set(fastening?.problemMarks);
    return {
      marks: new Float32Array(layout.nails.filter((_, i) => !bad.has(i)).flatMap(feet)),
      conflicts: new Float32Array(layout.nails.filter((_, i) => bad.has(i)).flatMap(feet)),
    };
  }, [layout, fastening]);
  return <group>
    {layout.edges.map(({ name, points, problem }, index) => <Line key={`${name}-${index}`} points={points.map(feet)}
      color={problem ? "#bd481d" : "#206575"} lineWidth={problem ? 5 : 2} depthTest={false} raycast={() => null} />)}
    {layout.spans.filter(({ problem }) => problem).map(({ points }, index) =>
      <Line key={index} points={points.map(feet)} color="#bd481d" lineWidth={4} dashed dashSize={0.2}
        gapSize={0.12} depthTest={false} raycast={() => null} />)}
    {!!marks.length && <points raycast={() => null}>
      <bufferGeometry><bufferAttribute attach="attributes-position" args={[marks, 3]} /></bufferGeometry>
      <pointsMaterial color="#206575" size={6} sizeAttenuation={false} depthTest={false} />
    </points>}
    {!!conflicts.length && <points renderOrder={11} raycast={() => null}>
      <bufferGeometry><bufferAttribute attach="attributes-position" args={[conflicts, 3]} /></bufferGeometry>
      <pointsMaterial color="#bd481d" size={11} sizeAttenuation={false} depthTest={false} />
    </points>}
    <Html center position={feet([layout.center[0], layout.center[1] + 2, layout.center[2]])}
      zIndexRange={[35, 0]} style={{ pointerEvents: "none" }}>
      <span className="site-clearance-marker" data-testid={fastening ? "subfloor-fasteners-marker" : "subfloor-support-marker"}>
        {fastening ? conflicts.length ? `Fasteners · Review ${conflicts.length / 3} marked ${conflicts.length === 3 ? "path" : "paths"}` :
          fastening.ready ? `Fasteners · ${fastening.marks} modeled paths` : "Fasteners · Review the sheet"
          : layout.issues.length ? "Subfloor · Review marked support" : `Subfloor · ${layout.nails.length} estimated nailing locations`}
      </span>
    </Html>
  </group>;
}
