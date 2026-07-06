import { Cartesian3 } from "cesium";

/**
 * 두 점 간 직선거리 (m). 3D 사거리.
 *
 */
export function getDistance(p1: Cartesian3, p2: Cartesian3): number {
  return Cartesian3.distance(p1, p2);
}

/**
 * 인접 점들 간 직선거리 합 (m).
 * 점이 2개 미만이면 0.
 */
export function getTotalDistance(positions: readonly Cartesian3[]): number {
  if (positions.length < 2) return 0;
  let total = 0;
  for (let i = 0; i < positions.length - 1; i++) {
    total += getDistance(positions[i], positions[i + 1]);
  }
  return total;
}
