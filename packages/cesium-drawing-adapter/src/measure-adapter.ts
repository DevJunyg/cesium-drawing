import { Entity } from "cesium";
import type { Cartesian3, Viewer } from "cesium";

import { MeasureController } from "@alz/cesium-drawing";
import type { MeasureComputePayload, MeasureType } from "@alz/cesium-drawing";

import { MEASURE_GRAPHICS } from "./tokens";
import { stampEntity, type StampedType } from "./entity-stamp";
import { createStartTooltip, type StartTooltipHandle } from "./start-tooltip";
import {
  createMeasureLabel,
  type MeasureLabelActionButtonOptions,
  type MeasureLabelExtraRow,
  type MeasureLabelHandle,
  type MeasureLabelI18n,
  type MeasureLabelOptions,
} from "./measure-label";
import { createPersistedBreakpoints } from "./persisted-breakpoints";
import { recomputeMeasure, registerEntityLabel } from "./persisted-labels";
import {
  createSegmentLabels,
  registerSegmentLabels,
  type SegmentLabelI18n,
  type SegmentLabelsHandle,
} from "./persisted-segment-labels";
import { clampPositionsToTerrain } from "./terrain-clamp";
import { attachDiagonalCompanion } from "./diagonal-companion";
import { clearIdleActionHandler, type ActionClickEvent } from "./edit-adapter";
import { attachMeasureUI, wireEditEntry, type AttachMeasureUIOptions } from "./attach-entity-ui";

export interface MeasureAdapterOptions {
  onEnd?: (entity: Entity, positions: Cartesian3[]) => void;
  onCancel?: () => void;
  onCompute?: (data: MeasureComputePayload) => void;
  startTooltip?: string | false;
  defaultLabel?: boolean;
  labelI18n?: MeasureLabelI18n;
  actionButton?: MeasureLabelActionButtonOptions | false;
  editLabelMessage?: string;
  removeHintMessage?: string | false;
  addHintMessage?: string | false;
  persistBreakpoints?: boolean;
  extraRows?: MeasureLabelExtraRow[];
  /** DISTANCE 측정 한정. default: true */
  segmentLabels?: boolean;
  segmentLabelI18n?: SegmentLabelI18n;
  /** POINT 측정 row 커스텀 */
  pointFormatter?: MeasureLabelOptions["pointFormatter"];
  /** DISTANCE 그리는 도중 hover 라벨 — 작도 종료 후엔 자동으로 합계 표시로 복귀 */
  distanceDraftFormatter?: MeasureLabelOptions["distanceDraftFormatter"];
  /**
   * DISTANCE 3D 보조 대각선(지시선) 활성화. default: false.
   * true 면 ground-clamp 된 메인 line 옆에 z 값 그대로 잇는 직선이 추가로 그려지고
   * vertex 편집 / form 좌표 변경 / 2D↔3D 토글 시 자동 동기화됨.
   */
  diagonalCompanion?: boolean;

  onActionIdle?: (e: ActionClickEvent) => void;
  onActionEditing?: (e: ActionClickEvent) => void;
  onActionCancel?: (e: ActionClickEvent) => void;

  onEditEnter?: (entity: Entity) => void;
  onEditExit?: (entity: Entity) => void;
  onDelete?: (entity: Entity) => void;
}

const DEFAULT_TOOLTIPS: Record<MeasureType, string> = {
  POINT: "지점 선택",
  DISTANCE: "시작점 선택",
  AREA: "시작점 선택",
};

const STAMP_TYPE: Record<MeasureType, StampedType> = {
  POINT: "MEASURE-POINT",
  DISTANCE: "DISTANCE",
  AREA: "AREA",
};

