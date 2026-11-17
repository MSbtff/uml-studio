'use strict';

const assert = require('node:assert/strict');
const {
  REQUIRED_FUNCTIONS,
  REQUIRED_VALUES,
  DRAWIO_IMPORT_POLICIES,
  MAX_IMPORT_BYTES,
  create,
} = require('../project-import.js');
const importPreview = require('../import-preview.js');

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
    importPreview,
    ...overrides,
  };
  return { deps, state, downloads, statuses, alerts, renders, fileInput, modals, controller: create(deps) };
}

assert.ok(Object.isFrozen(REQUIRED_FUNCTIONS));
assert.ok(Object.isFrozen(REQUIRED_VALUES));
assert.ok(Object.isFrozen(DRAWIO_IMPORT_POLICIES));
assert.equal(MAX_IMPORT_BYTES, 10 * 1024 * 1024);

/* ── 의존성 검증 ────────────────────────────────────────────── */
assert.throws(() => create(), /프로젝트 가져오기 의존성이 없습니다/);
assert.throws(() => create({}), /diagramAllowsElementKind/);
{
  const { deps } = harness();
  const { state: _state, ...withoutState } = deps;
  assert.throws(() => create(withoutState), /state/);
  assert.throws(() => create({ ...deps, fileInput: {} }), /fileInput\.addEventListener/);
  assert.throws(() => create({ ...deps, drawioImporter: {} }), /drawioImporter\.importDrawio/);
  assert.throws(() => create({ ...deps, ddlImporter: {} }), /ddlImporter\.parseDdl/);
}

/* ── 공개 API ───────────────────────────────────────────────── */
{
  const { controller } = harness();
  assert.ok(Object.isFrozen(controller));
  for (const name of ['attach', 'detach', 'openProjectFileDialog',
    'openDrawioAppendDialog', 'openDdlAppendDialog', 'importSupportedFile', 'importDdlProjectFile']) {
    assert.equal(typeof controller[name], 'function', `${name}는 공개 API여야 합니다`);
  }
}

/* ── attach/detach는 중복 등록하지 않는다 ───────────────────── */
{
  const { controller, fileInput } = harness();
  controller.attach();
  controller.attach();
  assert.equal(fileInput.listenerCount('change'), 1, '파일 입력 리스너는 중복 등록하면 안 됩니다');
  controller.detach();
  controller.detach();
  assert.equal(fileInput.listenerCount('change'), 0);
}

/* ── 파일 대화상자 ──────────────────────────────────────────── */
{
  const { controller, fileInput } = harness();
  controller.openProjectFileDialog();
  assert.equal(fileInput.accept, '.json,.drawio,.xml');
  assert.equal(fileInput.clicked, 1);
  controller.openDrawioAppendDialog();
  assert.equal(fileInput.accept, '.drawio,.xml');
  assert.equal(fileInput.clicked, 2);
  controller.openDdlAppendDialog();
  assert.equal(fileInput.accept, '.sql');
  assert.equal(fileInput.clicked, 3);
}

/* ── 10MB 초과 파일은 거절한다 ──────────────────────────────── */
{
  const { controller, fileInput, alerts } = harness();
  controller.attach();
  const target = { files: [{ size: MAX_IMPORT_BYTES + 1, name: 'huge.json', text: async () => '{}' }], value: 'huge.json' };
  fileInput.emit('change', { target });
  assert.deepEqual(alerts, ['프로젝트 파일은 10MB 이하만 열 수 있습니다.']);
  assert.equal(target.value, '');
}

{
  const { controller, fileInput, alerts } = harness();
  controller.attach();
  controller.openDdlAppendDialog();
  const target = { files: [{ size: MAX_IMPORT_BYTES + 1, name: 'huge.sql', text: async () => '' }], value: 'huge.sql' };
  fileInput.emit('change', { target });
  assert.deepEqual(alerts, ['DDL 파일은 10MB 이하만 가져올 수 있습니다.']);
  assert.equal(fileInput.accept, '.json,.drawio,.xml');
}

