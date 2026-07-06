# cesium-drawing

Cesium 기반 헤드리스 작도·측정 모듈. 마우스로 점/선/폴리곤을 그리고, 거리·면적을 측정하고, 완성된 도형의 정점을 편집한다. UI(라벨·툴바·스타일)는 포함하지 않으며 이벤트와 좌표만 넘긴다.

## 패키지

| 패키지 | 내용 |
| --- | --- |
| `@alz/cesium-drawing` | 코어. `Drawer`, `MeasureController`, `VertexEditor`, geometry 함수 |
| `@alz/cesium-drawing-react` | 코어 클래스를 감싼 React hooks |
| `@alz/cesium-drawing-adapter` | 라벨·툴팁 등 기본 UI 어댑터 (선택) |

`cesium` 은 peer dependency 다.

```bash
pnpm add @alz/cesium-drawing cesium
# React 사용 시
pnpm add @alz/cesium-drawing-react react
```

## 마우스 조작 (기본값)

| 동작 | 제스처 |
| --- | --- |
| 점 추가 | 좌클릭 |
| 직전 점 취소 | 우클릭 |
| 작도 완료 | 더블클릭 |
| 작도 취소 (점 없을 때 우클릭) | 우클릭 |

`interaction` 옵션으로 재매핑할 수 있다. 정점 편집은 핸들 드래그(이동), 우클릭(삭제), 중간점 클릭(점 추가).

## Drawer — 도형 그리기

```ts
import { Drawer } from "@alz/cesium-drawing";
import { Color } from "cesium";

const drawer = new Drawer(viewer, {
  shape: "POLYGON", // "POINT" | "POLYLINE" | "POLYGON"
  graphics: {
    active: { material: Color.YELLOW.withAlpha(0.3) },
    final: { material: Color.CYAN.withAlpha(0.3) },
  },
});

drawer.on("finish", ({ entity, positions }) => {
  console.log("완성", positions);
});

drawer.bindKey("Escape", () => drawer.reset());
drawer.start();
```

**주요 메서드**

- `start()` — 작도 시작
- `finish()` — 작도 강제 종료 (최소 점 수 미달이면 취소)
- `reset()` — 그린 것 지우고 idle 로
- `destroy()` — 컨트롤러 정리 (완성된 도형은 유지)
- `updatePositions(positions)` — 좌표 외부 갱신
- `bindKey(key, handler)` — 키 핸들러 등록
- `Drawer.render(viewer, { shape, positions, graphics })` — 작도 없이 정적 도형만 추가

**이벤트**: `start`, `point-add`, `point-remove`, `move`, `points-change`, `finish`, `cancel`, `destroy`

## MeasureController — 거리·면적 측정

`Drawer` 를 감싸 측정값을 함께 계산한다. `compute` 이벤트로 라벨용 수치를 받는다.

```ts
import { MeasureController } from "@alz/cesium-drawing";

const measure = new MeasureController(viewer, {
  measureType: "DISTANCE", // "POINT" | "DISTANCE" | "AREA"
});

measure.on("compute", (p) => {
  if (p.measureType === "DISTANCE") {
    console.log("총 직선거리(m)", p.distance?.totalDirect);
    console.log("총 표면거리(m)", p.distance?.totalSurface);
  }
});

measure.start();
```

`compute` 페이로드는 측정 타입별로 채워진다.

- `POINT` → `point` (경도·위도·고도)
- `DISTANCE` → `distance` (구간·누적 직선/표면 거리, 기울기)
- `AREA` → `area` (면적 ㎡)

## VertexEditor — 정점 편집

완성된 Cesium `Entity`(point/polyline/polygon)의 정점을 드래그로 편집한다.

```ts
import { VertexEditor } from "@alz/cesium-drawing";

const editor = new VertexEditor(viewer, entity);

editor.on("change", ({ positions }) => {
  console.log("갱신된 좌표", positions);
});

editor.enable();  // 편집 시작
// editor.disable(); 편집 종료
// editor.destroy(); 정리
```

정점 핸들 드래그로 이동, 우클릭으로 삭제(최소 점 수까지), 변(邊) 중간점 핸들 클릭으로 점 추가.

**이벤트**: `enable`, `disable`, `drag-start`, `drag`, `drag-end`, `vertex-add`, `vertex-remove`, `change`, `destroy`

## Geometry 함수

```ts
import {
  getDistance,        // 두 점 직선거리
  getTotalDistance,
  getSurfaceDistance, // 표면거리
  getSlope,           // { distance, surfaceDistance, slopeDegree }
  getArea,            // 폴리곤 면적
} from "@alz/cesium-drawing/geometry";
```

## React hooks

각 클래스와 1:1 대응된다. 라이프사이클(생성·정리)과 state 동기화만 담당한다.

```tsx
import { useDrawer, useMeasure, useVertexEditor } from "@alz/cesium-drawing-react";

function DrawButton({ viewer }: { viewer: Viewer }) {
  const { start, state, positions } = useDrawer(
    viewer,
    { shape: "POLYGON" },
    { onFinish: ({ positions }) => save(positions) }
  );

  return (
    <button onClick={start} disabled={state === "drawing"}>
      폴리곤 그리기
    </button>
  );
}
```

- `useDrawer(viewer, options, events?)`
- `useMeasure(viewer, options, events?)` — `result.compute` 로 측정값 접근
- `useVertexEditor(viewer, entity, options?, events?)`

## 개발

```bash
pnpm install
pnpm typecheck
pnpm build
```

자세한 설계는 [`docs/architecture.md`](docs/architecture.md), API 는 [`docs/api.md`](docs/api.md) 참조.
