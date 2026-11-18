'use strict';

const assert = require('node:assert/strict');
const {
  REQUIRED_FUNCTIONS,
  REQUIRED_VALUES,
  create,
} = require('../dist/browser/editor/command-router.js');

function fakeTarget(extra = {}) {
  const listeners = new Map();
  return {
    ...extra,
    addEventListener(type, listener) {
      const handlers = listeners.get(type) || [];
      handlers.push(listener);
      listeners.set(type, handlers);
    },
    removeEventListener(type, listener) {
      listeners.set(type, (listeners.get(type) || []).filter(handler => handler !== listener));
    },
    emit(type, event = {}) { (listeners.get(type) || []).forEach(listener => listener(event)); },
    listenerCount(type) { return (listeners.get(type) || []).length; },
  };
}

let focused = null;

function fakeNode(tagName = 'div') {
  const classes = new Set();
  const node = fakeTarget({
    tagName: tagName.toUpperCase(),
    children: [],
    className: '',
    dataset: {},
    style: {},
    attributes: {},
    removed: false,
    appendChild(child) { this.children.push(child); child.parent = this; return child; },
    append(...children) { children.forEach(child => this.appendChild(child)); },
    setAttribute(name, value) { this.attributes[name] = String(value); },
    getAttribute(name) { return this.attributes[name] ?? null; },
    removeAttribute(name) { delete this.attributes[name]; },
    getBoundingClientRect: () => ({ left: 10, bottom: 30 }),
    remove() { this.removed = true; if (this.parent) this.parent.children = this.parent.children.filter(child => child !== this); },
    contains(target) { return target === this || this.children.some(child => child.contains?.(target)); },
  });
  node.classList = {
    add(name) { classes.add(name); },
    remove(name) { classes.delete(name); },
    contains(name) { return classes.has(name); },
  };
  node.focus = () => { focused = node; };
  return node;
}

assert.ok(Object.isFrozen(REQUIRED_FUNCTIONS));
assert.ok(Object.isFrozen(REQUIRED_VALUES));
assert.throws(() => create(), /cancelInteraction/);

const fileTrigger = fakeNode('span');
fileTrigger.dataset.menu = 'file';
const editTrigger = fakeNode('span');
editTrigger.dataset.menu = 'edit';
const viewTrigger = fakeNode('span');
viewTrigger.dataset.menu = 'view';
const menuTriggers = [fileTrigger, editTrigger, viewTrigger];
const body = fakeNode('body');
const documentTarget = fakeTarget();
const document = Object.assign(documentTarget, {
  body,
  createElement: tagName => fakeNode(tagName),
  querySelectorAll(selector) {
    if (selector === '#menubar .menu') return menuTriggers;
    if (selector === '#menubar .menu-open') return menuTriggers.filter(node => node.classList.contains('menu-open'));
    return [];
  },
  querySelector: () => null,
  get activeElement() { return focused; },
});
function toolbarButton(cmd, label = cmd) {
  const button = fakeNode('button');
  button.dataset.cmd = cmd;
  button.textContent = label;
  button.closest = selector => (selector === 'button' ? button : null);
  return button;
}

const staticToolbarButtons = ['new', 'open', 'save', 'validate'].map(cmd => toolbarButton(cmd));
let dynamicToolbarButtons = [];
const toolbar = Object.assign(fakeTarget(), {
  querySelectorAll: () => [...staticToolbarButtons, ...dynamicToolbarButtons],
  contains: node => [...staticToolbarButtons, ...dynamicToolbarButtons].includes(node),
});
const observed = [];
class FakeMutationObserver {
  constructor(callback) { this.callback = callback; observed.push(this); }
  observe(target, options) { this.target = target; this.options = options; }
  disconnect() { this.disconnected = true; }
  trigger() { this.callback([], this); }
}
const eventRoot = fakeTarget();
const commandCalls = [];
const commandNames = [
  'new', 'open', 'save', 'validate', 'selectall', 'copy', 'cut', 'paste', 'duplicate', 'delete',
  'deletemodel', 'undo', 'redo', 'explorerfocus', 'fit', 'zoomreset', 'zoomin', 'zoomout',
  'minimap', 'importddl', 'importdrawio', 'projects', 'recovery', 'exportsvg', 'exportpng', 'exportall',
  'exportmermaid', 'exportdrawio', 'exportddl', 'autoresize', 'bringfront', 'sendback', 'models',
  'validationpanel', 'about',
];
const commands = Object.fromEntries(commandNames.map(name => [name, () => { commandCalls.push(name); }]));
let cancelCalls = 0;
let memberQuickEditCalls = 0;
let selectionQuickEditCalls = 0;
let selectAllCalls = 0;
let moveCalls = 0;
let modalCloseCalls = 0;
const dependencies = {
  ...Object.fromEntries(REQUIRED_FUNCTIONS.map(name => [name, () => false])),
  cancelInteraction: () => { cancelCalls += 1; },
  closeTabMenu: () => false,
  closeTopModal: () => { modalCloseCalls += 1; return modalCloseCalls === 1; },
  hasClipboard: () => true,
  moveSelection: () => { moveCalls += 1; return true; },
  openSelectedMemberQuickEdit: () => { memberQuickEditCalls += 1; return true; },
  openSelectedQuickEdit: () => { selectionQuickEditCalls += 1; return true; },
  selectAll: () => { selectAllCalls += 1; },
  commands,
  document,
  eventRoot,
  MutationObserver: FakeMutationObserver,
  toolbar,
};

