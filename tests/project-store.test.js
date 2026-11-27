'use strict';

const assert = require('node:assert/strict');
const {
  REQUIRED_FUNCTIONS,
  REQUIRED_VALUES,
  RECOVERY_STORAGE_KEY,
  RECOVERY_META_KEY,
  ACTIVE_PROJECT_KEY,
  PROJECT_VERSION,
  AUTOSAVE_HEARTBEAT_MS,
  create,
} = require('../dist/browser/io/project-store.js');

function fakeNode(tag = 'div') {
  const listeners = new Map();
  const node = {
    tag,
    children: [],
    textContent: '',
    className: '',
    id: '',
    disabled: false,
    type: '',
    value: '',
    title: '',
    isConnected: true,
    classList: { names: new Set(), add(name) { this.names.add(name); } },
    appendChild(child) { node.children.push(child); return child; },
    append(...nodes) { node.children.push(...nodes); },
    insertBefore(child) { node.children.unshift(child); return child; },
    get lastChild() { return node.children[node.children.length - 1] || null; },
    remove() { node.isConnected = false; node.removed = true; },
    focus() { node.focused = true; },
    select() {},
    setAttribute(name, value) { node[name] = value; },
    removeAttribute(name) { delete node[name]; },
    getAttribute(name) { return name in node ? String(node[name]) : null; },
    setCustomValidity(message) { node.validity = message; },
    reportValidity() {},
    querySelector() { return null; },
    querySelectorAll(selector) {
      const hits = [];
      const walk = current => (current.children || []).forEach(child => {
        if (child.tag === selector) hits.push(child);
        walk(child);
      });
      walk(node);
      return hits;
    },
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
    click() { node.emit('click', {}); },
  };
  return node;
}

function descendants(node, out = []) {
  (node.children || []).forEach(child => { out.push(child); descendants(child, out); });
  return out;
}

function fakeStorage() {
  const map = new Map();
  return {
    map,
    getItem: key => (map.has(key) ? map.get(key) : null),
    setItem: (key, value) => { map.set(key, String(value)); },
    removeItem: key => { map.delete(key); },
  };
}

function fakePersistence(overrides = {}) {
  const calls = [];
  const record = (name, result) => (...args) => { calls.push({ name, args }); return result(...args); };
  const base = {
    deleteProject: () => Promise.resolve(true),
    deleteServerProject: () => Promise.resolve(true),
    listProjectRevisions: () => Promise.resolve([]),
    listProjects: () => Promise.resolve([]),
    listServerProjectRevisions: () => Promise.resolve([]),
    listServerProjects: () => Promise.resolve([]),
    loadAutosave: () => Promise.resolve(null),
    loadProject: () => Promise.resolve(null),
    loadProjectRevision: () => Promise.resolve(null),
    loadServerAutosave: () => Promise.resolve(null),
    loadServerProject: () => Promise.resolve(null),
    loadServerProjectRevision: () => Promise.resolve(null),
    renameProject: () => Promise.resolve(true),
    renameServerProject: () => Promise.resolve(true),
    requestPersistentStorage: () => Promise.resolve(true),
    saveProject: () => Promise.resolve({ revision: 1 }),
    saveServerProject: () => Promise.resolve({ revision: 1 }),
    ...overrides,
  };
  const wrapped = { calls };
  Object.entries(base).forEach(([name, fn]) => { wrapped[name] = record(name, fn); });
  return wrapped;
}

