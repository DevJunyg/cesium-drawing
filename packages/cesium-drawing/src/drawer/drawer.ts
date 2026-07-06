import { Cartesian2, Cartesian3, Entity } from "cesium";
import type { Viewer } from "cesium";

import { InputBus, pickCartesian3, TypedEmitter } from "../core";
import type {
  DrawerState,
  InputBusOptions,
  InteractionMap,
  PickMode,
  ShapeType,
  Unsubscribe,
} from "../core";

import { DEFAULT_INTERACTION, mergeGraphics } from "./options";
import type { DrawerGraphicsOptions } from "./options";

import type { ShapeStrategy } from "./shapes/shape-base";
import { PointShape } from "./shapes/point";
import { PolylineShape } from "./shapes/polyline";
import { PolygonShape } from "./shapes/polygon";

export type DrawerEvents = {
  start: { shape: ShapeType };
  "point-add": {
    index: number;
    position: Cartesian3;
    positions: Cartesian3[];
  };
  "point-remove": { index: number; positions: Cartesian3[] };
  move: { hover: Cartesian3 | null; positions: Cartesian3[] };
  "points-change": {
    positions: Cartesian3[];
    reason: "add" | "remove" | "move" | "external";
  };
  finish: { entity: Entity; positions: Cartesian3[] };
  cancel: Record<string, never>;
  destroy: Record<string, never>;
};

export interface DrawerOptions {
  /** 도형 종류 (생성 후 변경 불가) */
  shape: ShapeType;
  /** pick 모드 (default: 'auto') */
  pickMode?: PickMode;
  /** 도형 그래픽 옵션 */
  graphics?: DrawerGraphicsOptions;
  /** 의미 액션 → 입력 제스처 매핑 (일부만 override 가능) */
  interaction?: InteractionMap;
  /** 같은 화면 좌표 클릭 무시 픽셀 (default: 0 = 가드 없음) */
  minClickDistance?: number;
  /** InputBus 옵션 */
  input?: InputBusOptions;
  /** 작도 중 breakpoint 점 표시 여부 (default: true). graphics.breakpoint=false 가 우선 */
  showBreakpoints?: boolean;
  cursor?: string | false;
}

export class Drawer extends TypedEmitter<DrawerEvents> {
  private _viewer: Viewer;
  private _shape: ShapeType;
  private _pickMode: PickMode;
  private _minClickDistance: number;
  private _showBreakpoints: boolean;
  private _cursor: string | false;
  private _cursorApplied = false;
  private static _cursorRefs: WeakMap<HTMLCanvasElement, { count: number; original: string }> =
    new WeakMap();

  private _strategy: ShapeStrategy;
  private _graphics: ReturnType<typeof mergeGraphics>;
  private _interaction: Required<InteractionMap>;

  private _bus: InputBus;
  private _busUnsubs: Unsubscribe[] = [];

  private _state: DrawerState = "idle";

  /** 확정된 점들 */
  private _positions: Cartesian3[] = [];
  /** 마우스 따라가는 임시 점 (pick 결과). drawing 중에만 유효 */
  private _hover: Cartesian3 | null = null;
  private _liveBuffer: Cartesian3[] = [];

  private _dynamicEntity: Entity | null = null;
  private _finalEntity: Entity | null = null;
  private _breakpointEntities: Entity[] = [];

  private _lastClickScreen: Cartesian2 | null = null;

  constructor(viewer: Viewer, options: DrawerOptions) {
    super();
    this._viewer = viewer;
    this._shape = options.shape;
    this._pickMode = options.pickMode ?? "auto";
    this._minClickDistance = options.minClickDistance ?? 0;
    this._showBreakpoints = options.showBreakpoints ?? true;
    this._cursor = options.cursor === undefined ? "crosshair" : options.cursor;
    this._graphics = mergeGraphics(this._shape, options.graphics);
    this._interaction = { ...DEFAULT_INTERACTION, ...options.interaction };
    this._strategy = createStrategy(this._shape, this._graphics);

    this._bus = new InputBus(viewer, options.input);
  }

  /* ---------------- public getters ---------------- */

