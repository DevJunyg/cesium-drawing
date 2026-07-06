import { OverlayHost, type OverlayHandle } from "@alz/cesium-drawing";
import type { Cartesian3, Viewer } from "cesium";

import {
  createActionButton,
  type ActionButtonHandle,
  DEFAULT_CANCEL_ICON,
  DEFAULT_DELETE_ICON,
  DEFAULT_EDIT_ICON,
} from "./action-button";
import type { MeasureLabelActionButtonOptions } from "./measure-label";

export type DrawActionButtonOptions = MeasureLabelActionButtonOptions;

export interface DrawActionLabelI18n {
  editHint?: string;
}

export interface DrawActionLabelOptions {
  actionButton?: DrawActionButtonOptions;
  i18n?: DrawActionLabelI18n;
  offset?: { x: number; y: number };
}

export interface DrawActionLabelHandle {
  updatePositions(positions: readonly Cartesian3[]): void;
  setActionMode(mode: "idle" | "editing"): void;
  setOnAction(handlers: {
    edit?: () => void;
    delete?: () => void;
    cancel?: () => void;
  }): void;
  destroy(): void;
}

const DEFAULT_HINT = "드래그하여 수정";

const STYLE_ID = "cesium-drawing-draw-label-style";

function ensureStyles(): void {
  if (document.getElementById(STYLE_ID)) return;
  const style = document.createElement("style");
  style.id = STYLE_ID;
  style.textContent = `
    .cesium-drawing-draw-label-wrap {
      display: flex;
      align-items: flex-start;
      gap: 2px;
      pointer-events: auto;
    }
    .cesium-drawing-draw-label {
      background: #fff;
      border-radius: 3px;
      padding: 8px 10px;
      box-shadow: 0px 3px 10px rgba(0, 0, 0, 0.1);
      font-size: 12px;
      color: #666;
      font-weight: 400;
      white-space: nowrap;
      line-height: 1.5;
    }
  `;
  document.head.appendChild(style);
}

const noop = () => {};

export function createDrawActionLabel(
  viewer: Viewer,
  positions: readonly Cartesian3[],
  options: DrawActionLabelOptions = {}
): DrawActionLabelHandle {
  ensureStyles();

  const editHint = options.i18n?.editHint ?? DEFAULT_HINT;
  const offset = options.offset ?? { x: 11, y: 11 };
  const btnOpts = options.actionButton ?? {};

  const overlay = new OverlayHost(viewer);

  const wrap = document.createElement("div");
  wrap.className = "cesium-drawing-draw-label-wrap";

  const card = document.createElement("div");
  card.className = "cesium-drawing-draw-label";
  card.textContent = editHint;
  card.style.display = "none";
  wrap.appendChild(card);

  const group = document.createElement("div");
  group.className = "cesium-drawing-action-buttons";
  if (btnOpts.className) group.classList.add(btnOpts.className);

  const editBtn: ActionButtonHandle = createActionButton({
    icon: btnOpts.edit?.icon ?? DEFAULT_EDIT_ICON,
    title: btnOpts.edit?.title ?? "수정",
  });
  const cancelBtn: ActionButtonHandle = createActionButton({
    icon: btnOpts.cancel?.icon ?? DEFAULT_CANCEL_ICON,
    title: btnOpts.cancel?.title ?? "편집 취소",
  });
  const deleteBtn: ActionButtonHandle = createActionButton({
    icon: btnOpts.delete?.icon ?? DEFAULT_DELETE_ICON,
    title: btnOpts.delete?.title ?? "삭제",
    variant: "danger",
  });

  group.appendChild(editBtn.el);
  group.appendChild(cancelBtn.el);
  group.appendChild(deleteBtn.el);
  wrap.appendChild(group);

  let mode: "idle" | "editing" = "idle";
  function refresh() {
    const editing = mode === "editing";
    card.style.display = editing ? "" : "none";
    editBtn.setVisible(!editing);
    cancelBtn.setVisible(editing);
    deleteBtn.setVisible(editing);
  }
  refresh();

  let handle: OverlayHandle | null = null;
  let destroyed = false;

  const anchor0 = positions[positions.length - 1];
  if (anchor0) {
    handle = overlay.attach(wrap, anchor0, { offset });
  }

  return {
    updatePositions(next) {
      if (destroyed) return;
      const anchor = next[next.length - 1];
      if (!anchor) {
        handle?.setVisible(false);
        return;
      }
      if (!handle) {
        handle = overlay.attach(wrap, anchor, { offset });
      } else {
        handle.update(anchor);
        handle.setVisible(true);
      }
    },
    setActionMode(m) {
      mode = m;
      refresh();
    },
    setOnAction(handlers) {
      editBtn.setOnClick(handlers.edit ?? noop);
      cancelBtn.setOnClick(handlers.cancel ?? noop);
      deleteBtn.setOnClick(handlers.delete ?? noop);
    },
    destroy() {
      if (destroyed) return;
      destroyed = true;
      editBtn.destroy();
      cancelBtn.destroy();
      deleteBtn.destroy();
      handle?.detach();
      handle = null;
      overlay.destroy();
    },
  };
}
