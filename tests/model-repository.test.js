'use strict';

const assert = require('node:assert/strict');
const { sequenceLifelineTop } = require('../dist/browser/canvas/sequence-layout.js');
const {
  REQUIRED_FUNCTIONS,
  REQUIRED_VALUES,
  DERIVED_VIEW_KINDS,
  VIEW_PRESETS,
  MODAL_ID,
  create,
} = require('../dist/browser/editor/model-repository.js');

/* ── minimal DOM double ────────────────────────────────────── */

class FakeNode {
  constructor(tag) {
    this.tag = tag;
    this.children = [];
    this.listeners = {};
    this.style = {};
    this.parent = null;
    this.disabled = false;
    this.focused = false;
    this.value = '';
    this._text = '';
  }
  get textContent() { return this._text; }
  set textContent(value) { this._text = value; this.children = []; }
  append(...nodes) { nodes.forEach(n => this.appendChild(n)); }
  appendChild(child) { child.parent = this; this.children.push(child); return child; }
  remove() {
    if (!this.parent) return;
    this.parent.children = this.parent.children.filter(n => n !== this);
    this.parent = null;
  }
  addEventListener(type, fn) { (this.listeners[type] = this.listeners[type] || []).push(fn); }
  dispatch(type, ev) { (this.listeners[type] || []).forEach(fn => fn(ev)); }
  click() { this.dispatch('click', { target: this }); }
  focus() { this.focused = true; }
  setAttribute(name, value) { this[name] = String(value); }
  removeAttribute(name) { delete this[name]; }
  getAttribute(name) { return name in this ? String(this[name]) : null; }
  querySelectorAll(className) {
    const hit = [];
    const walk = node => {
      if (node !== this && node.className === className) hit.push(node);
      node.children.forEach(walk);
    };
    walk(this);
    return hit;
  }
}

function fakeDocument() {
  const body = new FakeNode('body');
  return {
    body,
    createElement: tag => new FakeNode(tag),
    getElementById: id => {
      let found = null;
      const walk = node => {
        if (node.id === id) found = found || node;
        node.children.forEach(walk);
      };
      walk(body);
      return found;
    },
  };
}

/* ── harness ───────────────────────────────────────────────── */

const KIND_META = {
  class: { label: 'Class', color: '#eee', icon: 'C' },
  actor: { label: 'Actor', color: '#ddd', icon: 'A' },
  lifeline: { label: 'Lifeline', color: '#ccc', icon: 'L' },
  execution: { label: 'Execution', color: '#bbb', icon: 'E' },
  port: { label: 'Port', color: '#aaa', icon: 'P' },
  timingstate: { label: 'Timing State', color: '#999', icon: 'T' },
  compositestate: { label: 'Composite State', color: '#888', icon: 'S' },
  block: { label: 'Block', color: '#777', icon: 'B' },
  fragment: { label: 'Fragment', color: '#666', icon: 'F' },
  mindnode: { label: 'Mind Node', color: '#555', icon: 'M' },
};
const REL_STYLE = { assoc: {}, transition: {} };

function harness(overrides = {}) {
  const diagram = overrides.diagram || { id: 'd1', type: 'class', elements: [], relations: [] };
  const calls = [];
  const record = name => (...args) => { calls.push({ name, args }); };
  let idSeq = 0;
  const document = fakeDocument();
  const wrap = { scrollLeft: 0, scrollTop: 0, clientWidth: 800, clientHeight: 600, ...overrides.wrap };
  const state = {
    models: overrides.models || {},
    diagrams: overrides.diagrams || [diagram],
    zoom: 1,
    selection: [],
    selectedId: null,
    ...overrides.state,
  };
  const deps = {
    adoptView: view => { calls.push({ name: 'adoptView', args: [view] }); return view; },
    createElement: (kind, x, y) => ({ id: `el${++idSeq}`, kind, x, y, w: 0, h: 0 }),
    diagramAllowsElementKind: overrides.allows || ((type, kind) => kind !== 'actor'),
    dg: () => diagram,
    render: record('render'),
    renderAll: record('renderAll'),
    renderProps: record('renderProps'),
    sequenceLifelineTop,
    setSelection: ids => { calls.push({ name: 'setSelection', args: [ids] }); state.selection = ids; },
    snap: value => Math.round(value / 8) * 8,
    snapshot: record('snapshot'),
    uid: () => `v${++idSeq}`,
    BDD_CLASSIFIER_KINDS: new Set(['block', 'valuetype', 'interfaceblock', 'constraintblock']),
    FILL_DEFAULT: '#fffbd8',
    KIND_META,
    REL_STYLE,
    TIMING_INTERNAL_KINDS: new Set(['timingstate', 'timesegment', 'timetick', 'timeconstraint', 'durationconstraint']),
    document,
    modalFocus: {
      activate({ overlay, initialFocus }) {
        const handle = {
          close() { overlay.remove(); return true; },
          focusInitial(node) { node?.focus?.(); return true; },
          requestClose() { return handle.close(); },
        };
        initialFocus?.focus?.();
        return handle;
      },
      closeOverlay(overlay) { if (!overlay) return false; overlay.remove(); return true; },
    },
    state,
    wrap,
    ...overrides.deps,
  };
  return {
    calls,
    deps,
    diagram,
    document,
    repo: create(deps),
    state,
    wrap,
    named: name => calls.filter(c => c.name === name),
    modal: () => document.getElementById(MODAL_ID),
    rows: () => {
      const modal = document.getElementById(MODAL_ID);
      return modal ? modal.querySelectorAll('model-repository-row') : [];
    },
    search: () => document.getElementById(MODAL_ID).querySelectorAll('model-search')[0],
    list: () => document.getElementById(MODAL_ID).querySelectorAll('model-repository-list')[0],
  };
}

