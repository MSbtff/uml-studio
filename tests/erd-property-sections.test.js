'use strict';

const assert = require('node:assert/strict');
const { create, REQUIRED_FUNCTIONS, REQUIRED_VALUES } = require('../dist/browser/editor/erd-property-sections.js');
const { parseColumn } = require('../dist/browser/model/erd-column.js');
const { normalizeErdChecks, normalizeErdIndexes, safeSqlFragment } = require('../dist/browser/model/erd-schema.js');

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
    getAttribute(name) { return name in this.attributes ? this.attributes[name] : null; },
    addEventListener(type, listener) { (listeners[type] ||= []).push(listener); },
    emit(type, event = {}) { (listeners[type] || []).forEach(listener => listener(event)); },
    focus() {},
    setCustomValidity(message) { this.validationMessage = message; },
    reportValidity() { this.reported = true; },
    contains(target) {
      return target === node || (node.children || []).some(child => child.contains?.(target) === true);
    },
    querySelectorAll() { return []; },
  };
  return node;
}

const descendants = node => (node.children || [])
  .flatMap(child => [child, ...descendants(child)]);
const byClass = (node, className) =>
  descendants(node).filter(child => child.className === className);
const controls = node =>
  descendants(node).filter(child => CONTROL_TAGS.includes(child.tagName));
const texts = node => descendants(node).map(child => child.textContent).join(' | ');

const document = {
  createElement: tagName => fakeNode(tagName),
  createTextNode: value => ({ tagName: '#TEXT', textContent: value, children: [] }),
};

let headingSequence = 0;
const calls = [];
const record = name => (...args) => { calls.push([name, ...args]); };
const lastCall = name => [...calls].reverse().find(entry => entry[0] === name);

let erdModeValue = 'both';
let clipboard = null;

function propRow(labelText, node, hint) {
  const row = fakeNode('div');
  row.className = 'prop-row';
  const label = fakeNode('label');
  label.textContent = labelText;
  row.append(label, node);
  if (hint) {
    const hintNode = fakeNode('div');
    hintNode.className = 'prop-hint';
    hintNode.textContent = hint;
    row.appendChild(hintNode);
  }
  return row;
}

function sectionHeading(text) {
  const title = fakeNode('strong');
  title.textContent = text;
  title.id = `uml-property-section-${++headingSequence}`;
  title.setAttribute('role', 'heading');
  title.setAttribute('aria-level', '3');
  return title;
}

const entities = {
  'post-model': { id: 'post', modelId: 'post-model', kind: 'entity', name: 'posts', columns: [] },
};

const dependencies = {
  byId: id => (id === 'post' ? { name: 'posts' } : { name: 'users' }),
  copyErdColumn: record('copyErdColumn'),
  deleteErdColumn: record('deleteErdColumn'),
  ensureMemberArray: (entity, field) => (entity[field] ||= []),
  erdMode: () => erdModeValue,
  flashStatus: record('flashStatus'),
  getErdColumnClipboard: () => clipboard,
  moveErdColumn: record('moveErdColumn'),
  moveErdColumnTo: record('moveErdColumnTo'),
  normalizeErdChecks,
  normalizeErdIndexes,
  openErdColumnEditor: record('openErdColumnEditor'),
  parseColumn,
  pasteErdColumn: record('pasteErdColumn'),
  propRow,
  render: record('render'),
  renderProps: record('renderProps'),
  replaceErdColumns: record('replaceErdColumns'),
  safeSqlFragment,
  sectionHeading,
  setErdMode: record('setErdMode'),
  snapshot: record('snapshot'),
  document,
  ERD_REFERENTIAL_ACTION_OPTIONS: [
    ['', '(DB 기본값 · NO ACTION)'], ['CASCADE', 'CASCADE'], ['SET NULL', 'SET NULL'],
  ],
  ERD_VIEW_MODES: [['logical', '논리'], ['physical', '물리'], ['both', '둘 다']],
};

assert.ok(Object.isFrozen(REQUIRED_FUNCTIONS) && Object.isFrozen(REQUIRED_VALUES));
assert.ok(REQUIRED_FUNCTIONS.includes('propRow') && REQUIRED_FUNCTIONS.includes('sectionHeading'));
assert.throws(() => create({}), /ERD 속성 섹션 의존성이 없습니다/);
assert.throws(() => create({ ...dependencies, document: {} }), /document\.createElement/);
assert.throws(() => create({ ...dependencies, propRow: undefined }), /propRow/);

const sections = create(dependencies);
assert.ok(Object.isFrozen(sections));
assert.deepEqual(Object.keys(sections).sort(),
  ['erdColumnsProperty', 'erdDisplayModeProperty', 'erdForeignKeyProperty', 'erdSchemaProperty']);

