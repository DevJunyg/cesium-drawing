import { useCallback, useEffect, useRef, useState } from "react";
import { VertexEditor } from "@alz/cesium-drawing";
import type { VertexEditorEvents, VertexEditorOptions, VertexEditorState } from "@alz/cesium-drawing";
import type { Cartesian3, Entity, Viewer } from "cesium";

export interface VertexEditorEventHandlers {
  onEnable?: (e: VertexEditorEvents["enable"]) => void;
  onDisable?: (e: VertexEditorEvents["disable"]) => void;
  onDragStart?: (e: VertexEditorEvents["drag-start"]) => void;
  onDrag?: (e: VertexEditorEvents["drag"]) => void;
  onDragEnd?: (e: VertexEditorEvents["drag-end"]) => void;
  onChange?: (e: VertexEditorEvents["change"]) => void;
  onDestroy?: (e: VertexEditorEvents["destroy"]) => void;
}

export interface UseVertexEditorResult {
  editor: VertexEditor | null;
  state: VertexEditorState;
  positions: Cartesian3[];
  enable: () => void;
  disable: () => void;
  destroy: () => void;
  setPositions: (positions: Cartesian3[]) => void;
}

/**
 * VertexEditor 를 React 라이프사이클과 동기화.
 *
 */
export function useVertexEditor(
  viewer: Viewer | null | undefined,
  entity: Entity | null | undefined,
  options?: VertexEditorOptions,
  events?: VertexEditorEventHandlers
): UseVertexEditorResult {
  const [editor, setEditor] = useState<VertexEditor | null>(null);
  const [state, setState] = useState<VertexEditorState>("idle");
  const [positions, setPositions] = useState<Cartesian3[]>([]);

  const optionsRef = useRef(options);
  optionsRef.current = options;

  const eventsRef = useRef(events);
  eventsRef.current = events;

  const editorRef = useRef<VertexEditor | null>(null);

  useEffect(() => {
    if (!viewer || !entity) return;

    const ed = new VertexEditor(viewer, entity, optionsRef.current ?? {});
    editorRef.current = ed;
    setEditor(ed);
    setState("idle");
    setPositions(ed.positions);

    const offs = [
      ed.on("enable", (e) => {
        setState("enabled");
        eventsRef.current?.onEnable?.(e);
      }),
      ed.on("disable", (e) => {
        setState("idle");
        eventsRef.current?.onDisable?.(e);
      }),
      ed.on("drag-start", (e) => {
        eventsRef.current?.onDragStart?.(e);
      }),
      ed.on("drag", (e) => {
        eventsRef.current?.onDrag?.(e);
      }),
      ed.on("drag-end", (e) => {
        eventsRef.current?.onDragEnd?.(e);
      }),
      ed.on("change", (e) => {
        setPositions(e.positions);
        eventsRef.current?.onChange?.(e);
      }),
      ed.on("destroy", (e) => {
        setState("destroyed");
        eventsRef.current?.onDestroy?.(e);
      }),
    ];

    return () => {
      for (const off of offs) off();
      ed.destroy();
      editorRef.current = null;
      setEditor(null);
    };
  }, [viewer, entity]);

  const enable = useCallback(() => {
    editorRef.current?.enable();
  }, []);
  const disable = useCallback(() => {
    editorRef.current?.disable();
  }, []);
  const destroy = useCallback(() => {
    editorRef.current?.destroy();
  }, []);
  const setPositionsCb = useCallback((p: Cartesian3[]) => {
    editorRef.current?.setPositions(p);
  }, []);

  return {
    editor,
    state,
    positions,
    enable,
    disable,
    destroy,
    setPositions: setPositionsCb,
  };
}