assert.throws(
  () => create({ ...dependencies, commands: {} }),
  /missing commands:.*new/,
  '메뉴가 참조하는 명령이 빠지면 초기화 시 즉시 알려야 합니다',
);
const controller = create(dependencies);
assert.ok(Object.isFrozen(controller));
assert.ok(Object.isFrozen(controller.menuDefinitions));
assert.ok(Object.isFrozen(controller.menuDefinitions.file));
controller.attach();
controller.attach();
assert.equal(eventRoot.listenerCount('keydown'), 1, '키보드 리스너는 중복 등록하면 안 됩니다');
assert.equal(fileTrigger.listenerCount('click'), 1);

assert.equal(fileTrigger.attributes.role, 'menuitem', '메뉴 트리거는 menuitem 역할이어야 합니다');
assert.equal(fileTrigger.attributes['aria-haspopup'], 'true');
assert.equal(fileTrigger.attributes['aria-expanded'], 'false');
assert.equal(fileTrigger.id, 'menubar-trigger-file');
assert.equal(fileTrigger.tabIndex, 0, '메뉴바는 탭 정지점이 하나여야 합니다');
assert.equal(editTrigger.tabIndex, -1);
assert.equal(viewTrigger.tabIndex, -1);


function keyboardEvent(key, options = {}) {
  let prevented = 0;
  return {
    key,
    ctrlKey: false,
    metaKey: false,
    altKey: false,
    shiftKey: false,
    target: { matches: () => false },
    preventDefault: () => { prevented += 1; },
    prevented: () => prevented,
    ...options,
  };
}

let event = keyboardEvent('F9', { target: { matches: () => true } });
eventRoot.emit('keydown', event);
assert.deepEqual(commandCalls, ['validate'], 'F9 검증은 편집 필드에서도 실행되어야 합니다');
assert.equal(event.prevented(), 1);

event = keyboardEvent('c', { ctrlKey: true });
eventRoot.emit('keydown', event);
assert.equal(commandCalls.at(-1), 'copy');
event = keyboardEvent('s', { ctrlKey: true, target: { matches: () => true } });
eventRoot.emit('keydown', event);
assert.equal(commandCalls.includes('save'), false, '편집 필드 단축키는 무시해야 합니다');

eventRoot.emit('keydown', keyboardEvent('a', { ctrlKey: true }));
assert.equal(selectAllCalls, 1);
eventRoot.emit('keydown', keyboardEvent('ArrowLeft'));
assert.equal(moveCalls, 1);
eventRoot.emit('keydown', keyboardEvent('Enter', { ctrlKey: true }));
assert.equal(memberQuickEditCalls, 1);
eventRoot.emit('keydown', keyboardEvent('Enter'));
assert.equal(selectionQuickEditCalls, 1);

fileTrigger.emit('click', { stopPropagation() {} });
assert.equal(body.children.length, 1);
const popup = body.children[0];
assert.equal(popup.dataset.menu, 'file');
assert.ok(fileTrigger.classList.contains('menu-open'));
const saveItem = popup.children.find(item => item.children?.some(child => child.textContent === 'Save'));
saveItem.emit('click');
assert.equal(commandCalls.at(-1), 'save');
assert.equal(body.children.length, 0);

viewTrigger.emit('click', { stopPropagation() {} });
eventRoot.emit('keydown', keyboardEvent('Escape'));
assert.equal(cancelCalls, 0, 'Escape는 열린 메뉴를 먼저 닫아야 합니다');
eventRoot.emit('keydown', keyboardEvent('Escape'));
assert.equal(cancelCalls, 0, 'Escape는 열린 모달을 상호작용 취소보다 먼저 닫아야 합니다');
eventRoot.emit('keydown', keyboardEvent('Escape'));
assert.equal(cancelCalls, 1);

