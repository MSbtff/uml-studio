'use strict';

const assert = require('node:assert/strict');
const { create, selectionMode } = require('../dist/browser/editor/property-panel.js');
const erdPropertySections = require('../dist/browser/editor/erd-property-sections.js');
const { parseColumn } = require('../dist/browser/model/erd-column.js');
const { normalizeErdChecks, normalizeErdIndexes, safeSqlFragment } = require('../dist/browser/model/erd-schema.js');

let focused = null;
const CONTROL_TAGS = ['INPUT', 'SELECT', 'TEXTAREA', 'BUTTON'];

function fakeNode(tagName = 'div') {
  const listeners = {};
  const node = {
    tagName: tagName.toUpperCase(),
    children: [],
    className: '',
    dataset: {},
    style: {},
    attributes: {},
    textContent: '',
    value: '',
    id: '',
    classList: {
      values: new Set(),
      add(...values) { values.forEach(value => this.values.add(value)); },
      remove(...values) { values.forEach(value => this.values.delete(value)); },
    },
    appendChild(child) { this.children.push(child); return child; },
    append(...children) { this.children.push(...children); },
    setAttribute(name, value) { this.attributes[name] = String(value); },
    addEventListener(type, listener) { (listeners[type] ||= []).push(listener); },
    emit(type, event = {}) { (listeners[type] || []).forEach(listener => listener(event)); },
    focus() { focused = node; },
    contains(target) {
      return target === node || (node.children || []).some(child => child.contains?.(target) === true);
    },
    /* 속성 패널이 쓰는 선택자는 포커스 가능한 컨트롤 하나뿐이다 */
    querySelectorAll(selector) {
      if (!String(selector).includes('input')) return [];
      const walk = current => (current.children || [])
        .flatMap(child => [...(CONTROL_TAGS.includes(child.tagName) ? [child] : []), ...walk(child)]);
      return walk(node);
    },
  };
  Object.defineProperty(node, 'innerHTML', {
    get() { return this._innerHTML || ''; },
    set(value) { this._innerHTML = value; this.children = []; },
  });
  return node;
}

const props = fakeNode('div');
props.id = 'props';
const document = {
  createElement: tagName => fakeNode(tagName),
  createTextNode: value => ({ tagName: '#TEXT', textContent: value }),
  getElementById: id => id === 'props' ? props : null,
  get activeElement() { return focused; },
};

const state = {
  selection: [], selectedId: null, models: {},
  diagrams: [{ id: 'diagram-1', type: 'state', elements: [], relations: [] }],
};
let currentElement = null;
let currentRelation = null;
let snapshotCalls = 0;
let renderCalls = 0;

const noop = () => {};
const dependencies = {
  document,
  state,
  snapshot: () => { snapshotCalls += 1; },
  render: () => { renderCalls += 1; },
  byId: id => [currentElement, ...(state.diagrams[0].elements || [])].find(item => item?.id === id) || null,
  dg: () => state.diagrams[0],
  openErdColumnEditor: noop,
  flashStatus: noop,
  ensureMemberArray: (target, field) => target[field] || (target[field] = []),
  moveErdColumn: noop,
  referencedInteraction: () => null,
  relById: id => currentRelation?.id === id ? currentRelation : null,
  instanceClassifier: () => null,
  isInteractionMsg: kind => String(kind).startsWith('msg-'),
  erdMode: () => 'both',
  parseColumn,
  childViews: () => [],
  syncConstraintParameters: noop,
  unlockBindingRoute: noop,
  bindingRoute: () => null,
  bindingWaypoints: () => [],
  setErdMode: noop,
  pasteErdColumn: noop,
  replaceErdColumns: noop,
  moveErdColumnTo: noop,
  copyErdColumn: noop,
  deleteErdColumn: noop,
  relationEndExpression: () => '',
  parseQuickEditExpression: () => ({ valid: true, name: '' }),
  erdRelationCardinality: () => '1',
  relationEndNavigability: () => 'unspecified',
  relationEndAggregation: () => 'none',
  openRelationEndQuickEdit: noop,
  switchDiagram: noop,
  parseIconScript: () => ({ valid: true, commands: [], width: 100, height: 100 }),
  descendantViews: () => [],
  constraintPropertyEquations: () => [],
  defaultValueUnitCompatibility: () => ({ status: 'compatible', message: 'compatible' }),
  normalizeErdChecks,
  normalizeErdIndexes,
  safeSqlFragment,
  diagramKindLabel: kind => dependencies.KIND_META[kind]?.label || kind,
  bindingTypeCompatibility: () => ({ status: 'compatible', message: 'compatible' }),
  lockBindingRoute: noop,
  bindingConnectorStackInfo: () => ({ index: 0, total: 1 }),
  reorderBindingConnector: noop,
  addBindingWaypoint: noop,
  isCommMsg: () => false,
  relationSupportsEndQuickEdit: relation => ['erd-11', 'erd-1n', 'erd-nm'].includes(relation?.kind),
  getErdColumnClipboard: () => null,
  erdPropertySections,
  KIND_META: {
    initial: { label: 'Initial Node' },
    state: { label: 'State' },
    entity: { label: 'Entity' },
  },
  PACKAGE_CONTAINER_KINDS: new Set(),
  ACTIVITY_PIN_KINDS: new Set(),
  AUTO_LABEL: {},
  INFORMATION_FLOW_CONVEYED_KINDS: new Set(),
  ERD_VIEW_MODES: [['logical', '논리'], ['physical', '물리'], ['both', '둘 다']],
  ER_RELATION_KINDS: new Set(['erd-11', 'erd-1n', 'erd-nm']),
  VISIBILITY_VALUE: {},
  ERD_CARDINALITY_OPTIONS: [['1', '1']],
  ERD_REFERENTIAL_ACTION_OPTIONS: [
    ['', '(DB 기본값 · NO ACTION)'], ['CASCADE', 'CASCADE'], ['RESTRICT', 'RESTRICT'],
  ],
  ASSOCIATION_QUALIFIER_KINDS: new Set(),
  REQUIREMENT_TYPES: ['requirement'],
  BDD_CLASSIFIER_KINDS: new Set(),
  ACTIVITY_CONTAINER_KINDS: new Set(),
  INSTANCE_KINDS: new Set(),
  INSTANCE_CLASSIFIER_KINDS: {},
  REQUIREMENT_RELATION_KINDS: new Set(),
};

