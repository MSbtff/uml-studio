'use strict';

const assert = require('node:assert/strict');
const {
  REQUIRED_FUNCTIONS,
  REQUIRED_VALUES,
  create,
} = require('../dist/browser/editor/quick-edit.js');
const {
  copiedColumnValue,
  parseColumn,
  reorderColumns,
  validateColumn,
} = require('../dist/browser/model/erd-column.js');
const erdColumnEditor = require('../dist/browser/editor/erd-column-editor.js');
const relationEndEditor = require('../dist/browser/editor/relation-end-editor.js');
const {
  applyCopiedColumnSchema,
  columnDetailsFor,
  copyColumnSchema,
  deleteColumnSchema,
  disconnectForeignKeyColumnReferences,
  foreignKeyColumnImpacts,
  renameColumnSchema,
  renameForeignKeyColumnReferences,
  safeSqlFragment,
  setColumnDetails,
} = require('../dist/browser/model/erd-schema.js');

assert.ok(Object.isFrozen(REQUIRED_FUNCTIONS));
assert.ok(Object.isFrozen(REQUIRED_VALUES));
assert.throws(() => create(), /dependencies are required/);
assert.throws(() => create({}), /QuickEdit 의존성이 없습니다/);

const statusMessages = [];
const confirmationMessages = [];
const confirmationResult = true;
const state = { selection: [], selectedId: null, zoom: 1, models: {} };

const dependencies = {
  ...Object.fromEntries(REQUIRED_FUNCTIONS.map(name => [name, () => undefined])),
  document: { createElement: () => ({}) },
  state,
  wrap: {},
  erdColumnEditor,
  relationEndEditor,
  ASSOCIATION_QUALIFIER_KINDS: new Set(),
  ERD_CARDINALITY_OPTIONS: [],
  ER_RELATION_KINDS: new Set(),
  FONT13B: '600 13px sans-serif',
  LINE_H: 15,
  PACKAGE_CONTAINER_KINDS: new Set(),
  PAD: 7,
  VISIBILITY_SYMBOL: {},
  VISIBILITY_VALUE: {},
  ensureMemberArray: (target, field) => target[field] || (target[field] = []),
  copiedColumnValue,
  applyCopiedColumnSchema,
  columnDetailsFor,
  copyColumnSchema,
  deleteColumnSchema,
  disconnectForeignKeyColumnReferences,
  foreignKeyColumnImpacts,
  renameColumnSchema,
  renameForeignKeyColumnReferences,
  safeSqlFragment,
  setColumnDetails,
  parseColumn,
  reorderColumns,
  validateColumn,
  flashStatus: message => { statusMessages.push(message); },
  confirmAction: message => { confirmationMessages.push(message); return confirmationResult; },
};

assert.deepEqual(
  REQUIRED_VALUES.filter(name => dependencies[name] == null),
  [],
  '모든 필수 값 의존성을 테스트 픽스처가 제공해야 합니다',
);

const quickEdit = create(dependencies);
assert.ok(Object.isFrozen(quickEdit));
assert.equal(quickEdit.openSelectedQuickEdit(), false);
assert.equal(quickEdit.openSelectedMemberQuickEdit(), false);

const erdColumnEditorModule = require('../dist/browser/editor/erd-column-editor.js');
[
  'copyErdColumn', 'deleteErdColumn', 'getErdColumnClipboard', 'moveErdColumn',
  'moveErdColumnTo', 'openErdColumnEditor', 'pasteErdColumn', 'replaceErdColumns',
].forEach(name => {
  assert.equal(typeof quickEdit[name], 'function', `QuickEdit는 ${name}을(를) 계속 내보내야 합니다`);
});
assert.equal(quickEdit.getErdColumnClipboard(), null);
[erdColumnEditorModule, relationEndEditor].forEach(child => {
  assert.ok(child.REQUIRED_FUNCTIONS.includes('closeOtherQuickEditors'),
    '각 편집기는 나머지 QuickEdit 편집기를 닫는 콜백을 받아야 합니다');
  assert.ok(child.REQUIRED_FUNCTIONS.includes('selectQuickEditTarget'));
});
assert.equal(typeof quickEdit.openRelationEndQuickEdit, 'function',
  'QuickEdit는 관계 끝점 편집기를 계속 내보내야 합니다');

console.log('quick edit tests: ok');
