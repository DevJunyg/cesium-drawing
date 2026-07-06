import { ClassificationType, Color } from "cesium";

// 그리기
export const DRAW_LINE_COLOR = Color.YELLOW;
export const DRAW_MATERIAL_COLOR = Color.YELLOW.withAlpha(0.3);
export const DRAW_LINE_WIDTH = 4;
export const DRAW_POINT_FINAL_SIZE = 10;
export const DRAW_POINT_FINAL_OUTLINE_WIDTH = 3;

// 측정
export const MEASURE_LINE_COLOR = Color.YELLOW;
export const MEASURE_MATERIAL_COLOR = Color.YELLOW.withAlpha(0.2);
export const MEASURE_LINE_WIDTH = 4;
export const MEASURE_POINT_COLOR = Color.WHITE;
export const MEASURE_POINT_SIZE = 8;
export const MEASURE_POINT_OUTLINE_COLOR = MEASURE_LINE_COLOR;
export const MEASURE_POINT_OUTLINE_WIDTH = 3;

// 작도 중 breakpoint
export const BREAKPOINT_COLOR = Color.WHITE;
export const BREAKPOINT_SIZE = 10;
export const BREAKPOINT_OUTLINE_COLOR = Color.BLACK;
export const BREAKPOINT_OUTLINE_WIDTH = 1.2;

/**
 * 작도 측정 디자인 토큰
 *
 * 색상 / 크기 — Figma 참조
 */
const POINT_BASE = {
  color: Color.WHITE,
  pixelSize: DRAW_POINT_FINAL_SIZE,
  outlineColor: DRAW_LINE_COLOR,
  outlineWidth: DRAW_POINT_FINAL_OUTLINE_WIDTH,
  // heightReference 2D mode 에서 점이 사라지는 cesium 버그
  disableDepthTestDistance: Number.POSITIVE_INFINITY,
};

export const DRAW_GRAPHICS = {
  POINT: {
    active: { ...POINT_BASE },
    final: { ...POINT_BASE },
  },
  POLYLINE: {
    active: { material: DRAW_LINE_COLOR, width: DRAW_LINE_WIDTH, clampToGround: true },
    final: { material: DRAW_LINE_COLOR, width: DRAW_LINE_WIDTH, clampToGround: true },
    breakpoint: {
      color: BREAKPOINT_COLOR,
      pixelSize: BREAKPOINT_SIZE,
      outlineColor: BREAKPOINT_OUTLINE_COLOR,
      outlineWidth: BREAKPOINT_OUTLINE_WIDTH,
      disableDepthTestDistance: Number.POSITIVE_INFINITY,
    },
  },
  POLYGON: {
    // 작도 중
    active: {
      material: DRAW_MATERIAL_COLOR,
      classificationType: ClassificationType.TERRAIN,
    },
    // 종료 후 정적 entity
    final: {
      material: DRAW_MATERIAL_COLOR,
      classificationType: ClassificationType.TERRAIN,
    },
    // disableDepthTestDistance 만 사용
    breakpoint: {
      color: BREAKPOINT_COLOR,
      pixelSize: BREAKPOINT_SIZE,
      outlineColor: BREAKPOINT_OUTLINE_COLOR,
      outlineWidth: BREAKPOINT_OUTLINE_WIDTH,
      disableDepthTestDistance: Number.POSITIVE_INFINITY,
    },
    outline: {
      material: DRAW_LINE_COLOR,
      width: DRAW_LINE_WIDTH,
      clampToGround: true,
    },
  },
} as const;

const MEASURE_POINT_BASE = {
  pixelSize: MEASURE_POINT_SIZE,
  color: MEASURE_POINT_COLOR,
  outlineColor: MEASURE_POINT_OUTLINE_COLOR,
  outlineWidth: MEASURE_POINT_OUTLINE_WIDTH,
  disableDepthTestDistance: Number.POSITIVE_INFINITY,
};

export const MEASURE_GRAPHICS = {
  POINT: {
    active: { ...MEASURE_POINT_BASE },
    final: { ...MEASURE_POINT_BASE },
  },
  DISTANCE: {
    active: { material: MEASURE_LINE_COLOR, width: MEASURE_LINE_WIDTH, clampToGround: true },
    final: { material: MEASURE_LINE_COLOR, width: MEASURE_LINE_WIDTH, clampToGround: true },
    breakpoint: { ...MEASURE_POINT_BASE },
  },
  AREA: {
    active: {
      material: MEASURE_MATERIAL_COLOR,
      classificationType: ClassificationType.TERRAIN,
    },
    final: {
      material: MEASURE_MATERIAL_COLOR,
      classificationType: ClassificationType.TERRAIN,
    },
    breakpoint: { ...MEASURE_POINT_BASE },
    outline: {
      material: MEASURE_LINE_COLOR,
      width: MEASURE_LINE_WIDTH,
      clampToGround: true,
    },
  },
} as const;
