// @ts-nocheck
(function initModalFocusModule(root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root) root.UMLModalFocus = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function createModalFocusModule() {
  'use strict';

  const REQUIRED_VALUES = Object.freeze(['appRoot', 'document']);
  const FOCUSABLE_SELECTOR = [
    'a[href]',
    'button:not(:disabled)',
    'input:not(:disabled)',
    'select:not(:disabled)',
    'textarea:not(:disabled)',
    '[tabindex]:not([tabindex="-1"])',
  ].join(', ');

  function create(deps = {}) {
    REQUIRED_VALUES.forEach(name => {
      if (deps[name] == null) throw new TypeError(`UMLModalFocus requires ${name}`);
    });
    const { appRoot, document } = deps;
    if (typeof document.addEventListener !== 'function') {
      throw new TypeError('UMLModalFocus requires document.addEventListener()');
    }

    const entries = [];
    let attached = false;
    let previousAppInert = false;
    let titleSequence = 0;

    function topEntry() {
      return entries[entries.length - 1] || null;
    }

    function isUsable(node) {
      return Boolean(node)
        && !node.disabled
        && !node.hidden
        && node.getAttribute?.('aria-hidden') !== 'true'
        && node.tabIndex !== -1;
    }

    function focusableElements(dialog) {
      return [...dialog.querySelectorAll(FOCUSABLE_SELECTOR)].filter(isUsable);
    }

    function focusInside(entry, preferred) {
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

    function ensureAccessibleDialog(dialog) {
      dialog.setAttribute('role', 'dialog');
      dialog.setAttribute('aria-modal', 'true');
      if (dialog.getAttribute('aria-labelledby') || dialog.getAttribute('aria-label')) return;
      const title = dialog.querySelector('.project-dialog-header strong, strong');
      if (title) {
        if (!title.id) title.id = `uml-modal-title-${++titleSequence}`;
        dialog.setAttribute('aria-labelledby', title.id);
      } else {
        dialog.setAttribute('aria-label', '대화상자');
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

    function closeEntry(entry, options = {}) {
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

    function requestClose(entry, reason = 'programmatic') {
      if (!entries.includes(entry)) return false;
      if (typeof entry.requestCloseHandler === 'function') {
        entry.requestCloseHandler(reason, entry.handle);
        return true;
      }
      return closeEntry(entry);
    }

    function handleKeydown(event) {
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

    function handleFocusIn(event) {
      const entry = topEntry();
      if (entry && !entry.dialog.contains(event.target)) focusInside(entry, entry.initialFocus);
    }

    function activate(options = {}) {
      const { overlay, dialog } = options;
      if (!overlay || !dialog) throw new TypeError('UMLModalFocus.activate requires overlay and dialog');
      const existing = entries.find(entry => entry.overlay === overlay);
      if (existing) return existing.handle;
      if (!entries.length) previousAppInert = Boolean(appRoot.inert);
      ensureAccessibleDialog(dialog);
      const entry = {
        dialog,
        initialFocus: options.initialFocus || null,
        opener: options.opener || document.activeElement || null,
        overlay,
        requestCloseHandler: options.onRequestClose || null,
      };
      const handle = Object.freeze({
        close: closeOptions => closeEntry(entry, closeOptions),
        focusInitial: preferred => {
          if (preferred) entry.initialFocus = preferred;
          return focusInside(entry, entry.initialFocus);
        },
        requestClose: reason => requestClose(entry, reason),
        setRequestCloseHandler: handler => {
          if (handler != null && typeof handler !== 'function') {
            throw new TypeError('Modal close handler must be a function');
          }
          entry.requestCloseHandler = handler || null;
          return handle;
        },
      });
      entry.handle = handle;
      entries.push(entry);
      syncBackground();
      syncModalStack();
      attachListeners();
      focusInside(entry, entry.initialFocus);
      return handle;
    }

    function closeOverlay(overlay, options) {
      const entry = entries.find(candidate => candidate.overlay === overlay);
      if (entry) return closeEntry(entry, options);
      if (overlay?.isConnected !== false) overlay?.remove?.();
      return false;
    }

    function closeTop(options) {
      const entry = topEntry();
      return entry ? closeEntry(entry, options) : false;
    }

    function isActive(overlay) {
      return entries.some(entry => entry.overlay === overlay);
    }

    return Object.freeze({ activate, closeOverlay, closeTop, isActive, size: () => entries.length });
  }

  return Object.freeze({ FOCUSABLE_SELECTOR, REQUIRED_VALUES, create });
});
