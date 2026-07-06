import { Entity } from "cesium";
import type { Cartesian3, PointGraphics } from "cesium";

import type { LivePositionsProvider, ShapeStrategy } from "./shape-base";

export interface PointShapeGraphics {
  active?: PointGraphics.ConstructorOptions;
  final?: PointGraphics.ConstructorOptions;
}

/**
 * POINT — 첫 tap 에서 즉시 finish
 */
export class PointShape implements ShapeStrategy {
  readonly type = "POINT" as const;
  readonly minPoints = 1;

  constructor(private _graphics: PointShapeGraphics = {}) {}

  createDynamicEntity(_provider: LivePositionsProvider): Entity {
    return new Entity({});
  }

  createFinalEntity(positions: Cartesian3[]): Entity {
    return new Entity({
      position: positions[0],
      point: { ...this._graphics.final },
    });
  }
}
