'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const {
  FLASH_DURATION_MS,
  REQUIRED_FUNCTIONS,
  REQUIRED_VALUES,
  create,
} = require('../status-bar.js');

assert.ok(Object.isFrozen(REQUIRED_FUNCTIONS));
assert.ok(Object.isFrozen(REQUIRED_VALUES));
assert.equal(FLASH_DURATION_MS, 1800);

function makeHarness(overrides = {}) {
  const diagram = {
    type: 'class',
    elements: [{ id: 'e1' }, { id: 'e2' }],
    relations: [{ id: 'r1' }],
  };
  const state = {
    autosaveBackend: 'none',
    autosaveStatus: 'idle',
    dirty: false,
    lastAutosavedAt: null,
    projectName: 'Status Project',
    tool: 'select',
    zoom: 1.25,
  };
  const statusLeft = { textContent: '' };
  const statusRight = { textContent: '' };
  const timers = new Map();
  const clearedTimers = [];
  let nextTimerId = 1;
  const setTimeout = (callback, delay) => {
    const id = nextTimerId++;
    timers.set(id, { callback, delay });
    return id;
  };
  const clearTimeout = id => {
    clearedTimers.push(id);
    timers.delete(id);
  };
  const dependencies = {
    ACTIVITY_PIN_KINDS: new Set(['inputpin', 'outputpin', 'expansioninput', 'expansionoutput']),
    DIAGRAM_META: {
      bdd: { label: 'Block Definition Diagram' },
      class: { label: 'Class Diagram' },
      ibd: { label: 'Internal Block Diagram' },
      parametric: { label: 'Parametric Diagram' },
    },
    KIND_META: {
      association: { label: 'Association' },
      class: { label: 'Class' },
      collaborationuse: { label: 'Collaboration Use' },
      'comm-forward': { label: 'Forward Message' },
      expansioninput: { label: 'Expansion Input' },
      informationflow: { label: 'Information Flow' },
      inputpin: { label: 'Input Pin' },
      'msg-sync': { label: 'Synchronous Message' },
      part: { label: 'Part' },
      port: { label: 'Port' },
      reference: { label: 'Reference' },
      satisfy: { label: 'Satisfy' },
      value: { label: 'Value' },
    },
    REL_STYLE: {
      association: {},
      'comm-forward': {},
      informationflow: {},
      'msg-sync': {},
      satisfy: {},
    },
    REQUIREMENT_RELATION_KINDS: new Set(['satisfy']),
    clearTimeout,
    dg: () => diagram,
    diagramKindLabel: () => '연결',
    isCommMsg: kind => kind === 'comm-forward',
    isMsg: kind => kind.startsWith('msg-'),
    setTimeout,
    state,
    statusLeft,
    statusRight,
    ...overrides,
  };
  return {
    clearedTimers,
    controller: create(dependencies),
    dependencies,
    diagram,
    state,
    statusLeft,
    statusRight,
    timers,
  };
}

{
  const controller = makeHarness().controller;
  assert.ok(Object.isFrozen(controller));
  assert.deepEqual(Object.keys(controller), ['clearFlash', 'flash', 'render']);
}

{
  assert.throws(() => create(), /Status Bar 의존성이 없습니다:.*clearTimeout.*dg.*state/);
  const { dependencies } = makeHarness();
  assert.throws(
    () => create({ ...dependencies, ACTIVITY_PIN_KINDS: {} }),
    /ACTIVITY_PIN_KINDS\.has/,
  );
  assert.throws(
    () => create({ ...dependencies, statusLeft: 'not-an-element' }),
    /statusLeft/,
  );
}

{
  const source = fs.readFileSync(path.join(__dirname, '..', 'status-bar.js'), 'utf8');
  const context = {};
  context.globalThis = context;
  vm.runInNewContext(source, context);
  assert.equal(typeof context.UMLStatusBar.create, 'function');
}

{
  const { controller, state, statusLeft, statusRight } = makeHarness();
  controller.render();
  assert.equal(
    statusLeft.textContent,
    '선택 후 Enter 편집 · Ctrl/Cmd+Enter 멤버 추가 · Ctrl/Cmd+Shift+Enter 연산 추가 · Del 삭제',
  );
  assert.equal(
    statusRight.textContent,
    'Status Project · Class Diagram · Elements 2 · Relations 1 · Zoom 125%',
  );

  state.dirty = true;
  state.autosaveStatus = 'saving';
  controller.render();
  assert.equal(
    statusRight.textContent,
    '● 파일 저장 필요 · DB 저장 중 · Status Project · Class Diagram · Elements 2 · Relations 1 · Zoom 125%',
  );

  state.dirty = false;
  state.autosaveStatus = 'error';
  controller.render();
  assert.match(statusRight.textContent, /^DB 저장 오류 · Status Project/);

  state.autosaveStatus = 'fallback';
  controller.render();
  assert.match(statusRight.textContent, /^비상 저장소 사용 · Status Project/);

  /* 런타임 오류 건수는 저장 상태보다 앞에, 새로고침 전까지 남는다 */
  state.runtimeErrors = { count: 2, last: 'render broke', at: 1 };
  state.dirty = true;
  controller.render();
  assert.match(statusRight.textContent, /^⚠ 오류 2건 · ● 파일 저장 필요 · 비상 저장소 사용 · Status Project/);
  state.runtimeErrors = { count: 0, last: '', at: 0 };
  state.dirty = false;
  controller.render();
  assert.doesNotMatch(statusRight.textContent, /⚠/, '0건이면 표시하지 않습니다');
  delete state.runtimeErrors;

  state.autosaveStatus = 'idle';
  state.autosaveBackend = 'sqlite';
  state.lastAutosavedAt = '2026-08-21T01:02:03.000Z';
  const savedAt = new Date(state.lastAutosavedAt).toLocaleTimeString('ko-KR', {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  });
  controller.render();
  assert.match(statusRight.textContent, new RegExp(`^SQLite 저장 ${savedAt} · Status Project`));

  state.autosaveBackend = 'indexeddb';
  controller.render();
  assert.match(statusRight.textContent, new RegExp(`^DB 자동저장 ${savedAt} · Status Project`));
}