  get state(): DrawerState {
    return this._state;
  }
  /** 확정된 좌표 (snapshot — 외부에서 mutate 불가) */
  get positions(): Cartesian3[] {
    return this._positions.map((p) => Cartesian3.clone(p, new Cartesian3()));
  }
  /** 현재 hover 좌표 (drawing 중에만 의미) */
  get hover(): Cartesian3 | null {
    return this._hover ? Cartesian3.clone(this._hover, new Cartesian3()) : null;
  }
  /** 종료 후 추가된 정적 entity */
  get entity(): Entity | null {
    return this._finalEntity;
  }
  get shape(): ShapeType {
    return this._shape;
  }

  /* ---------------- lifecycle ---------------- */

  start(): void {
    if (this._state !== "idle") return;
    this._state = "drawing";
    this._wireBus();
    this._applyCursor();
    this.emit("start", { shape: this._shape });
    this._viewer.scene.requestRender();
  }

  /**
   * 작도 종료 강제
   */
  finish(): Entity | null {
    if (this._state !== "drawing") return this._finalEntity;

    if (this._positions.length < this._strategy.minPoints) {
      this.reset();
      this.emit("cancel", {});
      return null;
    }

    const positions = this._positions.map((p) => Cartesian3.clone(p, new Cartesian3()));

    this._removeDynamic();
    this._removeBreakpoints();

    const entity = this._strategy.createFinalEntity(positions);
    this._viewer.entities.add(entity);
    this._finalEntity = entity;

    this._state = "finished";
    this._unwireBus();
    this._restoreCursor();
    this._lastClickScreen = null;

    this.emit("finish", { entity, positions });
    this._viewer.scene.requestRender();
    return entity;
  }

  /** 모든 entity 정리 후 idle 로 */
  reset(): void {
    if (this._state === "destroyed") return;
    this._unwireBus();
    this._removeDynamic();
    this._removeBreakpoints();
    this._removeFinal();
    this._restoreCursor();
    this._positions = [];
    this._liveBuffer.length = 0;
    this._hover = null;
    this._lastClickScreen = null;
    this._state = "idle";
    this._viewer.scene.requestRender();
  }

  /**
   * 영구 dispose. 인스턴스 재사용 불가.
   *
   */
  destroy(): void {
    if (this._state === "destroyed") return;
    if (this._state === "drawing") {
      this.reset();
    } else {
      // 'finished' or 'idle' — final entity 와 부속 리소스는 그대로 두고 controller 만 정리
      this._unwireBus();
      this._restoreCursor();
    }
    this._state = "destroyed";
    this.emit("destroy", {});
    this._bus.destroy();
    this.removeAllListeners();
  }

  /* ---------------- editing ---------------- */

  /**
   * 외부에서 좌표를 직접 갱신
   */
  updatePositions(positions: Cartesian3[]): void {
    if (this._state === "idle" || this._state === "destroyed") return;

    const cloned = positions.map((p) => Cartesian3.clone(p, new Cartesian3()));
    this._positions = cloned;

    if (this._state === "finished") {
      this._removeFinal();
      if (this._positions.length >= this._strategy.minPoints) {
        const entity = this._strategy.createFinalEntity(this._positions);
        this._viewer.entities.add(entity);
        this._finalEntity = entity;
      }
    } else if (this._state === "drawing") {
      this._removeBreakpoints();
      if (this._positions.length > 0) {
        // dynamic entity 가 없으면 재생성
        if (!this._dynamicEntity && this._shape !== "POINT") {
          this._dynamicEntity = this._strategy.createDynamicEntity(() => this._liveBuffer);
          this._viewer.entities.add(this._dynamicEntity);
        }
        if (this._showBreakpoints && this._graphics.breakpoint !== false) {
          for (const p of this._positions) {
            const bp = new Entity({ position: p, point: { ...this._graphics.breakpoint } });
            this._viewer.entities.add(bp);
            this._breakpointEntities.push(bp);
          }
        }
      } else {
        this._removeDynamic();
      }
      this._refreshLiveBuffer();
    }

    this.emit("points-change", {
      positions: this._positions.map((p) => Cartesian3.clone(p, new Cartesian3())),
      reason: "external",
    });
    this._viewer.scene.requestRender();
  }

