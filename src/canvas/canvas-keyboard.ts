type CanvasKeyboardApi = ReturnType<typeof createCanvasKeyboardModule>;
declare var UMLCanvasKeyboard: CanvasKeyboardApi;

(function initCanvasKeyboardModule(root: typeof globalThis & { UMLCanvasKeyboard?: CanvasKeyboardApi }, factory: () => CanvasKeyboardApi) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root) root.UMLCanvasKeyboard = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, createCanvasKeyboardModule);

function createCanvasKeyboardModule() {
  'use strict';

  const REQUIRED_FUNCTIONS = Object.freeze([
    'byId', 'dg', 'diagramKindLabel', 'flashStatus', 'render', 'renderProps', 'setSelection',
  ] as const);
  const REQUIRED_VALUES = Object.freeze(['state', 'wrap'] as const);
  const REVEAL_MARGIN = 24;
  const EDITING_SELECTOR = 'input, textarea, select, [contenteditable="true"]';

  interface SelectableView { id: string; kind: string; name?: string }
  type ElementView = SelectableView & DiagramBounds;
  type RelationView = SelectableView & { from: string; to: string };
  type NavigationItem =
    | { kind: 'element'; view: ElementView }
    | { kind: 'relation'; view: RelationView };

  interface KeyboardDependencies {
    byId(id: string): ElementView | null | undefined;
    dg(): { type: string; elements?: ElementView[]; relations?: RelationView[] } | null;
    diagramKindLabel(kind: string, type?: string): string;
    flashStatus(message: string): void;
    render(): void;
    renderProps(): void;
    setSelection(ids: string[]): void;
    state: { selectedId?: string | null; selection?: string[]; zoom: number };
    wrap: HTMLElement;
  }

  function create(deps: Partial<KeyboardDependencies> = {}) {
    REQUIRED_FUNCTIONS.forEach(name => {
      if (typeof deps[name] !== 'function') throw new TypeError(`UMLCanvasKeyboard requires ${name}()`);
    });
    REQUIRED_VALUES.forEach(name => {
      if (deps[name] == null) throw new TypeError(`UMLCanvasKeyboard requires ${name}`);
    });

    const {
      byId, dg, diagramKindLabel, flashStatus, render, renderProps, setSelection, state, wrap,
    } = deps as KeyboardDependencies;
    let attached = false;

    /* everything the user can select, in drawing order: elements first, then the
       relations between them */
    function navigableItems(): NavigationItem[] {
      const diagram = dg();
      if (!diagram) return [];
      return [
        ...(diagram.elements || []).map(view => ({ view, kind: 'element' as const })),
        ...(diagram.relations || []).map(view => ({ view, kind: 'relation' as const })),
      ];
    }

    function currentId() {
      if (state.selectedId) return state.selectedId;
      const selection = state.selection || [];
      return selection.length ? selection[selection.length - 1] : null;
    }

    function boxOf(view?: DiagramBounds | null) {
      return view && [view.x, view.y, view.w, view.h].every(Number.isFinite)
        ? { x: view.x, y: view.y, w: view.w, h: view.h }
        : null;
    }

    /* a relation has no box of its own — use the span of the two views it joins */
    function bounds(item: NavigationItem) {
      if (item.kind === 'element') return boxOf(item.view);
      const from = boxOf(byId(item.view.from));
      const to = boxOf(byId(item.view.to));
      if (!from || !to) return null;
      const x = Math.min(from.x, to.x);
      const y = Math.min(from.y, to.y);
      return {
        x,
        y,
        w: Math.max(from.x + from.w, to.x + to.w) - x,
        h: Math.max(from.y + from.h, to.y + to.h) - y,
      };
    }

    /* scroll the least amount that brings the view inside the visible area */
    function reveal(item: NavigationItem) {
      const box = bounds(item);
      if (!box || !Number.isFinite(wrap.clientWidth) || !Number.isFinite(wrap.clientHeight)) return false;
      const zoom = Number.isFinite(state.zoom) && state.zoom > 0 ? state.zoom : 1;
      const left = box.x * zoom;
      const top = box.y * zoom;
      const right = (box.x + box.w) * zoom;
      const bottom = (box.y + box.h) * zoom;
      if (right + REVEAL_MARGIN > wrap.scrollLeft + wrap.clientWidth) {
        wrap.scrollLeft = right + REVEAL_MARGIN - wrap.clientWidth;
      }
      if (left - REVEAL_MARGIN < wrap.scrollLeft) wrap.scrollLeft = Math.max(0, left - REVEAL_MARGIN);
      if (bottom + REVEAL_MARGIN > wrap.scrollTop + wrap.clientHeight) {
        wrap.scrollTop = bottom + REVEAL_MARGIN - wrap.clientHeight;
      }
      if (top - REVEAL_MARGIN < wrap.scrollTop) wrap.scrollTop = Math.max(0, top - REVEAL_MARGIN);
      return true;
    }

    function announce(item: NavigationItem, index: number, total: number) {
      const label = diagramKindLabel(item.view.kind, dg()?.type);
      const name = String(item.view.name || '').trim();
      return `${label}${name ? ` "${name}"` : ''} · ${index + 1}/${total} 선택 · Tab 다음 · Shift+Tab 이전 · Esc 해제`;
    }

    function selectAt(items: NavigationItem[], index: number) {
      const item = items[index];
      if (!item) return false;
      setSelection([item.view.id]);
      render();
      renderProps();
      reveal(item);
      /* after render(), which repaints the status bar with the diagram summary */
      flashStatus(announce(item, index, items.length));
      return true;
    }

    function clearSelection() {
      setSelection([]);
      render();
      renderProps();
    }

    /* Tab walks the diagram and, past either end, drops the selection and lets the
       browser move on — so the canvas is never a keyboard trap */
    function step(forward: boolean) {
      const items = navigableItems();
      if (!items.length) return false;
      const index = items.findIndex(item => item.view.id === currentId());
      if (index < 0) return selectAt(items, forward ? 0 : items.length - 1);
      const next = index + (forward ? 1 : -1);
      if (next < 0 || next >= items.length) {
        clearSelection();
        flashStatus('캔버스 선택 해제 — Tab으로 캔버스를 벗어납니다');
        return false;
      }
      return selectAt(items, next);
    }

    function handleKeydown(event: KeyboardEvent) {
      if (event.key !== 'Tab' || event.altKey || event.ctrlKey || event.metaKey) return;
      const target = event.target as (EventTarget & Partial<Pick<Element, 'matches'>>) | null;
      if (target?.matches?.(EDITING_SELECTOR)) return;
      if (step(!event.shiftKey)) event.preventDefault();
    }

    function attach() {
      if (attached) return;
      attached = true;
      wrap.addEventListener('keydown', handleKeydown);
    }

    function detach() {
      if (!attached) return;
      attached = false;
      wrap.removeEventListener('keydown', handleKeydown);
    }

    return Object.freeze({ attach, detach, navigableItems, selectNext: () => step(true), selectPrevious: () => step(false) });
  }

  return Object.freeze({ REQUIRED_FUNCTIONS, REQUIRED_VALUES, create });
}
