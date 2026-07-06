# 아키텍처

## 모듈 vs 소비처 책임

| 영역 | 모듈 | 소비처 |
| --- | --- | --- |
| 입력 통합 (mouse/touch/pen) | O | - |
| 작도 lifecycle, state 관리 | O | - |
| Cesium pick (terrain/model/ellipsoid) | O | - |
| `CallbackProperty` 동적 도형 + 정적 entity 교체 | O | - |
| breakpoint entity 관리 | O | - |
| 꼭지점 드래그 편집 (geometry) | O | - |
| 거리/면적/표면거리/슬로프 **계산** | O (순수 함수) | - |
| 키 바인딩 진입점 (`bindKey`) | O | 어떤 키에 어떤 동작인지 결정 |
| 인터랙션 매핑 (gesture → action) | default 제공, 모두 override 가능 | override |
| **라벨 DOM 렌더링** | utility (`OverlayHost`) 만 선택적으로 | 직접 |
| 스타일 토큰 (색/두께/픽셀) | default 만 | Figma 토큰 주입 |
| 거리/면적 **포맷 문자열** | - | 포맷·i18n |
| EPSG/local coord 변환 | - | 직접 |
| store/state 결합 | - | 직접 |
| 백엔드 저장·복원 | - | 직접 |

규칙: 모듈은 entity 와 `Cartesian3[]` 만 다룬다. 사람이 읽는 텍스트, 외부 좌표계, store, 네트워크는 전부 소비처 책임.

## 패키지 구성

```
packages/
├── cesium-drawing/          # 단일 코어 패키지
│   └── src/
│       ├── core/            # input-bus, pick, overlay, emitter, types
│       ├── drawer/          # Drawer + shapes (point/polyline/polygon)
│       ├── measure/         # MeasureController (drawer 컴포지션)
│       ├── geometry/        # 순수 거리/면적/슬로프 함수
│       ├── editor/          # VertexEditor
│       └── index.ts
└── cesium-drawing-react/    # React hooks 어댑터 (선택)
    └── src/
        ├── use-drawer.ts
        ├── use-measure.ts
        ├── use-vertex-editor.ts
        └── index.ts
```

서브패스 export:
- `cesium-drawing` — 메인 (`Drawer`, `MeasureController`, `VertexEditor`, 타입)
- `cesium-drawing/core` — `InputBus`, `OverlayHost`, `pickCartesian3`
- `cesium-drawing/geometry` — `getDistance`, `getArea`, `getSlope` 등 순수 함수

## 핵심 타입(요약)

```ts
type ShapeType = 'POINT' | 'POLYLINE' | 'POLYGON';
type DrawerState = 'idle' | 'drawing' | 'finished' | 'destroyed';

type InteractionAction = 'add-point' | 'remove-point' | 'finish' | 'cancel-mode';
type InputGesture =
  | 'tap'
  | 'doubletap'
  | 'longpress'
  | 'drag-start'
  | 'drag-move'
  | 'drag-end'
  | 'contextmenu'
  | 'enter-key'
  | 'escape-key';

type InteractionMap = Partial<Record<InteractionAction, InputGesture>>;
```

기본 매핑:

| Action | Default Gesture |
| --- | --- |
| `add-point` | `tap` |
| `remove-point` | `contextmenu` |
| `finish` | `doubletap` |
| `cancel-mode` | `contextmenu` (시작점이 없을 때만) |

## 이벤트 카탈로그(요약)