const rowAction = row => row.children[2];
const rowName = row => row.children[1].children[0].textContent;
const rowMeta = row => row.children[1].children[1].textContent;

/* ── module contract ───────────────────────────────────────── */

assert.ok(Object.isFrozen(REQUIRED_FUNCTIONS), 'REQUIRED_FUNCTIONS는 동결해야 합니다');
assert.ok(Object.isFrozen(REQUIRED_VALUES), 'REQUIRED_VALUES는 동결해야 합니다');
assert.ok(Object.isFrozen(DERIVED_VIEW_KINDS), 'DERIVED_VIEW_KINDS는 동결해야 합니다');
assert.ok(Object.isFrozen(VIEW_PRESETS), 'VIEW_PRESETS는 동결해야 합니다');
Object.values(VIEW_PRESETS).forEach(preset =>
  assert.ok(Object.isFrozen(preset), '프리셋은 뷰에 복사되므로 각각 동결해야 합니다'));
assert.ok(Object.isFrozen(harness().repo), '컨트롤러는 동결해야 합니다');

assert.throws(() => create(), /Model Repository 의존성이 없습니다/);
assert.throws(() => create({}), err => {
  REQUIRED_FUNCTIONS.forEach(name => assert.match(err.message, new RegExp(name)));
  REQUIRED_VALUES.forEach(name => assert.match(err.message, new RegExp(name)));
  return true;
});
{
  const { deps } = harness();
  const partial = { ...deps };
  delete partial.adoptView;
  delete partial.wrap;
  assert.throws(() => create(partial), /Model Repository 의존성이 없습니다: adoptView, wrap$/);
  assert.throws(() => create({ ...deps, BDD_CLASSIFIER_KINDS: ['block'] }), /BDD_CLASSIFIER_KINDS\.has/);
  assert.throws(() => create({ ...deps, TIMING_INTERNAL_KINDS: {} }), /TIMING_INTERNAL_KINDS\.has/);
  assert.throws(() => create({ ...deps, document: { body: {}, getElementById: () => null } }), /document\.createElement/);
}

/* ── placement rules ───────────────────────────────────────── */

{
  const h = harness();
  assert.ok(h.repo.canPlaceKind('class'));
  assert.ok(!h.repo.canPlaceKind('actor'), '다이어그램이 허용하지 않는 종류는 배치할 수 없습니다');
  DERIVED_VIEW_KINDS.forEach(kind =>
    assert.ok(!h.repo.canPlaceKind(kind), `${kind}은 부모 요소가 만들므로 직접 배치할 수 없습니다`));
  ['timingstate', 'timesegment', 'timetick', 'timeconstraint', 'durationconstraint'].forEach(kind =>
    assert.ok(!h.repo.canPlaceKind(kind), `${kind}은 Timing 내부 요소입니다`));
}

/* ── createViewForModel ────────────────────────────────────── */

{
  const h = harness({ models: { m1: { id: 'm1', kind: 'class', name: 'Order' } } });
  const view = h.repo.createViewForModel('m1');
  assert.ok(view);
  assert.equal(view.modelId, 'm1');
  assert.deepEqual([view.w, view.h], [0, 0], '기본 크기는 렌더러가 정합니다');
  assert.equal(view.fill, '#fffbd8');
  /* 800/2 - 60 = 340 → snap 8 → 344; 600/2 - 30 = 270 → snap 8 → 272 */
  assert.deepEqual([view.x, view.y], [344, 272]);
  assert.equal(h.named('adoptView').length, 1, '새 뷰는 adoptView를 거쳐야 합니다');
}

