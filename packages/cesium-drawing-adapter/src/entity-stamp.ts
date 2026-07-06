import {
  Cartographic,
  Math as CesiumMath,
  type Cartesian3,
  type Entity,
  type Viewer,
} from "cesium";
import { v4 as uuidv4 } from "uuid";

export type DrawerStampedType = "POINT" | "POLYLINE" | "POLYGON";
export type MeasureStampedType = "MEASURE-POINT" | "DISTANCE" | "AREA";
export type StampedType = DrawerStampedType | MeasureStampedType;

const MEASURE_TYPES = new Set<StampedType>(["MEASURE-POINT", "DISTANCE", "AREA"]);

let drawerPrefix = "";
let measurePrefix = "";

export function configureEntityStampPrefix(opts: {
  drawer?: string;
  measure?: string;
}): void {
  if (opts.drawer !== undefined) drawerPrefix = opts.drawer;
  if (opts.measure !== undefined) measurePrefix = opts.measure;
}

function toLonLatH(p: Cartesian3): [number, number, number] {
  const c = Cartographic.fromCartesian(p);
  return [
    CesiumMath.toDegrees(c.longitude),
    CesiumMath.toDegrees(c.latitude),
    c.height,
  ];
}

export function stampEntity(
  viewer: Viewer,
  entity: Entity,
  options: {
    type: StampedType;
    positions: Cartesian3[];
    id?: string;
  }
): void {
  const isMeasure = MEASURE_TYPES.has(options.type);
  const prefix = isMeasure ? measurePrefix : drawerPrefix;
  const uid = options.id ?? uuidv4();
  const newId = `${prefix}${options.type}_${uid}`;

  // EntityCollection internal map reindex
  const wasAdded = viewer.entities.contains(entity);
  if (wasAdded) viewer.entities.remove(entity);

  if (!(entity as any).positions) (entity as any).addProperty?.("positions");
  if (!(entity as any).entityType) (entity as any).addProperty?.("entityType");

  (entity as any)._id = newId;
  (entity as any).entityType = options.type;
  (entity as any).positions = options.positions.map(toLonLatH);

  if (wasAdded) viewer.entities.add(entity);

  bringToFront(viewer, entity);
  viewer.scene.requestRender();
}

export function updateStampedPositions(
  entity: Entity,
  positions: readonly Cartesian3[]
): void {
  if (!(entity as any).positions) (entity as any).addProperty?.("positions");
  (entity as any).positions = positions.map(toLonLatH);
}

export function bringToFront(viewer: Viewer, entity: Entity): void {
  let max = 0;
  viewer.entities.values.forEach((e) => {
    if (e.polygon?.zIndex !== undefined) {
      const z = (e.polygon.zIndex as any).getValue?.() ?? e.polygon.zIndex;
      if (typeof z === "number") max = Math.max(max, z);
    }
    if (e.polyline?.zIndex !== undefined) {
      const z = (e.polyline.zIndex as any).getValue?.() ?? e.polyline.zIndex;
      if (typeof z === "number") max = Math.max(max, z);
    }
  });
  const next = max + 1;
  if (entity.polygon) (entity.polygon as any).zIndex = next;
  if (entity.polyline) (entity.polyline as any).zIndex = next;
}
