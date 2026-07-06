import { CallbackProperty, Entity, PolygonHierarchy } from 'cesium';
import type {
  Cartesian3,
  PolygonGraphics,
  PolylineGraphics,
} from 'cesium';

import type { LivePositionsProvider, ShapeStrategy } from './shape-base';

export interface PolygonShapeGraphics {
  active?: PolygonGraphics.ConstructorOptions;
  final?: PolygonGraphics.ConstructorOptions;
  /** 외곽선 폴리라인. undefined 면 외곽선 없음. */
  outline?: PolylineGraphics.ConstructorOptions;
}

/**
 * POLYGON — 폴리곤 + (옵션) 외곽선 폴리라인.
 *
 * 외곽선은 마지막 점에서 첫 점으로 닫힌 경로로 그려진다 (작도 중에도 닫힘 형태).
 * 외곽선이 polygon graphic 의 outline 옵션 대신 별도 polyline 인 이유는
 * cesium 의 polygon outline 이 일부 환경에서 렌더링 제약이 있기 때문.
 */
export class PolygonShape implements ShapeStrategy {
  readonly type = 'POLYGON' as const;
  readonly minPoints = 3;

  constructor(private _graphics: PolygonShapeGraphics = {}) {}

  createDynamicEntity(provider: LivePositionsProvider): Entity {
    const outline = this._graphics.outline;
    return new Entity({
      polygon: {
        ...this._graphics.active,
        hierarchy: new CallbackProperty(
          () => new PolygonHierarchy(provider()),
          false
        ),
      },
      polyline: outline
        ? {
            ...outline,
            positions: new CallbackProperty(() => {
              const ps = provider();
              if (ps.length < 2) return ps;
              return [...ps, ps[0]];
            }, false),
          }
        : undefined,
    });
  }

  createFinalEntity(positions: Cartesian3[]): Entity {
    const outline = this._graphics.outline;
    return new Entity({
      polygon: {
        ...this._graphics.final,
        hierarchy: new PolygonHierarchy(positions),
      },
      polyline: outline
        ? {
            ...outline,
            positions: [...positions, positions[0]],
          }
        : undefined,
    });
  }
}
