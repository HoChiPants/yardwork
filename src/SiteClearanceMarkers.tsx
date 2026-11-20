import { Html, Line } from "@react-three/drei";
import { bounds } from "./engine";
import type { Project, V3 } from "./model";
import {
  clearanceAxis,
  reviewSiteClearance,
  siteClearanceMembers,
} from "./siteClearance";

export function SiteClearanceMarkers({
  project,
  id,
  shortfall,
}: {
  project: Project;
  id: string;
  shortfall?: boolean;
}) {
  const plane = project.siteClearances?.find((item) => item.id === id);
  if (!plane) return null;
  const { pieces } = siteClearanceMembers(project, plane);
  if (!pieces.length && plane.bindingId !== null) return null;
  const short =
    shortfall ?? reviewSiteClearance(project, plane).status === "short";
  const axis = clearanceAxis(plane.side);
  const across = axis === 0 ? 2 : 0;
  const boxes = pieces.map(bounds);
  const zone = plane.bindingId === null ? project.workZone : null;
  const span = zone
    ? (across === 0 ? zone.width : zone.depth) / 2
    : pieces.length
      ? null
      : 12;
  const left =
    Math.min(
      span === null ? Infinity : -span,
      ...boxes.map((box) => box.min[across]),
    ) - 2;
  const right =
    Math.max(span ?? -Infinity, ...boxes.map((box) => box.max[across])) + 2;
  const top =
    plane.top ??
    Math.max(12, zone?.height ?? 0, ...boxes.map((box) => box.max[1]));
  const point = (coordinate: number, lateral: number, height: number): V3 =>
    axis === 0
      ? [coordinate / 12, height / 12, lateral / 12]
      : [lateral / 12, height / 12, coordinate / 12];
  const rectangle = (coordinate: number): V3[] => [
    point(coordinate, left, 0.04),
    point(coordinate, right, 0.04),
    point(coordinate, right, top),
    point(coordinate, left, top),
    point(coordinate, left, 0.04),
  ];
  const limit =
    plane.coordinate + (plane.side.startsWith("+") ? -1 : 1) * plane.minimum;
  return (
    <group>
      <Line
        points={rectangle(plane.coordinate)}
        lineWidth={2}
        color={short && plane.minimum === 0 ? "#ba4c2b" : "#35748c"}
        raycast={() => null}
      />
      {plane.minimum > 0 && (
        <Line
          points={rectangle(limit)}
          color={short ? "#ba4c2b" : "#66884d"}
          dashed
          dashSize={0.12}
          gapSize={0.08}
          lineWidth={2}
          raycast={() => null}
        />
      )}
      <Html
        center
        position={point(plane.coordinate, (left + right) / 2, top)}
        zIndexRange={[35, 0]}
        style={{ pointerEvents: "none" }}
      >
        <span
          className="site-clearance-marker"
          data-testid="site-clearance-marker"
        >
          {plane.label}
        </span>
      </Html>
    </group>
  );
}
