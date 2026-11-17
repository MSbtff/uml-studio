'use strict';

const assert = require('node:assert/strict');
const { REQUIRED_FUNCTIONS, REQUIRED_VALUES, create } = require('../dist/browser/io/diagram-export.js');

/* ── Minimal DOM / browser doubles ─────────────────────────── */
function fakeNode(tag = 'div') {
  const listeners = new Map();
  return {
    tag,
    children: [],
    attributes: {},
    dataset: {},
    textContent: '',
    className: '',
    style: {},
    setAttribute(name, value) { this.attributes[name] = String(value); },
    getAttribute(name) { return this.attributes[name]; },
    appendChild(child) { this.children.push(child); return child; },
    append(...nodes) { this.children.push(...nodes); },
    querySelectorAll() { return []; },
    querySelector() { return null; },
    remove() { this.removed = true; },
    focus() { this.focused = true; },
    click() { this.clicked = (this.clicked || 0) + 1; },
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
  };
}

function harness(overrides = {}) {
  const downloads = [];
  const statuses = [];
  const alerts = [];
  const renders = [];
  const modals = [];
  let idSeq = 1;

  const created = [];
  const document = {
    createElement(tag) {
      const node = fakeNode(tag);
      if (tag === 'a') {
        Object.defineProperty(node, 'href', {
          get() { return this._href; },
          set(value) { this._href = value; },
        });
        node.click = () => downloads.push({ filename: node.download, href: node._href });
      }
      if (tag === 'canvas') {
        node.getContext = () => ({ fillRect() {}, drawImage() {} });
        node.toBlob = callback => callback({ type: 'image/png' });
      }
      created.push(node);
      return node;
    },
    getElementById: () => null,
    addEventListener() {},
    removeEventListener() {},
    body: fakeNode('body'),
  };

  const fileInput = fakeNode('input');
  const svg = fakeNode('svg');
  svg.cloneNode = () => {
    const clone = fakeNode('svg');
    clone.querySelectorAll = () => [];
    return clone;
  };

  const state = {
    projectId: 'p-1',
    projectName: 'Demo',
    models: {},
    diagrams: [
      { id: 'd1', type: 'class', name: 'Class Diagram', elements: [{ id: 'e1', kind: 'class', modelId: 'm1' }], relations: [] },
      { id: 'd2', type: 'class', name: 'Empty', elements: [], relations: [] },
    ],
    activeId: 'd1',
    selection: [],
    zoom: 1,
  };

  const deps = {
    alert: message => { alerts.push(message); },
    btoa: value => Buffer.from(value, 'binary').toString('base64'),
    clearValidationResults: () => {},
    contentBBox: () => ({ x: 0, y: 0, w: 100, h: 80 }),
    dg: () => state.diagrams.find(d => d.id === state.activeId),
    diagramAllowsElementKind: (type, kind) => (type === 'class' ? kind !== 'lifeline' : true),
    flashStatus: message => { statuses.push(message); },
    hydrateView: view => view,
    load: () => true,
    markDirty: () => {},
    modelUid: () => 'm' + (idSeq++),
    projectActionButton: (label, action) => {
      const button = fakeNode('button');
      button.textContent = label;
      button.classList = { add() {} };
      button.addEventListener('click', action);
      return button;
    },
    projectData: () => ({ diagrams: state.diagrams }),
    projectModal: () => {
      const overlay = fakeNode('div');
      const dialog = fakeNode('div');
      const header = fakeNode('div');
      const close = fakeNode('button');
      let requestCloseHandler = null;
      const modalHandle = {
        close() { overlay.remove(); return true; },
        focusInitial(node) { node?.focus?.(); return true; },
        requestClose(reason) {
          if (requestCloseHandler) requestCloseHandler(reason, modalHandle);
          else modalHandle.close();
          return true;
        },
        setRequestCloseHandler(handler) { requestCloseHandler = handler; return modalHandle; },
      };
      header.querySelector = selector => (selector === '.modal-close' ? close : fakeNode('strong'));
      dialog.classList = { add() {} };
      const modal = { overlay, dialog, header, modal: modalHandle };
      modals.push(modal);
      return modal;
    },
    projectRecords: async () => ({ indexed: null, sqlite: null }),
    projectUid: () => 'p-new',
    renderAll: () => { renders.push('all'); },
    renderCanvas: () => { renders.push('canvas'); },
    rememberActiveProject: () => {},
    rollbackLastSnapshot: () => {},
    saveRecoveryCopy: async () => true,
    scheduleRecoverySave: () => {},
    setSelection: ids => { state.selection = ids; },
    setTimeout: () => 0,
    snapshot: () => {},
    uid: () => 'e' + (idSeq++),
    validProjectId: value => typeof value === 'string' && /^[A-Za-z0-9._-]{1,128}$/.test(value),
    validateProjectData: () => true,
    document,
    ddlImporter: {
      parseDdl: (_sql, options = {}) => ({
        version: 30,
        models: {
          table: { id: 'table', kind: 'entity', name: 'users', columns: ['PK id: BIGINT'] },
        },
        diagrams: [{
          id: 'ddl', type: 'erd', name: options.diagramName || 'Imported DDL',
          elements: [{ id: 'tableView', modelId: 'table', x: 80, y: 80, w: 280, h: 88 }],
          relations: [],
        }],
        importMeta: {
          dialect: '표준/자동', warnings: ['DEFAULT 값은 저장하지 않습니다.'],
          tables: 1, columns: 1, foreignKeys: 0, linkedForeignKeys: 0,
        },
      }),
    },
    drawioImporter: {
      importDrawio: async () => ({ models: {}, diagrams: [] }),
      inferDiagramType: () => 'class',
      analyzeImport: () => ({ diagrams: 0, models: 0, conflicts: [] }),
      filterImportConflicts: conflicts => conflicts,
      paginateImportConflicts: items => ({ items, page: 0, pageCount: 1, start: 0, end: items.length, total: items.length }),
    },
    exporters: {
      ERD_DDL_DIALECTS: {
        postgresql: { id: 'postgresql', label: 'PostgreSQL', fileTag: 'postgresql' },
        mysql: { id: 'mysql', label: 'MySQL', fileTag: 'mysql' },
        sqlite: { id: 'sqlite', label: 'SQLite', fileTag: 'sqlite' },
      },
      exportErdDdl: (_diagram, _models, dialect) => `-- ${dialect}`,
      exportMermaid: () => 'classDiagram',
      exportDrawio: () => '<mxfile/>',
    },
    fileInput,
    state,
    svg,
    Image: class { set src(_value) { if (this.onload) this.onload(); } },
    URL: { createObjectURL: () => 'blob:test', revokeObjectURL: () => {} },
    XMLSerializer: class { serializeToString() { return '<svg/>'; } },
    DIAGRAM_META: {
      class: { label: 'Class Diagram' }, sequence: { label: 'Sequence Diagram' },
      erd: { label: 'ER Diagram' },
    },
    DIAGRAM_TOOLS: {
      class: { elements: ['class'], relations: ['association'] },
      sequence: { elements: ['lifeline'], relations: ['msg-sync'] },
      erd: { elements: ['entity'], relations: ['erd-1n'] },
    },
    KIND_META: { class: { label: 'Class' }, entity: { label: 'Entity' } },
    MODEL_FIELDS: ['id', 'kind', 'name'],
    REL_STYLE: { association: {}, 'erd-1n': {} },
    SVGNS: 'http://www.w3.org/2000/svg',
    ...overrides,
  };
  return { deps, state, downloads, statuses, alerts, renders, modals, controller: create(deps) };
}

