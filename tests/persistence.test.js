'use strict';

const assert = require('node:assert/strict');
const { createFakeIndexedDB } = require('./support/fake-indexeddb.js');

globalThis.indexedDB = createFakeIndexedDB();
delete require.cache[require.resolve('../dist/browser/io/persistence.js')];
const persistence = require('../dist/browser/io/persistence.js');

const projectJson = (id, revision) => JSON.stringify({
  version: 30,
  projectId: id,
  projectName: `Revision ${revision}`,
  models: { marker: { id: 'marker', name: String(revision) } },
  diagrams: [],
});

async function run() {
  assert.equal(persistence.REVISION_LIMIT, 10);

  await persistence.saveAutosave(projectJson('autosave', 1), { savedAt: 100, projectVersion: 30 });
  await persistence.saveAutosave(projectJson('autosave', 2), { savedAt: 200, projectVersion: 30 });
  assert.equal((await persistence.loadAutosave()).savedAt, 200);
  assert.equal(JSON.parse((await persistence.loadPrevious()).json).projectName, 'Revision 1');
  await persistence.saveAutosave(projectJson('autosave', 2), { savedAt: 300, projectVersion: 30 });
  assert.equal(JSON.parse((await persistence.loadPrevious()).json).projectName, 'Revision 1');

  const projectId = 'p-indexed';
  for (let revision = 1; revision <= 12; revision++) {
    const saved = await persistence.saveProject(projectId, projectJson(projectId, revision), {
      name: `Revision ${revision}`,
      savedAt: 1_700_000_000_000 + revision,
      projectVersion: 30,
      expectedRevision: revision > 1 ? revision - 1 : null,
    });
    assert.equal(saved.revision, revision);
  }
  const revisions = await persistence.listProjectRevisions(projectId);
  assert.equal(revisions.length, 10);
  assert.deepEqual(revisions.map(item => item.revision), [12, 11, 10, 9, 8, 7, 6, 5, 4, 3]);
  assert.equal(await persistence.loadProjectRevision(projectId, 2), null);
  assert.equal(JSON.parse((await persistence.loadProjectRevision(projectId, 3)).json).projectName, 'Revision 3');

  const currentJson = projectJson(projectId, 12);
  const repeated = await persistence.saveProject(projectId, currentJson, {
    name: 'Revision 12',
    expectedRevision: 1,
  });
  assert.equal(repeated.revision, 12);
  await assert.rejects(
    persistence.saveProject(projectId, projectJson(projectId, 99), {
      name: 'Revision 99',
      expectedRevision: 1,
    }),
    error => error.code === 'revision_conflict'
      && error.expectedRevision === 1
      && error.actualRevision === 12,
  );

  const renamed = await persistence.renameProject(projectId, 'Renamed');
  assert.equal(renamed.name, 'Renamed');
  assert.equal((await persistence.listProjects())[0].name, 'Renamed');

  await persistence.deleteProject(projectId);
  assert.equal(await persistence.loadProject(projectId), null);
  await assert.rejects(() => persistence.renameProject(projectId, 'Ghost'),
    /프로젝트를 찾을 수 없습니다\./,
    '다른 탭이 지운 프로젝트의 이름 변경은 트랜잭션을 중단해야 합니다');
  assert.deepEqual(await persistence.listProjectRevisions(projectId), []);

  await persistence.clearAutosave();
  assert.equal(await persistence.loadAutosave(), null);
  assert.equal(await persistence.loadPrevious(), null);

  await serverBridgeTests();

  console.log('persistence tests: ok');
}

function httpResponse(status, body, contentType = 'application/json') {
  return {
    ok: status >= 200 && status < 300,
    status,
    headers: { get: name => (String(name).toLowerCase() === 'content-type' ? contentType : null) },
    json: async () => body,
  };
}

function freshPersistence(fetchImpl, navigatorImpl) {
  if (fetchImpl === undefined) delete globalThis.fetch;
  else globalThis.fetch = fetchImpl;
  if (navigatorImpl === undefined) delete globalThis.navigator;
  else Object.defineProperty(globalThis, 'navigator', { value: navigatorImpl, configurable: true });
  delete require.cache[require.resolve('../dist/browser/io/persistence.js')];
  return require('../dist/browser/io/persistence.js');
}

