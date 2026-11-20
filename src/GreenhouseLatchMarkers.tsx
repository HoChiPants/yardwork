import { Html, Line } from "@react-three/drei";
import { reviewGreenhouseLatch } from "./greenhouseLatch";
import type { Project, V3 } from "./model";
import { partLabel } from "./partLabels";

const feet = (point: V3) => point.map((value) => value / 12) as V3;

export function GreenhouseLatchMarkers({
  project,
  motionId,
}: {
  project: Project;
  motionId: string;
}) {
  const plan = project.greenhouseLatchPlans?.find(
    (row) => row.motionId === motionId,
  );
  if (!plan) return null;
  const review = reviewGreenhouseLatch(project, plan);
  if (review.state === "stale") return null;
  return (
    <group>
      {review.mounts.map(
        ({ role, piece, origin, targetWorld, outline, holes }) => {
          const conflict = holes.state === "conflict" || !review.aligned;
          const color = conflict ? "#bf4d31" : "#16a2c8";
          const start = feet(origin);
          const label: V3 = [
            start[0],
            start[1] + (role === "latch" ? 0.45 : -0.45),
            start[2],
          ];
          return (
            <group key={role}>
              <Line
                points={[...outline, outline[0]].map(feet)}
                color={color}
                lineWidth={3}
                depthTest={false}
                depthWrite={false}
                raycast={() => null}
              />
              <Line
                points={[start, label]}
                color={color}
                depthTest={false}
                raycast={() => null}
              />
              <Line
                points={[start, feet(targetWorld)]}
                color={color}
                depthTest={false}
                raycast={() => null}
              />
              {holes.marks.map((mark) => (
                <Line
                  key={mark.index}
                  points={mark.line.map(feet)}
                  color={mark.issues.length ? "#bf4d31" : "#1a886c"}
                  lineWidth={5}
                  depthTest={false}
                  depthWrite={false}
                  raycast={() => null}
                />
              ))}
              <Html center position={label} style={{ pointerEvents: "none" }}>
                <span
                  className="site-clearance-marker"
                  data-testid={`greenhouse-latch-${role}`}
                  data-state={conflict ? "conflict" : "checked"}
                >
                  {partLabel(project, piece.id)} ·{" "}
                  {role === "latch" ? "Jamb latch" : "Door keeper"} ·{" "}
                  {holes.marks.length} marks
                </span>
              </Html>
            </group>
          );
        },
      )}
    </group>
  );
}