assert.ok(Object.isFrozen(REQUIRED_FUNCTIONS));
assert.ok(Object.isFrozen(REQUIRED_VALUES));

/* ── 의존성 검증 ────────────────────────────────────────────── */
assert.throws(() => create(), /다이어그램 내보내기 의존성이 없습니다/);
assert.throws(() => create({}), /contentBBox/);
{
  const { deps } = harness();
  const { state: _state, ...withoutState } = deps;
  assert.throws(() => create(withoutState), /state/);
  assert.throws(() => create({ ...deps, document: {} }), /document\.createElement/);
  assert.throws(() => create({ ...deps, exporters: { exportDrawio: () => '' } }), /exporters\.exportMermaid/);
  assert.throws(
    () => create({ ...deps, exporters: { ...deps.exporters, exportErdDdl: null } }),
    /exporters\.exportErdDdl/,
  );
  assert.throws(
    () => create({ ...deps, exporters: { ...deps.exporters, ERD_DDL_DIALECTS: null } }),
    /exporters\.ERD_DDL_DIALECTS/,
  );
}

/* ── 공개 API ───────────────────────────────────────────────── */
{
  const { controller } = harness();
  assert.ok(Object.isFrozen(controller));
  assert.deepEqual(Object.keys(controller).sort(), [
    'download', 'exportAllPngFiles', 'exportDrawioFile', 'exportErdDdlFile',
    'exportMermaidFile', 'exportPngActive', 'exportPngFile', 'exportSvg',
    'exportSvgFile', 'openErdDdlExportDialog',
  ]);
}

/* ── SVG / Mermaid / draw.io 내보내기 ───────────────────────── */
{
  const { controller, downloads, statuses, alerts, renders } = harness();
  assert.equal(controller.exportSvgFile(), true);
  assert.equal(downloads.at(-1).filename, 'class-diagram.svg');
  assert.deepEqual(renders, ['canvas', 'canvas'], 'SVG 내보내기는 선택 해제 전후로 캔버스를 다시 그립니다');

  assert.equal(controller.exportMermaidFile(), true);
  assert.equal(downloads.at(-1).filename, 'class-diagram.mmd');
  assert.equal(statuses.at(-1), 'Mermaid 전용 다이어그램 문법으로 내보냈습니다');

  assert.equal(controller.exportDrawioFile(), true);
  assert.equal(downloads.at(-1).filename, 'class-diagram.drawio');
  assert.equal(statuses.at(-1), 'draw.io에서 편집 가능한 XML로 내보냈습니다');
  assert.deepEqual(alerts, []);
}

