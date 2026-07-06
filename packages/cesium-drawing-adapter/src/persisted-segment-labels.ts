import { Cartesian3, SceneMode } from "cesium";
import type { Entity, Viewer } from "cesium";

import { OverlayHost, type OverlayHandle } from "@alz/cesium-drawing";
import { getSlope } from "@alz/cesium-drawing";

export interface SegmentLabelI18n {
  surface?: string;
  direct?: string;
  slope?: string;
  unitMeter?: string;
}

export interface SegmentLabelsHandle {
  update(positions: readonly Cartesian3[]): void;
  destroy(): void;
}

const DEFAULT_I18N: Required<SegmentLabelI18n> = {
  surface: "수평거리",
  direct: "사거리",
  slope: "기울기",
  unitMeter: "m",
};

const STYLE_ID = "cesium-drawing-segment-label-style";

function ensureStyles(): void {
  if (document.getElementById(STYLE_ID)) return;
  const style = document.createElement("style");
  style.id = STYLE_ID;
  style.textContent = `
    .cesium-drawing-segment-label {
      background: #fff;
      border-radius: 3px;
      padding: 8px 10px;
      box-shadow: 0px 3px 10px rgba(0, 0, 0, 0.1);
      font-size: 12px;
      font-weight: 500;
      line-height: 1.5;
      color: #000;
      pointer-events: none;
      white-space: nowrap;
      transform: translateY(-100%);
    }
    .cesium-drawing-segment-label .row {
      display: flex;
      justify-content: space-between;
      gap: 12px;
    }
    .cesium-drawing-segment-label .row strong {
      font-weight: 500;
    }
    .cesium-drawing-segment-label .row .value {
      color: #00bcd4;
    }
  `;
  document.head.appendChild(style);
}

const fmt = (n: number, digits = 2): string =>
  n.toLocaleString(undefined, { minimumFractionDigits: digits, maximumFractionDigits: digits });

function mergeI18n(user?: SegmentLabelI18n): Required<SegmentLabelI18n> {
  const result: Required<SegmentLabelI18n> = { ...DEFAULT_I18N };
  if (!user) return result;
  for (const key of Object.keys(user) as Array<keyof SegmentLabelI18n>) {
    const v = user[key];
    if (v !== undefined) result[key] = v;
  }
  return result;
}

function buildHTML(
  surface: number,
  direct: number,
  slopeDegree: number,
  i18n: Required<SegmentLabelI18n>,
  is3D: boolean
): string {
  // 2D 모드: 수평거리만 표시
  const base =
    `<div class="row"><strong>${i18n.surface}</strong>` +
    `<span class="value">${fmt(surface)} ${i18n.unitMeter}</span></div>`;
  if (!is3D) return base;
  return (
    base +
    `<div class="row"><strong>${i18n.direct}</strong>` +
    `<span class="value">${fmt(direct)} ${i18n.unitMeter}</span></div>` +
    `<div class="row"><strong>${i18n.slope}</strong>` +
    `<span class="value">${slopeDegree.toFixed(2)}°</span></div>`
  );
}

/**
 * DISTANCE 측정의 segment 별 break-label.
 * segment 끝점 (positions[i+1]) 에 부착.
 */
export function createSegmentLabels(
  viewer: Viewer,
  positions: readonly Cartesian3[],
  options: { i18n?: SegmentLabelI18n; offset?: { x: number; y: number } } = {}
): SegmentLabelsHandle {
  ensureStyles();

  const i18n = mergeI18n(options.i18n);
  // 측정값 라벨 (offset y:11) 위 4px 갭. transform: translateY(-100%) 로 라벨 상승
  const offset = options.offset ?? { x: 11, y: 7 };

  const overlay = new OverlayHost(viewer);
  const items: { el: HTMLDivElement; handle: OverlayHandle }[] = [];
  let destroyed = false;
  let lastPositions: readonly Cartesian3[] = positions;

  const update = (next: readonly Cartesian3[]) => {
    if (destroyed) return;
    lastPositions = next;
    const segCount = Math.max(0, next.length - 1);

    // 부족하면 신규 attach, 초과하면 detach
    while (items.length < segCount) {
      const idx = items.length;
      const el = document.createElement("div");
      el.className = "cesium-drawing-segment-label";
      const handle = overlay.attach(el, next[idx + 1], { offset });
      items.push({ el, handle });
    }
    while (items.length > segCount) {
      const it = items.pop();
      it?.handle.detach();
    }

    const is3D = viewer.scene.mode === SceneMode.SCENE3D;
    for (let i = 0; i < segCount; i++) {
      const p1 = next[i];
      const p2 = next[i + 1];
      const slope = getSlope(viewer, p1, p2);
      const { el, handle } = items[i];
      el.innerHTML = buildHTML(
        slope.surfaceDistance,
        slope.distance,
        slope.slopeDegree,
        i18n,
        is3D
      );
      handle.update(p2);
      handle.setVisible(true);
    }
  };

  update(positions);

  // scene mode 변경 감지
  let lastMode: SceneMode = viewer.scene.mode;
  const onPostRender = () => {
    if (destroyed) return;
    const m = viewer.scene.mode;
    if (m !== lastMode && m !== SceneMode.MORPHING) {
      lastMode = m;
      update(lastPositions);
    }
  };
  viewer.scene.postRender.addEventListener(onPostRender);

  return {
    update,
    destroy() {
      if (destroyed) return;
      destroyed = true;
      try {
        viewer.scene.postRender.removeEventListener(onPostRender);
      } catch {}
      for (const it of items) it.handle.detach();
      items.length = 0;
      overlay.destroy();
    },
  };
}

/* entity ↔ segment labels 레지스트리 */

const registry = new WeakMap<Entity, SegmentLabelsHandle>();

export function registerSegmentLabels(entity: Entity, handle: SegmentLabelsHandle): void {
  const prev = registry.get(entity);
  if (prev && prev !== handle) prev.destroy();
  registry.set(entity, handle);
}

export function getSegmentLabels(entity: Entity): SegmentLabelsHandle | undefined {
  return registry.get(entity);
}

export function unregisterSegmentLabels(entity: Entity): void {
  const h = registry.get(entity);
  if (!h) return;
  h.destroy();
  registry.delete(entity);
}
