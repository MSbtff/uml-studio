'use strict';

interface PersistenceEnvironment {
  document?: Document;
  indexedDB?: IDBFactory;
  navigator?: Pick<Navigator, 'storage'>;
  fetch?: typeof fetch;
}

type PersistenceApi = ReturnType<typeof createPersistence>;
declare var UMLPersistence: PersistenceApi;

(function initPersistence(
  root: typeof globalThis,
  factory: (environment: PersistenceEnvironment) => PersistenceApi,
) {
  const api = factory(root || {});
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  if (root) root.UMLPersistence = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, createPersistence);

function createPersistence(environment: PersistenceEnvironment) {
  const { text: uiText } = globalThis.UMLLanguage
    ?? require('../editor/language.js') as typeof UMLLanguage;

  const DB_NAME = 'uml-studio-v7';
  const DB_VERSION = 2;
  const STORE_NAME = 'recovery';
  const PROJECT_STORE = 'projects';
  const REVISION_STORE = 'revisions';
  const REVISION_LIMIT = 10;
  const AUTOSAVE_KEY = 'autosave';
  const PREVIOUS_KEY = 'previous';
  interface SaveMetadata {
    name?: string;
    savedAt?: number | string | null;
    createdAt?: number | string | null;
    projectVersion?: number | string | null;
    expectedRevision?: number | string | null;
  }
  interface StoredJson {
    id: string;
    json: string;
    projectVersion: number | null;
    byteLength: number;
  }
  interface AutosaveRecord extends StoredJson { savedAt: number }
  interface ProjectRecord extends StoredJson {
    name: string;
    createdAt: number;
    updatedAt: number;
    revision: number;
  }
  interface RevisionRecord extends AutosaveRecord {
    projectId: string;
    revision: number;
  }
  type RevisionNumber = number | string;
  type ProjectMetadata = Omit<ProjectRecord, 'json'>;
  type RevisionMetadata = Omit<RevisionRecord, 'json'>;

  let dbPromise: Promise<IDBDatabase> | null = null;
  let saveChain: Promise<unknown> = Promise.resolve();
  const browserOnly = environment.document?.documentElement.dataset.projectStorage === 'browser';
  let serverAvailable: boolean | null = browserOnly ? false : null;

  function indexedDBApi() {
    return environment.indexedDB || null;
  }

  function requestValue<Value>(request: IDBRequest<Value>) {
    return new Promise<Value>((resolve, reject) => {
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error || new Error(uiText('The IndexedDB request failed.', 'IndexedDB 요청에 실패했습니다.')));
    });
  }

  function transactionDone(transaction: IDBTransaction) {
    return new Promise<void>((resolve, reject) => {
      transaction.oncomplete = () => resolve();
      transaction.onabort = () => reject(transaction.error || new Error(uiText(
        'The IndexedDB transaction was aborted.',
        'IndexedDB 트랜잭션이 중단되었습니다.',
      )));
      transaction.onerror = () => reject(transaction.error || new Error(uiText('The IndexedDB transaction failed.', 'IndexedDB 트랜잭션에 실패했습니다.')));
    });
  }

  function openDatabase() {
    if (dbPromise) return dbPromise;
    const api = indexedDBApi();
    if (!api) return Promise.reject(new Error(uiText('This browser does not support IndexedDB.', '이 브라우저는 IndexedDB를 지원하지 않습니다.')));
    dbPromise = new Promise<IDBDatabase>((resolve, reject) => {
      const request = api.open(DB_NAME, DB_VERSION);
      request.onupgradeneeded = () => {
        const db = request.result;
        if (!db.objectStoreNames.contains(STORE_NAME)) {
          db.createObjectStore(STORE_NAME, { keyPath: 'id' });
        }
        if (!db.objectStoreNames.contains(PROJECT_STORE)) {
          db.createObjectStore(PROJECT_STORE, { keyPath: 'id' });
        }
        if (!db.objectStoreNames.contains(REVISION_STORE)) {
          const revisions = db.createObjectStore(REVISION_STORE, { keyPath: 'id' });
          revisions.createIndex('projectId', 'projectId', { unique: false });
        }
      };
      request.onsuccess = () => {
        const db = request.result;
        db.onversionchange = () => { db.close(); dbPromise = null; };
        resolve(db);
      };
      request.onerror = () => {
        dbPromise = null;
        reject(request.error || new Error(uiText('Could not open IndexedDB.', 'IndexedDB를 열 수 없습니다.')));
      };
      request.onblocked = () => {
        dbPromise = null;
        reject(new Error(uiText('Another tab is blocking a database upgrade.', '다른 탭이 데이터베이스 업그레이드를 막고 있습니다.')));
      };
    });
    return dbPromise;
  }

  async function writeAutosave(json: string, metadata: SaveMetadata) {
    if (typeof json !== 'string' || !json.trim()) throw new Error(uiText('No project JSON to save.', '저장할 프로젝트 JSON이 없습니다.'));
    const db = await openDatabase();
    const transaction = db.transaction(STORE_NAME, 'readwrite');
    const store = transaction.objectStore(STORE_NAME);
    const previous = await requestValue<AutosaveRecord | undefined>(store.get(AUTOSAVE_KEY));
    if (previous?.json && previous.json !== json) {
      store.put({ ...previous, id: PREVIOUS_KEY });
    }
    const savedAt = Number(metadata?.savedAt) || Date.now();
    store.put({
      id: AUTOSAVE_KEY,
      json,
      savedAt,
      projectVersion: Number(metadata?.projectVersion) || null,
      byteLength: typeof TextEncoder !== 'undefined' ? new TextEncoder().encode(json).byteLength : json.length,
    });
    await transactionDone(transaction);
    return { savedAt };
  }

  function saveAutosave(json: string, metadata: SaveMetadata = {}) {
    const saved = saveChain.catch(() => undefined).then(() => writeAutosave(json, metadata));
    saveChain = saved;
    return saved;
  }

  async function loadRecord(id = AUTOSAVE_KEY) {
    const db = await openDatabase();
    const transaction = db.transaction(STORE_NAME, 'readonly');
    const record = await requestValue<AutosaveRecord | undefined>(transaction.objectStore(STORE_NAME).get(id));
    await transactionDone(transaction);
    return record || null;
  }

  async function clearAutosave() {
    const db = await openDatabase();
    const transaction = db.transaction(STORE_NAME, 'readwrite');
    transaction.objectStore(STORE_NAME).delete(AUTOSAVE_KEY);
    transaction.objectStore(STORE_NAME).delete(PREVIOUS_KEY);
    await transactionDone(transaction);
  }

  function projectMetadata<RecordType extends StoredJson>(record: RecordType): Omit<RecordType, 'json'> {
    const { json, ...metadata } = record;
    return metadata;
  }

  function conflictError(expected: unknown, actual: unknown) {
    return Object.assign(new Error(uiText(
      'The project changed in another tab (expected revision {0}, current revision {1}).',
      '프로젝트가 다른 탭에서 변경되었습니다. (예상 {0}, 현재 {1})',
      expected,
      actual,
    )), {
      code: 'revision_conflict',
      expectedRevision: expected,
      actualRevision: actual,
    });
  }

  async function writeProject(projectId: string, json: string, metadata: SaveMetadata) {
    if (typeof projectId !== 'string' || !projectId.trim()) throw new Error(uiText('Project ID is missing.', '프로젝트 ID가 없습니다.'));
    if (typeof json !== 'string' || !json.trim()) throw new Error(uiText('No project JSON to save.', '저장할 프로젝트 JSON이 없습니다.'));
    const db = await openDatabase();
    const transaction = db.transaction([PROJECT_STORE, REVISION_STORE], 'readwrite');
    const projects = transaction.objectStore(PROJECT_STORE);
    const revisions = transaction.objectStore(REVISION_STORE);
    const current = await requestValue<ProjectRecord | undefined>(projects.get(projectId));
    const expected = metadata?.expectedRevision;
    if (current && expected !== undefined && expected !== null
      && Number(expected) !== Number(current.revision) && current.json !== json) {
      transaction.abort();
      throw conflictError(expected, current.revision);
    }
    const savedAt = Number(metadata?.savedAt) || Date.now();
    const name = String(metadata?.name || current?.name || 'Untitled Project').trim().slice(0, 200) || 'Untitled Project';
    if (current?.json === json && current.name === name) {
      await transactionDone(transaction);
      return projectMetadata(current);
    }
    const revision = (Number(current?.revision) || 0) + 1;
    const byteLength = typeof TextEncoder !== 'undefined' ? new TextEncoder().encode(json).byteLength : json.length;
    const record = {
      id: projectId,
      name,
      json,
      createdAt: Number(current?.createdAt) || Number(metadata?.createdAt) || savedAt,
      updatedAt: savedAt,
      revision,
      projectVersion: Number(metadata?.projectVersion) || null,
      byteLength,
    };
    projects.put(record);
    revisions.put({
      id: `${projectId}:${revision}`,
      projectId,
      revision,
      json,
      savedAt,
      projectVersion: record.projectVersion,
      byteLength,
    });
    const allRevisions = await requestValue<RevisionRecord[]>(revisions.index('projectId').getAll(projectId));
    allRevisions.sort((a, b) => Number(b.revision) - Number(a.revision));
    allRevisions.slice(REVISION_LIMIT).forEach(item => revisions.delete(item.id));
    await transactionDone(transaction);
    return projectMetadata(record);
  }

  function saveProject(projectId: string, json: string, metadata: SaveMetadata = {}) {
    const saved = saveChain.catch(() => undefined).then(() => writeProject(projectId, json, metadata));
    saveChain = saved;
    return saved;
  }

  async function loadProject(projectId: string) {
    if (!projectId) return null;
    const db = await openDatabase();
    const transaction = db.transaction(PROJECT_STORE, 'readonly');
    const record = await requestValue<ProjectRecord | undefined>(transaction.objectStore(PROJECT_STORE).get(projectId));
    await transactionDone(transaction);
    return record || null;
  }

  async function listProjects() {
    const db = await openDatabase();
    const transaction = db.transaction(PROJECT_STORE, 'readonly');
    const records = await requestValue<ProjectRecord[]>(transaction.objectStore(PROJECT_STORE).getAll());
    await transactionDone(transaction);
    return records.map(projectMetadata).sort((a, b) => Number(b.updatedAt) - Number(a.updatedAt));
  }

  async function listProjectRevisions(projectId: string) {
    const db = await openDatabase();
    const transaction = db.transaction(REVISION_STORE, 'readonly');
    const records = await requestValue<RevisionRecord[]>(transaction.objectStore(REVISION_STORE).index('projectId').getAll(projectId));
    await transactionDone(transaction);
    return records.map(projectMetadata).sort((a, b) => Number(b.revision) - Number(a.revision));
  }

  async function loadProjectRevision(projectId: string, revision: RevisionNumber) {
    const db = await openDatabase();
    const transaction = db.transaction(REVISION_STORE, 'readonly');
    const record = await requestValue<RevisionRecord | undefined>(transaction.objectStore(REVISION_STORE).get(`${projectId}:${Number(revision)}`));
    await transactionDone(transaction);
    return record || null;
  }

  async function renameProject(projectId: string, name: string) {
    const db = await openDatabase();
    const transaction = db.transaction(PROJECT_STORE, 'readwrite');
    const store = transaction.objectStore(PROJECT_STORE);
    const record = await requestValue<ProjectRecord | undefined>(store.get(projectId));
    if (!record) {
      transaction.abort();
      throw new Error(uiText('The project could not be found.', '프로젝트를 찾을 수 없습니다.'));
    }
    record.name = String(name || '').trim().slice(0, 200) || 'Untitled Project';
    store.put(record);
    await transactionDone(transaction);
    return projectMetadata(record);
  }

  async function deleteProject(projectId: string) {
    const db = await openDatabase();
    const transaction = db.transaction([PROJECT_STORE, REVISION_STORE], 'readwrite');
    const projects = transaction.objectStore(PROJECT_STORE);
    const revisions = transaction.objectStore(REVISION_STORE);
    projects.delete(projectId);
    const records = await requestValue<RevisionRecord[]>(revisions.index('projectId').getAll(projectId));
    records.forEach(record => revisions.delete(record.id));
    await transactionDone(transaction);
    return true;
  }

  async function requestPersistentStorage() {
    const storage = environment.navigator?.storage;
    if (!storage?.persist) return false;
    try { return !!(await storage.persist()); }
    catch (_) { return false; }
  }

  async function loadServerAutosave() {
    if (browserOnly || typeof environment.fetch !== 'function') return null;
    try {
      const response = await environment.fetch('/api/recovery/autosave', {
        headers: { Accept: 'application/json' },
        cache: 'no-store',
      });
      const isJson = (response.headers.get('content-type') || '').includes('application/json');
      if (response.status === 404) {
        serverAvailable = isJson;
        return null;
      }
      if (!response.ok || !isJson) {
        serverAvailable = false;
        return null;
      }
      const record = await response.json() as AutosaveRecord | null;
      serverAvailable = true;
      return record?.json ? record : null;
    } catch (_) {
      serverAvailable = false;
      return null;
    }
  }

  async function saveServerAutosave(json: string, metadata: SaveMetadata = {}): Promise<{ ok: boolean; savedAt: number; backend: 'sqlite' }> {
    if (serverAvailable === false || typeof environment.fetch !== 'function') {
      throw new Error(uiText('The SQLite autosave server is unavailable.', 'SQLite 자동저장 서버를 사용할 수 없습니다.'));
    }
    const response = await environment.fetch('/api/recovery/autosave', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify({
        json,
        savedAt: Number(metadata.savedAt) || Date.now(),
        projectVersion: Number(metadata.projectVersion) || null,
      }),
    });
    const isJson = (response.headers.get('content-type') || '').includes('application/json');
    if (!response.ok || !isJson) {
      serverAvailable = false;
      throw new Error(uiText('SQLite autosave server error ({0})', 'SQLite 자동저장 서버 응답 오류 ({0})', response.status));
    }
    serverAvailable = true;
    return response.json();
  }

  async function serverJson<Result>(path: string, options: RequestInit = {}): Promise<Result | null> {
    if (serverAvailable === false || typeof environment.fetch !== 'function') return null;
    try {
      const response = await environment.fetch(path, {
        cache: 'no-store',
        ...options,
        headers: { Accept: 'application/json', ...(options.headers || {}) },
      });
      const isJson = (response.headers.get('content-type') || '').includes('application/json');
      if (response.status === 404 && !isJson) {
        serverAvailable = false;
        return null;
      }
      if (response.status === 409 && isJson) {
        const detail = await response.json() as { expectedRevision?: unknown; actualRevision?: unknown };
        throw conflictError(detail.expectedRevision, detail.actualRevision);
      }
      if (!response.ok || !isJson) {
        if (response.status === 404) return null;
        throw new Error(uiText('SQLite project server error ({0})', 'SQLite 프로젝트 서버 응답 오류 ({0})', response.status));
      }
      serverAvailable = true;
      return response.status === 204 ? null : response.json();
    } catch (error) {
      if (error && typeof error === 'object' && 'code' in error && error.code === 'revision_conflict') throw error;
      serverAvailable = false;
      return null;
    }
  }

  const projectPath = (projectId: string) => `/api/projects/${encodeURIComponent(projectId)}`;

  function listServerProjects() {
    return serverJson<{ projects?: ProjectMetadata[] }>('/api/projects').then(result => Array.isArray(result?.projects) ? result.projects : []);
  }

  function loadServerProject(projectId: string) {
    return serverJson<ProjectRecord>(projectPath(projectId));
  }

  function saveServerProject(projectId: string, json: string, metadata: SaveMetadata = {}) {
    return serverJson<ProjectMetadata>(projectPath(projectId), {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        json,
        name: metadata.name,
        savedAt: Number(metadata.savedAt) || Date.now(),
        projectVersion: Number(metadata.projectVersion) || null,
        expectedRevision: metadata.expectedRevision,
      }),
    }).then(result => {
      if (!result) throw new Error(uiText('The SQLite project server is unavailable.', 'SQLite 프로젝트 서버를 사용할 수 없습니다.'));
      return result;
    });
  }

  function listServerProjectRevisions(projectId: string) {
    return serverJson<{ revisions?: RevisionMetadata[] }>(`${projectPath(projectId)}/revisions`)
      .then(result => Array.isArray(result?.revisions) ? result.revisions : []);
  }

  function loadServerProjectRevision(projectId: string, revision: RevisionNumber) {
    return serverJson<RevisionRecord>(`${projectPath(projectId)}/revisions/${Number(revision)}`);
  }

  function renameServerProject(projectId: string, name: string) {
    return serverJson<ProjectMetadata>(projectPath(projectId), {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name }),
    });
  }

  function deleteServerProject(projectId: string) {
    return serverJson<{ ok: boolean; id: string }>(projectPath(projectId), { method: 'DELETE' });
  }

  return {
    DB_NAME,
    STORE_NAME,
    PROJECT_STORE,
    REVISION_STORE,
    REVISION_LIMIT,
    AUTOSAVE_KEY,
    PREVIOUS_KEY,
    openDatabase,
    saveAutosave,
    loadAutosave: () => loadRecord(AUTOSAVE_KEY),
    loadPrevious: () => loadRecord(PREVIOUS_KEY),
    clearAutosave,
    saveProject,
    loadProject,
    listProjects,
    listProjectRevisions,
    loadProjectRevision,
    renameProject,
    deleteProject,
    requestPersistentStorage,
    loadServerAutosave,
    saveServerAutosave,
    listServerProjects,
    loadServerProject,
    saveServerProject,
    listServerProjectRevisions,
    loadServerProjectRevision,
    renameServerProject,
    deleteServerProject,
    serverAvailable: () => serverAvailable,
  };
}
