import {
  CallbackPositionProperty,
  CallbackProperty,
  Cartesian2,
  Cartesian3,
  Cartographic,
  Color,
  Entity,
  HeightReference,
  JulianDate,
  PolygonHierarchy,
  SceneMode,
  SceneTransforms,
  ScreenSpaceEventHandler,
  ScreenSpaceEventType,
} from "cesium";
import type { PointGraphics, Viewer } from "cesium";

import { TypedEmitter } from "../core/emitter";
import type { Unsubscribe } from "../core/emitter";
import { pickCartesian3 } from "../core/pick";
import type { PickMode } from "../core/types";

export type VertexEditorState = "idle" | "enabled" | "destroyed";

export type VertexEditorEvents = {
  enable: Record<string, never>;
  disable: Record<string, never>;
  "drag-start": { vertexIndex: number; position: Cartesian3 };
  drag: {
    vertexIndex: number;
    position: Cartesian3;
    positions: Cartesian3[];
  };
  "drag-end": {
    vertexIndex: number;
    position: Cartesian3;
    positions: Cartesian3[];
  };
  /** 미드포인트 promotion 또는 외부 추가로 새 vertex 가 생성됨 */
  "vertex-add": {
    index: number;
    position: Cartesian3;
    positions: Cartesian3[];
  };
  /** 우클릭 또는 외부 호출로 vertex 가 제거됨 */
  "vertex-remove": { index: number; positions: Cartesian3[] };
  /** vertex 위 hover 시작 (한 vertex → 다른 vertex 이동 시도 hover-leave + hover-enter). canDelete = 최소 점 갯수 초과 여부 */
  "vertex-hover-enter": {
    index: number;
    position: Cartesian3;
    canDelete: boolean;
  };
  /** vertex hover 종료 (vertex 떠남 또는 drag 진입) */
  "vertex-hover-leave": Record<string, never>;
  /** midpoint 위 hover 시작 — "점 추가" 안내용 */
  "midpoint-hover-enter": {
    index: number;
    position: Cartesian3;
  };
  /** midpoint hover 종료 */
  "midpoint-hover-leave": Record<string, never>;
  /** 좌표가 바뀐 경우. drag 는 매 mousemove, external 은 vertex add/remove + setPositions 포함 */
  change: { positions: Cartesian3[]; reason: "drag" | "external" };
  destroy: Record<string, never>;
};

export interface VertexEditorOptions {
  /** pick 모드 (default: 'auto') */
  pickMode?: PickMode;
  /** vertex 핸들 점 그래픽 옵션 */
  vertexGraphics?: PointGraphics.ConstructorOptions;
  disableCameraDuringDrag?: boolean;
}

const VERTEX_BRAND_COLOR = Color.fromCssColorString("#40E6DF");

const VERTEX_VISUAL = {
  base: {
    pixelSize: 11,
    color: Color.WHITE,
    outlineColor: VERTEX_BRAND_COLOR,
  },
  hover: {
    pixelSize: 13,
    color: Color.WHITE,
    outlineColor: VERTEX_BRAND_COLOR,
  },
  drag: {
    pixelSize: 14,
    color: VERTEX_BRAND_COLOR,
    outlineColor: Color.WHITE,
  },
} as const;

const VERTEX_OUTLINE_WIDTH = 4;

const DEFAULT_VERTEX_GRAPHICS: PointGraphics.ConstructorOptions = {
  ...VERTEX_VISUAL.base,
  outlineWidth: VERTEX_OUTLINE_WIDTH,
  disableDepthTestDistance: Number.POSITIVE_INFINITY,
};

const MIDPOINT_VISUAL = {
  base: {
    pixelSize: 8,
    color: Color.WHITE.withAlpha(0.6),
    outlineColor: VERTEX_BRAND_COLOR.withAlpha(0.6),
  },
  hover: {
    pixelSize: 11,
    color: Color.WHITE,
    outlineColor: VERTEX_BRAND_COLOR,
  },
} as const;
const MIDPOINT_OUTLINE_WIDTH = 2;

interface CameraEnableSnapshot {
  enableRotate: boolean;
  enableTilt: boolean;
  enableTranslate: boolean;
  enableZoom: boolean;
  enableLook: boolean;
}

