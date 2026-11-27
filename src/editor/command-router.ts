type CommandRouterApi = ReturnType<typeof createCommandRouterModule>;
declare var UMLCommandRouter: CommandRouterApi;

(function initCommandRouterModule(root: typeof globalThis & { UMLCommandRouter?: CommandRouterApi }, factory: () => CommandRouterApi) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root) root.UMLCommandRouter = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, createCommandRouterModule);

function createCommandRouterModule() {
  'use strict';

  const { label: uiLabel } = globalThis.UMLLanguage
    ?? require('./language.js') as typeof UMLLanguage;

  const REQUIRED_FUNCTIONS = Object.freeze([
    'cancelInteraction', 'canBringFront', 'canRedo', 'canSendBack', 'canUndo', 'closeTabMenu',
    'closeTopModal',
    'hasClipboard', 'hasElementSelection', 'hasSelection', 'isMinimapVisible',
    'isValidationVisible', 'moveSelection', 'openSelectedMemberQuickEdit',
    'openSelectedQuickEdit', 'selectAll',
  ] as const);
  const REQUIRED_VALUES = Object.freeze(['commands', 'document', 'eventRoot', 'MutationObserver', 'toolbar'] as const);

  type MenuItem = {
    label: string;
    cmd: string;
    shortcut?: string;
    enabled?: () => boolean;
    checked?: () => boolean;
    sep?: false;
  };
  type MenuEntry = MenuItem | { sep: true; cmd?: never };
  type TriggerBinding = {
    trigger: HTMLElement;
    click: (event: MouseEvent) => void;
    mouseenter: () => void;
    keydown: (event: KeyboardEvent) => void;
  };

  interface CommandRouterDependencies {
    cancelInteraction: () => void;
    canBringFront: () => boolean;
    canRedo: () => boolean;
    canSendBack: () => boolean;
    canUndo: () => boolean;
    closeTabMenu: () => boolean;
    closeTopModal: () => boolean;
    hasClipboard: () => boolean;
    hasElementSelection: () => boolean;
    hasSelection: () => boolean;
    isMinimapVisible: () => boolean;
    isValidationVisible: () => boolean;
    moveSelection: (key: string, coarse: boolean) => boolean;
    openSelectedMemberQuickEdit: (backward: boolean) => boolean;
    openSelectedQuickEdit: () => boolean;
    selectAll: () => void;
    commands: Readonly<Partial<Record<string, () => unknown>>>;
    document: Document;
    eventRoot: Window;
    MutationObserver: typeof MutationObserver;
    toolbar: HTMLElement;
  }

  function create(deps: Partial<CommandRouterDependencies> = {}) {
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
    } = deps as CommandRouterDependencies;
    const triggerBindings: TriggerBinding[] = [];
    const menuTriggers: HTMLElement[] = [];
    let toolbarKey: string | null = null;
    let toolbarFocused: HTMLButtonElement | null = null;
    let toolbarObserver: MutationObserver | null = null;
    let menuItems: HTMLButtonElement[] = [];
    let menuPopup: HTMLDivElement | null = null;
    let openTrigger: HTMLElement | null = null;
    let attached = false;

    const menuDefinitions: Readonly<Partial<Record<string, readonly MenuEntry[]>>> = Object.freeze({
      file: [
        { label: uiLabel('New Project', '새 프로젝트'), cmd: 'new', shortcut: 'Ctrl+N' },
        { label: uiLabel('Open…', '열기…'), cmd: 'open', shortcut: 'Ctrl+O' },
        { label: uiLabel('Import DDL…', 'DDL 가져오기…'), cmd: 'importddl' },
        { label: uiLabel('Import draw.io…', 'draw.io 가져오기…'), cmd: 'importdrawio' },
        { label: uiLabel('Save', '저장'), cmd: 'save', shortcut: 'Ctrl+S' },
        { sep: true },
        { label: uiLabel('Project Manager…', '프로젝트 관리…'), cmd: 'projects' },
        { label: uiLabel('Recovery History…', '복구 이력…'), cmd: 'recovery' },
        { sep: true },
        { label: uiLabel('Export SVG', 'SVG 내보내기'), cmd: 'exportsvg' },
        { label: uiLabel('Export PNG', 'PNG 내보내기'), cmd: 'exportpng' },
        { label: uiLabel('Export All PNG', '모든 PNG 내보내기'), cmd: 'exportall' },
        { sep: true },
        { label: uiLabel('Export Mermaid (.mmd)', 'Mermaid (.mmd) 내보내기'), cmd: 'exportmermaid' },
        { label: uiLabel('Export draw.io (.drawio)', 'draw.io (.drawio) 내보내기'), cmd: 'exportdrawio' },
        { label: uiLabel('Export ERD DDL (.sql)…', 'ERD DDL (.sql) 내보내기…'), cmd: 'exportddl' },
      ],
      edit: [
        { label: uiLabel('Undo', '실행 취소'), cmd: 'undo', shortcut: 'Ctrl+Z', enabled: canUndo },
        { label: uiLabel('Redo', '다시 실행'), cmd: 'redo', shortcut: 'Ctrl+Y', enabled: canRedo },
        { sep: true },
        { label: uiLabel('Select All', '모두 선택'), cmd: 'selectall', shortcut: 'Ctrl+A' },
        { label: uiLabel('Cut', '잘라내기'), cmd: 'cut', shortcut: 'Ctrl+X', enabled: hasElementSelection },
        { label: uiLabel('Copy', '복사'), cmd: 'copy', shortcut: 'Ctrl+C', enabled: hasElementSelection },
        { label: uiLabel('Paste', '붙여넣기'), cmd: 'paste', shortcut: 'Ctrl+V', enabled: hasClipboard },
        { label: uiLabel('Duplicate View', '뷰 복제'), cmd: 'duplicate', shortcut: 'Ctrl+D', enabled: hasElementSelection },
        { sep: true },
        { label: uiLabel('Delete View', '뷰 삭제'), cmd: 'delete', shortcut: 'Del', enabled: hasSelection },
        { label: uiLabel('Delete From Model', '모델에서 삭제'), cmd: 'deletemodel', shortcut: 'Ctrl+Del', enabled: hasSelection },
      ],
      format: [
        { label: uiLabel('Auto Size', '자동 크기'), cmd: 'autoresize', enabled: hasElementSelection },
        { sep: true },
        { label: uiLabel('Bring to Front', '맨 앞으로'), cmd: 'bringfront', enabled: canBringFront },
        { label: uiLabel('Send to Back', '맨 뒤로'), cmd: 'sendback', enabled: canSendBack },
      ],
      model: [
        { label: uiLabel('Project Models…', '프로젝트 모델…'), cmd: 'models' },
        { label: uiLabel('Find in Explorer', '탐색기에서 찾기'), cmd: 'explorerfocus', shortcut: 'Ctrl+F' },
        { sep: true },
        { label: uiLabel('Validate Project', '프로젝트 검증'), cmd: 'validate', shortcut: 'F9' },
      ],
      tools: [
        { label: uiLabel('Export Current as SVG', '현재 다이어그램을 SVG로 내보내기'), cmd: 'exportsvg' },
        { label: uiLabel('Export Current as PNG', '현재 다이어그램을 PNG로 내보내기'), cmd: 'exportpng' },
        { label: uiLabel('Export All as PNG', '모두 PNG로 내보내기'), cmd: 'exportall' },
        { sep: true },
        { label: uiLabel('Export Current as Mermaid', '현재 다이어그램을 Mermaid로 내보내기'), cmd: 'exportmermaid' },
        { label: uiLabel('Export Current as draw.io', '현재 다이어그램을 draw.io로 내보내기'), cmd: 'exportdrawio' },
        { label: uiLabel('Export ERD DDL', 'ERD DDL 내보내기'), cmd: 'exportddl' },
        { label: uiLabel('Import DDL into Project', '프로젝트에 DDL 가져오기'), cmd: 'importddl' },
        { label: uiLabel('Import draw.io into Project', '프로젝트에 draw.io 가져오기'), cmd: 'importdrawio' },
      ],
      view: [
        { label: uiLabel('Zoom In', '확대'), cmd: 'zoomin', shortcut: 'Ctrl++' },
        { label: uiLabel('Zoom Out', '축소'), cmd: 'zoomout', shortcut: 'Ctrl+-' },
        { label: uiLabel('Actual Size', '원래 크기'), cmd: 'zoomreset', shortcut: 'Ctrl+0' },
        { label: uiLabel('Fit to Window', '화면 맞춤'), cmd: 'fit', shortcut: 'Ctrl+9' },
        { sep: true },
        { label: uiLabel('Minimap', '미니맵'), cmd: 'minimap', shortcut: 'Ctrl+Alt+M', checked: isMinimapVisible },
        { label: uiLabel('Validation Results', '검증 결과'), cmd: 'validationpanel', checked: isValidationVisible },
      ],
      help: [{ label: uiLabel('About UML Studio', 'UML Studio 정보'), cmd: 'about' }],
    });
    Object.values(menuDefinitions).forEach(definitions => {
      definitions?.forEach(Object.freeze);
      Object.freeze(definitions);
    });
    const missingCommands = [...new Set(Object.values(menuDefinitions)
      .flat()
      .map(definition => definition?.cmd)
      .filter(commandName => commandName && typeof commands[commandName] !== 'function'))];
    if (missingCommands.length) {
      throw new Error(`UMLCommandRouter missing commands: ${missingCommands.join(', ')}`);
    }

    function run(commandName: string) {
      const command = commands[commandName];
      if (typeof command !== 'function') return false;
      command();
      return true;
    }

    function focusNode(node?: HTMLElement | null) {
      if (!node || typeof node.focus !== 'function') return false;
      node.focus();
      return true;
    }

    function triggerList() {
      return menuTriggers.length ? menuTriggers : [...document.querySelectorAll<HTMLElement>('#menubar .menu')];
    }

    function wrapIndex(index: number, length: number) {
      return ((index % length) + length) % length;
    }

    function prepareTrigger(trigger: HTMLElement, index: number) {
      trigger.setAttribute('role', 'menuitem');
      trigger.setAttribute('aria-haspopup', 'true');
      trigger.setAttribute('aria-expanded', 'false');
      if (!trigger.id) trigger.id = `menubar-trigger-${trigger.dataset.menu}`;
      trigger.tabIndex = index === 0 ? 0 : -1;
    }

    function setTabStop(activeTrigger: HTMLElement) {
      triggerList().forEach(trigger => { trigger.tabIndex = trigger === activeTrigger ? 0 : -1; });
    }

    function focusTriggerAt(index: number) {
      const triggers = triggerList();
      if (!triggers.length) return null;
      const target = triggers[wrapIndex(index, triggers.length)];
      setTabStop(target);
      focusNode(target);
      return target;
    }

    function isItemDisabled(item: HTMLButtonElement) {
      return item.getAttribute?.('aria-disabled') === 'true' || item.attributes?.getNamedItem?.('aria-disabled')?.value === 'true';
    }

    function focusItemAt(index: number) {
      if (!menuItems.length) return false;
      return focusNode(menuItems[wrapIndex(index, menuItems.length)]);
    }

    function focusMatchingItem(character: string) {
      if (!menuItems.length) return false;
      const needle = character.toLowerCase();
      const start = menuItems.findIndex(item => item === document.activeElement) + 1;
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

    function closeMenu(options: { restoreFocus?: boolean | 'auto' } = {}) {
      const hadMenu = !!menuPopup;
      const lastTrigger = openTrigger;
      const restoreFocus = options.restoreFocus === 'auto'
        ? menuHoldsFocus()
        : options.restoreFocus === true;
      if (menuPopup) menuPopup.remove();
      menuPopup = null;
      menuItems = [];
      openTrigger = null;
      document.querySelectorAll<HTMLElement>('#menubar .menu').forEach(node => {
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

    function moveToAdjacentMenu(step: number) {
      const triggers = triggerList();
      const index = openTrigger ? triggers.indexOf(openTrigger) : -1;
      if (index < 0 || triggers.length < 2) return false;
      const next = triggers[wrapIndex(index + step, triggers.length)];
      setTabStop(next);
      openMenu(next, { focus: 'first' });
      return true;
    }

    function handleMenuKeydown(event: KeyboardEvent) {
      const index = menuItems.findIndex(item => item === document.activeElement);
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
        case 'Enter': case ' ': event.stopPropagation?.(); return;
        default: break;
      }
      if (event.key.length === 1 && !event.ctrlKey && !event.metaKey && !event.altKey
        && focusMatchingItem(event.key)) consume();
    }

    function createMenuItem(definition: MenuItem) {
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
      item.addEventListener('click', (event: Partial<MouseEvent> = {}) => {
        if (isItemDisabled(item)) return;
        closeMenu({ restoreFocus: !event.detail });
        run(definition.cmd);
      });
      return item;
    }

    function openMenu(trigger: HTMLElement, options: { focus?: 'first' | 'last' } = {}) {
      const menuId = trigger.dataset.menu || '';
      const wasSame = menuPopup && menuPopup.dataset.menu === menuId;
      closeMenu();
      if (wasSame) return false;
      const popup = document.createElement('div');
      popup.className = 'app-menu-popup';
      popup.dataset.menu = menuId;
      popup.id = `app-menu-${menuId}`;
      popup.setAttribute('role', 'menu');
      if (trigger.id) popup.setAttribute('aria-labelledby', trigger.id);
      const items: HTMLButtonElement[] = [];
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

    function handleKeydown(event: KeyboardEvent) {
      if (event.key === 'F9') {
        event.preventDefault();
        run('validate');
        return;
      }
      const target = event.target as Element | null;
      if (target?.matches?.('input, textarea, select')) return;
      if (event.key === 'Enter' && target?.closest?.('button, [role="button"]')) return;
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
      const shortcutCommands: Readonly<Partial<Record<string, string>>> = {
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
      const shortcut = shortcutCommands[key];
      if (mod && shortcut) {
        event.preventDefault();
        run(shortcut);
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

    function handleDocumentMouseDown(event: MouseEvent) {
      const target = event.target as Element | null;
      if (menuPopup && !menuPopup.contains(target) && !target?.closest?.('#menubar .menu')) closeMenu();
    }

    function toolbarButtons() {
      return [...toolbar.querySelectorAll<HTMLButtonElement>('button:not([disabled])')]
        .filter(button => button.offsetParent === undefined || button.offsetParent !== null);
    }

    function toolbarButtonKey(button: HTMLButtonElement) {
      return button.dataset?.cmd ? `cmd:${button.dataset.cmd}` : `label:${button.textContent}`;
    }

    function syncToolbarTabStops(preferred?: Element | null) {
      const buttons = toolbarButtons();
      if (!buttons.length) return null;
      let chosen = buttons.find(button => button === preferred);
      if (!chosen && toolbarKey) chosen = buttons.find(button => toolbarButtonKey(button) === toolbarKey);
      if (!chosen) [chosen] = buttons;
      buttons.forEach(button => { button.tabIndex = button === chosen ? 0 : -1; });
      toolbarKey = toolbarButtonKey(chosen);
      return chosen;
    }

    function focusToolbarAt(index: number) {
      const buttons = toolbarButtons();
      if (!buttons.length) return false;
      const target = buttons[wrapIndex(index, buttons.length)];
      syncToolbarTabStops(target);
      toolbarFocused = target;
      return focusNode(target);
    }

    function handleToolbarKeydown(event: KeyboardEvent) {
      const button = (event.target as Element | null)?.closest?.('button');
      if (!button) return;
      const index = toolbarButtons().indexOf(button);
      if (index < 0) return;
      const consume = () => { event.preventDefault(); event.stopPropagation(); };
      switch (event.key) {
        case 'ArrowRight': consume(); focusToolbarAt(index + 1); return;
        case 'ArrowLeft': consume(); focusToolbarAt(index - 1); return;
        case 'Home': consume(); focusToolbarAt(0); return;
        case 'End': consume(); focusToolbarAt(toolbarButtons().length - 1); return;
        case 'ArrowUp': case 'ArrowDown': case 'Enter': case ' ':
          event.stopPropagation();
          return;
        default:
          break;
      }
    }

    function handleToolbarFocusIn(event: FocusEvent) {
      const button = (event.target as Element | null)?.closest?.('button');
      if (!button || toolbar.contains?.(button) === false) return;
      toolbarFocused = button;
      syncToolbarTabStops(button);
    }

    function handleToolbarMutations() {
      const active = document.activeElement;
      const lostFocus = toolbarFocused
        && toolbarFocused.isConnected === false
        && (!active || active === document.body);
      const chosen = syncToolbarTabStops(lostFocus ? null : active);
      if (!lostFocus || !chosen) return;
      toolbarFocused = chosen;
      focusNode(chosen);
    }

    function handleToolbarClick(event: MouseEvent) {
      const button = (event.target as Element | null)?.closest?.('button');
      if (button?.dataset.cmd) run(button.dataset.cmd);
    }

    function handleTriggerKeydown(event: KeyboardEvent, trigger: HTMLElement) {
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

    function attachTrigger(trigger: HTMLElement, index: number) {
      prepareTrigger(trigger, index);
      const click = (event: MouseEvent) => {
        event.stopPropagation();
        setTabStop(trigger);
        openMenu(trigger);
      };
      const mouseenter = () => {
        if (menuPopup && menuPopup.dataset.menu !== trigger.dataset.menu) openMenu(trigger);
      };
      const keydown = (event: KeyboardEvent) => handleTriggerKeydown(event, trigger);
      trigger.addEventListener('click', click);
      trigger.addEventListener('mouseenter', mouseenter);
      trigger.addEventListener('keydown', keydown);
      triggerBindings.push({ trigger, click, mouseenter, keydown });
    }

    function attach() {
      if (attached) return;
      attached = true;
      menuTriggers.push(...document.querySelectorAll<HTMLElement>('#menubar .menu'));
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
}
