// @ts-nocheck
'use strict';

/* Project store — recovery autosave scheduling across SQLite/IndexedDB/local
   storage, the stored-project catalogue, and the Project Manager · Rename ·
   Recovery History dialogs that sit on top of them. */
(function initProjectStoreModule(root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root) root.UMLProjectStore = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function createProjectStoreModule() {
  const REQUIRED_FUNCTIONS = Object.freeze([
    'cleanProjectName',
    'clearInterval',
    'clearTimeout',
    'clearValidationResults',
    'confirmAction',
    'flashStatus',
    'hydrateCurrentProject',
    'load',
    'markDirty',
    'projectUid',
    'renderAll',
    'renderStatus',
    'resetHistory',
    'sampleEmpty',
    'sampleProject',
    'serialize',
    'setInterval',
    'setTimeout',
  ]);
  const REQUIRED_VALUES = Object.freeze([
    'document',
    'eventRoot',
    'localStorage',
    'modalFocus',
    'persistence',
    'state',
  ]);
  const RECOVERY_STORAGE_KEY = 'uml-studio-v7';
  const RECOVERY_META_KEY = 'uml-studio-v7-meta';
  const ACTIVE_PROJECT_KEY = 'uml-studio-v7-active-project';
  const PROJECT_VERSION = 30;
  const AUTOSAVE_HEARTBEAT_MS = 10000;
  const PERSISTENCE_METHODS = Object.freeze([
    'deleteProject', 'deleteServerProject', 'listProjectRevisions', 'listProjects',
    'listServerProjectRevisions', 'listServerProjects', 'loadAutosave', 'loadProject',
    'loadProjectRevision', 'loadServerAutosave', 'loadServerProject', 'loadServerProjectRevision',
    'renameProject', 'renameServerProject', 'requestPersistentStorage', 'saveProject',
    'saveServerProject',
  ]);

  function create(dependencies) {
    const deps = dependencies || {};
    const missing = REQUIRED_FUNCTIONS.filter(name => typeof deps[name] !== 'function');
    REQUIRED_VALUES.forEach(name => {
      if (deps[name] == null) missing.push(name);
    });
    if (deps.localStorage && typeof deps.localStorage.setItem !== 'function') missing.push('localStorage.setItem');
    if (deps.eventRoot && typeof deps.eventRoot.addEventListener !== 'function') missing.push('eventRoot.addEventListener');
    if (deps.modalFocus) {
      ['activate', 'closeOverlay'].forEach(name => {
        if (typeof deps.modalFocus[name] !== 'function') missing.push(`modalFocus.${name}`);
      });
    }
    if (deps.persistence) {
      PERSISTENCE_METHODS.forEach(name => {
        if (typeof deps.persistence[name] !== 'function') missing.push(`persistence.${name}`);
      });
    }
    if (missing.length) {
      throw new TypeError(`Project Store 의존성이 없습니다: ${[...new Set(missing)].join(', ')}`);
    }

    const {
      cleanProjectName,
      clearInterval,
      clearTimeout,
      clearValidationResults,
      confirmAction,
      flashStatus,
      hydrateCurrentProject,
      load,
      markDirty,
      projectUid,
      renderAll,
      renderStatus,
      resetHistory,
      sampleEmpty,
      sampleProject,
      serialize,
      setInterval,
      setTimeout,
      document,
      eventRoot,
      localStorage,
      modalFocus,
      persistence,
      state,
    } = deps;

    let autosaveTimer = null;
    let autosaveErrorShown = false;
    let recoveryDirty = true;
    let heartbeatTimer = null;
    let attached = false;

    function markRecoveryDirty() { recoveryDirty = true; }
    function isRecoveryDirty() { return recoveryDirty; }

    function writeLocalRecovery(json, savedAt) {
      try {
        localStorage.setItem(RECOVERY_STORAGE_KEY, json);
        localStorage.setItem(RECOVERY_META_KEY, String(savedAt));
        if (state.projectId) localStorage.setItem(ACTIVE_PROJECT_KEY, state.projectId);
        return true;
      } catch (_) {
        return false;
      }
    }

    function scheduleRecoverySave(delay = 650) {
      if (!state.diagrams.length) return;
      clearTimeout(autosaveTimer);
      state.autosaveStatus = 'saving';
      autosaveTimer = setTimeout(() => saveRecoveryCopy(), delay);
    }

    async function saveRecoveryCopy() {
      clearTimeout(autosaveTimer);
      autosaveTimer = null;
      if (!state.diagrams.length) return false;
      const savedAt = Date.now();
      let json;
      try { json = serialize(); }
      catch (err) {
        state.autosaveStatus = 'error';
        flashStatus(`자동저장 직렬화 실패: ${err.message}`);
        return false;
      }

      const localSaved = writeLocalRecovery(json, savedAt);
      const metadata = { savedAt, projectVersion: PROJECT_VERSION, name: state.projectName };
      const [indexedResult, sqliteResult] = await Promise.allSettled([
        persistence.saveProject(state.projectId, json, { ...metadata, expectedRevision: state.indexedRevision }),
        persistence.saveServerProject(state.projectId, json, { ...metadata, expectedRevision: state.sqliteRevision }),
      ]);
      const indexedSaved = indexedResult.status === 'fulfilled';
      const sqliteSaved = sqliteResult.status === 'fulfilled';
      if (indexedSaved) state.indexedRevision = indexedResult.value.revision;
      if (sqliteSaved) state.sqliteRevision = sqliteResult.value.revision;
      const conflict = [indexedResult, sqliteResult]
        .find(result => result.status === 'rejected' && result.reason?.code === 'revision_conflict');
      if (conflict) {
        state.autosaveStatus = 'error';
        recoveryDirty = false;
        renderStatus();
        if (!autosaveErrorShown) {
          flashStatus('다른 탭에서 이 프로젝트가 변경되었습니다 · Project Manager에서 최신본을 확인하세요');
          autosaveErrorShown = true;
        }
        return false;
      }
      if (indexedSaved || sqliteSaved) {
        state.autosaveStatus = 'saved';
        state.autosaveBackend = sqliteSaved ? 'sqlite' : 'indexeddb';
        state.lastAutosavedAt = savedAt;
        recoveryDirty = false;
        autosaveErrorShown = false;
        renderStatus();
        return true;
      }
      {
        state.autosaveStatus = localSaved ? 'fallback' : 'error';
        state.autosaveBackend = localSaved ? 'local' : 'none';
        if (localSaved) state.lastAutosavedAt = savedAt;
        if (localSaved) recoveryDirty = false;
        renderStatus();
        if (!autosaveErrorShown) {
          flashStatus(localSaved
            ? 'IndexedDB 저장 실패 · 비상 복구본은 브라우저 저장소에 보관했습니다'
            : '자동 복구 저장 실패: SQLite와 IndexedDB를 모두 사용할 수 없습니다');
          autosaveErrorShown = true;
        }
        return localSaved;
      }
    }

    function rememberActiveProject() {
      try { localStorage.setItem(ACTIVE_PROJECT_KEY, state.projectId); }
      catch (_) { /* 비상 저장본은 별도로 계속 시도한다 */ }
    }

    async function projectRecords(projectId) {
      const [indexed, sqlite] = await Promise.all([
        persistence.loadProject(projectId).catch(() => null),
        persistence.loadServerProject(projectId),
      ]);
      return { indexed, sqlite };
    }

    function newestProjectRecord(records) {
      return [records.sqlite, records.indexed]
        .filter(record => record?.json)
        .sort((a, b) => Number(b.updatedAt) - Number(a.updatedAt))[0] || null;
    }

    async function listStoredProjects() {
      const [indexed, sqlite] = await Promise.all([
        persistence.listProjects().catch(() => []),
        persistence.listServerProjects(),
      ]);
      const projects = new Map();
      const add = (record, backend) => {
        const current = projects.get(record.id) || { id: record.id, backends: [] };
        current.backends.push(backend);
        current[`${backend}Revision`] = record.revision;
        if (!current.updatedAt || Number(record.updatedAt) >= Number(current.updatedAt)) Object.assign(current, record);
        projects.set(record.id, current);
      };
      indexed.forEach(record => add(record, 'indexed'));
      sqlite.forEach(record => add(record, 'sqlite'));
      return [...projects.values()].sort((a, b) => Number(b.updatedAt) - Number(a.updatedAt));
    }

    async function openStoredProject(projectId, options = {}) {
      if (projectId === state.projectId && !options.force) return true;
      if (state.projectId && state.diagrams.length) await saveRecoveryCopy();
      const records = await projectRecords(projectId);
      const record = newestProjectRecord(records);
      if (!record) {
        flashStatus('프로젝트 저장본을 찾을 수 없습니다');
        return false;
      }
      const loaded = load(record.json, {
        persist: false,
        projectId,
        projectName: record.name,
      });
      if (!loaded) return false;
      state.indexedRevision = records.indexed?.revision ?? null;
      state.sqliteRevision = records.sqlite?.revision ?? null;
      state.lastAutosavedAt = record.updatedAt || null;
      state.autosaveBackend = records.sqlite ? 'sqlite' : 'indexeddb';
      state.autosaveStatus = 'saved';
      recoveryDirty = false;
      rememberActiveProject();
      renderAll();
      flashStatus(`프로젝트를 열었습니다 · ${state.projectName}`);
      if (!records.indexed || !records.sqlite || records.indexed.updatedAt !== records.sqlite.updatedAt) {
        recoveryDirty = true;
        scheduleRecoverySave(0);
      }
      return true;
    }

    async function createNewProject(name = 'Untitled Project', requireConfirmation = true) {
      if (requireConfirmation && !confirmAction('새 프로젝트를 만들까요? 현재 프로젝트는 자동저장 후 전환됩니다.')) return false;
      if (state.projectId && state.diagrams.length) await saveRecoveryCopy();
      state.projectId = projectUid();
      state.projectName = cleanProjectName(name);
      state.sqliteRevision = null;
      state.indexedRevision = null;
      sampleEmpty();
      resetHistory();
      clearValidationResults();
      markDirty();
      rememberActiveProject();
      renderAll();
      scheduleRecoverySave(0);
      return true;
    }

    function projectActionButton(label, action, disabled = false) {
      const button = document.createElement('button');
      button.type = 'button'; button.className = 'project-action'; button.textContent = label; button.disabled = disabled;
      button.addEventListener('click', action);
      return button;
    }

    /* every row repeats the same five button labels, so on their own they read as
       "열기 · 복구 · 이름 …" over and over with no way to tell the rows apart.
       Naming each button with its own label *plus* the row name keeps the visible
       text at the front (WCAG 2.5.3) and still says which project it acts on. */
    let rowNameSequence = 0;
    function nameRowActions(row, nameNode) {
      row.setAttribute('role', 'listitem');
      if (!nameNode.id) nameNode.id = `uml-project-row-${++rowNameSequence}`;
      [...row.querySelectorAll('button')].forEach((button, index) => {
        if (!button.id) button.id = `${nameNode.id}-action-${index}`;
        button.setAttribute('aria-labelledby', `${button.id} ${nameNode.id}`);
      });
    }

    /* a `list` may only contain `listitem` children, so the loading and empty
       states drop the role instead of sitting inside a broken list */
    function markProjectList(list, hasRows, label) {
      if (hasRows) {
        list.setAttribute('role', 'list');
        list.setAttribute('aria-label', label);
      } else {
        list.removeAttribute('role');
        list.removeAttribute('aria-label');
      }
    }

    function projectModal(titleText, modalId) {
      modalFocus.closeOverlay(document.getElementById(modalId), { restoreFocus: false });
      const overlay = document.createElement('div'); overlay.id = modalId; overlay.className = 'modal-overlay';
      const dialog = document.createElement('div'); dialog.className = 'project-dialog';
      const header = document.createElement('div'); header.className = 'project-dialog-header';
      const title = document.createElement('strong'); title.textContent = titleText;
      const close = document.createElement('button'); close.type = 'button'; close.className = 'modal-close'; close.textContent = '×'; close.title = '닫기';
      close.setAttribute('aria-label', `${titleText} 닫기`);
      header.append(title, close); dialog.appendChild(header); overlay.appendChild(dialog); document.body.appendChild(overlay);
      const modal = modalFocus.activate({ overlay, dialog });
      close.addEventListener('click', () => modal.requestClose('close-button'));
      overlay.addEventListener('mousedown', event => {
        if (event.target === overlay) modal.requestClose('backdrop');
      });
      return { overlay, dialog, header, modal };
    }

    function openProjectRenameDialog(project, onRenamed) {
      const { dialog, modal } = projectModal('Rename Project', 'project-rename-modal');
      const body = document.createElement('div'); body.className = 'project-rename-body';
      const label = document.createElement('label'); label.textContent = '프로젝트 이름'; label.htmlFor = 'project-rename-input';
      const input = document.createElement('input'); input.id = 'project-rename-input'; input.className = 'project-name-input';
      input.type = 'text'; input.maxLength = 200; input.value = project.name || 'Untitled Project';
      const footer = document.createElement('div'); footer.className = 'project-dialog-footer';
      const cancel = projectActionButton('취소', () => modal.close());
      const save = projectActionButton('이름 변경', async () => {
        const clean = cleanProjectName(input.value);
        if (!input.value.trim()) { input.setCustomValidity('프로젝트 이름을 입력하세요.'); input.reportValidity(); return; }
        save.disabled = true;
        await Promise.allSettled([
          persistence.renameProject(project.id, clean),
          persistence.renameServerProject(project.id, clean),
        ]);
        if (project.id === state.projectId) {
          state.projectName = clean; markDirty(); scheduleRecoverySave(0); renderStatus();
        }
        if (typeof onRenamed === 'function') await onRenamed();
        modal.close();
      });
      save.classList.add('project-primary');
      input.addEventListener('input', () => input.setCustomValidity(''));
      input.addEventListener('keydown', event => {
        if (event.key === 'Enter') { event.preventDefault(); save.click(); }
      });
      body.append(label, input); footer.append(cancel, save); dialog.append(body, footer);
      modal.setRequestCloseHandler(() => cancel.click());
      modal.focusInitial(input); input.select();
    }

    const formatProjectTime = value => value
      ? new Date(Number(value)).toLocaleString('ko-KR', { dateStyle: 'short', timeStyle: 'medium' })
      : '저장 시각 없음';
    const formatBytes = value => Number(value) >= 1024 * 1024
      ? `${(Number(value) / 1024 / 1024).toFixed(1)} MB`
      : `${Math.max(0, Math.round(Number(value || 0) / 1024))} KB`;

    async function openProjectManager() {
      const { overlay, dialog, header, modal } = projectModal('Project Manager', 'project-manager-modal');
      const create = projectActionButton('새 프로젝트', async () => {
        await createNewProject('Untitled Project', false);
        modal.close();
      });
      create.classList.add('project-primary'); header.insertBefore(create, header.lastChild);
      modal.focusInitial(create);
      const hint = document.createElement('div'); hint.className = 'project-dialog-hint';
      hint.textContent = 'SQLite와 브라우저 DB의 프로젝트를 통합 표시합니다. 현재 프로젝트는 삭제할 수 없습니다.';
      const list = document.createElement('div'); list.className = 'project-list'; list.textContent = '프로젝트를 불러오는 중…';
      list.setAttribute('aria-live', 'polite');
      dialog.append(hint, list);

      const renderList = async () => {
        const projects = await listStoredProjects();
        if (!overlay.isConnected) return;
        list.textContent = '';
        markProjectList(list, projects.length > 0, `저장된 프로젝트 ${projects.length}개`);
        if (!projects.length) {
          const empty = document.createElement('div'); empty.className = 'project-empty'; empty.textContent = '저장된 프로젝트가 없습니다.';
          list.appendChild(empty); return;
        }
        projects.forEach(project => {
          const row = document.createElement('div'); row.className = `project-row${project.id === state.projectId ? ' active' : ''}`;
          const info = document.createElement('div'); info.className = 'project-info';
          const name = document.createElement('div'); name.className = 'project-name';
          name.textContent = `${project.name || 'Untitled Project'}${project.id === state.projectId ? ' · 현재' : ''}`;
          const meta = document.createElement('div'); meta.className = 'project-meta';
          meta.textContent = `${formatProjectTime(project.updatedAt)} · r${project.revision || 0} · ${formatBytes(project.byteLength)} · ${project.backends.includes('sqlite') ? 'SQLite' : 'IndexedDB'}${project.backends.length > 1 ? '+IndexedDB' : ''}`;
          info.append(name, meta);
          const actions = document.createElement('div'); actions.className = 'project-actions';
          actions.append(
            projectActionButton('열기', async () => { if (await openStoredProject(project.id)) modal.close(); }, project.id === state.projectId),
            projectActionButton('복구', () => openRecoveryHistory(project.id)),
            projectActionButton('이름', () => openProjectRenameDialog(project, renderList)),
            projectActionButton('복제', async () => {
              const records = await projectRecords(project.id); const source = newestProjectRecord(records);
              if (!source) return;
              const duplicateId = projectUid(); const duplicateName = `${source.name || 'Untitled Project'} Copy`;
              const data = JSON.parse(source.json); data.projectId = duplicateId; data.projectName = duplicateName;
              const duplicateJson = JSON.stringify(data, null, 2); const savedAt = Date.now();
              await Promise.allSettled([
                persistence.saveProject(duplicateId, duplicateJson, { name: duplicateName, savedAt, projectVersion: PROJECT_VERSION }),
                persistence.saveServerProject(duplicateId, duplicateJson, { name: duplicateName, savedAt, projectVersion: PROJECT_VERSION }),
              ]);
              await renderList();
            }),
            projectActionButton('삭제', async () => {
              if (!confirmAction(`“${project.name}” 프로젝트와 복구 이력을 삭제할까요?`)) return;
              await Promise.allSettled([
                persistence.deleteProject(project.id),
                persistence.deleteServerProject(project.id),
              ]);
              await renderList();
            }, project.id === state.projectId),
          );
          row.append(info, actions); list.appendChild(row);
          nameRowActions(row, name);
        });
      };
      await renderList();
    }

    async function openRecoveryHistory(projectId = state.projectId) {
      const projects = await listStoredProjects();
      const project = projects.find(item => item.id === projectId);
      const { overlay, dialog, modal } = projectModal(`Recovery History · ${project?.name || state.projectName}`, 'recovery-history-modal');
      const hint = document.createElement('div'); hint.className = 'project-dialog-hint';
      hint.textContent = '최근 10개 스냅샷을 보관합니다. 복원 직전 현재 상태도 먼저 안전하게 저장합니다.';
      const list = document.createElement('div'); list.className = 'project-list'; list.textContent = '복구 이력을 불러오는 중…';
      list.setAttribute('aria-live', 'polite');
      dialog.append(hint, list);
      const [indexed, sqlite] = await Promise.all([
        persistence.listProjectRevisions(projectId).catch(() => []),
        persistence.listServerProjectRevisions(projectId),
      ]);
      if (!overlay.isConnected) return;
      const revisions = new Map();
      [...indexed.map(item => ({ ...item, backend: 'indexeddb' })), ...sqlite.map(item => ({ ...item, backend: 'sqlite' }))]
        .forEach(item => {
          const key = `${item.savedAt}:${item.byteLength}`;
          if (!revisions.has(key) || item.backend === 'sqlite') revisions.set(key, item);
        });
      const entries = [...revisions.values()].sort((a, b) => Number(b.savedAt) - Number(a.savedAt));
      list.textContent = '';
      markProjectList(list, entries.length > 0, `복구 스냅샷 ${entries.length}개`);
      if (!entries.length) {
        const empty = document.createElement('div'); empty.className = 'project-empty'; empty.textContent = '복구 이력이 없습니다.';
        list.appendChild(empty); return;
      }
      entries.forEach((entry, index) => {
        const row = document.createElement('div'); row.className = 'project-row recovery-row';
        const info = document.createElement('div'); info.className = 'project-info';
        const name = document.createElement('div'); name.className = 'project-name';
        name.textContent = `${index === 0 ? '최신 · ' : ''}Revision ${entry.revision}`;
        const meta = document.createElement('div'); meta.className = 'project-meta';
        meta.textContent = `${formatProjectTime(entry.savedAt)} · ${formatBytes(entry.byteLength)} · ${entry.backend === 'sqlite' ? 'SQLite' : 'IndexedDB'}`;
        info.append(name, meta);
        const restoreButton = projectActionButton('이 버전 복원', async () => {
          if (!confirmAction(`${formatProjectTime(entry.savedAt)} 버전으로 복원할까요?`)) return;
          if (state.projectId !== projectId) await openStoredProject(projectId);
          await saveRecoveryCopy();
          const record = entry.backend === 'sqlite'
            ? await persistence.loadServerProjectRevision(projectId, entry.revision)
            : await persistence.loadProjectRevision(projectId, entry.revision);
          if (!record?.json) { flashStatus('선택한 복구본을 읽을 수 없습니다'); return; }
          if (!load(record.json, { persist: false, projectId, projectName: project?.name || state.projectName })) return;
          markDirty(); rememberActiveProject(); scheduleRecoverySave(0); modal.close({ restoreFocus: false });
          modalFocus.closeOverlay(document.getElementById('project-manager-modal'));
          flashStatus(`Revision ${entry.revision}을 복원했습니다`);
        });
        row.append(info, restoreButton); list.appendChild(row);
        nameRowActions(row, name);
      });
    }

    /* ── Autosave lifecycle events ───────────────────────────── */
    function handleHeartbeat() {
      if (recoveryDirty) scheduleRecoverySave(0);
    }

    function handleVisibilityChange() {
      if (document.visibilityState === 'hidden' && recoveryDirty) saveRecoveryCopy();
    }

    function handlePageHide() {
      if (recoveryDirty) saveRecoveryCopy();
    }

    function handleBeforeUnload(ev) {
      try {
        if (state.diagrams.length) writeLocalRecovery(serialize(), Date.now());
      } catch (_) { /* the debounced IndexedDB copy remains available */ }
      if (state.dirty) { ev.preventDefault(); ev.returnValue = ''; }
    }

    function attach() {
      if (attached) return;
      attached = true;
      heartbeatTimer = setInterval(handleHeartbeat, AUTOSAVE_HEARTBEAT_MS);
      document.addEventListener('visibilitychange', handleVisibilityChange);
      eventRoot.addEventListener('pagehide', handlePageHide);
      eventRoot.addEventListener('beforeunload', handleBeforeUnload);
    }

    function detach() {
      if (!attached) return;
      attached = false;
      clearInterval(heartbeatTimer);
      heartbeatTimer = null;
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      eventRoot.removeEventListener('pagehide', handlePageHide);
      eventRoot.removeEventListener('beforeunload', handleBeforeUnload);
    }

    /* ── Startup recovery ────────────────────────────────────── */
    async function restoreOnStartup() {
      const [projects, databaseRecovery, serverRecovery] = await Promise.all([
        listStoredProjects(),
        persistence.loadAutosave().catch(() => null),
        persistence.loadServerAutosave(),
      ]);

      let localRecovery = '', localSavedAt = 0, preferredProjectId = '';
      try {
        localRecovery = localStorage.getItem(RECOVERY_STORAGE_KEY) || '';
        localSavedAt = Number(localStorage.getItem(RECOVERY_META_KEY)) || 0;
        preferredProjectId = localStorage.getItem(ACTIVE_PROJECT_KEY) || '';
      } catch (_) { /* IndexedDB may still be available */ }

      let recovered = false;
      let recovery = null;
      if (projects.length) {
        const selected = projects.find(project => project.id === preferredProjectId) || projects[0];
        const records = await projectRecords(selected.id);
        recovery = newestProjectRecord(records);
        recovered = recovery?.json
          ? load(recovery.json, {
            persist: false,
            silent: true,
            projectId: selected.id,
            projectName: selected.name,
          })
          : false;
        if (recovered) {
          state.indexedRevision = records.indexed?.revision ?? null;
          state.sqliteRevision = records.sqlite?.revision ?? null;
          state.autosaveBackend = records.sqlite ? 'sqlite' : 'indexeddb';
          state.lastAutosavedAt = recovery.updatedAt || null;
          state.autosaveStatus = 'saved';
          recoveryDirty = false;
          rememberActiveProject();
          flashStatus(`프로젝트를 복원했습니다 · ${state.projectName}`);
          if (!records.indexed || !records.sqlite || records.indexed.updatedAt !== records.sqlite.updatedAt) {
            scheduleRecoverySave(0);
          }
        }
      }
      if (!recovered) {
        const candidates = [
          serverRecovery?.json ? { source: 'sqlite', ...serverRecovery } : null,
          databaseRecovery?.json ? { source: 'indexeddb', ...databaseRecovery } : null,
          localRecovery ? { source: 'local', json: localRecovery, savedAt: localSavedAt } : null,
        ].filter(Boolean).sort((a, b) => (b.savedAt || 0) - (a.savedAt || 0));
        recovery = candidates[0] || null;
        recovered = recovery?.json
          ? load(recovery.json, { persist: false, silent: true })
          : false;
        if (recovered) {
          state.indexedRevision = null;
          state.sqliteRevision = null;
          state.lastAutosavedAt = recovery.savedAt || null;
          state.autosaveBackend = recovery.source;
          state.autosaveStatus = recovery.source === 'local' ? 'fallback' : 'saved';
          rememberActiveProject();
          flashStatus('기존 단일 자동저장 프로젝트를 새 프로젝트 저장소로 이전했습니다');
          scheduleRecoverySave(0);
        }
      }
      if (!recovered || !state.diagrams.length) {
        state.projectId = projectUid();
        state.projectName = 'UML Studio Samples';
        state.indexedRevision = null;
        state.sqliteRevision = null;
        sampleProject();
        rememberActiveProject();
      }
      if (state.diagrams.length && !Object.keys(state.models).length && state.diagrams.some(d => d.elements.length || d.relations.length)) {
        hydrateCurrentProject(state.models);
      }
      renderAll();
      if (recovered) {
        renderStatus();
      } else {
        scheduleRecoverySave(0);
      }
      persistence.requestPersistentStorage().then(granted => { state.storagePersistent = granted; });
      return recovered;
    }

    return Object.freeze({
      attach,
      detach,
      createNewProject,
      isRecoveryDirty,
      listStoredProjects,
      markRecoveryDirty,
      newestProjectRecord,
      openProjectManager,
      openProjectRenameDialog,
      openRecoveryHistory,
      openStoredProject,
      projectActionButton,
      projectModal,
      projectRecords,
      rememberActiveProject,
      restoreOnStartup,
      saveRecoveryCopy,
      scheduleRecoverySave,
      writeLocalRecovery,
    });
  }

  return Object.freeze({
    REQUIRED_FUNCTIONS,
    REQUIRED_VALUES,
    RECOVERY_STORAGE_KEY,
    RECOVERY_META_KEY,
    ACTIVE_PROJECT_KEY,
    PROJECT_VERSION,
    AUTOSAVE_HEARTBEAT_MS,
    create,
  });
});