function attachAdapter(
  viewer: Viewer,
  m: MeasureController,
  measureType: MeasureType,
  options: MeasureAdapterOptions
): MeasureController {
  const tooltipMessage =
    options.startTooltip === false ? null : (options.startTooltip ?? DEFAULT_TOOLTIPS[measureType]);
  let tooltip: StartTooltipHandle | null = tooltipMessage
    ? createStartTooltip(viewer, tooltipMessage)
    : null;
  const closeTooltip = () => {
    tooltip?.destroy();
    tooltip = null;
  };

  const useLabel = options.defaultLabel !== false;
  let label: MeasureLabelHandle | null = useLabel
    ? createMeasureLabel(viewer, {
        actionButton: options.actionButton,
        i18n: {
          ...options.labelI18n,
          editHint: options.editLabelMessage ?? options.labelI18n?.editHint,
        },
        extraRows: options.extraRows,
        pointFormatter: options.pointFormatter,
        distanceDraftFormatter: options.distanceDraftFormatter,
      })
    : null;

  if (label && measureType === "DISTANCE") {
    label.setDrafting(true);
  }

  const persistBp = options.persistBreakpoints !== false && measureType !== "POINT";
  const persistedBpEntities: Entity[] = [];
  const useSegmentLabels = measureType === "DISTANCE" && options.segmentLabels !== false;
  const useDiagonal = measureType === "DISTANCE" && options.diagonalCompanion === true;
  let segmentLabels: SegmentLabelsHandle | null = null;
  let isFinished = false;

  m.on("point-add", () => closeTooltip());

  m.on("compute", (payload) => {
    if (isFinished) return;
    label?.updateMeasure(payload);
    // DISTANCE: 작도 중 segment 라벨 라이브 갱신
    if (useSegmentLabels) {
      if (!segmentLabels) {
        if (payload.positions.length >= 2) {
          segmentLabels = createSegmentLabels(viewer, payload.positions, {
            i18n: options.segmentLabelI18n,
          });
        }
      } else {
        segmentLabels.update(payload.positions);
      }
    }
    options.onCompute?.(payload);
  });

  m.on("finish", ({ entity, positions: rawPositions }) => {
    isFinished = true;
    closeTooltip();
    const positions = clampPositionsToTerrain(viewer, rawPositions);
    stampEntity(viewer, entity, { type: STAMP_TYPE[measureType], positions });

    if (persistBp) {
      const created = createPersistedBreakpoints(viewer, entity, positions, measureType);
      persistedBpEntities.push(...created);
    }

    if (useSegmentLabels) {
      // 작도 중 생성된 라이브 라벨이 있으면 그대로 entity 로 이양, 없으면 새로 생성
      if (!segmentLabels) {
        segmentLabels = createSegmentLabels(viewer, positions, {
          i18n: options.segmentLabelI18n,
        });
      } else {
        segmentLabels.update(positions);
      }
      registerSegmentLabels(entity, segmentLabels);
      segmentLabels = null;
    }

    // 3D 보조 대각선 — 옵션 활성시에만
    if (useDiagonal) {
      attachDiagonalCompanion(viewer, entity, positions);
    }

    if (label) {
      // 작도 종료 — draft 해제 + 확정 positions 기준으로 재계산
      label.setDrafting(false);
      label.updatePositions(positions);
      label.updateMeasure(recomputeMeasure(viewer, measureType, positions));
      registerEntityLabel(entity, { kind: "measure", type: measureType, label });
      wireEditEntry(viewer, entity, label, options);
      label = null;
    }

    options.onEnd?.(entity, positions);
  });

  m.on("cancel", () => {
    closeTooltip();
    label?.destroy();
    label = null;
    segmentLabels?.destroy();
    segmentLabels = null;
    options.onCancel?.();
  });

  m.on("destroy", () => {
    closeTooltip();
    label?.destroy();
    label = null;
    segmentLabels?.destroy();
    segmentLabels = null;
    persistedBpEntities.length = 0;
    viewer.scene.requestRender();
  });

  m.bindKey("Escape", () => m.destroy());

  m.start();
  return m;
}

