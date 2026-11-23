import { z } from "zod";

const offset = z.number().finite().min(-480).max(480);
export const installationWaypoint = z.strictObject({
  x: offset,
  y: offset,
  z: offset,
  yaw: z.number().finite().min(-180).max(180),
});
export type InstallationWaypoint = z.infer<typeof installationWaypoint>;
const distinctIds = z.array(z.uuid()).max(100).refine((ids) => new Set(ids).size === ids.length, "Use each part once.");
export const installationRoute = z.strictObject({
  id: z.uuid(),
  name: z.string().trim().min(1).max(80),
  target: z.strictObject({ kind: z.enum(["section", "design"]), id: z.uuid() }),
  waypoints: z.array(installationWaypoint).min(1).max(5).refine((points) => points.some(({ x, y, z, yaw }) =>
    x !== 0 || y !== 0 || z !== 0 || yaw !== 0), "Enter a starting pose or waypoint away from the final pose."),
  defer: distinctIds,
  ceiling: z.number().finite().positive().max(480).optional(),
  door: z.strictObject({ id: z.uuid(), angle: z.number().finite().positive().max(360) }).optional(),
});
export type InstallationRoute = z.infer<typeof installationRoute>;
export const installationRoutesSchema = z.array(installationRoute).max(24).refine((rows) =>
  new Set(rows.map(({ id }) => id)).size === rows.length, "Each installation route needs a distinct ID.");