export class VertexEditor extends TypedEmitter<VertexEditorEvents> {
  private _viewer: Viewer;
  private _entity: Entity;
  private _ssh: ScreenSpaceEventHandler;

  private _vertexEntities: Entity[] = [];
  private _positions: Cartesian3[] = [];

  private _state: VertexEditorState = "idle";
  private _activeIndex: number | null = null;

  private _pickMode: PickMode;
  private _vertexGraphics: PointGraphics.ConstructorOptions;
  private _disableCameraDuringDrag: boolean;

  private _savedCameraState: CameraEnableSnapshot | null = null;

  private _liveBuffer: Cartesian3[] = [];
  private _liveActive = false;

  /** 마우스가 hover 중인 vertex 핸들 인덱스 (없으면 null). visual + cursor 변경에 사용. */
  private _hoverIndex: number | null = null;
  /** 마우스가 hover 중인 midpoint 핸들 인덱스 */
  private _hoverMidpointIndex: number | null = null;
  /** vertex 위 cursor 변경. enable 진입 시점의 원본을 보관, 떠날 때 복원. */
  private _previousCursor: string | null = null;

  /** Midpoint 핸들 entity */
  private _midpointEntities: Entity[] = [];

  /** scene-mode-aware heightReference  */
  private _heightRefProp: CallbackProperty | null = null;

  constructor(viewer: Viewer, entity: Entity, options: VertexEditorOptions = {}) {
    super();
    this._viewer = viewer;
    this._entity = entity;
    this._pickMode = options.pickMode ?? "auto";
    this._vertexGraphics = {
      ...DEFAULT_VERTEX_GRAPHICS,
      ...options.vertexGraphics,
    };
    this._disableCameraDuringDrag = options.disableCameraDuringDrag ?? true;

    this._ssh = new ScreenSpaceEventHandler(viewer.canvas);
    this._readPositionsFromEntity();
  }

  /* ---------------- getters ---------------- */

  get state(): VertexEditorState {
    return this._state;
  }
  get positions(): Cartesian3[] {
    return this._positions.map((p) => Cartesian3.clone(p, new Cartesian3()));
  }
  get entity(): Entity {
    return this._entity;
  }

  /* ---------------- lifecycle ---------------- */

  enable(): void {
    if (this._state !== "idle") return;

    const clamped = this._clampPositionsToTerrain();

    this._activateLiveMode();
    this._createVertexEntities();
    this._createMidpointEntities();
    this._wireHandlers();
    this._state = "enabled";

    if (clamped) {
      this.emit("change", {
        positions: this.positions,
        reason: "external",
      });
    }

    this.emit("enable", {});
    this._viewer.scene.requestRender();
  }

  private _clampPositionsToTerrain(): boolean {
    const globe = this._viewer.scene.globe;
    if (!globe) return false;

    let changed = false;
    for (let i = 0; i < this._positions.length; i++) {
      const pos = this._positions[i];
      const carto = Cartographic.fromCartesian(pos);
      const h = globe.getHeight(carto);
      if (h === undefined) continue;
      // 1cm 이상 차이 시에만 갱신
      if (Math.abs(h - carto.height) > 0.01) {
        carto.height = h;
        this._positions[i] = Cartographic.toCartesian(carto, globe.ellipsoid, new Cartesian3());
        changed = true;
      }
    }
    return changed;
  }

  disable(): void {
    if (this._state !== "enabled") return;
    if (this._activeIndex !== null) this._endDrag();
    this._unwireHandlers();
    this._removeVertexEntities();
    this._removeMidpointEntities();
    this._deactivateLiveMode();
    this._restoreCursor();
    this._hoverIndex = null;
    this._hoverMidpointIndex = null;
    this._state = "idle";
    this.emit("disable", {});
    this._viewer.scene.requestRender();
  }

  destroy(): void {
    if (this._state === "destroyed") return;
    if (this._state === "enabled") this.disable();
    if (!this._ssh.isDestroyed()) this._ssh.destroy();
    this._state = "destroyed";
    this.emit("destroy", {});
    this.removeAllListeners();
  }

