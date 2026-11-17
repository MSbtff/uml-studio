// @ts-nocheck
'use strict';

/* Import / Export — SVG · PNG · Mermaid · draw.io writers, the draw.io import
   preview dialog with its per-model conflict policies, and the shared file
   input that routes .json / .drawio / .xml files into the project. */
(function initProjectImportModule(root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root) root.UMLProjectImport = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function createImportExportModule() {
  /* names below marked "forwarded" are not used here — they are handed to
     importPreview.create, and `provide` only fills declared names */
  const REQUIRED_FUNCTIONS = Object.freeze([
    'projectActionButton', // forwarded
    'projectModal', // forwarded
    'alert',
    'clearValidationResults',
    'diagramAllowsElementKind',
    'flashStatus',
    'hydrateView',
    'load',
    'markDirty',
    'modelUid',
    'projectData',
    'projectRecords',
    'projectUid',
    'renderAll',
    'rememberActiveProject',
    'rollbackLastSnapshot',
    'saveRecoveryCopy',
    'scheduleRecoverySave',
    'setSelection',
    'snapshot',
    'uid',
    'validProjectId',
    'validateProjectData',
  ]);
  const REQUIRED_VALUES = Object.freeze([
    'document', // forwarded
    'ddlImporter',
    'drawioImporter',
    'importPreview',
    'fileInput',
    'state',
    'DIAGRAM_META',
    'DIAGRAM_TOOLS',
    'KIND_META',
    'MODEL_FIELDS',
    'REL_STYLE',
  ]);
  const MAX_IMPORT_BYTES = 10 * 1024 * 1024;
  const PROJECT_FILE_ACCEPT = '.json,.drawio,.xml';
  const DRAWIO_FILE_ACCEPT = '.drawio,.xml';
  const DDL_FILE_ACCEPT = '.sql';
  const DRAWIO_IMPORT_POLICIES = Object.freeze([
    ['keepBoth', '새 모델로 가져오기'],
    ['reuse', '기존 모델 재사용'],
    ['replace', '기존 모델 덮어쓰기'],
  ]);

  function create(dependencies) {
    const deps = dependencies || {};
    const missing = REQUIRED_FUNCTIONS.filter(name => typeof deps[name] !== 'function');
    REQUIRED_VALUES.forEach(name => {
      if (deps[name] == null) missing.push(name);
    });
    if (deps.fileInput && typeof deps.fileInput.addEventListener !== 'function') missing.push('fileInput.addEventListener');
    if (deps.drawioImporter && typeof deps.drawioImporter.importDrawio !== 'function') missing.push('drawioImporter.importDrawio');
    if (deps.ddlImporter && typeof deps.ddlImporter.parseDdl !== 'function') missing.push('ddlImporter.parseDdl');
    if (typeof deps.importPreview?.create !== 'function') missing.push('importPreview.create');
    if (missing.length) {
      throw new TypeError(`프로젝트 가져오기 의존성이 없습니다: ${[...new Set(missing)].join(', ')}`);
    }

    /* names this module only forwards to importPreview stay in the REQUIRED lists
       above — app.js provides by declared name — but are not destructured */
    const {
      alert,
      clearValidationResults,
      diagramAllowsElementKind,
      flashStatus,
      hydrateView,
      load,
      markDirty,
      modelUid,
      projectData,
      projectRecords,
      projectUid,
      renderAll,
      rememberActiveProject,
      rollbackLastSnapshot,
      saveRecoveryCopy,
      scheduleRecoverySave,
      setSelection,
      snapshot,
      uid,
      validProjectId,
      validateProjectData,
      ddlImporter,
      drawioImporter,
      fileInput,
      state,
      DIAGRAM_META,
      DIAGRAM_TOOLS,
      MODEL_FIELDS,
      REL_STYLE,
      importPreview,
    } = deps;

    let fileInputMode = 'open';
    let attached = false;

    /* ── File input ──────────────────────────────────────────── */
    function openProjectFileDialog() {
      fileInputMode = 'open';
      fileInput.accept = PROJECT_FILE_ACCEPT;
      fileInput.click();
    }

    function openDrawioAppendDialog() {
      fileInputMode = 'append-drawio';
      fileInput.accept = DRAWIO_FILE_ACCEPT;
      fileInput.click();
    }

    function openDdlAppendDialog() {
      fileInputMode = 'append-ddl';
      fileInput.accept = DDL_FILE_ACCEPT;
      fileInput.click();
    }

    function handleFileInputChange(ev) {
      const f = ev.target.files[0];
      if (!f) return;
      const mode = fileInputMode;
      if (f.size > MAX_IMPORT_BYTES) {
        alert(mode === 'append-ddl' ? 'DDL 파일은 10MB 이하만 가져올 수 있습니다.' : '프로젝트 파일은 10MB 이하만 열 수 있습니다.');
        ev.target.value = '';
        fileInputMode = 'open';
        fileInput.accept = PROJECT_FILE_ACCEPT;
        return;
      }
      f.text().then(text => importSupportedFile(text, f.name, mode)).catch(error => {
        alert('파일을 읽을 수 없습니다: ' + error.message);
      });
      ev.target.value = '';
      fileInputMode = 'open';
      fileInput.accept = PROJECT_FILE_ACCEPT;
    }

    function attach() {
      if (attached) return;
      attached = true;
      fileInput.addEventListener('change', handleFileInputChange);
    }

    function detach() {
      if (!attached) return;
      attached = false;
      fileInput.removeEventListener('change', handleFileInputChange);
    }

    /* ── Project / draw.io import ────────────────────────────── */
    async function importProjectFile(json, filename) {
      let parsed;
      try { parsed = JSON.parse(json); }
      catch (error) { alert('파일을 읽을 수 없습니다: ' + error.message); return false; }
      if (state.projectId && state.diagrams.length) await saveRecoveryCopy();
      const projectId = validProjectId(parsed.projectId) ? parsed.projectId : projectUid();
      const records = await projectRecords(projectId);
      state.indexedRevision = records.indexed?.revision ?? null;
      state.sqliteRevision = records.sqlite?.revision ?? null;
      const fallbackName = String(filename || '').replace(/\.json$/i, '') || 'Imported Project';
      const loaded = load(json, {
        persist: false,
        projectId,
        projectName: parsed.projectName || fallbackName,
      });
      if (!loaded) return false;
      rememberActiveProject();
      markDirty();
      scheduleRecoverySave(0);
      flashStatus(`프로젝트 파일을 열었습니다 · ${state.projectName}`);
      return true;
    }

    function resolveImportedDrawioType(elements, relations, requestedType) {
      const compatible = type => {
        const tools = DIAGRAM_TOOLS[type];
        if (!tools) return false;
        return elements.every(model => diagramAllowsElementKind(type, model.kind))
          && relations.every(model => tools.relations.includes(model.kind));
      };
      if (requestedType) {
        if (!DIAGRAM_META[requestedType]) throw new Error(`지원하지 않는 draw.io 다이어그램 종류입니다: ${requestedType}`);
        if (!compatible(requestedType)) throw new Error(`draw.io 셀 종류가 ${DIAGRAM_META[requestedType].label}과 맞지 않습니다.`);
        return requestedType;
      }
      const inferred = drawioImporter.inferDiagramType(elements, relations);
      if (compatible(inferred)) return inferred;
      const candidates = Object.keys(DIAGRAM_TOOLS).filter(compatible);
      if (!candidates.length) throw new Error('draw.io 셀 구성에 맞는 UML 다이어그램 종류를 찾을 수 없습니다.');
      return candidates[0];
    }

    function importedDiagramName(name, usedNames) {
      const base = String(name || 'Imported draw.io').trim() || 'Imported draw.io';
      const key = base.toLocaleLowerCase();
      if (!usedNames.has(key)) { usedNames.add(key); return base; }
      let index = 1;
      let candidate = `${base} (Imported)`;
      while (usedNames.has(candidate.toLocaleLowerCase())) candidate = `${base} (Imported ${++index})`;
      usedNames.add(candidate.toLocaleLowerCase());
      return candidate;
    }

    /* the two import preview sheets are their own module — they only read the
       parsed import and return a decision, so nothing here changes */
    const {
      openDdlImportPreview,
      openDrawioImportPreview,
    } = importPreview.create({ ...deps, DRAWIO_IMPORT_POLICIES });

    function importedProjectWithFreshIds(imported, policy = 'keepBoth', analysis = null, modelPolicies = {}) {
      if (!['keepBoth', 'reuse', 'replace'].includes(policy)) policy = 'keepBoth';
      const policyFor = modelId => {
        const selected = modelPolicies?.[modelId];
        return ['keepBoth', 'reuse', 'replace'].includes(selected) ? selected : policy;
      };
      const diagramIds = new Map(imported.diagrams.map(diagram => [diagram.id, uid()]));
      const compatibleConflicts = new Map((analysis?.conflicts || [])
        .filter(conflict => conflict.compatible)
        .map(conflict => [conflict.importedModelId, conflict]));
      const modelIds = new Map(Object.keys(imported.models).map(id => {
        const conflict = compatibleConflicts.get(id);
        const existingId = policyFor(id) !== 'keepBoth' && conflict && state.models[conflict.matchModelId]
          ? conflict.matchModelId : null;
        return [id, existingId || modelUid()];
      }));
      const modelReferenceFields = [
        'classifierModelId', 'collaborationModelId', 'providedInterfaceModelId',
        'requiredInterfaceModelId', 'fromModelId', 'toModelId',
      ];
      Object.entries(imported.models).forEach(([oldId, source]) => {
        const model = JSON.parse(JSON.stringify(source));
        model.id = modelIds.get(oldId);
        modelReferenceFields.forEach(field => {
          if (model[field]) model[field] = modelIds.get(model[field]) || undefined;
        });
        for (const field of ['conveyedModelIds', 'itemFlowModelIds']) {
          if (Array.isArray(model[field])) model[field] = model[field].map(id => modelIds.get(id)).filter(Boolean);
        }
        for (const field of ['submachineDiagramId', 'interactionDiagramId']) {
          if (model[field]) model[field] = diagramIds.get(model[field]) || undefined;
        }
        const conflict = compatibleConflicts.get(oldId);
        const selectedPolicy = policyFor(oldId);
        const reusesExisting = selectedPolicy !== 'keepBoth' && conflict && model.id === conflict.matchModelId;
        if (!reusesExisting) {
          state.models[model.id] = model;
        } else if (selectedPolicy === 'replace') {
          const target = state.models[model.id];
          MODEL_FIELDS.forEach(field => { delete target[field]; });
          MODEL_FIELDS.forEach(field => {
            if (Object.prototype.hasOwnProperty.call(model, field)) target[field] = model[field];
          });
          target.id = model.id;
        }
      });

      const usedNames = new Set(state.diagrams.map(diagram => String(diagram.name || '').trim().toLocaleLowerCase()));
      return imported.diagrams.map(diagram => {
        const allViews = [...diagram.elements, ...diagram.relations];
        const viewIds = new Map(allViews.map(view => [view.id, uid()]));
        const remapView = source => {
          const view = JSON.parse(JSON.stringify(source));
          view.id = viewIds.get(source.id);
          view.modelId = modelIds.get(source.modelId);
          for (const field of ['parentId', 'from', 'to', 'connectorId', 'constrainedViewId']) {
            if (view[field]) view[field] = viewIds.get(view[field]) || undefined;
          }
          return hydrateView(view, state.models, modelUid);
        };
        return {
          ...JSON.parse(JSON.stringify(diagram)),
          id: diagramIds.get(diagram.id),
          name: importedDiagramName(diagram.name, usedNames),
          elements: diagram.elements.map(remapView),
          relations: diagram.relations.map(remapView),
        };
      });
    }


    async function importDrawioProjectFile(xml, filename, append = false) {
      const fallbackName = String(filename || '').replace(/\.(?:drawio|xml)$/i, '') || 'Imported draw.io';
      let imported;
      try {
        imported = await drawioImporter.importDrawio(xml, {
          projectName: fallbackName,
          defaultDiagramName: fallbackName,
          allowedElementKinds: [...new Set(Object.values(DIAGRAM_TOOLS).flatMap(tools => [...tools.elements, ...(tools.reuseElements || [])]))],
          allowedRelationKinds: Object.keys(REL_STYLE),
          resolveDiagramType: resolveImportedDrawioType,
        });
      } catch (error) {
        alert('draw.io 파일을 읽을 수 없습니다: ' + error.message);
        return false;
      }

      const analysis = drawioImporter.analyzeImport(
        imported,
        append ? state.models : {},
        append ? state.diagrams : [],
      );
      const decision = await openDrawioImportPreview(imported, analysis, { append, filename: filename || fallbackName });
      if (!decision) { flashStatus('draw.io 가져오기를 취소했습니다'); return false; }

      if (append) {
        snapshot();
        let diagrams;
        try {
          diagrams = importedProjectWithFreshIds(imported, decision.policy, analysis, decision.modelPolicies);
          state.diagrams.push(...diagrams);
          validateProjectData(projectData(), {
            diagramTypes: Object.keys(DIAGRAM_META),
            elementKinds: [...new Set(Object.values(DIAGRAM_TOOLS).flatMap(tools => tools.elements))],
            relationKinds: Object.keys(REL_STYLE),
          });
        } catch (error) {
          rollbackLastSnapshot();
          alert('draw.io 병합 검증에 실패하여 변경을 되돌렸습니다: ' + error.message);
          return false;
        }
        state.activeId = diagrams[0].id;
        setSelection([]);
        clearValidationResults();
        renderAll();
        scheduleRecoverySave(0);
        flashStatus(`draw.io 다이어그램 ${diagrams.length}개를 프로젝트로 가져왔습니다`);
        return true;
      }

      if (state.projectId && state.diagrams.length) await saveRecoveryCopy();
      state.sqliteRevision = null;
      state.indexedRevision = null;
      const projectId = projectUid();
      imported.projectId = projectId;
      imported.projectName = fallbackName;
      const loaded = load(JSON.stringify(imported), {
        persist: false, projectId, projectName: fallbackName,
      });
      if (!loaded) return false;
      rememberActiveProject();
      markDirty();
      scheduleRecoverySave(0);
      flashStatus(`draw.io 프로젝트를 열었습니다 · ${state.projectName}`);
      return true;
    }


    async function importDdlProjectFile(sql, filename) {
      const fallbackName = String(filename || '').replace(/\.sql$/i, '') || 'Imported DDL';
      let imported;
      try {
        imported = ddlImporter.parseDdl(sql, { diagramName: fallbackName });
      } catch (error) {
        alert('DDL 파일을 읽을 수 없습니다: ' + error.message);
        return false;
      }
      const confirmed = await openDdlImportPreview(imported, { filename: filename || fallbackName });
      if (!confirmed) { flashStatus('DDL 가져오기를 취소했습니다'); return false; }

      snapshot();
      let diagrams;
      try {
        diagrams = importedProjectWithFreshIds(imported);
        state.diagrams.push(...diagrams);
        validateProjectData(projectData(), {
          diagramTypes: Object.keys(DIAGRAM_META),
          elementKinds: [...new Set(Object.values(DIAGRAM_TOOLS).flatMap(tools => tools.elements))],
          relationKinds: Object.keys(REL_STYLE),
        });
      } catch (error) {
        rollbackLastSnapshot();
        alert('DDL 병합 검증에 실패하여 변경을 되돌렸습니다: ' + error.message);
        return false;
      }
      state.activeId = diagrams[0].id;
      setSelection([]);
      clearValidationResults();
      renderAll();
      scheduleRecoverySave(0);
      flashStatus(`DDL 테이블 ${imported.importMeta.tables}개를 ER Diagram으로 가져왔습니다`);
      return true;
    }

    async function importSupportedFile(text, filename, mode = 'open') {
      const drawio = /\.(?:drawio|xml)$/i.test(filename || '')
        || /^\s*(?:<\?xml[^>]*>\s*)?<(?:mxfile|mxGraphModel)\b/i.test(text);
      if (drawio) return importDrawioProjectFile(text, filename, mode === 'append-drawio');
      const ddl = /\.sql$/i.test(filename || '')
        || (/\bCREATE\s+(?:(?:GLOBAL|LOCAL|TEMP|TEMPORARY|UNLOGGED)\s+)*TABLE\b/i.test(text)
          && !/^\s*[\[{]/.test(text));
      if (ddl) return importDdlProjectFile(text, filename);
      if (mode === 'append-drawio') {
        alert('현재 프로젝트 가져오기는 .drawio 또는 .xml 파일만 지원합니다.');
        return false;
      }
      if (mode === 'append-ddl') {
        alert('DDL 가져오기는 .sql 파일만 지원합니다.');
        return false;
      }
      return importProjectFile(text, filename);
    }

    return Object.freeze({
      attach,
      detach,
      openProjectFileDialog,
      openDrawioAppendDialog,
      openDdlAppendDialog,
      importSupportedFile,
      importProjectFile,
      importDrawioProjectFile,
      importDdlProjectFile,
      importedProjectWithFreshIds,
      importedDiagramName,
      resolveImportedDrawioType,
      openDrawioImportPreview,
      openDdlImportPreview,
    });
  }

  return Object.freeze({
    REQUIRED_FUNCTIONS,
    REQUIRED_VALUES,
    DRAWIO_IMPORT_POLICIES,
    MAX_IMPORT_BYTES,
    create,
  });
});
