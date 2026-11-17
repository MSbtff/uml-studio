'use strict';

/* History Controller — owns the bounded Undo/Redo stacks while the host keeps
   responsibility for serializing and restoring the project document. */
(function initHistoryControllerModule<Api>(root: typeof globalThis & { UMLHistoryController?: Api }, factory: () => Api) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root) root.UMLHistoryController = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function createHistoryControllerModule() {
  const REQUIRED_FUNCTIONS = Object.freeze([
    'captureState',
    'markDirty',
    'restoreState',
  ] as const);
  const REQUIRED_VALUES = Object.freeze([]);
  const MAX_HISTORY_ENTRIES = 100;

  type HistoryDependencies<State> = {
    captureState(): State;
    restoreState(state: State): void;
    markDirty(): void;
  };

  function create<State>(dependencies?: HistoryDependencies<State>) {
    const deps: Partial<HistoryDependencies<State>> = dependencies || {};
    const missing = REQUIRED_FUNCTIONS.filter(name => typeof deps[name] !== 'function');
    if (missing.length) {
      throw new TypeError(`History Controller 의존성이 없습니다: ${missing.join(', ')}`);
    }

    const { captureState, markDirty, restoreState } = deps as HistoryDependencies<State>;
    let undoStack: State[] = [];
    let redoStack: State[] = [];

    function canUndo() {
      return undoStack.length > 0;
    }

    function canRedo() {
      return redoStack.length > 0;
    }

    function resetHistory() {
      undoStack = [];
      redoStack = [];
    }

    function snapshot() {
      undoStack.push(captureState());
      if (undoStack.length > MAX_HISTORY_ENTRIES) undoStack.shift();
      redoStack = [];
      markDirty();
    }

    function undo() {
      if (!undoStack.length) return;
      redoStack.push(captureState());
      restoreState(undoStack.pop()!);
    }

    function redo() {
      if (!redoStack.length) return;
      undoStack.push(captureState());
      restoreState(redoStack.pop()!);
    }

    function rollbackLastSnapshot() {
      const previous = undoStack.pop();
      if (previous) restoreState(previous);
      redoStack = [];
    }

    return Object.freeze({
      canRedo,
      canUndo,
      redo,
      resetHistory,
      rollbackLastSnapshot,
      snapshot,
      undo,
    });
  }

  return Object.freeze({
    MAX_HISTORY_ENTRIES,
    REQUIRED_FUNCTIONS,
    REQUIRED_VALUES,
    create,
  });
});
