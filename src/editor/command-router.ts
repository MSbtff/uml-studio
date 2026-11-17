// @ts-nocheck
(function initCommandRouterModule(root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root) root.UMLCommandRouter = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function createCommandRouterModule() {
  'use strict';

  const REQUIRED_FUNCTIONS = Object.freeze([
    'cancelInteraction', 'canBringFront', 'canRedo', 'canSendBack', 'canUndo', 'closeTabMenu',
    'closeTopModal',
    'hasClipboard', 'hasElementSelection', 'hasSelection', 'isMinimapVisible',
    'isValidationVisible', 'moveSelection', 'openSelectedMemberQuickEdit',
    'openSelectedQuickEdit', 'selectAll',
  ]);
  const REQUIRED_VALUES = Object.freeze(['commands', 'document', 'eventRoot', 'MutationObserver', 'toolbar']);

  function create(deps = {}) {
    REQUIRED_FUNCTIONS.forEach(name => {
      if (typeof deps[name] !== 'function') throw new Error(`UMLCommandRouter requires ${name}()`);
    });
    REQUIRED_VALUES.forEach(name => {
      if (deps[name] == null) throw new Error(`UMLCommandRouter requires ${name}`);
    });

    const {
      cancelInteraction, canBringFront, canRedo, canSendBack, canUndo, closeTabMenu,
      closeTopModal,
      hasClipboard, hasElementSelection, hasSelection, isMinimapVisible,
      isValidationVisible, moveSelection, openSelectedMemberQuickEdit,
      openSelectedQuickEdit, selectAll,
      commands, document, eventRoot, MutationObserver, toolbar,
    } = deps;
    const triggerBindings = [];
    const menuTriggers = [];
    let toolbarKey = null;
    let toolbarFocused = null;
    let toolbarObserver = null;
    let menuItems = [];
    let menuPopup = null;
    let openTrigger = null;
    let attached = false;

    const menuDefinitions = Object.freeze({
      file: [
        { label: 'New Project', cmd: 'new', shortcut: 'Ctrl+N' },
        { label: 'Open…', cmd: 'open', shortcut: 'Ctrl+O' },
        { label: 'Import DDL…', cmd: 'importddl' },
        { label: 'Import draw.io…', cmd: 'importdrawio' },
        { label: 'Save', cmd: 'save', shortcut: 'Ctrl+S' },
        { sep: true },
        { label: 'Project Manager…', cmd: 'projects' },
        { label: 'Recovery History…', cmd: 'recovery' },
        { sep: true },
        { label: 'Export SVG', cmd: 'exportsvg' },
        { label: 'Export PNG', cmd: 'exportpng' },
        { label: 'Export All PNG', cmd: 'exportall' },
        { sep: true },
        { label: 'Export Mermaid (.mmd)', cmd: 'exportmermaid' },
        { label: 'Export draw.io (.drawio)', cmd: 'exportdrawio' },
        { label: 'Export ERD DDL (.sql)…', cmd: 'exportddl' },
      ],
      edit: [
        { label: 'Undo', cmd: 'undo', shortcut: 'Ctrl+Z', enabled: canUndo },
        { label: 'Redo', cmd: 'redo', shortcut: 'Ctrl+Y', enabled: canRedo },
        { sep: true },
        { label: 'Select All', cmd: 'selectall', shortcut: 'Ctrl+A' },
        { label: 'Cut', cmd: 'cut', shortcut: 'Ctrl+X', enabled: hasElementSelection },
        { label: 'Copy', cmd: 'copy', shortcut: 'Ctrl+C', enabled: hasElementSelection },
        { label: 'Paste', cmd: 'paste', shortcut: 'Ctrl+V', enabled: hasClipboard },
        { label: 'Duplicate View', cmd: 'duplicate', shortcut: 'Ctrl+D', enabled: hasElementSelection },
        { sep: true },
        { label: 'Delete View', cmd: 'delete', shortcut: 'Del', enabled: hasSelection },
        { label: 'Delete From Model', cmd: 'deletemodel', shortcut: 'Ctrl+Del', enabled: hasSelection },
      ],
      format: [
        { label: 'Auto Size', cmd: 'autoresize', enabled: hasElementSelection },
        { sep: true },
        { label: 'Bring to Front', cmd: 'bringfront', enabled: canBringFront },
        { label: 'Send to Back', cmd: 'sendback', enabled: canSendBack },
      ],
      model: [
        { label: 'Project Models…', cmd: 'models' },
        { label: 'Find in Explorer', cmd: 'explorerfocus', shortcut: 'Ctrl+F' },
        { sep: true },
        { label: 'Validate Project', cmd: 'validate', shortcut: 'F9' },
      ],
      tools: [
        { label: 'Export Current as SVG', cmd: 'exportsvg' },
        { label: 'Export Current as PNG', cmd: 'exportpng' },
        { label: 'Export All as PNG', cmd: 'exportall' },
        { sep: true },
        { label: 'Export Current as Mermaid', cmd: 'exportmermaid' },
        { label: 'Export Current as draw.io', cmd: 'exportdrawio' },
        { label: 'Export ERD DDL', cmd: 'exportddl' },
        { label: 'Import DDL into Project', cmd: 'importddl' },
        { label: 'Import draw.io into Project', cmd: 'importdrawio' },
      ],
      view: [
        { label: 'Zoom In', cmd: 'zoomin', shortcut: 'Ctrl++' },
        { label: 'Zoom Out', cmd: 'zoomout', shortcut: 'Ctrl+-' },
        { label: 'Actual Size', cmd: 'zoomreset', shortcut: 'Ctrl+0' },
        { label: 'Fit to Window', cmd: 'fit', shortcut: 'Ctrl+9' },
        { sep: true },
        { label: 'Minimap', cmd: 'minimap', shortcut: 'Ctrl+Alt+M', checked: isMinimapVisible },
        { label: 'Validation Results', cmd: 'validationpanel', checked: isValidationVisible },
      ],
      help: [{ label: 'About UML Studio', cmd: 'about' }],
    });
    Object.values(menuDefinitions).forEach(definitions => {
      definitions.forEach(Object.freeze);
      Object.freeze(definitions);
    });
    const missingCommands = [...new Set(Object.values(menuDefinitions)
      .flat()
      .map(definition => definition.cmd)
      .filter(commandName => commandName && typeof commands[commandName] !== 'function'))];
    if (missingCommands.length) {
      throw new Error(`UMLCommandRouter missing commands: ${missingCommands.join(', ')}`);
    }

    function run(commandName) {
      const command = commands[commandName];
      if (typeof command !== 'function') return false;
      command();
      return true;
    }

    function focusNode(node) {
      if (!node || typeof node.focus !== 'function') return false;
      node.focus();
      return true;
    }

    /* the menubar triggers, falling back to the DOM before attach() has run */
    function triggerList() {
      return menuTriggers.length ? menuTriggers : [...document.querySelectorAll('#menubar .menu')];
    }

    function wrapIndex(index, length) {
      return ((index % length) + length) % length;
    }

    function prepareTrigger(trigger, index) {
      trigger.setAttribute('role', 'menuitem');
      trigger.setAttribute('aria-haspopup', 'true');
      trigger.setAttribute('aria-expanded', 'false');
      if (!trigger.id) trigger.id = `menubar-trigger-${trigger.dataset.menu}`;
      trigger.tabIndex = index === 0 ? 0 : -1;
    }

    /* roving tabindex: the menubar is a single tab stop */
    function setTabStop(activeTrigger) {
      triggerList().forEach(trigger => { trigger.tabIndex = trigger === activeTrigger ? 0 : -1; });
    }

    function focusTriggerAt(index) {
      const triggers = triggerList();
      if (!triggers.length) return null;
      const target = triggers[wrapIndex(index, triggers.length)];
      setTabStop(target);
      focusNode(target);
      return target;
    }

    /* W3C APG keeps unavailable menu items focusable so they stay discoverable */
    function isItemDisabled(item) {
      return item.getAttribute?.('aria-disabled') === 'true' || item.attributes?.['aria-disabled'] === 'true';
    }

    function focusItemAt(index) {
      if (!menuItems.length) return false;
      return focusNode(menuItems[wrapIndex(index, menuItems.length)]);
    }

    function focusMatchingItem(character) {
      if (!menuItems.length) return false;
      const needle = character.toLowerCase();
      const start = menuItems.indexOf(document.activeElement) + 1;
      for (let step = 0; step < menuItems.length; step += 1) {
        const item = menuItems[wrapIndex(start + step, menuItems.length)];
        if ((item.dataset.label || '').toLowerCase().startsWith(needle)) return focusNode(item);
      }
      return false;
    }

    function menuHoldsFocus() {
      const active = document.activeElement;
      if (!active || !menuPopup) return false;
      return active === openTrigger || menuPopup.contains?.(active) === true;
    }

    function closeMenu(options = {}) {
      const hadMenu = !!menuPopup;
      const lastTrigger = openTrigger;
      const restoreFocus = options.restoreFocus === 'auto'
        ? menuHoldsFocus()
        : options.restoreFocus === true;
      if (menuPopup) menuPopup.remove();
      menuPopup = null;
      menuItems = [];
      openTrigger = null;
      document.querySelectorAll('#menubar .menu').forEach(node => {
        node.classList.remove('menu-open');
        node.setAttribute('aria-expanded', 'false');
        node.removeAttribute?.('aria-controls');
      });
      if (hadMenu && restoreFocus && lastTrigger) {
        setTabStop(lastTrigger);
        focusNode(lastTrigger);
      }
      return hadMenu;
    }

    /* ArrowLeft/ArrowRight inside an open menu walks the menubar, as W3C APG requires */
    function moveToAdjacentMenu(step) {
      const triggers = triggerList();
      const index = triggers.indexOf(openTrigger);
      if (index < 0 || triggers.length < 2) return false;
      const next = triggers[wrapIndex(index + step, triggers.length)];
      setTabStop(next);
      openMenu(next, { focus: 'first' });
      return true;
    }

    function handleMenuKeydown(event) {
      const index = menuItems.indexOf(document.activeElement);
      const consume = () => { event.preventDefault(); event.stopPropagation?.(); };
      switch (event.key) {
        case 'ArrowDown': consume(); focusItemAt(index + 1); return;
        case 'ArrowUp': consume(); focusItemAt(index < 0 ? menuItems.length - 1 : index - 1); return;
        case 'Home': consume(); focusItemAt(0); return;
        case 'End': consume(); focusItemAt(menuItems.length - 1); return;
        case 'ArrowRight': consume(); moveToAdjacentMenu(1); return;
        case 'ArrowLeft': consume(); moveToAdjacentMenu(-1); return;
        case 'Escape': consume(); closeMenu({ restoreFocus: true }); return;
        case 'Tab': event.stopPropagation?.(); closeMenu({ restoreFocus: true }); return;
        /* let the button fire its own click, but keep app shortcuts out of it */
        case 'Enter': case ' ': event.stopPropagation?.(); return;
        default: break;
      }
      if (event.key.length === 1 && !event.ctrlKey && !event.metaKey && !event.altKey
        && focusMatchingItem(event.key)) consume();
    }

    function createMenuItem(definition) {
      const item = document.createElement('button');
      item.className = 'app-menu-item';
      item.type = 'button';
      item.tabIndex = -1;
      item.dataset.label = definition.label;
      const checkedState = definition.checked ? !!definition.checked() : null;
      item.setAttribute('role', checkedState === null ? 'menuitem' : 'menuitemcheckbox');
      if (checkedState !== null) item.setAttribute('aria-checked', String(checkedState));
      if (definition.enabled && !definition.enabled()) item.setAttribute('aria-disabled', 'true');
      const check = document.createElement('span');
      check.className = 'menu-check';
      check.setAttribute('aria-hidden', 'true');
      check.textContent = checkedState ? '✓' : '';
      const label = document.createElement('span');
      label.className = 'menu-label';
      label.textContent = definition.label;
      const shortcut = document.createElement('span');
      shortcut.className = 'menu-shortcut';
      shortcut.textContent = definition.shortcut || '';
      item.append(check, label, shortcut);
      item.addEventListener('click', (event = {}) => {
        if (isItemDisabled(item)) return;
        /* a keyboard-fired click has detail 0; only then does focus belong on the menubar */
        closeMenu({ restoreFocus: !event.detail });
        run(definition.cmd);
      });
      return item;
    }

    function openMenu(trigger, options = {}) {
      const menuId = trigger.dataset.menu;
      const wasSame = menuPopup && menuPopup.dataset.menu === menuId;
      closeMenu();
      if (wasSame) return false;
      const popup = document.createElement('div');
      popup.className = 'app-menu-popup';
      popup.dataset.menu = menuId;
      popup.id = `app-menu-${menuId}`;
      popup.setAttribute('role', 'menu');
      if (trigger.id) popup.setAttribute('aria-labelledby', trigger.id);
      const items = [];
      (menuDefinitions[menuId] || []).forEach(definition => {
        if (definition.sep) {
          const separator = document.createElement('div');
          separator.className = 'app-menu-sep';
          separator.setAttribute('role', 'separator');
          popup.appendChild(separator);
          return;
        }
        const item = createMenuItem(definition);
        popup.appendChild(item);
        items.push(item);
      });
      popup.addEventListener('keydown', handleMenuKeydown);
      const rect = trigger.getBoundingClientRect();
      popup.style.left = `${rect.left}px`;
      popup.style.top = `${rect.bottom + 2}px`;
      document.body.appendChild(popup);
      trigger.classList.add('menu-open');
      trigger.setAttribute('aria-expanded', 'true');
      trigger.setAttribute('aria-controls', popup.id);
      menuPopup = popup;
      menuItems = items;
      openTrigger = trigger;
      if (options.focus === 'first') focusItemAt(0);
      else if (options.focus === 'last') focusItemAt(-1);
      return true;
    }

    function handleKeydown(event) {
      if (event.key === 'F9') {
        event.preventDefault();
        run('validate');
        return;
      }
      if (event.target?.matches?.('input, textarea, select')) return;
      const mod = event.metaKey || event.ctrlKey;
      if (event.key === 'Enter' && mod && !event.altKey && openSelectedMemberQuickEdit(event.shiftKey)) {
        event.preventDefault();
        return;
      }
      if (event.key === 'Enter' && !event.ctrlKey && !event.metaKey && !event.altKey && openSelectedQuickEdit()) {
        event.preventDefault();
        return;
      }
      const key = event.key.toLowerCase();
      const shortcutCommands = {
        n: 'new', o: 'open', s: 'save', f: 'explorerfocus',
        '9': 'fit', '0': 'zoomreset', c: 'copy', x: 'cut', v: 'paste', d: 'duplicate',
      };
      if (mod && event.altKey && key === 'm') {
        event.preventDefault();
        run('minimap');
        return;
      }
      if (mod && (event.key === '+' || event.key === '=')) {
        event.preventDefault();
        run('zoomin');
        return;
      }
      if (mod && event.key === '-') {
        event.preventDefault();
        run('zoomout');
        return;
      }
      if (mod && key === 'z') {
        event.preventDefault();
        run(event.shiftKey ? 'redo' : 'undo');
        return;
      }
      if (mod && key === 'y') {
        event.preventDefault();
        run('redo');
        return;
      }
      if (mod && (event.key === 'Delete' || event.key === 'Backspace')) {
        event.preventDefault();
        run('deletemodel');
        return;
      }
      if (mod && key === 'a') {
        event.preventDefault();
        selectAll();
        return;
      }
      if (mod && shortcutCommands[key]) {
        event.preventDefault();
        run(shortcutCommands[key]);
        return;
      }
      if (['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'].includes(event.key)
        && moveSelection(event.key, event.shiftKey)) {
        event.preventDefault();
        return;
      }
      if (event.key === 'Delete' || event.key === 'Backspace') {
        event.preventDefault();
        run('delete');
        return;
      }
      if (event.key === 'Escape') {
        if (closeMenu({ restoreFocus: 'auto' })) return;
        if (closeTopModal()) return;
        if (closeTabMenu()) return;
        cancelInteraction();
      }
    }

    function handleDocumentMouseDown(event) {
      if (menuPopup && !menuPopup.contains(event.target) && !event.target.closest?.('#menubar .menu')) closeMenu();
    }

    /* ── Toolbar: one tab stop, arrow keys inside ─────────────── */

    /* #erdmode and #seqopts are rebuilt on every canvas render, so the button
       list is queried live rather than cached */
    function toolbarButtons() {
      return [...toolbar.querySelectorAll('button:not([disabled])')]
        .filter(button => button.offsetParent === undefined || button.offsetParent !== null);
    }

    function toolbarButtonKey(button) {
      return button.dataset?.cmd ? `cmd:${button.dataset.cmd}` : `label:${button.textContent}`;
    }

    function syncToolbarTabStops(preferred) {
      const buttons = toolbarButtons();
      if (!buttons.length) return null;
      let chosen = buttons.includes(preferred) ? preferred : null;
      if (!chosen && toolbarKey) chosen = buttons.find(button => toolbarButtonKey(button) === toolbarKey);
      if (!chosen) [chosen] = buttons;
      buttons.forEach(button => { button.tabIndex = button === chosen ? 0 : -1; });
      toolbarKey = toolbarButtonKey(chosen);
      return chosen;
    }

    function focusToolbarAt(index) {
      const buttons = toolbarButtons();
      if (!buttons.length) return false;
      const target = buttons[wrapIndex(index, buttons.length)];
      syncToolbarTabStops(target);
      toolbarFocused = target;
      return focusNode(target);
    }

    function handleToolbarKeydown(event) {
      const button = event.target?.closest?.('button');
      if (!button) return;
      const index = toolbarButtons().indexOf(button);
      if (index < 0) return;
      const consume = () => { event.preventDefault(); event.stopPropagation(); };
      switch (event.key) {
        case 'ArrowRight': consume(); focusToolbarAt(index + 1); return;
        case 'ArrowLeft': consume(); focusToolbarAt(index - 1); return;
        case 'Home': consume(); focusToolbarAt(0); return;
        case 'End': consume(); focusToolbarAt(toolbarButtons().length - 1); return;
        /* the canvas answers these same keys — keep them out of the diagram */
        case 'ArrowUp': case 'ArrowDown': case 'Enter': case ' ':
          event.stopPropagation();
          return;
        default:
          break;
      }
    }

    function handleToolbarFocusIn(event) {
      const button = event.target?.closest?.('button');
      if (!button || toolbar.contains?.(button) === false) return;
      toolbarFocused = button;
      syncToolbarTabStops(button);
    }

    /* replacing a holder's innerHTML drops the focused button on the floor */
    function handleToolbarMutations() {
      const active = document.activeElement;
      const lostFocus = Boolean(toolbarFocused)
        && toolbarFocused.isConnected === false
        && (!active || active === document.body);
      const chosen = syncToolbarTabStops(lostFocus ? null : active);
      if (!lostFocus || !chosen) return;
      toolbarFocused = chosen;
      focusNode(chosen);
    }

    function handleToolbarClick(event) {
      const button = event.target.closest?.('button');
      if (button?.dataset.cmd) run(button.dataset.cmd);
    }

    function handleTriggerKeydown(event, trigger) {
      const consume = () => { event.preventDefault(); event.stopPropagation?.(); };
      const position = triggerList().indexOf(trigger);
      switch (event.key) {
        case 'ArrowRight':
        case 'ArrowLeft': {
          consume();
          const wasOpen = !!menuPopup;
          const next = focusTriggerAt(position + (event.key === 'ArrowRight' ? 1 : -1));
          if (wasOpen && next && next !== trigger) openMenu(next, { focus: 'first' });
          return;
        }
        case 'Home': consume(); focusTriggerAt(0); return;
        case 'End': consume(); focusTriggerAt(triggerList().length - 1); return;
        case 'ArrowDown':
        case 'Enter':
        case ' ':
          consume();
          openMenu(trigger, { focus: 'first' });
          return;
        case 'ArrowUp':
          consume();
          openMenu(trigger, { focus: 'last' });
          return;
        case 'Escape':
          if (menuPopup) { consume(); closeMenu({ restoreFocus: true }); }
          return;
        default:
          break;
      }
    }

    function attachTrigger(trigger, index) {
      prepareTrigger(trigger, index);
      const click = event => {
        event.stopPropagation();
        setTabStop(trigger);
        openMenu(trigger);
      };
      const mouseenter = () => {
        if (menuPopup && menuPopup.dataset.menu !== trigger.dataset.menu) openMenu(trigger);
      };
      const keydown = event => handleTriggerKeydown(event, trigger);
      trigger.addEventListener('click', click);
      trigger.addEventListener('mouseenter', mouseenter);
      trigger.addEventListener('keydown', keydown);
      triggerBindings.push({ trigger, click, mouseenter, keydown });
    }

    function attach() {
      if (attached) return;
      attached = true;
      menuTriggers.push(...document.querySelectorAll('#menubar .menu'));
      menuTriggers.forEach(attachTrigger);
      document.addEventListener('mousedown', handleDocumentMouseDown);
      toolbar.addEventListener('click', handleToolbarClick);
      toolbar.addEventListener('keydown', handleToolbarKeydown);
      toolbar.addEventListener('focusin', handleToolbarFocusIn);
      eventRoot.addEventListener('keydown', handleKeydown);
      syncToolbarTabStops();
      toolbarObserver = new MutationObserver(handleToolbarMutations);
      toolbarObserver.observe(toolbar, { childList: true, subtree: true });
    }

    function detach() {
      if (!attached) return;
      attached = false;
      closeMenu();
      triggerBindings.splice(0).forEach(({ trigger, click, mouseenter, keydown }) => {
        trigger.removeEventListener('click', click);
        trigger.removeEventListener('mouseenter', mouseenter);
        trigger.removeEventListener('keydown', keydown);
      });
      menuTriggers.length = 0;
      toolbarObserver?.disconnect();
      toolbarObserver = null;
      toolbarFocused = null;
      document.removeEventListener('mousedown', handleDocumentMouseDown);
      toolbar.removeEventListener('click', handleToolbarClick);
      toolbar.removeEventListener('keydown', handleToolbarKeydown);
      toolbar.removeEventListener('focusin', handleToolbarFocusIn);
      eventRoot.removeEventListener('keydown', handleKeydown);
    }

    return Object.freeze({ attach, closeMenu, detach, menuDefinitions, openMenu, run });
  }

  return Object.freeze({ REQUIRED_FUNCTIONS, REQUIRED_VALUES, create });
});
