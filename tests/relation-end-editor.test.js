'use strict';

const assert = require('node:assert/strict');
const { create, REQUIRED_FUNCTIONS, REQUIRED_VALUES } = require('../dist/browser/editor/relation-end-editor.js');
const { parse: parseQuickEditExpression } = require('../dist/browser/model/expression-parser.js');
const {
  relationEndAggregation,
  relationEndNavigability,
  relationEndMultiplicity,
  relationEndExpression,
  validRelationEndMultiplicity,
  ASSOCIATION_QUALIFIER_KINDS,
  ER_RELATION_KINDS,
  VISIBILITY_VALUE,
} = require('../dist/browser/model/relation-end.js');
const {
  ERD_CARDINALITY_OPTIONS,
  erdDefaultCardinality,
  normalizeErdCardinality,
} = require('../dist/browser/model/erd-cardinality.js');

const erdRelationCardinality = (relation, end) => normalizeErdCardinality(
  relation[end === 'source' ? 'sourceLabel' : 'targetLabel'],
  erdDefaultCardinality(relation.kind, end),
);

let focused = null;

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
    isConnected: false,
    offsetWidth: 260,
    offsetHeight: 220,
    appendChild(child) {
      this.children.push(child); child.isConnected = true;
      if (this.tagName === 'SELECT' && child.tagName === 'OPTION') {
        if (child.selected || this.children.length === 1) this.value = child.value;
      }
      return child;
    },
    append(...items) { items.forEach(item => this.appendChild(item)); },
    remove() { this.isConnected = false; },
    setAttribute(name, value) { this.attributes[name] = String(value); },
    getAttribute(name) { return name in this.attributes ? this.attributes[name] : null; },
    addEventListener(type, listener) { (listeners[type] ||= []).push(listener); },
    removeEventListener() {},
    emit(type, event = {}) { (listeners[type] || []).forEach(listener => listener(event)); },
    focus() { focused = node; },
    select() {},
    setCustomValidity(message) { this.validationMessage = message; },
    reportValidity() { this.reported = true; },
    contains(target) {
      return target === node || this.children.some(child => child.contains?.(target) === true);
    },
  };
  return node;
}

const documentListeners = {};
const document = {
  createElement: tagName => fakeNode(tagName),
  addEventListener(type, listener) { (documentListeners[type] ||= []).push(listener); },
  removeEventListener(type, listener) {
    documentListeners[type] = (documentListeners[type] || []).filter(item => item !== listener);
  },
};

const descendants = node => (node.children || [])
  .flatMap(child => [child, ...descendants(child)]);
const named = (node, name) => descendants(node).find(child => child.name === name);
const byClass = (node, className) =>
  descendants(node).find(child => child.className === className);
const buttonLabelled = (node, text) =>
  descendants(node).find(child => child.tagName === 'BUTTON' && child.textContent === text);

const wrap = { ...fakeNode('div'), scrollLeft: 0, scrollTop: 0, clientWidth: 1000, clientHeight: 700 };
const state = { selection: [], selectedId: null, zoom: 1, models: {} };
const elements = {
  a: { id: 'a', name: 'Order' },
  b: { id: 'b', name: 'Customer' },
};

let snapshotCalls = 0;
let closeOtherCalls = 0;
let fieldSequence = 0;
const selectedTargets = [];
const statusMessages = [];
const frames = [];
const timeouts = [];
const flushDeferred = () => {
  timeouts.splice(0).forEach(callback => callback());
  frames.splice(0).forEach(callback => callback());
};

const dependencies = {
  byId: id => elements[id] || null,
  closeOtherQuickEditors: () => { closeOtherCalls += 1; },
  erdRelationCardinality,
  flashStatus: message => { statusMessages.push(message); },
  nextFieldSequence: () => ++fieldSequence,
  parseQuickEditExpression,
  relEndpoints: () => ({ p1: { x: 10, y: 20 }, p2: { x: 90, y: 60 } }),
  relationEndAggregation,
  relationEndExpression,
  relationEndMultiplicity,
  relationEndNavigability,
  relationSupportsEndQuickEdit: relation =>
    ['association', 'aggregation', 'erd-1n'].includes(relation?.kind),
  render: () => {},
  renderProps: () => {},
  requestAnimationFrame: callback => { frames.push(callback); },
  selectQuickEditTarget: id => { selectedTargets.push(id); },
  setTimeout: callback => { timeouts.push(callback); return timeouts.length; },
  snapshot: () => { snapshotCalls += 1; },
  validRelationEndMultiplicity,
  document,
  state,
  wrap,
  ASSOCIATION_QUALIFIER_KINDS,
  ERD_CARDINALITY_OPTIONS,
  ER_RELATION_KINDS,
  VISIBILITY_VALUE,
};

