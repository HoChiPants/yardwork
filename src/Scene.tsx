import { Suspense, useEffect, useMemo, useRef } from "react";
import {
  Canvas,
  useFrame,
  useThree,
  type ThreeEvent,
} from "@react-three/fiber";
import {
  Edges,
  Grid,
  Line,
  OrbitControls,
  TransformControls,
} from "@react-three/drei";
import * as THREE from "three";
import { bounds } from "./engine";
import { material, type Piece, type Project, type V3 } from "./model";
export type SceneProps = {
  project: Project;
  selected: string | null;
  onSelect: (id: string) => void;
  onMove: (id: string, position: V3, rotation: V3) => void;
  mode: "select" | "move" | "rotate" | "screw";
  snap: boolean;
  explode: boolean;
  xray: boolean;
  stage: number | null;
  view: { preset: string; nonce: number };
  onCamera: (camera: THREE.Camera) => void;
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
function PartMesh({
  piece,
  selected,
  onSelect,
  xray,
  explode,
  stepIndex,
  texture,
}: {
  piece: Piece;
  selected: boolean;
  onSelect: (id: string) => void;
  xray: boolean;
  explode: boolean;
  stepIndex: number;
  texture: THREE.Texture;
}) {
  const mesh = useRef<THREE.Group>(null);
  const invalidate = useThree((s) => s.invalidate);
  const unitScale = useMemo(() => new THREE.Vector3(1, 1, 1), []);
  const m = material(piece.material);
  const wood = ["stud", "treated", "post", "plywood"].includes(piece.material);
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
  return (
    <group ref={mesh} scale={[0.92, 0.92, 0.92]}>
      <mesh
        castShadow
        receiveShadow
        onClick={(e: ThreeEvent<MouseEvent>) => {
          e.stopPropagation();
          onSelect(piece.id);
        }}
        onPointerOver={(e) => {
          e.stopPropagation();
          document.body.style.cursor = "pointer";
        }}
        onPointerOut={() => (document.body.style.cursor = "auto")}
      >
        <boxGeometry args={piece.size.map((v) => v / 12) as V3} />
        <meshStandardMaterial
          color={selected ? "#f2a16b" : piece.offcut ? "#b5ada0" : m.color}
          map={wood ? texture : null}
          roughness={piece.material === "roof" ? 0.6 : 0.9}
          metalness={piece.material === "roof" ? 0.4 : 0}
          transparent={xray || piece.offcut || piece.material === "mesh"}
          opacity={
            piece.offcut
              ? 0.45
              : xray && ["siding", "roof"].includes(piece.material)
                ? 0.16
                : piece.material === "mesh"
                  ? 0.4
                  : 1
          }
          wireframe={piece.material === "mesh"}
        />
        <Edges
          threshold={25}
          color={selected ? "#f28146" : "#3c392b"}
          opacity={selected ? 0.9 : 0.14}
          transparent
        />
      </mesh>
    </group>
  );
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
  const selected = props.selected === p.id;
  const transform =
    selected && (props.mode === "move" || props.mode === "rotate");
  const mesh = (
    <group
      ref={ref}
      position={p.position.map((v) => v / 12) as V3}
      rotation={p.rotation}
    >
      <PartMesh
        piece={p}
        selected={selected}
        onSelect={props.onSelect}
        xray={props.xray}
        explode={props.explode && !selected}
        stepIndex={props.project.steps.findIndex((s) => s.id === p.stepId)}
        texture={texture}
      />
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
        onMouseUp={() => {
          const obj = ref.current;
          if (obj)
            props.onMove(
              p.id,
              obj.position
                .toArray()
                .map((v) => Math.round(v * 12 * 1000) / 1000) as V3,
              [obj.rotation.x, obj.rotation.y, obj.rotation.z],
            );
        }}
      >
        {mesh}
      </TransformControls>
    );
  return mesh;
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
}: {
  view: SceneProps["view"];
  project: Project;
  onCamera: SceneProps["onCamera"];
}) {
  const { camera, invalidate } = useThree();
  const controls = useRef<any>(null);
  const destination = useRef(new THREE.Vector3(12, 9, 14));
  const target = useRef(new THREE.Vector3(0, 3, 0));
  const moving = useRef(false);
  useEffect(() => {
    onCamera(camera);
  }, [camera, onCamera]);
  useEffect(() => {
    const active = project.pieces.filter((x) => !x.offcut);
    let min = [-36, 0, -24],
      max = [36, 84, 24];
    if (active.length) {
      const bs = active.map(bounds);
      min = [0, 1, 2].map((i) => Math.min(...bs.map((b) => b.min[i])));
      max = [0, 1, 2].map((i) => Math.max(...bs.map((b) => b.max[i])));
    }
    const center = new THREE.Vector3(
      ...(min.map((v, i) => (v + max[i]) / 24) as V3),
    );
    const radius = Math.max(6, ...max.map((v, i) => (v - min[i]) / 12));
    target.current = center;
    const offset =
      view.preset === "top"
        ? new THREE.Vector3(0, radius * 1.8, 0.01)
        : view.preset === "front"
          ? new THREE.Vector3(0, 0, radius * 1.8)
          : new THREE.Vector3(radius * 1.2, radius * 0.85, radius * 1.35);
    destination.current = center.clone().add(offset);
    moving.current = true;
    invalidate();
  }, [view.nonce, view.preset]);
  useFrame((_, dt) => {
    if (moving.current && controls.current) {
      camera.position.lerp(destination.current, Math.min(1, dt * 5));
      controls.current.target.lerp(target.current, Math.min(1, dt * 5));
      controls.current.update();
      invalidate();
      if (camera.position.distanceTo(destination.current) < 0.03)
        moving.current = false;
    }
  });
  return (
    <OrbitControls
      ref={controls}
      makeDefault
      minDistance={2}
      maxDistance={400}
      maxPolarAngle={Math.PI / 2 - 0.01}
      target={[0, 3, 0]}
      onStart={() => (moving.current = false)}
    />
  );
}
function World(props: SceneProps) {
  const texture = useMemo(woodTexture, []);
  useEffect(() => () => texture.dispose(), [texture]);
  const visible =
    props.stage === null
      ? props.project.pieces
      : props.project.pieces.filter(
          (p) =>
            props.project.steps.findIndex((s) => s.id === p.stepId) <=
            props.stage!,
        );
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
      <Grid
        position={[0, -0.01, 0]}
        args={[200, 200]}
        cellSize={1}
        cellThickness={0.55}
        cellColor="#cccfbf"
        sectionSize={4}
        sectionThickness={1}
        sectionColor="#b6bba7"
        fadeDistance={38}
        fadeStrength={1.5}
        infiniteGrid
      />
      {visible.map((p) => (
        <PlacedPart key={p.id} p={p} props={props} texture={texture} />
      ))}
      {props.project.planLines.map((l, i) => (
        <Line
          key={i}
          points={[l.a.map((v) => v / 12) as V3, l.b.map((v) => v / 12) as V3]}
          color="#548d9b"
          lineWidth={2}
        />
      ))}
      {props.project.joints.map((j) => {
        const a = visible.find((p) => p.id === j.a),
          b = visible.find((p) => p.id === j.b);
        if (!a || !b) return null;
        return <JointMarker key={j.id} a={a} b={b} />;
      })}
      <CameraRig
        view={props.view}
        project={props.project}
        onCamera={props.onCamera}
      />
    </>
  );
}
export function Scene(props: SceneProps) {
  return (
    <Canvas
      frameloop="demand"
      shadows
      dpr={[1, 2]}
      camera={{ position: [12, 9, 14], fov: 38, near: 0.05, far: 500 }}
      gl={{ antialias: true, preserveDrawingBuffer: true }}
      fallback={
        <div className="empty">
          This workshop needs a browser with WebGL enabled.
        </div>
      }
      onPointerMissed={() => {
        if (props.mode !== "screw") props.onSelect("");
      }}
    >
      <Suspense fallback={null}>
        <World {...props} />
      </Suspense>
    </Canvas>
  );
}
