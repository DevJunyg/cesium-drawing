import type { Cartesian3, Entity } from "cesium";
import type { ShapeType } from "../../core/types";

export interface ShapeStrategy {
  readonly type: ShapeType;
  readonly minPoints: number;

  /** 작도 중 동적 entity 생성. POINT 는 미사용 (Drawer 가 첫 tap 에 즉시 finish). */
  createDynamicEntity(provider: () => Cartesian3[]): Entity;

  /** 종료 시 정적 entity 생성 */
  createFinalEntity(positions: Cartesian3[]): Entity;
}

export type LivePositionsProvider = () => Cartesian3[];
