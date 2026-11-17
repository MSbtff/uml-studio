'use strict';

const assert = require('node:assert/strict');
const {
  REQUIRED_FUNCTIONS,
  REQUIRED_VALUES,
  create,
} = require('../dist/browser/editor/model-explorer.js');
const { parseColumn } = require('../dist/browser/model/erd-column.js');

let focused = null;

function fakeNode(tagName = 'div') {
  const listeners = new Map();
  let text = '';
  const node = {
    tagName: tagName.toUpperCase(),
    children: [],
    className: '',
    dataset: {},
    style: {},
    attributes: {},
    value: '',
    selected: 0,
    setAttribute(name, value) { this.attributes[name] = String(value); },
    removeAttribute(name) { delete this.attributes[name]; },
    getAttribute(name) { return name in this.attributes ? this.attributes[name] : null; },
    appendChild(child) { this.children.push(child); return child; },
    append(...children) { this.children.push(...children); },
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
    focus() { focused = node; },
    select() { this.selected += 1; },
    get textContent() { return text; },
    set textContent(value) {
      text = String(value);
      if (value === '') this.children = [];
    },
  };
  return node;
}

assert.ok(Object.isFrozen(REQUIRED_FUNCTIONS));
assert.ok(Object.isFrozen(REQUIRED_VALUES));
assert.throws(() => create(), /Model Explorer 의존성이 없습니다/);
assert.throws(() => create({}), /Model Explorer 의존성이 없습니다/);

const explorer = fakeNode();
const searchInput = fakeNode('input');
const document = {
  createElement: tagName => fakeNode(tagName),
  createTextNode: value => ({ tagName: '#TEXT', textContent: String(value) }),
  get activeElement() { return focused; },
};
const state = {
  activeId: 'diagram-1',
  selection: ['class-1'],
  tool: 'select',
  diagrams: [
    {
      id: 'diagram-1', type: 'class', name: 'Class Diagram',
      elements: [
        { id: 'class-1', modelId: 'model-1', kind: 'class', name: 'Customer' },
        { id: 'segment-1', modelId: 'model-2', kind: 'timesegment', name: '', parentId: 'class-1' },
      ],
      relations: [
        { id: 'relation-1', modelId: 'model-3', kind: 'association', from: 'class-1', to: 'missing' },
      ],
    },
    {
      id: 'diagram-2', type: 'erd', name: 'ER Diagram',
      elements: [{ id: 'entity-1', modelId: 'model-4', kind: 'entity', name: 'TB_ORDER' }],
      relations: [],
    },
  ],
  models: {
    'model-4': {
      id: 'model-4', kind: 'entity', name: 'TB_ORDER', logicalName: '주문',
      columns: ['PK order_id <주문번호>: INTEGER'],
    },
  },
};

let clearLinkingCalls = 0;
let renderAllCalls = 0;
let renderCanvasCalls = 0;
let renderPropsCalls = 0;
const switched = [];
const dependencies = {
  ...Object.fromEntries(REQUIRED_FUNCTIONS.map(name => [name, () => undefined])),
  clearLinking: () => { clearLinkingCalls += 1; },
  containmentDepth: element => element.parentId ? 1 : 0,
  containmentOrder: diagram => diagram.elements,
  diagramKindLabel: kind => ({
    class: 'Class', timesegment: 'Time Segment', association: 'Association', entity: 'Entity',
  })[kind] || kind,
  parseColumn,
  renderAll: () => { renderAllCalls += 1; },
  renderCanvas: () => { renderCanvasCalls += 1; },
  renderProps: () => { renderPropsCalls += 1; },
  setSelection: ids => { state.selection = ids; },
  switchDiagram: id => { switched.push(id); },
  document,
  explorer,
  searchInput,
  state,
  DIAGRAM_META: {
    class: { color: '#111', code: 'CL' },
    erd: { color: '#222', code: 'ER' },
  },
  KIND_META: {
    class: { color: '#111', icon: 'C', label: 'Class' },
    timesegment: { color: '#333', icon: 'T', label: 'Time Segment' },
    association: { color: '#444', icon: 'A', label: 'Association' },
    entity: { color: '#555', icon: 'E', label: 'Entity' },
  },
};

const controller = create(dependencies);
assert.ok(Object.isFrozen(controller));
controller.attach();
controller.attach();
assert.equal(searchInput.listenerCount('input'), 1, '검색 리스너는 중복 등록하면 안 됩니다');

controller.render();
assert.equal(explorer.children.length, 5, '비검색 상태에서는 모든 루트와 활성 다이어그램 항목을 표시해야 합니다');
const activeItem = explorer.children.find(node => node.dataset.viewId === 'class-1');
assert.match(activeItem.className, /selected/);
activeItem.emit('click');
assert.deepEqual(state.selection, ['class-1']);
assert.equal(renderCanvasCalls, 1);
assert.equal(renderPropsCalls, 1);

const inactiveRoot = explorer.children.find(node => node.className === 'ex-item root'
  && node.children.some(child => child.textContent === 'ER Diagram'));
inactiveRoot.emit('click');
assert.deepEqual(switched, ['diagram-2']);

/* ── 트리 의미와 키보드 이동 ──────────────────────────────── */
function treeKey(key) {
  let prevented = 0;
  let stopped = 0;
  return {
    key,
    ctrlKey: false, metaKey: false, altKey: false,
    preventDefault: () => { prevented += 1; },
    stopPropagation: () => { stopped += 1; },
    prevented: () => prevented,
    stopped: () => stopped,
  };
}

