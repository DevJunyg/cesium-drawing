import { CallbackProperty, HeightReference, SceneMode } from "cesium";
import type { Cartesian3, Entity, Viewer } from "cesium";

import type { MeasureType } from "@alz/cesium-drawing";

import { MEASURE_GRAPHICS } from "./tokens";
import { unregisterMeasureLabel } from "./persisted-labels";
import { unregisterSegmentLabels } from "./persisted-segment-labels";

const BP_INFIX = "_BP_";

export function breakpointIdFor(parent: Entity, index: number): string {
  return `${String(parent.id ?? "")}${BP_INFIX}${index}`;
}

export function findPersistedBreakpoints(viewer: Viewer, parent: Entity): Entity[] {
  const prefix = `${String(parent.id ?? "")}${BP_INFIX}`;
  const items = viewer.entities.values.filter((e) => String(e.id ?? "").startsWith(prefix));
  items.sort((a, b) => {
    const ai = Number(String(a.id).slice(prefix.length)) || 0;
    const bi = Number(String(b.id).slice(prefix.length)) || 0;
    return ai - bi;
  });
  return items;
}

export function setPersistedBreakpointsVisible(
  viewer: Viewer,
  parent: Entity,
  visible: boolean
): void {
  for (const bp of findPersistedBreakpoints(viewer, parent)) {
    bp.show = visible;
  }
  viewer.scene.requestRender();
}

export function syncPersistedBreakpoints(
  viewer: Viewer,
  parent: Entity,
  positions: readonly Cartesian3[]
): void {
  const bps = findPersistedBreakpoints(viewer, parent);
  const n = Math.min(bps.length, positions.length);
  for (let i = 0; i < n; i++) {
    (bps[i] as any).position = positions[i];
  }
  viewer.scene.requestRender();
}

export function createPersistedBreakpoints(
  viewer: Viewer,
  parent: Entity,
  positions: readonly Cartesian3[],
  measureType: MeasureType
): Entity[] {
  if (measureType === "POINT") return [];
  const bpStyle = MEASURE_GRAPHICS[measureType]?.breakpoint;
  if (!bpStyle) return [];

  const heightRefProp =
    measureType === "AREA"
      ? new CallbackProperty(
          () =>
            viewer.scene.mode === SceneMode.SCENE3D
              ? HeightReference.CLAMP_TO_GROUND
              : HeightReference.NONE,
          false
        )
      : null;

  const created: Entity[] = [];
  for (let i = 0; i < positions.length; i++) {
    const point: Record<string, unknown> = { ...bpStyle };
    if (heightRefProp) point.heightReference = heightRefProp;
    const bp = viewer.entities.add({
      position: positions[i],
      point,
      id: breakpointIdFor(parent, i),
    });
    created.push(bp);
  }
  return created;
}

export function recreatePersistedBreakpoints(
  viewer: Viewer,
  parent: Entity,
  positions: readonly Cartesian3[],
  measureType: MeasureType
): Entity[] {
  for (const bp of findPersistedBreakpoints(viewer, parent)) {
    viewer.entities.remove(bp);
  }
  return createPersistedBreakpoints(viewer, parent, positions, measureType);
}

export function removeStampedEntity(viewer: Viewer, parent: Entity): void {
  unregisterMeasureLabel(parent);
  unregisterSegmentLabels(parent);
  for (const bp of findPersistedBreakpoints(viewer, parent)) {
    viewer.entities.remove(bp);
  }
  viewer.entities.remove(parent);
  viewer.scene.requestRender();
}
