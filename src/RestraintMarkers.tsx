import { useMemo } from "react";
import { Html, Line } from "@react-three/drei";
import type { Project, V3 } from "./model";
import { restraintReviews } from "./restraints";
const feet = (point: V3) => point.map((value) => value / 12) as V3;
/** Measured eye-center intent only; fittings and a cable route are not invented. */
export function RestraintMarkers({ project }: { project: Project }) {
  const reviews = useMemo(() => restraintReviews(project), [project]);
  return (
    <group name="planned-restraint-eye-centers">
      {reviews
        .filter(({ state }) => state === "needs-review")
        .flatMap(({ plan, screwLinks }) =>
          screwLinks.flatMap(({ id, label, paths }) =>
            paths.map(({ entry, tip }, index) => (
              <group key={`${plan.id}-${id}-${index}`}>
                <Line
                  points={[feet(entry), feet(tip)]}
                  color="#386e4d"
                  lineWidth={4}
                  depthTest={false}
                  depthWrite={false}
                  raycast={() => null}
                />
                {index === 0 && (
                  <Html
                    center
                    position={feet(entry)}
                    style={{ pointerEvents: "none" }}
                  >
                    <span
                      className="site-clearance-marker"
                      data-testid="restraint-screw-link"
                    >
                      {label}
                    </span>
                  </Html>
                )}
              </group>
            )),
          ),
        )}
      {reviews.flatMap((review) =>
        review.locations.map((item) => {
          const furniture = item.furnitureEyeWorld,
            wall = item.location.wallEyeWorld,
            color = review.state === "needs-review" ? "#b07819" : "#be4937";
          return (
            <group key={item.location.id}>
              {furniture && wall && (
                <Line
                  points={[feet(furniture), feet(wall)]}
                  color={color}
                  dashed
                  dashSize={0.08}
                  gapSize={0.05}
                  lineWidth={2}
                  depthTest={false}
                  raycast={() => null}
                />
              )}
              {(
                [
                  ["furniture", furniture],
                  ["wall", wall],
                ] as const
              ).map(
                ([end, point]) =>
                  point && (
                    <Html
                      key={end}
                      position={feet(point)}
                      center
                      style={{ pointerEvents: "none" }}
                      zIndexRange={[30, 0]}
                    >
                      <span
                        data-testid="restraint-eye-marker"
                        data-state={review.state}
                        title={`${item.location.name} · ${end} eye · ${review.state}`}
                        style={{
                          display: "block",
                          width: 14,
                          height: 14,
                          border: "2px solid white",
                          borderRadius: "50%",
                          background: color,
                          boxShadow: `0 0 0 1px ${color}`,
                        }}
                      />
                    </Html>
                  ),
              )}
            </group>
          );
        }),
      )}
    </group>
  );
}
