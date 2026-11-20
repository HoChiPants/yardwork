import { useMemo } from "react";
import { Html, Line } from "@react-three/drei";
import type { Project, V3 } from "./model";
import { lidHingeReviews } from "./hinges";

const feet = (point: V3) => point.map((value) => value / 12) as V3;
const datumColor = "#b87923",
  axisColor = "#527c86";
const labelStyle = {
  display: "block",
  padding: "2px 4px",
  borderRadius: 3,
  border: "1px solid white",
  color: "white",
  fontSize: 10,
  whiteSpace: "nowrap" as const,
};

/** Entered closed-assembly datums only; no manufactured hinge, screw or hole geometry. */
export function HingeMarkers({
  project,
  sectionId,
}: {
  project: Project;
  sectionId: string | null;
}) {
  const section = project.sections.find((row) => row.id === sectionId);
  const reviews = useMemo(() => {
    if (!sectionId || section?.recipe?.lidOpen) return [];
    try {
      return lidHingeReviews(project).filter(
        (review) => review.plan.sectionId === sectionId,
      );
    } catch {
      return [];
    }
  }, [project, sectionId, section?.recipe?.lidOpen]);
  if (!section || section.recipe?.lidOpen) return null;
  return (
    <group name="measured-hinge-datums">
      {reviews.map((review) => {
        const { plan } = review,
          axis = review.state === "stale" ? null : review.resolvedAxis,
          end = axis
            ? (axis.pivot.map((n, i) => n + axis.axis[i] * axis.length) as V3)
            : null,
          middle =
            axis && end
              ? (axis.pivot.map((n, i) => (n + end[i]) / 2) as V3)
              : null,
          holesVisible =
            review.state !== "stale" && review.state !== "conflict";
        return (
          <group key={plan.id}>
            {axis && end && middle && (
              <>
                <Line
                  points={[feet(axis.pivot), feet(end)]}
                  color={axisColor}
                  dashed
                  dashSize={0.06}
                  gapSize={0.035}
                  lineWidth={1.5}
                  depthTest={false}
                  renderOrder={1200}
                  raycast={() => null}
                />
                <Html
                  position={feet(middle)}
                  center
                  zIndexRange={[32, 0]}
                  style={{ pointerEvents: "none" }}
                >
                  <span
                    data-testid="hinge-axis-marker"
                    data-plan-id={plan.id}
                    data-label={plan.label}
                    data-state={review.state}
                    data-pivot={JSON.stringify(axis.pivot)}
                    data-axis={JSON.stringify(axis.axis)}
                    data-endpoint={JSON.stringify(end)}
                    data-length={axis.length}
                    title={`${plan.label} · entered closed-assembly axis datum; not hinge body or installation approval`}
                    style={{ ...labelStyle, background: axisColor }}
                  >
                    {plan.label} axis datum
                  </span>
                </Html>
              </>
            )}
            {holesVisible &&
              review.locations.map((point) => {
                if (
                  !point.entranceWorld ||
                  point.state === "stale" ||
                  point.state === "conflict"
                )
                  return null;
                const label = `${plan.label}/${point.location.label}`,
                  entrance = feet(point.entranceWorld);
                return (
                  <group key={point.location.id}>
                    {point.tipWorld && (
                      <Line
                        points={[entrance, feet(point.tipWorld)]}
                        color={datumColor}
                        dashed
                        dashSize={0.025}
                        gapSize={0.02}
                        lineWidth={1.5}
                        depthTest={false}
                        renderOrder={1200}
                        raycast={() => null}
                      />
                    )}
                    {point.pilotTipWorld && (
                      <Line
                        points={[entrance, feet(point.pilotTipWorld)]}
                        color={axisColor}
                        dashed
                        dashSize={0.015}
                        gapSize={0.025}
                        lineWidth={1}
                        depthTest={false}
                        renderOrder={1201}
                        raycast={() => null}
                      />
                    )}
                    <Html
                      position={entrance}
                      center
                      zIndexRange={[34, 0]}
                      style={{ pointerEvents: "none" }}
                    >
                      <span
                        data-testid="hinge-entry-marker"
                        data-plan-id={plan.id}
                        data-location-id={point.location.id}
                        data-label={label}
                        data-leaf={point.location.leaf}
                        data-position={JSON.stringify(point.entranceWorld)}
                        data-state={point.state}
                        title={`${label} · entered closed-assembly wood entrance · ${point.state}; not a drilled hole`}
                        style={{ ...labelStyle, background: datumColor }}
                      >
                        {label}
                      </span>
                    </Html>
                    {point.tipWorld && (
                      <Html
                        position={feet(point.tipWorld)}
                        center
                        zIndexRange={[35, 0]}
                        style={{ pointerEvents: "none" }}
                      >
                        <span
                          data-testid="hinge-tip-marker"
                          data-plan-id={plan.id}
                          data-location-id={point.location.id}
                          data-label={label}
                          data-position={JSON.stringify(point.tipWorld)}
                          data-state={point.state}
                          title={`${label} · user-entered seated-depth candidate tip`}
                          style={{
                            display: "block",
                            width: 7,
                            height: 7,
                            border: `2px solid ${datumColor}`,
                            borderRadius: "50%",
                            background: "white",
                          }}
                        />
                      </Html>
                    )}
                    {point.pilotTipWorld && (
                      <Html
                        position={feet(point.pilotTipWorld)}
                        center
                        zIndexRange={[36, 0]}
                        style={{ pointerEvents: "none" }}
                      >
                        <span
                          data-testid="hinge-pilot-tip-marker"
                          data-plan-id={plan.id}
                          data-location-id={point.location.id}
                          data-label={label}
                          data-position={JSON.stringify(point.pilotTipWorld)}
                          data-state={point.state}
                          title={`${label} · user-entered deepest pilot-drill-tip candidate`}
                          style={{
                            display: "block",
                            width: 6,
                            height: 6,
                            border: `1px solid ${axisColor}`,
                            background: "white",
                            transform: "rotate(45deg)",
                          }}
                        />
                      </Html>
                    )}
                  </group>
                );
              })}
          </group>
        );
      })}
    </group>
  );
}
