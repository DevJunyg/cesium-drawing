import { Cartesian3, SceneTransforms } from "cesium";
import type { Viewer } from "cesium";

export interface OverlayHostOptions {
  /** wrapper className (default: 'cesium-drawing-overlay') */
  wrapperClass?: string;
  /** wrapper z-index (default: 0) */
  zIndex?: number;
}

export interface AttachOptions {
  /** 픽셀 오프셋 (default: { x: 0, y: 0 }) */
  offset?: { x: number; y: number };
  /** 자식 element z-index */
  zIndex?: number;
}

export interface OverlayHandle {
  /** 위치 갱신 */
  update(position: Cartesian3): void;
  /** offset 변경 */
  setOffset(offset: { x: number; y: number }): void;
  /** 보임/숨김 */
  setVisible(visible: boolean): void;
  /** 분리 + DOM 제거 */
  detach(): void;
}

interface OverlayItem {
  el: HTMLElement;
  position: Cartesian3;
  offset: { x: number; y: number };
  visible: boolean;
}

export class OverlayHost {
  private _viewer: Viewer;
  private _wrapper: HTMLDivElement;
  private _items = new Set<OverlayItem>();
  private _onPostRender: (() => void) | null = null;
  private _destroyed = false;

  constructor(viewer: Viewer, options: OverlayHostOptions = {}) {
    this._viewer = viewer;

    this._wrapper = document.createElement("div");
    this._wrapper.className = options.wrapperClass ?? "cesium-drawing-overlay";
    Object.assign(this._wrapper.style, {
      position: "absolute",
      left: "0",
      top: "0",
      width: "100%",
      height: "100%",
      pointerEvents: "none",
      zIndex: String(options.zIndex ?? 0),
    });

    (viewer.container as HTMLElement).appendChild(this._wrapper);

    this._onPostRender = () => this._syncAll();
    this._viewer.scene.postRender.addEventListener(this._onPostRender);
  }

  /**
   * element 를 cartesian3 좌표에 부착한다.
   * 반환된 handle 로 위치 업데이트/제거 가능.
   *
   * 주의: 호출자가 element 의 절대 위치 스타일을 직접 만들지 마라.
   *      style.left/top 은 OverlayHost 가 매 프레임 갱신한다.
   */
  attach(el: HTMLElement, position: Cartesian3, options: AttachOptions = {}): OverlayHandle {
    el.style.position = "absolute";
    el.style.pointerEvents = el.style.pointerEvents || "auto";
    if (options.zIndex != null) el.style.zIndex = String(options.zIndex);

    this._wrapper.appendChild(el);

    const item: OverlayItem = {
      el,
      position: Cartesian3.clone(position, new Cartesian3()),
      offset: options.offset ?? { x: 0, y: 0 },
      visible: true,
    };
    this._items.add(item);
    this._syncOne(item);

    return {
      update: (next) => {
        Cartesian3.clone(next, item.position);
        this._syncOne(item);
      },
      setOffset: (off) => {
        item.offset = off;
        this._syncOne(item);
      },
      setVisible: (v) => {
        item.visible = v;
        item.el.style.display = v ? "" : "none";
      },
      detach: () => {
        this._items.delete(item);
        if (item.el.parentNode === this._wrapper) {
          this._wrapper.removeChild(item.el);
        }
      },
    };
  }

  /** wrapper element 를 직접 다루고 싶을 때 (custom 자식 추가 등) */
  get wrapper(): HTMLDivElement {
    return this._wrapper;
  }

  destroy(): void {
    if (this._destroyed) return;
    this._destroyed = true;

    if (this._onPostRender && !this._viewer.isDestroyed()) {
      this._viewer.scene.postRender.removeEventListener(this._onPostRender);
    }
    this._onPostRender = null;

    for (const item of this._items) {
      if (item.el.parentNode === this._wrapper) {
        this._wrapper.removeChild(item.el);
      }
    }
    this._items.clear();

    if (this._wrapper.parentNode) {
      this._wrapper.parentNode.removeChild(this._wrapper);
    }
  }

  private _syncAll(): void {
    if (this._destroyed) return;
    for (const item of this._items) this._syncOne(item);
  }

  private _syncOne(item: OverlayItem): void {
    if (!item.visible) return;
    const win = SceneTransforms.worldToWindowCoordinates(this._viewer.scene, item.position);
    if (!win) {
      item.el.style.display = "none";
      return;
    }
    item.el.style.display = "";
    item.el.style.left = `${Math.round(win.x + item.offset.x)}px`;
    item.el.style.top = `${Math.round(win.y + item.offset.y)}px`;
  }
}
