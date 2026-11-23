import { useEffect, useMemo } from "react";
import { Html, Line } from "@react-three/drei";
import {
  BufferGeometry,
  DoubleSide,
  EdgesGeometry,
  Float32BufferAttribute,
} from "three";
import type { Piece, Project, V3 } from "./model";
import { clipBox, triangulateSolid } from "./cutProfiles";
import {
  resolveFittedStockFace,
  type FittedFaceRef,
  type FittedStockPreview,
} from "./fittedStock";
import { formatPreciseInches } from "./measurement";
import { pieceThroughOpenings, throughOpeningTriangles } from "./throughOpenings";

const feet = (point: V3) => point.map((value) => value / 12) as V3;

function SelectedFace({ vertices, color }: { vertices: V3[]; color: string }) {
  const geometry = useMemo(() => {
    const positions: number[] = [];
    for (let i = 1; i + 1 < vertices.length; i++)
      for (const point of [vertices[0], vertices[i], vertices[i + 1]])
        positions.push(...feet(point));
    const result = new BufferGeometry();
    result.setAttribute("position", new Float32BufferAttribute(positions, 3));
    result.computeVertexNormals();
    return result;
  }, [vertices]);
  useEffect(() => () => geometry.dispose(), [geometry]);
  if (vertices.length < 3) return null;
  return (
    <group>
      <mesh geometry={geometry} renderOrder={1200} raycast={() => null}>
        <meshBasicMaterial
          color={color}
          transparent
          opacity={0.25}
          side={DoubleSide}
          depthTest={false}
          depthWrite={false}
        />
      </mesh>
      <Line
        points={[...vertices, vertices[0]].map(feet)}
        color={color}
        lineWidth={2}
        depthTest={false}
        renderOrder={1201}
        raycast={() => null}
      />
    </group>
  );
}

export function StockGhost({ piece }: { piece: Piece }) {
  const { geometry, outline } = useMemo(() => {
    const openings = pieceThroughOpenings(piece);
    const triangles = openings.length
      ? throughOpeningTriangles(piece.size, openings)
      : triangulateSolid(clipBox(piece.size, piece.cutPlanes));
    const geometry = new BufferGeometry();
    geometry.setAttribute(
      "position",
      new Float32BufferAttribute(
        triangles.positions.map((value) => value / 12),
        3,
      ),
    );
    geometry.setAttribute(
      "normal",
      new Float32BufferAttribute(triangles.normals, 3),
    );
    return { geometry, outline: new EdgesGeometry(geometry) };
  }, [piece]);
  useEffect(
    () => () => {
      geometry.dispose();
      outline.dispose();
    },
    [geometry, outline],
  );
  return (
    <group position={feet(piece.position)} rotation={piece.rotation}>
      <mesh geometry={geometry} renderOrder={1100} raycast={() => null}>
        <meshBasicMaterial
          color="#35c6d0"
          transparent
          opacity={0.68}
          depthWrite={false}
          depthTest={false}
        />
      </mesh>
      <lineSegments geometry={outline} renderOrder={1101} raycast={() => null}>
        <lineBasicMaterial
          color="#063f4b"
          depthTest={false}
          depthWrite={false}
        />
      </lineSegments>
    </group>
  );
}

/** Transient source-backed geometry only; selected polygons never create parts. */
export function FittedStockGeometry({
  project,
  preview,
  faces,
}: {
  project: Project;
  preview: FittedStockPreview | null;
  faces: { first: FittedFaceRef | null; second: FittedFaceRef | null };
}) {
  const polygons = useMemo(
    () =>
      [faces.first, faces.second].map((ref) => {
        if (!ref) return null;
        try {
          return resolveFittedStockFace(project, ref);
        } catch {
          return null;
        }
      }),
    [project, faces],
  );
  const piece = preview?.project.pieces.find(
    (part) => part.id === preview.blockId,
  );
  return (
    <group name="fitted-stock-preview">
      {polygons.map(
        (face, index) =>
          face && (
            <SelectedFace
              key={index}
              vertices={face.verticesWorld}
              color={index === 0 ? "#278aa1" : "#668a3c"}
            />
          ),
      )}
      {piece && preview && (
        <>
          <StockGhost piece={piece} />
          {[
            preview.endFootprintsWorld.first,
            preview.endFootprintsWorld.second,
          ].map((corners, index) => (
            <Line
              key={index}
              points={[...corners, corners[0]].map(feet)}
              color="#063f4b"
              lineWidth={2}
              depthTest={false}
              renderOrder={1202}
              raycast={() => null}
            />
          ))}
          <Html
            position={feet(piece.position)}
            center
            zIndexRange={[35, 0]}
            style={{ pointerEvents: "none" }}
          >
            <span
              className="fitted-stock-ghost-label"
              data-testid="fitted-stock-ghost"
              data-piece-id={piece.id}
              data-size={JSON.stringify(piece.size)}
              data-position={JSON.stringify(piece.position)}
              data-rotation={JSON.stringify(piece.rotation)}
              data-cut-length={preview.cutLength}
              data-source-length={preview.sourceLength}
            >
              Fitted block · {formatPreciseInches(preview.cutLength)}
            </span>
          </Html>
        </>
      )}
    </group>
  );
}
