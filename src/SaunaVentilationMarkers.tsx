import { Html, Line } from "@react-three/drei";
import type { V3 } from "./model";
import {
  saunaVentNames,
  type SaunaVentilationReview,
} from "./saunaVentilation";

export function SaunaVentilationMarkers({
  review,
}: {
  review: SaunaVentilationReview;
}) {
  const scaled = (point: V3) => point.map((value) => value / 12) as V3;
  return review.openings.map(
    ({ kind, inside, outside, centerLine, obstructions }) => {
      const color = obstructions.length ? "#ba4c2b" : "#2382a5";
      return (
        <group key={kind}>
          {[inside, outside].map((ring, index) => (
            <Line
              key={index}
              points={[...ring, ring[0]].map(scaled)}
              color={color}
              lineWidth={2}
              depthTest={false}
              raycast={() => null}
            />
          ))}
          <Line
            points={centerLine.map(scaled)}
            color={color}
            lineWidth={2}
            dashed
            dashSize={0.12}
            gapSize={0.08}
            depthTest={false}
            raycast={() => null}
          />
          <Html
            center
            position={scaled(centerLine[1])}
            zIndexRange={[35, 0]}
            style={{ pointerEvents: "none" }}
          >
            <span
              className="site-clearance-marker"
              data-testid="sauna-vent-marker"
            >
              {saunaVentNames[kind]}
            </span>
          </Html>
        </group>
      );
    },
  );
}