  /**
   * 외부에서 좌표직접 갱신
   */
  setPositions(positions: Cartesian3[]): void {
    this._positions = positions.map((p) => Cartesian3.clone(p, new Cartesian3()));

    if (this._liveActive) {
      this._liveBuffer.length = 0;
      for (const p of this._positions) this._liveBuffer.push(p);
      if (
        this._entity.position !== undefined &&
        this._positions.length === 1 &&
        !this._entity.polygon &&
        !this._entity.polyline
      ) {
        (this._entity as any).position = this._positions[0];
      }
    } else {
      this._writePositionsToEntity();
    }

    if (this._state === "enabled") {
      this._removeVertexEntities();
      this._removeMidpointEntities();
      this._createVertexEntities();
      this._createMidpointEntities();
    }

    this.emit("change", { positions: this.positions, reason: "external" });
    this._viewer.scene.requestRender();
  }

  onChange(handler: (e: VertexEditorEvents["change"]) => void): Unsubscribe {
    return this.on("change", handler);
  }

  private _readPositionsFromEntity(): void {
    const time = JulianDate.now();
    const e = this._entity;

    if (e.polygon?.hierarchy) {
      const v: any = (e.polygon.hierarchy as any).getValue?.(time) ?? e.polygon.hierarchy;
      if (v?.positions && Array.isArray(v.positions)) {
        this._positions = v.positions.map((p: Cartesian3) => Cartesian3.clone(p, new Cartesian3()));
      } else if (Array.isArray(v)) {
        this._positions = v.map((p: Cartesian3) => Cartesian3.clone(p, new Cartesian3()));
      }
    } else if (e.polyline?.positions) {
      const v: any = (e.polyline.positions as any).getValue?.(time) ?? e.polyline.positions;
      if (Array.isArray(v)) {
        this._positions = v.map((p: Cartesian3) => Cartesian3.clone(p, new Cartesian3()));
      }
    } else if (e.position) {
      const v: any = (e.position as any).getValue?.(time) ?? e.position;
      if (v) this._positions = [Cartesian3.clone(v, new Cartesian3())];
    }
  }

  private _writePositionsToEntity(): void {
    const e = this._entity;

    if (e.polygon?.hierarchy !== undefined) {
      (e.polygon as any).hierarchy = new PolygonHierarchy(this._positions);
      // 외곽선 폴리라인이 함께 있으면 닫힌 경로로 동기화
      if (e.polyline?.positions !== undefined && this._positions.length > 0) {
        (e.polyline as any).positions = [...this._positions, this._positions[0]];
      }
      return;
    }
    if (e.polyline?.positions !== undefined) {
      (e.polyline as any).positions = this._positions;
      return;
    }
    if (e.position !== undefined && this._positions.length === 1) {
      (e as any).position = this._positions[0];
    }
  }

  private _activateLiveMode(): void {
    if (this._liveActive) return;

    // _positions 를 buffer 로 복사 (참조가 아닌 별도 인스턴스)
    this._liveBuffer.length = 0;
    for (const p of this._positions) {
      this._liveBuffer.push(Cartesian3.clone(p, new Cartesian3()));
    }

    const e = this._entity;

    if (e.polygon?.hierarchy !== undefined) {
      (e.polygon as any).hierarchy = new CallbackProperty(
        () => new PolygonHierarchy(this._liveBuffer),
        false
      );
      // 외곽선 폴리라인 (있으면) 도 closed loop 으로
      if (e.polyline?.positions !== undefined) {
        (e.polyline as any).positions = new CallbackProperty(() => {
          if (this._liveBuffer.length < 2) return this._liveBuffer;
          return [...this._liveBuffer, this._liveBuffer[0]];
        }, false);
      }
    } else if (e.polyline?.positions !== undefined) {
      (e.polyline as any).positions = new CallbackProperty(() => this._liveBuffer, false);
    }
    // POINT 는 wrapping 안 함 — _onMove 에서 직접 entity.position = c

    this._liveActive = true;
  }

  /**
   * 편집 종료 시 정적 좌표로 복원. CallbackProperty 를 제거하고 일반 배열/객체로 교체.
   */
  private _deactivateLiveMode(): void {
    if (!this._liveActive) return;
    // _writePositionsToEntity 가 정적 배열/PolygonHierarchy 로 직접 write —
    this._writePositionsToEntity();
    this._liveBuffer.length = 0;
    this._liveActive = false;
  }

  /* ---------------- private — vertex handle entities ---------------- */

