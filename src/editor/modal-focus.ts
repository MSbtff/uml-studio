type ModalFocusApi = ReturnType<typeof createModalFocusModule>;
declare var UMLModalFocus: ModalFocusApi;

(function initModalFocusModule(root: typeof globalThis, factory: () => ModalFocusApi) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root) root.UMLModalFocus = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, createModalFocusModule);

function createModalFocusModule() {
  'use strict';
  const { text: uiText } = globalThis.UMLLanguage
    ?? require('./language.js') as typeof UMLLanguage;


  const REQUIRED_VALUES = Object.freeze(['appRoot', 'document'] as const);
  const FOCUSABLE_SELECTOR = [
    'a[href]',
    'button:not(:disabled)',
    'input:not(:disabled)',
    'select:not(:disabled)',
    'textarea:not(:disabled)',
    '[tabindex]:not([tabindex="-1"])',
  ].join(', ');

  interface FocusableElement extends HTMLElement {
    disabled?: boolean;
  }
  type FocusTarget = FocusableElement | (() => FocusableElement | null) | null;
  interface CloseOptions { remove?: boolean; restoreFocus?: boolean }
  type CloseHandler = (reason: string, handle: ModalHandle) => void;
  interface ModalHandle {
    close(options?: CloseOptions): boolean;
    focusInitial(preferred?: FocusTarget): boolean;
    requestClose(reason?: string): boolean;
    setRequestCloseHandler(handler?: CloseHandler | null): ModalHandle;
  }
  interface ModalOptions {
    overlay?: HTMLElement;
    dialog?: HTMLElement;
    initialFocus?: FocusTarget;
    opener?: Element | null;
    onRequestClose?: CloseHandler | null;
  }
  interface ModalEntry {
    overlay: HTMLElement;
    dialog: HTMLElement;
    initialFocus: FocusTarget;
    opener: (Element & { focus?: () => void }) | null;
    requestCloseHandler: CloseHandler | null;
    handle: ModalHandle;
  }
  interface ModalFocusDependencies { appRoot: HTMLElement; document: Document }

  function create(deps: Partial<ModalFocusDependencies> = {}) {
    REQUIRED_VALUES.forEach(name => {
      if (deps[name] == null) throw new TypeError(`UMLModalFocus requires ${name}`);
    });
    const { appRoot, document } = deps as ModalFocusDependencies;
    if (typeof document.addEventListener !== 'function') {
      throw new TypeError('UMLModalFocus requires document.addEventListener()');
    }

    const entries: ModalEntry[] = [];
    let attached = false;
    let previousAppInert = false;
    let titleSequence = 0;

    function topEntry() {
      return entries[entries.length - 1] || null;
    }

    function isUsable(node?: FocusableElement | null): node is FocusableElement {
      return !!node
        && !node.disabled
        && !node.hidden
        && node.getAttribute?.('aria-hidden') !== 'true'
        && node.tabIndex !== -1;
    }

    function focusableElements(dialog: HTMLElement) {
      return [...dialog.querySelectorAll<FocusableElement>(FOCUSABLE_SELECTOR)].filter(isUsable);
    }

    function focusInside(entry: ModalEntry | null, preferred?: FocusTarget) {
      if (!entry || entry !== topEntry()) return false;
      const requested = typeof preferred === 'function' ? preferred() : preferred;
      const focusable = focusableElements(entry.dialog);
      const target = isUsable(requested) && entry.dialog.contains(requested)
        ? requested
        : focusable[0] || entry.dialog;
      if (typeof target.focus !== 'function') return false;
      if (target === entry.dialog && !target.hasAttribute?.('tabindex')) target.tabIndex = -1;
      target.focus();
      return true;
    }

    function ensureAccessibleDialog(dialog: HTMLElement) {
      dialog.setAttribute('role', 'dialog');
      dialog.setAttribute('aria-modal', 'true');
      if (dialog.getAttribute('aria-labelledby') || dialog.getAttribute('aria-label')) return;
      const title = dialog.querySelector('.project-dialog-header strong, strong');
      if (title) {
        if (!title.id) title.id = `uml-modal-title-${++titleSequence}`;
        dialog.setAttribute('aria-labelledby', title.id);
      } else {
        dialog.setAttribute('aria-label', uiText('Dialog', '대화상자'));
      }
    }

    function syncBackground() {
      if (entries.length) {
        appRoot.inert = true;
      } else {
        appRoot.inert = previousAppInert;
      }
    }

    function syncModalStack() {
      entries.forEach((entry, index) => {
        const isTop = index === entries.length - 1;
        entry.overlay.inert = !isTop;
        entry.dialog.setAttribute('aria-modal', isTop ? 'true' : 'false');
        if (isTop) entry.overlay.removeAttribute?.('aria-hidden');
        else entry.overlay.setAttribute?.('aria-hidden', 'true');
      });
    }

    function attachListeners() {
      if (attached) return;
      attached = true;
      document.addEventListener('keydown', handleKeydown, true);
      document.addEventListener('focusin', handleFocusIn, true);
    }

    function detachListeners() {
      if (!attached) return;
      attached = false;
      document.removeEventListener('keydown', handleKeydown, true);
      document.removeEventListener('focusin', handleFocusIn, true);
    }

    function closeEntry(entry: ModalEntry, options: CloseOptions = {}) {
      const index = entries.indexOf(entry);
      if (index < 0) return false;
      const wasTop = index === entries.length - 1;
      entries.splice(index, 1);
      if (options.remove !== false && entry.overlay?.isConnected !== false) entry.overlay.remove?.();
      if (!entries.length) detachListeners();
      syncBackground();
      syncModalStack();
      if (!wasTop || options.restoreFocus === false) return true;
      const next = topEntry();
      if (next) {
        if (entry.opener && next.dialog.contains(entry.opener) && entry.opener.isConnected !== false) {
          entry.opener.focus?.();
        } else {
          focusInside(next, next.initialFocus);
        }
      } else if (entry.opener?.isConnected !== false) {
        entry.opener?.focus?.();
      }
      return true;
    }

    function requestClose(entry: ModalEntry, reason = 'programmatic') {
      if (!entries.includes(entry)) return false;
      if (typeof entry.requestCloseHandler === 'function') {
        entry.requestCloseHandler(reason, entry.handle);
        return true;
      }
      return closeEntry(entry);
    }

    function handleKeydown(event: KeyboardEvent) {
      const entry = topEntry();
      if (!entry) return;
      if (event.key === 'Escape') {
        event.preventDefault();
        event.stopPropagation?.();
        requestClose(entry, 'escape');
        return;
      }
      if (event.key !== 'Tab') return;
      const focusable = focusableElements(entry.dialog);
      if (!focusable.length) {
        event.preventDefault();
        focusInside(entry);
        return;
      }
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (event.shiftKey && (document.activeElement === first || !entry.dialog.contains(document.activeElement))) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && (document.activeElement === last || !entry.dialog.contains(document.activeElement))) {
        event.preventDefault();
        first.focus();
      }
    }

    function handleFocusIn(event: FocusEvent) {
      const entry = topEntry();
      if (entry && !entry.dialog.contains(event.target as Node | null)) focusInside(entry, entry.initialFocus);
    }

    function activate(options: ModalOptions = {}) {
      const { overlay, dialog } = options;
      if (!overlay || !dialog) throw new TypeError('UMLModalFocus.activate requires overlay and dialog');
      const existing = entries.find(entry => entry.overlay === overlay);
      if (existing) return existing.handle;
      if (!entries.length) previousAppInert = Boolean(appRoot.inert);
      ensureAccessibleDialog(dialog);
      const handle = Object.freeze({
        close: (closeOptions?: CloseOptions) => closeEntry(entry, closeOptions),
        focusInitial: (preferred?: FocusTarget) => {
          if (preferred) entry.initialFocus = preferred;
          return focusInside(entry, entry.initialFocus);
        },
        requestClose: (reason?: string) => requestClose(entry, reason),
        setRequestCloseHandler: (handler?: CloseHandler | null): ModalHandle => {
          if (handler != null && typeof handler !== 'function') {
            throw new TypeError('Modal close handler must be a function');
          }
          entry.requestCloseHandler = handler || null;
          return handle;
        },
      });
      const entry: ModalEntry = {
        dialog,
        initialFocus: options.initialFocus || null,
        opener: options.opener || document.activeElement || null,
        overlay,
        requestCloseHandler: options.onRequestClose || null,
        handle,
      };
      entries.push(entry);
      syncBackground();
      syncModalStack();
      attachListeners();
      focusInside(entry, entry.initialFocus);
      return handle;
    }

    function closeOverlay(overlay?: HTMLElement | null, options?: CloseOptions) {
      const entry = entries.find(candidate => candidate.overlay === overlay);
      if (entry) return closeEntry(entry, options);
      if (overlay?.isConnected !== false) overlay?.remove?.();
      return false;
    }

    function closeTop(options?: CloseOptions) {
      const entry = topEntry();
      return entry ? closeEntry(entry, options) : false;
    }

    function isActive(overlay: HTMLElement) {
      return entries.some(entry => entry.overlay === overlay);
    }

    return Object.freeze({ activate, closeOverlay, closeTop, isActive, size: () => entries.length });
  }

  return Object.freeze({ FOCUSABLE_SELECTOR, REQUIRED_VALUES, create });
}
