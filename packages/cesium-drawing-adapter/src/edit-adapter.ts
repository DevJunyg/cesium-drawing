import { OverlayHost, VertexEditor, type OverlayHandle } from "@alz/cesium-drawing";
import type { Cartesian3, Entity, Viewer } from "cesium";

import { createEditLabel, type EditLabelHandle } from "./edit-label";
import {
  findPersistedBreakpoints,
  recreatePersistedBreakpoints,
  removeStampedEntity,
  setPersistedBreakpointsVisible,
  syncPersistedBreakpoints,
} from "./persisted-breakpoints";
import { updateStampedPositions } from "./entity-stamp";
import { getEntityLabel, recomputeMeasure, type EntityLabelRegistration } from "./persisted-labels";
import { getSegmentLabels } from "./persisted-segment-labels";
import { updateDiagonalCompanion } from "./diagonal-companion";

export interface ActionClickEvent {
  entity: Entity;
  defaultAction: () => void;
}

export interface EditAdapterOptions {
  message?: string;
  removeHintMessage?: string | false;
  addHintMessage?: string | false;
  onActionEditing?: (e: ActionClickEvent) => void;
  onActionCancel?: (e: ActionClickEvent) => void;
  onDelete?: (entity: Entity) => void;
  onChange?: (positions: Cartesian3[]) => void;
  onEnd?: () => void;
}

export interface EditEntityHandle {
  vertexEditor: VertexEditor;
  destroy(): void;
}

let activeHandle: InternalHandle | null = null;

interface InternalHandle extends EditEntityHandle {
  _cleanup(): void;
}

export function destroyActiveEdit(): void {
  activeHandle?.destroy();
  activeHandle = null;
}

export function getActiveEditHandle(): EditEntityHandle | null {
  return activeHandle;
}

export function editEntity(
  viewer: Viewer,
  entity: Entity,
  options: EditAdapterOptions = {}
): EditEntityHandle {
  if (activeHandle) {
    activeHandle.destroy();
    activeHandle = null;
  }

  const hadBreakpoints = findPersistedBreakpoints(viewer, entity).length > 0;
  if (hadBreakpoints) {
    setPersistedBreakpointsVisible(viewer, entity, false);
  }

  const editor = new VertexEditor(viewer, entity);
  editor.enable();

  const attached: EntityLabelRegistration | undefined = getEntityLabel(entity);
  if (attached) {
    attached.label.setActionMode("editing");
  }

  let editLabel: EditLabelHandle | null = !attached
    ? createEditLabel(viewer, {
        positions: editor.positions,
        message: options.message,
      })
    : null;

  let destroyed = false;

  const performDelete = () => {
    if (destroyed) return;
    destroyed = true;
    editor.destroy();
    editLabel?.destroy();
    editLabel = null;
    hoverTooltip?.destroy();
    removeStampedEntity(viewer, entity);
    if (activeHandle && activeHandle.vertexEditor === editor) activeHandle = null;
    options.onDelete?.(entity);
    options.onEnd?.();
  };

  const handleDelete = () => {
    if (options.onActionEditing) {
      options.onActionEditing({ entity, defaultAction: performDelete });
    } else {
      performDelete();
    }
  };

  const performCancel = () => {
    inner.destroy();
  };

  const handleCancel = () => {
    if (options.onActionCancel) {
      options.onActionCancel({ entity, defaultAction: performCancel });
    } else {
      performCancel();
    }
  };

  if (attached) {
    attached.label.setOnAction({
      delete: handleDelete,
      cancel: handleCancel,
    });
  }

  let topologyChanged = false;
  let lastPositionCount = editor.positions.length;

  editor.on("vertex-add", () => {
    topologyChanged = true;
  });
  editor.on("vertex-remove", () => {
    topologyChanged = true;
  });

  editor.on("change", ({ positions }) => {
    if (positions.length !== lastPositionCount) {
      topologyChanged = true;
      lastPositionCount = positions.length;
    }

    updateStampedPositions(entity, positions);

    if (hadBreakpoints) {
      syncPersistedBreakpoints(viewer, entity, positions);
    }
    editLabel?.update(positions);
    if (attached) {
      attached.label.updatePositions(positions);
      if (attached.kind === "measure") {
        const recomputed = recomputeMeasure(viewer, attached.type, positions);
        attached.label.updateMeasure(recomputed);
      }
    }
    getSegmentLabels(entity)?.update(positions);
    // DISTANCE 대각선 동기화
    if (attached?.kind === "measure" && attached.type === "DISTANCE") {
      updateDiagonalCompanion(viewer, entity, positions);
    }
    options.onChange?.(positions);
  });

  // POINT 는 vertex 1개라 우클릭 삭제 비활성
  const isPoint = attached?.type === "POINT";
  const removeMsg =
    isPoint || options.removeHintMessage === false
      ? null
      : (options.removeHintMessage ?? "우클릭 시 삭제");
  const addMsg = options.addHintMessage === false ? null : (options.addHintMessage ?? "점 추가");
  const hoverTooltip = removeMsg !== null || addMsg !== null ? createHoverTooltip(viewer) : null;

  editor.on("vertex-hover-enter", ({ position }) => {
    if (!hoverTooltip || removeMsg === null) return;
    hoverTooltip.show(position, removeMsg);
  });
  editor.on("vertex-hover-leave", () => {
    hoverTooltip?.hide();
  });
  editor.on("midpoint-hover-enter", ({ position }) => {
    if (!hoverTooltip || addMsg === null) return;
    hoverTooltip.show(position, addMsg);
  });
  editor.on("midpoint-hover-leave", () => {
    hoverTooltip?.hide();
  });

  const inner: InternalHandle = {
    vertexEditor: editor,
    _cleanup() {
      const finalPositions = editor.positions;

      editor.destroy();
      editLabel?.destroy();
      editLabel = null;
      hoverTooltip?.destroy();

      if (topologyChanged && attached && attached.kind === "measure" && hadBreakpoints) {
        recreatePersistedBreakpoints(viewer, entity, finalPositions, attached.type);
      } else if (hadBreakpoints) {
        setPersistedBreakpointsVisible(viewer, entity, true);
      }

      if (attached) {
        attached.label.setActionMode("idle");
        const idleHandler = idleHandlerRegistry.get(entity);
        if (idleHandler) {
          attached.label.setOnAction({ edit: idleHandler });
        }
      }
    },
    destroy() {
      if (destroyed) return;
      destroyed = true;
      this._cleanup();
      if (activeHandle && activeHandle.vertexEditor === editor) activeHandle = null;
      options.onEnd?.();
    },
  };

  activeHandle = inner;
  return inner;
}