  private _ensureHeightRefProp(): CallbackProperty {
    if (!this._heightRefProp) {
      this._heightRefProp = new CallbackProperty(
        () =>
          this._viewer.scene.mode === SceneMode.SCENE3D
            ? HeightReference.CLAMP_TO_GROUND
            : HeightReference.NONE,
        false
      );
    }
    return this._heightRefProp;
  }

  private _createVertexEntities(): void {
    const heightRefProp = this._ensureHeightRefProp();

    for (let i = 0; i < this._positions.length; i++) {
      const idx = i; // 클로저 캡처

      // 상태 (base / hover / drag) 별 visual 을 CallbackProperty 로 매 프레임 평가
      const pixelSizeProp = new CallbackProperty(() => {
        if (this._activeIndex === idx) return VERTEX_VISUAL.drag.pixelSize;
        if (this._hoverIndex === idx) return VERTEX_VISUAL.hover.pixelSize;
        return VERTEX_VISUAL.base.pixelSize;
      }, false);
      const colorProp = new CallbackProperty(() => {
        if (this._activeIndex === idx) return VERTEX_VISUAL.drag.color;
        if (this._hoverIndex === idx) return VERTEX_VISUAL.hover.color;
        return VERTEX_VISUAL.base.color;
      }, false);
      const outlineColorProp = new CallbackProperty(() => {
        if (this._activeIndex === idx) return VERTEX_VISUAL.drag.outlineColor;
        if (this._hoverIndex === idx) return VERTEX_VISUAL.hover.outlineColor;
        return VERTEX_VISUAL.base.outlineColor;
      }, false);

      const ve = new Entity({
        position: this._positions[idx],
        point: {
          ...this._vertexGraphics,
          // state-based 항목들은 CallbackProperty 가 사용자 override 보다 우선
          pixelSize: pixelSizeProp,
          color: colorProp,
          outlineColor: outlineColorProp,
          outlineWidth: VERTEX_OUTLINE_WIDTH,
          heightReference: heightRefProp,
        },
      });
      this._viewer.entities.add(ve);
      this._vertexEntities.push(ve);
    }
  }

  private _removeVertexEntities(): void {
    for (const ve of this._vertexEntities) {
      this._viewer.entities.remove(ve);
    }
    this._vertexEntities = [];
  }

  /* ---------------- midpoint handles ---------------- */

  /**
   * 인접 vertex 사이 중간점에 작은 핸들 생성. 클릭 시 그 자리에 새 vertex 추가.
   *
   *   POLYGON  : 닫힌 루프라 N 개 (마지막 ↔ 첫 점 사이 포함)
   *   POLYLINE : N-1 개
   *   POINT    : 미생성
   */
  private _createMidpointEntities(): void {
    if (this._positions.length < 2) return;
    if (!this._entity.polygon && !this._entity.polyline) return;

    const isPolygon = !!this._entity.polygon;
    const N = this._positions.length;
    const count = isPolygon ? N : N - 1;

    const heightRefProp = this._ensureHeightRefProp();

    for (let i = 0; i < count; i++) {
      const idx = i;
      const next = isPolygon ? (i + 1) % N : i + 1;

      // 매 프레임 _liveBuffer (활성) 또는 _positions (비활성) 의 두 점 중간 계산
      const positionProp = new CallbackPositionProperty((_time, result) => {
        const buf = this._liveActive ? this._liveBuffer : this._positions;
        const a = buf[idx];
        const b = buf[next];
        if (!a || !b) return undefined;
        return Cartesian3.midpoint(a, b, result ?? new Cartesian3());
      }, false);

      const pixelSizeProp = new CallbackProperty(
        () =>
          this._hoverMidpointIndex === idx
            ? MIDPOINT_VISUAL.hover.pixelSize
            : MIDPOINT_VISUAL.base.pixelSize,
        false
      );
      const colorProp = new CallbackProperty(
        () =>
          this._hoverMidpointIndex === idx
            ? MIDPOINT_VISUAL.hover.color
            : MIDPOINT_VISUAL.base.color,
        false
      );
      const outlineColorProp = new CallbackProperty(
        () =>
          this._hoverMidpointIndex === idx
            ? MIDPOINT_VISUAL.hover.outlineColor
            : MIDPOINT_VISUAL.base.outlineColor,
        false
      );

      const mp = new Entity({
        position: positionProp,
        point: {
          pixelSize: pixelSizeProp,
          color: colorProp,
          outlineColor: outlineColorProp,
          outlineWidth: MIDPOINT_OUTLINE_WIDTH,
          heightReference: heightRefProp,
          disableDepthTestDistance: Number.POSITIVE_INFINITY,
        },
      });
      this._viewer.entities.add(mp);
      this._midpointEntities.push(mp);
    }
  }

