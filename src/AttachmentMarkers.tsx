import { useMemo } from "react";
import { Html, Line } from "@react-three/drei";
import type { Project, V3 } from "./model";
import { attachmentReviews, type AttachmentState } from "./attachments";

export type AttachmentMarkersProps = {
  project: Project;
  readOnly?: boolean;
  selectedPlanId?: string | null;
  onSelectPlan?: (id: string | null) => void;
  onSelectPart?: (id: string) => void;
};
const feet = (point: V3) => point.map((n) => n / 12) as V3;
const colorFor = (state: AttachmentState) =>
  state === "stale" || state === "conflict"
    ? "#c84c3a"
    : state === "needs-measurements"
      ? "#c78b21"
      : "#397e91";

/** Diagram markers only. Root mounts this inside the scene while the support pane is open. */
export function AttachmentMarkers({
  project,
  readOnly = false,
  selectedPlanId,
  onSelectPlan,
  onSelectPart,
}: AttachmentMarkersProps) {
  const reviews = useMemo(() => {
    try {
      return attachmentReviews(project);
    } catch {
      return [];
    }
  }, [project]);
  const visible = selectedPlanId
    ? reviews.filter((r) => r.plan.id === selectedPlanId)
    : reviews;
  return (
    <group name="planned-attachment-targets">
      {visible.flatMap((review) =>
        review.points.map((point) => {
          const bearing = feet(point.bearingTargetWorld),
            hole = point.holeCenterWorld ? feet(point.holeCenterWorld) : null,
            color = colorFor(point.state),
            label = `${point.point.shelf.role.replace(/^shelf-/, "Shelf ")} ${point.point.side} ${point.point.row}`;
          const choose = () => {
            onSelectPlan?.(review.plan.id);
            if (project.pieces.some((p) => p.id === point.point.shelf.pieceId))
              onSelectPart?.(point.point.shelf.pieceId);
          };
          const opacity = selectedPlanId ? 1 : 0.7;
          return (
            <group key={`${review.plan.id}/${point.point.id}`}>
              <Line
                points={[
                  [bearing[0] - 0.06, bearing[1], bearing[2]],
                  [bearing[0] + 0.06, bearing[1], bearing[2]],
                ]}
                color={color}
                lineWidth={1.5}
                transparent
                opacity={opacity}
                depthTest={false}
                renderOrder={1200}
                raycast={() => null}
              />
              <Line
                points={[
                  [bearing[0], bearing[1] - 0.06, bearing[2]],
                  [bearing[0], bearing[1] + 0.06, bearing[2]],
                ]}
                color={color}
                lineWidth={1.5}
                transparent
                opacity={opacity}
                depthTest={false}
                renderOrder={1200}
                raycast={() => null}
              />
              {!readOnly && (
                <Html
                  center
                  position={bearing}
                  zIndexRange={[30, 0]}
                  style={{ pointerEvents: "auto" }}
                >
                  <button
                    type="button"
                    className="attachment-target-marker"
                    data-testid="attachment-target-marker"
                    data-plan-id={review.plan.id}
                    data-point-id={point.point.id}
                    data-state={point.state}
                    aria-label={`Bearing target ${label}`}
                    title={`Planned bearing target · ${label} · ${point.state}`}
                    style={{
                      display: "block",
                      width: 16,
                      height: 16,
                      padding: 0,
                      border: "2px solid #fff",
                      borderRadius: "50%",
                      background: color,
                      opacity,
                      cursor: "pointer",
                      boxShadow: `0 0 0 1px ${color}`,
                    }}
                    onPointerDown={(event) => event.stopPropagation()}
                    onClick={(event) => {
                      event.stopPropagation();
                      choose();
                    }}
                  />
                </Html>
              )}
              {hole && (
                <>
                  {hole.some((n, i) => Math.abs(n - bearing[i]) > 0.000001) && (
                    <Line
                      points={[bearing, hole]}
                      color={color}
                      lineWidth={1}
                      dashed
                      dashSize={0.04}
                      gapSize={0.025}
                      depthTest={false}
                      renderOrder={1200}
                      raycast={() => null}
                    />
                  )}
                  {!readOnly && (
                    <Html
                      center
                      position={hole}
                      zIndexRange={[31, 0]}
                      style={{ pointerEvents: "auto" }}
                    >
                      <button
                        type="button"
                        className="attachment-hole-marker"
                        data-testid="attachment-hole-marker"
                        data-state={point.state}
                        aria-label={`Planned hole center ${label}`}
                        title={`Planned hole center · ${label}`}
                        style={{
                          display: "block",
                          width: 12,
                          height: 12,
                          padding: 0,
                          border: `2px solid ${color}`,
                          background: "#fff",
                          transform: "rotate(45deg)",
                          cursor: "pointer",
                          opacity,
                        }}
                        onPointerDown={(event) => event.stopPropagation()}
                        onClick={(event) => {
                          event.stopPropagation();
                          choose();
                        }}
                      />
                    </Html>
                  )}
                </>
              )}
            </group>
          );
        }),
      )}
    </group>
  );
}
