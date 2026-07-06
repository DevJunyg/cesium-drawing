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
import { useDrawer, useMeasure, useVertexEditor } from "cesium-drawing-react";
import type { MeasureComputePayload, MeasureType, ShapeType } from "cesium-drawing";
import "cesium/Build/Cesium/Widgets/widgets.css";

type Tool = "point" | "polyline" | "polygon" | "distance" | "area" | "edit" | null;

const DRAW_SHAPE: Record<string, ShapeType> = {
  point: "POINT",
  polyline: "POLYLINE",
  polygon: "POLYGON",
};

const MEASURE_TYPE: Record<string, MeasureType> = {
  distance: "DISTANCE",
  area: "AREA",
};

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

function DrawTool(props: {
  viewer: Viewer;
  shape: ShapeType;
  onDone: (entity: Entity | null) => void;
}) {
  const { drawer, start } = useDrawer(
    props.viewer,
    { shape: props.shape },
    {
      onFinish: ({ entity }) => props.onDone(entity),
      onCancel: () => props.onDone(null),
    },
  );
  useEffect(() => {
    if (drawer) start();
  }, [drawer, start]);
  return null;
}

function MeasureTool(props: {
  viewer: Viewer;
  measureType: MeasureType;
  onCompute: (payload: MeasureComputePayload) => void;
  onDone: (entity: Entity | null) => void;
}) {
  const { measure, start } = useMeasure(
    props.viewer,
    { measureType: props.measureType },
    {
      onCompute: props.onCompute,
      onFinish: ({ entity }) => props.onDone(entity),
      onCancel: () => props.onDone(null),
    },
  );
  useEffect(() => {
    if (measure) start();
  }, [measure, start]);
  return null;
}

function EditTool(props: { viewer: Viewer; entity: Entity }) {
  const { editor, enable } = useVertexEditor(props.viewer, props.entity);
  useEffect(() => {
    if (editor) enable();
  }, [editor, enable]);
  return null;
}

function formatLength(m: number): string {
  return m >= 1000 ? `${(m / 1000).toFixed(2)} km` : `${m.toFixed(1)} m`;
}

function formatArea(m2: number): string {
  return m2 >= 1_000_000 ? `${(m2 / 1_000_000).toFixed(3)} km²` : `${m2.toFixed(1)} m²`;
}

const DRAW_TOOLS: { id: Tool; label: string }[] = [
  { id: "point", label: "점" },
  { id: "polyline", label: "선" },
  { id: "polygon", label: "면" },
];

const MEASURE_TOOLS: { id: Tool; label: string }[] = [
  { id: "distance", label: "거리" },
  { id: "area", label: "면적" },
];

export function App() {
  const containerRef = useRef<HTMLDivElement>(null);
  const viewer = useCesiumViewer(containerRef);
  const [tool, setTool] = useState<Tool>(null);
  const [lastEntity, setLastEntity] = useState<Entity | null>(null);
  const [compute, setCompute] = useState<MeasureComputePayload | null>(null);

  const select = (next: Tool) => {
    setCompute(null);
    setTool((prev) => (prev === next ? null : next));
  };

  const done = (entity: Entity | null) => {
    if (entity) setLastEntity(entity);
    setTool(null);
  };

  const clearAll = () => {
    setTool(null);
    setLastEntity(null);
    setCompute(null);
    viewer?.entities.removeAll();
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
          <button
            className={tool === "edit" ? "active" : ""}
            disabled={!lastEntity}
            onClick={() => select("edit")}
          >
            정점 편집
          </button>
          <button onClick={clearAll}>전체 지우기</button>
        </div>

        <p className="hint">좌클릭 점 추가 · 더블클릭 완료 · 우클릭 직전 점 취소</p>
      </div>

      {compute && <Readout payload={compute} />}

      {viewer && tool && DRAW_SHAPE[tool] && (
        <DrawTool key={tool} viewer={viewer} shape={DRAW_SHAPE[tool]} onDone={done} />
      )}
      {viewer && tool && MEASURE_TYPE[tool] && (
        <MeasureTool
          key={tool}
          viewer={viewer}
          measureType={MEASURE_TYPE[tool]}
          onCompute={setCompute}
          onDone={done}
        />
      )}
      {viewer && tool === "edit" && lastEntity && (
        <EditTool key="edit" viewer={viewer} entity={lastEntity} />
      )}
    </div>
  );
}

function Readout({ payload }: { payload: MeasureComputePayload }) {
  return (
    <div className="readout">
      {payload.measureType === "DISTANCE" && payload.distance && (
        <>
          <Row label="직선거리" value={formatLength(payload.distance.totalDirect)} />
          <Row label="표면거리" value={formatLength(payload.distance.totalSurface)} />
        </>
      )}
      {payload.measureType === "AREA" && payload.area && (
        <Row label="면적" value={formatArea(payload.area.surface)} />
      )}
      {payload.measureType === "POINT" && payload.point && (
        <>
          <Row label="경도" value={payload.point.lon.toFixed(6)} />
          <Row label="위도" value={payload.point.lat.toFixed(6)} />
          <Row label="고도" value={`${payload.point.height.toFixed(1)} m`} />
        </>
      )}
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="row">
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}