  /* ---------------- key binding ---------------- */

  /**
   * 키 핸들러 등록
   */
  bindKey(key: string, handler: () => void): Unsubscribe {
    return this._bus.on("key", (e) => {
      if (e.key === key) handler();
    });
  }

  static render(
    viewer: Viewer,
    options: {
      shape: ShapeType;
      positions: Cartesian3[];
      graphics?: DrawerGraphicsOptions;
    }
  ): Entity | null {
    const graphics = mergeGraphics(options.shape, options.graphics);
    const strategy = createStrategy(options.shape, graphics);
    if (options.positions.length < strategy.minPoints) return null;

    const entity = strategy.createFinalEntity(
      options.positions.map((p) => Cartesian3.clone(p, new Cartesian3()))
    );
    viewer.entities.add(entity);
    viewer.scene.requestRender();
    return entity;
  }

  private _wireBus(): void {
    const u: Unsubscribe[] = [];

    const addGesture = this._interaction["add-point"];
    const finishGesture = this._interaction["finish"];
    const removeGesture = this._interaction["remove-point"];
    const cancelGesture = this._interaction["cancel-mode"];

    if (addGesture) {
      u.push(
        this._bus.on(addGesture, (e) => {
          if ("screenPos" in e) this._handleAddPoint(e.screenPos);
        })
      );
    }
    if (finishGesture) {
      u.push(
        this._bus.on(finishGesture, () => {
          this._handleFinish();
        })
      );
    }

    if (removeGesture && cancelGesture && removeGesture === cancelGesture) {
      u.push(
        this._bus.on(removeGesture, () => {
          if (this._positions.length === 0) this._handleCancelMode();
          else this._handleRemovePoint();
        })
      );
    } else {
      if (removeGesture) {
        u.push(
          this._bus.on(removeGesture, () => {
            this._handleRemovePoint();
          })
        );
      }
      if (cancelGesture) {
        u.push(
          this._bus.on(cancelGesture, () => {
            if (this._positions.length === 0) this._handleCancelMode();
          })
        );
      }
    }

    // hover 추적
    u.push(
      this._bus.on("move", (e) => {
        this._handleHoverMove(e.screenPos);
      })
    );

    this._busUnsubs = u;
  }

  private _unwireBus(): void {
    for (const off of this._busUnsubs) off();
    this._busUnsubs = [];
  }

  private _handleAddPoint(screenPos: Cartesian2): void {
    if (this._state !== "drawing") return;

    if (this._minClickDistance > 0 && this._lastClickScreen) {
      const d = Cartesian2.distance(screenPos, this._lastClickScreen);
      if (d < this._minClickDistance) return;
    }

    const c = pickCartesian3(this._viewer, screenPos, { mode: this._pickMode });
    if (!c) return;

    this._lastClickScreen = Cartesian2.clone(screenPos, new Cartesian2());

    // 첫 점이면 dynamic entity 생성 (POINT 제외)
    if (this._positions.length === 0 && this._shape !== "POINT" && !this._dynamicEntity) {
      this._dynamicEntity = this._strategy.createDynamicEntity(() => this._liveBuffer);
      this._viewer.entities.add(this._dynamicEntity);
    }

    this._positions.push(c);
    this._refreshLiveBuffer();

    if (this._showBreakpoints && this._graphics.breakpoint !== false && this._shape !== "POINT") {
      const bp = new Entity({ position: c, point: { ...this._graphics.breakpoint } });
      this._viewer.entities.add(bp);
      this._breakpointEntities.push(bp);
    }

    const idx = this._positions.length - 1;
    this.emit("point-add", {
      index: idx,
      position: Cartesian3.clone(c, new Cartesian3()),
      positions: this._snapshotPositions(),
    });
    this.emit("points-change", {
      positions: this._snapshotPositions(),
      reason: "add",
    });
    this._viewer.scene.requestRender();

    if (this._shape === "POINT") {
      this.finish();
    }
  }