  private _removeMidpointEntities(): void {
    for (const mp of this._midpointEntities) {
      this._viewer.entities.remove(mp);
    }
    this._midpointEntities = [];
  }

  /* ---------------- topology ops (vertex add / remove) ---------------- */

  /** 도형별 최소 점 갯수 — 그 이하로 vertex 제거 불가 */
  private _getMinPoints(): number {
    if (this._entity.polygon) return 3;
    if (this._entity.polyline) return 2;
    return 1; // POINT
  }

  private _promoteMidpoint(mIdx: number): void {
    const mp = this._midpointEntities[mIdx];
    if (!mp) return;

    const time = JulianDate.now();
    const initial = (mp.position as any)?.getValue?.(time, new Cartesian3());
    if (!initial) return;

    const insertIdx = mIdx + 1;
    const newPos = Cartesian3.clone(initial, new Cartesian3());

    this._positions.splice(insertIdx, 0, newPos);
    if (this._liveActive) {
      this._liveBuffer.splice(insertIdx, 0, Cartesian3.clone(newPos, new Cartesian3()));
    }

    // vertex + midpoint 핸들 모두 재생성 (인덱스 시프트)
    this._removeVertexEntities();
    this._removeMidpointEntities();
    this._createVertexEntities();
    this._createMidpointEntities();

    // 드래그 시작 — 새 vertex 가 active
    this._activeIndex = insertIdx;
    this._hoverIndex = null;
    this._hoverMidpointIndex = null;
    if (this._disableCameraDuringDrag) this._lockCamera();
    this._applyCursor("grabbing");
    this._viewer.scene.requestRender();

    this.emit("vertex-add", {
      index: insertIdx,
      position: Cartesian3.clone(newPos, new Cartesian3()),
      positions: this.positions,
    });
    this.emit("change", { positions: this.positions, reason: "external" });
    this.emit("drag-start", {
      vertexIndex: insertIdx,
      position: Cartesian3.clone(newPos, new Cartesian3()),
    });
  }

  /** 우클릭으로 vertex 제거. 최소 점 갯수 미만으로 떨어지면 무시. */
  private _removeVertex(vIdx: number): void {
    if (this._positions.length <= this._getMinPoints()) return;

    this._positions.splice(vIdx, 1);
    if (this._liveActive) this._liveBuffer.splice(vIdx, 1);

    this._removeVertexEntities();
    this._removeMidpointEntities();
    this._createVertexEntities();
    this._createMidpointEntities();

    this._hoverIndex = null;
    this._hoverMidpointIndex = null;
    this._restoreCursor();
    this._viewer.scene.requestRender();

    this.emit("vertex-remove", {
      index: vIdx,
      positions: this.positions,
    });
    this.emit("change", { positions: this.positions, reason: "external" });
  }

  /* ---------------- private — input handlers ---------------- */

  private _wireHandlers(): void {
    this._ssh.setInputAction((m: { position: Cartesian2 }) => {
      this._onDown(m.position);
    }, ScreenSpaceEventType.LEFT_DOWN);

    this._ssh.setInputAction((m: { startPosition: Cartesian2; endPosition: Cartesian2 }) => {
      this._onMove(m.endPosition);
    }, ScreenSpaceEventType.MOUSE_MOVE);

    this._ssh.setInputAction((m: { position: Cartesian2 }) => {
      this._onUp(m.position);
    }, ScreenSpaceEventType.LEFT_UP);

    this._ssh.setInputAction((m: { position: Cartesian2 }) => {
      this._onRightClick(m.position);
    }, ScreenSpaceEventType.RIGHT_CLICK);
  }

  private _unwireHandlers(): void {
    this._ssh.removeInputAction(ScreenSpaceEventType.LEFT_DOWN);
    this._ssh.removeInputAction(ScreenSpaceEventType.MOUSE_MOVE);
    this._ssh.removeInputAction(ScreenSpaceEventType.LEFT_UP);
    this._ssh.removeInputAction(ScreenSpaceEventType.RIGHT_CLICK);
  }

