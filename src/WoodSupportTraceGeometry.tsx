import { Html, Line } from "@react-three/drei";
import type { V3 } from "./model";
import type { WoodSupportTrace } from "./woodSupport";

const feet = (point: V3) => point.map((value) => value / 12) as V3;

export function WoodSupportTraceGeometry({ trace }: { trace: WoodSupportTrace }) {
  return (
    <group>
      {trace.patches.map(({ outline, kind }, index) => (
        <Line
          key={index}
          points={[...outline, outline[0]].map(feet)}
          color={kind === "open" ? "#ad4828" : kind === "floor" ? "#175e48" : "#258e72"}
          lineWidth={kind === "floor" ? 5 : 3}
          dashed={kind === "open"}
          dashSize={0.08}
          gapSize={0.04}
          renderOrder={10}
          depthTest={false}
          depthWrite={false}
          raycast={() => null}
        />
      ))}
      {trace.stops.map(({ id, position, label, reason }) => (
        <Html key={id} center position={feet(position)} zIndexRange={[35, 0]}
          style={{ pointerEvents: "none" }}>
          <span className="site-clearance-marker check-area-marker" aria-hidden="true"
            data-testid="wood-support-stop">
            {label} · {reason}
          </span>
        </Html>
      ))}
    </group>
  );
}
