'use strict';

type RuntimeErrorsApi = ReturnType<typeof createRuntimeErrorsModule>;
declare var UMLRuntimeErrors: RuntimeErrorsApi;

(function initRuntimeErrors(root: typeof globalThis & { UMLRuntimeErrors?: RuntimeErrorsApi }, factory: () => RuntimeErrorsApi) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root) root.UMLRuntimeErrors = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, createRuntimeErrorsModule);

function createRuntimeErrorsModule() {
  const { text: uiText } = globalThis.UMLLanguage
    ?? require('./language.js') as typeof UMLLanguage;

  const REQUIRED_FUNCTIONS = Object.freeze([
    'flashStatus',
    'now',
    'renderStatus',
  ] as const);
  const REQUIRED_VALUES = Object.freeze([
    'eventRoot',
    'state',
  ] as const);
  const REPEAT_WINDOW_MS = 3000;
  const MAX_MESSAGE_LENGTH = 140;

  type RuntimeErrorEvent = { type: string; reason?: unknown; error?: unknown; message?: unknown };
  type RuntimeErrorState = { count: number; last: string; at: number };
  type RuntimeErrorDependencies = {
    flashStatus(message: string): void;
    now(): number;
    renderStatus(): void;
    eventRoot: Pick<EventTarget, 'addEventListener' | 'removeEventListener'>;
    state: { runtimeErrors?: RuntimeErrorState };
  };

  function describe(event?: RuntimeErrorEvent | null) {
    if (event && event.type === 'unhandledrejection') {
      const reason = event.reason;
      const text = reason instanceof Error ? reason.message : String(reason ?? '');
      return text || uiText('Unhandled promise rejection', '처리되지 않은 Promise 거부');
    }
    const text = event?.error instanceof Error ? event.error.message : String(event?.message ?? '');
    return text.replace(/^Uncaught (?:\w*Error: )?/, '') || uiText('Unknown error', '알 수 없는 오류');
  }

  function create(dependencies?: RuntimeErrorDependencies) {
    const deps: Partial<RuntimeErrorDependencies> = dependencies || {};
    const missing: string[] = REQUIRED_FUNCTIONS.filter(name => typeof deps[name] !== 'function');
    REQUIRED_VALUES.forEach(name => {
      if (deps[name] == null) missing.push(name);
    });
    if (deps.eventRoot && typeof deps.eventRoot.addEventListener !== 'function') {
      missing.push('eventRoot.addEventListener');
    }
    if (deps.state != null && typeof deps.state !== 'object') missing.push('state.object');
    if (missing.length) {
      throw new TypeError(`런타임 오류 표시 의존성이 없습니다: ${[...new Set(missing)].join(', ')}`);
    }

    const { flashStatus, now, renderStatus, eventRoot, state } = deps as RuntimeErrorDependencies;
    let attached = false;

    function report(event: RuntimeErrorEvent) {
      const message = describe(event).slice(0, MAX_MESSAGE_LENGTH);
      const at = now();
      const previous = state.runtimeErrors || { count: 0, last: '', at: 0 };
      const repeat = previous.last === message && at - previous.at < REPEAT_WINDOW_MS;
      state.runtimeErrors = { count: previous.count + 1, last: message, at };
      renderStatus();
      if (!repeat) {
        flashStatus(uiText('⚠ Editor error: {0} · Recent changes may be unsaved.', '⚠ 동작 중 오류: {0} · 최근 변경이 저장되지 않았을 수 있습니다', message));
      }
    }

    function attach() {
      if (attached) return;
      attached = true;
      eventRoot.addEventListener('error', report);
      eventRoot.addEventListener('unhandledrejection', report);
    }

    function detach() {
      if (!attached) return;
      attached = false;
      eventRoot.removeEventListener('error', report);
      eventRoot.removeEventListener('unhandledrejection', report);
    }

    return Object.freeze({ attach, detach, report });
  }

  return Object.freeze({ REQUIRED_FUNCTIONS, REQUIRED_VALUES, REPEAT_WINDOW_MS, describe, create });
}