```ts
type DrawerEvents = {
  start:          { shape: ShapeType };
  'point-add':    { index: number; position: Cartesian3; positions: Cartesian3[] };
  'point-remove': { index: number; positions: Cartesian3[] };
  move:           { positions: Cartesian3[]; hover: Cartesian3 | null };
  'points-change':{ positions: Cartesian3[]; reason: 'add' | 'remove' | 'move' | 'external' };
  finish:         { entity: Entity; positions: Cartesian3[] };
  cancel:         {};
  destroy:        {};
};

type MeasureEvents = DrawerEvents & {
  compute: {
    measureType: 'POINT' | 'DISTANCE' | 'AREA';
    positions: Cartesian3[];
    hover: Cartesian3 | null;
    distance?: { totalSurface: number; totalDirect: number; segments: Array<{ surface: number; direct: number; slopeDegree: number }> };
    area?: { surface: number };
    point?: { lon: number; lat: number; height: number };
  };
};
```

## cesium-extends 대비 의도적 변경 (요약)

| cesium-extends | cesium-drawing |
| --- | --- |
| `Drawer.start(StartOption)` 시작 시 config | options 는 생성자, `start()` 는 동작만 |
| `dynamicGraphicsOptions: Record<TYPE,...>` + `finalOptions` | `graphics: { active, final, breakpoint, outline? }` |
| `OperationType.START/MOVING/CANCEL/END` (이벤트명) | `interaction: { addPoint, removePoint, finish, cancelMode }` (의미 액션) |
| `EventType` (15 cesium 이벤트명) | `InputGesture` (mouse/touch/pen 통합) |
| `ActionCallback(action, move)` | typed `EventEmitter` (`on('point-add', cb)`) |
| `OverrideEntityFunc` | 제거 — `on('finish')` 에서 entity 직접 수정 |
| `Status: 'INIT'\|'START'\|'PAUSE'\|'DESTROY'` | `state: 'idle'\|'drawing'\|'finished'\|'destroyed'` |
| `tips: { init, start, end }` | 코어에서 제거 (OverlayHost utility 만 제공) |
| `static _startTooltip` (싱글톤) | 인스턴스 멤버 (멀티 인스턴스 안전) |
| `Subscriber` 두 인스턴스 동시 운영 | `InputBus` 단일 파이프라인 |
| `_clickTerm = 300ms` 디바운스 | 제거 — 단일클릭 즉시 commit, 더블클릭 시 직전 점 pop |
| `_mouseDelta = 10px` 가드 | `minClickDistance` 옵션 (default 0) |

## 알려진 cesium-extends 버그와 대응

| 증상 | cesium-extends 원인 | 새 모듈 처리 |
| --- | --- | --- |
| 빠른 클릭 시 점/라벨 누락 | `_clickTerm = 300ms` 클릭 디바운스 | 단일 입력 파이프라인 + 더블탭 윈도우 후처리 |
| 첫 우클릭 안 잡힘 | `setTimeout(100)` `isStartDraw` 가드 | 가드 없음 |
| POINT `_initDrawer` 로 안 지워짐 | Point lifecycle 이 `_addedEntities` 추적 누락 | 모든 도형이 단일 추적 (`Map<id, Entity>`) |
| breakpoint 스타일 인스턴스별 분리 불가 | `defaultOptions.dynamicGraphicsOptions.POINT` 전역 mutate | Painter 가 옵션을 인스턴스 멤버로 보유 |
| 작도 중 라인 안 그려지고 점만 보임 | dynamic entity 추가 순서 + `requestRender` 누락 가능성 | dynamic entity 먼저 add → 점 push → 즉시 `requestRender` |

## 단계별 진행

1. **Step 1 — 모노레포 골격** (현재): workspace, tsconfig, package.json, README, 본 문서
2. **Step 2 — `core/`**: `InputBus`, `pickCartesian3`, `OverlayHost`, typed `EventEmitter`, 공용 타입
3. **Step 3 — `drawer/`**: `Drawer` 컨트롤러 + Point/Polyline/Polygon shape
4. **Step 4 — `geometry/` + `measure/`**: 순수 거리/면적/슬로프 함수, `MeasureController`
5. **Step 5 — `editor/`**: `VertexEditor`
6. **Step 6 — `cesium-drawing-react`**: React hooks
7. **Step 7 — 문서**: API reference, usage, examples
