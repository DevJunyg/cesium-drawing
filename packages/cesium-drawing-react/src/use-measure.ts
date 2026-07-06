import { useCallback, useEffect, useRef, useState } from 'react';
import { MeasureController } from "cesium-drawing";
import type {
  MeasureComputePayload,
  MeasureControllerOptions,
  MeasureEvents,
  DrawerState,
} from "cesium-drawing";
import type { Cartesian3, Entity, Viewer } from 'cesium';

export interface MeasureEventHandlers {
  onStart?: (e: MeasureEvents['start']) => void;
  onPointAdd?: (e: MeasureEvents['point-add']) => void;
  onPointRemove?: (e: MeasureEvents['point-remove']) => void;
  onMove?: (e: MeasureEvents['move']) => void;
  onPointsChange?: (e: MeasureEvents['points-change']) => void;
  onFinish?: (e: MeasureEvents['finish']) => void;
  onCancel?: (e: MeasureEvents['cancel']) => void;
  onDestroy?: (e: MeasureEvents['destroy']) => void;
  /** 측정값 계산 결과. 라벨 렌더링에 사용. 매 mousemove 마다 발화. */
  onCompute?: (e: MeasureEvents['compute']) => void;
}

export interface UseMeasureResult {
  measure: MeasureController | null;
  state: DrawerState;
  positions: Cartesian3[];
  /** 마지막 'compute' 페이로드. drawing 중에는 매 mousemove 마다 갱신됨. */
  compute: MeasureComputePayload | null;
  start: () => void;
  finish: () => Entity | null;
  reset: () => void;
  destroy: () => void;
  updatePositions: (positions: Cartesian3[]) => void;
}

/**
 * MeasureController 를 React 라이프사이클과 동기화.
 *
 * - 'compute' 페이로드를 state 로 트래킹하므로 라벨 컴포넌트가
 *   `result.compute` 를 바로 JSX 에서 사용 가능.
 * - mousemove 마다 re-render 가 부담스러우면 `onCompute` 콜백만 사용하고
 *   `result.compute` 는 무시하라.
 *
 * 동작 규칙은 useDrawer 와 동일 (viewer 변경 시 재생성, options 첫 마운트 고정).
 */
export function useMeasure(
  viewer: Viewer | null | undefined,
  options: MeasureControllerOptions,
  events?: MeasureEventHandlers
): UseMeasureResult {
  const [measure, setMeasure] = useState<MeasureController | null>(null);
  const [state, setState] = useState<DrawerState>('idle');
  const [positions, setPositions] = useState<Cartesian3[]>([]);
  const [compute, setCompute] = useState<MeasureComputePayload | null>(null);

  const optionsRef = useRef(options);
  optionsRef.current = options;

  const eventsRef = useRef(events);
  eventsRef.current = events;

  const measureRef = useRef<MeasureController | null>(null);

  useEffect(() => {
    if (!viewer) return;

    const m = new MeasureController(viewer, optionsRef.current);
    measureRef.current = m;
    setMeasure(m);
    setState('idle');
    setPositions([]);
    setCompute(null);

    const offs = [
      m.on('start', (e) => {
        setState('drawing');
        eventsRef.current?.onStart?.(e);
      }),
      m.on('point-add', (e) => {
        eventsRef.current?.onPointAdd?.(e);
      }),
      m.on('point-remove', (e) => {
        eventsRef.current?.onPointRemove?.(e);
      }),
      m.on('move', (e) => {
        eventsRef.current?.onMove?.(e);
      }),
      m.on('points-change', (e) => {
        setPositions(e.positions);
        eventsRef.current?.onPointsChange?.(e);
      }),
      m.on('finish', (e) => {
        setState('finished');
        eventsRef.current?.onFinish?.(e);
      }),
      m.on('cancel', (e) => {
        setState('idle');
        setPositions([]);
        eventsRef.current?.onCancel?.(e);
      }),
      m.on('destroy', (e) => {
        setState('destroyed');
        eventsRef.current?.onDestroy?.(e);
      }),
      m.on('compute', (e) => {
        setCompute(e);
        eventsRef.current?.onCompute?.(e);
      }),
    ];

    return () => {
      for (const off of offs) off();
      m.destroy();
      measureRef.current = null;
      setMeasure(null);
    };
  }, [viewer]);

  const start = useCallback(() => {
    measureRef.current?.start();
  }, []);
  const finish = useCallback<UseMeasureResult['finish']>(() => {
    return measureRef.current?.finish() ?? null;
  }, []);
  const reset = useCallback(() => {
    measureRef.current?.reset();
  }, []);
  const destroy = useCallback(() => {
    measureRef.current?.destroy();
  }, []);
  const updatePositions = useCallback((p: Cartesian3[]) => {
    measureRef.current?.updatePositions(p);
  }, []);

  return {
    measure,
    state,
    positions,
    compute,
    start,
    finish,
    reset,
    destroy,
    updatePositions,
  };
}