function harness(overrides = {}) {
  const log = { statuses: [], renders: [], loads: [], confirms: [] };
  const timers = { timeouts: [], intervals: [], clearedIntervals: [] };
  const body = fakeNode('body');
  const byId = new Map();
  const document = {
    body,
    visibilityState: 'visible',
    createElement: tag => fakeNode(tag),
    getElementById: id => byId.get(id) || null,
    addEventListener(type, listener) { (this._l = this._l || new Map()).set(type, [...(this._l.get(type) || []), listener]); },
    removeEventListener(type, listener) { this._l?.set(type, (this._l.get(type) || []).filter(h => h !== listener)); },
    emit(type, event = {}) { (this._l?.get(type) || []).forEach(h => h(event)); },
    listenerCount(type) { return (this._l?.get(type) || []).length; },
  };
  const eventRoot = fakeNode('window');
  const localStorage = fakeStorage();
  const persistence = fakePersistence(overrides.persistenceOverrides);
  const modalFocus = {
    activate({ overlay, initialFocus }) {
      let requestCloseHandler = null;
      const handle = {
        close() { overlay.remove(); return true; },
        focusInitial(node) { node?.focus?.(); return true; },
        requestClose(reason) {
          if (requestCloseHandler) requestCloseHandler(reason, handle);
          else handle.close();
          return true;
        },
        setRequestCloseHandler(handler) { requestCloseHandler = handler; return handle; },
      };
      initialFocus?.focus?.();
      return handle;
    },
    closeOverlay(overlay) { if (!overlay) return false; overlay.remove(); return true; },
  };
  const state = {
    projectId: 'p-1',
    projectName: 'Demo',
    models: {},
    diagrams: [{ id: 'd1', type: 'class', name: 'Class Diagram', elements: [], relations: [] }],
    activeId: 'd1',
    dirty: false,
    autosaveStatus: 'idle',
    autosaveBackend: 'none',
    lastAutosavedAt: null,
    indexedRevision: null,
    sqliteRevision: null,
    storagePersistent: false,
  };

  let confirmResult = true;
  let loadResult = true;
  const deps = {
    cleanProjectName: v => String(v || '').trim().slice(0, 200) || 'Untitled Project',
    clearInterval: id => { timers.clearedIntervals.push(id); },
    clearTimeout: () => {},
    clearValidationResults: () => { log.renders.push('clearValidation'); },
    confirmAction: message => { log.confirms.push(message); return confirmResult; },
    flashStatus: message => { log.statuses.push(message); },
    hydrateCurrentProject: () => { log.renders.push('hydrate'); },
    load: (json, options) => { log.loads.push({ json, options }); return loadResult; },
    markDirty: () => { state.dirty = true; log.renders.push('markDirty'); },
    projectUid: () => 'p-new',
    renderAll: () => { log.renders.push('renderAll'); },
    renderStatus: () => { log.renders.push('renderStatus'); },
    resetHistory: () => { log.renders.push('resetHistory'); },
    sampleEmpty: () => { log.renders.push('sampleEmpty'); },
    sampleProject: () => {
      log.renders.push('sampleProject');
      state.diagrams = [{ id: 'sample', type: 'class', name: 'Class Diagram', elements: [], relations: [] }];
      state.activeId = 'sample';
    },
    serialize: () => '{"version":30}',
    setInterval: (fn, ms) => { timers.intervals.push({ fn, ms }); return timers.intervals.length; },
    setTimeout: (fn, ms) => { timers.timeouts.push({ fn, ms }); return timers.timeouts.length; },
    document,
    eventRoot,
    localStorage,
    modalFocus,
    persistence,
    state,
    ...overrides.deps,
  };
  return {
    deps, state, log, timers, document, eventRoot, localStorage, persistence, body,
    setConfirm: value => { confirmResult = value; },
    setLoadResult: value => { loadResult = value; },
    controller: create(deps),
  };
}

