import { Cartesian2, ScreenSpaceEventHandler, ScreenSpaceEventType } from "cesium";
import type { Viewer } from "cesium";

import { TypedEmitter } from "./emitter";
import type { InputGestureMap, InputSource } from "./types";

export interface InputBusOptions {
  /** 드래그로 인정할 픽셀 임계 (default: 5) */
  dragThreshold?: number;
  /** longpress 시간 ms (default: 500) */
  longpressDuration?: number;
  /** keydown 리스너 부착 여부 (default: true) */
  enableKeyEvents?: boolean;
  /**
   * 키 입력을 받기 위해 viewer.canvas 의 tabIndex 를 조정할지 여부 (default: true).
   * canvas 가 focus 가능해야 keydown 이 발생한다.
   */
  ensureCanvasFocusable?: boolean;
}

export class InputBus extends TypedEmitter<InputGestureMap> {
  private _viewer: Viewer;
  private _ssh: ScreenSpaceEventHandler;
  private _options: Required<InputBusOptions>;

  // 입력 source 추적
  private _lastSource: InputSource = "mouse";

  // 드래그 상태
  private _dragStartPos: Cartesian2 | null = null;
  private _dragging = false;

  // longpress 상태
  private _longpressTimer: ReturnType<typeof setTimeout> | null = null;
  private _longpressOrigin: Cartesian2 | null = null;
  private _longpressFired = false;

  // native listener 핸들
  private _onPointerDown: ((e: PointerEvent) => void) | null = null;
  private _onKeyDown: ((e: KeyboardEvent) => void) | null = null;

  private _enabled = true;
  private _destroyed = false;

  constructor(viewer: Viewer, options: InputBusOptions = {}) {
    super();
    this._viewer = viewer;
    this._options = {
      dragThreshold: options.dragThreshold ?? 5,
      longpressDuration: options.longpressDuration ?? 500,
      enableKeyEvents: options.enableKeyEvents ?? true,
      ensureCanvasFocusable: options.ensureCanvasFocusable ?? true,
    };

    this._ssh = new ScreenSpaceEventHandler(viewer.canvas);
    this._setupCesiumHandlers();
    this._setupPointerSourceTracking();
    if (this._options.enableKeyEvents) this._setupKeyHandler();
  }

  /** false 로 두면 모든 emit 이 정지 (drawer pause/resume 용). */
  get enabled(): boolean {
    return this._enabled;
  }
  set enabled(v: boolean) {
    this._enabled = v;
    if (!v) this._clearLongpress();
  }

  get destroyed(): boolean {
    return this._destroyed;
  }

  destroy(): void {
    if (this._destroyed) return;
    this._destroyed = true;
    this._enabled = false;

    this._clearLongpress();

    if (!this._ssh.isDestroyed()) this._ssh.destroy();

    if (this._onPointerDown) {
      this._viewer.canvas.removeEventListener("pointerdown", this._onPointerDown);
      this._onPointerDown = null;
    }
    if (this._onKeyDown) {
      this._viewer.canvas.removeEventListener("keydown", this._onKeyDown);
      this._onKeyDown = null;
    }

    this.removeAllListeners();
  }

  /* ---------------------------------------------------------------------- */

