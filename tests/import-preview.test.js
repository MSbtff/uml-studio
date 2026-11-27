'use strict';

const assert = require('node:assert/strict');
const { create, REQUIRED_FUNCTIONS, REQUIRED_VALUES } = require('../dist/browser/io/import-preview.js');
const drawioImporter = require('../dist/browser/io/drawio-importer.js');

let focused = null;

function fakeNode(tagName = 'div') {
  const listeners = {};
  const node = {
    tagName: tagName.toUpperCase(),
    children: [],
    parent: null,
    className: '',
    dataset: {},
    style: {},
    attributes: {},
    textContent: '',
    value: '',
    id: '',
    hidden: false,
    disabled: false,
    classList: {
      values: new Set(),
      add(...values) { values.forEach(value => this.values.add(value)); },
      remove(...values) { values.forEach(value => this.values.delete(value)); },
      toggle(value, on) { if (on) this.values.add(value); else this.values.delete(value); },
    },
    appendChild(child) {
      this.children.push(child); child.parent = node;
      if (this.tagName === 'SELECT' && child.tagName === 'OPTION' && !this.value) this.value = child.value;
      return child;
    },
    append(...items) { items.forEach(item => this.appendChild(item)); },
    remove() { this.parent = null; },
    setAttribute(name, value) { this.attributes[name] = String(value); },
    getAttribute(name) { return name in this.attributes ? this.attributes[name] : null; },
    addEventListener(type, listener) { (listeners[type] ||= []).push(listener); },
    emit(type, event = {}) { (listeners[type] || []).forEach(listener => listener(event)); },
    focus() { focused = node; },
    closest(selector) {
      const wanted = selector.toUpperCase();
      let current = node;
      while (current && current.tagName !== wanted) current = current.parent;
      return current || null;
    },
    querySelector: () => fakeNode('strong'),
  };
  Object.defineProperty(node, 'textContent', {
    get() { return this._text || ''; },
    set(value) { this._text = value; if (value === '') this.children = []; },
  });
  return node;
}

const document = { createElement: tagName => fakeNode(tagName) };

const descendants = node => (node.children || [])
  .flatMap(child => [child, ...descendants(child)]);
const byClass = (node, className) =>
  descendants(node).filter(child => child.className === className);
const byId = (node, id) => descendants(node).find(child => child.id === id);
const tagged = (node, tagName) =>
  descendants(node).filter(child => child.tagName === tagName.toUpperCase());

const modals = [];
const dependencies = {
  projectActionButton: (label, action) => {
    const button = fakeNode('button');
    button.textContent = label;
    button.addEventListener('click', action);
    return button;
  },
  projectModal: (title, id) => {
    const dialog = fakeNode('div');
    const header = fakeNode('div');
    let requestCloseHandler = null;
    let closed = false;
    const modal = {
      close() { closed = true; return true; },
      isClosed: () => closed,
      focusInitial(node) { node?.focus?.(); return true; },
      requestClose(reason) {
        if (requestCloseHandler) requestCloseHandler(reason, modal);
        else modal.close();
        return true;
      },
      setRequestCloseHandler(handler) { requestCloseHandler = handler; return modal; },
    };
    const entry = { title, id, dialog, header, modal };
    modals.push(entry);
    return entry;
  },
  document,
  drawioImporter,
  DIAGRAM_META: { class: { label: 'Class Diagram' }, erd: { label: 'ER Diagram' } },
  DRAWIO_IMPORT_POLICIES: Object.freeze([
    ['keepBoth', '새 모델로 가져오기'],
    ['reuse', '기존 모델 재사용'],
    ['replace', '기존 모델 덮어쓰기'],
  ]),
  KIND_META: { class: { label: 'Class' }, entity: { label: 'Entity' } },
};

assert.ok(Object.isFrozen(REQUIRED_FUNCTIONS) && Object.isFrozen(REQUIRED_VALUES));
assert.throws(() => create(), /가져오기 미리보기 의존성이 없습니다/);
assert.throws(() => create({ ...dependencies, document: {} }), /document\.createElement/);
assert.throws(() => create({ ...dependencies, drawioImporter: {} }),
  /drawioImporter\.filterImportConflicts/);

const preview = create(dependencies);
assert.ok(Object.isFrozen(preview));
assert.deepEqual(Object.keys(preview).sort(), ['openDdlImportPreview', 'openDrawioImportPreview']);