export function measurePoint(
  viewer: Viewer,
  options: MeasureAdapterOptions = {}
): MeasureController {
  const m = new MeasureController(viewer, {
    measureType: "POINT",
    pickMode: "auto",
    graphics: MEASURE_GRAPHICS.POINT,
  });
  return attachAdapter(viewer, m, "POINT", options);
}

export function measureDistance(
  viewer: Viewer,
  options: MeasureAdapterOptions = {}
): MeasureController {
  const m = new MeasureController(viewer, {
    measureType: "DISTANCE",
    pickMode: "auto",
    graphics: MEASURE_GRAPHICS.DISTANCE,
  });
  return attachAdapter(viewer, m, "DISTANCE", options);
}

export function measureArea(
  viewer: Viewer,
  options: MeasureAdapterOptions = {}
): MeasureController {
  const m = new MeasureController(viewer, {
    measureType: "AREA",
    pickMode: "terrain",
    graphics: MEASURE_GRAPHICS.AREA,
  });
  return attachAdapter(viewer, m, "AREA", options);
}

export function renderMeasurePoint(
  viewer: Viewer,
  positions: Cartesian3[],
  options: { id?: string } = {}
): Entity | null {
  const entity = MeasureController.render(viewer, {
    measureType: "POINT",
    positions,
    graphics: MEASURE_GRAPHICS.POINT,
  });
  if (!entity) return null;
  stampEntity(viewer, entity, { type: "MEASURE-POINT", positions, id: options.id });
  return entity;
}

export function renderMeasureDistance(
  viewer: Viewer,
  positions: Cartesian3[],
  options: { id?: string; diagonalCompanion?: boolean } = {}
): Entity | null {
  const entity = MeasureController.render(viewer, {
    measureType: "DISTANCE",
    positions,
    graphics: MEASURE_GRAPHICS.DISTANCE,
  });
  if (!entity) return null;
  stampEntity(viewer, entity, { type: "DISTANCE", positions, id: options.id });
  // 옵션 활성시에만 보조 대각선 부착 (2D 면 내부에서 skip)
  if (options.diagonalCompanion === true) {
    attachDiagonalCompanion(viewer, entity, positions);
  }
  return entity;
}

export function renderMeasureArea(
  viewer: Viewer,
  positions: Cartesian3[],
  options: { id?: string } = {}
): Entity | null {
  const entity = MeasureController.render(viewer, {
    measureType: "AREA",
    positions,
    graphics: MEASURE_GRAPHICS.AREA,
  });
  if (!entity) return null;
  stampEntity(viewer, entity, { type: "AREA", positions, id: options.id });
  return entity;
}

export interface RestoreMeasureOptions extends AttachMeasureUIOptions {
  id?: string;
  /** DISTANCE 한정. default: false */
  diagonalCompanion?: boolean;
}

export function restoreMeasurePoint(
  viewer: Viewer,
  positions: Cartesian3[],
  options: RestoreMeasureOptions = {}
): Entity | null {
  const entity = renderMeasurePoint(viewer, positions, { id: options.id });
  if (!entity) return null;
  attachMeasureUI(viewer, entity, positions, "POINT", options);
  return entity;
}

export function restoreMeasureDistance(
  viewer: Viewer,
  positions: Cartesian3[],
  options: RestoreMeasureOptions = {}
): Entity | null {
  const entity = renderMeasureDistance(viewer, positions, {
    id: options.id,
    diagonalCompanion: options.diagonalCompanion,
  });
  if (!entity) return null;
  attachMeasureUI(viewer, entity, positions, "DISTANCE", options);
  return entity;
}

export function restoreMeasureArea(
  viewer: Viewer,
  positions: Cartesian3[],
  options: RestoreMeasureOptions = {}
): Entity | null {
  const entity = renderMeasureArea(viewer, positions, { id: options.id });
  if (!entity) return null;
  attachMeasureUI(viewer, entity, positions, "AREA", options);
  return entity;
}

void clearIdleActionHandler;