/* ── 표시 방식 ─────────────────────────────────────────────── */
const display = sections.erdDisplayModeProperty();
assert.equal(display.className, 'erd-display-property');
assert.equal(display.attributes.role, 'group');
const modeButtons = controls(display);
assert.deepEqual(modeButtons.map(button => button.textContent), ['논리', '물리', '둘 다']);
assert.deepEqual(modeButtons.map(button => button.attributes['aria-pressed']),
  ['false', 'false', 'true'], '현재 표시 모드만 aria-pressed=true여야 합니다');
modeButtons[0].emit('click');
assert.deepEqual(lastCall('setErdMode'), ['setErdMode', 'logical']);

/* ── Columns ───────────────────────────────────────────────── */
const entity = entities['post-model'];
const emptyColumns = sections.erdColumnsProperty(entity);
assert.equal(emptyColumns.className, 'erd-columns-property');
assert.match(texts(emptyColumns), /Columns \(0\)/);
const emptyButton = byClass(emptyColumns, 'erd-column-property-empty')[0];
assert.ok(emptyButton, '컬럼이 없으면 첫 컬럼을 추가하는 버튼을 보여야 합니다');
emptyButton.emit('click');
assert.deepEqual(lastCall('openErdColumnEditor'), ['openErdColumnEditor', entity, 0]);

entity.columns = ['PK id: int', 'NN title <제목>: text'];
const columnsSection = sections.erdColumnsProperty(entity);
const list = byClass(columnsSection, 'erd-column-property-list')[0];
assert.equal(list.attributes.role, 'list');
const rows = byClass(columnsSection, 'erd-column-property-row');
assert.equal(rows.length, 2);
assert.equal(rows[0].attributes.role, 'listitem');
const paste = byClass(columnsSection, 'erd-column-paste')[0];
assert.equal(paste.disabled, true, '복사한 컬럼이 없으면 붙여넣기는 비활성입니다');

const handle = byClass(columnsSection, 'erd-column-drag-handle')[1];
assert.equal(handle.draggable, true);
assert.equal(handle.attributes.tabindex, '0');
handle.emit('keydown', { key: 'ArrowUp', preventDefault() {} });
assert.deepEqual(lastCall('moveErdColumn'), ['moveErdColumn', entity, 1, -1]);
handle.emit('keydown', { key: 'Enter', preventDefault() { throw new Error('막아서는 안 됩니다'); } });

const rowControls = controls(rows[0]);
rowControls.find(control => control.className === 'erd-column-property-main').emit('click');
assert.deepEqual(lastCall('openErdColumnEditor'), ['openErdColumnEditor', entity, 0]);
const actions = rowControls.filter(control => control.textContent === '↑' || control.textContent === '↓');
assert.equal(actions[0].disabled, true, '첫 행은 위로 이동할 수 없습니다');
const lastRowActions = controls(rows[1]).filter(control => control.textContent === '↓');
assert.equal(lastRowActions[0].disabled, true, '마지막 행은 아래로 이동할 수 없습니다');

byClass(columnsSection, 'erd-column-add')[0].emit('click');
assert.deepEqual(lastCall('openErdColumnEditor'),
  ['openErdColumnEditor', entity, 2, { insert: true }],
  '헤더의 추가 버튼은 마지막 컬럼 뒤에 삽입해야 합니다');

/* 드래그로 컬럼 순서 바꾸기 */
const dataTransfer = { setData() {} };
const prevented = [];
const dragEvent = extra => ({ dataTransfer, preventDefault() { prevented.push(1); }, ...extra });
byClass(columnsSection, 'erd-column-drag-handle')[0].emit('dragstart', dragEvent());
assert.ok(rows[0].classList.values.has('dragging'));
rows[0].emit('dragover', dragEvent());
assert.ok(!rows[0].classList.values.has('drag-target'), '자기 자신은 놓을 자리로 표시하지 않습니다');
rows[1].emit('dragover', dragEvent());
assert.ok(rows[1].classList.values.has('drag-target'));
rows[1].emit('dragleave', dragEvent({ relatedTarget: null }));
assert.ok(!rows[1].classList.values.has('drag-target'));
rows[1].emit('dragover', dragEvent());
rows[1].emit('drop', dragEvent());
assert.deepEqual(lastCall('moveErdColumnTo'), ['moveErdColumnTo', entity, 0, 1]);
rows[1].emit('drop', dragEvent());
assert.deepEqual(lastCall('moveErdColumnTo'), ['moveErdColumnTo', entity, 0, 1],
  '드롭이 끝난 뒤에는 같은 드래그가 다시 적용되지 않습니다');

