import { Html, Line } from "@react-three/drei";
import type { V3 } from "./model";
import type { reviewGreenhouseFoundation } from "./greenhouseFoundation";

export function GreenhouseFoundationMarker({
  review,
}: {
  review: ReturnType<typeof reviewGreenhouseFoundation>;
}) {
  const { site, edges, fitCount, anchors } = review;
  const y = site.topY / 12 + 0.004;
  const point = (x: number, z: number): V3 => [x / 12, y, z / 12];
  const fit = fitCount === 4;
  return (
    <group>
      <Line
        points={[
          point(edges.left, edges.back),
          point(edges.right, edges.back),
          point(edges.right, edges.front),
          point(edges.left, edges.front),
          point(edges.left, edges.back),
        ]}
        lineWidth={3}
        color={fit ? "#35748c" : "#ba4c2b"}
        depthTest={false}
        raycast={() => null}
      />
      {anchors?.rows.map(({ mark, issues }) => (
        <Line
          key={mark.id}
          points={[[mark.x / 12, y + 0.12, mark.z / 12], point(mark.x, mark.z)]}
          lineWidth={5}
          color={issues.length ? "#ba4c2b" : "#147884"}
          depthTest={false}
          raycast={() => null}
        />
      ))}
      {!!anchors?.rows.length && (
        <Html
          center
          position={point(site.centerX, edges.back)}
          zIndexRange={[35, 0]}
          style={{ pointerEvents: "none" }}
        >
          <span
            className="site-clearance-marker"
            data-testid="greenhouse-anchor-markers"
          >
            {anchors.rows.filter(({ issues }) => !issues.length).length}/
            {anchors.rows.length} anchor marks pass layout checks
          </span>
        </Html>
      )}
      <Html
        center
        position={point(site.centerX, edges.front)}
        zIndexRange={[35, 0]}
        style={{ pointerEvents: "none" }}
      >
        <span
          className={`site-clearance-marker${fit ? "" : " check-area-marker"}`}
          data-testid="greenhouse-foundation-marker"
        >
          Foundation · {fitCount}/4 rails fit
        </span>
      </Html>
    </group>
  );
}
