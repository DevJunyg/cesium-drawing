import { Cartographic, Math as CesiumMath } from "cesium";
import type { Cartesian3, Entity, Viewer } from "cesium";

import { getArea, getSlope } from "cesium-drawing";
import type { MeasureComputePayload, MeasureType } from "cesium-drawing";

import type { MeasureLabelHandle } from "./measure-label";
import type { DrawActionLabelHandle } from "./draw-action-label";
import type { DrawerStampedType } from "./entity-stamp";

export type EntityLabelRegistration =
  | { kind: "measure"; type: MeasureType; label: MeasureLabelHandle }
  | { kind: "draw"; type: DrawerStampedType; label: DrawActionLabelHandle };

const registry = new WeakMap<Entity, EntityLabelRegistration>();

export function registerEntityLabel(entity: Entity, registration: EntityLabelRegistration): void {
  const prev = registry.get(entity);
  if (prev && prev.label !== registration.label) {
    prev.label.destroy();
  }
  registry.set(entity, registration);
}

export function getEntityLabel(entity: Entity): EntityLabelRegistration | undefined {
  return registry.get(entity);
}

export function unregisterEntityLabel(entity: Entity): void {
  const entry = registry.get(entity);
  if (!entry) return;
  entry.label.destroy();
  registry.delete(entity);
}

export function recomputeMeasure(
  viewer: Viewer,
  measureType: MeasureType,
  positions: Cartesian3[]
): MeasureComputePayload {
  const payload: MeasureComputePayload = {
    measureType,
    positions,
    hover: null,
  };

  if (measureType === "DISTANCE") {
    const segments = [];
    for (let i = 0; i < positions.length - 1; i++) {
      const slope = getSlope(viewer, positions[i], positions[i + 1]);
      segments.push({
        direct: slope.distance,
        surface: slope.surfaceDistance,
        slopeDegree: slope.slopeDegree,
      });
    }
    let totalDirect = 0;
    let totalSurface = 0;
    for (const s of segments) {
      totalDirect += s.direct;
      totalSurface += s.surface;
    }
    payload.distance = { totalDirect, totalSurface, segments };
  } else if (measureType === "AREA") {
    payload.area = {
      surface: positions.length >= 3 ? getArea(viewer, positions) : 0,
    };
  } else if (measureType === "POINT" && positions.length >= 1) {
    const c = Cartographic.fromCartesian(positions[0]);
    payload.point = {
      lon: CesiumMath.toDegrees(c.longitude),
      lat: CesiumMath.toDegrees(c.latitude),
      height: c.height,
    };
  }

  return payload;
}

export function registerMeasureLabel(
  entity: Entity,
  type: MeasureType,
  label: MeasureLabelHandle
): void {
  registerEntityLabel(entity, { kind: "measure", type, label });
}

export function getMeasureLabel(
  entity: Entity
): { type: MeasureType; label: MeasureLabelHandle } | undefined {
  const entry = registry.get(entity);
  if (!entry || entry.kind !== "measure") return undefined;
  return { type: entry.type, label: entry.label };
}

export function unregisterMeasureLabel(entity: Entity): void {
  unregisterEntityLabel(entity);
}
