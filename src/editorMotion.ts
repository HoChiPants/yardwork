/** Screen-up raises world Y even when the current view is looking down at the work. */
export function liftDistanceInches(
  pixels: number,
  distanceFeet: number,
  heightPixels: number,
  fovDegrees: number,
) {
  if (
    ![pixels, distanceFeet, heightPixels, fovDegrees].every(Number.isFinite) ||
    heightPixels <= 0 ||
    distanceFeet <= 0 ||
    fovDegrees <= 0 ||
    fovDegrees >= 179
  )
    throw Error("Lift needs a finite camera scale.");
  return (
    (-pixels * 24 * distanceFeet * Math.tan((fovDegrees * Math.PI) / 360)) /
    heightPixels
  );
}
