import { useEffect, useMemo } from "react";
import { Html, Line } from "@react-three/drei";
import { ArrowHelper, Vector3 } from "three";
import type { Project, V3 } from "./model";
import { connectorReviews, type ConnectorReview } from "./connectors";

const feet = (point: V3) => point.map((n) => n / 12) as V3;

/** Fixed-size direction symbol. Its length has no fastener or penetration meaning. */
function DirectionSymbol({
  entrance,
  drive,
  color,
}: {
  entrance: V3;
  drive: V3;
  color: string;
}) {
  const arrow = useMemo(() => {
    const result = new ArrowHelper(
      new Vector3(...drive),
      new Vector3(...feet(entrance)),
      0.15,
      color,
      0.04,
      0.02,
    );
    result.traverse((object) => {
      object.raycast = () => {};
    });
    for (const part of [result.line, result.cone]) {
      part.renderOrder = 1200;
      for (const material of Array.isArray(part.material)
        ? part.material
        : [part.material]) {
        material.depthTest = false;
        material.transparent = true;
        material.opacity = 0.7;
      }
    }
    return result;
  }, [entrance, drive, color]);
  useEffect(() => () => arrow.dispose(), [arrow]);
  return <primitive object={arrow} />;
}

/** Entered wood datums only: never manufactured angle, leaf, screw, nail or hole geometry. */
export function ConnectorMarkers({
  project,
  selectedPlanId,
  review: draftReview,
  focusedEntryId,
}: {
  project: Project;
  selectedPlanId?: string | null;
  review?: ConnectorReview | null;
  focusedEntryId?: string | null;
}) {
  const review = useMemo(() => {
    // An editor explicitly clears its preview while fields are invalid or incomplete.
    // Only an omitted preview allows the independently saved review to be shown.
    if (draftReview !== undefined) return draftReview ?? undefined;
    try {
      const reviews = connectorReviews(project);
      return selectedPlanId
        ? reviews.find((row) => row.plan.id === selectedPlanId)
        : reviews[0];
    } catch {
      return;
    }
  }, [project, selectedPlanId, draftReview]);
  if (!review) return null;
  const captionId =
    review.entries.find(
      (point) => point.entry.id === focusedEntryId && point.entranceWorld,
    )?.entry.id ??
    review.entries.find((point) => point.entranceWorld)?.entry.id;
  return (
    <group name="planned-connector-wood-entries">
      {review.entries.map((point) => {
        if (!point.entranceWorld) return null;
        const label = `${review.plan.label}/${point.entry.label}`,
          stale = review.state === "stale" || point.state === "stale",
          tip = stale ? null : point.tipWorld,
          pilot = stale ? null : point.pilotTipWorld,
          color = stale || point.state === "conflict" ? "#b84f3e" : "#c58b32",
          directionOnly = !!point.driveWorld && !tip,
          caption = point.entry.id === captionId;
        return (
          <group key={point.entry.id}>
            {tip && (
              <Line
                points={[feet(point.entranceWorld), feet(tip)]}
                dashed
                color={color}
                dashSize={0.035}
                gapSize={0.025}
                lineWidth={1.5}
                depthTest={false}
                renderOrder={1200}
                raycast={() => null}
              />
            )}
            {pilot && (
              <Line
                points={[feet(point.entranceWorld), feet(pilot)]}
                dashed
                color="#557e86"
                dashSize={0.015}
                gapSize={0.025}
                lineWidth={1}
                depthTest={false}
                renderOrder={1201}
                raycast={() => null}
              />
            )}
            {directionOnly && (
              <DirectionSymbol
                entrance={point.entranceWorld}
                drive={point.driveWorld!}
                color={color}
              />
            )}
            <Html
              position={feet(point.entranceWorld)}
              zIndexRange={[35, 0]}
              style={{ pointerEvents: "none" }}
            >
              <span
                data-testid="connector-entry-marker"
                data-plan-id={review.plan.id}
                data-entry-id={point.entry.id}
                data-label={label}
                data-role={point.entry.role}
                data-member-id={point.memberId}
                data-position={JSON.stringify(point.entranceWorld)}
                data-drive={JSON.stringify(point.driveWorld)}
                data-state={point.state}
                data-orientation-only={directionOnly}
                data-caption={caption}
                title={`${label} · entered wood entry · ${point.state}${directionOnly ? "; direction symbol only, depth unknown" : "; candidate path, not installed hardware"}`}
                style={{
                  display: "block",
                  position: "relative",
                  transform: "translate(-50%, -50%)",
                  width: 8,
                  height: 8,
                  border: "1px solid white",
                  borderRadius: "50%",
                  background: color,
                }}
              >
                {caption && (
                  <span
                    data-testid="connector-entry-caption"
                    style={{
                      position: "absolute",
                      right: 0,
                      top: 11,
                      display: "block",
                      padding: "2px 4px",
                      border: "1px solid white",
                      borderRadius: 3,
                      background: color,
                      color: "white",
                      fontSize: 10,
                      whiteSpace: "nowrap",
                    }}
                  >
                    {label}
                    {directionOnly ? " · direction only" : ""}
                    {stale ? " · stale" : ""}
                  </span>
                )}
              </span>
            </Html>
            {tip && (
              <Html
                position={feet(tip)}
                center
                zIndexRange={[34, 0]}
                style={{ pointerEvents: "none" }}
              >
                <span
                  data-testid="connector-tip-marker"
                  data-plan-id={review.plan.id}
                  data-entry-id={point.entry.id}
                  data-label={label}
                  data-position={JSON.stringify(tip)}
                  data-state={point.state}
                  title={`${label} · user-entered wood-depth candidate tip; mounting fit pending`}
                  style={{
                    display: "block",
                    width: 7,
                    height: 7,
                    border: `2px solid ${color}`,
                    borderRadius: "50%",
                    background: "white",
                  }}
                />
              </Html>
            )}
            {pilot && (
              <Html
                position={feet(pilot)}
                center
                zIndexRange={[34, 0]}
                style={{ pointerEvents: "none" }}
              >
                <span
                  data-testid="connector-pilot-tip-marker"
                  data-plan-id={review.plan.id}
                  data-entry-id={point.entry.id}
                  data-label={label}
                  data-position={JSON.stringify(pilot)}
                  data-state={point.state}
                  title={`${label} · deepest pilot-drill-tip candidate, not a full bore setting`}
                  style={{
                    display: "block",
                    width: 5,
                    height: 5,
                    border: "1px solid #557e86",
                    background: "white",
                  }}
                />
              </Html>
            )}
          </group>
        );
      })}
    </group>
  );
}
