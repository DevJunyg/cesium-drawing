import {
  ScreenSpaceEventHandler,
  ScreenSpaceEventType,
  type Cartesian2,
  type Viewer,
} from "cesium";

export interface StartTooltipHandle {
  destroy: () => void;
}

/**
 * 시작 툴팁 helper.
 *
 */
export function createStartTooltip(
  viewer: Viewer,
  message: string,
  offset: { x: number; y: number } = { x: 12, y: 12 }
): StartTooltipHandle {
  const container = viewer.container as HTMLElement;
  const containerRect = container.getBoundingClientRect();

  const el = document.createElement("div");
  el.className = "cesium-drawing-start-tooltip";
  el.innerText = message;
  Object.assign(el.style, {
    position: "absolute",
    background: "#fff",
    color: "#000",
    padding: "4px 8px",
    borderRadius: "3px",
    boxShadow: "0px 3px 10px rgba(0, 0, 0, 0.1)",
    pointerEvents: "none",
    fontSize: "12px",
    fontWeight: "500",
    whiteSpace: "nowrap",
    zIndex: "5",
    display: "none", // 첫 mousemove 숨김
  } as Partial<CSSStyleDeclaration>);
  container.appendChild(el);

  let destroyed = false;
  const handler = new ScreenSpaceEventHandler(viewer.canvas);

  handler.setInputAction((m: { endPosition: Cartesian2 }) => {
    if (destroyed || !m.endPosition) return;
    const canvasRect = viewer.canvas.getBoundingClientRect();
    const dx = canvasRect.left - containerRect.left;
    const dy = canvasRect.top - containerRect.top;
    el.style.display = "";
    el.style.left = `${m.endPosition.x + dx + offset.x}px`;
    el.style.top = `${m.endPosition.y + dy + offset.y}px`;
  }, ScreenSpaceEventType.MOUSE_MOVE);

  return {
    destroy: () => {
      if (destroyed) return;
      destroyed = true;
      if (!handler.isDestroyed()) handler.destroy();
      el.remove();
    },
  };
}