  private _onDown(screenPos: Cartesian2): void {
    const hit = this._findHandleAtScreenPos(screenPos);
    if (!hit) return;

    if (hit.kind === "vertex") {
      const vIdx = hit.index;
      if (this._hoverIndex !== null) {
        this.emit("vertex-hover-leave", {});
        this._hoverIndex = null;
      }
      this._activeIndex = vIdx;
      if (this._disableCameraDuringDrag) this._lockCamera();
      this._applyCursor("grabbing");
      this._viewer.scene.requestRender();

      this.emit("drag-start", {
        vertexIndex: vIdx,
        position: Cartesian3.clone(this._positions[vIdx], new Cartesian3()),
      });
      return;
    }

    // midpoint — promote 후 새 vertex 에 대한 drag 시작
    this._promoteMidpoint(hit.index);
  }

  private _onRightClick(screenPos: Cartesian2): void {
    const hit = this._findHandleAtScreenPos(screenPos);
    if (hit?.kind !== "vertex") return;
    this._removeVertex(hit.index);
  }

  private _onMove(screenPos: Cartesian2): void {
    if (this._activeIndex !== null) {
      // 드래그 중
      this._applyCursor("grabbing");

      const c = pickCartesian3(this._viewer, screenPos, { mode: this._pickMode });
      if (!c) return;

      const idx = this._activeIndex;
      this._positions[idx] = c;

      // vertex 핸들 entity 위치 즉시 갱신
      const ve = this._vertexEntities[idx];
      if (ve) (ve as any).position = c;

      if (this._liveActive) {
        this._liveBuffer[idx] = c;
        if (
          this._entity.position !== undefined &&
          this._positions.length === 1 &&
          !this._entity.polygon &&
          !this._entity.polyline
        ) {
          (this._entity as any).position = c;
        }
      } else {
        this._writePositionsToEntity();
      }

      this.emit("drag", {
        vertexIndex: idx,
        position: Cartesian3.clone(c, new Cartesian3()),
        positions: this.positions,
      });
      this.emit("change", {
        positions: this.positions,
        reason: "drag",
      });

      this._viewer.scene.requestRender();
      return;
    }

    // hover 분기 — vertex 위면 cursor 'grab' + 핸들 visual 강조
    this._updateHoverState(screenPos);
  }

  private _updateHoverState(screenPos: Cartesian2): void {
    const hit = this._findHandleAtScreenPos(screenPos);

    const newVertexHover: number | null = hit?.kind === "vertex" ? hit.index : null;
    const newMidpointHover: number | null = hit?.kind === "midpoint" ? hit.index : null;

    let needRender = false;

    // vertex hover 변동 시 visual + 이벤트
    if (newVertexHover !== this._hoverIndex) {
      // 이전에 vertex 위에 있었으면 leave
      if (this._hoverIndex !== null) {
        this.emit("vertex-hover-leave", {});
      }
      this._hoverIndex = newVertexHover;
      needRender = true;
      // 새 vertex hover 시작이면 enter
      if (newVertexHover !== null) {
        const canDelete = this._positions.length > this._getMinPoints();
        this.emit("vertex-hover-enter", {
          index: newVertexHover,
          position: Cartesian3.clone(this._positions[newVertexHover], new Cartesian3()),
          canDelete,
        });
      }
    }

    if (newMidpointHover !== this._hoverMidpointIndex) {
      if (this._hoverMidpointIndex !== null) {
        this.emit("midpoint-hover-leave", {});
      }
      this._hoverMidpointIndex = newMidpointHover;
      needRender = true;
      if (newMidpointHover !== null) {
        // midpoint 좌표 계산 (vertex 두 점의 중간)
        const buf = this._liveActive ? this._liveBuffer : this._positions;
        const isPolygon = !!this._entity.polygon;
        const N = buf.length;
        const a = buf[newMidpointHover];
        const b = buf[isPolygon ? (newMidpointHover + 1) % N : newMidpointHover + 1];
        if (a && b) {
          this.emit("midpoint-hover-enter", {
            index: newMidpointHover,
            position: Cartesian3.midpoint(a, b, new Cartesian3()),
          });
        }
      }
    }
    if (needRender) this._viewer.scene.requestRender();

    if (newVertexHover !== null || newMidpointHover !== null) {
      this._applyCursor("grab");
    } else {
      this._restoreCursor();
    }
  }

