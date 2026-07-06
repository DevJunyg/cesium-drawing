# @alz/cesium-drawing

Cesium 기반 헤드리스 작도·측정 코어.

## 설치

```bash
pnpm add @alz/cesium-drawing cesium
```

`cesium` 은 peer dependency 입니다.

## 빠른 사용 (계획 — Step 3 이후 동작)

```ts
import { Drawer } from '@alz/cesium-drawing';

const drawer = new Drawer(viewer, {
  shape: 'POLYGON',
  terrain: true,
  graphics: {
    active: { material: Color.YELLOW.withAlpha(0.3) },
    final: { material: Color.fromCssColorString('#40E6DF').withAlpha(0.3) },
    outline: { width: 4, material: Color.fromCssColorString('#40E6DF') },
    breakpoint: { color: Color.WHITE, pixelSize: 10, outlineColor: Color.BLACK, outlineWidth: 1.2 },
  },
});

drawer.on('finish', ({ entity, positions }) => {
  console.log('완료', entity, positions);
});

const offEsc = drawer.bindKey('Escape', () => drawer.destroy());
drawer.start();
```

## 서브패스 export

| Path | 내용 |
| --- | --- |
| `@alz/cesium-drawing` | `Drawer`, `MeasureController`, `VertexEditor`, 공용 타입 |
| `@alz/cesium-drawing/core` | `InputBus`, `OverlayHost`, `pickCartesian3` |
| `@alz/cesium-drawing/geometry` | `getDistance`, `getArea`, `getSurfaceDistance`, `getSurfaceArea`, `getSlope` |

자세한 설계는 [`../../docs/architecture.md`](../../docs/architecture.md) 참조.
