'use strict';

const assert = require('node:assert/strict');
const {
  REQUIRED_FUNCTIONS,
  REQUIRED_VALUES,
  REPEAT_WINDOW_MS,
  describe,
  create,
} = require('../dist/browser/editor/runtime-errors.js');

function fakeEventTarget() {
  const listeners = new Map();
  return {
    addEventListener(type, listener) {
      listeners.set(type, [...(listeners.get(type) || []), listener]);
    },
    removeEventListener(type, listener) {
      listeners.set(type, (listeners.get(type) || []).filter(item => item !== listener));
    },
    emit(type, event) { (listeners.get(type) || []).forEach(listener => listener(event)); },
    count(type) { return (listeners.get(type) || []).length; },
  };
}

assert.ok(Object.isFrozen(REQUIRED_FUNCTIONS) && Object.isFrozen(REQUIRED_VALUES));
assert.equal(REPEAT_WINDOW_MS, 3000);

/* ── 메시지 정리 ───────────────────────────────────────────── */
assert.equal(describe({ type: 'error', error: new TypeError('x is not a function') }), 'x is not a function');
assert.equal(describe({ type: 'error', message: 'Uncaught TypeError: bad thing' }), 'bad thing',
  '브라우저가 붙이는 Uncaught 접두사는 뗍니다');
assert.equal(describe({ type: 'error', message: 'Uncaught bad thing' }), 'bad thing');
assert.equal(describe({ type: 'error' }), '알 수 없는 오류');
assert.equal(describe({ type: 'unhandledrejection', reason: new Error('save failed') }), 'save failed');
assert.equal(describe({ type: 'unhandledrejection', reason: 'plain string' }), 'plain string');
assert.equal(describe({ type: 'unhandledrejection', reason: undefined }), '처리되지 않은 Promise 거부');

/* ── 의존성 계약 ───────────────────────────────────────────── */
assert.throws(() => create(), /런타임 오류 표시 의존성이 없습니다/);
assert.throws(() => create({ flashStatus() {}, now() {}, renderStatus() {}, state: {}, eventRoot: {} }),
  /eventRoot\.addEventListener/);
assert.throws(() => create({ flashStatus() {}, now() {}, renderStatus() {}, state: 'no', eventRoot: fakeEventTarget() }),
  /state\.object/);

/* ── 오류는 상태 표시줄로 간다 ────────────────────────────── */
{
  const flashes = [];
  let renders = 0;
  let clock = 10_000;
  const root = fakeEventTarget();
  const state = {};
  const errors = create({
    flashStatus: message => flashes.push(message),
    now: () => clock,
    renderStatus: () => { renders += 1; },
    eventRoot: root,
    state,
  });
  assert.ok(Object.isFrozen(errors));

  errors.attach();
  errors.attach();
  assert.equal(root.count('error'), 1, '중복 attach는 리스너를 겹쳐 달지 않습니다');
  assert.equal(root.count('unhandledrejection'), 1);

  root.emit('error', { type: 'error', error: new Error('render broke') });
  assert.deepEqual(state.runtimeErrors, { count: 1, last: 'render broke', at: 10_000 });
  assert.equal(renders, 1, '지속 표시를 위해 상태 표시줄을 다시 그립니다');
  assert.deepEqual(flashes, ['⚠ 동작 중 오류: render broke · 최근 변경이 저장되지 않았을 수 있습니다']);

  /* mousemove마다 같은 오류가 터져도 안내는 한 번, 건수는 계속 센다 */
  clock += 500;
  root.emit('error', { type: 'error', error: new Error('render broke') });
  clock += 500;
  root.emit('error', { type: 'error', error: new Error('render broke') });
  assert.equal(state.runtimeErrors.count, 3);
  assert.equal(flashes.length, 1, '3초 안의 같은 오류는 다시 알리지 않습니다');
  assert.equal(renders, 3);

  /* 다른 오류는 바로 알린다 */
  root.emit('unhandledrejection', { type: 'unhandledrejection', reason: new Error('autosave rejected') });
  assert.equal(state.runtimeErrors.count, 4);
  assert.equal(state.runtimeErrors.last, 'autosave rejected');
  assert.equal(flashes.length, 2);

  /* 시간이 지나면 같은 오류도 다시 알린다 */
  clock += REPEAT_WINDOW_MS + 1;
  root.emit('unhandledrejection', { type: 'unhandledrejection', reason: new Error('autosave rejected') });
  assert.equal(flashes.length, 3);

  /* 아주 긴 메시지는 잘라서 표시줄을 넘치지 않게 한다 */
  root.emit('error', { type: 'error', error: new Error('x'.repeat(500)) });
  assert.equal(state.runtimeErrors.last.length, 140);

  errors.detach();
  errors.detach();
  assert.equal(root.count('error'), 0);
  assert.equal(root.count('unhandledrejection'), 0);
  const before = state.runtimeErrors.count;
  root.emit('error', { type: 'error', error: new Error('after detach') });
  assert.equal(state.runtimeErrors.count, before, 'detach 뒤에는 세지 않습니다');
}

console.log('runtime errors tests: ok');
