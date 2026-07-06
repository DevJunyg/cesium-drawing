import { CallbackProperty, Entity } from "cesium";
import type { Cartesian3, PolylineGraphics } from "cesium";

import type { LivePositionsProvider, ShapeStrategy } from "./shape-base";

export interface PolylineShapeGraphics {
  active?: PolylineGraphics.ConstructorOptions;
  final?: PolylineGraphics.ConstructorOptions;
}

export class PolylineShape implements ShapeStrategy {
  readonly type = "POLYLINE" as const;
  readonly minPoints = 2;

  constructor(private _graphics: PolylineShapeGraphics = {}) {}

  createDynamicEntity(provider: LivePositionsProvider): Entity {
    return new Entity({
      polyline: {
        ...this._graphics.active,
        positions: new CallbackProperty(() => provider(), false),
      },
    });
  }

  createFinalEntity(positions: Cartesian3[]): Entity {
    return new Entity({
      polyline: {
        ...this._graphics.final,
        positions,
      },
    });
  }
}
