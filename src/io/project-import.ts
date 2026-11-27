'use strict';

type ProjectImportApi = ReturnType<typeof createImportExportModule>;
declare var UMLProjectImport: ProjectImportApi;

(function initProjectImportModule(root: typeof globalThis & { UMLProjectImport?: ProjectImportApi }, factory: () => ProjectImportApi) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root) root.UMLProjectImport = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, createImportExportModule);

function createImportExportModule() {
  const { displayLabel, text: uiText } = globalThis.UMLLanguage
    ?? require('../editor/language.js') as typeof UMLLanguage;

  const REQUIRED_FUNCTIONS = Object.freeze([
    'projectActionButton',
    'projectModal',
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
  ] as const);
  const REQUIRED_VALUES = Object.freeze([
    'document',
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
  ] as const);
  const MAX_IMPORT_BYTES = 10 * 1024 * 1024;
  const PROJECT_FILE_ACCEPT = '.json,.drawio,.xml';
  const DRAWIO_FILE_ACCEPT = '.drawio,.xml';
  const DDL_FILE_ACCEPT = '.sql';
  const DRAWIO_IMPORT_POLICIES = Object.freeze([
    ['keepBoth', uiText('Import as New Model', '새 모델로 가져오기')],
    ['reuse', uiText('Reuse Existing Model', '기존 모델 재사용')],
    ['replace', uiText('Overwrite Existing Model', '기존 모델 덮어쓰기')],
  ] as const);

  type FileInputMode = 'open' | 'append-drawio' | 'append-ddl';
  type ImportView = ImportedElement | ImportedRelation;
  type NamedKind = { kind: string };

  interface ProjectLoadSettings {
    persist: boolean;
    projectId: string;
    projectName: string;
  }

  interface DrawioImportSettings {
    projectName: string;
    defaultDiagramName: string;
    allowedElementKinds: string[];
    allowedRelationKinds: string[];
    resolveDiagramType: (elements: NamedKind[], relations: NamedKind[], requestedType: string) => string;
  }

  interface ImportValidationSettings {
    diagramTypes: string[];
    elementKinds: string[];
    relationKinds: string[];
  }

  interface ImportPreviewApi {
    openDdlImportPreview: (project: DdlImportSummary, settings: { filename: string }) => Promise<boolean>;
    openDrawioImportPreview: (project: DrawioProject, analysis: DrawioImportAnalysis, settings: { append: boolean; filename: string }) => Promise<DrawioPreviewDecision | null>;
  }

  interface ProjectImportDependencies {
    projectActionButton: (label: string, action: () => void, disabled?: boolean) => HTMLButtonElement;
    projectModal: (title: string, id: string) => object;
    alert: (message: string) => void;
    clearValidationResults: () => void;
    diagramAllowsElementKind: (type: string, kind: string) => boolean;
    flashStatus: (message: string) => void;
    hydrateView: {
      (view: ImportedElement, models: DiagramModels, idFactory: () => string): DiagramElement;
      (view: ImportedRelation, models: DiagramModels, idFactory: () => string): DiagramRelation;
    };
    load: (json: string, options: ProjectLoadSettings) => boolean;
    markDirty: () => void;
    modelUid: () => string;
    projectData: () => object;
    projectRecords: (id: string) => Promise<{
      indexed?: { revision?: number } | null;
      sqlite?: { revision?: number } | null;
    }>;
    projectUid: () => string;
    renderAll: () => void;
    rememberActiveProject: () => void;
    rollbackLastSnapshot: () => void;
    saveRecoveryCopy: () => Promise<unknown>;
    scheduleRecoverySave: (delay: number) => void;
    setSelection: (ids: string[]) => void;
    snapshot: () => void;
    uid: () => string;
    validProjectId: (id: unknown) => boolean;
    validateProjectData: (project: unknown, settings: ImportValidationSettings) => unknown;
    document: Document;
    ddlImporter: { parseDdl: (sql: string, settings: { diagramName: string }) => ImportedProject & DdlImportSummary & { importMeta: { tables: number } } };
    drawioImporter: {
      importDrawio: (xml: string, settings: DrawioImportSettings) => Promise<DrawioProject>;
      inferDiagramType: (elements: NamedKind[], relations: NamedKind[]) => string;
      analyzeImport: (imported: DrawioProject, models: DiagramModels, diagrams: EditorDiagram[]) => DrawioImportAnalysis;
    };
    importPreview: { create: (settings: Partial<ProjectImportDependencies> & { DRAWIO_IMPORT_POLICIES: typeof DRAWIO_IMPORT_POLICIES }) => ImportPreviewApi };
    fileInput: HTMLInputElement;
    state: {
      projectId: string;
      projectName: string;
      activeId: string;
      indexedRevision: number | null;
      sqliteRevision: number | null;
      models: DiagramModels;
      diagrams: EditorDiagram[];
    };
    DIAGRAM_META: Record<string, { label: string }>;
    DIAGRAM_TOOLS: Record<string, { elements: readonly string[]; relations: readonly string[]; reuseElements?: readonly string[] }>;
    KIND_META: Record<string, object>;
    REL_STYLE: Record<string, object>;
    MODEL_FIELDS: readonly (keyof ModelFields | 'kind')[];
  }

  function create(dependencies?: ProjectImportDependencies) {
    const deps: Partial<ProjectImportDependencies> = dependencies || {};
    const missing: string[] = REQUIRED_FUNCTIONS.filter(name => typeof deps[name] !== 'function');
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
    } = deps as ProjectImportDependencies;

    let fileInputMode: FileInputMode = 'open';
    let attached = false;

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

    function handleFileInputChange(event: Event) {
      const input = event.target as HTMLInputElement | null;
      const f = input?.files?.[0];
      if (!f) return;
      const mode = fileInputMode;
      if (f.size > MAX_IMPORT_BYTES) {
        alert(mode === 'append-ddl' ? uiText('DDL files must be 10 MB or smaller.', 'DDL 파일은 10MB 이하만 가져올 수 있습니다.') : uiText(
          'Project files must be 10 MB or smaller.',
          '프로젝트 파일은 10MB 이하만 열 수 있습니다.',
        ));
        input.value = '';
        fileInputMode = 'open';
        fileInput.accept = PROJECT_FILE_ACCEPT;
        return;
      }
      f.text().then(text => importSupportedFile(text, f.name, mode)).catch(error => {
        alert(uiText('Could not read the file: ', '파일을 읽을 수 없습니다: ') + (error instanceof Error ? error.message : String(error)));
      });
      input.value = '';
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

    async function importProjectFile(json: string, filename: string) {
      let parsed: unknown;
      try { parsed = JSON.parse(json); }
      catch (error) { alert(uiText('Could not read the file: ', '파일을 읽을 수 없습니다: ') + (error instanceof Error ? error.message : String(error))); return false; }
      const incoming = parsed && typeof parsed === 'object' ? parsed : {};
      const incomingId = 'projectId' in incoming ? incoming.projectId : undefined;
      const incomingName = 'projectName' in incoming ? incoming.projectName : undefined;
      if (state.projectId && state.diagrams.length) await saveRecoveryCopy();
      const projectId = typeof incomingId === 'string' && validProjectId(incomingId) ? incomingId : projectUid();
      const records = await projectRecords(projectId);
      state.indexedRevision = records.indexed?.revision ?? null;
      state.sqliteRevision = records.sqlite?.revision ?? null;
      const fallbackName = String(filename || '').replace(/\.json$/i, '') || 'Imported Project';
      const loaded = load(json, {
        persist: false,
        projectId,
        projectName: typeof incomingName === 'string' && incomingName ? incomingName : fallbackName,
      });
      if (!loaded) return false;
      rememberActiveProject();
      markDirty();
      scheduleRecoverySave(0);
      flashStatus(uiText('Opened project file · {0}', '프로젝트 파일을 열었습니다 · {0}', state.projectName));
      return true;
    }

    function resolveImportedDrawioType(elements: NamedKind[], relations: NamedKind[], requestedType?: string) {
      const compatible = (type: string) => {
        const tools = DIAGRAM_TOOLS[type];
        if (!tools) return false;
        return elements.every(model => diagramAllowsElementKind(type, model.kind))
          && relations.every(model => tools.relations.includes(model.kind));
      };
      if (requestedType) {
        if (!DIAGRAM_META[requestedType]) throw new Error(uiText(
          'Unsupported draw.io diagram type: {0}',
          '지원하지 않는 draw.io 다이어그램 종류입니다: {0}',
          requestedType,
        ));
        if (!compatible(requestedType)) throw new Error(uiText(
          'The draw.io cell types do not match {0}.',
          'draw.io 셀 종류가 {0}과 맞지 않습니다.',
          displayLabel(DIAGRAM_META[requestedType]),
        ));
        return requestedType;
      }
      const inferred = drawioImporter.inferDiagramType(elements, relations);
      if (compatible(inferred)) return inferred;
      const candidates = Object.keys(DIAGRAM_TOOLS).filter(compatible);
      if (!candidates.length) throw new Error(uiText(
        'No UML diagram type matches the draw.io cells.',
        'draw.io 셀 구성에 맞는 UML 다이어그램 종류를 찾을 수 없습니다.',
      ));
      return candidates[0];
    }

    function importedDiagramName(name: string, usedNames: Set<string>) {
      const base = String(name || 'Imported draw.io').trim() || 'Imported draw.io';
      const key = base.toLocaleLowerCase();
      if (!usedNames.has(key)) { usedNames.add(key); return base; }
      let index = 1;
      let candidate = `${base} (Imported)`;
      while (usedNames.has(candidate.toLocaleLowerCase())) candidate = `${base} (Imported ${++index})`;
      usedNames.add(candidate.toLocaleLowerCase());
      return candidate;
    }

    const {
      openDdlImportPreview,
      openDrawioImportPreview,
    } = importPreview.create({ ...deps, DRAWIO_IMPORT_POLICIES });

    function importedProjectWithFreshIds(
      imported: ImportedProject, policy: DrawioPolicy = 'keepBoth', analysis: DrawioImportAnalysis | null = null,
      modelPolicies: Partial<Record<string, DrawioPolicy>> = {},
    ): EditorDiagram[] {
      if (!['keepBoth', 'reuse', 'replace'].includes(policy)) policy = 'keepBoth';
      const policyFor = (modelId: string) => {
        const selected = modelPolicies?.[modelId];
        return selected && DRAWIO_IMPORT_POLICIES.some(([value]) => value === selected) ? selected : policy;
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
      ] as const;
      Object.entries(imported.models).forEach(([oldId, source]) => {
        const model: DiagramModel = JSON.parse(JSON.stringify(source));
        const id = modelIds.get(oldId);
        if (!id) throw new Error(uiText('Could not find model ID to import: {0}', '가져올 모델 ID를 찾을 수 없습니다: {0}', oldId));
        model.id = id;
        modelReferenceFields.forEach(field => {
          const value = model[field];
          if (value) model[field] = modelIds.get(value);
        });
        for (const field of ['conveyedModelIds', 'itemFlowModelIds'] as const) {
          if (Array.isArray(model[field])) model[field] = model[field].map(id => modelIds.get(id)).filter((id): id is string => Boolean(id));
        }
        for (const field of ['submachineDiagramId', 'interactionDiagramId'] as const) {
          const value = model[field];
          if (value) model[field] = diagramIds.get(value);
        }
        const conflict = compatibleConflicts.get(oldId);
        const selectedPolicy = policyFor(oldId);
        const reusesExisting = selectedPolicy !== 'keepBoth' && conflict && model.id === conflict.matchModelId;
        if (!reusesExisting) {
          state.models[model.id] = model;
        } else if (selectedPolicy === 'replace') {
          const target = state.models[model.id];
          MODEL_FIELDS.forEach(field => { delete target[field]; });
          const fields = MODEL_FIELDS.filter(field => Object.prototype.hasOwnProperty.call(model, field));
          Object.assign(target, Object.fromEntries(fields.map(field => [field, model[field]])));
          target.id = model.id;
        }
      });

      const usedNames = new Set(state.diagrams.map(diagram => String(diagram.name || '').trim().toLocaleLowerCase()));
      return imported.diagrams.map(diagram => {
        const allViews = [...diagram.elements, ...diagram.relations];
        const viewIds = new Map(allViews.map(view => [view.id, uid()]));
        const remapView = <View extends ImportView>(source: View): View => {
          const view: View = JSON.parse(JSON.stringify(source));
          const id = viewIds.get(source.id);
          if (!id) throw new Error(uiText('Could not find view ID to import: {0}', '가져올 뷰 ID를 찾을 수 없습니다: {0}', source.id));
          view.id = id;
          view.modelId = source.modelId ? modelIds.get(source.modelId) : undefined;
          if ('x' in view) {
            if (view.parentId) view.parentId = viewIds.get(view.parentId);
            if (view.constrainedViewId) view.constrainedViewId = viewIds.get(view.constrainedViewId);
          } else {
            if (view.from) view.from = viewIds.get(view.from);
            if (view.to) view.to = viewIds.get(view.to);
            if (view.connectorId) view.connectorId = viewIds.get(view.connectorId);
          }
          return view;
        };
        const copy: ImportedDiagram = JSON.parse(JSON.stringify(diagram));
        const id = diagramIds.get(diagram.id);
        if (!id) throw new Error(uiText('Could not find diagram ID to import: {0}', '가져올 다이어그램 ID를 찾을 수 없습니다: {0}', diagram.id));
        return {
          ...copy,
          id,
          name: importedDiagramName(diagram.name, usedNames),
          elements: diagram.elements.map(view => hydrateView(remapView(view), state.models, modelUid)),
          relations: diagram.relations.map(view => hydrateView(remapView(view), state.models, modelUid)),
        };
      });
    }


    async function importDrawioProjectFile(xml: string, filename: string, append = false) {
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
        alert(uiText('Could not read the draw.io file: ', 'draw.io 파일을 읽을 수 없습니다: ') + (error instanceof Error ? error.message : String(error)));
        return false;
      }

      const analysis = drawioImporter.analyzeImport(
        imported,
        append ? state.models : {},
        append ? state.diagrams : [],
      );
      const decision = await openDrawioImportPreview(imported, analysis, { append, filename: filename || fallbackName });
      if (!decision) { flashStatus(uiText('Canceled draw.io import.', 'draw.io 가져오기를 취소했습니다')); return false; }

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
          alert(uiText('Rolled back the draw.io import because validation failed: ', 'draw.io 병합 검증에 실패하여 변경을 되돌렸습니다: ') + (error instanceof Error ? error.message : String(error)));
          return false;
        }
        state.activeId = diagrams[0].id;
        setSelection([]);
        clearValidationResults();
        renderAll();
        scheduleRecoverySave(0);
        flashStatus(uiText('Imported {0} draw.io diagrams into the project.', 'draw.io 다이어그램 {0}개를 프로젝트로 가져왔습니다', diagrams.length));
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
      flashStatus(uiText('Opened draw.io project · {0}', 'draw.io 프로젝트를 열었습니다 · {0}', state.projectName));
      return true;
    }


    async function importDdlProjectFile(sql: string, filename: string) {
      const fallbackName = String(filename || '').replace(/\.sql$/i, '') || 'Imported DDL';
      let imported;
      try {
        imported = ddlImporter.parseDdl(sql, { diagramName: fallbackName });
      } catch (error) {
        alert(uiText('Could not read the DDL file: ', 'DDL 파일을 읽을 수 없습니다: ') + (error instanceof Error ? error.message : String(error)));
        return false;
      }
      const confirmed = await openDdlImportPreview(imported, { filename: filename || fallbackName });
      if (!confirmed) { flashStatus(uiText('Canceled DDL import.', 'DDL 가져오기를 취소했습니다')); return false; }

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
        alert(uiText('Rolled back the DDL import because validation failed: ', 'DDL 병합 검증에 실패하여 변경을 되돌렸습니다: ') + (error instanceof Error ? error.message : String(error)));
        return false;
      }
      state.activeId = diagrams[0].id;
      setSelection([]);
      clearValidationResults();
      renderAll();
      scheduleRecoverySave(0);
      flashStatus(uiText('Imported {0} DDL tables into an ER diagram.', 'DDL 테이블 {0}개를 ER Diagram으로 가져왔습니다', imported.importMeta.tables));
      return true;
    }

    async function importSupportedFile(text: string, filename: string, mode: FileInputMode = 'open') {
      const drawio = /\.(?:drawio|xml)$/i.test(filename || '')
        || /^\s*(?:<\?xml[^>]*>\s*)?<(?:mxfile|mxGraphModel)\b/i.test(text);
      if (drawio) return importDrawioProjectFile(text, filename, mode === 'append-drawio');
      const ddl = /\.sql$/i.test(filename || '')
        || (/\bCREATE\s+(?:(?:GLOBAL|LOCAL|TEMP|TEMPORARY|UNLOGGED)\s+)*TABLE\b/i.test(text)
          && !/^\s*[\[{]/.test(text));
      if (ddl) return importDdlProjectFile(text, filename);
      if (mode === 'append-drawio') {
        alert(uiText('Import into the current project accepts .drawio and .xml files.', '현재 프로젝트 가져오기는 .drawio 또는 .xml 파일만 지원합니다.'));
        return false;
      }
      if (mode === 'append-ddl') {
        alert(uiText('DDL import accepts .sql files.', 'DDL 가져오기는 .sql 파일만 지원합니다.'));
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
}
