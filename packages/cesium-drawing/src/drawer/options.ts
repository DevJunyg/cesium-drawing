import { Color } from "cesium";
import type { PointGraphics, PolylineGraphics, PolygonGraphics } from "cesium";

import type { InteractionMap, ShapeType } from "../core/types";

export const DEFAULT_INTERACTION = {
  "add-point": "tap",
  "remove-point": "contextmenu",
  finish: "doubletap",
  "cancel-mode": "contextmenu",
} as const satisfies Required<InteractionMap>;

export interface DrawerGraphicsOptions {
  /** 작도 중 동적 도형 (CallbackProperty 기반) */
  active?:
    | PointGraphics.ConstructorOptions
    | PolylineGraphics.ConstructorOptions
    | PolygonGraphics.ConstructorOptions;
  /** 종료 후 정적 도형 */
  final?:
    | PointGraphics.ConstructorOptions
    | PolylineGraphics.ConstructorOptions
    | PolygonGraphics.ConstructorOptions;
  /** 작도 중 클릭한 점들에 표시할 breakpoint 점.
   *  false 이면 breakpoint 미표시. POINT shape 는 의미 없음. */
  breakpoint?: PointGraphics.ConstructorOptions | false;
  /** POLYGON 의 외곽선 polyline. 다른 shape 에서는 무시. */
  outline?: PolylineGraphics.ConstructorOptions;
}

const DEFAULT_BREAKPOINT: PointGraphics.ConstructorOptions = {
  color: Color.WHITE,
  pixelSize: 8,
  outlineColor: Color.BLACK,
  outlineWidth: 1,
  disableDepthTestDistance: Number.POSITIVE_INFINITY,
};

const DEFAULTS_BY_SHAPE: Record<
  ShapeType,
  Required<Omit<DrawerGraphicsOptions, "outline">> & {
    outline?: PolylineGraphics.ConstructorOptions;
  }
> = {
  POINT: {
    active: { color: Color.YELLOW, pixelSize: 8 },
    final: {
      color: Color.WHITE,
      pixelSize: 10,
      outlineColor: Color.BLACK,
      outlineWidth: 1,
      disableDepthTestDistance: Number.POSITIVE_INFINITY,
    },
    breakpoint: false,
  },
  POLYLINE: {
    active: { material: Color.YELLOW, width: 2 },
    final: { material: Color.YELLOW, width: 4 },
    breakpoint: DEFAULT_BREAKPOINT,
  },
  POLYGON: {
    active: { material: Color.YELLOW.withAlpha(0.3) },
    final: { material: Color.YELLOW.withAlpha(0.3), perPositionHeight: true },
    breakpoint: DEFAULT_BREAKPOINT,
    outline: { material: Color.YELLOW, width: 2 },
  },
};

/**
 * 사용자 graphics 옵션을 기본값과 병합한다.
 */
export function mergeGraphics(
  shape: ShapeType,
  user: DrawerGraphicsOptions = {}
): Required<Omit<DrawerGraphicsOptions, "outline">> & {
  outline?: PolylineGraphics.ConstructorOptions;
} {
  const def = DEFAULTS_BY_SHAPE[shape];
  return {
    active: { ...def.active, ...(user.active ?? {}) },
    final: { ...def.final, ...(user.final ?? {}) },
    breakpoint:
      user.breakpoint === undefined
        ? def.breakpoint
        : user.breakpoint === false
          ? false
          : { ...DEFAULT_BREAKPOINT, ...user.breakpoint },
    outline: shape === "POLYGON" ? { ...(def.outline ?? {}), ...(user.outline ?? {}) } : undefined,
  };
}