  private _setupCesiumHandlers(): void {
    const ssh = this._ssh;

    // 단일 클릭 → tap (즉시 emit, 디바운스 없음)
    ssh.setInputAction((m: { position: Cartesian2 }) => {
      if (!this._enabled) return;
      // longpress 가 이미 발화한 경우 LEFT_CLICK 은 무시 (touch hold → click 중복 방지)
      if (this._longpressFired) {
        this._longpressFired = false;
        return;
      }
      this.emit("tap", this._screenPayload(m.position));
    }, ScreenSpaceEventType.LEFT_CLICK);

    // 더블 클릭 → doubletap (cesium 이 LEFT_CLICK 두 번에 더해 별도로 발생시킴)
    ssh.setInputAction((m: { position: Cartesian2 }) => {
      if (!this._enabled) return;
      this.emit("doubletap", this._screenPayload(m.position));
    }, ScreenSpaceEventType.LEFT_DOUBLE_CLICK);

    // 우클릭 → contextmenu (마우스)
    ssh.setInputAction((m: { position: Cartesian2 }) => {
      if (!this._enabled) return;
      this.emit("contextmenu", this._screenPayload(m.position));
    }, ScreenSpaceEventType.RIGHT_CLICK);

    // 이동
    ssh.setInputAction((m: { startPosition: Cartesian2; endPosition: Cartesian2 }) => {
      if (!this._enabled) return;

      this.emit("move", this._screenPayload(m.endPosition));

      // longpress 후보 위치에서 이동이 임계 초과 → longpress 취소
      if (this._longpressOrigin) {
        const d = Cartesian2.distance(m.endPosition, this._longpressOrigin);
        if (d > this._options.dragThreshold) this._clearLongpress();
      }

      // 드래그 합성
      if (this._dragStartPos) {
        const d = Cartesian2.distance(m.endPosition, this._dragStartPos);
        if (!this._dragging && d > this._options.dragThreshold) {
          this._dragging = true;
          this.emit("drag-start", this._dragPayload(m.endPosition));
        } else if (this._dragging) {
          this.emit("drag-move", this._dragPayload(m.endPosition));
        }
      }
    }, ScreenSpaceEventType.MOUSE_MOVE);

    // 누름
    ssh.setInputAction((m: { position: Cartesian2 }) => {
      if (!this._enabled) return;
      this._longpressFired = false;
      this._dragStartPos = Cartesian2.clone(m.position, new Cartesian2());
      this._dragging = false;
      this._startLongpress(m.position);
    }, ScreenSpaceEventType.LEFT_DOWN);

    // 뗌
    ssh.setInputAction((m: { position: Cartesian2 }) => {
      if (!this._enabled) {
        this._dragStartPos = null;
        this._dragging = false;
        return;
      }
      this._clearLongpress();

      if (this._dragging) {
        this.emit("drag-end", this._dragPayload(m.position));
      }
      this._dragStartPos = null;
      this._dragging = false;
    }, ScreenSpaceEventType.LEFT_UP);
  }

  private _setupPointerSourceTracking(): void {
    this._onPointerDown = (e: PointerEvent) => {
      const t = e.pointerType as InputSource | "";
      if (t === "mouse" || t === "touch" || t === "pen") this._lastSource = t;
    };
    this._viewer.canvas.addEventListener("pointerdown", this._onPointerDown);
  }

  private _setupKeyHandler(): void {
    if (this._options.ensureCanvasFocusable && this._viewer.canvas.tabIndex < 0) {
      this._viewer.canvas.tabIndex = 0;
    }
    this._onKeyDown = (e: KeyboardEvent) => {
      if (!this._enabled) return;
      this.emit("key", { key: e.key, source: "key", timestamp: Date.now() });
    };
    this._viewer.canvas.addEventListener("keydown", this._onKeyDown);
  }

  /* ---------------------------------------------------------------------- */

  private _startLongpress(pos: Cartesian2): void {
    this._clearLongpress();
    this._longpressOrigin = Cartesian2.clone(pos, new Cartesian2());
    this._longpressTimer = setTimeout(() => {
      this._longpressTimer = null;
      if (!this._enabled || !this._longpressOrigin) return;
      this._longpressFired = true;
      this.emit("contextmenu", this._screenPayload(this._longpressOrigin));
    }, this._options.longpressDuration);
  }

  private _clearLongpress(): void {
    if (this._longpressTimer !== null) {
      clearTimeout(this._longpressTimer);
      this._longpressTimer = null;
    }
    this._longpressOrigin = null;
  }

  private _screenPayload(pos: Cartesian2) {
    return {
      screenPos: Cartesian2.clone(pos, new Cartesian2()),
      source: this._lastSource,
      timestamp: Date.now(),
    };
  }

  private _dragPayload(currentPos: Cartesian2) {
    const start = this._dragStartPos!;
    const startCloned = Cartesian2.clone(start, new Cartesian2());
    const screen = Cartesian2.clone(currentPos, new Cartesian2());
    const delta = Cartesian2.subtract(currentPos, start, new Cartesian2());
    return {
      screenPos: screen,
      startPos: startCloned,
      delta,
      source: this._lastSource,
      timestamp: Date.now(),
    };
  }
}