const conflict = (id, extra = {}) => ({
  importedModelId: id, importedName: id, importedKind: 'class',
  matchModelId: `existing-${id}`, matchName: `existing ${id}`,
  type: 'semantic', compatible: true, changedFields: [], ...extra,
});
const analysis = {
  diagrams: 2, models: 5, elementViews: 7, relationViews: 3,
  compatibleConflicts: 3, incompatibleConflicts: 1,
  diagramDetails: [
    { name: 'Class Diagram', type: 'class', elements: 4, relations: 2, nameConflict: true },
    { name: 'Tables', type: 'erd', elements: 3, relations: 1, nameConflict: false },
  ],
  conflicts: [
    conflict('alpha', { changedFields: ['name'] }),
    conflict('beta', { type: 'exact' }),
    conflict('gamma'),
    conflict('delta', { compatible: false, type: 'kind' }),
  ],
};

async function flows() {
  {
    const pending = preview.openDrawioImportPreview(structuredClone(analysis), structuredClone(analysis),
      { filename: 'diagrams.drawio' });
    const { dialog, modal } = modals.at(-1);
    assert.equal(dialog.attributes.role, 'dialog');
    assert.equal(dialog.attributes['aria-modal'], 'true');
    assert.equal(dialog.attributes['aria-labelledby'], 'drawio-import-preview-title');
    const body = dialog.children[0];
    assert.equal(byClass(body, 'drawio-import-intro')[0].textContent,
      'diagrams.drawio · 새 프로젝트로 열기');
    assert.deepEqual(byClass(body, 'drawio-import-stat').map(card => card.children[1].textContent),
      ['다이어그램', '모델', '요소 뷰', '관계 뷰', '호환 충돌']);
    assert.deepEqual(byClass(body, 'drawio-diagram-row').map(row => row.children[1].textContent),
      ['Class Diagram · 요소 4 · 관계 2', 'ER Diagram · 요소 3 · 관계 1']);
    assert.equal(byClass(body, 'drawio-conflict-controls').length, 0,
      '새 프로젝트로 열 때는 충돌 표를 보여주지 않습니다');
    const footer = dialog.children.at(-1);
    assert.deepEqual(footer.children.map(button => button.textContent), ['취소', '새 프로젝트로 열기']);
    assert.equal(focused, footer.children[1], '기본 포커스는 확인 버튼입니다');
    footer.children[1].emit('click');
    const decision = await pending;
    assert.equal(decision.policy, 'keepBoth');
    assert.equal(modal.isClosed(), true);
  }

  {
    const pending = preview.openDrawioImportPreview(structuredClone(analysis), structuredClone(analysis), {});
    modals.at(-1).dialog.children.at(-1).children[0].emit('click');
    assert.equal(await pending, null);
  }
  {
    const pending = preview.openDrawioImportPreview(structuredClone(analysis), structuredClone(analysis), {});
    modals.at(-1).modal.requestClose('overlay');
    assert.equal(await pending, null, '모달을 닫으면 가져오기를 취소한 것으로 봅니다');
  }

  {
    const pending = preview.openDrawioImportPreview(structuredClone(analysis), structuredClone(analysis),
      { append: true, filename: 'merge.drawio' });
    const { dialog } = modals.at(-1);
    const body = dialog.children[0];
    assert.equal(byClass(body, 'drawio-import-intro')[0].textContent,
      'merge.drawio · 현재 프로젝트에 다이어그램 추가');
    assert.ok(byClass(body, 'drawio-diagram-row')[0].children[2].textContent === '이름 자동 변경',
      '이름이 겹치는 다이어그램은 뱃지로 알려야 합니다');

    const search = byId(body, 'drawio-conflict-search');
    const filter = byId(body, 'drawio-conflict-filter');
    const reset = byClass(body, 'drawio-conflict-reset')[0];
    const resultMeta = byClass(body, 'drawio-conflict-result-meta')[0];
    const tbody = tagged(body, 'tbody')[0];
    assert.equal(search.attributes['aria-label'], 'draw.io 모델 충돌 검색');
    assert.equal(resultMeta.attributes['aria-live'], 'polite');
    assert.equal(tbody.children.length, 4);
    assert.equal(resultMeta.textContent, '4/4건 · 1-4');
    const table = tagged(body, 'table')[0];
    assert.equal(table.getAttribute('aria-label'), '모델 충돌 4건');
    assert.deepEqual(tagged(body, 'th').map(cell => cell.getAttribute('scope')),
      ['col', 'col', 'col', 'col', 'col'],
      'scope 없이는 셀과 헤더를 짝지을 수 없습니다');
    const pager = byClass(body, 'drawio-conflict-pager')[0];
    assert.equal(pager.getAttribute('role'), 'group');
    assert.equal(pager.getAttribute('aria-label'), '모델 충돌 페이지 이동');
    assert.equal(reset.disabled, true, '기본 상태에서는 초기화할 것이 없습니다');
    assert.equal(byClass(body, 'drawio-policy-fixed')[0].textContent, '새 모델 (고정)',
      '호환되지 않는 충돌은 정책을 고를 수 없습니다');
    assert.equal(tbody.children[3].children[2].className, 'drawio-conflict-danger');

    search.value = 'alpha';
    search.emit('input');
    assert.equal(tbody.children.length, 1);
    assert.equal(resultMeta.textContent, '1/4건 · 1-1');
    assert.equal(reset.disabled, false);

    search.value = 'nothing-matches';
    search.emit('input');
    assert.equal(byClass(tbody, 'drawio-conflict-empty')[0].textContent, '검색 조건에 맞는 충돌이 없습니다.');

    reset.emit('click');
    assert.equal(tbody.children.length, 4);
    assert.equal(focused, search, '초기화 후에는 검색창으로 돌아갑니다');

    filter.value = 'incompatible';
    filter.emit('change');
    assert.equal(tbody.children.length, 1);
    filter.value = 'all';
    filter.emit('change');

    const bulk = byId(body, 'drawio-conflict-policy');
    const summary = byClass(body, 'drawio-policy-summary')[0];
    search.value = 'alpha';
    search.emit('input');
    bulk.value = 'replace';
    bulk.emit('change');
    assert.match(summary.textContent, /새 모델 2 · 기존 재사용 0 · 덮어쓰기 1/);
    assert.equal(byId(body, 'drawio-policy-help').className, 'drawio-import-note danger');
    assert.ok(tbody.children[0].classList.values.has('drawio-conflict-replace'));
    const footer = dialog.children.at(-1);
    assert.equal(footer.children[1].textContent, '가져오기 (2) · 덮어쓰기 1');

    search.value = '';
    search.emit('input');
    const rowSelects = byClass(body, 'drawio-row-policy');
    rowSelects[1].value = 'reuse';
    rowSelects[1].emit('change');
    assert.match(summary.textContent, /새 모델 1 · 기존 재사용 1 · 덮어쓰기 1/);

    footer.children[1].emit('click');
    const decision = await pending;
    assert.equal(decision.policy, 'keepBoth', '정책이 섞이면 일괄 값은 keepBoth로 남습니다');
    assert.deepEqual(decision.modelPolicies,
      { alpha: 'replace', beta: 'reuse', gamma: 'keepBoth' });
  }

  {
    const clean = { ...structuredClone(analysis), conflicts: [], compatibleConflicts: 0 };
    const pending = preview.openDrawioImportPreview(clean, clean, { append: true });
    const body = modals.at(-1).dialog.children[0];
    assert.equal(byClass(body, 'drawio-import-note')[0].textContent,
      '현재 프로젝트와 충돌하는 요소 모델이 없습니다.');
    assert.equal(byId(body, 'drawio-conflict-policy'), undefined,
      '호환 충돌이 없으면 일괄 처리 선택기도 없습니다');
    modals.at(-1).dialog.children.at(-1).children[1].emit('click');
    assert.deepEqual(await pending, { policy: 'keepBoth', modelPolicies: {} });
  }

  {
    const imported = {
      importMeta: {
        tables: 3, columns: 12, foreignKeys: 2, checks: 1, indexes: 4,
        dialect: 'postgres',
        warnings: ['복합 FK는 가져오지 않습니다'],
      },
      models: {}, diagrams: [],
    };
    const pending = preview.openDdlImportPreview(imported, { filename: 'schema.sql' });
    const { dialog, modal } = modals.at(-1);
    assert.equal(dialog.attributes.role, 'dialog');
    const body = dialog.children[0];
    assert.match(body.children[0].textContent, /schema\.sql/);
    const footer = dialog.children.at(-1);
    assert.deepEqual(footer.children.map(button => button.textContent), ['취소', '가져오기 (3)']);
    footer.children[0].emit('click');
    assert.equal(await pending, false, '취소하면 false를 돌려줍니다');
    assert.equal(modal.isClosed(), true);
  }
  {
    const imported = { importMeta: { tables: 1, columns: 2 }, models: {}, diagrams: [] };
    const pending = preview.openDdlImportPreview(imported, {});
    modals.at(-1).dialog.children.at(-1).children[1].emit('click');
    assert.equal(await pending, true);
  }
  {
    const imported = { importMeta: { tables: 1 }, models: {}, diagrams: [] };
    const pending = preview.openDdlImportPreview(imported, {});
    modals.at(-1).modal.requestClose('escape');
    assert.equal(await pending, false);
  }
}

flows().then(() => {
  console.log('import preview tests: ok');
}, error => {
  console.error(error);
  process.exitCode = 1;
});
