import { OverlayHost, type OverlayHandle } from "@alz/cesium-drawing";
import type {
  AreaCompute,
  DistanceCompute,
  MeasureComputePayload,
  PointCompute,
} from "@alz/cesium-drawing";
import { Cartographic, Math as CesiumMath, SceneMode } from "cesium";
import type { Cartesian3, Viewer } from "cesium";

import {
  createActionButton,
  type ActionButtonHandle,
  type IconLike,
  DEFAULT_CANCEL_ICON,
  DEFAULT_DELETE_ICON,
  DEFAULT_EDIT_ICON,
} from "./action-button";

export interface ButtonAppearance {
  icon?: IconLike;
  title?: string;
}

export interface MeasureLabelActionButtonOptions {
  className?: string;
  edit?: ButtonAppearance;
  delete?: ButtonAppearance;
  cancel?: ButtonAppearance;
}

export interface MeasureLabelI18n {
  totalSurface?: string;
  totalDirect?: string;
  area?: string;
  longitude?: string;
  latitude?: string;
  height?: string;
  unitMeter?: string;
  unitSqMeter?: string;
  editHint?: string;
}

export interface MeasureLabelOptions {
  actionButton?: MeasureLabelActionButtonOptions | false;
  i18n?: MeasureLabelI18n;
  offset?: { x: number; y: number };
  extraRows?: MeasureLabelExtraRow[];
  /** POINT 측정 row 커스텀. 미설정 시 lon/lat/height 기본 표시 */
  pointFormatter?: (
    payload: PointCompute,
    ctx: { is3D: boolean }
  ) => { title?: string; rows: Array<{ label: string; value: string }> };
  distanceDraftFormatter?: (
    hover: PointCompute,
    ctx: { is3D: boolean }
  ) => { title?: string; rows: Array<{ label: string; value: string }> };
}

export interface MeasureLabelExtraRow {
  label: string;
  value: number | string;
  unit?: string;
  color?: string;
}

export interface MeasureLabelHandle {
  updateMeasure(payload: MeasureComputePayload): void;
  updatePositions(positions: readonly Cartesian3[]): void;
  setActionMode(mode: "idle" | "editing"): void;
  setOnAction(handlers: { edit?: () => void; delete?: () => void; cancel?: () => void }): void;
  setExtraRows(rows: MeasureLabelExtraRow[] | null): void;
  setDrafting(active: boolean): void;
  destroy(): void;
}

const DEFAULT_I18N: Required<MeasureLabelI18n> = {
  totalSurface: "수평거리 합",
  totalDirect: "사거리 합",
  area: "평면적",
  longitude: "경도",
  latitude: "위도",
  height: "고도",
  unitMeter: "m",
  unitSqMeter: "m²",
  editHint: "드래그하여 수정",
};

const STYLE_ID = "cesium-drawing-measure-label-style";

function ensureStyles(): void {
  if (document.getElementById(STYLE_ID)) return;
  const style = document.createElement("style");
  style.id = STYLE_ID;
  style.textContent = `
    .cesium-drawing-measure-label-wrap {
      display: flex;
      align-items: flex-start;
      gap: 2px;
      pointer-events: auto;
    }
    .cesium-drawing-measure-label {
      background: #fff;
      border-radius: 3px;
      padding: 8px 10px;
      box-shadow: 0px 3px 10px rgba(0, 0, 0, 0.1);
      font-size: 12px;
      font-weight: 500;
      line-height: 1.5;
      color: #000;
      width: max-content;
    }
    .cesium-drawing-measure-label .title {
      font-weight: 600;
      margin-bottom: 4px;
    }
    .cesium-drawing-measure-label .row {
      display: flex;
      justify-content: space-between;
      gap: 12px;
    }
    .cesium-drawing-measure-label .row strong {
      font-weight: 500;
    }
    .cesium-drawing-measure-label .row .value {
      color: #00bcd4;
    }
    .cesium-drawing-measure-label .extra-content {
      margin-top: 6px;
      padding-top: 6px;
      border-top: 1px solid rgba(0, 0, 0, 0.1);
    }
    .cesium-drawing-measure-label .divider {
      border-top: 1px solid rgba(0, 0, 0, 0.1);
      margin: 8px 0 6px;
    }
    .cesium-drawing-measure-label .edit-hint {
      color: #666;
      font-size: 11px;
      font-weight: 400;
    }
  `;
  document.head.appendChild(style);
}

