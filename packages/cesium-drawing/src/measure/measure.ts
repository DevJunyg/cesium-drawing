import { Cartographic, Math as CesiumMath } from "cesium";
import type { Cartesian3, Entity, Viewer } from "cesium";

import { TypedEmitter } from "../core/emitter";
import type { Unsubscribe } from "../core/emitter";
import type { ShapeType } from "../core/types";

import { Drawer } from "../drawer/drawer";
import type { DrawerOptions } from "../drawer/drawer";

import { getSlope } from "../geometry/surface";
import { getArea } from "../geometry/area";

/* =========================================================================
 * MeasureController
 *
 * 측정 컨트롤러. Drawer 를 컴포지션해서 사용
 *
 * ========================================================================= */

export type MeasureType = "POINT" | "DISTANCE" | "AREA";

const TYPE_TO_SHAPE: Record<MeasureType, ShapeType> = {
  POINT: "POINT",
  DISTANCE: "POLYLINE",
  AREA: "POLYGON",
};

export interface MeasureSegment {
  /** 직선거리 (m) — 사거리 */
  direct: number;
  /** 표면거리 (m) — 수평거리 */
  surface: number;
  /** 기울기 (°) */
  slopeDegree: number;
}

export interface DistanceCompute {
  /** 확정 점들 사이 segment + hover 까지 포함한 누적 직선거리 (m) */
  totalDirect: number;
  /** 확정 점들 사이 segment + hover 까지 포함한 누적 표면거리 (m) */
  totalSurface: number;
  /** 확정 점들 사이 각 segment metrics (break point label 용) */
  segments: MeasureSegment[];
  /** drawing 중 hover 와 마지막 확정 점 사이의 임시 segment (없으면 undefined) */
  liveSegment?: MeasureSegment;
}

export interface AreaCompute {
  /** 폴리곤 면적 (㎡) — drawing 중에는 hover 까지 포함한 임시 면적 */
  surface: number;
}

export interface PointCompute {
  /** 경도 (°) */
  lon: number;
  /** 위도 (°) */
  lat: number;
  /** 고도 (m) */
  height: number;
}

export interface MeasureComputePayload {
  measureType: MeasureType;
  positions: Cartesian3[];
  hover: Cartesian3 | null;
  /** measureType === 'DISTANCE' 일 때만 채워짐 */
  distance?: DistanceCompute;
  /** measureType === 'AREA' 일 때만 채워짐 */
  area?: AreaCompute;
  /** measureType === 'POINT' 이고 positions.length >= 1 일 때만 채워짐 */
  point?: PointCompute;
}

export type MeasureEvents = {
  start: { measureType: MeasureType };
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
  /** 라벨 렌더링용 — 측정 종류별 derived values 를 함께 전달 */
  compute: MeasureComputePayload;
};

export interface MeasureControllerOptions extends Omit<DrawerOptions, "shape"> {
  measureType: MeasureType;
}

export class MeasureController extends TypedEmitter<MeasureEvents> {
  private _viewer: Viewer;
  private _drawer: Drawer;
  private _measureType: MeasureType;
  private _drawerUnsubs: Unsubscribe[] = [];

  constructor(viewer: Viewer, options: MeasureControllerOptions) {
    super();
    this._viewer = viewer;
    this._measureType = options.measureType;

    const { measureType: _ignored, ...rest } = options;
    void _ignored;

    this._drawer = new Drawer(viewer, {
      ...rest,
      shape: TYPE_TO_SHAPE[options.measureType],
    });

    this._wireDrawer();
  }

  /* ---------------- getters ---------------- */

  get state() {
    return this._drawer.state;
  }
  get positions(): Cartesian3[] {
    return this._drawer.positions;
  }
  get hover(): Cartesian3 | null {
    return this._drawer.hover;
  }
  get entity(): Entity | null {
    return this._drawer.entity;
  }
  get measureType(): MeasureType {
    return this._measureType;
  }

  /* ---------------- lifecycle ---------------- */

  start(): void {
    this._drawer.start();
  }
  finish(): Entity | null {
    return this._drawer.finish();
  }
  reset(): void {
    this._drawer.reset();
  }
  destroy(): void {
    for (const off of this._drawerUnsubs) off();
    this._drawerUnsubs = [];
    this._drawer.destroy();
    this.emit("destroy", {});
    this.removeAllListeners();
  }

