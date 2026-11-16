import { Euler, Quaternion, Vector3 } from "three";
import type { V3 } from "./model";
export function rotate(v: V3, r: V3): V3 {
  return new Vector3(...v)
    .applyEuler(new Euler(...r))
    .toArray()
    .map((v) => (Math.abs(v) < 1e-12 ? 0 : v)) as V3;
}
export function composeRotation(a: V3, b: V3): V3 {
  const q = new Quaternion()
    .setFromEuler(new Euler(...a))
    .multiply(new Quaternion().setFromEuler(new Euler(...b)));
  const e = new Euler().setFromQuaternion(q);
  return [e.x, e.y, e.z].map((v) => (Math.abs(v) < 1e-12 ? 0 : v)) as V3;
}
export function inverseRotation(r: V3): V3 {
  const e = new Euler().setFromQuaternion(
    new Quaternion().setFromEuler(new Euler(...r)).invert(),
  );
  return [e.x, e.y, e.z].map((v) => (Math.abs(v) < 1e-12 ? 0 : v)) as V3;
}
