import type { Cartesian2 } from "cesium";

/*
 * 도형
 */

export type ShapeType = "POINT" | "POLYLINE" | "POLYGON";

/*
 * 작도 상태
 */
export type DrawerState = "idle" | "drawing" | "finished" | "destroyed";

export type InteractionAction =
  | "add-point" // 점 추가
  | "remove-point" // 직전 점 취소
  | "finish" // 작도 완료
  | "cancel-mode"; // 작도 모드 자체 취소 (도형 없는 상태에서)

export type InputGesture =
  | "tap"
  | "doubletap"
  | "contextmenu"
  | "move"
  | "drag-start"
  | "drag-move"
  | "drag-end"
  | "key";

export type InputSource = "mouse" | "touch" | "pen" | "key";

export interface ScreenGestureBase {
  screenPos: Cartesian2;
  source: InputSource;
  timestamp: number;
}

/** 드래그 — drag-start, drag-move, drag-end */
export interface DragGestureBase extends ScreenGestureBase {
  /** 드래그 시작 시점의 screen 좌표 (drag-start 이후 동일하게 유지) */
  startPos: Cartesian2;
  /** screenPos - startPos */
  delta: Cartesian2;
}

/** 키 입력 */
export interface KeyGestureBase {
  key: string;
  source: "key";
  timestamp: number;
}

export type InputGestureMap = {
  tap: ScreenGestureBase;
  doubletap: ScreenGestureBase;
  contextmenu: ScreenGestureBase;
  move: ScreenGestureBase;
  "drag-start": DragGestureBase;
  "drag-move": DragGestureBase;
  "drag-end": DragGestureBase;
  key: KeyGestureBase;
};

export type InteractionMap = Partial<Record<InteractionAction, InputGesture>>;

/* =========================================================================
 * Pick
 * ========================================================================= */

export type PickMode = "auto" | "terrain" | "model" | "ellipsoid";

/* =========================================================================
 * 좌표 변환 보조 타입
 * ========================================================================= */

/** [경도, 위도, 고도(미터)] */
export type LonLatHeight = readonly [lon: number, lat: number, height: number];
