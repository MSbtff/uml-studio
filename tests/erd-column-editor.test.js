'use strict';

const assert = require('node:assert/strict');
const { create, REQUIRED_FUNCTIONS, REQUIRED_VALUES } = require('../dist/browser/editor/erd-column-editor.js');
const {
  copiedColumnValue,
  parseColumn,
  reorderColumns,
  validateColumn,
} = require('../dist/browser/model/erd-column.js');
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
    offsetWidth: 240,
    offsetHeight: 200,
    appendChild(child) { this.children.push(child); child.isConnected = true; return child; },
    append(...items) { items.forEach(item => this.appendChild(item)); },
    remove() { this.isConnected = false; removedNodes.push(this); },
    setAttribute(name, value) { this.attributes[name] = String(value); },
    getAttribute(name) { return name in this.attributes ? this.attributes[name] : null; },
    addEventListener(type, listener) { (listeners[type] ||= []).push(listener); },
    removeEventListener() {},
    emit(type, event = {}) { (listeners[type] || []).forEach(listener => listener(event)); },
    focus() { focused = node; },
    select() {},
    setCustomValidity(message) { this.validationMessage = message; },
    reportValidity() {},
    matches(selector) { return selector === 'input[type="text"]' && this.type === 'text'; },
    contains(target) {
      return target === node || this.children.some(child => child.contains?.(target) === true);
    },
  };
  return node;
}

const removedNodes = [];
const documentListeners = {};
const document = {
  createElement: tagName => fakeNode(tagName),
  createTextNode: value => ({ tagName: '#TEXT', textContent: value, children: [], contains: () => false }),
  addEventListener(type, listener) { (documentListeners[type] ||= []).push(listener); },
  removeEventListener(type, listener) {
    documentListeners[type] = (documentListeners[type] || []).filter(item => item !== listener);
  },
};

/* 브라우저가 열자마자 실행하는 지연 작업(위치 보정과 바깥 클릭 감시) */
const flushDeferred = () => {
  timeouts.splice(0).forEach(callback => callback());
  frames.splice(0).forEach(callback => callback());
};

const descendants = node => (node.children || [])
  .flatMap(child => [child, ...descendants(child)]);
const inputNamed = (node, name) =>
  descendants(node).find(child => child.name === name);
const buttonLabelled = (node, text) =>
  descendants(node).find(child => child.tagName === 'BUTTON' && child.textContent === text);

const wrap = { ...fakeNode('div'), scrollLeft: 0, scrollTop: 0, clientWidth: 1200, clientHeight: 800 };
const state = { selection: [], selectedId: null, zoom: 1, models: {} };

let snapshotCalls = 0;
let renderCalls = 0;
let renderPropsCalls = 0;
let fieldSequence = 0;
let closeOtherCalls = 0;
const selectedTargets = [];
const statusMessages = [];
const confirmationMessages = [];
let confirmationResult = true;
const frames = [];
const timeouts = [];

const dependencies = {
  applyCopiedColumnSchema,
  closeOtherQuickEditors: () => { closeOtherCalls += 1; },
  columnDetailsFor,
  confirmAction: message => { confirmationMessages.push(message); return confirmationResult; },
  copiedColumnValue,
  copyColumnSchema,
  deleteColumnSchema,
  disconnectForeignKeyColumnReferences,
  ensureMemberArray: (target, field) => target[field] || (target[field] = []),
  flashStatus: message => { statusMessages.push(message); },
  foreignKeyColumnImpacts,
  nextFieldSequence: () => ++fieldSequence,
  parseColumn,
  render: () => { renderCalls += 1; },
  renderProps: () => { renderPropsCalls += 1; },
  renameColumnSchema,
  renameForeignKeyColumnReferences,
  reorderColumns,
  requestAnimationFrame: callback => { frames.push(callback); },
  safeSqlFragment,
  selectQuickEditTarget: id => { selectedTargets.push(id); },
  setColumnDetails,
  setTimeout: callback => { timeouts.push(callback); return timeouts.length; },
  snapshot: () => { snapshotCalls += 1; },
  validateColumn,
  document,
  state,
  wrap,
};

assert.ok(Object.isFrozen(REQUIRED_FUNCTIONS) && Object.isFrozen(REQUIRED_VALUES));
assert.throws(() => create(), /ERD 컬럼 편집기 의존성이 없습니다/);
assert.throws(() => create({ ...dependencies, document: {} }), /document\.createElement/);
assert.throws(() => create({ ...dependencies, selectQuickEditTarget: undefined }),
  /selectQuickEditTarget/);

