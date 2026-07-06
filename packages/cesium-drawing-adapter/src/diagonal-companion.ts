import { Entity, SceneMode } from "cesium";
import type { Cartesian3, Viewer } from "cesium";

import { MEASURE_LINE_COLOR, MEASURE_LINE_WIDTH } from "./tokens";

/**
 * DISTANCE 측정 보조 대각선(지시선).
 * 3D 모드에서 메인 polyline(clampToGround:true) 옆에 z 값 그대로 잇는 직선을 추가로 그려서
 * 사거리를 시각적으로 표현. 기본은 비활성 — 호출처에서 명시적으로 attach 해야 동작.
 *
 * - 메인 entity 가 collection 에서 remove 되면 companion 도 자동 제거
 * - vertex 편집 / positions 변경 시 updateDiagonalCompanion 으로 동기화
 * - SCENE 2D ↔ 3D 토글 자동 attach / detach (postRender 폴링)
 */

const DIAGONAL_COLOR = MEASURE_LINE_COLOR.withAlpha(0.5);

interface TrackedEntry {
  entity: Entity;
  positions: readonly Cartesian3[];
  companion: Entity | null;
}

interface ViewerState {
  tracked: Map<Entity, TrackedEntry>;
  lastMode: SceneMode;
}

const VIEWER_STATE = new WeakMap<Viewer, ViewerState>();

function ensureViewerState(viewer: Viewer): ViewerState {
  let state = VIEWER_STATE.get(viewer);
  if (state) return state;

  state = {
    tracked: new Map(),
    lastMode: viewer.scene.mode,
  };
  VIEWER_STATE.set(viewer, state);

  // 메인 entity 제거시 companion 도 정리
  viewer.entities.collectionChanged.addEventListener((_collection, _added, removed) => {
    const s = VIEWER_STATE.get(viewer);
    if (!s) return;
    for (const e of removed) {
      const entry = s.tracked.get(e);
      if (entry) {
        if (entry.companion) {
          try {
            viewer.entities.remove(entry.companion);
          } catch {}
        }
        s.tracked.delete(e);
      }
    }
  });

  // SCENE 2D ↔ 3D 토글 자동 동기 (morphTo + 직접 scene.mode 할당 모두 catch)
  viewer.scene.postRender.addEventListener(() => {
    const s = VIEWER_STATE.get(viewer);
    if (!s) return;
    const m = viewer.scene.mode;
    if (m === s.lastMode || m === SceneMode.MORPHING) return;
    s.lastMode = m;
    const is3D = m === SceneMode.SCENE3D;
    for (const entry of s.tracked.values()) {
      if (is3D) {
        if (!entry.companion && entry.positions.length >= 2) {
          entry.companion = createCompanion(viewer, entry.positions);
        }
      } else if (entry.companion) {
        try {
          viewer.entities.remove(entry.companion);
        } catch {}
        entry.companion = null;
      }
    }
  });

  return state;
}

function createCompanion(viewer: Viewer, positions: readonly Cartesian3[]): Entity {
  return viewer.entities.add({
    polyline: {
      positions: positions as Cartesian3[],
      width: MEASURE_LINE_WIDTH,
      material: DIAGONAL_COLOR,
      clampToGround: false,
    },
  });
}

/**
 * DISTANCE entity 추적 시작 + 현재 모드 기준으로 companion 부착.
 * 이후 SCENE 2D↔3D 토글 시 자동 attach/detach.
 * positions 변경됐다면 동기화.
 */
export function attachDiagonalCompanion(
  viewer: Viewer,
  entity: Entity,
  positions: readonly Cartesian3[]
): void {
  const state = ensureViewerState(viewer);
  let entry = state.tracked.get(entity);
  if (!entry) {
    entry = { entity, positions, companion: null };
    state.tracked.set(entity, entry);
  } else {
    entry.positions = positions;
  }

  const is3D = viewer.scene.mode === SceneMode.SCENE3D;
  if (is3D && positions.length >= 2) {
    if (entry.companion && entry.companion.polyline) {
      entry.companion.polyline.positions = positions as any;
    } else {
      entry.companion = createCompanion(viewer, positions);
    }
  } else if (!is3D && entry.companion) {
    try {
      viewer.entities.remove(entry.companion);
    } catch {}
    entry.companion = null;
  }
}

/**
 * positions 변경시 동기화. 단, **이미 추적 중인 entity 만 갱신**한다.
 * 추적 안되어있으면 no-op — 옵션으로 attach 한 entity 만 영향 받게 하기 위함.
 */
export function updateDiagonalCompanion(
  viewer: Viewer,
  entity: Entity,
  positions: readonly Cartesian3[]
): void {
  const state = VIEWER_STATE.get(viewer);
  if (!state) return;
  if (!state.tracked.has(entity)) return;
  attachDiagonalCompanion(viewer, entity, positions);
}

/** entity 가 diagonal companion 추적 중인지 */
export function hasDiagonalCompanion(viewer: Viewer, entity: Entity): boolean {
  const state = VIEWER_STATE.get(viewer);
  return !!state?.tracked.has(entity);
}

/** 명시적 제거 (대부분 collectionChanged 가 자동 처리하지만 명시 호출 필요시 사용) */
export function detachDiagonalCompanion(viewer: Viewer, entity: Entity): void {
  const state = VIEWER_STATE.get(viewer);
  if (!state) return;
  const entry = state.tracked.get(entity);
  if (!entry) return;
  if (entry.companion) {
    try {
      viewer.entities.remove(entry.companion);
    } catch {}
  }
  state.tracked.delete(entity);
}
