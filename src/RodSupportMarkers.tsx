import { Html, Line } from "@react-three/drei";
import { formatPreciseInches } from "./measurement";
import type { Project, V3 } from "./model";
import { reviewRodFit } from "./rodFits";
import { reviewRodSupports } from "./rodSupports";
import { partLabel } from "./partLabels";
import { reviewRodSocketPlates } from "./rodSocketPlates";
import { reviewRodBracketMount } from "./rodBracketMounts";

const feet = (point: V3) => point.map((value) => value / 12) as V3;

export function RodSupportMarkers({
  project,
  rodId,
}: {
  project: Project;
  rodId: string;
}) {
  const fit = reviewRodFit(project, rodId);
  const { rows } = reviewRodSupports(fit);
  const sockets = reviewRodSocketPlates(project, fit);
  return (
    <group>
      {sockets.map(({ side, center, outline, state, pieceId, holes }) => {
        if (!outline || !center) return null;
        const centerFeet = center.map((v) => v / 12) as V3;
        const label: V3 = [centerFeet[0], centerFeet[1] + 0.38, centerFeet[2]];
        const color = state === "conflict" ? "#ba4c2b" : "#287c9b";
        return (
          <group key={side}>
            <Line
              points={[...outline, outline[0]].map(
                (point) => point.map((v) => v / 12) as V3,
              )}
              lineWidth={3}
              color={color}
              depthTest={false}
              depthWrite={false}
              raycast={() => null}
            />
            <Line
              points={[centerFeet, label]}
              color={color}
              depthTest={false}
              raycast={() => null}
            />
            {holes?.marks.map((mark) => (
              <Line
                key={mark.index}
                points={mark.line.map(
                  (point) => point.map((n) => n / 12) as V3,
                )}
                color={mark.issues.length ? "#ba4c2b" : "#386e4d"}
                lineWidth={5}
                depthTest={false}
                depthWrite={false}
                renderOrder={10}
                raycast={() => null}
              />
            ))}
            <Html
              center
              position={label}
              zIndexRange={[35, 0]}
              style={{ pointerEvents: "none" }}
            >
              <span
                className="site-clearance-marker"
                data-testid={`rod-socket-marker-${side}`}
                data-state={state}
                data-hole-state={holes?.state}
                data-hole-count={holes?.marks.length}
              >
                {pieceId ? `${partLabel(project, pieceId)} · ` : ""}
                {side === "start" ? "Start" : "End"} socket
                {state === "conflict" && " · check backing"}
                {holes?.state === "conflict" && " · check holes"}
                {holes?.state === "checked" &&
                  ` · ${holes.marks.length} ${holes.marks.length === 1 ? "hole" : "holes"}`}
              </span>
            </Html>
          </group>
        );
      })}
      {rows
        .filter(({ state }) => state !== "stale")
        .map(({ support, state }) => {
          const mounting = reviewRodBracketMount(project, fit, support);
          const color =
            state === "conflict" || mounting?.state === "conflict"
              ? "#ba4c2b"
              : "#287c9b";
          const [x, y, z] = support.centerWorld.map(
            (coordinate) => coordinate / 12,
          );
          const base: V3 = [x, y, z];
          const label: V3 = [x, y + 0.4, z];
          return (
            <group key={support.id}>
              {mounting?.outline && (
                <Line
                  points={[...mounting.outline, mounting.outline[0]].map(feet)}
                  lineWidth={3}
                  color={color}
                  depthTest={false}
                  depthWrite={false}
                  raycast={() => null}
                />
              )}
              {mounting?.holes?.marks.map((mark) => (
                <Line
                  key={mark.index}
                  points={mark.line.map(feet)}
                  lineWidth={5}
                  color={mark.issues.length ? "#ba4c2b" : "#386e4d"}
                  depthTest={false}
                  depthWrite={false}
                  raycast={() => null}
                />
              ))}
              <Line
                points={[base, label]}
                lineWidth={2}
                color={color}
                raycast={() => null}
              />
              <Html
                center
                position={label}
                zIndexRange={[35, 0]}
                style={{ pointerEvents: "none" }}
              >
                <span
                  className="site-clearance-marker"
                  data-testid="rod-support-marker"
                  data-bracket-mount-state={mounting?.state}
                >
                  {formatPreciseInches(support.fromStart)} from start
                  {mounting?.state === "checked" &&
                    ` · ${mounting.holes.marks.length} bracket holes`}
                  {mounting?.state === "conflict" && " · Check bracket mount"}
                </span>
              </Html>
            </group>
          );
        })}
    </group>
  );
}