{
  /* the centre follows the scroll position and the zoom level */
  const h = harness({
    models: { m1: { id: 'm1', kind: 'class' } },
    wrap: { scrollLeft: 400, scrollTop: 200, clientWidth: 800, clientHeight: 600 },
    state: { zoom: 2 },
  });
  const view = h.repo.createViewForModel('m1');
  /* (400 + 400) / 2 - 60 = 340 → 344; (200 + 300) / 2 - 30 = 220 → 224 */
  assert.deepEqual([view.x, view.y], [344, 224]);
}

{
  /* a view never lands in the negative margin */
  const h = harness({
    models: { m1: { id: 'm1', kind: 'class' } },
    wrap: { scrollLeft: 0, scrollTop: 0, clientWidth: 10, clientHeight: 10 },
  });
  const view = h.repo.createViewForModel('m1');
  assert.deepEqual([view.x, view.y], [8, 8]);
}

{
  /* sequence lifelines always start at the top of the diagram */
  const h = harness({
    diagram: { id: 'd1', type: 'sequence', elements: [], relations: [] },
    models: { m1: { id: 'm1', kind: 'lifeline' } },
  });
  const view = h.repo.createViewForModel('m1');
  assert.equal(view.y, 32);
  assert.equal(view.x, 344, 'x는 여전히 화면 중앙을 따릅니다');
}
{
  /* timing lifelines are full-width lanes instead */
  const h = harness({
    diagram: { id: 'd1', type: 'timing', elements: [], relations: [] },
    models: { m1: { id: 'm1', kind: 'lifeline' } },
  });
  const view = h.repo.createViewForModel('m1');
  assert.deepEqual([view.w, view.h, view.fill], [1000, 132, '#f8eadf']);
  assert.notEqual(view.y, 32, 'Timing에서는 상단 고정이 아닙니다');
}

Object.entries(VIEW_PRESETS).forEach(([kind, preset]) => {
  const h = harness({
    models: { m1: { id: 'm1', kind } },
    allows: () => true,
  });
  const view = h.repo.createViewForModel('m1');
  Object.entries(preset).forEach(([key, value]) =>
    assert.equal(view[key], value, `${kind}의 ${key} 프리셋을 적용해야 합니다`));
  if (preset.fill === undefined) assert.equal(view.fill, '#fffbd8', `${kind}은 기본 채우기를 유지해야 합니다`);
});

['block', 'valuetype', 'interfaceblock', 'constraintblock'].forEach(kind => {
  const h = harness({ models: { m1: { id: 'm1', kind } }, allows: () => true });
  const view = h.repo.createViewForModel('m1');
  assert.deepEqual([view.w, view.h, view.fill], [256, 88, '#edf4f7'], `${kind}은 BDD 분류자 프리셋을 씁니다`);
});

{
  const h = harness({ models: {}, allows: () => true });
  assert.equal(h.repo.createViewForModel('missing'), null, '없는 모델은 뷰를 만들지 않습니다');
}
{
  const h = harness({ models: { m1: { id: 'm1', kind: 'execution' } }, allows: () => true });
  assert.equal(h.repo.createViewForModel('m1'), null, 'Execution은 라이프라인이 소유합니다');
}
{
  const h = harness({ models: { m1: { id: 'm1', kind: 'actor' } } });
  assert.equal(h.repo.createViewForModel('m1'), null);
}
DERIVED_VIEW_KINDS.concat(['timingstate']).forEach(kind => {
  const h = harness({ models: { m1: { id: 'm1', kind } }, allows: () => true });
  assert.equal(h.repo.createViewForModel('m1'), null, `${kind}은 직접 배치할 수 없습니다`);
});

/* ── dialog ────────────────────────────────────────────────── */