assert.ok(Object.isFrozen(REQUIRED_FUNCTIONS) && Object.isFrozen(REQUIRED_VALUES));
assert.throws(() => create(), /관계 끝점 편집기 의존성이 없습니다/);
assert.throws(() => create({ ...dependencies, document: {} }), /document\.createElement/);
assert.throws(() => create({ ...dependencies, closeOtherQuickEditors: undefined }),
  /closeOtherQuickEditors/);

const editorApi = create(dependencies);
assert.ok(Object.isFrozen(editorApi));
assert.deepEqual(Object.keys(editorApi).sort(),
  ['closeRelationEndEditor', 'openRelationEndQuickEdit']);

assert.equal(editorApi.openRelationEndQuickEdit({ id: 'x', kind: 'transition' }, 'source'), false);
assert.equal(closeOtherCalls, 0);

const association = { id: 'rel-1', kind: 'association', from: 'a', to: 'b' };
assert.equal(editorApi.openRelationEndQuickEdit(association, 'target'), true);
flushDeferred();
assert.deepEqual(selectedTargets.at(-1), 'rel-1');
assert.equal(closeOtherCalls, 1, '다른 QuickEdit 편집기를 먼저 닫아야 합니다');
const sheet = wrap.children.at(-1);
assert.equal(sheet.className, 'relation-end-editor');
assert.equal(sheet.dataset.quickEdit, 'relation-end');
assert.equal(sheet.dataset.end, 'target');
assert.equal(sheet.attributes.role, 'dialog');
const sheetTitle = sheet.children[0];
assert.equal(sheet.attributes['aria-labelledby'], sheetTitle.id,
  '대화상자는 보이는 제목으로 이름을 받아야 합니다');
assert.equal(sheetTitle.textContent, 'Target End · Customer');

const expressionField = named(sheet, 'expression');
assert.equal(focused, expressionField, '열자마자 이름 표현식에 포커스합니다');
const caption = descendants(sheet).find(child => child.id === expressionField.attributes['aria-labelledby']);
assert.equal(caption.textContent, 'Name Expression');
const hint = descendants(sheet).find(child => child.id === expressionField.attributes['aria-describedby']);
assert.equal(hint.textContent, '예: «role» + owner');
assert.ok(named(sheet, 'navigability'), 'UML 끝점에는 탐색 가능성 선택기가 있습니다');
assert.ok(named(sheet, 'aggregation'));
assert.ok(named(sheet, 'qualifiers'), 'association은 한정자를 편집할 수 있습니다');

const errorBox = byClass(sheet, 'relation-end-editor-error');
assert.equal(errorBox.attributes['aria-live'], 'polite');
named(sheet, 'multiplicity').value = '1..좋아요';
buttonLabelled(sheet, 'Apply').emit('click');
assert.match(errorBox.textContent, /Multiplicity는 1, \*, 0\.\.1, 0\.\.\* 형식으로 입력하세요\./);
assert.equal(snapshotCalls, 0, '거절된 적용은 Undo 스냅샷을 만들지 않습니다');
assert.equal(sheet.isConnected, true);
assert.equal(focused, named(sheet, 'multiplicity'));

sheet.emit('input', { target: named(sheet, 'multiplicity') });
assert.equal(errorBox.textContent, '');
assert.equal(named(sheet, 'multiplicity').validationMessage, '');

expressionField.value = '+';
named(sheet, 'multiplicity').value = '0..*';
buttonLabelled(sheet, 'Apply').emit('click');
assert.equal(snapshotCalls, 0);
assert.equal(expressionField.validationMessage, '이름을 입력하세요.',
  '이름 표현식 오류는 컨트롤에 그대로 붙습니다');
assert.equal(focused, expressionField);