interface HoverTooltipHandle {
  show(position: Cartesian3, message: string): void;
  hide(): void;
  destroy(): void;
}

const HOVER_TOOLTIP_STYLE_ID = "cesium-drawing-hover-tooltip-style";

function ensureHoverTooltipStyles(): void {
  if (document.getElementById(HOVER_TOOLTIP_STYLE_ID)) return;
  const style = document.createElement("style");
  style.id = HOVER_TOOLTIP_STYLE_ID;
  style.textContent = `
    .cesium-drawing-hover-tooltip {
      display: inline-block;
      background: rgba(20, 20, 20, 0.85);
      color: #fff;
      padding: 4px 8px;
      border-radius: 3px;
      font-size: 11px;
      font-weight: 500;
      white-space: nowrap;
      pointer-events: none;
      box-shadow: 0 2px 6px rgba(0, 0, 0, 0.2);
      line-height: 1.3;
    }
  `;
  document.head.appendChild(style);
}

function createHoverTooltip(viewer: Viewer): HoverTooltipHandle {
  ensureHoverTooltipStyles();

  const overlay = new OverlayHost(viewer);
  const el = document.createElement("div");
  el.className = "cesium-drawing-hover-tooltip";

  let handle: OverlayHandle | null = null;
  let destroyed = false;

  const offset = { x: 14, y: -28 };

  return {
    show(position, message) {
      if (destroyed) return;
      el.textContent = message;
      if (!handle) {
        handle = overlay.attach(el, position, { offset });
      } else {
        handle.update(position);
        handle.setVisible(true);
      }
    },
    hide() {
      if (destroyed) return;
      handle?.setVisible(false);
    },
    destroy() {
      if (destroyed) return;
      destroyed = true;
      handle?.detach();
      handle = null;
      overlay.destroy();
    },
  };
}

const idleHandlerRegistry = new WeakMap<Entity, () => void>();

export function setIdleActionHandler(entity: Entity, handler: () => void): void {
  idleHandlerRegistry.set(entity, handler);
}

export function clearIdleActionHandler(entity: Entity): void {
  idleHandlerRegistry.delete(entity);
}