const rawArea = descendants(columnsSection).find(child => child.tagName === 'TEXTAREA');
assert.equal(rawArea.value, 'PK id: int\nNN title <제목>: text');
rawArea.value = 'PK id: int\n\nNN title <제목>: text\n';
rawArea.emit('change');
assert.deepEqual(lastCall('replaceErdColumns'),
  ['replaceErdColumns', entity, ['PK id: int', 'NN title <제목>: text']],
  '빈 줄은 컬럼으로 만들지 않습니다');

clipboard = { sourceModelId: 'post-model', sourceIndex: 0, raw: 'PK id: int' };
const withClipboard = sections.erdColumnsProperty(entity);
assert.equal(byClass(withClipboard, 'erd-column-paste')[0].disabled, false);
assert.ok(byClass(withClipboard, 'erd-column-property-row')[0].classList.values.has('copied'));
assert.match(texts(withClipboard), /복사됨: id/);
clipboard = null;

/* ── DDL 제약조건과 인덱스 ─────────────────────────────────── */
entity.erdChecks = [{ name: 'title_check', expression: "title <> ''", column: '' }];
entity.erdIndexes = [{
  kind: 'index', name: 'posts_title_idx', unique: false,
  columns: [{ name: 'title', order: '' }], where: '',
}];
const schema = sections.erdSchemaProperty(entity);
assert.equal(schema.className, 'erd-schema-property');
assert.match(texts(schema), /CHECK \(1\)/);
assert.match(texts(schema), /Indexes \(1\)/);
const checkRow = byClass(schema, 'erd-schema-row erd-check-row')[0];
const [scope, checkName, expression] = controls(checkRow);
assert.deepEqual([...scope.children].map(option => option.value), ['', 'id', 'title']);
assert.equal(checkName.value, 'title_check');
expression.value = 'title IS NOT NULL';
expression.emit('change');
assert.equal(entity.erdChecks[0].expression, 'title IS NOT NULL');

checkName.value = ' body_check ';
checkName.emit('change');
assert.equal(entity.erdChecks[0].name, 'body_check', 'CHECK 이름은 공백을 다듬어 저장합니다');

const errorBox = byClass(schema, 'erd-schema-error')[0];
assert.equal(errorBox.attributes['aria-live'], 'polite');
expression.value = "title -- 주석";
expression.emit('change');
assert.match(errorBox.textContent, /주석을 사용할 수 없습니다/,
  '잘못된 SQL 조각은 인라인 오류로 알려야 합니다');
assert.equal(expression.validationMessage, errorBox.textContent);
assert.equal(entity.erdChecks[0].expression, 'title IS NOT NULL', '거절된 값은 모델에 남지 않습니다');

const indexRow = byClass(schema, 'erd-schema-row erd-index-row')[0];
const [kind, indexName, indexColumns] = controls(indexRow);
assert.equal(kind.value, 'index');
assert.equal(indexName.value, 'posts_title_idx');
indexColumns.value = 'title, id DESC';
indexColumns.emit('change');
assert.deepEqual(entity.erdIndexes[0].columns,
  [{ name: 'title', order: '' }, { name: 'id', order: 'DESC' }]);

/* 추가·삭제 버튼은 모델을 직접 고쳐 쓰고 패널을 다시 그린다 */
const addCheck = controls(schema).find(control => control.textContent === '+ CHECK');
addCheck.emit('click');
assert.equal(entity.erdChecks.length, 2);
assert.equal(entity.erdChecks[1].expression, '1 = 1');
const addIndex = controls(schema).find(control => control.textContent === '+ 인덱스');
addIndex.emit('click');
assert.equal(entity.erdIndexes.length, 2);
assert.equal(entity.erdIndexes[1].name, 'posts_id_idx');

const live = sections.erdSchemaProperty(entity);
const liveCheckRows = byClass(live, 'erd-schema-row erd-check-row');
const [liveScope] = controls(liveCheckRows[0]);
liveScope.value = 'title';
liveScope.emit('change');
assert.equal(entity.erdChecks[0].column, 'title');
const liveIndexRows = byClass(live, 'erd-schema-row erd-index-row');
const [liveKind, , , liveWhere] = controls(liveIndexRows[0]);
liveKind.value = 'unique';
liveKind.emit('change');
assert.equal(entity.erdIndexes[0].kind, 'unique');
assert.equal(entity.erdIndexes[0].unique, true, 'UNIQUE 제약으로 바꾸면 unique도 켜집니다');
liveWhere.value = 'deleted_at IS NULL';
liveWhere.emit('change');
assert.equal(entity.erdIndexes[0].where, 'deleted_at IS NULL');

