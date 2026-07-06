# API Reference

## 목차

- [Drawer](#drawer) — 점·선·면 작도 컨트롤러
- [MeasureController](#measurecontroller) — 거리·면적·좌표 측정 컨트롤러
- [VertexEditor](#vertexeditor) — 꼭지점 드래그 편집
- [Core](#core) — `InputBus`, `OverlayHost`, `pickCartesian3`, `TypedEmitter`
- [Geometry](#geometry) — 거리·면적·기울기 순수 함수
- [공용 타입](#공용-타입)

---

## Drawer

`new Drawer(viewer, options)` — 1 인스턴스 = 1 도형. shape 는 생성자 고정.

### 옵션

```ts
interface DrawerOptions {
  shape: 'POINT' | 'POLYLINE' | 'POLYGON';
  pickMode?: 'auto' | 'terrain' | 'model' | 'ellipsoid'; // default: 'auto'
  graphics?: {
    active?: object;     // 작도 중 동적 도형 (PointGraphics / PolylineGraphics / PolygonGraphics 옵션)
    final?: object;      // 종료 후 정적 도형
    breakpoint?: PointGraphics.ConstructorOptions | false; // 작도 중 점 표시. false 면 숨김
    outline?: PolylineGraphics.ConstructorOptions; // POLYGON 외곽선
  };
  interaction?: {
    'add-point'?: InputGesture;     // default: 'tap'
    'remove-point'?: InputGesture;  // default: 'contextmenu'
    'finish'?: InputGesture;        // default: 'doubletap'
    'cancel-mode'?: InputGesture;   // default: 'contextmenu' (점 없을 때만 적용)
  };
  minClickDistance?: number;  // 같은 화면 좌표 클릭 무시 픽셀 (default: 0)
  input?: InputBusOptions;
  showBreakpoints?: boolean;  // default: true
}
```

### 상태

```ts
type DrawerState = 'idle' | 'drawing' | 'finished' | 'destroyed';
```

state 전이:

```
constructor → idle
start()     → drawing
finish()    → finished      (positions.length >= minPoints 일 때)
finish()    → idle + emit('cancel')  (부족 시 reset 처리)
reset()     → idle          (drawing 중이면 진행 취소, finished 면 entity 제거)
destroy()   → destroyed     (영구. 재사용 불가)
```

### Properties

| 이름 | 타입 | 설명 |
| --- | --- | --- |
| `state` | `DrawerState` | 현재 상태 |
| `shape` | `ShapeType` | 도형 종류 (생성자 고정) |
| `positions` | `Cartesian3[]` | 확정 점들의 snapshot (외부 mutate 불가) |
| `hover` | `Cartesian3 \| null` | 마우스 위치 pick 결과. drawing 중에만 의미 |
| `entity` | `Entity \| null` | finish 후 추가된 정적 entity |

### Methods

| 이름 | 시그니처 | 설명 |
| --- | --- | --- |
| `start` | `(): void` | 작도 시작 (`idle` 상태에서만 동작) |
| `finish` | `(): Entity \| null` | 작도 종료 강제. `minPoints` 미만이면 `cancel` |
| `reset` | `(): void` | 모든 entity 정리 후 `idle` 로 복귀 |
| `destroy` | `(): void` | 영구 정리. 모든 listener·핸들러 해제 |
| `updatePositions` | `(positions: Cartesian3[]): void` | 좌표 외부 갱신 (form 입력 등) |
| `bindKey` | `(key: string, handler: () => void): Unsubscribe` | 키 바인딩 sugar |
| `on` | `(event, handler): Unsubscribe` | 이벤트 구독 |

### 정적 메소드

```ts
Drawer.render(viewer, {
  shape: ShapeType;
  positions: Cartesian3[];
  graphics?: DrawerOptions['graphics'];
}): Entity | null;
```

작도 없이 좌표 배열로 정적 entity 즉시 생성. `positions.length < minPoints` 면 `null`.

### 이벤트

| 이벤트 | 페이로드 | 발화 시점 |
| --- | --- | --- |
| `start` | `{ shape }` | `start()` 호출 후 |
| `point-add` | `{ index, position, positions }` | tap 으로 점 추가 |
| `point-remove` | `{ index, positions }` | contextmenu/finish 시 점 pop |
| `move` | `{ hover, positions }` | mousemove (hover 좌표 갱신) |
| `points-change` | `{ positions, reason }` | `add` / `remove` / `external` 모든 좌표 변동 |
| `finish` | `{ entity, positions }` | 정적 entity 생성·추가 후 |
| `cancel` | `{}` | 모드 취소 (또는 finish 실패) |
| `destroy` | `{}` | `destroy()` 호출 |

---

## MeasureController

`new MeasureController(viewer, options)` — Drawer 를 컴포지션해서 사용. 모든 측정값 계산은 `compute` 이벤트로 전달, 라벨 DOM 렌더링은 사용처 담당.

### 옵션

```ts
interface MeasureControllerOptions extends Omit<DrawerOptions, 'shape'> {
  measureType: 'POINT' | 'DISTANCE' | 'AREA';
}
```

`measureType` → `shape` 매핑:

| measureType | 내부 shape |
| --- | --- |
| `POINT` | `POINT` |
| `DISTANCE` | `POLYLINE` |
| `AREA` | `POLYGON` |

### Properties / Methods

Drawer 와 동일한 인터페이스 (`state`, `positions`, `hover`, `entity`, `start/finish/reset/destroy/updatePositions/bindKey/on`). 추가로 `measureType` 게터.

### 이벤트

Drawer 의 이벤트 전부 forward + 다음 추가:

```ts
type MeasureEvents = DrawerEvents & {
  start:   { measureType: MeasureType };  // shape 가 아닌 measureType 으로 변경
  compute: MeasureComputePayload;
};

interface MeasureComputePayload {
  measureType: 'POINT' | 'DISTANCE' | 'AREA';
  positions: Cartesian3[];
  hover: Cartesian3 | null;

  /** measureType === 'DISTANCE' 일 때만 채워짐 */
  distance?: {
    totalDirect: number;        // m. 사거리 합 (hover 포함)
    totalSurface: number;       // m. 수평거리 합 (hover 포함)
    segments: MeasureSegment[]; // 확정 점들 사이 segment metrics
    liveSegment?: MeasureSegment; // hover 와 마지막 점 사이 임시 segment
  };
  /** measureType === 'AREA' 일 때만 채워짐 */
  area?: {
    surface: number;  // ㎡. drawing 중에는 hover 까지 포함한 임시 면적
  };
  /** measureType === 'POINT' 이고 positions.length >= 1 일 때만 */
  point?: {
    lon: number;  // °
    lat: number;  // °
    height: number;  // m
  };
}

interface MeasureSegment {
  direct: number;       // m. 직선거리
  surface: number;      // m. 표면거리
  slopeDegree: number;  // °
}
```

`compute` 발화 시점:
- `start` 직후
- `move` (hover 변경 시)
- `points-change` (점 추가·제거·external 갱신)
- `finish`

### 정적 메소드

```ts
MeasureController.render(viewer, {
  measureType, positions, graphics?
}): Entity | null;
```

---

## VertexEditor

`new VertexEditor(viewer, entity, options?)` — 작도 종료된 entity 의 꼭지점을 드래그 편집. 점·폴리라인·폴리곤 모두 지원.

### 옵션

```ts
interface VertexEditorOptions {
  pickMode?: PickMode;
  vertexGraphics?: PointGraphics.ConstructorOptions;  // 핸들 점 스타일
  disableCameraDuringDrag?: boolean;  // default: true
}
```

`disableCameraDuringDrag: true` 인 경우 vertex hit 직후 cesium 카메라 컨트롤러의 `enableRotate / enableTilt / enableTranslate / enableZoom / enableLook` 를 일시 false 로 두고 drag 종료 시 복원.

### 상태

```ts
type VertexEditorState = 'idle' | 'enabled' | 'destroyed';
```

### Properties / Methods

| 이름 | 시그니처 | 설명 |
| --- | --- | --- |
| `state` | getter | `idle / enabled / destroyed` |
| `entity` | getter | 편집 대상 entity |
| `positions` | getter | 현재 좌표 snapshot |
| `enable` | `(): void` | 핸들 entity 생성 + 입력 핸들러 부착 |
| `disable` | `(): void` | 핸들 entity 제거 + 입력 핸들러 해제. 인스턴스는 살아있음 |
| `destroy` | `(): void` | 영구 정리 |
| `setPositions` | `(positions: Cartesian3[]): void` | 외부 좌표 갱신 (form 입력 등) |
| `on` | `(event, handler): Unsubscribe` | 이벤트 구독 |

### 이벤트

| 이벤트 | 페이로드 |
| --- | --- |
| `enable` | `{}` |
| `disable` | `{}` |
| `drag-start` | `{ vertexIndex, position }` |
| `drag` | `{ vertexIndex, position, positions }` |
| `drag-end` | `{ vertexIndex, position, positions }` |
| `change` | `{ positions, reason: 'drag' \| 'external' }` |
| `destroy` | `{}` |

---

## Core

저수준 빌딩 블록. `@alz/cesium-drawing/core` subpath 로도 import 가능.

### InputBus

`new InputBus(viewer, options?)` — Mouse / Touch / Pen / Key 입력을 의미 제스처로 통합.

```ts
interface InputBusOptions {
  dragThreshold?: number;        // default: 5 (px)
  longpressDuration?: number;    // default: 500 (ms)
  enableKeyEvents?: boolean;     // default: true
  ensureCanvasFocusable?: boolean; // default: true
}
```

emit 하는 제스처:

| 제스처 | 페이로드 | 비고 |
| --- | --- | --- |
| `tap` | `ScreenGestureBase` | cesium `LEFT_CLICK`. longpress 후 발생한 LEFT_CLICK 은 자동 무시 |
| `doubletap` | `ScreenGestureBase` | cesium `LEFT_DOUBLE_CLICK` |
| `contextmenu` | `ScreenGestureBase` | 마우스 우클릭 OR 터치 longpress |
| `move` | `ScreenGestureBase` | mousemove / touchmove |
| `drag-start` | `DragGestureBase` | LEFT_DOWN 후 5px 초과 이동 시 |
| `drag-move` | `DragGestureBase` | drag 중 mousemove |
| `drag-end` | `DragGestureBase` | LEFT_UP (drag 활성 중일 때만) |
| `key` | `KeyGestureBase` | viewer.canvas keydown |

```ts
interface ScreenGestureBase {
  screenPos: Cartesian2;
  source: 'mouse' | 'touch' | 'pen' | 'key';
  timestamp: number;
}

interface DragGestureBase extends ScreenGestureBase {
  startPos: Cartesian2;
  delta: Cartesian2;
}

interface KeyGestureBase {
  key: string;
  source: 'key';
  timestamp: number;
}
```

`enabled` setter 로 일시 정지 가능. `destroy()` 시 ScreenSpaceEventHandler + native listener 모두 해제.

### OverlayHost

`new OverlayHost(viewer, options?)` — `viewer.container` 내부에 absolute 오버레이 레이어. HTMLElement 를 cartesian3 좌표에 "고정" 시킨다.

```ts
interface OverlayHostOptions {
  wrapperClass?: string; // default: 'cesium-drawing-overlay'
  zIndex?: number;       // default: 0
}

interface AttachOptions {
  offset?: { x: number; y: number };
  zIndex?: number;
}

interface OverlayHandle {
  update(position: Cartesian3): void;
  setOffset(offset: { x: number; y: number }): void;
  setVisible(visible: boolean): void;
  detach(): void;
}
```

`attach(el, position, options?)` → `OverlayHandle`. 자식 element 의 `pointer-events` 가 기본 `auto` 로 설정됨 (X 버튼 등 인터랙션 가능). wrapper 자체는 `pointer-events: none`.

위치 동기화는 `scene.postRender` 에서 매 프레임. 원하는 element 가 화면 밖이면 자동으로 `display: none`.

### pickCartesian3

```ts
function pickCartesian3(
  viewer: Viewer,
  screenPos: Cartesian2,
  options?: { mode?: 'auto' | 'terrain' | 'model' | 'ellipsoid' }
): Cartesian3 | undefined;
```

- `auto`: `pickPosition` (모델/타일) → `globe.pick` (지형) → `pickEllipsoid` 순 fallback
- `model`: `scene.pickPosition` 만
- `terrain`: `scene.globe.pick` 만
- `ellipsoid`: `camera.pickEllipsoid` 만

### TypedEmitter

타입 안전 EventEmitter. 외부 의존성 0.

```ts
class TypedEmitter<EventMap extends Record<string, unknown>> {
  on<K>(event: K, listener: (payload: EventMap[K]) => void): Unsubscribe;
  off<K>(event: K, listener: (payload: EventMap[K]) => void): void;
  emit<K>(event: K, payload: EventMap[K]): void;
  removeAllListeners<K>(event?: K): void;
  listenerCount<K>(event: K): number;
}
```

한 listener 가 throw 해도 다음 listener 는 정상 실행. listener 내부에서 unsubscribe 호출도 안전.

---

## Geometry

순수 함수. `@alz/cesium-drawing/geometry` subpath 로도 import 가능.

```ts
function getDistance(p1: Cartesian3, p2: Cartesian3): number;
function getTotalDistance(positions: readonly Cartesian3[]): number;

function getSurfaceDistance(viewer: Viewer, p1: Cartesian3, p2: Cartesian3): number;
function getTotalSurfaceDistance(viewer: Viewer, positions: readonly Cartesian3[]): number;

function getSlope(viewer: Viewer, p1: Cartesian3, p2: Cartesian3): SlopeResult;
interface SlopeResult {
  distance: number;        // m. 사거리
  surfaceDistance: number; // m. 수평거리
  heightDiff: number;      // m. p2.height - p1.height
  slopeRatio: number;      // tan(θ)
  slopePercent: number;
  slopeDegree: number;
}

function getArea(viewer: Viewer, positions: readonly Cartesian3[]): number;  // ㎡
```

- `getDistance` : 3D 직선거리 (`Cartesian3.distance`)
- `getSurfaceDistance` : 타원체 great-circle 거리 (`EllipsoidGeodesic.surfaceDistance`)
- `getArea` : `EllipsoidTangentPlane` 투영 + shoelace 공식

지형 비동기 샘플링 (`sampleTerrainMostDetailed`) 은 모듈에 포함하지 않습니다. 더 높은 정밀도가 필요하면 사용처가 별도로 보정 후 `updatePositions` 로 주입하세요.

---

## 공용 타입

```ts
type ShapeType = 'POINT' | 'POLYLINE' | 'POLYGON';
type DrawerState = 'idle' | 'drawing' | 'finished' | 'destroyed';
type PickMode = 'auto' | 'terrain' | 'model' | 'ellipsoid';

type InteractionAction = 'add-point' | 'remove-point' | 'finish' | 'cancel-mode';
type InputGesture =
  | 'tap' | 'doubletap' | 'contextmenu'
  | 'move'
  | 'drag-start' | 'drag-move' | 'drag-end'
  | 'key';
type InteractionMap = Partial<Record<InteractionAction, InputGesture>>;

type LonLatHeight = readonly [lon: number, lat: number, height: number];
type Unsubscribe = () => void;
```