  private _onUp(_screenPos: Cartesian2): void {
    if (this._activeIndex === null) return;
    this._endDrag();
  }

  private _endDrag(): void {
    const idx = this._activeIndex;
    if (idx === null) return;
    this._activeIndex = null;

    if (this._disableCameraDuringDrag) this._unlockCamera();
    // drag 종료 — cursor 복원. 다음 mousemove 가 hover 상태를 다시 평가.
    this._restoreCursor();
    this._hoverIndex = null;
    this._viewer.scene.requestRender();

    this.emit("drag-end", {
      vertexIndex: idx,
      position: Cartesian3.clone(this._positions[idx], new Cartesian3()),
      positions: this.positions,
    });
  }

  private _findHandleAtScreenPos(
    screenPos: Cartesian2
  ): { kind: "vertex" | "midpoint"; index: number } | null {
    const HOVER_PIXEL = 14;
    const HOVER_PIXEL_SQ = HOVER_PIXEL * HOVER_PIXEL;

    const buf = this._liveActive ? this._liveBuffer : this._positions;
    const scene = this._viewer.scene;
    const tmp = new Cartesian2();

    // vertex 우선
    for (let i = 0; i < buf.length; i++) {
      const pos = buf[i];
      if (!pos) continue;
      const screen = SceneTransforms.worldToWindowCoordinates(scene, pos, tmp);
      if (!screen) continue;
      const dx = screen.x - screenPos.x;
      const dy = screen.y - screenPos.y;
      if (dx * dx + dy * dy <= HOVER_PIXEL_SQ) {
        return { kind: "vertex", index: i };
      }
    }

    // midpoint
    if (this._midpointEntities.length > 0) {
      const isPolygon = !!this._entity.polygon;
      const N = buf.length;
      const midTmp = new Cartesian3();
      for (let i = 0; i < this._midpointEntities.length; i++) {
        const a = buf[i];
        const b = buf[isPolygon ? (i + 1) % N : i + 1];
        if (!a || !b) continue;
        const mid = Cartesian3.midpoint(a, b, midTmp);
        const screen = SceneTransforms.worldToWindowCoordinates(scene, mid, tmp);
        if (!screen) continue;
        const dx = screen.x - screenPos.x;
        const dy = screen.y - screenPos.y;
        if (dx * dx + dy * dy <= HOVER_PIXEL_SQ) {
          return { kind: "midpoint", index: i };
        }
      }
    }

    return null;
  }

  /* ---------------- private — cursor ---------------- */

  private _applyCursor(cursor: string): void {
    if (this._viewer.isDestroyed()) return;
    const canvas = this._viewer.canvas;
    if (!canvas) return;
    if (this._previousCursor === null) {
      this._previousCursor = canvas.style.cursor ?? "";
    }
    if (canvas.style.cursor !== cursor) {
      canvas.style.cursor = cursor;
    }
  }

  private _restoreCursor(): void {
    if (this._previousCursor === null) return;
    if (this._viewer.isDestroyed()) {
      this._previousCursor = null;
      return;
    }
    const canvas = this._viewer.canvas;
    if (canvas) canvas.style.cursor = this._previousCursor;
    this._previousCursor = null;
  }

  /* ---------------- private — camera lock ---------------- */

  private _lockCamera(): void {
    const c = this._viewer.scene.screenSpaceCameraController;
    this._savedCameraState = {
      enableRotate: c.enableRotate,
      enableTilt: c.enableTilt,
      enableTranslate: c.enableTranslate,
      enableZoom: c.enableZoom,
      enableLook: c.enableLook,
    };
    c.enableRotate = false;
    c.enableTilt = false;
    c.enableTranslate = false;
    c.enableZoom = false;
    c.enableLook = false;
  }

  private _unlockCamera(): void {
    if (!this._savedCameraState) return;
    const c = this._viewer.scene.screenSpaceCameraController;
    c.enableRotate = this._savedCameraState.enableRotate;
    c.enableTilt = this._savedCameraState.enableTilt;
    c.enableTranslate = this._savedCameraState.enableTranslate;
    c.enableZoom = this._savedCameraState.enableZoom;
    c.enableLook = this._savedCameraState.enableLook;
    this._savedCameraState = null;
  }
}