const fmt = (n: number, digits = 2): string =>
  n.toLocaleString(undefined, {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  });

function distanceHTML(d: DistanceCompute, i18n: Required<MeasureLabelI18n>, is3D: boolean): string {
  // 2D 모드: 수평거리 합만
  const base =
    `<div class="row"><strong>${i18n.totalSurface}</strong>` +
    `<span class="value">${fmt(d.totalSurface)} ${i18n.unitMeter}</span></div>`;
  if (!is3D) return base;
  return (
    base +
    `<div class="row"><strong>${i18n.totalDirect}</strong>` +
    `<span class="value">${fmt(d.totalDirect)} ${i18n.unitMeter}</span></div>`
  );
}

function areaHTML(a: AreaCompute, i18n: Required<MeasureLabelI18n>): string {
  return (
    `<div class="row"><strong>${i18n.area}</strong>` +
    `<span class="value">${fmt(a.surface)} ${i18n.unitSqMeter}</span></div>`
  );
}

function pointHTML(
  p: PointCompute,
  i18n: Required<MeasureLabelI18n>,
  is3D: boolean,
  formatter?: MeasureLabelOptions["pointFormatter"]
): string {
  if (formatter) {
    const { title, rows } = formatter(p, { is3D });
    const titleHTML = title ? `<div class="title">${title}</div>` : "";
    const rowsHTML = rows
      .map(
        (r) =>
          `<div class="row"><strong>${r.label}</strong><span class="value">${r.value}</span></div>`
      )
      .join("");
    return titleHTML + rowsHTML;
  }
  // 기본: lon/lat (+ 3D 일 때 height)
  const base =
    `<div class="row"><strong>${i18n.longitude}</strong>` +
    `<span class="value">${p.lon.toFixed(6)}°</span></div>` +
    `<div class="row"><strong>${i18n.latitude}</strong>` +
    `<span class="value">${p.lat.toFixed(6)}°</span></div>`;
  if (!is3D) return base;
  return (
    base +
    `<div class="row"><strong>${i18n.height}</strong>` +
    `<span class="value">${fmt(p.height)} ${i18n.unitMeter}</span></div>`
  );
}

function hoverToPointCompute(hover: Cartesian3): PointCompute {
  const c = Cartographic.fromCartesian(hover);
  return {
    lon: CesiumMath.toDegrees(c.longitude),
    lat: CesiumMath.toDegrees(c.latitude),
    height: c.height,
  };
}

function formatterRowsHTML(result: {
  title?: string;
  rows: Array<{ label: string; value: string }>;
}): string {
  const titleHTML = result.title ? `<div class="title">${result.title}</div>` : "";
  const rowsHTML = result.rows
    .map(
      (r) =>
        `<div class="row"><strong>${r.label}</strong><span class="value">${r.value}</span></div>`
    )
    .join("");
  return titleHTML + rowsHTML;
}

function buildHTML(
  payload: MeasureComputePayload,
  i18n: Required<MeasureLabelI18n>,
  is3D: boolean,
  drafting: boolean,
  pointFormatter?: MeasureLabelOptions["pointFormatter"],
  distanceDraftFormatter?: MeasureLabelOptions["distanceDraftFormatter"]
): string {
  if (payload.distance) {
    // 그리는 도중 로컬좌표 표시
    if (drafting && distanceDraftFormatter && payload.hover) {
      return formatterRowsHTML(
        distanceDraftFormatter(hoverToPointCompute(payload.hover), { is3D })
      );
    }
    return distanceHTML(payload.distance, i18n, is3D);
  }
  if (payload.area) return areaHTML(payload.area, i18n);
  if (payload.point) return pointHTML(payload.point, i18n, is3D, pointFormatter);
  return "";
}

