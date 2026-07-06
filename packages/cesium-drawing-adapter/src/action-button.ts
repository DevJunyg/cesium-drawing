/**
 * 단일 액션 버튼 — 라벨 옆에 부착되는 작은 sqaure 버튼.
 *
 * mode-toggle 같은 stateful 동작은 호출처에서 setVisible/setOnClick 으로 직접 제어.
 * 동일한 외형의 여러 버튼 (✎ edit / ↶ cancel / ✕ delete) 을 만들어 그룹화한다.
 */

export type IconLike = string | Node;

export interface ActionButtonOptions {
  /** 아이콘 (string = SVG/HTML, Node = 미리 만든 DOM. mode 전환 시 cloneNode 로 안전 복제) */
  icon?: IconLike;
  /** tooltip + aria-label */
  title?: string;
  /** 추가 className */
  className?: string;
  /** 'danger' 적용 시 위험 액션 (삭제) 색조 */
  variant?: "default" | "danger";
}

export interface ActionButtonHandle {
  el: HTMLButtonElement;
  setOnClick(handler: () => void): void;
  setVisible(visible: boolean): void;
  destroy(): void;
}

/* =========================================================================
 * 기본 아이콘 (SVG string). 사용처가 일부만 override
 * ========================================================================= */

export const DEFAULT_EDIT_ICON = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 20h9"/><path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z"/></svg>`;
export const DEFAULT_DELETE_ICON = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/><line x1="10" y1="11" x2="10" y2="17"/><line x1="14" y1="11" x2="14" y2="17"/></svg>`;
export const DEFAULT_CANCEL_ICON = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M9 14l-4-4 4-4"/><path d="M5 10h11a4 4 0 0 1 0 8h-1"/></svg>`;

const STYLE_ID = "cesium-drawing-action-button-style";

function ensureStyles(): void {
  if (document.getElementById(STYLE_ID)) return;
  const style = document.createElement("style");
  style.id = STYLE_ID;
  style.textContent = `
    .cesium-drawing-action-button {
      width: 22px;
      height: 22px;
      display: inline-flex;
      align-items: center;
      justify-content: center;
      background: #fff;
      border: 1px solid rgba(0, 0, 0, 0.08);
      border-radius: 4px;
      cursor: pointer;
      box-shadow: 0 2px 6px rgba(0, 0, 0, 0.15);
      color: #6B7281;
      padding: 0;
      pointer-events: auto;
      transition: background 0.12s, color 0.12s, border-color 0.12s;
      flex-shrink: 0;
    }
    .cesium-drawing-action-button:hover {
      background: #f5f5f5;
    }
    .cesium-drawing-action-button[data-variant="danger"] {
      color: #c0392b;
      border-color: rgba(192, 57, 43, 0.25);
    }
    .cesium-drawing-action-button[data-variant="danger"]:hover {
      background: #fff5f5;
    }
    .cesium-drawing-action-button svg {
      display: block;
    }
    .cesium-drawing-action-buttons {
      display: flex;
      flex-direction: row;
      gap: 2px;
      pointer-events: auto;
    }
  `;
  document.head.appendChild(style);
}

function setIcon(target: HTMLElement, icon: IconLike): void {
  while (target.firstChild) target.removeChild(target.firstChild);
  if (typeof icon === "string") {
    target.innerHTML = icon;
  } else {
    target.appendChild(icon.cloneNode(true));
  }
}

export function createActionButton(options: ActionButtonOptions = {}): ActionButtonHandle {
  ensureStyles();

  const btn = document.createElement("button");
  btn.type = "button";
  let cn = "cesium-drawing-action-button";
  if (options.className) cn += " " + options.className;
  btn.className = cn;
  if (options.variant === "danger") btn.dataset.variant = "danger";

  if (options.icon !== undefined) setIcon(btn, options.icon);
  if (options.title) {
    btn.title = options.title;
    btn.setAttribute("aria-label", options.title);
  }

  let handler: (() => void) | null = null;
  btn.addEventListener("click", (e) => {
    e.stopPropagation();
    e.preventDefault();
    handler?.();
  });

  return {
    el: btn,
    setOnClick(h) {
      handler = h;
    },
    setVisible(v) {
      btn.style.display = v ? "" : "none";
    },
    destroy() {
      btn.remove();
      handler = null;
    },
  };
}
