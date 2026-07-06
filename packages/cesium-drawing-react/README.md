# @alz/cesium-drawing-react

[`@alz/cesium-drawing`](../cesium-drawing) 의 React hooks 어댑터.

## 설치

```bash
pnpm add @alz/cesium-drawing @alz/cesium-drawing-react cesium react
```

## 빠른 사용 (계획 — Step 6 이후 동작)

```tsx
import { useDrawer } from '@alz/cesium-drawing-react';

function ToolbarPolygonButton({ viewer }: { viewer: Viewer }) {
  const { start, finish, destroy, state, positions } = useDrawer(viewer, {
    shape: 'POLYGON',
    onFinish: ({ entity, positions }) => save(entity, positions),
  });

  return <button onClick={start} disabled={state === 'drawing'}>폴리곤 그리기</button>;
}
```

`@alz/cesium-drawing` 의 클래스 API 와 1:1 대응되는 hooks 만 제공합니다. 라벨 렌더링·스타일·i18n 은 사용처가 직접 처리합니다.
