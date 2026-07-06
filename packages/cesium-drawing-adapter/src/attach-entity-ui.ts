import type { Cartesian3, Entity, Viewer } from "cesium";

import type { MeasureType } from "@alz/cesium-drawing";

import {
  createMeasureLabel,
  type MeasureLabelActionButtonOptions,
  type MeasureLabelExtraRow,
  type MeasureLabelHandle,
  type MeasureLabelI18n,
  type MeasureLabelOptions,
} from "./measure-label";
import {
  createDrawActionLabel,
  type DrawActionButtonOptions,
  type DrawActionLabelHandle,
} from "./draw-action-label";
import { createPersistedBreakpoints } from "./persisted-breakpoints";
import { recomputeMeasure, registerEntityLabel } from "./persisted-labels";
import {
  createSegmentLabels,
  registerSegmentLabels,
  type SegmentLabelI18n,
} from "./persisted-segment-labels";
import {
  editEntity,
  setIdleActionHandler,
  type ActionClickEvent,
} from "./edit-adapter";
import type { DrawerStampedType } from "./entity-stamp";

export interface AttachEditOptions {
  editLabelMessage?: string;
  removeHintMessage?: string | false;
  addHintMessage?: string | false;

  onActionIdle?: (e: ActionClickEvent) => void;
  onActionEditing?: (e: ActionClickEvent) => void;
  onActionCancel?: (e: ActionClickEvent) => void;

  onEditEnter?: (entity: Entity) => void;
  onEditExit?: (entity: Entity) => void;
  onDelete?: (entity: Entity) => void;
}

export interface AttachMeasureUIOptions extends AttachEditOptions {
  defaultLabel?: boolean;
  labelI18n?: MeasureLabelI18n;
  actionButton?: MeasureLabelActionButtonOptions | false;
  persistBreakpoints?: boolean;
  extraRows?: MeasureLabelExtraRow[];
  /** DISTANCE 측정 한정. default: true */
  segmentLabels?: boolean;
  segmentLabelI18n?: SegmentLabelI18n;
  /** POINT 측정 row 커스텀 */
  pointFormatter?: MeasureLabelOptions["pointFormatter"];
}

export interface AttachDrawUIOptions extends AttachEditOptions {
  actionButton?: DrawActionButtonOptions | false;
}

export function wireEditEntry(
  viewer: Viewer,
  entity: Entity,
  label: MeasureLabelHandle | DrawActionLabelHandle,
  options: AttachEditOptions
): void {
  const enterEdit = () => {
    options.onEditEnter?.(entity);
    editEntity(viewer, entity, {
      message: options.editLabelMessage,
      removeHintMessage: options.removeHintMessage,
      addHintMessage: options.addHintMessage,
      onActionEditing: options.onActionEditing,
      onActionCancel: options.onActionCancel,
      onDelete: options.onDelete,
      onEnd: () => options.onEditExit?.(entity),
    });
  };
  const idleHandler = () => {
    if (options.onActionIdle) {
      options.onActionIdle({ entity, defaultAction: enterEdit });
    } else {
      enterEdit();
    }
  };
  setIdleActionHandler(entity, idleHandler);
  label.setOnAction({ edit: idleHandler });
  label.setActionMode("idle");
}

export function attachMeasureUI(
  viewer: Viewer,
  entity: Entity,
  positions: Cartesian3[],
  measureType: MeasureType,
  options: AttachMeasureUIOptions = {}
): void {
  const persist =
    options.persistBreakpoints !== false && measureType !== "POINT";
  if (persist) {
    createPersistedBreakpoints(viewer, entity, positions, measureType);
  }

  // DISTANCE 의 segment break-label
  if (measureType === "DISTANCE" && options.segmentLabels !== false) {
    const seg = createSegmentLabels(viewer, positions, { i18n: options.segmentLabelI18n });
    registerSegmentLabels(entity, seg);
  }

  if (options.defaultLabel === false) return;

  const label = createMeasureLabel(viewer, {
    actionButton: options.actionButton,
    i18n: {
      ...options.labelI18n,
      editHint: options.editLabelMessage ?? options.labelI18n?.editHint,
    },
    extraRows: options.extraRows,
    pointFormatter: options.pointFormatter,
  });

  label.updateMeasure(recomputeMeasure(viewer, measureType, positions));
  registerEntityLabel(entity, { kind: "measure", type: measureType, label });

  wireEditEntry(viewer, entity, label, options);
}

export function attachDrawUI(
  viewer: Viewer,
  entity: Entity,
  positions: Cartesian3[],
  shape: DrawerStampedType,
  options: AttachDrawUIOptions = {}
): void {
  if (options.actionButton === false) return;

  const actionLabel = createDrawActionLabel(viewer, positions, {
    actionButton: options.actionButton,
    i18n: { editHint: options.editLabelMessage },
  });
  registerEntityLabel(entity, {
    kind: "draw",
    type: shape,
    label: actionLabel,
  });

  wireEditEntry(viewer, entity, actionLabel, options);
}
