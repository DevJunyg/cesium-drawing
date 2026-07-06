import { Cartesian3, Cartographic } from "cesium";
import type { Viewer } from "cesium";

export function clampPositionsToTerrain(
  viewer: Viewer,
  positions: readonly Cartesian3[]
): Cartesian3[] {
  const globe = viewer.scene.globe;
  const out: Cartesian3[] = positions.map((p) => p);
  if (!globe) return out;
  let changed = false;
  for (let i = 0; i < out.length; i++) {
    const carto = Cartographic.fromCartesian(out[i]);
    const h = globe.getHeight(carto);
    if (h === undefined) continue;
    if (Math.abs(h - carto.height) > 0.01) {
      carto.height = h;
      out[i] = Cartographic.toCartesian(carto, globe.ellipsoid, new Cartesian3());
      changed = true;
    }
  }
  return changed ? out : (positions as Cartesian3[]);
}