function mergeI18n(
  defaults: Required<MeasureLabelI18n>,
  user: MeasureLabelI18n | undefined
): Required<MeasureLabelI18n> {
  const result: Required<MeasureLabelI18n> = { ...defaults };
  if (!user) return result;
  for (const key of Object.keys(user) as Array<keyof MeasureLabelI18n>) {
    const v = user[key];
    if (v !== undefined) result[key] = v;
  }
  return result;
}

export function createMeasureLabel(
  viewer: Viewer,
  options: MeasureLabelOptions = {}
): MeasureLabelHandle {
  ensureStyles();

  const i18n = mergeI18n(DEFAULT_I18N, options.i18n);
  const offset = options.offset ?? { x: 11, y: 11 };

  const overlay = new OverlayHost(viewer);

  const wrap = document.createElement("div");
  wrap.className = "cesium-drawing-measure-label-wrap";

  const card = document.createElement("div");
  card.className = "cesium-drawing-measure-label";
  wrap.appendChild(card);

  const content = document.createElement("div");
  content.className = "content";
  card.appendChild(content);

  const extraContainer = document.createElement("div");
  extraContainer.className = "extra-content";
  extraContainer.style.display = "none";
  card.appendChild(extraContainer);

  const divider = document.createElement("div");
  divider.className = "divider";
  divider.style.display = "none";
  card.appendChild(divider);

  const hint = document.createElement("div");
  hint.className = "edit-hint";
  hint.textContent = i18n.editHint;
  hint.style.display = "none";
  card.appendChild(hint);

  let extraRows: MeasureLabelExtraRow[] = options.extraRows ?? [];

  function renderExtraRows() {
    if (!extraRows.length) {
      extraContainer.style.display = "none";
      extraContainer.innerHTML = "";
      return;
    }
    extraContainer.style.display = "";
    extraContainer.innerHTML = extraRows
      .map(
        (r) =>
          `<div class="row"><strong${r.color ? ` style="color:${r.color}"` : ""}>${r.label}</strong>` +
          `<span class="value">${r.value}${r.unit ? ` ${r.unit}` : ""}</span></div>`
      )
      .join("");
  }
  renderExtraRows();

  const useButtons = options.actionButton !== false;
  const btnOpts = (options.actionButton === false ? {} : options.actionButton) ?? {};

  let editBtn: ActionButtonHandle | null = null;
  let cancelBtn: ActionButtonHandle | null = null;
  let deleteBtn: ActionButtonHandle | null = null;

  if (useButtons) {
    const group = document.createElement("div");
    group.className = "cesium-drawing-action-buttons";
    if (btnOpts.className) group.classList.add(btnOpts.className);

    editBtn = createActionButton({
      icon: btnOpts.edit?.icon ?? DEFAULT_EDIT_ICON,
      title: btnOpts.edit?.title ?? "수정",
    });
    cancelBtn = createActionButton({
      icon: btnOpts.cancel?.icon ?? DEFAULT_CANCEL_ICON,
      title: btnOpts.cancel?.title ?? "편집 취소",
    });
    deleteBtn = createActionButton({
      icon: btnOpts.delete?.icon ?? DEFAULT_DELETE_ICON,
      title: btnOpts.delete?.title ?? "삭제",
      variant: "danger",
    });

    group.appendChild(editBtn.el);
    group.appendChild(cancelBtn.el);
    group.appendChild(deleteBtn.el);
    wrap.appendChild(group);

    editBtn.setVisible(false);
    cancelBtn.setVisible(false);
    deleteBtn.setVisible(false);
  }

  let handle: OverlayHandle | null = null;
  let destroyed = false;
  let active = false;
  let mode: "idle" | "editing" = "idle";
  let drafting = false;

  let lastPayload: MeasureComputePayload | null = null;

  function refreshUI() {
    const showEditing = active && mode === "editing";
    divider.style.display = showEditing ? "" : "none";
    hint.style.display = showEditing ? "" : "none";
    if (editBtn) editBtn.setVisible(active && mode === "idle");
    if (cancelBtn) cancelBtn.setVisible(showEditing);
    if (deleteBtn) deleteBtn.setVisible(showEditing);
  }

  const ensureAttached = (anchor: Cartesian3) => {
    if (!handle) {
      handle = overlay.attach(wrap, anchor, { offset });
    } else {
      handle.update(anchor);
      handle.setVisible(true);
    }
  };

  // scene mode 변경 감지
  let lastMode: SceneMode = viewer.scene.mode;
  const onPostRender = () => {
    if (destroyed || !lastPayload) return;
    const m = viewer.scene.mode;
    if (m !== lastMode && m !== SceneMode.MORPHING) {
      lastMode = m;
      const is3D = m === SceneMode.SCENE3D;
      const html = buildHTML(
        lastPayload,
        i18n,
        is3D,
        drafting,
        options.pointFormatter,
        options.distanceDraftFormatter
      );
      if (html) content.innerHTML = html;
    }
  };
  viewer.scene.postRender.addEventListener(onPostRender);

  return {
    updateMeasure(payload) {
      if (destroyed) return;

      if (payload.positions.length === 0) {
        active = false;
        handle?.setVisible(false);
        refreshUI();
        return;
      }

      lastPayload = payload;
      const is3D = viewer.scene.mode === SceneMode.SCENE3D;
      const html = buildHTML(
        payload,
        i18n,
        is3D,
        drafting,
        options.pointFormatter,
        options.distanceDraftFormatter
      );
      if (!html) {
        active = false;
        handle?.setVisible(false);
        refreshUI();
        return;
      }
      content.innerHTML = html;
      active = true;
      refreshUI();

      const anchor = payload.hover ?? payload.positions[payload.positions.length - 1];
      if (!anchor) {
        handle?.setVisible(false);
        return;
      }
      ensureAttached(anchor);
    },
    updatePositions(positions) {
      if (destroyed) return;
      const anchor = positions[positions.length - 1];
      if (!anchor) {
        handle?.setVisible(false);
        return;
      }
      ensureAttached(anchor);
    },
    setActionMode(m) {
      mode = m;
      refreshUI();
    },
    setDrafting(active) {
      if (drafting === active) return;
      drafting = active;
      // 상태 바뀌면 즉시 재렌더
      if (lastPayload) {
        const is3D = viewer.scene.mode === SceneMode.SCENE3D;
        const html = buildHTML(
          lastPayload,
          i18n,
          is3D,
          drafting,
          options.pointFormatter,
          options.distanceDraftFormatter
        );
        if (html) content.innerHTML = html;
      }
    },
    setOnAction(handlers) {
      if (editBtn) editBtn.setOnClick(handlers.edit ?? noop);
      if (cancelBtn) cancelBtn.setOnClick(handlers.cancel ?? noop);
      if (deleteBtn) deleteBtn.setOnClick(handlers.delete ?? noop);
    },
    setExtraRows(rows) {
      if (destroyed) return;
      extraRows = rows ?? [];
      renderExtraRows();
    },
    destroy() {
      if (destroyed) return;
      destroyed = true;
      try {
        viewer.scene.postRender.removeEventListener(onPostRender);
      } catch {}
      editBtn?.destroy();
      cancelBtn?.destroy();
      deleteBtn?.destroy();
      handle?.detach();
      handle = null;
      overlay.destroy();
    },
  };
}

const noop = () => {};