const secondRound = sections.erdSchemaProperty(entity);
const secondIndexRows = byClass(secondRound, 'erd-schema-row erd-index-row');
const secondUnique = controls(secondIndexRows[0]).find(control => control.type === 'checkbox');
assert.equal(secondUnique.disabled, true, 'UNIQUE 제약 행에서는 unique를 끌 수 없습니다');
const plainUnique = controls(secondIndexRows[1]).find(control => control.type === 'checkbox');
plainUnique.checked = true;
plainUnique.emit('change');
assert.equal(entity.erdIndexes[1].unique, true);

controls(byClass(secondRound, 'erd-schema-row erd-index-row')[1])
  .find(control => control.textContent === '×').emit('click');
assert.equal(entity.erdIndexes.length, 1);
controls(byClass(secondRound, 'erd-schema-row erd-check-row')[1])
  .find(control => control.textContent === '×').emit('click');
assert.equal(entity.erdChecks.length, 1);

const stripped = sections.erdSchemaProperty(entity);
controls(byClass(stripped, 'erd-schema-row erd-check-row')[0])
  .find(control => control.textContent === '×').emit('click');
assert.equal('erdChecks' in entity, false, '마지막 CHECK를 지우면 필드 자체를 제거합니다');
controls(byClass(stripped, 'erd-schema-row erd-index-row')[0])
  .find(control => control.textContent === '×').emit('click');
assert.equal('erdIndexes' in entity, false);

const noColumns = sections.erdSchemaProperty({ id: 'blank', modelId: 'blank', name: 'blank', columns: [] });
assert.equal(controls(noColumns).find(control => control.textContent === '+ 인덱스').disabled, true,
  '컬럼이 없으면 인덱스를 만들 수 없습니다');

entity.erdChecks = [{ name: 'title_check', expression: "title <> ''", column: '' }];
entity.erdIndexes = [{
  kind: 'index', name: 'posts_title_idx', unique: false,
  columns: [{ name: 'title', order: '' }], where: '',
}];

const brokenSchema = sections.erdSchemaProperty({ ...entity, erdChecks: [{ expression: 1 }] });
assert.equal(byClass(brokenSchema, 'erd-schema-row erd-check-row').length, 0,
  '정규화에 실패하면 편집 UI 대신 오류만 보여야 합니다');
assert.match(texts(brokenSchema), /문자열이어야 합니다/);

const emptySchema = sections.erdSchemaProperty({ ...entity, erdChecks: [], erdIndexes: [] });
assert.match(texts(emptySchema), /CHECK 표현식이 없습니다/);
assert.match(texts(emptySchema), /보조 인덱스가 없습니다/);

/* ── FK 보유 엔티티 ────────────────────────────────────────── */
const box = fakeNode('div');
const relation = { id: 'writes', kind: 'erd-1n', from: 'post', to: 'user', foreignKeyEnd: '' };
sections.erdForeignKeyProperty(box, relation);
const owner = byClass(box, 'erd-foreign-key-owner-select')[0];
const onDelete = byClass(box, 'erd-foreign-key-on-delete-select')[0];
const onUpdate = byClass(box, 'erd-foreign-key-on-update-select')[0];
assert.deepEqual([...owner.children].map(option => option.textContent),
  ['(FK 제약 연결 안 함)', '출발 · posts', '도착 · users']);
assert.equal(onDelete.disabled, true, 'FK 보유 엔티티를 고르기 전에는 참조 동작을 못 바꿉니다');
assert.equal(onUpdate.disabled, true);
assert.doesNotMatch(JSON.stringify(owner.attributes), /aria-label/,
  '보이는 라벨을 aria-label로 덮으면 안 됩니다');

owner.value = 'source';
owner.emit('change');
assert.equal(relation.foreignKeyEnd, 'source');

const linkedBox = fakeNode('div');
relation.foreignKeyOnDelete = 'CASCADE';
sections.erdForeignKeyProperty(linkedBox, relation);
const linkedOnDelete = byClass(linkedBox, 'erd-foreign-key-on-delete-select')[0];
assert.equal(linkedOnDelete.disabled, false);
assert.equal(linkedOnDelete.value, 'CASCADE');

const clearedBox = fakeNode('div');
sections.erdForeignKeyProperty(clearedBox, relation);
const clearedOwner = byClass(clearedBox, 'erd-foreign-key-owner-select')[0];
clearedOwner.value = '';
clearedOwner.emit('change');
assert.equal(relation.foreignKeyEnd, '');
assert.equal(relation.foreignKeyOnDelete, '', 'FK 연결을 풀면 참조 동작도 함께 지웁니다');
assert.equal(relation.foreignKeyOnUpdate, '');

console.log('erd property sections tests: ok');
