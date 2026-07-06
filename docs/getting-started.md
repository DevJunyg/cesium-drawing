# Getting Started

`@alz/cesium-drawing` 은 Cesium 위에서 점·선·면 작도와 거리·면적 측정을 위한 헤드리스 모듈입니다. UI(라벨 DOM, 스타일, 텍스트 포맷, i18n)와 데이터 결합(저장/복원, store 연동)은 모두 사용처가 담당합니다.

## 설치

```bash
pnpm add @alz/cesium-drawing cesium
# React hooks 를 함께 쓰는 경우
pnpm add @alz/cesium-drawing-react react
```

`cesium` 은 peerDependency 입니다.

## 최소 예제 — 폴리곤 작도

```ts
import { Viewer, Color } from 'cesium';
import { Drawer } from '@alz/cesium-drawing';

const viewer = new Viewer('cesiumContainer');

const drawer = new Drawer(viewer, {
  shape: 'POLYGON',
  terrain: true, // 지형 위 pick (ScreenSpaceCameraController 가 지형 지원해야 의미)
  graphics: {
    final: { material: Color.fromCssColorString('#40E6DF').withAlpha(0.3) },
    outline: { width: 4, material: Color.fromCssColorString('#40E6DF') },
  },
});

// 작도 종료 시점
drawer.on('finish', ({ entity, positions }) => {
  console.log('완료:', entity, positions);
});

// ESC 로 모드 취소
drawer.bindKey('Escape', () => drawer.destroy());

drawer.start();
```

기본 인터랙션:

| 동작 | 입력 |
| --- | --- |
| 점 추가 | 좌클릭 / 탭 |
| 직전 점 취소 | 우클릭 / 길게 누르기 |
| 작도 완료 | 좌더블클릭 / 더블탭 |
| 모드 취소 (점이 없을 때) | 우클릭 / 길게 누르기 |

## 최소 예제 — 거리 측정

```ts
import { MeasureController } from '@alz/cesium-drawing';

const measure = new MeasureController(viewer, {
  measureType: 'DISTANCE',
  terrain: true,
});

measure.on('compute', (data) => {
  if (!data.distance) return;
  // 라벨 DOM 갱신은 사용처 책임
  console.log('수평거리 합:', data.distance.totalSurface, 'm');
  console.log('사거리 합:', data.distance.totalDirect, 'm');
  for (const seg of data.distance.segments) {
    console.log(`구간 ${seg.surface}m / 기울기 ${seg.slopeDegree.toFixed(1)}°`);
  }
});

measure.on('finish', ({ entity }) => save(entity));

measure.start();
```

## 최소 예제 — React

```tsx
import { useEffect } from 'react';
import { useDrawer } from '@alz/cesium-drawing-react';

function PolygonButton({ viewer }) {
  const { state, positions, start, finish, reset } = useDrawer(
    viewer,
    { shape: 'POLYGON', terrain: true },
    {
      onFinish: ({ entity, positions }) => save(entity, positions),
    }
  );

  return (
    <div>
      <button onClick={start} disabled={state !== 'idle'}>그리기 시작</button>
      <button onClick={finish} disabled={state !== 'drawing'}>완료</button>
      <button onClick={reset}>리셋</button>
      <span>점 {positions.length}개</span>
    </div>
  );
}
```

## 최소 예제 — 저장된 도형 복원

작도 없이 좌표 배열로 정적 entity 를 즉시 만든다.

```ts
import { Drawer } from '@alz/cesium-drawing';

const entity = Drawer.render(viewer, {
  shape: 'POLYGON',
  positions: savedCartesian3Array,
  graphics: { final: { material: Color.RED.withAlpha(0.3) } },
});
```

## 다음

- [API Reference](./api.md) — 클래스, 옵션, 이벤트 전체 명세
- [React Hooks](./react.md) — `useDrawer / useMeasure / useVertexEditor` 사용법
- [Recipes](./recipes.md) — 라벨 커스터마이징, 꼭지점 편집 + form sync, 모바일/터치 등
- [Architecture](./architecture.md) — 설계 원칙과 cesium-extends 대비 변경 근거
