import { useEffect, useState } from "react";
import { useThree } from "@react-three/fiber";
import { SRGBColorSpace, Texture, TextureLoader } from "three";
import { drawingReferenceSize, type DrawingReference } from "./drawingReference";

export function DrawingReferenceMesh({ drawing }: { drawing: DrawingReference }) {
  const [loaded, setLoaded] = useState<{ texture: Texture; source: string } | null>(null);
  const { gl, invalidate } = useThree();
  const { image, calibration } = drawing;
  const { width, depth } = drawingReferenceSize(drawing, calibration);
  const { angle, center, opacity } = calibration;
  const texture = loaded?.source === image ? loaded.texture : null;
  useEffect(() => {
    let active = true;
    const resource = new TextureLoader().load(image, (next) => {
      if (!active) return;
      next.colorSpace = SRGBColorSpace;
      setLoaded({ texture: next, source: image });
      invalidate();
    }, undefined, () => {});
    return () => {
      active = false;
      resource.dispose();
    };
  }, [image, invalidate]);
  useEffect(() => {
    if (!texture) return;
    gl.domElement.dataset.drawingReference = JSON.stringify({ width, depth, angle, center });
    return () => { delete gl.domElement.dataset.drawingReference; };
  }, [gl, texture, width, depth, angle, center]);
  if (!texture) return null;
  return (
    <group position={[center[0] / 12, -0.017, center[1] / 12]} rotation={[0, -angle * Math.PI / 180, 0]}>
      <mesh rotation={[-Math.PI / 2, 0, 0]} raycast={() => null}>
        <planeGeometry args={[width / 12, depth / 12]} />
        <meshBasicMaterial map={texture} opacity={opacity} transparent depthWrite={false} fog={false} toneMapped={false} />
      </mesh>
    </group>
  );
}
