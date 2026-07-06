import { useCallback, useEffect, useRef, useState } from "react";
import { Drawer } from "cesium-drawing";
import type { DrawerEvents, DrawerOptions, DrawerState } from "cesium-drawing";
import type { Cartesian3, Entity, Viewer } from "cesium";

export interface DrawerEventHandlers {
  onStart?: (e: DrawerEvents["start"]) => void;
  onPointAdd?: (e: DrawerEvents["point-add"]) => void;
  onPointRemove?: (e: DrawerEvents["point-remove"]) => void;
  onMove?: (e: DrawerEvents["move"]) => void;
  onPointsChange?: (e: DrawerEvents["points-change"]) => void;
  onFinish?: (e: DrawerEvents["finish"]) => void;
  onCancel?: (e: DrawerEvents["cancel"]) => void;
  onDestroy?: (e: DrawerEvents["destroy"]) => void;
}

export interface UseDrawerResult {
  /** 내부 Drawer 인스턴스 — 고급 사용. 마운트 전이거나 viewer 가 없으면 null. */
  drawer: Drawer | null;
  state: DrawerState;
  /** 확정 점들 (drawer 내부 변경에 따라 자동 갱신) */
  positions: Cartesian3[];
  start: () => void;
  finish: () => Entity | null;
  reset: () => void;
  destroy: () => void;
  updatePositions: (positions: Cartesian3[]) => void;
}

/**
 * Drawer 인스턴스를 React 라이프사이클과 동기화
 *
 */
export function useDrawer(
  viewer: Viewer | null | undefined,
  options: DrawerOptions,
  events?: DrawerEventHandlers
): UseDrawerResult {
  const [drawer, setDrawer] = useState<Drawer | null>(null);
  const [state, setState] = useState<DrawerState>("idle");
  const [positions, setPositions] = useState<Cartesian3[]>([]);

  const optionsRef = useRef(options);
  optionsRef.current = options;

  const eventsRef = useRef(events);
  eventsRef.current = events;

  const drawerRef = useRef<Drawer | null>(null);

  useEffect(() => {
    if (!viewer) return;

    const d = new Drawer(viewer, optionsRef.current);
    drawerRef.current = d;
    setDrawer(d);
    setState("idle");
    setPositions([]);

    const offs = [
      d.on("start", (e) => {
        setState("drawing");
        eventsRef.current?.onStart?.(e);
      }),
      d.on("point-add", (e) => {
        eventsRef.current?.onPointAdd?.(e);
      }),
      d.on("point-remove", (e) => {
        eventsRef.current?.onPointRemove?.(e);
      }),
      d.on("move", (e) => {
        eventsRef.current?.onMove?.(e);
      }),
      d.on("points-change", (e) => {
        setPositions(e.positions);
        eventsRef.current?.onPointsChange?.(e);
      }),
      d.on("finish", (e) => {
        setState("finished");
        eventsRef.current?.onFinish?.(e);
      }),
      d.on("cancel", (e) => {
        setState("idle");
        setPositions([]);
        eventsRef.current?.onCancel?.(e);
      }),
      d.on("destroy", (e) => {
        setState("destroyed");
        eventsRef.current?.onDestroy?.(e);
      }),
    ];

    return () => {
      for (const off of offs) off();
      d.destroy();
      drawerRef.current = null;
      setDrawer(null);
    };
  }, [viewer]);

  const start = useCallback(() => {
    drawerRef.current?.start();
  }, []);
  const finish = useCallback<UseDrawerResult["finish"]>(() => {
    return drawerRef.current?.finish() ?? null;
  }, []);
  const reset = useCallback(() => {
    drawerRef.current?.reset();
  }, []);
  const destroy = useCallback(() => {
    drawerRef.current?.destroy();
  }, []);
  const updatePositions = useCallback((p: Cartesian3[]) => {
    drawerRef.current?.updatePositions(p);
  }, []);

  return {
    drawer,
    state,
    positions,
    start,
    finish,
    reset,
    destroy,
    updatePositions,
  };
}