/* ── ERD DDL 방언 선택과 다운로드 ──────────────────────────── */
{
  const { controller, state, downloads, statuses, alerts, modals } = harness();
  state.diagrams.push({
    id: 'erd', type: 'erd', name: 'Account ERD',
    elements: [{ id: 'entity', kind: 'entity', modelId: 'entity-model' }], relations: [],
  });
  state.activeId = 'erd';

  for (const dialect of ['postgresql', 'mysql', 'sqlite']) {
    assert.equal(controller.exportErdDdlFile(dialect), true);
  }
  assert.deepEqual(downloads.slice(-3).map(item => item.filename), [
    'account-erd.postgresql.sql',
    'account-erd.mysql.sql',
    'account-erd.sqlite.sql',
  ]);
  assert.deepEqual(statuses.slice(-3), [
    'PostgreSQL CREATE TABLE DDL로 내보냈습니다',
    'MySQL CREATE TABLE DDL로 내보냈습니다',
    'SQLite CREATE TABLE DDL로 내보냈습니다',
  ]);
  assert.deepEqual(alerts, []);

  const overlay = controller.openErdDdlExportDialog();
  assert.equal(overlay, modals[0].overlay);
  const body = modals[0].dialog.children[0];
  const choices = body.children[1];
  assert.deepEqual(choices.children.map(button => button.dataset.dialect), [
    'postgresql', 'mysql', 'sqlite',
  ]);
  choices.children[1].emit('click');
  assert.equal(overlay.removed, true);
  assert.equal(downloads.at(-1).filename, 'account-erd.mysql.sql');
}

{
  const { controller, state, alerts } = harness();
  assert.equal(controller.exportErdDdlFile('postgresql'), false);
  assert.equal(controller.openErdDdlExportDialog(), false);
  state.diagrams.push({ id: 'erd-empty', type: 'erd', name: 'Empty ERD', elements: [], relations: [] });
  state.activeId = 'erd-empty';
  assert.equal(controller.openErdDdlExportDialog(), false);
  state.diagrams.at(-1).elements.push({ id: 'entity', kind: 'entity' });
  assert.equal(controller.exportErdDdlFile('oracle'), false);
  assert.deepEqual(alerts, [
    'ER Diagram에서만 DDL을 내보낼 수 있습니다.',
    'ER Diagram에서만 DDL을 내보낼 수 있습니다.',
    'DDL로 내보낼 Entity가 없습니다.',
    '지원하지 않는 DDL 방언입니다: oracle',
  ]);
}

{
  const { deps } = harness();
  const { controller, state, alerts } = harness({
    exporters: {
      ...deps.exporters,
      exportErdDdl: () => { throw new Error('컬럼 형식 오류'); },
    },
  });
  state.diagrams.push({
    id: 'erd', type: 'erd', name: 'ERD',
    elements: [{ id: 'entity', kind: 'entity' }], relations: [],
  });
  state.activeId = 'erd';
  assert.equal(controller.exportErdDdlFile('postgresql'), false);
  assert.deepEqual(alerts, ['DDL을 내보낼 수 없습니다: 컬럼 형식 오류']);
}

/* ── 비어 있는 다이어그램은 안내 후 중단한다 ────────────────── */
{
  const { controller, state, alerts, downloads } = harness();
  state.activeId = 'd2';
  assert.equal(controller.exportPngFile(), false);
  assert.equal(controller.exportMermaidFile(), false);
  assert.equal(controller.exportDrawioFile(), false);
  assert.deepEqual(alerts, ['내보낼 요소가 없습니다.', '내보낼 요소가 없습니다.', '내보낼 요소가 없습니다.']);
  assert.deepEqual(downloads, []);
}

/* ── 그릴 내용이 없으면 SVG 내보내기는 null을 돌려준다 ──────── */
{
  const { controller, alerts } = harness({ contentBBox: () => null });
  assert.equal(controller.exportSvg(), null);
  assert.equal(controller.exportSvgFile(), false);
  assert.deepEqual(alerts, ['내보낼 요소가 없습니다.']);
}

/* ── PNG 한 장 내보내기 ────────────────────────────────────── */
{
  const { controller, state, downloads } = harness();
  state.diagrams[0].elements = [{ id: 'e1', kind: 'class', modelId: 'm1', x: 0, y: 0, w: 10, h: 10 }];
  assert.equal(controller.exportPngFile(), true);
  assert.deepEqual(downloads.map(d => d.filename), ['class-diagram.png']);
}

/* ── All PNG는 비어 있는 다이어그램을 건너뛰고 활성 탭을 복구한다 ── */
async function asyncFlows() {
  const { controller, state, downloads } = harness();
  await controller.exportAllPngFiles();
  assert.equal(state.activeId, 'd1', 'All PNG 후 활성 다이어그램은 복구되어야 합니다');
  assert.deepEqual(downloads.map(d => d.filename), ['class-diagram.png']);
}

asyncFlows().then(() => {
  console.log('diagram export tests: ok');
}, error => {
  console.error(error);
  process.exitCode = 1;
});
