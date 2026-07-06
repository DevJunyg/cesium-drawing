# Recipes

실전에서 자주 만나는 패턴 모음.

## 측정 라벨을 직접 그리기 (X 삭제 버튼 포함)

`MeasureController.compute` 이벤트로 derived value 만 받고, DOM 은 `OverlayHost` (또는 React Portal) 로 직접 그린다.

### vanilla — OverlayHost 사용

```ts
import { MeasureController, OverlayHost } from 'cesium-drawing';

const overlay = new OverlayHost(viewer);
const measure = new MeasureController(viewer, {
  measureType: 'DISTANCE',
  terrain: true,
});

let totalLabelHandle: ReturnType<typeof overlay.attach> | null = null;
const breakLabels: Array<ReturnType<typeof overlay.attach>> = [];

measure.on('compute', (data) => {
  if (!data.distance) return;

  // 누적 라벨 (마지막 점 또는 hover 위치)
  const totalPos = data.hover ?? data.positions[data.positions.length - 1];
  if (totalPos) {
    if (!totalLabelHandle) {
      const el = createTotalLabel();
      totalLabelHandle = overlay.attach(el, totalPos, { offset: { x: 70, y: 70 } });
    } else {
      totalLabelHandle.update(totalPos);
    }
    updateTotalLabelText(data.distance);
  }

  // break point 라벨
  while (breakLabels.length > data.distance.segments.length) {
    breakLabels.pop()?.detach();
  }
  data.distance.segments.forEach((seg, i) => {
    const pos = data.positions[i + 1];
    if (!pos) return;
    if (!breakLabels[i]) {
      breakLabels[i] = overlay.attach(createBreakLabel(), pos, { offset: { x: 70, y: 0 } });
    } else {
      breakLabels[i].update(pos);
    }
    updateBreakLabel(breakLabels[i].element, seg);
  });
});

measure.on('finish', ({ entity }) => {
  // 마지막 totalLabel 에 X 삭제 버튼 활성화
  if (!totalLabelHandle) return;
  const closeBtn = totalLabelHandle.element.querySelector<HTMLButtonElement>('.close');
  if (closeBtn) {
    closeBtn.style.display = '';
    closeBtn.onclick = () => {
      viewer.entities.remove(entity);
      cleanupLabels();
    };
  }
});

measure.on('destroy', () => cleanupLabels());

function cleanupLabels() {
  totalLabelHandle?.detach();
  totalLabelHandle = null;
  for (const h of breakLabels) h.detach();
  breakLabels.length = 0;
}

function createTotalLabel(): HTMLDivElement {
  const el = document.createElement('div');
  el.className = 'measure-total-label';
  el.innerHTML = `
    <button class="close" style="display: none">×</button>
    <div class="row"><strong>수평거리 합</strong> <span class="surface"></span> m</div>
    <div class="row"><strong>사거리 합</strong> <span class="direct"></span> m</div>
  `;
  return el;
}

function updateTotalLabelText(d: NonNullable<MeasureComputePayload['distance']>) {
  if (!totalLabelHandle) return;
  totalLabelHandle.element.querySelector('.surface')!.textContent = d.totalSurface.toFixed(1);
  totalLabelHandle.element.querySelector('.direct')!.textContent = d.totalDirect.toFixed(1);
}
```

> `OverlayHandle.element` 같은 직접 DOM 접근이 필요하면 `attach` 호출자가 보유한 `el` 변수를 그대로 쓰면 된다 (handle 은 위치만 관리).

### React — Portal 패턴

`compute` payload 를 state 로 받아 JSX 에서 라벨 DOM 을 그리고, 위치는 `worldToWindowCoordinates` 로 sync.

```tsx
function MeasureLabels({ viewer, data, onDelete }: Props) {
  const totalPos = data.hover ?? data.positions[data.positions.length - 1];
  return (
    <>
      {totalPos && (
        <PinnedLabel viewer={viewer} position={totalPos} offset={{ x: 70, y: 70 }}>
          <div>수평: {data.distance?.totalSurface.toFixed(1)} m</div>
          <div>사거리: {data.distance?.totalDirect.toFixed(1)} m</div>
          <button onClick={onDelete}>×</button>
        </PinnedLabel>
      )}
      {data.distance?.segments.map((seg, i) => (
        <PinnedLabel key={i} viewer={viewer} position={data.positions[i + 1]} offset={{ x: 70, y: 0 }}>
          {seg.surface.toFixed(1)} m / {seg.slopeDegree.toFixed(1)}°
        </PinnedLabel>
      ))}
    </>
  );
}
```

`PinnedLabel` 은 `scene.postRender` 마다 `worldToWindowCoordinates` 로 left/top 을 갱신하는 작은 컴포넌트.

---

## 저장된 도형 복원

서버에서 받은 좌표 (`[lon, lat, height][]`) 를 entity 로 다시 그린다.