const editorApi = create(dependencies);
assert.ok(Object.isFrozen(editorApi));
assert.equal(editorApi.getErdColumnClipboard(), null);

/* ── 클립보드와 순서·삭제·일괄 편집 명령 ───────────────────── */
const entity = {
  kind: 'entity',
  modelId: 'model-1',
  columns: ['PK id <식별자>: BIGINT', 'name <이름>: VARCHAR(255)', 'created_at: TIMESTAMP'],
  erdColumnDetails: { created_at: { defaultValue: 'CURRENT_TIMESTAMP' } },
  erdIndexes: [{ kind: 'index', name: 'created_idx', columns: ['created_at'] }],
};
state.models.createdRelation = {
  id: 'createdRelation', kind: 'erd-1n', name: 'created timestamp FK',
  fromModelId: 'model-1', toModelId: 'other-model', foreignKeyEnd: 'source',
  sourceColumnName: 'created_at', targetColumnName: 'id',
  foreignKeyOnDelete: 'CASCADE', foreignKeyOnUpdate: 'RESTRICT',
};

assert.equal(editorApi.copyErdColumn(entity, 0), true);
assert.deepEqual(editorApi.getErdColumnClipboard(), {
  raw: 'PK id <식별자>: BIGINT',
  schema: { sourceColumn: 'id', details: { defaultValue: '', uniqueName: '' }, checks: [] },
  sourceModelId: 'model-1',
  sourceIndex: 0,
});
assert.equal(renderPropsCalls, 1);
assert.match(statusMessages.at(-1), /컬럼 'id'.*복사/);

assert.equal(editorApi.moveErdColumnTo(entity, 0, 2), true);
assert.deepEqual(entity.columns, [
  'name <이름>: VARCHAR(255)',
  'created_at: TIMESTAMP',
  'PK id <식별자>: BIGINT',
]);
assert.equal(snapshotCalls, 1);
assert.equal(renderCalls, 1);
assert.equal(editorApi.moveErdColumn(entity, 2, 1), false, '범위를 벗어난 이동은 거부해야 합니다');

confirmationResult = false;
assert.equal(editorApi.deleteErdColumn(entity, 1), false, 'FK 영향 확인을 취소하면 삭제하지 않아야 합니다');
assert.equal(snapshotCalls, 1, '취소한 삭제는 Undo 스냅샷을 만들면 안 됩니다');
assert.match(confirmationMessages.at(-1), /created timestamp FK[\s\S]*관계선은 유지/);

confirmationResult = true;
assert.equal(editorApi.deleteErdColumn(entity, 1), true);
assert.deepEqual(entity.columns, ['name <이름>: VARCHAR(255)', 'PK id <식별자>: BIGINT']);
assert.equal(entity.erdColumnDetails, undefined);
assert.equal(entity.erdIndexes, undefined);
assert.equal(snapshotCalls, 2);
assert.equal(renderCalls, 2);
assert.match(statusMessages.at(-1), /created_at.*삭제.*FK 연결 1개 해제/);
assert.equal(state.models.createdRelation.foreignKeyEnd, '');
assert.equal(state.models.createdRelation.sourceColumnName, '');
assert.equal(state.models.createdRelation.targetColumnName, '');
assert.equal(state.models.createdRelation.foreignKeyOnDelete, '');

assert.equal(editorApi.deleteErdColumn(entity, 99), false);
assert.equal(snapshotCalls, 2, '실패한 삭제는 Undo 스냅샷을 만들면 안 됩니다');

const bulkEntity = {
  kind: 'entity', modelId: 'bulk-model',
  columns: ['FK user_id: BIGINT', 'name: TEXT'],
  erdChecks: [{ name: 'user_check', expression: 'user_id > 0', column: 'user_id' }],
  erdIndexes: [{ kind: 'index', name: 'user_idx', columns: ['user_id'] }],
};
state.models.bulkRelation = {
  id: 'bulkRelation', kind: 'erd-1n', name: 'bulk FK',
  fromModelId: 'bulk-model', toModelId: 'users', foreignKeyEnd: 'source',
  sourceColumnName: 'user_id', targetColumnName: 'id', foreignKeyOnDelete: 'CASCADE',
};
assert.equal(editorApi.replaceErdColumns(bulkEntity, ['FK member_id: BIGINT', 'name: TEXT']), true);
assert.equal(state.models.bulkRelation.sourceColumnName, 'member_id');
assert.equal(bulkEntity.erdChecks[0].expression, 'member_id > 0');
assert.equal(bulkEntity.erdIndexes[0].columns[0].name, 'member_id');
assert.match(statusMessages.at(-1), /일괄 편집.*FK 연결 1개 갱신/);