assert.equal(selectionMode({ selection: [], selectedId: null }), 'empty');
assert.equal(selectionMode({ selection: ['a'], selectedId: 'a' }), 'selected');
assert.equal(selectionMode({ selection: ['a', 'b'], selectedId: null }), 'multiple');
assert.throws(() => create({}), /속성 패널 의존성이 없습니다/);

const panel = create(dependencies);
assert.ok(Object.isFrozen(panel));
assert.equal(typeof panel.renderElementProperties, 'function');
assert.equal(typeof panel.renderRelationProperties, 'function');

panel.render();
assert.match(props.innerHTML, /선택된 요소가 없습니다/);

state.selection = ['a', 'b'];
panel.render();
assert.match(props.innerHTML, /요소 2개 선택됨/);

currentElement = { id: 'element-1', modelId: 'model-1', kind: 'initial', name: 'Start' };
state.diagrams[0].elements = [currentElement];
state.selection = ['element-1'];
state.selectedId = 'element-1';
panel.render();
assert.equal(props.children[0].textContent, 'Initial Node');
const nameRow = props.children.find(child => child.className === 'prop-row');
const [nameLabel, nameInput] = nameRow.children;
assert.ok(nameInput.id.startsWith('uml-property-field-'));
assert.equal(nameLabel.htmlFor, nameInput.id, '라벨은 입력 컨트롤과 명시적으로 연결되어야 합니다');
nameInput.emit('focus');
nameInput.value = 'Begin';
nameInput.emit('input');
assert.equal(currentElement.name, 'Begin');
assert.equal(snapshotCalls, 1);
assert.equal(renderCalls, 1);

currentRelation = {
  id: 'relation-1', modelId: 'relation-model-1', kind: 'transition',
  from: 'element-1', to: 'element-2', name: 'advance', trigger: 'go', guard: 'ready', effect: 'run()',
};
state.diagrams[0].elements.push({ id: 'element-2', name: 'Done' });
state.diagrams[0].relations = [currentRelation];
state.selection = ['relation-1'];
state.selectedId = 'relation-1';
panel.render();
assert.match(props.children[0].textContent, /transition/);
assert.deepEqual(
  props.children.filter(child => child.className === 'prop-row')
    .map(row => row.children[0].textContent).slice(0, 4),
  ['Name (model)', 'Trigger (event)', 'Guard', 'Effect'],
);

currentElement = {
  id: 'post', modelId: 'post-model', kind: 'entity', name: 'posts',
  columns: ['PK id: BIGINT', 'FK NN user_id <작성자>: BIGINT'],
};
const user = {
  id: 'user', modelId: 'user-model', kind: 'entity', name: 'users',
  columns: ['PK id <사용자 번호>: BIGINT'],
};
currentRelation = {
  id: 'writes', modelId: 'writes-model', kind: 'erd-1n', from: 'post', to: 'user',
  name: '작성자', sourceLabel: '0..N', targetLabel: '1',
  foreignKeyEnd: '', sourceColumnName: '', targetColumnName: '',
};
state.diagrams[0].type = 'erd';
state.diagrams[0].elements = [currentElement, user];
state.diagrams[0].relations = [currentRelation];
state.selection = ['writes'];
state.selectedId = 'writes';
panel.render();
/* 속성 패널은 이제 관계 끝점을 자체 그룹으로 감싸므로 깊이로 찾지 않는다 */
function descendants(node) {
  return (node.children || []).flatMap(child => [child, ...descendants(child)]);
}
const controlsByClass = className =>
  descendants(props).filter(child => child.className === className);
