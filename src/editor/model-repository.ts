'use strict';

/* Project model repository — the browser over every semantic model in the
   project, and the placement rules that turn a model into a view on the
   active diagram. Diagram state, the element factory and the render passes
   are injected so this module only owns the dialog and the view presets. */
type ModelRepositoryApi = ReturnType<typeof createModelRepositoryModule>;
declare var UMLModelRepository: ModelRepositoryApi;

(function initModelRepositoryModule(root: typeof globalThis & { UMLModelRepository?: ModelRepositoryApi }, factory: () => ModelRepositoryApi) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root) root.UMLModelRepository = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, createModelRepositoryModule);

function createModelRepositoryModule() {
  const REQUIRED_FUNCTIONS = Object.freeze([
    'adoptView',
    'createElement',
    'diagramAllowsElementKind',
    'dg',
    'render',
    'renderAll',
    'renderProps',
    'sequenceLifelineTop',
    'setSelection',
    'snap',
    'snapshot',
    'uid',
  ] as const);
  const REQUIRED_VALUES = Object.freeze([
    'BDD_CLASSIFIER_KINDS',
    'FILL_DEFAULT',
    'KIND_META',
    'REL_STYLE',
    'TIMING_INTERNAL_KINDS',
    'document',
    'modalFocus',
    'state',
    'wrap',
  ] as const);
  /* kinds that only ever exist as a child of another view — the owning
     element creates and positions them, so they cannot be placed on their own */
  const DERIVED_VIEW_KINDS = Object.freeze(['region', 'connectionpointref', 'ibdframe', 'parametricframe',
    'part', 'reference', 'value', 'port', 'constraintproperty', 'constraintparameter', 'collaborationuse']);
  /* starting geometry and fill for kinds that should not use the default box */
  const VIEW_PRESETS: Readonly<Partial<Record<string, { w?: number; h?: number; fill?: string }>>> = Object.freeze({
    fragment: Object.freeze({ w: 240, h: 160 }),
    frame: Object.freeze({ w: 520, h: 360, fill: '#ffffff' }),
    interactionuse: Object.freeze({ w: 200, h: 60 }),
    interactioninline: Object.freeze({ w: 400, h: 240, fill: '#ffffff' }),
    informationitem: Object.freeze({ w: 208, h: 88, fill: '#eef8f8' }),
    requirement: Object.freeze({ w: 296, h: 144, fill: '#edf4fa' }),
    continuation: Object.freeze({ w: 120, h: 30 }),
    boundary: Object.freeze({ w: 280, h: 200 }),
    mindnode: Object.freeze({ fill: '#d7e6f7' }),
    compositestate: Object.freeze({ w: 360, h: 280, fill: '#f2f4ff' }),
    submachinestate: Object.freeze({ w: 240, h: 96, fill: '#eef1ff' }),
    object: Object.freeze({ fill: '#f8f0fb' }),
    artifactinstance: Object.freeze({ w: 160, h: 64, fill: '#f5f1fb' }),
    componentinstance: Object.freeze({ w: 176, h: 64, fill: '#f5f1fb' }),
    nodeinstance: Object.freeze({ w: 184, h: 96, fill: '#f5f1fb' }),
    collaboration: Object.freeze({ w: 440, h: 320, fill: '#f5f6ff' }),
  });
  const BDD_CLASSIFIER_PRESET = Object.freeze({ w: 256, h: 88, fill: '#edf4f7' });
  const TIMING_LIFELINE_PRESET = Object.freeze({ w: 1000, h: 132, fill: '#f8eadf' });
  const MODAL_ID = 'model-repository-modal';
  const DEFAULT_VIEW_SIZE = Object.freeze({ halfWidth: 60, halfHeight: 30, margin: 8 });

  interface RepositoryModal {
    close: (options?: { restoreFocus?: boolean }) => boolean;
    requestClose: (reason: string) => void;
    focusInitial: (element: HTMLElement) => void;
  }

  type UnhydratedView = Omit<DiagramElement, 'kind'> & { modelId: string };

  interface ModelRepositoryDependencies {
    adoptView: (view: DiagramElement | UnhydratedView) => DiagramElement;
    createElement: (kind: string, x: number, y: number) => DiagramElement;
    diagramAllowsElementKind: (type: string, kind: string) => boolean;
    dg: () => EditorDiagram;
    render: () => void;
    renderAll: () => void;
    renderProps: () => void;
    sequenceLifelineTop: (diagram: EditorDiagram) => number;
    setSelection: (ids: string[]) => void;
    snap: (value: number) => number;
    snapshot: () => void;
    uid: () => string;
    BDD_CLASSIFIER_KINDS: ReadonlySet<string>;
    FILL_DEFAULT: string;
    KIND_META: Record<string, { label: string; icon: string; color: string }>;
    REL_STYLE: Partial<Record<string, object>>;
    TIMING_INTERNAL_KINDS: ReadonlySet<string>;
    document: Document;
    modalFocus: {
      activate: (options: { overlay: HTMLElement; dialog: HTMLElement; initialFocus: HTMLElement }) => RepositoryModal;
      closeOverlay: (overlay: HTMLElement, options: { restoreFocus: boolean }) => boolean;
    };
    state: { zoom: number; models: DiagramModels; diagrams: EditorDiagram[] };
    wrap: HTMLElement;
  }

  function create(dependencies?: ModelRepositoryDependencies) {
    const deps: Partial<ModelRepositoryDependencies> = dependencies || {};
    const missing: string[] = REQUIRED_FUNCTIONS.filter(name => typeof deps[name] !== 'function');
    REQUIRED_VALUES.forEach(name => {
      if (deps[name] == null) missing.push(name);
    });
    (['BDD_CLASSIFIER_KINDS', 'TIMING_INTERNAL_KINDS'] as const).forEach(name => {
      if (deps[name] != null && typeof deps[name].has !== 'function') missing.push(`${name}.has`);
    });
    if (deps.document != null && typeof deps.document.createElement !== 'function') {
      missing.push('document.createElement');
    }
    if (deps.modalFocus != null) {
      (['activate', 'closeOverlay'] as const).forEach(name => {
        if (typeof deps.modalFocus?.[name] !== 'function') missing.push(`modalFocus.${name}`);
      });
    }
    if (missing.length) {
      throw new TypeError(`Model Repository 의존성이 없습니다: ${[...new Set(missing)].join(', ')}`);
    }

    const {
      adoptView,
      createElement,
      diagramAllowsElementKind,
      dg,
      render,
      renderAll,
      renderProps,
      sequenceLifelineTop,
      setSelection,
      snap,
      snapshot,
      uid,
      BDD_CLASSIFIER_KINDS,
      FILL_DEFAULT,
      KIND_META,
      REL_STYLE,
      TIMING_INTERNAL_KINDS,
      document,
      modalFocus,
      state,
      wrap,
    } = deps as ModelRepositoryDependencies;

    /* ── Placement rules ─────────────────────────────────────── */

    /* a model can get a view here when the diagram accepts its kind and the
       kind is not one the owning element manages for us */
    function canPlaceKind(kind: string) {
      return diagramAllowsElementKind(dg().type, kind)
        && !DERIVED_VIEW_KINDS.includes(kind)
        && !TIMING_INTERNAL_KINDS.has(kind);
    }

    /* drop the new view in the middle of what the user is currently looking at */
    function viewportCentre() {
      return {
        x: snap((wrap.scrollLeft + wrap.clientWidth / 2) / state.zoom - DEFAULT_VIEW_SIZE.halfWidth),
        y: snap((wrap.scrollTop + wrap.clientHeight / 2) / state.zoom - DEFAULT_VIEW_SIZE.halfHeight),
      };
    }

    function createViewForModel(modelId: string) {
      const model = state.models[modelId];
      if (!model) return null;
      if (model.kind === 'execution' || !canPlaceKind(model.kind)) return null;
      const centre = viewportCentre();
      const y = dg().type === 'sequence' && model.kind === 'lifeline'
        ? sequenceLifelineTop(dg())
        : centre.y;
      const view = {
        id: uid(), modelId,
        x: Math.max(DEFAULT_VIEW_SIZE.margin, centre.x),
        y: Math.max(DEFAULT_VIEW_SIZE.margin, y),
        w: 0, h: 0, fill: FILL_DEFAULT,
      };
      if (VIEW_PRESETS[model.kind]) Object.assign(view, VIEW_PRESETS[model.kind]);
      if (BDD_CLASSIFIER_KINDS.has(model.kind)) Object.assign(view, BDD_CLASSIFIER_PRESET);
      if (model.kind === 'lifeline' && dg().type === 'timing') Object.assign(view, TIMING_LIFELINE_PRESET);
      return adoptView(view);
    }

    /* ── Repository dialog ───────────────────────────────────── */

    let activeModal: RepositoryModal | null = null;

    function close(restoreFocus = true) {
      const overlay = document.getElementById(MODAL_ID);
      if (!overlay) { activeModal = null; return false; }
      const closed = activeModal?.close({ restoreFocus })
        || modalFocus.closeOverlay(overlay, { restoreFocus });
      activeModal = null;
      return closed;
    }

    /* models that can be browsed: real element kinds only, never relations,
       and never the Execution bars a lifeline owns */
    function browsableModels(query: string) {
      const q = String(query || '').trim().toLowerCase();
      return Object.values(state.models)
        .filter(m => KIND_META[m.kind] && !REL_STYLE[m.kind] && m.kind !== 'execution')
        .filter(m => !q || `${m.name || ''} ${KIND_META[m.kind].label}`.toLowerCase().includes(q))
        .sort((a, b) => String(a.name || '').localeCompare(String(b.name || '')));
    }

    function viewCount(modelId: string) {
      return state.diagrams.reduce((n, d) => n + d.elements.filter(v => v.modelId === modelId).length, 0);
    }

    function hintText() {
      const type = dg().type;
      if (type === 'informationflow') {
        return 'Class, Component, Actor 등 기존 모델을 Add View로 배치한 뒤 Information Flow의 송신·수신 주체로 사용하세요.';
      }
      if (type === 'requirement') {
        return '기존 모델을 Add View로 배치한 뒤 Requirement에 Satisfy, Verify, Refine, Trace 관계로 연결하세요.';
      }
      return '같은 모델을 여러 다이어그램에 배치하면 이름과 속성이 함께 동기화됩니다.';
    }

    /* place the model on the active diagram; composite states arrive with the
       one region they must always have */
    function addView(modelId: string, modal: RepositoryModal) {
      snapshot();
      const view = createViewForModel(modelId);
      if (!view) return;
      dg().elements.push(view);
      if (view.kind === 'compositestate') {
        const region = adoptView(createElement('region', view.x, view.y));
        region.parentId = view.id; region.regionOrder = 0;
        dg().elements.push(region);
      }
      setSelection([view.id]); modal.close(); renderAll();
    }

    /* every row's action button reads "Add View" on its own, so each one is named
       by its own visible label plus the model name — the visible text stays first
       (WCAG 2.5.3) and the row is no longer ambiguous out of context */
    let rowNameSequence = 0;

    function buildRow(model: DiagramModel, modal: RepositoryModal) {
      const row = document.createElement('div'); row.className = 'model-repository-row';
      row.setAttribute('role', 'listitem');
      const icon = document.createElement('span');
      icon.className = 'ex-icon'; icon.style.background = KIND_META[model.kind].color; icon.textContent = KIND_META[model.kind].icon;
      const info = document.createElement('div'); info.className = 'model-repository-info';
      const name = document.createElement('div'); name.className = 'model-repository-name'; name.textContent = model.name || '(unnamed)';
      name.id = `uml-model-row-${++rowNameSequence}`;
      const count = viewCount(model.id);
      const meta = document.createElement('div'); meta.className = 'model-repository-meta';
      meta.textContent = `${KIND_META[model.kind].label} · ${model.id} · ${count} view${count === 1 ? '' : 's'}`;
      info.append(name, meta);
      const action = document.createElement('button'); action.className = 'model-repository-action';
      const existing = dg().elements.find(v => v.modelId === model.id);
      if (existing) {
        action.textContent = 'Select';
        action.addEventListener('click', () => {
          setSelection([existing.id]); modal.close(); render(); renderProps();
        });
      } else if (canPlaceKind(model.kind)) {
        action.textContent = 'Add View';
        action.addEventListener('click', () => addView(model.id, modal));
      } else {
        action.textContent = 'Not compatible'; action.disabled = true;
      }
      icon.setAttribute('aria-hidden', 'true');
      action.id = `${name.id}-action`;
      action.setAttribute('aria-labelledby', `${action.id} ${name.id}`);
      row.append(icon, info, action);
      return row;
    }

    function open() {
      close(false);
      const overlay = document.createElement('div');
      overlay.id = MODAL_ID;
      overlay.className = 'modal-overlay';
      const dialog = document.createElement('div');
      dialog.className = 'model-repository-dialog';
      const header = document.createElement('div');
      header.className = 'model-repository-header';
      const title = document.createElement('strong'); title.textContent = 'Project Models';
      const closeButton = document.createElement('button'); closeButton.type = 'button'; closeButton.className = 'modal-close'; closeButton.textContent = '×';
      closeButton.title = '닫기'; closeButton.setAttribute('aria-label', 'Project Models 닫기');
      header.append(title, closeButton);
      const search = document.createElement('input');
      search.className = 'model-search'; search.type = 'search'; search.placeholder = '모델 이름 또는 종류 검색';
      /* the search box has no visible caption, so the placeholder is its only
         label — and a placeholder is not an accessible name */
      search.setAttribute('aria-label', '모델 이름 또는 종류 검색');
      const list = document.createElement('div'); list.className = 'model-repository-list';
      list.setAttribute('aria-live', 'polite');
      const hint = document.createElement('div');
      hint.className = 'model-repository-hint';
      hint.textContent = hintText();

      const renderList = () => {
        list.textContent = '';
        const models = browsableModels(search.value);
        if (!models.length) {
          /* a `list` may only contain `listitem` children */
          list.removeAttribute('role'); list.removeAttribute('aria-label');
          const empty = document.createElement('div'); empty.className = 'model-repository-empty'; empty.textContent = '일치하는 모델이 없습니다.';
          list.appendChild(empty); return;
        }
        list.setAttribute('role', 'list');
        list.setAttribute('aria-label', `모델 ${models.length}개`);
        models.forEach(model => list.appendChild(buildRow(model, modal)));
      };
      search.addEventListener('input', renderList);
      dialog.append(header, search, hint, list); overlay.appendChild(dialog); document.body.appendChild(overlay);
      const modal = modalFocus.activate({ overlay, dialog, initialFocus: search });
      activeModal = modal;
      closeButton.addEventListener('click', () => modal.requestClose('close-button'));
      overlay.addEventListener('mousedown', ev => {
        if (ev.target === overlay) modal.requestClose('backdrop');
      });
      renderList(); modal.focusInitial(search);
      return overlay;
    }

    return Object.freeze({
      canPlaceKind,
      close,
      createViewForModel,
      open,
    });
  }

  return Object.freeze({
    REQUIRED_FUNCTIONS,
    REQUIRED_VALUES,
    DERIVED_VIEW_KINDS,
    VIEW_PRESETS,
    MODAL_ID,
    create,
  });
}