async function run() {
assert.ok(Object.isFrozen(REQUIRED_FUNCTIONS));
assert.ok(Object.isFrozen(REQUIRED_VALUES));
assert.equal(RECOVERY_STORAGE_KEY, 'uml-studio-v7');
assert.equal(RECOVERY_META_KEY, 'uml-studio-v7-meta');
assert.equal(ACTIVE_PROJECT_KEY, 'uml-studio-v7-active-project');
assert.equal(PROJECT_VERSION, 30, '저장 포맷 버전은 유지되어야 합니다');
assert.equal(AUTOSAVE_HEARTBEAT_MS, 10000);

assert.throws(() => create(), /Project Store 의존성이 없습니다/);
assert.throws(() => create({}), /serialize/);
{
  const { deps } = harness();
  const { state: _state, ...withoutState } = deps;
  assert.throws(() => create(withoutState), /state/);
  assert.throws(() => create({ ...deps, localStorage: {} }), /localStorage\.setItem/);
  assert.throws(() => create({ ...deps, eventRoot: {} }), /eventRoot\.addEventListener/);
  assert.throws(() => create({ ...deps, persistence: { saveProject: () => {} } }), /persistence\.saveServerProject/);
}

{
  const { controller } = harness();
  assert.ok(Object.isFrozen(controller));
  for (const name of ['attach', 'detach', 'createNewProject', 'listStoredProjects', 'markRecoveryDirty',
    'openProjectManager', 'openRecoveryHistory', 'openStoredProject', 'projectActionButton',
    'projectModal', 'projectRecords', 'rememberActiveProject', 'restoreOnStartup',
    'saveRecoveryCopy', 'scheduleRecoverySave', 'writeLocalRecovery']) {
    assert.equal(typeof controller[name], 'function', `${name}는 공개 API여야 합니다`);
  }
}

{
  const { controller, document, eventRoot, timers } = harness();
  controller.attach();
  controller.attach();
  assert.equal(document.listenerCount('visibilitychange'), 1, '가시성 리스너는 중복 등록하면 안 됩니다');
  assert.equal(eventRoot.listenerCount('pagehide'), 1);
  assert.equal(eventRoot.listenerCount('beforeunload'), 1);
  assert.equal(timers.intervals.length, 1);
  assert.equal(timers.intervals[0].ms, AUTOSAVE_HEARTBEAT_MS);
  controller.detach();
  controller.detach();
  assert.equal(document.listenerCount('visibilitychange'), 0);
  assert.equal(eventRoot.listenerCount('pagehide'), 0);
  assert.equal(eventRoot.listenerCount('beforeunload'), 0);
  assert.equal(timers.clearedIntervals.length, 1);
}

{
  const { controller, localStorage } = harness();
  assert.equal(controller.writeLocalRecovery('{"a":1}', 1234), true);
  assert.equal(localStorage.getItem(RECOVERY_STORAGE_KEY), '{"a":1}');
  assert.equal(localStorage.getItem(RECOVERY_META_KEY), '1234');
  assert.equal(localStorage.getItem(ACTIVE_PROJECT_KEY), 'p-1');
}
{
  const h = harness();
  const blocked = { ...h.deps, localStorage: { setItem() { throw new Error('quota'); }, getItem: () => null } };
  const controller = create(blocked);
  assert.equal(controller.writeLocalRecovery('{}', 1), false);
  assert.doesNotThrow(() => controller.rememberActiveProject());
}

{
  const { controller, state, timers } = harness();
  controller.scheduleRecoverySave();
  assert.equal(state.autosaveStatus, 'saving');
  assert.equal(timers.timeouts.at(-1).ms, 650);
  controller.scheduleRecoverySave(0);
  assert.equal(timers.timeouts.at(-1).ms, 0);
  state.diagrams = [];
  const before = timers.timeouts.length;
  controller.scheduleRecoverySave(0);
  assert.equal(timers.timeouts.length, before, '다이어그램이 없으면 자동저장을 예약하지 않습니다');
}
{
  const { controller, state, persistence, localStorage } = harness();
  assert.equal(await controller.saveRecoveryCopy(), true);
  assert.equal(state.autosaveStatus, 'saved');
  assert.equal(state.autosaveBackend, 'sqlite');
  assert.equal(state.indexedRevision, 1);
  assert.equal(state.sqliteRevision, 1);
  assert.equal(controller.isRecoveryDirty(), false);
  assert.equal(localStorage.getItem(RECOVERY_STORAGE_KEY), '{"version":30}');
  const saved = persistence.calls.find(call => call.name === 'saveServerProject');
  assert.equal(saved.args[0], 'p-1');
  assert.equal(saved.args[2].projectVersion, PROJECT_VERSION);
  assert.equal(saved.args[2].name, 'Demo');
}
{
  const { controller, state } = harness({
    persistenceOverrides: { saveServerProject: () => Promise.reject(new Error('offline')) },
  });
  assert.equal(await controller.saveRecoveryCopy(), true);
  assert.equal(state.autosaveBackend, 'indexeddb');
}
{
  const { controller, state } = harness({
    persistenceOverrides: {
      saveProject: () => Promise.reject(new Error('indexeddb closed')),
      saveServerProject: () => Promise.resolve({ revision: 4 }),
    },
  });
  assert.equal(await controller.saveRecoveryCopy(), true);
  assert.equal(state.autosaveBackend, 'sqlite');
  assert.equal(state.indexedRevision, null);
  assert.equal(state.sqliteRevision, 4);
}
{
  const conflict = Object.assign(new Error('conflict'), { code: 'revision_conflict' });
  const { controller, state, log } = harness({
    persistenceOverrides: {
      saveProject: () => Promise.reject(conflict),
      saveServerProject: () => Promise.reject(conflict),
    },
  });
  assert.equal(await controller.saveRecoveryCopy(), false);
  assert.equal(state.autosaveStatus, 'error');
  assert.match(log.statuses.at(-1), /다른 탭에서 이 프로젝트가 변경되었습니다/);
  await controller.saveRecoveryCopy();
  assert.equal(log.statuses.filter(m => /다른 탭에서/.test(m)).length, 1, '충돌 안내는 반복하지 않습니다');
}
{
  const { controller, state, log } = harness({
    persistenceOverrides: {
      saveProject: () => Promise.reject(new Error('closed')),
      saveServerProject: () => Promise.reject(new Error('offline')),
    },
  });
  assert.equal(await controller.saveRecoveryCopy(), true);
  assert.equal(state.autosaveStatus, 'fallback');
  assert.equal(state.autosaveBackend, 'local');
  assert.match(log.statuses.at(-1), /IndexedDB 저장 실패/);
}
{
  const h = harness();
  const controller = create({ ...h.deps, serialize: () => { throw new Error('cycle'); } });
  assert.equal(await controller.saveRecoveryCopy(), false);
  assert.equal(h.state.autosaveStatus, 'error');
  assert.match(h.log.statuses.at(-1), /^자동저장 직렬화 실패: cycle$/);
  assert.equal(h.persistence.calls.length, 0);
}

{
  const { controller } = harness({
    persistenceOverrides: {
      listProjects: () => Promise.resolve([
        { id: 'a', name: 'A(indexed)', updatedAt: 100, revision: 3 },
        { id: 'b', name: 'B', updatedAt: 500, revision: 1 },
      ]),
      listServerProjects: () => Promise.resolve([
        { id: 'a', name: 'A(sqlite)', updatedAt: 900, revision: 7 },
      ]),
    },
  });
  const projects = await controller.listStoredProjects();
  assert.deepEqual(projects.map(p => p.id), ['a', 'b'], '최근 저장 순으로 정렬합니다');
  assert.equal(projects[0].name, 'A(sqlite)', '더 최신인 백엔드 메타데이터를 씁니다');
  assert.deepEqual(projects[0].backends, ['indexed', 'sqlite']);
  assert.equal(projects[0].indexedRevision, 3);
  assert.equal(projects[0].sqliteRevision, 7);
  assert.deepEqual(projects[1].backends, ['indexed']);
}
{
  const { controller } = harness();
  assert.equal(controller.newestProjectRecord({ indexed: null, sqlite: null }), null);
  assert.equal(
    controller.newestProjectRecord({
      indexed: { json: '{}', updatedAt: 10 },
      sqlite: { json: '{}', updatedAt: 20 },
    }).updatedAt,
    20,
  );
}

{
  const { controller, state, log, localStorage } = harness({
    persistenceOverrides: {
      loadServerProject: id => Promise.resolve({ id, json: '{"v":1}', name: 'Stored', updatedAt: 900, revision: 4 }),
      loadProject: id => Promise.resolve({ id, json: '{"v":1}', name: 'Stored', updatedAt: 900, revision: 4 }),
    },
  });
  assert.equal(await controller.openStoredProject('p-2'), true);
  assert.equal(log.loads.at(-1).options.projectId, 'p-2');
  assert.equal(log.loads.at(-1).options.persist, false);
  assert.equal(state.autosaveStatus, 'saved');
  assert.equal(state.sqliteRevision, 4);
  assert.equal(localStorage.getItem(ACTIVE_PROJECT_KEY), 'p-1');
  assert.match(log.statuses.at(-1), /프로젝트를 열었습니다/);
}
{
  const { controller, log } = harness();
  assert.equal(await controller.openStoredProject('p-missing'), false);
  assert.equal(log.statuses.at(-1), '프로젝트 저장본을 찾을 수 없습니다');
}
{
  const { controller, log } = harness();
  assert.equal(await controller.openStoredProject('p-1'), true, '이미 열린 프로젝트는 다시 열지 않습니다');
  assert.deepEqual(log.loads, []);
}

{
  const { controller, state, log, setConfirm } = harness();
  setConfirm(false);
  assert.equal(await controller.createNewProject(), false);
  assert.match(log.confirms.at(-1), /새 프로젝트를 만들까요\?/);
  assert.equal(state.projectId, 'p-1');

  setConfirm(true);
  assert.equal(await controller.createNewProject('  My Project  '), true);
  assert.equal(state.projectId, 'p-new');
  assert.equal(state.projectName, 'My Project');
  assert.equal(state.sqliteRevision, null);
  assert.ok(log.renders.includes('sampleEmpty'));
  assert.ok(log.renders.includes('resetHistory'));
}
{
  const { controller, log } = harness();
  assert.equal(await controller.createNewProject('Untitled Project', false), true);
  assert.deepEqual(log.confirms, [], '확인 없이 만들 수도 있어야 합니다');
}

{
  const h = harness({
    persistenceOverrides: {
      listServerProjects: () => Promise.resolve([
        { id: 'p-old', name: 'Old', updatedAt: 100 },
        { id: 'p-keep', name: 'Keep', updatedAt: 50 },
      ]),
      loadServerProject: id => Promise.resolve({ id, json: '{"v":1}', name: 'Keep', updatedAt: 900, revision: 2 }),
    },
  });
  h.localStorage.setItem(ACTIVE_PROJECT_KEY, 'p-keep');
  assert.equal(await h.controller.restoreOnStartup(), true);
  assert.equal(h.log.loads.at(-1).options.projectId, 'p-keep', '마지막 활성 프로젝트를 우선합니다');
  assert.equal(h.log.loads.at(-1).options.silent, true);
  assert.equal(h.state.autosaveBackend, 'sqlite');
  assert.equal(h.state.sqliteRevision, 2);
  assert.equal(h.state.lastAutosavedAt, 900);
  assert.equal(h.state.autosaveStatus, 'saving');
  assert.equal(h.timers.timeouts.at(-1).ms, 0);
  assert.match(h.log.statuses.at(-1), /프로젝트를 복원했습니다/);
  assert.ok(h.log.renders.includes('renderAll'));
  assert.equal(h.state.storagePersistent, true);
}
{
  const record = { id: 'p-keep', json: '{"v":1}', name: 'Keep', updatedAt: 900, revision: 2 };
  const h = harness({
    persistenceOverrides: {
      listServerProjects: () => Promise.resolve([{ id: 'p-keep', name: 'Keep', updatedAt: 900 }]),
      loadServerProject: () => Promise.resolve(record),
      loadProject: () => Promise.resolve(record),
    },
  });
  assert.equal(await h.controller.restoreOnStartup(), true);
  assert.equal(h.state.autosaveStatus, 'saved');
  assert.equal(h.controller.isRecoveryDirty(), false);
  assert.ok(h.log.renders.includes('renderStatus'));
}
{
  const h = harness();
  assert.equal(await h.controller.restoreOnStartup(), false);
  assert.ok(h.log.renders.includes('sampleProject'));
  assert.equal(h.state.projectId, 'p-new');
  assert.equal(h.state.projectName, 'UML Studio Samples');
  assert.equal(h.localStorage.getItem(ACTIVE_PROJECT_KEY), 'p-new');
}
{
  const h = harness({
    persistenceOverrides: {
      loadServerAutosave: () => Promise.resolve({ json: '{"legacy":1}', savedAt: 777 }),
    },
  });
  assert.equal(await h.controller.restoreOnStartup(), true);
  assert.equal(h.state.autosaveBackend, 'sqlite');
  assert.equal(h.state.lastAutosavedAt, 777);
  assert.match(h.log.statuses.at(-1), /새 프로젝트 저장소로 이전했습니다/);
}

{
  const { controller } = harness();
  const button = controller.projectActionButton('열기', () => {}, true);
  assert.equal(button.tag, 'button');
  assert.equal(button.textContent, '열기');
  assert.equal(button.className, 'project-action');
  assert.equal(button.disabled, true);
}
{
  const { controller, body } = harness();
  const { overlay, dialog, header } = controller.projectModal('Project Manager', 'project-manager-modal');
  assert.equal(overlay.id, 'project-manager-modal');
  assert.equal(overlay.className, 'modal-overlay');
  assert.equal(dialog.className, 'project-dialog');
  assert.equal(header.className, 'project-dialog-header');
  assert.equal(body.children.at(-1), overlay, '모달은 body에 붙습니다');
  overlay.emit('mousedown', { target: overlay });
  assert.equal(overlay.isConnected, false, '바깥을 누르면 닫힙니다');
}
{
  const { controller, body } = harness({
    persistenceOverrides: {
      listServerProjects: () => Promise.resolve([
        { id: 'p-1', name: 'Demo', updatedAt: 1700000000000, revision: 2, byteLength: 2048 },
        { id: 'p-2', name: 'Other', updatedAt: 1600000000000, revision: 1, byteLength: 3 * 1024 * 1024 },
      ]),
    },
  });
  await controller.openProjectManager(() => {});
  const overlay = body.children.at(-1);
  const nodes = descendants(overlay);
  const rows = nodes.filter(n => String(n.className).startsWith('project-row'));
  assert.equal(rows.length, 2);
  const names = nodes.filter(n => n.className === 'project-name').map(n => n.textContent);
  assert.equal(names[0], 'Demo · 현재', '현재 프로젝트를 표시합니다');
  const metas = nodes.filter(n => n.className === 'project-meta').map(n => n.textContent);
  assert.match(metas[0], /r2 · 2 KB · SQLite$/);
  assert.match(metas[1], /3\.0 MB/);
  const currentActions = descendants(rows[0]).filter(n => n.className === 'project-action');
  assert.deepEqual(currentActions.map(b => b.textContent), ['열기', '복구', '이름', '복제', '삭제']);
  assert.equal(currentActions[0].disabled, true, '현재 프로젝트는 열기 비활성화');
  assert.equal(currentActions[4].disabled, true, '현재 프로젝트는 삭제 비활성화');
  const otherActions = descendants(rows[1]).filter(n => n.className === 'project-action');
  assert.equal(otherActions[0].disabled, false);
  assert.equal(otherActions[4].disabled, false);

  const list = nodes.find(n => n.className === 'project-list');
  assert.equal(list.getAttribute('aria-live'), 'polite');
  assert.equal(list.getAttribute('role'), 'list');
  assert.equal(list.getAttribute('aria-label'), '저장된 프로젝트 2개');
  assert.deepEqual(rows.map(row => row.getAttribute('role')), ['listitem', 'listitem']);
  rows.forEach(row => {
    const name = descendants(row).find(n => n.className === 'project-name');
    assert.ok(name.id, '행 이름에는 버튼이 가리킬 id가 필요합니다');
    descendants(row).filter(n => n.className === 'project-action').forEach(button => {
      assert.equal(button.getAttribute('aria-labelledby'), `${button.id} ${name.id}`,
        '보이는 라벨이 앞에 오고 프로젝트 이름이 뒤따라야 합니다');
    });
  });
  const buttonIds = rows.flatMap(row => row.querySelectorAll('button').map(button => button.id));
  assert.equal(new Set(buttonIds).size, buttonIds.length, '버튼 id는 행마다 달라야 합니다');
}
{
  const { controller, body } = harness();
  let fileDialogOpened = false;
  await controller.openProjectManager(() => {
    fileDialogOpened = true;
  });
  const overlay = body.children.at(-1);
  const nodes = descendants(overlay);
  const empty = nodes.find(n => n.className === 'project-empty');
  assert.equal(empty.textContent, '저장된 프로젝트가 없습니다.');
  assert.equal(nodes.find(n => n.className === 'project-list').getAttribute('role'), null,
    'list 역할은 listitem만 담을 수 있으므로 빈 상태에서는 걷어냅니다');
  nodes.find(n => n.textContent === '파일 열기…').click();
  assert.equal(fileDialogOpened, true);
  assert.equal(overlay.isConnected, false);
}
{
  const { controller, body, persistence } = harness({
    persistenceOverrides: {
      listServerProjectRevisions: () => Promise.resolve([
        { revision: 2, savedAt: 1700000002000, byteLength: 2048 },
        { revision: 1, savedAt: 1700000001000, byteLength: 1024 },
      ]),
    },
  });
  await controller.openRecoveryHistory('p-1');
  const overlay = body.children.at(-1);
  const nodes = descendants(overlay);
  const names = nodes.filter(n => n.className === 'project-name').map(n => n.textContent);
  assert.deepEqual(names, ['최신 · Revision 2', 'Revision 1'], '최신 스냅샷부터 보여줍니다');
  assert.ok(nodes.some(n => n.textContent === '이 버전 복원'));
  assert.ok(persistence.calls.some(c => c.name === 'listProjectRevisions'));
  const historyList = nodes.find(n => n.className === 'project-list');
  assert.equal(historyList.getAttribute('role'), 'list');
  assert.equal(historyList.getAttribute('aria-label'), '복구 스냅샷 2개');
  const recoveryRows = nodes.filter(n => String(n.className).startsWith('project-row'));
  recoveryRows.forEach(row => {
    const name = descendants(row).find(n => n.className === 'project-name');
    const restore = descendants(row).find(n => n.className === 'project-action');
    assert.equal(restore.getAttribute('aria-labelledby'), `${restore.id} ${name.id}`,
      '복원 버튼도 어느 스냅샷인지 함께 읽혀야 합니다');
  });
}
{
  const { controller, body } = harness();
  await controller.openRecoveryHistory('p-1');
  const overlay = body.children.at(-1);
  const empty = descendants(overlay).find(n => n.className === 'project-empty');
  assert.equal(empty.textContent, '복구 이력이 없습니다.');
}
{
  const { controller, state, persistence, body, log } = harness();
  controller.openProjectRenameDialog({ id: 'p-1', name: 'Demo' });
  const overlay = body.children.at(-1);
  const nodes = descendants(overlay);
  const input = nodes.find(n => n.id === 'project-rename-input');
  assert.equal(input.value, 'Demo');
  input.value = '  Renamed  ';
  const save = nodes.find(n => n.textContent === '이름 변경');
  save.click();
  await new Promise(resolve => setImmediate(resolve));
  assert.ok(persistence.calls.some(c => c.name === 'renameProject' && c.args[1] === 'Renamed'));
  assert.ok(persistence.calls.some(c => c.name === 'renameServerProject' && c.args[1] === 'Renamed'));
  assert.equal(state.projectName, 'Renamed');
  assert.ok(log.renders.includes('renderStatus'));
}

{
  const { controller, document, eventRoot, timers, localStorage, state } = harness();
  controller.attach();
  controller.markRecoveryDirty();
  assert.equal(controller.isRecoveryDirty(), true);

  timers.intervals[0].fn();
  assert.equal(timers.timeouts.at(-1).ms, 0, '하트비트는 즉시 저장을 예약합니다');

  document.visibilityState = 'hidden';
  document.emit('visibilitychange');
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(controller.isRecoveryDirty(), false, '탭을 숨기면 저장합니다');

  state.dirty = true;
  let prevented = 0;
  eventRoot.emit('beforeunload', { preventDefault: () => { prevented += 1; }, returnValue: null });
  assert.equal(localStorage.getItem(RECOVERY_STORAGE_KEY), '{"version":30}');
  assert.equal(prevented, 1, '저장하지 않은 변경이 있으면 이탈을 막습니다');

  state.dirty = false;
  prevented = 0;
  eventRoot.emit('beforeunload', { preventDefault: () => { prevented += 1; }, returnValue: null });
  assert.equal(prevented, 0);
  controller.detach();
}

}

run().then(() => {
  console.log('project store tests: ok');
}, error => {
  console.error(error);
  process.exitCode = 1;
});