```ts
import { Drawer } from 'cesium-drawing';
import { Cartesian3 } from 'cesium';

function restorePolygons(viewer: Viewer, savedPolygons: SavedPolygon[]) {
  for (const p of savedPolygons) {
    const positions = p.coords.map(([lon, lat, h]) =>
      Cartesian3.fromDegrees(lon, lat, h)
    );
    Drawer.render(viewer, {
      shape: 'POLYGON',
      positions,
      graphics: { /* 도형별 토큰 */ },
    });
  }
}
```

`MeasureController.render(viewer, { measureType, positions })` 도 같은 패턴.

---

## 꼭지점 편집 + 외부 form 양방향 sync

마우스 드래그와 form 입력 모두 같은 좌표 모델을 갱신해야 함. 무한 루프 방지가 핵심.

```tsx
function PolygonForm({ viewer, entity }: { viewer: Viewer; entity: Entity }) {
  const [coords, setCoords] = useState<Cartesian3[]>(readPositionsFrom(entity));

  const { setPositions } = useVertexEditor(
    viewer,
    entity,
    {},
    {
      onChange: ({ positions, reason }) => {
        // drag 로 인한 변경만 form state 에 반영
        // (external 변경은 우리가 일으킨 것이라 다시 받을 필요 없음)
        if (reason === 'drag') setCoords(positions);
      },
    }
  );

  // form 입력으로 coords 변경 → editor 에 push
  useEffect(() => {
    setPositions(coords);
  }, [coords]);

  return (
    <ul>
      {coords.map((c, i) => (
        <li key={i}>
          <CoordInput value={c} onChange={(next) => {
            setCoords((prev) => prev.map((p, idx) => (idx === i ? next : p)));
          }} />
        </li>
      ))}
    </ul>
  );
}
```

핵심: `onChange` 의 `reason` 분기로 "drag → form" 만 적용, "external → form" 은 무시.

---

## 인터랙션 커스터마이징

기본은 좌클릭 추가 / 우클릭 취소 / 더블클릭 종료. 옵션으로 일부만 override.

### Enter 로 종료 + Esc 로 모드 취소

```ts
const drawer = new Drawer(viewer, { shape: 'POLYLINE' });
drawer.bindKey('Enter', () => drawer.finish());
drawer.bindKey('Escape', () => drawer.destroy());
drawer.start();
```

### 더블클릭 대신 첫 점 다시 클릭으로 폴리곤 닫기

직접 매핑은 module 단에서는 없지만 (default 가 doubletap), 사용처에서 컴포지션 가능:

```ts
const drawer = new Drawer(viewer, {
  shape: 'POLYGON',
  interaction: { finish: 'tap' }, // tap 으로 finish 매핑하지 마세요. 모든 tap 이 finish 가 됩니다.
});
```

> 위 옵션은 이론상 가능하지만 실용적이지 않다. 대신 `point-add` 에서 첫 점과 거리 비교해서 `drawer.finish()` 호출:

```ts
const drawer = new Drawer(viewer, { shape: 'POLYGON' });
drawer.on('point-add', ({ positions }) => {
  if (positions.length < 4) return; // 최소 3 + 닫기 클릭 = 4
  const first = positions[0];
  const last = positions[positions.length - 1];
  if (Cartesian3.distance(first, last) < 1) {
    // 마지막 dup 점 제거 후 finish
    drawer.updatePositions(positions.slice(0, -1));
    drawer.finish();
  }
});
drawer.start();
```

---

## 모바일 / 터치

모듈은 PointerEvent 의 `pointerType` 으로 입력 source 를 자동 추적한다 (`'mouse' | 'touch' | 'pen'`).

기본 매핑:

| 의미 | 마우스 | 터치 |
| --- | --- | --- |
| `add-point` | 좌클릭 | 탭 |
| `remove-point` | 우클릭 | 길게 누르기 (500ms) |
| `finish` | 더블클릭 | 더블탭 |

`InputBus` 가 `LEFT_DOWN` 시점부터 longpress 타이머를 돌리고 만료되면 `contextmenu` 를 emit. 동일한 LEFT_CLICK 이뤄질 때 자동 무시되어 tap 중복을 방지.

핀치/팬은 cesium 에 그대로 위임 (`ScreenSpaceCameraController` 비활성화 안 함).

---

## 여러 도형을 차례로 그리기

`Drawer` / `MeasureController` 는 1 인스턴스 = 1 도형. 다음 도형을 그리려면 새 인스턴스.

```ts
let active: Drawer | null = null;

function startNew() {
  active?.destroy();
  active = new Drawer(viewer, { shape: 'POLYGON' });
  active.on('finish', () => { active = null; });
  active.start();
}
```

또는 React 에서 `key` 로 컴포넌트 remount.

---

## 작도 중 도형 삭제

이미 finish 된 entity 를 화면에서 제거하려면 단순히 viewer.entities.remove:

```ts
const entity = drawer.entity;
if (entity) viewer.entities.remove(entity);
```

다음 작도를 위해서는 새 인스턴스 (또는 `drawer.reset()` 후 `drawer.start()`).
