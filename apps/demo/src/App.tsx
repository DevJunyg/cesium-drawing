import { useEffect, useRef, useState } from "react";
import {
  Cartesian3,
  ImageryLayer,
  Ion,
  Math as CesiumMath,
  UrlTemplateImageryProvider,
  Viewer,
} from "cesium";
import type { Entity } from "cesium";
import {
  drawPoint,
  drawLine,
  drawPolygon,
  measurePoint,
  measureDistance,
  measureArea,
  destroyActiveEdit,
  getEntityLabel,
  getSegmentLabels,
  removeStampedEntity,
} from "cesium-drawing-adapter";
import type { DrawAdapterOptions, MeasureAdapterOptions } from "cesium-drawing-adapter";
import "cesium/Build/Cesium/Widgets/widgets.css";

type ToolId = "point" | "line" | "polygon" | "m-point" | "m-distance" | "m-area";

interface Controller {
  destroy(): void;
}

type AdapterOptions = DrawAdapterOptions & MeasureAdapterOptions;

const TOOL_FN: Record<ToolId, (viewer: Viewer, options: AdapterOptions) => Controller> = {
  point: drawPoint,
  line: drawLine,
  polygon: drawPolygon,
  "m-point": measurePoint,
  "m-distance": measureDistance,
  "m-area": measureArea,
};

// 도구별 추가 옵션 — 거리: 구간 라벨 없이 마지막 점에 총거리만
const TOOL_EXTRA: Partial<Record<ToolId, AdapterOptions>> = {
  "m-distance": { segmentLabels: false, labelI18n: { totalSurface: "거리" } },
};

const DRAW_TOOLS: { id: ToolId; label: string }[] = [
  { id: "point", label: "점" },
  { id: "line", label: "선" },
  { id: "polygon", label: "면" },
];

const MEASURE_TOOLS: { id: ToolId; label: string }[] = [
  { id: "m-point", label: "좌표" },
  { id: "m-distance", label: "거리" },
  { id: "m-area", label: "면적" },
];

function useCesiumViewer(container: React.RefObject<HTMLDivElement>): Viewer | null {
  const [viewer, setViewer] = useState<Viewer | null>(null);

  useEffect(() => {
    if (!container.current) return;

    // Cesium Ion 미사용 — OSM 타일만 사용
    Ion.defaultAccessToken = "";

    const v = new Viewer(container.current, {
      baseLayer: ImageryLayer.fromProviderAsync(
        Promise.resolve(
          new UrlTemplateImageryProvider({
            url: "https://tile.openstreetmap.org/{z}/{x}/{y}.png",
            maximumLevel: 19,
            credit: "© OpenStreetMap contributors",
          }),
        ),
        {},
      ),
      baseLayerPicker: false,
      geocoder: false,
      homeButton: false,
      sceneModePicker: false,
      navigationHelpButton: false,
      animation: false,
      timeline: false,
      fullscreenButton: false,
      infoBox: false,
      selectionIndicator: false,
    });

    v.camera.setView({
      destination: Cartesian3.fromDegrees(127.024, 37.5, 20000),
      orientation: { heading: 0, pitch: -CesiumMath.PI_OVER_TWO, roll: 0 },
    });

    setViewer(v);
    return () => {
      v.destroy();
      setViewer(null);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return viewer;
}

export function App() {
  const containerRef = useRef<HTMLDivElement>(null);
  const viewer = useCesiumViewer(containerRef);
  const [tool, setTool] = useState<ToolId | null>(null);
  const activeRef = useRef<Controller | null>(null);
  const entitiesRef = useRef<Entity[]>([]);

  const stopActive = () => {
    activeRef.current?.destroy();
    activeRef.current = null;
  };

  const select = (id: ToolId) => {
    if (!viewer) return;
    destroyActiveEdit();
    stopActive();

    if (tool === id) {
      setTool(null);
      return;
    }

    activeRef.current = TOOL_FN[id](viewer, {
      ...TOOL_EXTRA[id],
      onEnd: (entity) => {
        entitiesRef.current.push(entity);
        activeRef.current = null;
        setTool(null);
      },
      onCancel: () => {
        activeRef.current = null;
        setTool(null);
      },
    });
    setTool(id);
  };

  const clearAll = () => {
    if (!viewer) return;
    destroyActiveEdit();
    stopActive();
    for (const e of entitiesRef.current) {
      getEntityLabel(e)?.label.destroy();
      getSegmentLabels(e)?.destroy();
      removeStampedEntity(viewer, e);
    }
    entitiesRef.current = [];
    setTool(null);
    viewer.scene.requestRender();
  };

  return (
    <div className="app">
      <div ref={containerRef} className="viewer" />

      <div className="toolbar">
        <div className="group">
          <span className="group-label">작도</span>
          {DRAW_TOOLS.map((t) => (
            <button
              key={t.id}
              className={tool === t.id ? "active" : ""}
              onClick={() => select(t.id)}
            >
              {t.label}
            </button>
          ))}
        </div>

        <div className="group">
          <span className="group-label">측정</span>
          {MEASURE_TOOLS.map((t) => (
            <button
              key={t.id}
              className={tool === t.id ? "active" : ""}
              onClick={() => select(t.id)}
            >
              {t.label}
            </button>
          ))}
        </div>

        <div className="group">
          <button onClick={clearAll}>전체 지우기</button>
        </div>

        <p className="hint">
          좌클릭 점 추가 · 더블클릭 완료 · 우클릭 직전 점 취소 · 도형의 라벨을 클릭하면 편집
        </p>
      </div>
    </div>
  );
}