/* ── 비동기 흐름: 파일 종류 라우팅 ─────────────────────────── */
async function asyncFlows() {
  {
    const { controller, statuses } = harness();
    assert.equal(await controller.importSupportedFile('{"projectId":"p-9"}', 'demo.json'), true);
    assert.equal(statuses.at(-1), '프로젝트 파일을 열었습니다 · Demo');
  }
  {
    const { controller, alerts } = harness();
    assert.equal(await controller.importSupportedFile('not json', 'demo.json'), false);
    assert.match(alerts[0], /^파일을 읽을 수 없습니다: /);
  }
  {
    /* .drawio 확장자와 mxfile 본문 모두 draw.io 경로로 보낸다 */
    const seen = [];
    const { controller } = harness({
      drawioImporter: {
        importDrawio: async () => { seen.push('importDrawio'); throw new Error('stop'); },
        inferDiagramType: () => 'class',
        analyzeImport: () => ({ diagrams: 0, models: 0, conflicts: [] }),
        filterImportConflicts: c => c,
        paginateImportConflicts: items => ({ items, page: 0, pageCount: 1, start: 0, end: items.length, total: items.length }),
      },
    });
    assert.equal(await controller.importSupportedFile('<xml/>', 'diagram.drawio'), false);
    assert.equal(await controller.importSupportedFile('<mxfile></mxfile>', 'unnamed'), false);
    assert.deepEqual(seen, ['importDrawio', 'importDrawio']);
  }
  {
    /* .sql 확장자와 CREATE TABLE 본문은 실행하지 않고 DDL 파서로 보낸다 */
    const seen = [];
    const { controller } = harness({
      ddlImporter: {
        parseDdl: source => { seen.push(source); throw new Error('stop'); },
      },
    });
    assert.equal(await controller.importSupportedFile('CREATE TABLE users(id BIGINT);', 'schema.sql'), false);
    assert.equal(await controller.importSupportedFile('CREATE TABLE posts(id BIGINT);', 'unnamed'), false);
    assert.deepEqual(seen, ['CREATE TABLE users(id BIGINT);', 'CREATE TABLE posts(id BIGINT);']);
  }
  {
    const { controller, alerts } = harness();
    assert.equal(await controller.importSupportedFile('{}', 'demo.json', 'append-drawio'), false);
    assert.deepEqual(alerts, ['현재 프로젝트 가져오기는 .drawio 또는 .xml 파일만 지원합니다.']);
  }
  {
    const { controller, alerts } = harness();
    assert.equal(await controller.importSupportedFile('{}', 'demo.json', 'append-ddl'), false);
    assert.deepEqual(alerts, ['DDL 가져오기는 .sql 파일만 지원합니다.']);
  }
  {
    const { controller, state, statuses, modals } = harness();
    const importing = controller.importDdlProjectFile('CREATE TABLE users(id BIGINT PRIMARY KEY);', 'schema.sql');
    assert.equal(modals.length, 1);
    const body = modals[0].dialog.children[0];
    assert.match(body.children[0].textContent, /schema\.sql/);
    const footer = modals[0].dialog.children.at(-1);
    assert.deepEqual(footer.children.map(button => button.textContent), ['취소', '가져오기 (1)']);
    footer.children[1].emit('click');
    assert.equal(await importing, true);
    assert.equal(state.diagrams.at(-1).type, 'erd');
    assert.equal(state.diagrams.at(-1).name, 'schema');
    assert.equal(state.activeId, state.diagrams.at(-1).id);
    assert.equal(statuses.at(-1), 'DDL 테이블 1개를 ER Diagram으로 가져왔습니다');
  }
}

