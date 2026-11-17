'use strict';

const assert = require('node:assert/strict');
const {
  MAX_HISTORY_ENTRIES,
  REQUIRED_FUNCTIONS,
  REQUIRED_VALUES,
  create,
} = require('../dist/browser/editor/history-controller.js');

function harness(initialState = 'state-a') {
  let currentState = initialState;
  const log = {
    captured: [],
    dirty: 0,
    restored: [],
  };
  const controller = create({
    captureState() {
      log.captured.push(currentState);
      return currentState;
    },
    markDirty() {
      log.dirty += 1;
    },
    restoreState(snapshot) {
      log.restored.push(snapshot);
      currentState = snapshot;
    },
  });
  return {
    controller,
    log,
    currentState: () => currentState,
    setCurrentState(value) {
      currentState = value;
    },
  };
}

assert.ok(Object.isFrozen(REQUIRED_FUNCTIONS));
assert.ok(Object.isFrozen(REQUIRED_VALUES));
assert.equal(MAX_HISTORY_ENTRIES, 100);
assert.throws(() => create(), /History Controller 의존성이 없습니다:.*captureState/);
assert.throws(
  () => create({ captureState() {}, restoreState() {} }),
  /markDirty/,
);

{
  const h = harness();
  assert.ok(Object.isFrozen(h.controller));
  assert.equal(h.controller.canUndo(), false);
  assert.equal(h.controller.canRedo(), false);
  h.controller.undo();
  h.controller.redo();
  h.controller.rollbackLastSnapshot();
  assert.deepEqual(h.log.restored, [], '빈 이력 명령은 상태를 바꾸면 안 됩니다');
}

{
  const h = harness('before-edit');
  h.controller.snapshot();
  assert.equal(h.log.dirty, 1, '편집 스냅샷은 자동저장을 위해 dirty 상태를 표시해야 합니다');
  assert.equal(h.controller.canUndo(), true);
  assert.equal(h.controller.canRedo(), false);

  h.setCurrentState('after-edit');
  h.controller.undo();
  assert.equal(h.currentState(), 'before-edit');
  assert.equal(h.controller.canUndo(), false);
  assert.equal(h.controller.canRedo(), true);

  h.controller.redo();
  assert.equal(h.currentState(), 'after-edit');
  assert.equal(h.controller.canUndo(), true);
  assert.equal(h.controller.canRedo(), false);
}

{
  const h = harness('state-a');
  h.controller.snapshot();
  h.setCurrentState('state-b');
  h.controller.undo();
  assert.equal(h.controller.canRedo(), true);

  h.setCurrentState('new-branch');
  h.controller.snapshot();
  assert.equal(h.controller.canRedo(), false, 'Undo 뒤 새 편집을 시작하면 기존 Redo 분기를 버려야 합니다');
  const restoredBeforeRedo = h.log.restored.length;
  h.controller.redo();
  assert.equal(h.log.restored.length, restoredBeforeRedo);

  h.controller.resetHistory();
  assert.equal(h.controller.canUndo(), false);
  assert.equal(h.controller.canRedo(), false);
}

{
  const h = harness('safe-state');
  h.controller.snapshot();
  h.setCurrentState('intermediate-state');
  h.controller.snapshot();
  h.setCurrentState('broken-import');
  h.controller.undo();
  assert.equal(h.currentState(), 'intermediate-state');
  assert.equal(h.controller.canRedo(), true);

  h.controller.rollbackLastSnapshot();
  assert.equal(h.currentState(), 'safe-state', '가져오기 실패 시 직전 안전 스냅샷으로 복원해야 합니다');
  assert.equal(h.controller.canUndo(), false);
  assert.equal(h.controller.canRedo(), false, '롤백 뒤 실패한 상태를 Redo할 수 없어야 합니다');
}

{
  const h = harness('state-1');
  for (let index = 1; index <= MAX_HISTORY_ENTRIES + 1; index += 1) {
    h.setCurrentState(`state-${index}`);
    h.controller.snapshot();
  }
  h.setCurrentState('live-state');
  while (h.controller.canUndo()) h.controller.undo();
  assert.equal(h.log.restored.length, MAX_HISTORY_ENTRIES);
  assert.equal(h.currentState(), 'state-2', '가장 오래된 스냅샷부터 제거해 최근 100개만 유지해야 합니다');
}

console.log('history controller tests: ok');
