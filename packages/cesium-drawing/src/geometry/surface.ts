import { Cartographic, EllipsoidGeodesic } from "cesium";
import type { Cartesian3, Viewer } from "cesium";

import { getDistance } from "./distance";

/**
 * 두 점 간 타원체 표면거리 (m).
 * 지형 고도 무시 수평거리
 *
 *
 */
export function getSurfaceDistance(viewer: Viewer, p1: Cartesian3, p2: Cartesian3): number {
  const ellipsoid = viewer.scene.globe.ellipsoid;
  const c1 = Cartographic.fromCartesian(p1, ellipsoid);
  const c2 = Cartographic.fromCartesian(p2, ellipsoid);
  const geodesic = new EllipsoidGeodesic(c1, c2, ellipsoid);
  return geodesic.surfaceDistance;
}

/** positions 의 인접 점 간 surface distance 합 (m). */
export function getTotalSurfaceDistance(viewer: Viewer, positions: readonly Cartesian3[]): number {
  if (positions.length < 2) return 0;
  let total = 0;
  for (let i = 0; i < positions.length - 1; i++) {
    total += getSurfaceDistance(viewer, positions[i], positions[i + 1]);
  }
  return total;
}

export interface SlopeResult {
  /** 직선거리 (m) — 사거리 */
  distance: number;
  /** 표면거리 (m) — 수평거리 */
  surfaceDistance: number;
  /** 높이 차 (m). p2.height - p1.height */
  heightDiff: number;
  /** tan(θ) = heightDiff / surfaceDistance */
  slopeRatio: number;
  /** 기울기 (%) */
  slopePercent: number;
  /** 기울기 (°) */
  slopeDegree: number;
}

/**
 * 두 점 간 기울기와 거리
 * surfaceDistance 가 0 인 경우 (같은 좌표) 모든 비율은 0.
 */
export function getSlope(viewer: Viewer, p1: Cartesian3, p2: Cartesian3): SlopeResult {
  const distance = getDistance(p1, p2);
  const surfaceDistance = getSurfaceDistance(viewer, p1, p2);

  const c1 = Cartographic.fromCartesian(p1);
  const c2 = Cartographic.fromCartesian(p2);
  const heightDiff = c2.height - c1.height;

  const slopeRatio = surfaceDistance > 0 ? heightDiff / surfaceDistance : 0;
  const slopePercent = slopeRatio * 100;
  const slopeDegree = Math.atan(slopeRatio) * (180 / Math.PI);

  return {
    distance,
    surfaceDistance,
    heightDiff,
    slopeRatio,
    slopePercent,
    slopeDegree,
  };
}