/* ── draw.io 다이어그램 이름 충돌 ───────────────────────────── */
{
  const { controller } = harness();
  const used = new Set(['class diagram']);
  assert.equal(controller.importedDiagramName('Fresh', used), 'Fresh');
  assert.equal(controller.importedDiagramName('Class Diagram', used), 'Class Diagram (Imported)');
  assert.equal(controller.importedDiagramName('Class Diagram', used), 'Class Diagram (Imported 2)');
  assert.equal(controller.importedDiagramName('   ', used), 'Imported draw.io');
}

/* ── draw.io 다이어그램 종류 판별 ───────────────────────────── */
{
  const { controller } = harness();
  assert.equal(controller.resolveImportedDrawioType([{ kind: 'class' }], [{ kind: 'association' }]), 'class');
  assert.equal(
    controller.resolveImportedDrawioType([{ kind: 'lifeline' }], [{ kind: 'msg-sync' }]),
    'sequence',
    '추론한 종류가 맞지 않으면 호환되는 다른 종류를 고릅니다',
  );
  assert.throws(
    () => controller.resolveImportedDrawioType([{ kind: 'class' }], [], 'mindmap'),
    /지원하지 않는 draw\.io 다이어그램 종류입니다/,
  );
  assert.throws(
    () => controller.resolveImportedDrawioType([{ kind: 'lifeline' }], [], 'class'),
    /맞지 않습니다/,
  );
}

/* ── 가져온 프로젝트는 새 id로 다시 매핑된다 ────────────────── */
{
  const { controller, state } = harness();
  state.models = { existing: { id: 'existing', kind: 'class', name: 'CanvasView' } };
  const imported = {
    models: {
      old1: { id: 'old1', kind: 'class', name: 'CanvasView' },
      old2: { id: 'old2', kind: 'association', name: 'uses', fromModelId: 'old1', toModelId: 'old1' },
    },
    diagrams: [{
      id: 'imported-d1', type: 'class', name: 'Class Diagram',
      elements: [{ id: 'v1', kind: 'class', modelId: 'old1' }],
      relations: [{ id: 'v2', kind: 'association', modelId: 'old2', from: 'v1', to: 'v1' }],
    }],
  };
  const diagrams = controller.importedProjectWithFreshIds(JSON.parse(JSON.stringify(imported)));
  assert.equal(diagrams.length, 1);
  assert.notEqual(diagrams[0].id, 'imported-d1', '다이어그램 id는 새로 발급합니다');
  assert.equal(diagrams[0].name, 'Class Diagram (Imported)', '이름 충돌은 자동으로 피합니다');
  const [element] = diagrams[0].elements;
  const [relation] = diagrams[0].relations;
  assert.notEqual(element.modelId, 'old1');
  assert.equal(relation.from, element.id, '관계 끝점은 새 뷰 id를 가리켜야 합니다');
  assert.equal(state.models[relation.modelId].fromModelId, element.modelId);
  assert.ok(state.models[element.modelId], '가져온 모델은 저장소에 등록됩니다');
  assert.ok(state.models.existing, '기존 모델은 keepBoth에서 그대로 유지됩니다');
}
{
  /* reuse 정책은 호환 충돌 모델을 기존 모델로 합친다 */
  const { controller, state } = harness();
  state.models = { existing: { id: 'existing', kind: 'class', name: 'CanvasView' } };
  const imported = {
    models: { old1: { id: 'old1', kind: 'class', name: 'CanvasView' } },
    diagrams: [{
      id: 'imported-d1', type: 'class', name: 'Imported',
      elements: [{ id: 'v1', kind: 'class', modelId: 'old1' }],
      relations: [],
    }],
  };
  const analysis = {
    conflicts: [{ importedModelId: 'old1', matchModelId: 'existing', compatible: true, changedFields: [] }],
  };
  const diagrams = controller.importedProjectWithFreshIds(imported, 'reuse', analysis);
  assert.equal(diagrams[0].elements[0].modelId, 'existing');
  assert.equal(Object.keys(state.models).length, 1, 'reuse는 새 모델을 추가하지 않습니다');
}