{
  const harness = makeHarness();
  const { controller, diagram, state, statusLeft } = harness;
  const cases = [
    ['informationflow', 'class', 'Information Flow: 정보 송신 주체를 클릭한 뒤 수신 주체를 클릭하세요 · 전달 정보는 생성 후 속성에서 선택 · Esc 취소'],
    ['satisfy', 'class', 'Satisfy: 시작 요소를 클릭한 뒤 Requirement 또는 대상 요소를 클릭하세요 · SysML 방향 규칙을 자동 검사합니다 · Esc 취소'],
    ['comm-forward', 'class', 'Forward Message: 기존 Connector 선을 클릭해 메시지를 추가하세요 · Esc 취소'],
    ['msg-sync', 'class', 'Synchronous Message: 시작 라이프라인 클릭 → 대상 라이프라인 클릭 (같은 라이프라인 = self message) · Esc 취소'],
    ['association', 'class', '연결: 시작 요소를 클릭한 뒤 대상 요소를 클릭(또는 드래그)하세요 · Esc 취소'],
    ['region', 'class', 'Composite State 내부를 클릭해 Region 추가 · 여러 Region은 직교(동시) 영역으로 표시됩니다'],
    ['connectionpointref', 'class', 'Submachine State의 테두리를 클릭해 Connection Point Reference 추가 · 생성 후 드래그로 테두리를 따라 이동'],
    ['part', 'ibd', 'IBD Frame 또는 Part/Reference 내부를 클릭해 Part 추가'],
    ['collaborationuse', 'class', 'Class 또는 Collaboration 내부를 클릭해 Collaboration Use 추가'],
    ['reference', 'parametric', 'Parametric Frame 내부를 클릭해 Reference Property 추가'],
    ['value', 'ibd', 'IBD Frame 또는 Part/Reference 내부를 클릭해 Value 추가'],
    ['constraintproperty', 'parametric', 'Parametric Frame 내부를 클릭해 Constraint Property 추가'],
    ['constraintparameter', 'parametric', 'Parametric Frame 또는 Constraint Property의 테두리를 클릭해 Constraint Parameter 추가'],
    ['port', 'bdd', 'Block, Interface Block 또는 Constraint Block의 테두리를 클릭해 Port 추가 · 생성 후 드래그로 테두리를 따라 이동'],
    ['port', 'ibd', 'IBD Frame, Part 또는 Reference의 테두리를 클릭해 Port 추가 · 생성 후 드래그로 테두리를 따라 이동'],
    ['port', 'class', 'Class, Collaboration 또는 Part의 테두리를 클릭해 Port 추가 · 생성 후 드래그로 테두리를 따라 이동'],
    ['inputpin', 'class', 'Action 또는 Signal/Time Event Action의 테두리를 클릭해 Input Pin 추가 · 생성 후 드래그로 테두리를 따라 이동'],
    ['expansioninput', 'class', 'Expansion Region의 테두리를 클릭해 Expansion Input 추가 · 생성 후 드래그로 테두리를 따라 이동'],
    ['timingstate', 'class', 'Timing Lifeline 내부를 클릭해 State / Condition 행 추가'],
    ['timesegment', 'class', 'State / Condition 행을 클릭해 Time Segment 추가 · 생성 후 좌우 이동과 기간 조절 가능'],
    ['timeconstraint', 'class', 'Time Segment 또는 Timing Message를 클릭해 Time Constraint 부착'],
    ['timetick', 'class', '시간축 위치를 클릭해 Time Tick 추가'],
    ['class', 'class', '캔버스를 클릭해 Class 생성'],
  ];
  for (const [tool, diagramType, expected] of cases) {
    state.tool = tool;
    diagram.type = diagramType;
    controller.render();
    assert.equal(statusLeft.textContent, expected, `${tool}/${diagramType} 안내가 달라졌습니다`);
  }
}

{
  const {
    clearedTimers,
    controller,
    state,
    statusLeft,
    timers,
  } = makeHarness();

  controller.flash('첫 번째 알림');
  assert.equal(statusLeft.textContent, '첫 번째 알림');
  assert.equal(timers.get(1).delay, FLASH_DURATION_MS);

  controller.flash('두 번째 알림');
  assert.deepEqual(clearedTimers, [1]);
  assert.equal(timers.has(1), false, '이전 알림 타이머는 제거해야 합니다');
  assert.equal(statusLeft.textContent, '두 번째 알림');
  timers.get(2).callback();
  assert.equal(
    statusLeft.textContent,
    '선택 후 Enter 편집 · Ctrl/Cmd+Enter 멤버 추가 · Ctrl/Cmd+Shift+Enter 연산 추가 · Del 삭제',
  );

  state.tool = 'class';
  controller.flash('취소할 알림');
  controller.clearFlash();
  assert.deepEqual(clearedTimers, [1, 3]);
  assert.equal(statusLeft.textContent, '캔버스를 클릭해 Class 생성');
  controller.clearFlash();
  assert.deepEqual(clearedTimers, [1, 3], '대기 중인 타이머가 없으면 취소하지 않아야 합니다');
}

console.log('status bar tests: ok');
