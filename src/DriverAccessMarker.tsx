import { Edges, Html } from "@react-three/drei";
import type { DriverAccessLocation } from "./fastenerAccess";
import type { V3 } from "./model";

const feet = (v: V3) => v.map((n) => n / 12) as V3;

export function DriverAccessMarker({ row }: { row: DriverAccessLocation }) {
  const color = row.state === "clear" ? "#1587a8" : "#c25b35";
  return (
    <group>
      {row.envelopes.map(({ center, rotation, size }, index) => (
        <mesh
          key={index}
          position={feet(center)}
          rotation={rotation}
          raycast={() => null}
        >
          <boxGeometry args={feet(size)} />
          <meshBasicMaterial
            color={color}
            transparent
            opacity={0.24}
            depthWrite={false}
          />
          <Edges
            color={color}
            lineWidth={2}
            depthTest={false}
            depthWrite={false}
          />
          {index === 1 && (
            <Html
              center
              position={[0, size[1] / 24 + 0.2, 0]}
              style={{ pointerEvents: "none" }}
            >
              <span
                className="site-clearance-marker"
                data-testid="driver-approach-marker"
                data-state={row.state}
              >
                {row.label} · Tool approach
              </span>
            </Html>
          )}
        </mesh>
      ))}
    </group>
  );
}