{
  const h = harness({
    models: {
      m2: { id: 'm2', kind: 'class', name: 'Zebra' },
      m1: { id: 'm1', kind: 'class', name: 'Apple' },
      rel: { id: 'rel', kind: 'assoc', name: 'uses' },
      exe: { id: 'exe', kind: 'execution', name: 'bar' },
      unknown: { id: 'unknown', kind: 'nosuchkind', name: 'x' },
    },
  });
  const overlay = h.repo.open();
  assert.equal(overlay.id, MODAL_ID);
  assert.equal(overlay.className, 'modal-overlay');
  assert.equal(h.document.body.children.length, 1, '모달은 body에 붙어야 합니다');

  const dialog = overlay.children[0];
  assert.equal(dialog.className, 'model-repository-dialog');
  assert.deepEqual(dialog.children.map(c => c.className),
    ['model-repository-header', 'model-search', 'model-repository-hint', 'model-repository-list']);
  assert.equal(dialog.children[0].children[0].textContent, 'Project Models');
  assert.equal(dialog.children[1].placeholder, '모델 이름 또는 종류 검색');

  const rows = h.rows();
  assert.equal(rows.length, 2, '관계 · Execution · 모르는 종류는 목록에서 빼야 합니다');
  assert.deepEqual(rows.map(rowName), ['Apple', 'Zebra'], '이름 순으로 정렬해야 합니다');
  assert.equal(rowMeta(rows[0]), 'Class · m1 · 0 views');
  assert.equal(h.search().focused, true, '열자마자 검색창에 포커스를 줘야 합니다');
}

{
  /* view counts are summed across every diagram, and singular/plural differ */
  const other = { id: 'd2', type: 'class', elements: [{ id: 'v9', modelId: 'm1' }], relations: [] };
  const h = harness({
    models: { m1: { id: 'm1', kind: 'class', name: 'Order' } },
    diagrams: null,
  });
  h.state.diagrams = [h.diagram, other];
  h.repo.open();
  assert.equal(rowMeta(h.rows()[0]), 'Class · m1 · 1 view');
  other.elements.push({ id: 'v10', modelId: 'm1' });
  h.repo.close();
  h.repo.open();
  assert.equal(rowMeta(h.rows()[0]), 'Class · m1 · 2 views');
}

{
  /* an unnamed model still gets a readable row */
  const h = harness({ models: { m1: { id: 'm1', kind: 'class' } } });
  h.repo.open();
  assert.equal(rowName(h.rows()[0]), '(unnamed)');
}

{
  /* search filters on both the name and the kind label */
  const h = harness({
    models: {
      m1: { id: 'm1', kind: 'class', name: 'Order' },
      m2: { id: 'm2', kind: 'fragment', name: 'Loop' },
    },
    allows: () => true,
  });
  h.repo.open();
  const search = h.search();
  assert.equal(h.rows().length, 2);

  search.value = 'ord';
  search.dispatch('input');
  assert.deepEqual(h.rows().map(rowName), ['Order']);

  search.value = 'FRAGMENT';
  search.dispatch('input');
  assert.deepEqual(h.rows().map(rowName), ['Loop'], '종류 라벨로도 검색되고 대소문자를 가리지 않습니다');

  search.value = '  zzz  ';
  search.dispatch('input');
  assert.equal(h.rows().length, 0);
  assert.equal(h.list().children[0].className, 'model-repository-empty');
  assert.equal(h.list().children[0].textContent, '일치하는 모델이 없습니다.');
  assert.equal(h.list().getAttribute('role'), null,
    'list 역할은 listitem만 담을 수 있으므로 빈 상태에서는 걷어냅니다');
}

{
  /* 목록·행·버튼이 이름으로 구분된다 */
  const h = harness({
    models: {
      m1: { id: 'm1', kind: 'class', name: 'Order' },
      m2: { id: 'm2', kind: 'class', name: 'Customer' },
    },
  });
  h.repo.open();
  const search = h.search();
  assert.equal(search.getAttribute('aria-label'), '모델 이름 또는 종류 검색',
    'placeholder는 접근 가능한 이름이 아니므로 검색창에 이름이 필요합니다');
  assert.equal(h.list().getAttribute('aria-live'), 'polite');
  assert.equal(h.list().getAttribute('role'), 'list');
  assert.equal(h.list().getAttribute('aria-label'), '모델 2개');
  const rows = h.rows();
  assert.deepEqual(rows.map(row => row.getAttribute('role')), ['listitem', 'listitem']);
  rows.forEach(row => {
    const name = row.querySelectorAll('model-repository-info')[0]
      .querySelectorAll('model-repository-name')[0];
    const action = rowAction(row);
    assert.ok(name.id, '행 이름에는 버튼이 가리킬 id가 필요합니다');
    assert.equal(action.getAttribute('aria-labelledby'), `${action.id} ${name.id}`,
      '같은 라벨의 버튼이 반복되므로 보이는 라벨 뒤에 모델 이름을 붙여 읽힙니다');
  });
  assert.equal(rows[0].querySelectorAll('ex-icon')[0].getAttribute('aria-hidden'), 'true',
    '장식용 아이콘 글리프는 읽지 않습니다');
}