assert.equal(explorer.attributes.role, 'tree');
assert.equal(explorer.attributes['aria-label'], '모델 탐색기');
const [classRoot, classItem, segmentItem, relationItem, erdRoot] = explorer.children;
assert.equal(classRoot.attributes.role, 'treeitem');
assert.equal(classRoot.attributes['aria-level'], '1');
assert.equal(classRoot.attributes['aria-posinset'], '1');
assert.equal(classRoot.attributes['aria-setsize'], '2');
assert.equal(classRoot.attributes['aria-expanded'], 'true', '활성 다이어그램 루트는 펼쳐진 상태입니다');
assert.equal(erdRoot.attributes['aria-expanded'], 'false', '비활성 다이어그램 루트는 접힌 상태입니다');
assert.equal(erdRoot.attributes['aria-posinset'], '2');
assert.equal(classItem.attributes['aria-level'], '2');
assert.equal(classItem.attributes['aria-selected'], 'true');
assert.equal(classItem.attributes['aria-expanded'], 'true', '자식이 있는 항목은 펼쳐진 상태여야 합니다');
assert.equal(classItem.attributes['aria-posinset'], '1');
assert.equal(classItem.attributes['aria-setsize'], '2');
assert.equal(segmentItem.attributes['aria-level'], '3', '중첩 요소는 한 단계 깊어야 합니다');
assert.equal(segmentItem.attributes['aria-setsize'], '1');
assert.equal(segmentItem.attributes['aria-expanded'], undefined);
assert.equal(segmentItem.attributes['aria-selected'], 'false');
assert.equal(relationItem.attributes['aria-level'], '2');
assert.equal(relationItem.attributes['aria-posinset'], '2');
assert.equal(classItem.tabIndex, 0, '선택된 항목이 트리의 유일한 탭 정지점이어야 합니다');
assert.equal(classRoot.tabIndex, -1);

let event = treeKey('ArrowDown');
classItem.emit('keydown', event);
assert.equal(focused, segmentItem);
assert.equal(segmentItem.tabIndex, 0);
assert.equal(classItem.tabIndex, -1);
assert.equal(event.prevented(), 1);

segmentItem.emit('keydown', treeKey('ArrowLeft'));
assert.equal(focused, classItem, '왼쪽 방향키는 상위 항목으로 이동해야 합니다');
classItem.emit('keydown', treeKey('ArrowLeft'));
assert.equal(focused, classRoot);
classRoot.emit('keydown', treeKey('ArrowRight'));
assert.equal(focused, classItem, '펼쳐진 노드에서 오른쪽 방향키는 첫 자식으로 들어가야 합니다');
classItem.emit('keydown', treeKey('End'));
assert.equal(focused, erdRoot);
erdRoot.emit('keydown', treeKey('ArrowUp'));
assert.equal(focused, relationItem);
relationItem.emit('keydown', treeKey('Home'));
assert.equal(focused, classRoot);
classRoot.emit('keydown', treeKey('e'));
assert.equal(focused, erdRoot, '첫 글자 입력으로 항목을 찾아야 합니다');

const switchedBefore = switched.length;
erdRoot.emit('keydown', treeKey('ArrowRight'));
assert.equal(switched.length, switchedBefore + 1, '접힌 루트에서 오른쪽 방향키는 다이어그램을 펼쳐야 합니다');
assert.equal(switched.at(-1), 'diagram-2');

const canvasBefore = renderCanvasCalls;
classItem.emit('keydown', treeKey('Enter'));
assert.equal(renderCanvasCalls, canvasBefore + 1, 'Enter는 항목을 활성화해야 합니다');

searchInput.emit('keydown', treeKey('ArrowDown'));
assert.equal(focused, classRoot, '검색창에서 아래 방향키로 트리에 진입해야 합니다');

relationItem.focus();
relationItem.emit('keydown', treeKey('ArrowUp'));
assert.equal(focused, segmentItem);
controller.render();
const restored = explorer.children.find(node => node.dataset.rowKey === 'view:segment-1');
assert.equal(focused, restored, '다시 그린 뒤에도 같은 노드에 포커스를 유지해야 합니다');
assert.equal(restored.tabIndex, 0);


searchInput.value = 'order';
searchInput.emit('input');
assert.equal(explorer.children.length, 2, '검색 시 일치하는 다이어그램 루트와 항목만 표시해야 합니다');
const inactiveItem = explorer.children.find(node => node.dataset.viewId === 'entity-1');
inactiveItem.emit('click');
assert.equal(state.activeId, 'diagram-2');
assert.equal(state.tool, 'select');
assert.deepEqual(state.selection, ['entity-1']);
assert.equal(clearLinkingCalls, 1);
assert.equal(renderAllCalls, 1);

searchInput.value = '주문번호';
searchInput.emit('input');
const logicalColumnMatch = explorer.children.find(node => node.dataset.viewId === 'entity-1');
assert.ok(logicalColumnMatch, 'ERD 컬럼 논리명으로 엔터티를 찾아야 합니다');
assert.ok(logicalColumnMatch.children.some(child => String(child.textContent).includes('order_id ↔ 주문번호')),
  '일치한 컬럼의 논리명과 물리명을 검색 결과에 보여줘야 합니다');

searchInput.value = 'not-found';
searchInput.emit('input');
assert.equal(explorer.children.length, 1);
assert.equal(explorer.children[0].className, 'explorer-empty');
assert.equal(explorer.children[0].textContent, '검색 결과가 없습니다.');
assert.equal(explorer.attributes.role, undefined, '항목이 없으면 tree 역할을 남겨두면 안 됩니다');

controller.focus();
assert.equal(focused, searchInput);
assert.equal(searchInput.selected, 1);
controller.detach();
controller.detach();
assert.equal(searchInput.listenerCount('input'), 0);

console.log('model explorer tests: ok');
