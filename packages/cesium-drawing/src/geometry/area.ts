import { Cartesian3, Ellipsoid, EllipsoidTangentPlane, Math as CesiumMath } from "cesium";
import type { Viewer } from "cesium";

/**
 * 폴리곤 면적 (㎡).
 */
export function getArea(viewer: Viewer, positions: readonly Cartesian3[]): number {
  if (positions.length < 3) return 0;

  const ellipsoid = viewer.scene.globe?.ellipsoid ?? Ellipsoid.WGS84;

  let pts: readonly Cartesian3[] = positions;
  if (
    pts.length > 2 &&
    Cartesian3.equalsEpsilon(pts[0], pts[pts.length - 1], CesiumMath.EPSILON10)
  ) {
    pts = pts.slice(0, -1);
  }

  const plane = EllipsoidTangentPlane.fromPoints(pts as Cartesian3[], ellipsoid);
  if (!plane) return 0;

  const projected = plane.projectPointsOntoPlane(pts as Cartesian3[]);

  let area = 0;
  for (let i = 0; i < projected.length; i++) {
    const j = (i + 1) % projected.length;
    area += projected[i].x * projected[j].y - projected[j].x * projected[i].y;
  }
  return Math.abs(area * 0.5);
}