/* ── menubar ARIA and keyboard navigation ─────────────────── */
focused = fileTrigger;
fileTrigger.emit('keydown', keyboardEvent('ArrowRight'));
assert.equal(focused, editTrigger, '방향키는 메뉴바 항목 사이를 이동해야 합니다');
assert.equal(editTrigger.tabIndex, 0);
assert.equal(fileTrigger.tabIndex, -1);

editTrigger.emit('keydown', keyboardEvent('ArrowDown'));
const editPopup = body.children[0];
const editItems = editPopup.children.filter(child => child.className === 'app-menu-item');
assert.equal(editPopup.attributes.role, 'menu');
assert.equal(editPopup.attributes['aria-labelledby'], 'menubar-trigger-edit');
assert.equal(editTrigger.attributes['aria-expanded'], 'true');
assert.equal(editTrigger.attributes['aria-controls'], 'app-menu-edit');
assert.equal(editItems[0].dataset.label, 'Undo');
assert.equal(editItems[0].attributes['aria-disabled'], 'true');
assert.equal(editItems[0].attributes.disabled, undefined,
  '사용할 수 없는 항목도 포커스로 발견할 수 있어야 합니다');
assert.equal(focused, editItems[0], '메뉴를 열면 비활성 항목이라도 첫 항목에 포커스해야 합니다');
const commandsBeforeDisabledClick = commandCalls.length;
editItems[0].emit('click');
assert.equal(commandCalls.length, commandsBeforeDisabledClick, '비활성 항목은 명령을 실행하지 않아야 합니다');
assert.equal(body.children.length, 1, '비활성 항목을 눌러도 메뉴는 열려 있어야 합니다');
editPopup.emit('keydown', keyboardEvent('p'));
assert.equal(focused.dataset.label, 'Paste');
assert.equal(editPopup.children.find(child => child.className === 'app-menu-sep').attributes.role, 'separator');

editPopup.emit('keydown', keyboardEvent('ArrowRight'));
assert.equal(body.children.length, 1, '방향키로 옆 메뉴를 열면 이전 메뉴는 닫혀야 합니다');
assert.equal(editTrigger.attributes['aria-expanded'], 'false');
assert.equal(editTrigger.attributes['aria-controls'], undefined);
const viewPopup = body.children[0];
const viewItems = viewPopup.children.filter(child => child.className === 'app-menu-item');
assert.equal(viewPopup.dataset.menu, 'view');
assert.equal(focused, viewItems[0]);

viewPopup.emit('keydown', keyboardEvent('End'));
assert.equal(focused, viewItems.at(-1));
viewPopup.emit('keydown', keyboardEvent('ArrowDown'));
assert.equal(focused, viewItems[0], '마지막 항목에서 아래로 가면 처음으로 순환해야 합니다');
viewPopup.emit('keydown', keyboardEvent('ArrowUp'));
assert.equal(focused, viewItems.at(-1));
viewPopup.emit('keydown', keyboardEvent('Home'));
assert.equal(focused, viewItems[0]);
viewPopup.emit('keydown', keyboardEvent('f'));
assert.equal(focused.dataset.label, 'Fit to Window', '첫 글자 입력은 같은 글자로 시작하는 항목을 찾아야 합니다');

const minimapItem = viewItems.find(item => item.dataset.label === 'Minimap');
assert.equal(minimapItem.attributes.role, 'menuitemcheckbox');
assert.equal(minimapItem.attributes['aria-checked'], 'false');
assert.equal(viewItems[0].attributes.role, 'menuitem');
assert.equal(viewItems[0].children[0].attributes['aria-hidden'], 'true');

viewPopup.emit('keydown', keyboardEvent('Escape'));
assert.equal(body.children.length, 0);
assert.equal(viewTrigger.attributes['aria-expanded'], 'false');
assert.equal(focused, viewTrigger, 'Escape는 메뉴를 닫고 트리거로 포커스를 돌려야 합니다');
assert.equal(viewTrigger.tabIndex, 0);

viewTrigger.emit('keydown', keyboardEvent('Home'));
assert.equal(focused, fileTrigger);
fileTrigger.emit('keydown', keyboardEvent('End'));
assert.equal(focused, viewTrigger);

viewTrigger.emit('keydown', keyboardEvent('ArrowUp'));
const lastOpened = body.children[0];
assert.equal(focused, lastOpened.children.filter(child => child.className === 'app-menu-item').at(-1),
  '위 방향키로 열면 마지막 항목에 포커스해야 합니다');
lastOpened.emit('keydown', keyboardEvent('Tab'));
assert.equal(body.children.length, 0, 'Tab은 메뉴를 닫아야 합니다');
assert.equal(focused, viewTrigger);