  updatePositions(positions: Cartesian3[]): void {
    // drawer 가 'points-change' 를 emit 하면 _wireDrawer 의 핸들러가 _emitCompute 호출
    this._drawer.updatePositions(positions);
  }

  bindKey(key: string, handler: () => void): Unsubscribe {
    return this._drawer.bindKey(key, handler);
  }

  /* ---------------- static (작도 없이 정적 entity 생성) ---------------- */

  static render(
    viewer: Viewer,
    options: {
      measureType: MeasureType;
      positions: Cartesian3[];
      graphics?: DrawerOptions["graphics"];
    }
  ): Entity | null {
    return Drawer.render(viewer, {
      shape: TYPE_TO_SHAPE[options.measureType],
      positions: options.positions,
      graphics: options.graphics,
    });
  }

  /* ---------------- private ---------------- */

  private _wireDrawer(): void {
    const u: Unsubscribe[] = [];

    u.push(
      this._drawer.on("start", () => {
        this.emit("start", { measureType: this._measureType });
        this._emitCompute();
      })
    );
    u.push(
      this._drawer.on("point-add", (e) => {
        this.emit("point-add", e);
      })
    );
    u.push(
      this._drawer.on("point-remove", (e) => {
        this.emit("point-remove", e);
      })
    );
    u.push(
      this._drawer.on("points-change", (e) => {
        this.emit("points-change", e);
        this._emitCompute();
      })
    );
    u.push(
      this._drawer.on("move", (e) => {
        this.emit("move", e);
        this._emitCompute();
      })
    );
    u.push(
      this._drawer.on("finish", (e) => {
        this.emit("finish", e);
        this._emitCompute();
      })
    );
    u.push(
      this._drawer.on("cancel", (e) => {
        this.emit("cancel", e);
      })
    );

    this._drawerUnsubs = u;
  }

  private _emitCompute(): void {
    const positions = this._drawer.positions;
    const hover = this._drawer.hover;
    const isDrawing = this._drawer.state === "drawing";

    const payload: MeasureComputePayload = {
      measureType: this._measureType,
      positions,
      hover,
    };

    if (this._measureType === "DISTANCE") {
      payload.distance = this._computeDistance(positions, hover, isDrawing);
    } else if (this._measureType === "AREA") {
      payload.area = this._computeArea(positions, hover, isDrawing);
    } else if (this._measureType === "POINT" && positions.length >= 1) {
      payload.point = this._computePoint(positions[0]);
    }

    this.emit("compute", payload);
  }

  private _computeDistance(
    positions: Cartesian3[],
    hover: Cartesian3 | null,
    isDrawing: boolean
  ): DistanceCompute {
    const segments: MeasureSegment[] = [];
    for (let i = 0; i < positions.length - 1; i++) {
      const slope = getSlope(this._viewer, positions[i], positions[i + 1]);
      segments.push({
        direct: slope.distance,
        surface: slope.surfaceDistance,
        slopeDegree: slope.slopeDegree,
      });
    }

    let liveSegment: MeasureSegment | undefined;
    if (isDrawing && hover && positions.length >= 1) {
      const slope = getSlope(this._viewer, positions[positions.length - 1], hover);
      liveSegment = {
        direct: slope.distance,
        surface: slope.surfaceDistance,
        slopeDegree: slope.slopeDegree,
      };
    }

    let totalDirect = 0;
    let totalSurface = 0;
    for (const s of segments) {
      totalDirect += s.direct;
      totalSurface += s.surface;
    }
    if (liveSegment) {
      totalDirect += liveSegment.direct;
      totalSurface += liveSegment.surface;
    }

    return { totalDirect, totalSurface, segments, liveSegment };
  }

  private _computeArea(
    positions: Cartesian3[],
    hover: Cartesian3 | null,
    isDrawing: boolean
  ): AreaCompute {
    const all = isDrawing && hover ? [...positions, hover] : positions;
    return {
      surface: all.length >= 3 ? getArea(this._viewer, all) : 0,
    };
  }

  private _computePoint(p: Cartesian3): PointCompute {
    const c = Cartographic.fromCartesian(p);
    return {
      lon: CesiumMath.toDegrees(c.longitude),
      lat: CesiumMath.toDegrees(c.latitude),
      height: c.height,
    };
  }
}
