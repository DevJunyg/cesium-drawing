import { Drawer } from "cesium-drawing";
import type { Cartesian3, Entity, Viewer } from "cesium";

import { DRAW_GRAPHICS } from "./tokens";
import { stampEntity } from "./entity-stamp";
import { createStartTooltip, type StartTooltipHandle } from "./start-tooltip";
import { createDrawActionLabel, type DrawActionButtonOptions } from "./draw-action-label";
import { registerEntityLabel } from "./persisted-labels";
import { type ActionClickEvent } from "./edit-adapter";
import { clampPositionsToTerrain } from "./terrain-clamp";
import { attachDrawUI, wireEditEntry, type AttachDrawUIOptions } from "./attach-entity-ui";

export interface DrawAdapterOptions {
  onEnd?: (entity: Entity, positions: Cartesian3[]) => void;
  onCancel?: () => void;
  onPointsChange?: (positions: Cartesian3[]) => void;
  startTooltip?: string | false;
  actionButton?: DrawActionButtonOptions | false;
  editLabelMessage?: string;
  removeHintMessage?: string | false;
  addHintMessage?: string | false;

  onActionIdle?: (e: ActionClickEvent) => void;
  onActionEditing?: (e: ActionClickEvent) => void;
  onActionCancel?: (e: ActionClickEvent) => void;

  onEditEnter?: (entity: Entity) => void;
  onEditExit?: (entity: Entity) => void;
  onDelete?: (entity: Entity) => void;
}

const DEFAULT_TOOLTIPS: Record<"POINT" | "POLYLINE" | "POLYGON", string> = {
  POINT: "지점 선택",
  POLYLINE: "시작점 선택",
  POLYGON: "시작점 선택",
};

function attachAdapter(
  viewer: Viewer,
  drawer: Drawer,
  shape: "POINT" | "POLYLINE" | "POLYGON",
  options: DrawAdapterOptions
): Drawer {
  const tooltipMessage =
    options.startTooltip === false ? null : (options.startTooltip ?? DEFAULT_TOOLTIPS[shape]);
  let tooltip: StartTooltipHandle | null = tooltipMessage
    ? createStartTooltip(viewer, tooltipMessage)
    : null;
  const closeTooltip = () => {
    tooltip?.destroy();
    tooltip = null;
  };

  drawer.on("point-add", () => closeTooltip());

  drawer.on("finish", ({ entity, positions: rawPositions }) => {
    closeTooltip();
    const positions = clampPositionsToTerrain(viewer, rawPositions);
    stampEntity(viewer, entity, { type: shape, positions });

    if (options.actionButton !== false) {
      const actionLabel = createDrawActionLabel(viewer, positions, {
        actionButton: options.actionButton,
        i18n: { editHint: options.editLabelMessage },
      });
      registerEntityLabel(entity, {
        kind: "draw",
        type: shape,
        label: actionLabel,
      });
      wireEditEntry(viewer, entity, actionLabel, options);
    }

    options.onEnd?.(entity, positions);
  });

  drawer.on("cancel", () => {
    closeTooltip();
    options.onCancel?.();
  });
  drawer.on("destroy", () => closeTooltip());
  if (options.onPointsChange) {
    drawer.on("points-change", ({ positions }) => options.onPointsChange!(positions));
  }
  drawer.bindKey("Escape", () => drawer.destroy());

  drawer.start();
  return drawer;
}

export function drawPoint(viewer: Viewer, options: DrawAdapterOptions = {}): Drawer {
  const drawer = new Drawer(viewer, {
    shape: "POINT",
    pickMode: "auto",
    graphics: DRAW_GRAPHICS.POINT,
  });
  return attachAdapter(viewer, drawer, "POINT", options);
}

export function drawLine(viewer: Viewer, options: DrawAdapterOptions = {}): Drawer {
  const drawer = new Drawer(viewer, {
    shape: "POLYLINE",
    pickMode: "auto",
    graphics: DRAW_GRAPHICS.POLYLINE,
  });
  return attachAdapter(viewer, drawer, "POLYLINE", options);
}

export function drawPolygon(viewer: Viewer, options: DrawAdapterOptions = {}): Drawer {
  const drawer = new Drawer(viewer, {
    shape: "POLYGON",
    pickMode: "terrain",
    graphics: DRAW_GRAPHICS.POLYGON,
  });
  return attachAdapter(viewer, drawer, "POLYGON", options);
}

export function renderPoint(
  viewer: Viewer,
  positions: Cartesian3[],
  options: { id?: string } = {}
): Entity | null {
  const entity = Drawer.render(viewer, {
    shape: "POINT",
    positions,
    graphics: DRAW_GRAPHICS.POINT,
  });
  if (!entity) return null;
  stampEntity(viewer, entity, { type: "POINT", positions, id: options.id });
  return entity;
}

export function renderLine(
  viewer: Viewer,
  positions: Cartesian3[],
  options: { id?: string } = {}
): Entity | null {
  const entity = Drawer.render(viewer, {
    shape: "POLYLINE",
    positions,
    graphics: DRAW_GRAPHICS.POLYLINE,
  });
  if (!entity) return null;
  stampEntity(viewer, entity, { type: "POLYLINE", positions, id: options.id });
  return entity;
}

export function renderPolygon(
  viewer: Viewer,
  positions: Cartesian3[],
  options: { id?: string } = {}
): Entity | null {
  const entity = Drawer.render(viewer, {
    shape: "POLYGON",
    positions,
    graphics: DRAW_GRAPHICS.POLYGON,
  });
  if (!entity) return null;
  stampEntity(viewer, entity, { type: "POLYGON", positions, id: options.id });
  return entity;
}

export interface RestoreDrawOptions extends AttachDrawUIOptions {
  id?: string;
}

export function restorePoint(
  viewer: Viewer,
  positions: Cartesian3[],
  options: RestoreDrawOptions = {}
): Entity | null {
  const entity = renderPoint(viewer, positions, { id: options.id });
  if (!entity) return null;
  attachDrawUI(viewer, entity, positions, "POINT", options);
  return entity;
}

export function restoreLine(
  viewer: Viewer,
  positions: Cartesian3[],
  options: RestoreDrawOptions = {}
): Entity | null {
  const entity = renderLine(viewer, positions, { id: options.id });
  if (!entity) return null;
  attachDrawUI(viewer, entity, positions, "POLYLINE", options);
  return entity;
}

export function restorePolygon(
  viewer: Viewer,
  positions: Cartesian3[],
  options: RestoreDrawOptions = {}
): Entity | null {
  const entity = renderPolygon(viewer, positions, { id: options.id });
  if (!entity) return null;
  attachDrawUI(viewer, entity, positions, "POLYGON", options);
  return entity;
}