sheet.emit('input', { target: expressionField });
expressionField.value = '«role» - owner';
named(sheet, 'navigability').value = 'navigable';
named(sheet, 'aggregation').value = 'shared';
named(sheet, 'qualifiers').value = ' key \n\n  region ';
buttonLabelled(sheet, 'Apply').emit('click');
assert.equal(snapshotCalls, 1);
assert.equal(association.targetEndName, 'owner');
assert.equal(association.targetEndStereotype, 'role');
assert.equal(association.targetEndVisibility, 'private');
assert.equal(association.targetLabel, '0..*');
assert.equal(association.targetNavigability, 'navigable');
assert.equal(association.targetAggregation, 'shared');
assert.deepEqual(association.targetQualifiers, ['key', 'region'],
  '한정자는 줄 단위로 다듬고 빈 줄은 버립니다');
assert.equal(statusMessages.at(-1), 'Target End를 수정했습니다');
assert.equal(sheet.isConnected, false);

assert.equal(editorApi.openRelationEndQuickEdit(association, 'target'), true);
flushDeferred();
buttonLabelled(wrap.children.at(-1), 'Apply').emit('click');
assert.equal(snapshotCalls, 1, '바뀐 값이 없으면 Undo 스냅샷을 만들지 않습니다');

const erdRelation = { id: 'rel-2', kind: 'erd-1n', from: 'a', to: 'b' };
assert.equal(editorApi.openRelationEndQuickEdit(erdRelation, 'source'), true);
flushDeferred();
const erdSheet = wrap.children.at(-1);
assert.equal(erdSheet.children[0].textContent, '출발 엔티티 · Order');
assert.equal(named(erdSheet, 'multiplicity').tagName, 'SELECT',
  'ER 끝점은 자유 입력이 아니라 카디널리티 선택기를 씁니다');
assert.equal(named(erdSheet, 'navigability'), undefined, 'ER 끝점에는 UML 전용 항목이 없습니다');
assert.equal(named(erdSheet, 'qualifiers'), undefined);
named(erdSheet, 'expression').value = '주문';
named(erdSheet, 'multiplicity').value = '1..N';
buttonLabelled(erdSheet, 'Apply').emit('click');
assert.equal(erdRelation.sourceEndName, '주문');
assert.equal(erdRelation.sourceLabel, '1..N');
assert.equal(erdRelation.sourceEndStereotype, undefined,
  'ER 끝점은 표현식을 파싱하지 않고 이름 그대로 씁니다');

assert.equal(editorApi.openRelationEndQuickEdit(association, 'source'), true);
flushDeferred();
const keySheet = wrap.children.at(-1);
named(keySheet, 'expression').value = 'placer';
named(keySheet, 'multiplicity').value = '1';
keySheet.emit('keydown', {
  key: 'Enter', target: named(keySheet, 'expression'),
  preventDefault() {}, stopPropagation() {},
});
assert.equal(association.sourceEndName, 'placer');
assert.equal(keySheet.isConnected, false);

assert.equal(editorApi.openRelationEndQuickEdit(association, 'source'), true);
flushDeferred();
const escSheet = wrap.children.at(-1);
named(escSheet, 'expression').value = 'discarded';
escSheet.emit('keydown', {
  key: 'Escape', target: named(escSheet, 'expression'),
  preventDefault() {}, stopPropagation() {},
});
assert.equal(association.sourceEndName, 'placer', 'Escape는 아무것도 저장하지 않습니다');
assert.equal(escSheet.isConnected, false);

assert.equal(editorApi.openRelationEndQuickEdit(association, 'source'), true);
flushDeferred();
const areaSheet = wrap.children.at(-1);
named(areaSheet, 'expression').value = 'ignored';
areaSheet.emit('keydown', {
  key: 'Enter', target: named(areaSheet, 'qualifiers'),
  preventDefault() { throw new Error('textarea 줄바꿈을 막으면 안 됩니다'); },
  stopPropagation() {},
});
assert.equal(association.sourceEndName, 'placer');

assert.equal(documentListeners.mousedown.length, 1,
  '닫힌 시트의 바깥 클릭 감시는 정리되어야 합니다');
documentListeners.mousedown[0]({ target: fakeNode('div') });
assert.equal(areaSheet.isConnected, false);
editorApi.closeRelationEndEditor();

console.log('relation end editor tests: ok');