const controlByClass = className => controlsByClass(className)[0];
let ownerSelect = controlByClass('erd-foreign-key-owner-select');
assert.ok(ownerSelect, 'ERD 관계에는 FK 보유 엔티티 선택기가 있어야 합니다');
ownerSelect.value = 'source';
ownerSelect.emit('change');
assert.equal(currentRelation.foreignKeyEnd, 'source');
let columnSelects = controlsByClass('erd-relation-column-select');
assert.equal(columnSelects.length, 2);
columnSelects[0].value = 'user_id';
columnSelects[0].emit('change');
columnSelects = controlsByClass('erd-relation-column-select');
columnSelects[1].value = 'id';
columnSelects[1].emit('change');
assert.equal(currentRelation.sourceColumnName, 'user_id');
assert.equal(currentRelation.targetColumnName, 'id');
let onDeleteSelect = controlByClass('erd-foreign-key-on-delete-select');
let onUpdateSelect = controlByClass('erd-foreign-key-on-update-select');
assert.ok(onDeleteSelect && onUpdateSelect, 'FK 관계에는 ON DELETE/ON UPDATE 선택기가 있어야 합니다');
onDeleteSelect.value = 'CASCADE';
onDeleteSelect.emit('change');
onUpdateSelect = controlByClass('erd-foreign-key-on-update-select');
onUpdateSelect.value = 'RESTRICT';
onUpdateSelect.emit('change');
assert.equal(currentRelation.foreignKeyOnDelete, 'CASCADE');
assert.equal(currentRelation.foreignKeyOnUpdate, 'RESTRICT');

state.selection = ['post'];
state.selectedId = 'post';
currentElement.erdChecks = [{ name: 'body_check', expression: "body <> ''", column: '' }];
currentElement.erdIndexes = [{
  kind: 'index', name: 'posts_user_idx', unique: false,
  columns: [{ name: 'user_id', order: '' }], where: '',
}];
currentElement.columns.push('body: TEXT');
panel.render();
const schemaSection = props.children.find(child => child.className === 'erd-schema-property');
assert.ok(schemaSection, 'Entity 속성에는 DDL 제약조건과 인덱스 편집기가 있어야 합니다');
assert.equal(schemaSection.children[0].textContent, 'DDL 제약조건과 인덱스');

/* ── 구획 의미와 포커스 유지 ───────────────────────────────── */
const schemaTitle = schemaSection.children[0];
assert.equal(schemaTitle.attributes.role, 'heading', '구획 제목은 제목으로 노출해야 합니다');
assert.equal(schemaTitle.attributes['aria-level'], '3');
assert.ok(schemaTitle.id, '제목에는 참조할 id가 필요합니다');
assert.equal(schemaSection.attributes.role, 'group');
assert.equal(schemaSection.attributes['aria-labelledby'], schemaTitle.id);

const columnsSection = props.children.find(child => child.className === 'erd-columns-property');
assert.ok(columnsSection, 'Entity 속성에는 컬럼 편집기가 있어야 합니다');
assert.equal(columnsSection.attributes.role, 'group');
const columnList = columnsSection.children.find(child => child.className === 'erd-column-property-list');
assert.equal(columnList.attributes.role, 'list', '반복되는 컬럼 행은 목록으로 노출해야 합니다');
assert.ok(columnList.children.length > 0);
columnList.children.forEach(row => assert.equal(row.attributes.role, 'listitem'));

state.selection = ['writes'];
state.selectedId = 'writes';
panel.render();
const endGroups = descendants(props).filter(child => child.className === 'relation-end-prop-group');
assert.equal(endGroups.length, 2, '관계의 출발·도착 끝점은 각자의 그룹이어야 합니다');
endGroups.forEach(group => {
  assert.equal(group.attributes.role, 'group');
  const title = group.children[0];
  assert.equal(title.className, 'relation-end-prop-title');
  assert.equal(title.attributes.role, 'heading');
  assert.equal(group.attributes['aria-labelledby'], title.id);
});
assert.notEqual(endGroups[0].children[0].id, endGroups[1].children[0].id,
  '같은 라벨이 반복되므로 두 그룹의 이름은 달라야 합니다');
assert.equal(endGroups[0].children[0].dataset.relationEnd, 'source');
assert.equal(endGroups[1].children[0].dataset.relationEnd, 'target');

const controls = props.querySelectorAll('input, select, textarea, button');
assert.ok(controls.length > 3);
const watched = controls[3];
watched.focus();
assert.equal(focused, watched);
panel.render();
assert.notEqual(focused, watched, '패널을 다시 그리면 이전 노드는 사라집니다');
assert.equal(focused, props.querySelectorAll('input, select, textarea, button')[3],
  '다시 그린 뒤에도 같은 자리의 컨트롤로 포커스를 되돌려야 합니다');

focused = watched;
state.selection = ['post'];
state.selectedId = 'post';
panel.render();
assert.equal(focused, watched, '선택이 바뀌면 포커스를 옮기지 않아야 합니다');

console.log('property panel tests: ok');
