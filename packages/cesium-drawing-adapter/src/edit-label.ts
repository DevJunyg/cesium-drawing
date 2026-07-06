/**
 * 꼭지점 편집 모드 안내 라벨.
 */

import { OverlayHost, type OverlayHandle } from "cesium-drawing";
import type { Cartesian3, Viewer } from "cesium";

export interface EditLabelHandle {
  update(positions: readonly Cartesian3[]): void;
  destroy(): void;
}

const STYLE_ID = "cesium-drawing-edit-label-style";

function ensureStyles(): void {
  if (document.getElementById(STYLE_ID)) return;
  const style = document.createElement("style");
  style.id = STYLE_ID;
  style.textContent = `
    .cesium-drawing-edit-label {
      display: inline-block;
      background: var(--Base-white, #fff);
      color: #333;
      padding: 4px 10px;
      border-radius: 3px;
      box-shadow: 0px 3px 10px rgba(0, 0, 0, 0.1);
      font-size: 12px;
      font-weight: 500;
      white-space: nowrap;
      pointer-events: none;
      line-height: 1.4;
    }
  `;
  document.head.appendChild(style);
}

export interface CreateEditLabelOptions {
  /** 안내 메시지 (default: "드래그하여 수정"). i18n 용 */
  message?: string;
  /** 부착 위치 (마지막 점) */
  positions: readonly Cartesian3[];
  /** 라벨 픽셀 오프셋 (default: { x: 16, y: -50 } — 마지막 점 위쪽) */
  offset?: { x: number; y: number };
}

export function createEditLabel(viewer: Viewer, options: CreateEditLabelOptions): EditLabelHandle {
  ensureStyles();

  const overlay = new OverlayHost(viewer);

  const el = document.createElement("div");
  el.className = "cesium-drawing-edit-label";
  el.textContent = options.message ?? "드래그하여 수정";

  let handle: OverlayHandle | null = null;
  let destroyed = false;

  // 측정 라벨 ({16, +16}) 과 충분한 수직 간격 확보 — y -50 으로 위쪽 배치
  const offset = options.offset ?? { x: 16, y: -50 };

  const updatePosition = (positions: readonly Cartesian3[]) => {
    if (destroyed) return;
    const anchor = positions[positions.length - 1];
    if (!anchor) {
      handle?.setVisible(false);
      return;
    }
    if (!handle) {
      handle = overlay.attach(el, anchor, { offset });
    } else {
      handle.update(anchor);
      handle.setVisible(true);
    }
  };

  updatePosition(options.positions);

  return {
    update: updatePosition,
    destroy() {
      if (destroyed) return;
      destroyed = true;
      handle?.detach();
      handle = null;
      overlay.destroy();
    },
  };
}
