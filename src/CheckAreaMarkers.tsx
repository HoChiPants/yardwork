import { Html, Line } from "@react-three/drei";
import { useMemo } from "react";
import { DoubleSide } from "three";
import type { Finding } from "./engine";
import type { V3 } from "./model";

const feet = (point: V3) => point.map((value) => value / 12) as V3;

export function CheckAreaMarkers({
  area,
}: {
  area: NonNullable<Finding["area"]>;
}) {
  const outlines = useMemo(
    () => area.outlines.map((outline) => outline.map(feet)),
    [area],
  );
  const bearing =
    area.kind === "panel-bearing" ||
    area.kind === "seat-span" ||
    area.kind === "shelf-span" ||
    area.kind === "rafter-eave" ||
    area.kind === "rafter-ridge" ||
    area.kind === "shelf-divider-preview" ||
    area.kind === "eave-block-preview";
  const reference = area.tone === "reference";
  const color = bearing ? "#386e4d" : reference ? "#35748c" : "#aa4421";
  const triangles = useMemo(
    () =>
      new Float32Array(
        outlines.flatMap((points) =>
          points
            .slice(1, -1)
            .flatMap((point, index) => [
              ...points[0],
              ...point,
              ...points[index + 2],
            ]),
        ),
      ),
    [outlines],
  );
  return (
    <group>
      {triangles.length > 0 && (
        <mesh raycast={() => null} renderOrder={8}>
          <bufferGeometry>
            <bufferAttribute
              attach="attributes-position"
              args={[triangles, 3]}
            />
          </bufferGeometry>
          <meshBasicMaterial
            color={bearing ? "#539364" : reference ? "#4794a9" : "#d66936"}
            transparent
            opacity={0.28}
            side={DoubleSide}
            depthTest={false}
            depthWrite={false}
          />
        </mesh>
      )}
      {outlines.map((points, index) => (
        <Line
          key={index}
          points={[...points, points[0]]}
          color={color}
          lineWidth={3}
          renderOrder={9}
          depthTest={false}
          depthWrite={false}
          raycast={() => null}
        />
      ))}
      {area.boundaries?.map((points, index) => (
        <Line
          key={index}
          points={[...points, points[0]].map(feet)}
          color="#80664d"
          lineWidth={2}
          dashed
          dashSize={0.06}
          gapSize={0.035}
          renderOrder={9}
          depthTest={false}
          depthWrite={false}
          raycast={() => null}
        />
      ))}
      {area.lines?.map((line, index) => (
        <Line
          key={index}
          points={line.map(feet)}
          color="#aa4421"
          lineWidth={4}
          renderOrder={9}
          depthTest={false}
          depthWrite={false}
          raycast={() => null}
        />
      ))}
      {area.referenceLines?.map((line, index) => (
        <Line key={index} points={line.map(feet)} color="#286985" lineWidth={5}
          renderOrder={10} depthTest={false} depthWrite={false} raycast={() => null} />
      ))}
      <Html
        center
        position={feet(area.labelPoint)}
        zIndexRange={[35, 0]}
        style={{ pointerEvents: "none" }}
      >
        <span
          className={`site-clearance-marker${reference ? "" : " check-area-marker"}`}
          data-testid={`${area.kind ?? "ceiling-gap"}-marker`}
          data-contact-patches={bearing ? outlines.length : undefined}
          data-span-lines={area.kind === "seat-span" || area.kind === "shelf-span" ? area.lines?.length : undefined}
          data-pin-reaches={area.kind === "shelf-span" ? area.referenceLines?.length : undefined}
        >
          {area.label}
        </span>
      </Html>
    </group>
  );
}