confirmationResult = false;
assert.equal(editorApi.replaceErdColumns(bulkEntity, ['name: TEXT']), false);
assert.deepEqual(bulkEntity.columns, ['FK member_id: BIGINT', 'name: TEXT']);
confirmationResult = true;
assert.equal(editorApi.replaceErdColumns(bulkEntity, ['name: TEXT']), true);
assert.deepEqual(bulkEntity.columns, ['name: TEXT']);
assert.equal(state.models.bulkRelation.foreignKeyEnd, '');
assert.match(statusMessages.at(-1), /FK 연결 1개 해제/);

assert.equal(editorApi.replaceErdColumns(bulkEntity, ['id: BIGINT', 'ID: TEXT']), false,
  '일괄 편집에서도 중복 물리명을 거부해야 합니다');
assert.match(statusMessages.at(-1), /컬럼 일괄 편집 오류.*이미 있습니다/);


/* ── 컬럼 편집 시트 ────────────────────────────────────────── */
const sheetEntity = {
  id: 'posts-view', kind: 'entity', modelId: 'posts-model', name: 'posts',
  x: 100, y: 80, w: 200, columns: ['PK id: BIGINT', 'title: TEXT'],
};
assert.equal(editorApi.openErdColumnEditor({ kind: 'class' }, 0), false,
  '엔티티가 아니면 컬럼 시트를 열지 않습니다');

assert.equal(editorApi.openErdColumnEditor(sheetEntity, 1), true);
flushDeferred();
assert.deepEqual(selectedTargets.at(-1), 'posts-view');
assert.equal(closeOtherCalls, 1, '다른 QuickEdit 편집기를 먼저 닫아야 합니다');
const sheet = wrap.children.at(-1);
assert.equal(sheet.className, 'erd-column-editor');
assert.equal(sheet.dataset.quickEdit, 'erd-column');
assert.equal(sheet.dataset.columnMode, 'edit');
assert.equal(sheet.attributes.role, 'dialog');
const sheetTitle = sheet.children[0];
assert.equal(sheet.attributes['aria-labelledby'], sheetTitle.id,
  '대화상자는 보이는 제목으로 이름을 받아야 합니다');
assert.equal(sheetTitle.textContent, 'posts · 2번째 컬럼 편집');

const physField = inputNamed(sheet, 'phys');
assert.equal(physField.value, 'title');
assert.equal(focused, physField, '열자마자 물리명에 포커스합니다');
const physCaption = descendants(sheet).find(child => child.id === physField.attributes['aria-labelledby']);
assert.equal(physCaption.textContent, '물리명 *');
const physHint = descendants(sheet).find(child => child.id === physField.attributes['aria-describedby']);
assert.equal(physHint.textContent, '같은 엔티티 안에서 고유해야 합니다.');
const typeField = inputNamed(sheet, 'type');
const datalist = descendants(sheet).find(child => child.tagName === 'DATALIST');
assert.equal(typeField.attributes.list, datalist.id);
assert.ok(datalist.children.some(option => option.value === 'VARCHAR(255)'));
assert.deepEqual(['PK', 'FK', 'UQ', 'NN'].map(flag => inputNamed(sheet, flag).checked),
  [false, false, false, false]);

/* 잘못된 값은 인라인 오류로 막고 모델을 건드리지 않는다 */
const errorBox = descendants(sheet).find(child => child.className === 'erd-column-editor-error');
assert.equal(errorBox.attributes['aria-live'], 'polite');
const beforeSnapshots = snapshotCalls;
physField.value = 'id';
buttonLabelled(sheet, '저장').emit('click');
assert.match(errorBox.textContent, /이미 있습니다/);
assert.equal(snapshotCalls, beforeSnapshots, '거절된 저장은 Undo 스냅샷을 만들지 않습니다');
assert.deepEqual(sheetEntity.columns, ['PK id: BIGINT', 'title: TEXT']);

/* 저장하면 컬럼과 FK 참조가 함께 바뀐다 */
state.models.titleRelation = {
  id: 'titleRelation', kind: 'erd-1n', name: 'title FK',
  fromModelId: 'posts-model', toModelId: 'tags-model', foreignKeyEnd: 'source',
  sourceColumnName: 'title', targetColumnName: 'id',
};
physField.value = 'headline';
inputNamed(sheet, 'NN').checked = true;
buttonLabelled(sheet, '저장').emit('click');
assert.deepEqual(sheetEntity.columns, ['PK id: BIGINT', 'NN headline: TEXT']);
assert.equal(state.models.titleRelation.sourceColumnName, 'headline');
assert.equal(sheet.isConnected, false, '저장하면 시트를 닫습니다');
assert.match(statusMessages.at(-1), /headline.*저장.*FK 연결 1개도 갱신/);