async function serverBridgeTests() {
  assert.equal(await freshPersistence(undefined, {}).requestPersistentStorage(), false,
    'navigator.storage가 없으면 조용히 false입니다');
  assert.equal(
    await freshPersistence(undefined, { storage: { persist: async () => true } }).requestPersistentStorage(),
    true,
  );
  assert.equal(
    await freshPersistence(undefined, {
      storage: { persist: async () => { throw new Error('denied'); } },
    }).requestPersistentStorage(),
    false,
    '브라우저가 거부해도 예외를 흘리지 않습니다',
  );

  assert.equal(await freshPersistence(undefined).loadServerAutosave(), null,
    'fetch가 없는 환경에서는 서버를 찾지 않습니다');
  {
    const store = freshPersistence(async () => httpResponse(404, {}));
    assert.equal(await store.loadServerAutosave(), null);
    assert.equal(store.serverAvailable(), true);
  }
  {
    const store = freshPersistence(async () => httpResponse(404, null, 'text/html'));
    assert.equal(await store.loadServerAutosave(), null);
    assert.equal(store.serverAvailable(), false);
    await assert.rejects(() => store.saveServerAutosave('{}'),
      /SQLite 자동저장 서버를 사용할 수 없습니다\./,
      '서버 없음으로 판정한 뒤에는 저장을 시도하지 않습니다');
  }
  {
    const store = freshPersistence(async () => httpResponse(500, {}));
    assert.equal(await store.loadServerAutosave(), null);
    assert.equal(store.serverAvailable(), false);
  }
  {
    const store = freshPersistence(async () => { throw new Error('offline'); });
    assert.equal(await store.loadServerAutosave(), null);
    assert.equal(store.serverAvailable(), false);
  }
  {
    const store = freshPersistence(async () => httpResponse(200, { json: '{"a":1}', savedAt: 7 }));
    assert.deepEqual(await store.loadServerAutosave(), { json: '{"a":1}', savedAt: 7 });
    assert.equal(store.serverAvailable(), true);
  }
  {
    const store = freshPersistence(async () => httpResponse(200, { savedAt: 7 }));
    assert.equal(await store.loadServerAutosave(), null, 'json 본문이 없는 기록은 없는 것으로 봅니다');
  }
  {
    const sent = [];
    const store = freshPersistence(async (path, options) => {
      sent.push({ path, options });
      return httpResponse(200, { revision: 3 });
    });
    const before = Date.now();
    assert.deepEqual(await store.saveServerAutosave('{"a":1}', { projectVersion: 30 }), { revision: 3 });
    const body = JSON.parse(sent[0].options.body);
    assert.equal(sent[0].path, '/api/recovery/autosave');
    assert.equal(sent[0].options.method, 'PUT');
    assert.equal(body.projectVersion, 30);
    assert.ok(body.savedAt >= before, 'savedAt을 주지 않으면 지금 시각을 씁니다');
  }
  {
    const store = freshPersistence(async () => httpResponse(503, {}));
    await assert.rejects(() => store.saveServerAutosave('{}'), /SQLite 자동저장 서버 응답 오류 \(503\)/);
    assert.equal(store.serverAvailable(), false);
  }

  {
    const store = freshPersistence(async () =>
      httpResponse(409, { expectedRevision: 4, actualRevision: 7 }));
    await assert.rejects(
      () => store.saveServerProject('p 1', '{}', { expectedRevision: 4 }),
      error => {
        assert.equal(error.code, 'revision_conflict');
        assert.equal(error.expectedRevision, 4);
        assert.equal(error.actualRevision, 7);
        assert.match(error.message, /예상 4, 현재 7/);
        return true;
      },
    );
    assert.notEqual(store.serverAvailable(), false, '충돌은 서버 장애가 아닙니다');
  }
  {
    const requests = [];
    const store = freshPersistence(async (path, options = {}) => {
      requests.push({ path, method: options.method || 'GET' });
      if (path === '/api/projects') return httpResponse(200, { projects: [{ id: 'p-1' }] });
      if (path.endsWith('/revisions')) return httpResponse(200, { revisions: [{ revision: 2 }] });
      if (path.endsWith('/revisions/2')) return httpResponse(200, { revision: 2, json: '{}' });
      if (options.method === 'DELETE') return httpResponse(204, null);
      return httpResponse(200, { id: 'p 1', revision: 5 });
    });
    assert.deepEqual(await store.listServerProjects(), [{ id: 'p-1' }]);
    assert.deepEqual(await store.loadServerProject('p 1'), { id: 'p 1', revision: 5 });
    assert.deepEqual(await store.saveServerProject('p 1', '{}', { savedAt: 5 }), { id: 'p 1', revision: 5 });
    assert.deepEqual(await store.listServerProjectRevisions('p 1'), [{ revision: 2 }]);
    assert.deepEqual(await store.loadServerProjectRevision('p 1', 2), { revision: 2, json: '{}' });
    assert.deepEqual(await store.renameServerProject('p 1', 'New'), { id: 'p 1', revision: 5 });
    assert.equal(await store.deleteServerProject('p 1'), null, '204는 본문 없이 성공입니다');
    assert.deepEqual(requests.map(r => r.path), [
      '/api/projects',
      '/api/projects/p%201',
      '/api/projects/p%201',
      '/api/projects/p%201/revisions',
      '/api/projects/p%201/revisions/2',
      '/api/projects/p%201',
      '/api/projects/p%201',
    ], '프로젝트 id는 경로에 넣기 전에 인코딩해야 합니다');
    assert.deepEqual(requests.map(r => r.method),
      ['GET', 'GET', 'PUT', 'GET', 'GET', 'PATCH', 'DELETE']);
  }
  {
    const store = freshPersistence(async () => httpResponse(200, { projects: 'nope' }));
    assert.deepEqual(await store.listServerProjects(), []);
    assert.deepEqual(await store.listServerProjectRevisions('p-1'), []);
  }
  {
    const store = freshPersistence(async () => httpResponse(404, null, 'text/html'));
    assert.equal(await store.loadServerProject('p-1'), null);
    assert.equal(store.serverAvailable(), false);
    await assert.rejects(() => store.saveServerProject('p-1', '{}'),
      /SQLite 프로젝트 서버를 사용할 수 없습니다\./);
  }
  {
    const store = freshPersistence(async () => httpResponse(404, { error: 'not found' }));
    assert.equal(await store.loadServerProject('p-1'), null);
    assert.notEqual(store.serverAvailable(), false);
  }
  {
    const store = freshPersistence(async () => httpResponse(500, {}));
    assert.equal(await store.loadServerProject('p-1'), null, '5xx는 삼키고 로컬 저장으로 넘어갑니다');
    assert.equal(store.serverAvailable(), false);
  }
  {
    const store = freshPersistence(async () => { throw new Error('network down'); });
    assert.deepEqual(await store.listServerProjects(), []);
    assert.equal(store.serverAvailable(), false);
  }
  delete globalThis.fetch;
  delete globalThis.navigator;
}

run().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
