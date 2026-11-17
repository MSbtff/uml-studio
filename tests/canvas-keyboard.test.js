'use strict';

const assert = require('node:assert/strict');
const { REQUIRED_FUNCTIONS, REQUIRED_VALUES, create } = require('../dist/browser/canvas/canvas-keyboard.js');

function fakeWrap() {
  const listeners = new Map();
  return {
    clientWidth: 400,
    clientHeight: 300,
    scrollLeft: 0,
    scrollTop: 0,
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

function tabEvent(options = {}) {
  let prevented = 0;
  return {
    key: 'Tab',
    shiftKey: false,
    altKey: false,
    ctrlKey: false,
    metaKey: false,
    target: { matches: () => false },
    preventDefault: () => { prevented += 1; },
    prevented: () => prevented,
    ...options,
  };
}

assert.ok(Object.isFrozen(REQUIRED_FUNCTIONS));
assert.ok(Object.isFrozen(REQUIRED_VALUES));
assert.throws(() => create(), /UMLCanvasKeyboard requires byId\(\)/);

function harness() {
  const wrap = fakeWrap();
  const status = [];
  const diagram = {
    id: 'd1',
    type: 'class',
    elements: [
      { id: 'a', kind: 'class', name: 'Customer', x: 20, y: 20, w: 120, h: 60 },
      { id: 'b', kind: 'class', name: '', x: 900, y: 700, w: 120, h: 60 },
    ],
    relations: [{ id: 'r1', kind: 'association', name: '', from: 'a', to: 'b' }],
  };
  const state = { selection: [], selectedId: null, zoom: 1 };
  let renders = 0;
  let propsRenders = 0;
  const keyboard = create({
    byId: id => diagram.elements.find(view => view.id === id) || null,
    dg: () => diagram,
    diagramKindLabel: kind => ({ class: 'Class', association: 'Association' })[kind] || kind,
    flashStatus: message => { status.push(message); },
    render: () => { renders += 1; },
    renderProps: () => { propsRenders += 1; },
    setSelection: ids => {
      state.selection = ids;
      state.selectedId = ids.length === 1 ? ids[0] : null;
    },
    state,
    wrap,
  });
  keyboard.attach();
  return {
    diagram, keyboard, state, status, wrap,
    counts: () => ({ renders, propsRenders }),
  };
}

{
  const h = harness();
  assert.ok(Object.isFrozen(h.keyboard));
  h.keyboard.attach();
  assert.equal(h.wrap.listenerCount('keydown'), 1, '키보드 리스너는 중복 등록하면 안 됩니다');
  assert.deepEqual(h.keyboard.navigableItems().map(item => item.view.id), ['a', 'b', 'r1'],
    '요소 다음에 관계를 순회해야 합니다');

  /* 선택이 없을 때 Tab은 첫 항목을 고른다 */
  let event = tabEvent();
  h.wrap.emit('keydown', event);
  assert.deepEqual(h.state.selection, ['a']);
  assert.equal(event.prevented(), 1);
  assert.match(h.status.at(-1), /Class "Customer" · 1\/3 선택/);
  assert.match(h.status.at(-1), /Esc 해제/, '벗어나는 방법을 함께 알려야 합니다');

  /* 다음 항목은 화면 밖이므로 최소한만 스크롤한다 */
  h.wrap.emit('keydown', tabEvent());
  assert.deepEqual(h.state.selection, ['b']);
  assert.equal(h.wrap.scrollLeft, 900 + 120 + 24 - 400);
  assert.equal(h.wrap.scrollTop, 700 + 60 + 24 - 300);

  /* 이름이 없으면 종류만 읽어준다 */
  assert.match(h.status.at(-1), /^Class · 2\/3 선택/);

  h.wrap.emit('keydown', tabEvent());
  assert.deepEqual(h.state.selection, ['r1'], '관계도 키보드로 선택할 수 있어야 합니다');

  /* 마지막을 지나면 선택을 풀고 Tab이 캔버스를 벗어나게 둔다 */
  event = tabEvent();
  h.wrap.emit('keydown', event);
  assert.deepEqual(h.state.selection, []);
  assert.equal(event.prevented(), 0, '끝에서는 Tab을 막지 않아야 키보드가 갇히지 않습니다');
  assert.match(h.status.at(-1), /캔버스를 벗어납니다/);
}

{
  /* Shift+Tab은 반대 방향으로 돌고, 처음을 지나면 마찬가지로 놓아준다 */
  const h = harness();
  h.wrap.emit('keydown', tabEvent({ shiftKey: true }));
  assert.deepEqual(h.state.selection, ['r1'], '선택이 없으면 Shift+Tab은 마지막 항목입니다');
  h.wrap.emit('keydown', tabEvent({ shiftKey: true }));
  assert.deepEqual(h.state.selection, ['b']);
  h.wrap.emit('keydown', tabEvent({ shiftKey: true }));
  assert.deepEqual(h.state.selection, ['a']);
  const event = tabEvent({ shiftKey: true });
  h.wrap.emit('keydown', event);
  assert.deepEqual(h.state.selection, []);
  assert.equal(event.prevented(), 0);
}

{
  /* 캔버스 안에서 글자를 편집하는 중이면 Tab을 가로채지 않는다 */
  const h = harness();
  const event = tabEvent({ target: { matches: selector => selector.includes('input') } });
  h.wrap.emit('keydown', event);
  assert.deepEqual(h.state.selection, []);
  assert.equal(event.prevented(), 0);

  /* 조합키가 붙은 Tab도 브라우저에 맡긴다 */
  const withCtrl = tabEvent({ ctrlKey: true });
  h.wrap.emit('keydown', withCtrl);
  assert.equal(withCtrl.prevented(), 0);

  /* 다중 선택 뒤에는 마지막으로 고른 항목에서 이어간다 */
  h.state.selection = ['a', 'b'];
  h.state.selectedId = null;
  h.wrap.emit('keydown', tabEvent());
  assert.deepEqual(h.state.selection, ['r1']);
}

{
  /* 빈 다이어그램에서는 Tab이 그대로 지나간다 */
  const h = harness();
  h.diagram.elements = [];
  h.diagram.relations = [];
  const event = tabEvent();
  h.wrap.emit('keydown', event);
  assert.equal(event.prevented(), 0);
  assert.deepEqual(h.state.selection, []);

  h.keyboard.detach();
  h.keyboard.detach();
  assert.equal(h.wrap.listenerCount('keydown'), 0);
}

console.log('canvas keyboard tests: ok');