/* ── toolbar: one tab stop, arrow keys inside ─────────────── */
function toolbarEvent(key, button) {
  let prevented = 0;
  let stopped = 0;
  return {
    key,
    target: button,
    preventDefault: () => { prevented += 1; },
    stopPropagation: () => { stopped += 1; },
    prevented: () => prevented,
    stopped: () => stopped,
  };
}

assert.equal(staticToolbarButtons[0].tabIndex, 0, '툴바는 탭 정지점이 하나여야 합니다');
assert.equal(staticToolbarButtons[1].tabIndex, -1);
assert.equal(staticToolbarButtons[3].tabIndex, -1);

let toolbarKeydown = toolbarEvent('ArrowRight', staticToolbarButtons[0]);
toolbar.emit('keydown', toolbarKeydown);
assert.equal(focused, staticToolbarButtons[1]);
assert.equal(staticToolbarButtons[1].tabIndex, 0);
assert.equal(staticToolbarButtons[0].tabIndex, -1);
assert.equal(toolbarKeydown.prevented(), 1);

toolbar.emit('keydown', toolbarEvent('ArrowLeft', staticToolbarButtons[1]));
assert.equal(focused, staticToolbarButtons[0]);
toolbar.emit('keydown', toolbarEvent('ArrowLeft', staticToolbarButtons[0]));
assert.equal(focused, staticToolbarButtons.at(-1), '왼쪽 끝에서는 마지막 버튼으로 순환해야 합니다');
toolbar.emit('keydown', toolbarEvent('Home', staticToolbarButtons.at(-1)));
assert.equal(focused, staticToolbarButtons[0]);
toolbar.emit('keydown', toolbarEvent('End', staticToolbarButtons[0]));
assert.equal(focused, staticToolbarButtons.at(-1));

const commandsBeforeToolbarEnter = commandCalls.length;
const enterOnToolbar = toolbarEvent('Enter', staticToolbarButtons[0]);
toolbar.emit('keydown', enterOnToolbar);
assert.equal(enterOnToolbar.stopped(), 1, '툴바의 Enter는 캔버스 편집으로 새면 안 됩니다');
assert.equal(commandCalls.length, commandsBeforeToolbarEnter);
const arrowUpOnToolbar = toolbarEvent('ArrowUp', staticToolbarButtons[0]);
toolbar.emit('keydown', arrowUpOnToolbar);
assert.equal(arrowUpOnToolbar.stopped(), 1, '툴바의 위·아래 방향키는 선택을 옮기면 안 됩니다');

toolbar.emit('focusin', { target: staticToolbarButtons[2] });
assert.equal(staticToolbarButtons[2].tabIndex, 0);
assert.equal(staticToolbarButtons[0].tabIndex, -1);

/* the ERD/sequence holders are rebuilt on every canvas render */
const erdModeButton = fakeNode('button');
erdModeButton.textContent = '논리';
erdModeButton.closest = selector => (selector === 'button' ? erdModeButton : null);
dynamicToolbarButtons = [erdModeButton];
assert.equal(observed.length, 1, '툴바 변화를 감시해야 합니다');
assert.equal(observed[0].target, toolbar);
observed[0].trigger();
assert.equal(erdModeButton.tabIndex, -1, '새로 그린 버튼이 별도의 탭 정지점이 되면 안 됩니다');

toolbar.emit('focusin', { target: erdModeButton });
assert.equal(erdModeButton.tabIndex, 0);
const replacedButton = fakeNode('button');
replacedButton.textContent = '논리';
replacedButton.closest = selector => (selector === 'button' ? replacedButton : null);
erdModeButton.isConnected = false;
dynamicToolbarButtons = [replacedButton];
focused = null;
observed[0].trigger();
assert.equal(focused, replacedButton, '다시 그린 뒤에도 같은 툴바 버튼에 포커스를 유지해야 합니다');
assert.equal(replacedButton.tabIndex, 0);
dynamicToolbarButtons = [];

toolbar.emit('click', { target: { closest: selector => selector === 'button' ? { dataset: { cmd: 'validate' } } : null } });
assert.equal(commandCalls.at(-1), 'validate');

controller.detach();
controller.detach();
assert.equal(observed[0].disconnected, true, 'detach는 툴바 감시를 멈춰야 합니다');
assert.equal(toolbar.listenerCount('keydown'), 0);
assert.equal(toolbar.listenerCount('focusin'), 0);
assert.equal(eventRoot.listenerCount('keydown'), 0);
assert.equal(toolbar.listenerCount('click'), 0);
assert.equal(fileTrigger.listenerCount('click'), 0);

console.log('command router tests: ok');
