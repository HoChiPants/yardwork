import { Html, Line } from "@react-three/drei";
import { reviewDrawerSlideMount } from "./drawerSlideMounts";
import type { Project, V3 } from "./model";
import { drawerSideLabels } from "./motionPlanSchema";
import { partLabel } from "./partLabels";

const feet = (point: V3) => point.map((value) => value / 12) as V3;

export function DrawerSlideMountMarkers({ project, motionId }: { project: Project; motionId: string }) {
  const mount = project.drawerSlideMounts?.find((row) => row.motionId === motionId);
  if (!mount) return null;
  const review = reviewDrawerSlideMount(project, mount);
  return (
    <group>
      {review.rails.map(({ key, piece, outline, center, holes }) => {
        const conflict = holes.state === "conflict";
        const start = feet(center);
        const label: V3 = [start[0], start[1] + (key.startsWith("cabinet") ? 0.32 : -0.32), start[2]];
        const color = conflict ? "#bf4d31" : "#1486a6";
        return (
          <group key={key}>
            <Line points={[...outline, outline[0]].map(feet)} color={color} lineWidth={2}
              depthTest={false} depthWrite={false} raycast={() => null} />
            <Line points={[start, label]} color={color} depthTest={false} raycast={() => null} />
            {holes.marks.map((mark) => (
              <Line key={mark.index} points={mark.line.map(feet)} color={conflict || mark.issues.length ? "#bf4d31" : "#1a886c"}
                lineWidth={5} depthTest={false} depthWrite={false} raycast={() => null} />
            ))}
            <Html center position={label} style={{ pointerEvents: "none" }}>
              <span className="site-clearance-marker" data-testid={`drawer-rail-${key}`} data-state={holes.state}>
                {partLabel(project, piece.id)} · {drawerSideLabels[key]} · {holes.marks.length} marks
              </span>
            </Html>
          </group>
        );
      })}
    </group>
  );
}