/* Ctrl/Cmd+Enter는 저장 후 다음 컬럼을 새로 연다 */
assert.equal(editorApi.openErdColumnEditor(sheetEntity, 2, { insert: true }), true);
flushDeferred();
const addSheet = wrap.children.at(-1);
assert.equal(addSheet.dataset.columnMode, 'add');
assert.equal(descendants(addSheet).find(child => child.textContent === '삭제').hidden, true,
  '새 컬럼에는 삭제 버튼을 숨깁니다');
inputNamed(addSheet, 'phys').value = 'body';
addSheet.emit('keydown', {
  key: 'Enter', ctrlKey: true, target: inputNamed(addSheet, 'phys'),
  preventDefault() {}, stopPropagation() {},
});
assert.deepEqual(sheetEntity.columns, ['PK id: BIGINT', 'NN headline: TEXT', 'body']);
const nextSheet = wrap.children.at(-1);
flushDeferred();
assert.equal(nextSheet.dataset.columnMode, 'add', '저장 후 다음 추가는 새 컬럼 시트를 엽니다');
assert.match(statusMessages.at(-1), /다음 컬럼을 입력하세요/);

/* Escape는 아무것도 저장하지 않고 닫는다 */
inputNamed(nextSheet, 'phys').value = 'buried';
nextSheet.emit('keydown', {
  key: 'Escape', target: inputNamed(nextSheet, 'phys'),
  preventDefault() {}, stopPropagation() {},
});
assert.equal(nextSheet.isConnected, false);
assert.deepEqual(sheetEntity.columns, ['PK id: BIGINT', 'NN headline: TEXT', 'body']);

/* 시트 안의 복사·붙여넣기 */
assert.equal(editorApi.openErdColumnEditor(sheetEntity, 1), true);
flushDeferred();
const copySheet = wrap.children.at(-1);
const pasteAction = buttonLabelled(copySheet, '아래 붙여넣기');
assert.equal(pasteAction.attributes['aria-label'], '복사한 ERD 컬럼을 아래에 붙여넣기');
buttonLabelled(copySheet, '⧉ 컬럼 복사').emit('click');
assert.equal(pasteAction.disabled, false);
assert.equal(editorApi.getErdColumnClipboard().raw, 'NN headline: TEXT');
pasteAction.emit('click');
assert.deepEqual(sheetEntity.columns,
  ['PK id: BIGINT', 'NN headline: TEXT', 'NN headline_copy: TEXT', 'body']);
assert.match(statusMessages.at(-1), /중복을 피해 컬럼 'headline_copy'/);
flushDeferred();

/* DEFAULT 값은 SQL 조각으로 검사한다 */
assert.equal(editorApi.openErdColumnEditor(sheetEntity, 0), true);
flushDeferred();
const defaultSheet = wrap.children.at(-1);
const defaultError = descendants(defaultSheet)
  .find(child => child.className === 'erd-column-editor-error');
inputNamed(defaultSheet, 'defaultValue').value = "0; DROP TABLE posts";
buttonLabelled(defaultSheet, '저장').emit('click');
assert.match(defaultError.textContent, /DEFAULT 값/);
assert.equal(defaultSheet.isConnected, true, '거절된 저장은 시트를 닫지 않습니다');
defaultSheet.emit('input', { target: inputNamed(defaultSheet, 'defaultValue') });
assert.equal(defaultError.textContent, '', '다시 입력하면 오류 표시를 지웁니다');

/* Ctrl/Cmd+ArrowUp은 저장하면서 컬럼을 한 칸 옮긴다 */
const orderEntity = {
  id: 'order-view', kind: 'entity', modelId: 'order-model', name: 'orders',
  x: 0, y: 0, w: 200, columns: ['PK id: BIGINT', 'memo: TEXT', 'total: INTEGER'],
};
assert.equal(editorApi.openErdColumnEditor(orderEntity, 2), true);
flushDeferred();
const moveSheet = wrap.children.at(-1);
inputNamed(moveSheet, 'phys').value = 'amount';
moveSheet.emit('keydown', {
  key: 'ArrowUp', ctrlKey: true, target: inputNamed(moveSheet, 'phys'),
  preventDefault() {}, stopPropagation() {},
});
flushDeferred();
assert.deepEqual(orderEntity.columns, ['PK id: BIGINT', 'amount: INTEGER', 'memo: TEXT']);
assert.match(statusMessages.at(-1), /amount.*순서를 변경/);
assert.equal(wrap.children.at(-1).children[0].textContent, 'orders · 2번째 컬럼 편집',
  '옮긴 자리에서 편집을 이어갑니다');