{
  /* replace 정책은 기존 모델의 필드를 가져온 값으로 갈아끼운다 */
  const { controller, state } = harness();
  state.models = {
    existing: { id: 'existing', kind: 'class', name: 'CanvasView', stale: 'gone' },
  };
  const imported = {
    models: { old1: { id: 'old1', kind: 'class', name: 'Renamed' } },
    diagrams: [{
      id: 'imported-d1', type: 'class', name: 'Imported',
      elements: [{ id: 'v1', kind: 'class', modelId: 'old1' }],
      relations: [],
    }],
  };
  const analysis = {
    conflicts: [{ importedModelId: 'old1', matchModelId: 'existing', compatible: true, changedFields: ['name'] }],
  };
  controller.importedProjectWithFreshIds(imported, 'replace', analysis);
  assert.equal(Object.keys(state.models).length, 1, 'replace도 새 모델을 추가하지 않습니다');
  assert.equal(state.models.existing.name, 'Renamed');
  assert.equal(state.models.existing.id, 'existing', '기존 모델 id는 그대로 유지합니다');
  assert.equal(state.models.existing.stale, 'gone',
    'MODEL_FIELDS 밖의 값은 건드리지 않습니다');
}

{
  /* 요청한 종류가 셀 구성과 맞으면 추론하지 않고 그대로 쓴다 */
  const { controller } = harness();
  assert.equal(
    controller.resolveImportedDrawioType([{ kind: 'class' }], [{ kind: 'association' }], 'class'),
    'class',
  );
}

/* ── 가져오기 실패와 되돌리기 ───────────────────────────────── */
const drawioSource = (models, diagrams) => ({
  importDrawio: async () => ({ version: 30, models, diagrams }),
  inferDiagramType: () => 'class',
  analyzeImport: () => ({
    diagrams: diagrams.length, models: Object.keys(models).length,
    elementViews: 1, relationViews: 0, compatibleConflicts: 0, incompatibleConflicts: 0,
    diagramDetails: diagrams.map(d => ({ name: d.name, type: d.type, elements: 1, relations: 0 })),
    conflicts: [],
  }),
  filterImportConflicts: c => c,
  paginateImportConflicts: items => ({ items, page: 0, pageCount: 1, start: 0, end: items.length, total: items.length }),
});
const drawioProject = () => ({
  models: { m1: { id: 'm1', kind: 'class', name: 'Imported' } },
  diagrams: [{
    id: 'dr1', type: 'class', name: 'Imported draw.io',
    elements: [{ id: 'v1', kind: 'class', modelId: 'm1' }], relations: [],
  }],
});
/* 미리보기의 마지막 버튼이 "가져오기", 첫 버튼이 "취소"다 */
const previewFooter = modals => modals.at(-1).dialog.children.at(-1);
/* 미리보기는 파서를 await한 뒤에야 열리므로 마이크로태스크를 한 번 흘려보낸다 */
const settle = () => new Promise(resolve => setImmediate(resolve));