  private _handleRemovePoint(): void {
    if (this._state !== "drawing") return;
    if (this._positions.length === 0) return;

    this._positions.pop();
    const bp = this._breakpointEntities.pop();
    if (bp) this._viewer.entities.remove(bp);

    if (this._positions.length === 0) {
      this._removeDynamic();
      this._lastClickScreen = null;
    }
    this._refreshLiveBuffer();

    this.emit("point-remove", {
      index: this._positions.length,
      positions: this._snapshotPositions(),
    });
    this.emit("points-change", {
      positions: this._snapshotPositions(),
      reason: "remove",
    });
    this._viewer.scene.requestRender();
  }

  private _handleFinish(): void {
    if (this._state !== "drawing") return;

    if (this._positions.length > 0) {
      this._positions.pop();
      const bp = this._breakpointEntities.pop();
      if (bp) this._viewer.entities.remove(bp);
      this._refreshLiveBuffer();
      this.emit("point-remove", {
        index: this._positions.length,
        positions: this._snapshotPositions(),
      });
    }

    this.finish();
  }

  private _handleCancelMode(): void {
    if (this._state !== "drawing") return;
    this.reset();
    this.emit("cancel", {});
  }

  private _handleHoverMove(screenPos: Cartesian2): void {
    if (this._state !== "drawing") return;

    const c = pickCartesian3(this._viewer, screenPos, { mode: this._pickMode });
    if (c) this._hover = c;
    this._refreshLiveBuffer();

    this.emit("move", {
      hover: this._hover ? Cartesian3.clone(this._hover, new Cartesian3()) : null,
      positions: this._snapshotPositions(),
    });
    this._viewer.scene.requestRender();
  }

  private _refreshLiveBuffer(): void {
    this._liveBuffer.length = 0;
    for (const p of this._positions) this._liveBuffer.push(p);
    if (this._state === "drawing" && this._hover) {
      this._liveBuffer.push(this._hover);
    }
  }

  private _snapshotPositions(): Cartesian3[] {
    return this._positions.map((p) => Cartesian3.clone(p, new Cartesian3()));
  }

  private _removeDynamic(): void {
    if (this._dynamicEntity) {
      this._viewer.entities.remove(this._dynamicEntity);
      this._dynamicEntity = null;
    }
  }

  private _removeFinal(): void {
    if (this._finalEntity) {
      this._viewer.entities.remove(this._finalEntity);
      this._finalEntity = null;
    }
  }

  private _removeBreakpoints(): void {
    for (const bp of this._breakpointEntities) {
      this._viewer.entities.remove(bp);
    }
    this._breakpointEntities = [];
  }

  private _applyCursor(): void {
    if (this._cursor === false) return;
    if (this._viewer.isDestroyed()) return;
    const canvas = this._viewer.canvas;
    if (!canvas) return;

    let entry = Drawer._cursorRefs.get(canvas);
    if (!entry) {
      // 첫 번째 Drawer — 현재 cursor 를 original 로 기억
      entry = { count: 0, original: canvas.style.cursor ?? "" };
      Drawer._cursorRefs.set(canvas, entry);
    }
    entry.count++;
    canvas.style.cursor = this._cursor;
    this._cursorApplied = true;
  }

  private _restoreCursor(): void {
    if (!this._cursorApplied) return;
    this._cursorApplied = false;

    if (this._viewer.isDestroyed()) return;
    const canvas = this._viewer.canvas;
    if (!canvas) return;

    const entry = Drawer._cursorRefs.get(canvas);
    if (!entry) return;
    entry.count--;
    if (entry.count <= 0) {
      canvas.style.cursor = entry.original;
      Drawer._cursorRefs.delete(canvas);
    }
  }
}

function createStrategy(
  shape: ShapeType,
  graphics: ReturnType<typeof mergeGraphics>
): ShapeStrategy {
  switch (shape) {
    case "POINT":
      return new PointShape({
        active: graphics.active as object,
        final: graphics.final as object,
      });
    case "POLYLINE":
      return new PolylineShape({
        active: graphics.active as object,
        final: graphics.final as object,
      });
    case "POLYGON":
      return new PolygonShape({
        active: graphics.active as object,
        final: graphics.final as object,
        outline: graphics.outline,
      });
  }
}
