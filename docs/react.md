# React Hooks

`@alz/cesium-drawing-react` 의 hooks 는 controller 인스턴스의 라이프사이클을 React 컴포넌트와 동기화한다. 클래스 API 그대로 노출 + 반응형 state 동기화 + 콜백 prop 패턴.

## 공통 동작 규칙

- **viewer 가 바뀌면 controller 재생성**. 이전 인스턴스는 자동 `destroy`.
- **options 는 첫 마운트 시점 값 사용**. 런타임 변경은 적용되지 않음. 다른 옵션이 필요하면 부모에서 `key` 를 바꿔 remount 하거나 클래스 API 를 직접 사용.
- **이벤트 핸들러는 매 렌더 최신 버전**. ref 추적이라 의존성 배열 신경 쓸 필요 없음.
- **메소드 (`start / finish / reset / destroy / ...`) 는 `useCallback([])` 으로 stable**. 자식에 prop 넘길 때 추가 메모 불필요.

---

## useDrawer

```ts
function useDrawer(
  viewer: Viewer | null | undefined,
  options: DrawerOptions,
  events?: DrawerEventHandlers
): UseDrawerResult;

interface DrawerEventHandlers {
  onStart?:        (e: DrawerEvents['start']) => void;
  onPointAdd?:     (e: DrawerEvents['point-add']) => void;
  onPointRemove?:  (e: DrawerEvents['point-remove']) => void;
  onMove?:         (e: DrawerEvents['move']) => void;
  onPointsChange?: (e: DrawerEvents['points-change']) => void;
  onFinish?:       (e: DrawerEvents['finish']) => void;
  onCancel?:       (e: DrawerEvents['cancel']) => void;
  onDestroy?:      (e: DrawerEvents['destroy']) => void;
}

interface UseDrawerResult {
  drawer: Drawer | null;          // 인스턴스 (마운트 전 / viewer 없음 → null)
  state: DrawerState;
  positions: Cartesian3[];
  start: () => void;
  finish: () => Entity | null;
  reset: () => void;
  destroy: () => void;
  updatePositions: (positions: Cartesian3[]) => void;
}
```

### 예시

```tsx
function PolygonTool({ viewer }: { viewer: Viewer }) {
  const { state, positions, start, finish, reset } = useDrawer(
    viewer,
    {
      shape: 'POLYGON',
      terrain: true,
      graphics: {
        final: { material: Color.fromCssColorString('#40E6DF').withAlpha(0.3) },
        outline: { material: Color.fromCssColorString('#40E6DF'), width: 4 },
      },
    },
    {
      onFinish: ({ entity, positions }) => savePolygon(entity, positions),
      onCancel: () => toast('취소되었습니다'),
    }
  );

  return (
    <div>
      <button onClick={start} disabled={state !== 'idle'}>그리기</button>
      <button onClick={finish} disabled={state !== 'drawing' || positions.length < 3}>
        완료
      </button>
      <button onClick={reset}>리셋</button>
      <span>점 {positions.length}개</span>
    </div>
  );
}
```

### advanced — drawer 직접 사용

hook 결과의 `drawer` 인스턴스로 옵션 외 기능 (예: bindKey) 사용:

```tsx
const { drawer } = useDrawer(viewer, opts);

useEffect(() => {
  if (!drawer) return;
  const off = drawer.bindKey('Enter', () => drawer.finish());
  return off;
}, [drawer]);
```

---

## useMeasure

```ts
function useMeasure(
  viewer: Viewer | null | undefined,
  options: MeasureControllerOptions,
  events?: MeasureEventHandlers
): UseMeasureResult;

interface MeasureEventHandlers {
  // ... DrawerEventHandlers 와 동일 +
  onCompute?: (e: MeasureEvents['compute']) => void;
}

interface UseMeasureResult {
  measure: MeasureController | null;
  state: DrawerState;
  positions: Cartesian3[];
  compute: MeasureComputePayload | null;  // 마지막 'compute' 페이로드
  start, finish, reset, destroy, updatePositions
}
```

### 예시 — 거리 측정

```tsx
function DistanceTool({ viewer }: { viewer: Viewer }) {
  const { state, compute, start, finish } = useMeasure(viewer, {
    measureType: 'DISTANCE',
    terrain: true,
  });

  return (
    <div>
      <button onClick={start} disabled={state !== 'idle'}>측정 시작</button>
      <button onClick={finish}>완료</button>
      {compute?.distance && (
        <div>
          <div>수평거리 합: {compute.distance.totalSurface.toFixed(1)} m</div>
          <div>사거리 합: {compute.distance.totalDirect.toFixed(1)} m</div>
        </div>
      )}
    </div>
  );
}
```

### 성능 메모

`compute` 페이로드는 매 mousemove 발화 → 매번 `setState` → 컴포넌트 re-render. 측정 중 무거운 형제 트리가 있다면:

1. **컴포넌트 분리**: `compute` 를 사용하는 작은 컴포넌트를 따로 두고, 무거운 부분은 부모에서 분리.
2. **state 트래킹 안 함**: `compute` 를 무시하고 `onCompute` 콜백만 사용. 라벨 DOM 을 ref + imperative 로 갱신.

---

## useVertexEditor

```ts
function useVertexEditor(
  viewer: Viewer | null | undefined,
  entity: Entity | null | undefined,
  options?: VertexEditorOptions,
  events?: VertexEditorEventHandlers
): UseVertexEditorResult;
```

마운트 시 자동 `enable` 하지 않는다. 편집 토글 UI 와 자연스럽게 호환되도록 명시적으로 `enable()` 호출.

### 예시

```tsx
function PolygonEditor({ viewer, entity }: { viewer: Viewer; entity: Entity }) {
  const { state, enable, disable } = useVertexEditor(
    viewer,
    entity,
    {},
    { onChange: ({ positions }) => syncToForm(positions) }
  );

  return (
    <button onClick={state === 'enabled' ? disable : enable}>
      {state === 'enabled' ? '편집 종료' : '편집 시작'}
    </button>
  );
}
```

### form 양방향 sync

마우스 드래그로 좌표 변경 → form 갱신, form 입력으로 좌표 변경 → vertex 핸들 위치 갱신:

```tsx
const [coords, setCoords] = useState<Cartesian3[]>(initial);

const { setPositions } = useVertexEditor(viewer, entity, undefined, {
  onChange: ({ positions, reason }) => {
    if (reason === 'drag') setCoords(positions);
  },
});

// form 입력 → editor 갱신
useEffect(() => {
  setPositions(coords);
}, [coords]);
```

`reason: 'drag'` 만 form 갱신에 반영하면 form → editor 갱신이 다시 drag 이벤트로 돌아오는 무한 루프를 회피할 수 있다.