async function importFailureFlows() {
  {
    /* 미리보기를 취소하면 아무것도 바꾸지 않는다 */
    const { models, diagrams } = drawioProject();
    const { controller, state, statuses, modals } = harness({ drawioImporter: drawioSource(models, diagrams) });
    const before = state.diagrams.length;
    const importing = controller.importDrawioProjectFile('<mxfile/>', 'merge.drawio', true);
    await settle();
    previewFooter(modals).children[0].emit('click');
    assert.equal(await importing, false);
    assert.equal(state.diagrams.length, before, '취소는 다이어그램을 추가하지 않습니다');
    assert.equal(statuses.at(-1), 'draw.io 가져오기를 취소했습니다');
  }
  {
    /* 병합이 검증을 통과하면 새 다이어그램이 활성화된다 */
    const { models, diagrams } = drawioProject();
    const { controller, state, statuses, modals } = harness({ drawioImporter: drawioSource(models, diagrams) });
    const importing = controller.importDrawioProjectFile('<mxfile/>', 'merge.drawio', true);
    await settle();
    previewFooter(modals).children[1].emit('click');
    assert.equal(await importing, true);
    assert.equal(state.diagrams.length, 3, '기존 두 개 뒤에 가져온 하나가 붙습니다');
    assert.equal(state.activeId, state.diagrams.at(-1).id, '가져온 다이어그램으로 이동합니다');
    assert.match(statuses.at(-1), /draw\.io 다이어그램 1개를 프로젝트로 가져왔습니다/);
  }
  {
    /* 검증이 실패하면 되돌리고 사용자에게 알린다 */
    const { models, diagrams } = drawioProject();
    const rollbacks = [];
    const { controller, alerts, modals } = harness({
      drawioImporter: drawioSource(models, diagrams),
      validateProjectData: () => { throw new Error('알 수 없는 요소 종류'); },
      rollbackLastSnapshot: () => { rollbacks.push('rollback'); },
    });
    const importing = controller.importDrawioProjectFile('<mxfile/>', 'merge.drawio', true);
    await settle();
    previewFooter(modals).children[1].emit('click');
    assert.equal(await importing, false);
    assert.deepEqual(rollbacks, ['rollback'], '검증 실패는 반드시 스냅샷으로 되돌려야 합니다');
    assert.match(alerts.at(-1), /^draw\.io 병합 검증에 실패하여 변경을 되돌렸습니다: 알 수 없는 요소 종류$/);
  }
  {
    /* 새 프로젝트로 열기는 현재 프로젝트를 먼저 복구본으로 저장한다 */
    const { models, diagrams } = drawioProject();
    const saved = [];
    const { controller, state, statuses, modals } = harness({
      drawioImporter: drawioSource(models, diagrams),
      saveRecoveryCopy: async () => { saved.push('recovery'); return true; },
    });
    const importing = controller.importDrawioProjectFile('<mxfile/>', 'fresh.drawio', false);
    await settle();
    previewFooter(modals).children[1].emit('click');
    assert.equal(await importing, true);
    assert.deepEqual(saved, ['recovery'], '덮어쓰기 전에 지금 상태를 먼저 보관합니다');
    assert.equal(state.sqliteRevision, null, '새 프로젝트는 revision을 물려받지 않습니다');
    assert.equal(state.indexedRevision, null);
    assert.match(statuses.at(-1), /draw\.io 프로젝트를 열었습니다/);
  }
  {
    /* DDL 병합도 같은 방식으로 되돌린다 */
    const rollbacks = [];
    const { controller, alerts, modals } = harness({
      validateProjectData: () => { throw new Error('컬럼 정의가 올바르지 않습니다'); },
      rollbackLastSnapshot: () => { rollbacks.push('rollback'); },
    });
    const importing = controller.importDdlProjectFile('CREATE TABLE users(id BIGINT);', 'schema.sql');
    await settle();
    previewFooter(modals).children[1].emit('click');
    assert.equal(await importing, false);
    assert.deepEqual(rollbacks, ['rollback']);
    assert.match(alerts.at(-1), /^DDL 병합 검증에 실패하여 변경을 되돌렸습니다: 컬럼 정의가 올바르지 않습니다$/);
  }
  {
    /* 파일을 읽지 못하면 안내만 하고 입력을 되돌린다 */
    const { controller, fileInput, alerts } = harness();
    controller.attach();
    const target = {
      files: [{ size: 10, name: 'broken.json', text: async () => { throw new Error('디스크 오류'); } }],
      value: 'broken.json',
    };
    fileInput.emit('change', { target });
    await new Promise(resolve => setImmediate(resolve));
    assert.deepEqual(alerts, ['파일을 읽을 수 없습니다: 디스크 오류']);
    assert.equal(target.value, '');
    assert.equal(fileInput.accept, '.json,.drawio,.xml');
  }
}

asyncFlows().then(importFailureFlows).then(() => {
  console.log('project import tests: ok');
}, error => {
  console.error(error);
  process.exitCode = 1;
});
