import {
  HeightReference,
  PolygonHierarchy,
  SceneMode,
  type Cartesian3,
  type Entity,
  type Viewer,
} from "cesium";

import { updateStampedPositions } from "./entity-stamp";
import {
  findPersistedBreakpoints,
  recreatePersistedBreakpoints,
  syncPersistedBreakpoints,
} from "./persisted-breakpoints";
import { getEntityLabel, recomputeMeasure } from "./persisted-labels";
import { getActiveEditHandle } from "./edit-adapter";
import { getSegmentLabels } from "./persisted-segment-labels";
import { updateDiagonalCompanion } from "./diagonal-companion";

export function updateEntityFromPositions(
  viewer: Viewer,
  entity: Entity,
  positions: Cartesian3[]
): void {
  if (!entity || !positions.length) return;

  const active = getActiveEditHandle();
  if (active && active.vertexEditor.entity === entity) {
    active.vertexEditor.setPositions(positions);
    return;
  }

  const heightReference =
    viewer.scene.mode === SceneMode.SCENE3D
      ? HeightReference.CLAMP_TO_GROUND
      : HeightReference.NONE;

  const isPolygon = !!entity.polygon;
  const isPolyline = !!entity.polyline;
  const isPoint = !!entity.point || !!entity.position;

  if (isPolygon && positions.length < 3) return;
  if (!isPolygon && isPolyline && positions.length < 2) return;
  if (isPoint && !isPolyline && !isPolygon && positions.length < 1) return;

  if (isPolygon && isPolyline) {
    (entity.polygon as any).hierarchy = new PolygonHierarchy(positions);
    (entity.polygon as any).heightReference = heightReference;
    (entity.polyline as any).positions = [...positions, positions[0]];
    (entity.polyline as any).heightReference = heightReference;
  } else if (isPolygon) {
    (entity.polygon as any).hierarchy = new PolygonHierarchy(positions);
    (entity.polygon as any).heightReference = heightReference;
  } else if (isPolyline) {
    (entity.polyline as any).positions = positions;
    (entity.polyline as any).heightReference = heightReference;
  } else if (entity.position) {
    (entity as any).position = positions[0];
  }
  if (entity.point) {
    (entity.point as any).heightReference = heightReference;
  }

  updateStampedPositions(entity, positions);

  const attached = getEntityLabel(entity);
  if (attached?.kind === "measure") {
    const existingBps = findPersistedBreakpoints(viewer, entity);
    if (existingBps.length === positions.length) {
      syncPersistedBreakpoints(viewer, entity, positions);
    } else if (existingBps.length > 0) {
      recreatePersistedBreakpoints(viewer, entity, positions, attached.type);
    }
    const recomputed = recomputeMeasure(viewer, attached.type, positions);
    attached.label.updateMeasure(recomputed);
    attached.label.updatePositions(positions);
    getSegmentLabels(entity)?.update(positions);
    // DISTANCE 지시선 동기화
    if (attached.type === "DISTANCE") {
      updateDiagonalCompanion(viewer, entity, positions);
    }
  } else if (attached?.kind === "draw") {
    attached.label.updatePositions(positions);
  }

  viewer.scene.requestRender();
}
