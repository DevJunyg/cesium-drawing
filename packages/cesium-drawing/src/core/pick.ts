import type { Cartesian2, Cartesian3, Viewer } from "cesium";
import type { PickMode } from "./types";

export interface PickOptions {
  mode?: PickMode;
}

/**
 * 화면 좌표를 3D 좌표로 변환한다.
 *
 */
export function pickCartesian3(
  viewer: Viewer,
  screenPos: Cartesian2,
  options: PickOptions = {}
): Cartesian3 | undefined {
  const mode = options.mode ?? "auto";

  if (mode === "model") {
    if (!viewer.scene.pickPositionSupported) return undefined;
    const p = viewer.scene.pickPosition(screenPos);
    return p && Number.isFinite(p.x) ? p : undefined;
  }

  if (mode === "terrain") {
    const ray = viewer.camera.getPickRay(screenPos);
    if (!ray) return undefined;
    return viewer.scene.globe.pick(ray, viewer.scene) ?? undefined;
  }

  if (mode === "ellipsoid") {
    return viewer.camera.pickEllipsoid(screenPos, viewer.scene.globe.ellipsoid) ?? undefined;
  }

  // 'auto' — 정밀도 높은 순으로 fallback
  if (viewer.scene.pickPositionSupported) {
    const p = viewer.scene.pickPosition(screenPos);
    if (p && Number.isFinite(p.x)) return p;
  }
  const ray = viewer.camera.getPickRay(screenPos);
  if (ray) {
    const p = viewer.scene.globe.pick(ray, viewer.scene);
    if (p) return p;
  }
  return viewer.camera.pickEllipsoid(screenPos, viewer.scene.globe.ellipsoid) ?? undefined;
}