{
  /* rows offer Select when the model is already on this diagram */
  const diagram = { id: 'd1', type: 'class', elements: [{ id: 'v1', modelId: 'm1' }], relations: [] };
  const h = harness({ diagram, models: { m1: { id: 'm1', kind: 'class', name: 'Order' } } });
  h.repo.open();
  const action = rowAction(h.rows()[0]);
  assert.equal(action.textContent, 'Select');
  action.click();
  assert.deepEqual(h.named('setSelection')[0].args[0], ['v1']);
  assert.equal(h.modal(), null, '선택 후에는 모달을 닫아야 합니다');
  assert.equal(h.named('render').length, 1);
  assert.equal(h.named('renderProps').length, 1);
  assert.equal(h.named('snapshot').length, 0, '선택은 실행 취소 이력을 남기지 않습니다');
}

{
  /* incompatible kinds are shown but disabled */
  const h = harness({ models: { m1: { id: 'm1', kind: 'actor', name: 'User' } } });
  h.repo.open();
  const action = rowAction(h.rows()[0]);
  assert.equal(action.textContent, 'Not compatible');
  assert.equal(action.disabled, true);
}

{
  /* Add View places the model and selects it */
  const h = harness({ models: { m1: { id: 'm1', kind: 'class', name: 'Order' } } });
  h.repo.open();
  const action = rowAction(h.rows()[0]);
  assert.equal(action.textContent, 'Add View');
  action.click();
  assert.equal(h.named('snapshot').length, 1, '배치는 실행 취소 지점을 남겨야 합니다');
  assert.equal(h.diagram.elements.length, 1);
  assert.equal(h.diagram.elements[0].modelId, 'm1');
  assert.deepEqual(h.named('setSelection')[0].args[0], [h.diagram.elements[0].id]);
  assert.equal(h.modal(), null);
  assert.equal(h.named('renderAll').length, 1);
}

{
  /* a composite state always arrives with its first region */
  const h = harness({
    diagram: { id: 'd1', type: 'state', elements: [], relations: [] },
    models: { m1: { id: 'm1', kind: 'compositestate', name: 'Running' } },
    allows: () => true,
    deps: { adoptView: view => ({ ...view, kind: view.kind || 'compositestate' }) },
  });
  h.repo.open();
  rowAction(h.rows()[0]).click();
  assert.equal(h.diagram.elements.length, 2);
  const [view, region] = h.diagram.elements;
  assert.equal(region.kind, 'region');
  assert.equal(region.parentId, view.id);
  assert.equal(region.regionOrder, 0);
  assert.deepEqual([region.x, region.y], [view.x, view.y]);
}

{
  /* if the view cannot be built the diagram is left untouched */
  const h = harness({
    models: { m1: { id: 'm1', kind: 'class', name: 'Order' } },
    deps: { diagramAllowsElementKind: () => true },
  });
  h.repo.open();
  const action = rowAction(h.rows()[0]);
  h.state.models = {}; // the model disappeared between listing and clicking
  action.click();
  assert.equal(h.diagram.elements.length, 0);
  assert.equal(h.named('renderAll').length, 0);
  assert.ok(h.modal(), '실패했으면 모달을 열어둡니다');
}

{
  /* per-diagram hints */
  const hintOf = type => {
    const h = harness({ diagram: { id: 'd1', type, elements: [], relations: [] } });
    const overlay = h.repo.open();
    return overlay.children[0].children[2].textContent;
  };
  assert.match(hintOf('informationflow'), /정보 흐름의 송신·수신 주체/);
  assert.match(hintOf('requirement'), /충족, 검증, 구체화, 추적/);
  assert.match(hintOf('class'), /이름과 속성이 함께 동기화됩니다/);
}

{
  /* closing: the × button, a click on the backdrop, and reopening */
  const h = harness({ models: { m1: { id: 'm1', kind: 'class', name: 'Order' } } });
  const overlay = h.repo.open();
  const closeButton = overlay.children[0].children[0].children[1];
  assert.equal(closeButton.className, 'modal-close');
  closeButton.click();
  assert.equal(h.modal(), null);

  const second = h.repo.open();
  second.dispatch('mousedown', { target: second });
  assert.equal(h.modal(), null, '배경을 누르면 닫혀야 합니다');

  const third = h.repo.open();
  third.dispatch('mousedown', { target: third.children[0] });
  assert.ok(h.modal(), '대화상자 내부 클릭은 닫지 않아야 합니다');

  h.repo.open();
  assert.equal(h.document.body.children.length, 1, '다시 열면 이전 모달을 대체해야 합니다');
  h.repo.close();
  assert.equal(h.modal(), null);
  assert.doesNotThrow(() => h.repo.close(), 'close는 몇 번 불러도 안전해야 합니다');
}

console.log('model repository tests: ok');