moveSheet.emit('keydown', {
  key: 'ArrowDown', ctrlKey: true, target: inputNamed(moveSheet, 'phys'),
  preventDefault() {}, stopPropagation() {},
});
assert.deepEqual(orderEntity.columns, ['PK id: BIGINT', 'amount: INTEGER', 'memo: TEXT'],
  '이미 저장한 시트는 다시 옮기지 않습니다');

/* Delete 키와 삭제 버튼은 같은 컬럼 삭제 경로를 쓴다 */
assert.equal(editorApi.openErdColumnEditor(orderEntity, 2), true);
flushDeferred();
const deleteSheet = wrap.children.at(-1);
deleteSheet.emit('keydown', {
  key: 'Delete', target: inputNamed(deleteSheet, 'phys'),
  preventDefault() {}, stopPropagation() {},
});
assert.deepEqual(orderEntity.columns, ['PK id: BIGINT', 'amount: INTEGER']);
assert.equal(deleteSheet.isConnected, false);

assert.equal(editorApi.openErdColumnEditor(orderEntity, 1), true);
flushDeferred();
const removeSheet = wrap.children.at(-1);
buttonLabelled(removeSheet, '삭제').emit('click');
assert.deepEqual(orderEntity.columns, ['PK id: BIGINT']);
assert.equal(removeSheet.isConnected, false);

/* Ctrl/Cmd+C·V는 버튼과 같은 동작을 한다 */
assert.equal(editorApi.openErdColumnEditor(orderEntity, 0), true);
flushDeferred();
const keySheet = wrap.children.at(-1);
const keyEvent = extra => ({
  target: inputNamed(keySheet, 'phys'), preventDefault() {}, stopPropagation() {}, ...extra,
});
keySheet.emit('keydown', keyEvent({ key: 'c', metaKey: true }));
assert.equal(editorApi.getErdColumnClipboard().raw, 'PK id: BIGINT');
keySheet.emit('keydown', keyEvent({ key: 'v', metaKey: true }));
flushDeferred();
assert.deepEqual(orderEntity.columns, ['PK id: BIGINT', 'PK id_copy: BIGINT'],
  '복사한 컬럼은 제약조건까지 함께 붙습니다');

/* 빈 새 컬럼에서 붙여넣으면 입력을 버리고 클립보드를 그대로 넣는다 */
assert.equal(editorApi.openErdColumnEditor(orderEntity, 2, { insert: true }), true);
flushDeferred();
const blankSheet = wrap.children.at(-1);
buttonLabelled(blankSheet, '아래 붙여넣기').emit('click');
flushDeferred();
assert.deepEqual(orderEntity.columns,
  ['PK id: BIGINT', 'PK id_copy: BIGINT', 'PK id_copy2: BIGINT']);
editorApi.closeErdColumnEditor();

/* Enter 하나로도 저장한다 */
assert.equal(editorApi.openErdColumnEditor(orderEntity, 0), true);
flushDeferred();
const enterSheet = wrap.children.at(-1);
inputNamed(enterSheet, 'phys').value = 'order_id';
enterSheet.emit('keydown', {
  key: 'Enter', target: inputNamed(enterSheet, 'phys'),
  preventDefault() {}, stopPropagation() {},
});
assert.equal(parseColumn(orderEntity.columns[0]).phys, 'order_id');
assert.equal(enterSheet.isConnected, false);

/* 클립보드가 비어 있는 컨트롤러에서는 붙여넣기가 알리고 끝난다 */
const freshApi = create(dependencies);
assert.equal(freshApi.getErdColumnClipboard(), null);
assert.equal(freshApi.openErdColumnEditor(orderEntity, 0), true);
flushDeferred();
buttonLabelled(wrap.children.at(-1), '아래 붙여넣기').emit('click');
assert.equal(statusMessages.at(-1), '복사한 컬럼이 없습니다');
freshApi.closeErdColumnEditor();

/* 바깥을 누르면 닫히고 document 리스너를 정리한다 */
assert.equal(editorApi.openErdColumnEditor(sheetEntity, 0), true);
const outsideSheet = wrap.children.at(-1);
flushDeferred();
assert.equal(documentListeners.mousedown.length, 1,
  '닫힌 시트의 바깥 클릭 감시는 정리되어야 합니다');
documentListeners.mousedown[0]({ target: fakeNode('div') });
assert.equal(outsideSheet.isConnected, false);
editorApi.closeErdColumnEditor();

console.log('erd column editor tests: ok');
