'use strict';

interface DocumentLoadOptions {
  silent?: boolean;
  persist?: boolean;
  projectId?: string;
  projectName?: string;
}

/* Project Document — owns project JSON composition, serialization, loading,
   version migrations, and the state adapters used by Undo/Redo. */
type ProjectDocumentApi = ReturnType<typeof createProjectDocumentModule>;
declare var UMLProjectDocument: ProjectDocumentApi;

(function initProjectDocumentModule(root: typeof globalThis & { UMLProjectDocument?: ProjectDocumentApi }, factory: () => ProjectDocumentApi) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root) root.UMLProjectDocument = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, createProjectDocumentModule);

function createProjectDocumentModule() {
  const PROJECT_VERSION = 30;
  const REQUIRED_FUNCTIONS = Object.freeze([
    'alert',
    'cleanProjectName',
    'clearValidationResults',
    'getIdSeq',
    'hydrateCurrentProject',
    'markDirty',
    'markSaved',
    'projectUid',
    'renderAll',
    'resetHistory',
    'scheduleRecoverySave',
    'setIdSeq',
    'setSelection',
    'stringifyProject',
    'syncAllRelationModels',
    'uid',
    'validProjectId',
    'validateProjectData',
  ] as const);
  const REQUIRED_VALUES = Object.freeze([
    'counters',
    'sampleDiagrams',
    'state',
    'DIAGRAM_META',
    'DIAGRAM_TOOLS',
    'REL_STYLE',
  ] as const);
  const SAMPLE_METHODS = Object.freeze([
    'sampleActivity',
    'sampleBlockDefinition',
    'sampleCommunication',
    'sampleComponent',
    'sampleCompositeState',
    'sampleCompositeStructure',
    'sampleDFD',
    'sampleDeployment',
    'sampleERD',
    'sampleInformationFlow',
    'sampleInteractionOverviewPair',
    'sampleInternalBlock',
    'sampleMindmap',
    'sampleObject',
    'samplePackage',
    'sampleParametric',
    'sampleProfile',
    'sampleRequirement',
    'sampleSequence',
    'sampleState',
    'sampleSubmachineStatePair',
    'sampleTiming',
    'sampleUseCase',
    'linkSampleBlockDefinitionModels',
    'linkSampleCommunicationClassifiers',
    'linkSampleCompositeStructureReferences',
    'linkSampleInformationFlowModels',
    'linkSampleInternalBlockModels',
    'linkSampleObjectClassifiers',
    'linkSampleParametricModels',
    'linkSampleRequirementModels',
    'linkSampleTimingClassifiers',
    'reconcileTraceabilitySampleModels',
    'upgradeSampleCommunicationLayout',
    'upgradeSampleCompositeStructureLayout',
    'upgradeSampleInformationFlowLayout',
    'upgradeSampleTimingLayout',
  ] as const);

  type SampleName = typeof SAMPLE_METHODS[number];
  type SamplePair = 'sampleInteractionOverviewPair' | 'sampleSubmachineStatePair';
  type PlainSample = Exclude<Extract<SampleName, `sample${string}`>, SamplePair | 'sampleActivity'>;
  type DocumentSamples = Record<PlainSample, () => EditorDiagram>
    & Record<Exclude<SampleName, `sample${string}`>, () => void>
    & {
      sampleActivity: (name?: string) => EditorDiagram;
      sampleInteractionOverviewPair: (related: EditorDiagram | null) => EditorDiagram[];
      sampleSubmachineStatePair: () => EditorDiagram[];
    };

  interface StoredDocument {
    version?: number;
    diagrams?: EditorDiagram[];
    models?: DiagramModels;
    elements?: DiagramElement[];
    relations?: DiagramRelation[];
    idSeq?: number;
    counters?: Record<string, number>;
    activeId?: string;
    projectId?: string;
    projectName?: string;
  }

  interface ProjectDocumentDependencies {
    alert: (message: string) => void;
    cleanProjectName: (name: string) => string;
    clearValidationResults: () => void;
    getIdSeq: () => number;
    hydrateCurrentProject: (models: DiagramModels) => void;
    markDirty: () => void;
    markSaved: () => void;
    projectUid: () => string;
    renderAll: () => void;
    resetHistory: () => void;
    scheduleRecoverySave: (delay: number) => void;
    setIdSeq: (seq: number) => void;
    setSelection: (ids: string[]) => void;
    stringifyProject: (data: StoredDocument, pretty: boolean) => string;
    syncAllRelationModels: () => void;
    uid: () => string;
    validProjectId: (id: unknown) => boolean;
    validateProjectData: (data: unknown, options: { diagramTypes: string[]; elementKinds: string[]; relationKinds: string[] }) => unknown;
    counters: Record<string, number>;
    sampleDiagrams: DocumentSamples;
    state: {
      projectId: string;
      projectName: string;
      diagrams: EditorDiagram[];
      models: DiagramModels;
      activeId: string;
    };
    DIAGRAM_META: Record<string, object>;
    DIAGRAM_TOOLS: Record<string, { elements: readonly string[] }>;
    REL_STYLE: Record<string, object>;
  }

  function create(dependencies?: ProjectDocumentDependencies) {
    const deps: Partial<ProjectDocumentDependencies> = dependencies || {};
    const missing: string[] = REQUIRED_FUNCTIONS.filter(name => typeof deps[name] !== 'function');
    REQUIRED_VALUES.forEach(name => {
      if (deps[name] == null) missing.push(name);
    });
    if (deps.sampleDiagrams) {
      SAMPLE_METHODS.forEach(name => {
        if (typeof deps.sampleDiagrams?.[name] !== 'function') missing.push(`sampleDiagrams.${name}`);
      });
    }
    if (deps.state && !Array.isArray(deps.state.diagrams)) missing.push('state.diagrams');
    if (missing.length) {
      throw new TypeError(`Project Document 의존성이 없습니다: ${[...new Set(missing)].join(', ')}`);
    }

    const {
      alert,
      cleanProjectName,
      clearValidationResults,
      getIdSeq,
      hydrateCurrentProject,
      markDirty,
      markSaved,
      projectUid,
      renderAll,
      resetHistory,
      scheduleRecoverySave,
      setIdSeq,
      setSelection,
      stringifyProject,
      syncAllRelationModels,
      uid,
      validProjectId,
      validateProjectData,
      counters,
      sampleDiagrams,
      state,
      DIAGRAM_META,
      DIAGRAM_TOOLS,
      REL_STYLE,
    } = deps as ProjectDocumentDependencies;

    function replaceCounters(nextCounters?: Record<string, number>) {
      Object.keys(counters).forEach(key => delete counters[key]);
      Object.assign(counters, nextCounters || {});
    }

    function projectData() {
      syncAllRelationModels();
      return {
        version: PROJECT_VERSION,
        projectId: state.projectId,
        projectName: state.projectName,
        models: state.models,
        diagrams: state.diagrams,
        activeId: state.activeId,
        idSeq: getIdSeq(),
        counters,
      };
    }

    function captureState() {
      return stringifyProject(projectData(), false);
    }

    function serialize() {
      return stringifyProject(projectData(), true);
    }

    function restoreState(json: string) {
      const document: StoredDocument & { diagrams: EditorDiagram[] } = JSON.parse(json);
      setIdSeq(document.idSeq || getIdSeq());
      replaceCounters(document.counters);
      state.projectId = document.projectId && validProjectId(document.projectId)
        ? document.projectId
        : (state.projectId || projectUid());
      state.projectName = cleanProjectName(document.projectName || state.projectName);
      state.models = document.models || {};
      state.diagrams = document.diagrams;
      state.activeId = state.diagrams.find(diagram => diagram.id === document.activeId)?.id
        ?? state.diagrams[0].id;
      hydrateCurrentProject(state.models);
      setSelection([]);
      markDirty();
      renderAll();
    }

    function load(json: string, options: DocumentLoadOptions = {}) {
      try {
        const parsed: unknown = JSON.parse(json);
        validateProjectData(parsed, {
          diagramTypes: Object.keys(DIAGRAM_META),
          elementKinds: [...new Set(Object.values(DIAGRAM_TOOLS).flatMap(meta => meta.elements))],
          relationKinds: Object.keys(REL_STYLE),
        });
        const document = parsed as StoredDocument;
        const sourceVersion = document.version || 8;
        const migrateCommunicationLayout = !!document.diagrams && sourceVersion < 17;
        setIdSeq(document.idSeq || 1);
        replaceCounters(document.counters);
        state.projectId = options.projectId && validProjectId(options.projectId)
          ? options.projectId
          : document.projectId && validProjectId(document.projectId) ? document.projectId : projectUid();
        state.projectName = cleanProjectName(options.projectName || document.projectName || 'Untitled Project');
        if (document.diagrams) {
          state.models = document.models || {};
          state.diagrams = document.diagrams;
          state.activeId = document.diagrams.find(diagram => diagram.id === document.activeId)?.id
            ?? document.diagrams[0].id;
          /* v8 → v9: add the new diagram-type samples once */
          if (sourceVersion < 9) {
            state.diagrams.push(
              sampleDiagrams.sampleERD(),
              sampleDiagrams.sampleDFD(),
              sampleDiagrams.sampleMindmap(),
            );
          }
          /* v11 → v12: add the first State Machine sample once */
          if (sourceVersion < 12 && !state.diagrams.some(diagram => diagram.type === 'state')) {
            state.diagrams.push(sampleDiagrams.sampleState());
          }
          /* v12 → v13: add the Composite/Orthogonal State sample once */
          if (sourceVersion < 13 && !state.diagrams.some(diagram => diagram.name === 'Concurrent Order State')) {
            state.diagrams.push(sampleDiagrams.sampleCompositeState());
          }
          /* v13 → v14: add Submachine/Connection Point examples once */
          if (sourceVersion < 14 && !state.diagrams.some(diagram => diagram.name === 'Checkout State Machine')) {
            state.diagrams.push(...sampleDiagrams.sampleSubmachineStatePair());
          }
          /* v14 → v15: add the first Object Diagram sample once */
          if (sourceVersion < 15 && !state.diagrams.some(diagram => diagram.type === 'object')) {
            state.diagrams.push(sampleDiagrams.sampleObject());
          }
          /* v15 → v16: add the first Communication Diagram sample once */
          if (sourceVersion < 16 && !state.diagrams.some(diagram => diagram.type === 'communication')) {
            state.diagrams.push(sampleDiagrams.sampleCommunication());
          }
          /* v17 → v18: add the first Composite Structure Diagram sample once */
          if (sourceVersion < 18 && !state.diagrams.some(diagram => diagram.type === 'composite')) {
            state.diagrams.push(sampleDiagrams.sampleCompositeStructure());
          }
          /* v18 → v19: add the first Timing Diagram sample once */
          if (sourceVersion < 19 && !state.diagrams.some(diagram => diagram.type === 'timing')) {
            state.diagrams.push(sampleDiagrams.sampleTiming());
          }
          /* v19 → v20: add an advanced Activity example without replacing user diagrams */
          if (sourceVersion < 20 && !state.diagrams.some(diagram => diagram.name === 'Advanced Activity Workflow')) {
            state.diagrams.push(sampleDiagrams.sampleActivity('Advanced Activity Workflow'));
          }
          /* v20 → v21: add the first Package Diagram sample once */
          if (sourceVersion < 21 && !state.diagrams.some(diagram => diagram.type === 'package')) {
            state.diagrams.push(sampleDiagrams.samplePackage());
          }
          /* v21 → v22: add the first Profile Diagram sample once */
          if (sourceVersion < 22 && !state.diagrams.some(diagram => diagram.type === 'profile')) {
            state.diagrams.push(sampleDiagrams.sampleProfile());
          }
          /* v22 → v23: add the first Interaction Overview sample and its inline Sequence once */
          if (sourceVersion < 23 && !state.diagrams.some(diagram => diagram.type === 'interactionoverview')) {
            const referencedSequence = state.diagrams.find(diagram => diagram.type === 'sequence') || null;
            state.diagrams.push(...sampleDiagrams.sampleInteractionOverviewPair(referencedSequence));
          }
          /* v23 → v24: add the first Information Flow Diagram sample once */
          if (sourceVersion < 24 && !state.diagrams.some(diagram => diagram.type === 'informationflow')) {
            state.diagrams.push(sampleDiagrams.sampleInformationFlow());
          }
          /* v24 → v25: add the first SysML Requirement Diagram sample once */
          if (sourceVersion < 25 && !state.diagrams.some(diagram => diagram.type === 'requirement')) {
            state.diagrams.push(sampleDiagrams.sampleRequirement());
          }
          /* v25 → v26: add the first SysML Block Definition Diagram sample once */
          if (sourceVersion < 26 && !state.diagrams.some(diagram => diagram.type === 'bdd')) {
            state.diagrams.push(sampleDiagrams.sampleBlockDefinition());
          }
          /* v26 → v27: add the first SysML Internal Block Diagram sample once */
          if (sourceVersion < 27 && !state.diagrams.some(diagram => diagram.type === 'ibd')) {
            state.diagrams.push(sampleDiagrams.sampleInternalBlock());
          }
          /* v27 → v28: add the first SysML Parametric Diagram sample once */
          if (sourceVersion < 28 && !state.diagrams.some(diagram => diagram.type === 'parametric')) {
            state.diagrams.push(sampleDiagrams.sampleParametric());
          }
          /* v9 → v10: give the untouched v9 ERD sample logical names */
          if (sourceVersion === 9) {
            const upgrades: Partial<Record<string, Pick<ModelFields, 'name' | 'logicalName' | 'columns'>>> = {
              User: {
                name: 'TB_USER',
                logicalName: '회원',
                columns: [
                  'PK id <회원번호>: VARCHAR2(50)',
                  'NN name <이름>: VARCHAR2(50)',
                  'NN email <이메일>: VARCHAR2(100)',
                  'created_at <가입일시>: DATE',
                ],
              },
              Post: {
                name: 'TB_POST',
                logicalName: '게시글',
                columns: [
                  'PK id <글번호>: VARCHAR2(50)',
                  'FK NN user_id <작성자번호>: VARCHAR2(50)',
                  'NN title <제목>: VARCHAR2(200)',
                  'content <내용>: CLOB',
                ],
              },
              Tag: {
                name: 'TB_TAG',
                logicalName: '태그',
                columns: [
                  'PK id <태그번호>: VARCHAR2(50)',
                  'NN name <태그명>: VARCHAR2(30)',
                ],
              },
            };
            state.diagrams.filter(diagram => diagram.type === 'erd').forEach(diagram => {
              if (!diagram.erdMode) diagram.erdMode = 'both';
              diagram.elements.forEach(element => {
                const upgrade = element.name && upgrades[element.name];
                if (element.kind === 'entity' && upgrade && !element.logicalName) Object.assign(element, upgrade);
              });
            });
          }
        } else {
          /* migrate v7 single-diagram format, and add the new sample diagrams */
          state.models = {};
          const sequence = sampleDiagrams.sampleSequence();
          const interactionOverviewPair = sampleDiagrams.sampleInteractionOverviewPair(sequence);
          state.diagrams = [
            {
              id: uid(),
              type: 'class',
              name: 'Class Diagram',
              elements: document.elements || [],
              relations: document.relations || [],
            },
            sampleDiagrams.samplePackage(),
            sampleDiagrams.sampleProfile(),
            sampleDiagrams.sampleUseCase(),
            sampleDiagrams.sampleActivity(),
            sequence,
            ...interactionOverviewPair,
            sampleDiagrams.sampleComponent(),
            sampleDiagrams.sampleDeployment(),
            sampleDiagrams.sampleObject(),
            sampleDiagrams.sampleCommunication(),
            sampleDiagrams.sampleCompositeStructure(),
            sampleDiagrams.sampleTiming(),
            sampleDiagrams.sampleInformationFlow(),
            sampleDiagrams.sampleRequirement(),
            sampleDiagrams.sampleBlockDefinition(),
            sampleDiagrams.sampleInternalBlock(),
            sampleDiagrams.sampleParametric(),
          ];
          state.activeId = state.diagrams[0].id;
        }
        hydrateCurrentProject(state.models);
        if (migrateCommunicationLayout) sampleDiagrams.upgradeSampleCommunicationLayout();
        sampleDiagrams.upgradeSampleCompositeStructureLayout();
        sampleDiagrams.upgradeSampleTimingLayout();
        sampleDiagrams.upgradeSampleInformationFlowLayout();
        sampleDiagrams.linkSampleObjectClassifiers();
        sampleDiagrams.linkSampleCommunicationClassifiers();
        sampleDiagrams.linkSampleCompositeStructureReferences();
        sampleDiagrams.linkSampleTimingClassifiers();
        sampleDiagrams.linkSampleInformationFlowModels();
        sampleDiagrams.linkSampleRequirementModels();
        sampleDiagrams.linkSampleBlockDefinitionModels();
        sampleDiagrams.linkSampleInternalBlockModels();
        sampleDiagrams.linkSampleParametricModels();
        sampleDiagrams.reconcileTraceabilitySampleModels();
        setSelection([]);
        resetHistory();
        clearValidationResults();
        renderAll();
        markSaved();
        if (options.persist !== false) scheduleRecoverySave(0);
        return true;
      } catch (error) {
        if (!options.silent) alert(`파일을 읽을 수 없습니다: ${error instanceof Error ? error.message : String(error)}`);
        return false;
      }
    }

    return Object.freeze({
      captureState,
      load,
      projectData,
      restoreState,
      serialize,
    });
  }

  return Object.freeze({
    PROJECT_VERSION,
    REQUIRED_FUNCTIONS,
    REQUIRED_VALUES,
    SAMPLE_METHODS,
    create,
  });
}
