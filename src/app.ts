'use strict';

/* ═══════════════════════════════════════════════════════════════
   UML Studio V7 Professional — StarUML-style diagram editor
   UML 2.5: Class · Use Case · Activity · Sequence · Component ·
   Deployment · State Machine · Package · Profile · Interaction Overview ·
   Information Flow · SysML Requirement · SysML Block Definition ·
   SysML Internal Block · SysML Parametric
   ═══════════════════════════════════════════════════════════════ */

const SVGNS = 'http://www.w3.org/2000/svg';
const CANVAS_W = 3000, CANVAS_H = 2000;

/* ── Dependency wiring ─────────────────────────────────────── */
/* One registry of everything the modules may ask for, filled in the order the
   file already runs: primitives first, then each module's own exports once it
   exists. `provide` hands a module exactly the names it declared in
   REQUIRED_FUNCTIONS / REQUIRED_VALUES and nothing else, so a module cannot
   reach a dependency it never declared, and a missing one still fails at init
   with that module's own message. Deps that only exist later in the file are
   registered as arrows so the lookup happens when they are called. */
const wiring: Record<string, unknown> = Object.create(null);
/* A module that is created before its provider exists is handed an arrow that
   forwards to it; registering that provider later replaces the arrow with the
   real export. Those names are the only ones allowed to be registered twice. */
const REPLACEABLE_WIRING = new Set([
  'hasClipboard', 'renderMinimap', 'resetHistory', 'scheduleRecoverySave',
]);
/* every controller exports these; app.js drives its own modules' lifecycles and
   no module ever declares them, so they do not belong in the registry */
const LIFECYCLE_EXPORTS = new Set(['attach', 'detach']);
/* Object.assign would otherwise let a controller's generic export — `render`,
   `clear`, `attach` — silently replace an unrelated binding, and every module
   wired after that point would quietly receive the wrong function. */
const register = (...sources: object[]) => {
  sources.forEach(source => Object.entries(source).forEach(([name, value]) => {
    if (LIFECYCLE_EXPORTS.has(name)) return;
    if (name in wiring && wiring[name] !== value && !REPLACEABLE_WIRING.has(name)) {
      throw new Error(`배선 이름 충돌: ${name} — 이미 등록된 다른 값을 덮어쓰려 했습니다`);
    }
    wiring[name] = value;
  }));
  return wiring;
};
type WiredModule = {
  REQUIRED_FUNCTIONS?: readonly string[];
  REQUIRED_VALUES?: readonly string[];
  create: (...args: never[]) => unknown;
};
function provide<Module extends WiredModule>(mod: Module): NonNullable<Parameters<Module['create']>[0]> {
  const out: Record<string, unknown> = {};
  [...(mod.REQUIRED_FUNCTIONS || []), ...(mod.REQUIRED_VALUES || [])].forEach(name => {
    if (name in wiring) out[name] = wiring[name];
  });
  // Each controller validates the dependencies it receives at creation.
  return out as NonNullable<Parameters<Module['create']>[0]>;
}

const {
  GRID,
  relationEndpoints: computeRelationEndpoints,
  polylinePath,
  headGeom,
  curvedBranchGeometry,
  bezierPoint,
  selfTransitionGeometry,
} = UMLCanvasGeometry;
const { hydrateView, hydrateProject } = UMLModelCore;
const {
  polylineMidpoint,
  polylineJumpPath,
} = UMLOrthogonalRouter;
const { parse: parseQuickEditExpression } = UMLExpressionParser;
const {
  erdDefaultCardinality,
  parseErdCardinality,
  normalizeErdCardinality,
} = UMLErdCardinality;
const {
  DIAGRAM_META,
  DIAGRAM_TOOLS,
  registeredElementKinds,
  registeredRelationKinds,
} = UMLDiagramRegistry;
const {
  DASH_PATTERNS,
  KIND_META,
  REL_STYLE,
} = UMLPresentationRegistry;
const {
  relation: DASH_REL,
  lifeline: DASH_LIFE,
  note: DASH_NOTE,
  selection: DASH_SELECT,
} = DASH_PATTERNS;
const {
  ER_RELATION_KINDS,
  relationSupportsEndQuickEdit,
  relationEndAggregation,
  relationEndNavigability,
  relationEndRoleLabel,
} = UMLRelationEnd;
const EXEC_WIDTH = 12;
const EXEC_NEST_OFFSET = 8;

/* StarUML-like visual constants */
const FILL_DEFAULT = '#fffbd8';
const STROKE = '#3d3a2e';
const TEXT_COLOR = '#1c1c1c';
const FONT_FAMILY = 'Helvetica, Arial, "Apple SD Gothic Neo", sans-serif';
const FONT12 = `12px ${FONT_FAMILY}`;
const FONT13B = `600 13px ${FONT_FAMILY}`;
const LINE_H = 15;
const PAD = 7;

/* every plain re-export of a loaded library, under the name modules ask for */
register(UMLCanvasGeometry, UMLModelCore, UMLSequenceLayout, UMLOrthogonalRouter,
  UMLValidation, UMLIconScript, UMLErdColumn, UMLErdSchema, UMLErdCardinality,
  UMLDiagramRegistry, UMLPresentationRegistry, UMLRelationEnd);
register({
  parseQuickEditExpression,
  DASH_REL, DASH_LIFE, DASH_NOTE, DASH_SELECT,
  SVGNS, CANVAS_W, CANVAS_H, EXEC_WIDTH, EXEC_NEST_OFFSET,
  FILL_DEFAULT, STROKE, TEXT_COLOR, FONT_FAMILY, FONT12, FONT13B, LINE_H, PAD,
  /* host objects the modules take rather than reach for */
  document, localStorage, alert, btoa, Image, URL, XMLSerializer, MutationObserver,
  setTimeout, clearTimeout, setInterval, clearInterval,
  requestAnimationFrame, cancelAnimationFrame,
  eventRoot: window,
  viewport: window,
});

/* UML AssociationEnd / LinkEnd and ER RelationshipEnd metadata.  Multiplicity
   remains in sourceLabel/targetLabel so older projects and exporters continue
   to round-trip without a migration. */
function relationEndAt(p: DiagramPoint, radius = 26): ReturnType<QuickEditDependencies['relationEndAt']> {
  const rels = dg().relations;
  for (let index = rels.length - 1; index >= 0; index--) {
    const r = rels[index];
    if (!relationSupportsEndQuickEdit(r)) continue;
    const endpoints = relEndpoints(r);
    if (!endpoints) continue;
    const sourceDistance = Math.hypot(p.x - endpoints.p1.x, p.y - endpoints.p1.y);
    const targetDistance = Math.hypot(p.x - endpoints.p2.x, p.y - endpoints.p2.y);
    if (Math.min(sourceDistance, targetDistance) <= radius) {
      return { r, end: sourceDistance <= targetDistance ? 'source' : 'target' };
    }
  }
  return null;
}
const AUTO_LABEL: Partial<Record<string, string>> = {
  include: '«include»', extend: '«extend»', deploy: '«deploy»', 'msg-create': '«create»',
  exceptionhandler: '«exception»', activityinterrupt: '«interrupt»',
  informationflow: '«flow»',
  reqcopy: '«copy»', derivereqt: '«deriveReqt»', verify: '«verify»',
  satisfy: '«satisfy»', refine: '«refine»', trace: '«trace»',
};
const isMsg = (kind?: string) => kind?.startsWith('msg-') === true;
const isCommMsg = (kind: string) => kind === 'comm-forward' || kind === 'comm-reverse';
const isInteractionMsg = (kind: string) => isMsg(kind) || isCommMsg(kind);

function assertDiagramRegistryIntegrity() {
  const missingTools = Object.keys(DIAGRAM_META).filter(type => !DIAGRAM_TOOLS[type]);
  const missingMeta = Object.keys(DIAGRAM_TOOLS).filter(type => !Object.hasOwn(DIAGRAM_META, type));
  const unknownElements = registeredElementKinds().filter(kind => !Object.hasOwn(KIND_META, kind));
  const unknownRelations = registeredRelationKinds().filter(kind => !Object.hasOwn(REL_STYLE, kind));
  const problems = [
    missingTools.length ? `도구 없음: ${missingTools.join(', ')}` : '',
    missingMeta.length ? `메타데이터 없음: ${missingMeta.join(', ')}` : '',
    unknownElements.length ? `요소 메타데이터 없음: ${unknownElements.join(', ')}` : '',
    unknownRelations.length ? `관계 스타일 없음: ${unknownRelations.join(', ')}` : '',
  ].filter(Boolean);
  if (problems.length) throw new Error(`다이어그램 레지스트리가 올바르지 않습니다 · ${problems.join(' · ')}`);
}
assertDiagramRegistryIntegrity();

const INSTANCE_KINDS = new Set(['object', 'artifactinstance', 'componentinstance', 'nodeinstance']);
const INSTANCE_CLASSIFIER_KINDS = {
  object: [
    'class', 'interface', 'enumeration', 'component', 'artifact', 'node',
    'block', 'valuetype', 'interfaceblock', 'constraintblock',
  ],
  artifactinstance: ['artifact'],
  componentinstance: ['component'],
  nodeinstance: ['node'],
};

const COMPOSITE_CONTAINER_KINDS = new Set([
  'class', 'collaboration', 'block', 'interfaceblock', 'constraintblock',
]);
const COMPOSITE_CONNECTABLE_KINDS = new Set(['part', 'port']);
const BDD_CLASSIFIER_KINDS = new Set(['block', 'valuetype', 'interfaceblock', 'constraintblock']);
const BDD_RELATION_KINDS = new Set([
  'association', 'directed', 'generalization', 'dependency',
  'aggregation', 'composition', 'connector', 'notelink',
]);
const IBD_CONTAINER_KINDS = new Set(['ibdframe', 'part', 'reference']);
const IBD_TYPED_KINDS = new Set(['part', 'reference', 'value']);
const IBD_CONNECTABLE_KINDS = new Set(['part', 'reference', 'port']);
const PARAMETRIC_CONTAINER_KINDS = new Set(['parametricframe', 'constraintproperty']);
const PARAMETRIC_CONNECTABLE_KINDS = new Set(['constraintparameter', 'value']);
const PACKAGE_CONTAINER_KINDS = new Set(['package', 'model', 'subsystem']);
const TIMING_LABEL_WIDTH = 176;
const TIMING_ROW_HEIGHT = 44;
const TIMING_INTERNAL_KINDS = new Set(['timingstate', 'timesegment', 'timetick', 'timeconstraint', 'durationconstraint']);

const STATE_VERTEX_KINDS = new Set([
  'state', 'compositestate', 'submachinestate', 'stateinitial', 'statefinal', 'choice', 'junction', 'statefork', 'shallowhistory', 'deephistory',
  'entrypoint', 'exitpoint', 'terminate', 'connectionpointref',
]);

const ACTIVITY_CONTAINER_KINDS = new Set([
  'swimlanev', 'swimlaneh', 'interruptibleregion', 'structuredactivity', 'expansionregion',
]);
const ACTIVITY_PIN_KINDS = new Set(['inputpin', 'outputpin', 'expansioninput', 'expansionoutput']);
const ACTIVITY_ACTION_KINDS = new Set(['action', 'sendsignal', 'acceptsignal', 'timeevent']);
const ACTIVITY_OBJECT_KINDS = new Set([
  'objectnode', 'centralbuffer', 'activitydatastore', 'activityparameter',
  'inputpin', 'outputpin', 'expansioninput', 'expansionoutput',
]);
const ACTIVITY_VERTEX_KINDS = new Set([
  ...ACTIVITY_ACTION_KINDS, 'initial', 'final', 'flowfinal', 'decision', 'merge', 'forkbar', 'joinbar',
  'structuredactivity', 'interactionuse', 'interactioninline', ...ACTIVITY_OBJECT_KINDS,
]);
const INFORMATION_FLOW_ENDPOINT_KINDS = new Set([
  'actor', 'usecase', 'node', 'artifact', 'class', 'component', 'interface',
  'package', 'model', 'subsystem', 'action', 'sendsignal', 'acceptsignal',
  'timeevent', 'objectnode', 'activityparameter', 'object',
  'artifactinstance', 'componentinstance', 'nodeinstance',
]);
const INFORMATION_FLOW_CONVEYED_KINDS = new Set([
  'informationitem', 'class', 'interface', 'component',
]);
const REQUIREMENT_MODEL_ELEMENT_KINDS = new Set([
  'requirement', 'actor', 'usecase', 'node', 'artifact', 'class', 'component', 'interface',
  'package', 'model', 'subsystem', 'action', 'sendsignal', 'acceptsignal',
  'timeevent', 'objectnode', 'activityparameter', 'object',
  'artifactinstance', 'componentinstance', 'nodeinstance', 'informationitem',
]);
const REQUIREMENT_TYPES = [
  'requirement', 'functionalRequirement', 'interfaceRequirement',
  'performanceRequirement', 'physicalRequirement', 'designConstraint',
];
const REQUIREMENT_RELATION_KINDS = new Set([
  'reqcontainment', 'reqcopy', 'derivereqt', 'verify', 'satisfy', 'refine', 'trace',
]);

function diagramKindLabel(kind: string, diagramType = activeDiagram()?.type) {
  if ((diagramType === 'bdd' || diagramType === 'ibd') && kind === 'connector') return 'Connector';
  return (Object.hasOwn(KIND_META, kind) && KIND_META[kind as keyof typeof KIND_META].label) || kind;
}

/* ── State ─────────────────────────────────────────────────── */
const state: ProjectStoreState & CanvasSelectionState & {
  activeId: string | null;
  showMinimap: boolean;
  validationStale: boolean;
  runtimeErrors?: { count: number; last: string; at: number };
} = {
  models: {},      // semantic model repository: modelId -> model
  diagrams: [],   // { id, type, name, elements:[], relations:[] }
  activeId: null,
  selectedId: null,  // single-selection id (null when 0 or 2+ selected)
  selection: [],     // selected element and relation IDs
  tool: 'select',
  zoom: 1,
  dirty: false,
  projectId: '',
  projectName: 'Untitled Project',
  sqliteRevision: null,
  indexedRevision: null,
  autosaveStatus: 'idle',
  autosaveBackend: 'none',
  lastAutosavedAt: null,
  storagePersistent: false,
  showMinimap: false,
  validationStale: false,
};
function setSelection(ids: string[]) {
  state.selection = ids;
  state.selectedId = ids.length === 1 ? ids[0] : null;
}
let idSeq = 1;
const counters: Record<string, number> = {};

const canvas = document.querySelector<SVGSVGElement>('svg#canvas');
if (!canvas) throw new Error('캔버스 SVG를 찾을 수 없습니다.');
const svg = canvas;
const wrap = document.getElementById('canvas-wrap');
const minimap = document.getElementById('minimap');
const minimapSvg = document.getElementById('minimap-svg');
const validationPanel = document.getElementById('bottom-panel');
const validationSummary = document.getElementById('validation-summary');
const validationResults = document.getElementById('validation-results');
const rerunValidationButton = document.querySelector('[data-action="rerun-validation"]');
const closeValidationButton = document.querySelector('[data-action="close-validation"]');
const statusLeft = document.getElementById('status-left');
const statusRight = document.getElementById('status-right');

/* ── Utilities ─────────────────────────────────────────────── */
const meas = document.createElement('canvas').getContext('2d');
function tw(text: string | undefined, font: string) {
  if (!meas) return 0;
  meas.font = font;
  return meas.measureText(text || '').width;
}
const uid = () => {
  let id: string;
  do {
    id = 'e' + (idSeq++);
  } while (state.diagrams.some(diagram =>
    diagram.id === id
    || diagram.elements.some(view => view.id === id)
    || diagram.relations.some(view => view.id === id)));
  return id;
};
const modelUid = () => {
  let id;
  do {
    id = 'm' + (idSeq++);
  } while (state.models[id]);
  return id;
};
const validProjectId = (value: unknown): value is string => typeof value === 'string' && /^[A-Za-z0-9._-]{1,128}$/.test(value);
const projectUid = () => {
  const random = globalThis.crypto?.randomUUID?.()
    || `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 12)}`;
  return `p-${random}`;
};
const cleanProjectName = (value: unknown) => String(value || '').trim().slice(0, 200) || 'Untitled Project';
const activeDiagram = () => state.diagrams.find(d => d.id === state.activeId);
function dg(): EditorDiagram {
  const diagram = activeDiagram();
  if (!diagram) throw new Error('활성 다이어그램을 찾을 수 없습니다.');
  return diagram;
}
const byId = (id?: string | null) => activeDiagram()?.elements.find(e => e.id === id);
const relById = (id?: string | null) => activeDiagram()?.relations.find(r => r.id === id);
function el<Tag extends keyof SVGElementTagNameMap>(tag: Tag, attrs: SvgAttributes, parent?: SVGElement | null): SVGElementTagNameMap[Tag] {
  const n = document.createElementNS(SVGNS, tag);
  for (const k in attrs) n.setAttribute(k, String(attrs[k]));
  if (parent) parent.appendChild(n);
  return n;
}
/* ── Semantic model repository / diagram views ───────────── */
function adoptView(view: DiagramElement | DiagramRelation) {
  return hydrateView(view, state.models, modelUid);
}
function hydrateCurrentProject(models?: DiagramModels) {
  state.models = hydrateProject(state.diagrams, models || {}, modelUid);
  syncAllRelationModels();
}
function syncRelationModel(r: DiagramRelation, diagram = activeDiagram()) {
  const model = r.modelId ? state.models[r.modelId] : undefined;
  if (!model || !diagram) return;
  const from = diagram.elements.find(e => e.id === r.from);
  const to = diagram.elements.find(e => e.id === r.to);
  model.fromModelId = from ? from.modelId : null;
  model.toModelId = to ? to.modelId : null;
}
function syncAllRelationModels() {
  state.diagrams.forEach(d => {
    d.relations.filter(r => r.kind === 'commconnector').forEach(r => syncCommunicationMessages(r, d));
    d.relations.forEach(r => syncRelationModel(r, d));
  });
}

/* ── Element creation / generated names ───────────────────── */
register({
  ACTIVITY_PIN_KINDS, BDD_CLASSIFIER_KINDS, FILL_DEFAULT,
  TIMING_ROW_HEIGHT, counters, dg, uid,
});
const elementFactory = UMLElementFactory.create(provide(UMLElementFactory));
register(elementFactory);

/* ── Editable compartment member lists ────────────────────── */
const memberListsController = UMLMemberLists.create();
register(memberListsController);

/* the kind vocabularies, the shared state and lookups, and every remaining
   app-owned function — hoisting makes the last group safe to register here
   no matter where it is defined below */
register({
  INSTANCE_KINDS, COMPOSITE_CONTAINER_KINDS, COMPOSITE_CONNECTABLE_KINDS,
  BDD_CLASSIFIER_KINDS, BDD_RELATION_KINDS,
  IBD_CONTAINER_KINDS, IBD_TYPED_KINDS, IBD_CONNECTABLE_KINDS,
  PARAMETRIC_CONTAINER_KINDS, PARAMETRIC_CONNECTABLE_KINDS,
  PACKAGE_CONTAINER_KINDS, STATE_VERTEX_KINDS,
  TIMING_INTERNAL_KINDS, TIMING_LABEL_WIDTH, TIMING_ROW_HEIGHT,
  ACTIVITY_CONTAINER_KINDS, ACTIVITY_PIN_KINDS, ACTIVITY_ACTION_KINDS,
  ACTIVITY_OBJECT_KINDS, ACTIVITY_VERTEX_KINDS,
  INFORMATION_FLOW_ENDPOINT_KINDS, INFORMATION_FLOW_CONVEYED_KINDS,
  REQUIREMENT_MODEL_ELEMENT_KINDS, REQUIREMENT_RELATION_KINDS, REQUIREMENT_TYPES,
  AUTO_LABEL, INSTANCE_CLASSIFIER_KINDS,
  state, counters, svg, wrap, minimap, minimapSvg,
  dg, byId, relById, el, tw, uid, modelUid, projectUid,
  isMsg, isCommMsg, isInteractionMsg, cleanProjectName, validProjectId,
  adoptView, branchGeom,
  contentBBox, diagramKindLabel,
  drawElement, drawRelation, erdRelationCardinality,
  focusProps, hydrateCurrentProject, markDirty, markSaved,
  relEndpoints, relLabel, relationEndAt, renderAll, renderProps,
  setErdMode, setSelection, stateSelfTransitionGeom, svgPoint,
  syncRelationModel, syncAllRelationModels,
  clearValidationResults: () => validationPanelController.clear(),
  getIdSeq: () => idSeq,
  setIdSeq: (value: number) => { idSeq = value; },
});
/* names that describe an app-level action rather than one binding */
register({
  renderCanvas: () => render(),
  renderExplorer: () => modelExplorer.render(),
  renderTabs: () => diagramTabs.render(),
  renderMinimap: () => viewportController.renderMinimap(),
  interactionState: () => canvasInteraction.state(),
  cancelInteraction: () => cancelActiveInteraction(),
  clearLinking: () => canvasInteraction.setLinking(null),
  getLinking: () => canvasInteraction.getLinking(),
  confirmAction: (message: string) => confirm(message),
  /* command availability, asked for while a menu is being built */
  canBringFront: () => canReorderSelection(true),
  canSendBack: () => canReorderSelection(false),
  hasSelection: () => state.selection.length > 0,
  hasElementSelection: () => state.selection.some(byId),
  hasClipboard: () => selectionEditing.hasClipboard(),
  isMinimapVisible: () => state.showMinimap,
  isValidationVisible: () => validationPanelController.isVisible(),
  moveSelection: (key: string, coarse: boolean) => moveSelectionByKey(key, coarse),
  selectAll: () => selectAllViews(),
  resetHistory: () => historyController.resetHistory(),
  scheduleRecoverySave: (delay?: number) => projectStore.scheduleRecoverySave(delay),
});
/* the panels and libraries the modules are handed rather than look up */
register({
  appRoot: document.getElementById('app'),
  toolbar: document.getElementById('toolbar'),
  toolbox: document.getElementById('toolbox'),
  tabs: document.getElementById('tabs'),
  explorer: document.getElementById('explorer'),
  searchInput: document.getElementById('explorer-search'),
  triggerButton: document.getElementById('erd-name-tools-button'),
  validationPanel,
  validationSummary,
  validationResults,
  rerunButton: rerunValidationButton,
  closeButton: closeValidationButton,
  statusLeft,
  statusRight,
  persistence: UMLPersistence,
  exporters: UMLExporters,
  ddlImporter: UMLDdlImporter,
  drawioImporter: UMLDrawioImporter,
});

/* ── Modal focus and lifecycle ─────────────────────────────── */
const modalFocus = UMLModalFocus.create(provide(UMLModalFocus));
register({
  modalFocus,
  closeTopModal: () => modalFocus.closeTop(),
});

/* ── Status bar ────────────────────────────────────────────── */
const statusBar = UMLStatusBar.create(provide(UMLStatusBar));
const { flash: flashStatus, render: renderStatus } = statusBar;
register({ flashStatus, renderStatus, now: () => Date.now() });

/* uncaught errors reach the status bar from here on; the console entry and
   the error event itself are untouched */
const runtimeErrors = UMLRuntimeErrors.create(provide(UMLRuntimeErrors));
runtimeErrors.attach();

/* ── Sample project ────────────────────────────────────────── */
const sampleDiagrams = UMLSampleDiagrams.create(provide(UMLSampleDiagrams));
register(sampleDiagrams, { sampleDiagrams });
function markDirty() {
  state.dirty = true;
  projectStore.markRecoveryDirty();
  state.validationStale = true;
  document.title = `● ${state.projectName} — UML Studio V7 Professional`;
  validationPanelController.updateSummary();
  scheduleRecoverySave();
}
function markSaved() {
  state.dirty = false;
  document.title = `${state.projectName} — UML Studio V7 Professional`;
  renderStatus();
}

/* ── Project document / migrations ─────────────────────────── */
const projectDocument = UMLProjectDocument.create(provide(UMLProjectDocument));
const { serialize } = projectDocument;
register(projectDocument);

/* ── Undo / Redo ───────────────────────────────────────────── */
const historyController = UMLHistoryController.create(provide(UMLHistoryController));
const {
  redo,
  snapshot,
  undo,
} = historyController;
register(historyController);

/* ── Containment / layout ──────────────────────────────────── */
const containmentLayout = UMLContainmentLayout.create(provide(UMLContainmentLayout));
const {
  childViews,
  compositePortDirection,
  timingConstraintAnchor,
} = containmentLayout;
register(containmentLayout);

/* ── Element measurement / label composition ──────────────── */
const elementMeasure = UMLElementMeasure.create(provide(UMLElementMeasure));
const {
  erdMode,
  packageElementTitle,
  referencedInteraction,
  referencedInteractionName,
} = elementMeasure;
register(elementMeasure);

/* ── Relation legality rules ───────────────────────────────── */
const relationRules = UMLRelationRules.create(provide(UMLRelationRules));
register(relationRules);

/* ── Relation creation / commit ────────────────────────────── */
const relationCreation = UMLRelationCreation.create(provide(UMLRelationCreation));
register(relationCreation);

/* ── ERD logical / physical model (eXERD-style) ────────────── */
const ERD_VIEW_MODES = [
  ['physical', '물리만'], ['logical', '논리만'], ['both', '논리 + 물리'],
] as const;
register({ ERD_VIEW_MODES });
function setErdMode(mode: string) {
  if (!ERD_VIEW_MODES.some(([value]) => value === mode) || dg().type !== 'erd') return false;
  if (erdMode() === mode) return true;
  snapshot();
  dg().erdMode = mode;
  render(); renderProps();
  const label = ERD_VIEW_MODES.find(([value]) => value === mode)?.[1] || mode;
  flashStatus(`ERD 표시를 '${label}' 모드로 변경했습니다`);
  return true;
}

function relEndpoints(r: DiagramRelation) {
  const a = byId(r.from), b = byId(r.to);
  return computeRelationEndpoints(r, a, b);
}

const parametricBinding = UMLParametricBinding.create(provide(UMLParametricBinding));
const {
  addWaypoint: addBindingWaypoint,
  computeRoutes: computeBindingRoutes,
  lock: lockBindingRoute,
  route: bindingRoute,
  syncConstraintParameters,
  unlock: unlockBindingRoute,
  waypoints: bindingWaypoints,
} = parametricBinding;
register({
  addBindingWaypoint, bindingRoute, bindingWaypoints, computeBindingRoutes,
  lockBindingRoute, syncConstraintParameters, unlockBindingRoute,
});

/* eXERD-style palette */
function erdRelationCardinality(r: DiagramRelation, end: RelationEnd) {
  const field = end === 'source' ? 'sourceLabel' : 'targetLabel';
  return normalizeErdCardinality(r[field], erdDefaultCardinality(r.kind, end));
}

/* curved mindmap branch */
function branchGeom(r: DiagramRelation) {
  const ep = relEndpoints(r);
  if (!ep) return null;
  return curvedBranchGeometry(ep.p1, ep.p2);
}

/* ── Sequence / Communication layout ──────────────────────── */
const interactionLayout = UMLInteractionLayout.create(provide(UMLInteractionLayout));
const {
  communicationMessagePoints,
  communicationSelfConnectorGeom,
  getSequenceBottom,
  msgDisplayLabel,
  msgPoints,
  syncCommunicationMessages,
} = interactionLayout;
register(interactionLayout);

/* ── Rendering ─────────────────────────────────────────────── */

const canvasRenderer = UMLCanvasRenderer.create(provide(UMLCanvasRenderer));
const { render } = canvasRenderer;
register({ render });

function renderAll() { renderToolbox(); render(); renderProps(); }

function text(g: SVGElement, str: string | null | undefined, x: number, y: number, opt: SvgTextOptions = {}) {
  const t = el('text', {
    x, y, fill: opt.color || TEXT_COLOR,
    'font-family': FONT_FAMILY,
    'font-size': opt.size || 12,
    'font-weight': opt.bold ? 600 : 400,
    'font-style': opt.italic ? 'italic' : 'normal',
    'text-decoration': opt.underline ? 'underline' : 'none',
    'text-anchor': opt.anchor || 'start',
    'pointer-events': 'none',
  }, g);
  t.textContent = str ?? '';
  return t;
}

const elementRenderer = UMLElementRenderer.create({
  el,
  text,
  measureText: tw,
  currentDiagram: dg,
  isMessage: isMsg,
  sequenceBottom: getSequenceBottom,
  fragmentOperandLayout: UMLSequenceLayout.fragmentOperandLayout,
  packageElementTitle,
  compositePortDirection,
  byId,
  childViews,
  timingConstraintAnchor,
  referencedInteraction,
  referencedInteractionName,
  stroke: STROKE,
  fillDefault: FILL_DEFAULT,
  textColor: TEXT_COLOR,
  lineHeight: LINE_H,
  padding: PAD,
  font13Bold: FONT13B,
  dashRelation: DASH_REL,
  dashLifeline: DASH_LIFE,
  timingLabelWidth: TIMING_LABEL_WIDTH,
});

function drawElement(parent: SVGElement, element: DiagramElement) {
  return elementRenderer.draw(parent, element);
}

function relLabel(r: DiagramRelation) {
  if (r.kind === 'transition') {
    const trigger = String(r.trigger || '').trim();
    const rawGuard = String(r.guard || '').trim();
    const guard = rawGuard ? (rawGuard.startsWith('[') ? rawGuard : `[${rawGuard}]`) : '';
    const effect = String(r.effect || '').trim();
    const signature = [trigger, guard, effect ? `/ ${effect}` : ''].filter(Boolean).join(' ');
    return signature || r.name || '';
  }
  if (r.kind === 'extension') {
    return [r.name, r.isRequired ? '{required}' : ''].filter(Boolean).join(' ');
  }
  if (r.kind === 'informationflow') {
    const conveyed = (r.conveyedModelIds || [])
      .map(id => state.models[id]?.name)
      .filter(Boolean)
      .join(', ');
    const detail = [r.name, conveyed].filter(Boolean).join(' : ');
    return [AUTO_LABEL[r.kind], detail].filter(Boolean).join(' ');
  }
  if (r.kind === 'connector' && dg()?.type === 'ibd') {
    const itemFlows = (r.itemFlowModelIds || [])
      .map(id => state.models[id]?.name)
      .filter(Boolean)
      .join(', ');
    return [r.name, itemFlows ? `«itemFlow» ${itemFlows}` : ''].filter(Boolean).join(' : ');
  }
  return [AUTO_LABEL[r.kind], r.name].filter(Boolean).join(' ');
}

function stateSelfTransitionGeom(r: DiagramRelation) {
  return selfTransitionGeometry(r, byId(r.from));
}

/* user-dragged offset of a relation label (name / sourceLabel / targetLabel) */
const lblOff = (r: DiagramRelation, field: string) => (r.lblOff && r.lblOff[field]) || { dx: 0, dy: 0 };
register({ lblOff });

const relationRenderer = UMLRelationRenderer.create({
  el,
  text,
  measureText: value => tw(value, FONT12),
  headGeom,
  parseErdCardinality,
  isMessage: isMsg,
  isCommunicationMessage: isCommMsg,
  messagePoints: msgPoints,
  messageLabel: msgDisplayLabel,
  communicationSelfConnectorGeometry: communicationSelfConnectorGeom,
  communicationMessagePoints,
  stateSelfTransitionGeometry: stateSelfTransitionGeom,
  relationEndpoints: relEndpoints,
  bindingRoute,
  polylinePath,
  polylineJumpPath,
  polylineMidpoint,
  relationLabel: relLabel,
  labelOffset: lblOff,
  branchGeometry: branchGeom,
  bezierPoint,
  relationSupportsEndQuickEdit,
  relationEndAggregation,
  relationEndNavigability,
  relationEndRoleLabel,
  relationStyles: REL_STYLE,
  erRelationKinds: ER_RELATION_KINDS,
  stroke: STROKE,
  dashRelation: DASH_REL,
});

function drawRelation(parent: SVGElement, relation: DiagramRelation) {
  return relationRenderer.draw(parent, relation);
}

/* ── Hit testing ───────────────────────────────────────────── */
const hitTesting = UMLHitTesting.create(provide(UMLHitTesting));
register(hitTesting);

/* ── Mouse interaction ─────────────────────────────────────── */
function svgPoint(ev: MouseEvent) {
  return UMLCanvasInteraction.canvasPoint(ev, svg, state.zoom);
}

const viewportController = UMLViewportController.create(provide(UMLViewportController));
const {
  fitToWindow,
  setZoom,
  toggleMinimap,
} = viewportController;
register(viewportController);
viewportController.attach();

const toolboxController = UMLToolbox.create(provide(UMLToolbox));
const { render: renderToolbox } = toolboxController;
register({ renderToolbox });

const diagramTabs = UMLDiagramTabs.create(provide(UMLDiagramTabs));
const {
  addDiagram,
  switchDiagram,
  closeMenu: closeTabMenu,
} = diagramTabs;
register({ addDiagram, switchDiagram, closeTabMenu });

/* the ERD column sheet closes QuickEdit's other two editors, so QuickEdit
   constructs it; app.js wires the factory, not a controller */
register({ erdColumnEditor: UMLErdColumnEditor, relationEndEditor: UMLRelationEndEditor });
const quickEdit = UMLQuickEdit.create(provide(UMLQuickEdit));
register(quickEdit);

/* placing a view is independent of the drag/linking state machine, so it is a
   sibling module the interaction handler delegates to */
const elementPlacement = UMLElementPlacement.create(provide(UMLElementPlacement));
register({ elementPlacement });

const canvasInteraction = UMLCanvasInteraction.create({
  ...provide(UMLCanvasInteraction),
  /* checked by this module separately from REQUIRED_VALUES */
  state,
  svg,
  eventRoot: window,
});
canvasInteraction.attach();

/* ── Selection editing / clipboard ─────────────────────────── */
const selectionEditing = UMLSelectionEditing.create(provide(UMLSelectionEditing));
const {
  autoSizeSelection,
  canReorderSelection,
  copySelection,
  cutSelection,
  deleteFromModel,
  deleteSelection,
  duplicateSelection,
  moveSelectionByKey,
  pasteClipboard,
  reorderSelection,
  selectAllViews,
} = selectionEditing;
register(selectionEditing);

function cancelActiveInteraction() {
  canvasInteraction.cancel();
  state.tool = 'select';
  setSelection([]);
  renderAll();
}

/* ── Project model repository ─────────────────────────────── */
const modelRepository = UMLModelRepository.create(provide(UMLModelRepository));
const { open: openModelRepository } = modelRepository;
register({ openModelRepository });

/* ── Explorer ──────────────────────────────────────────────── */
const modelExplorer = UMLModelExplorer.create(provide(UMLModelExplorer));
const { focus: focusExplorer } = modelExplorer;
modelExplorer.attach();

/* ── Canvas keyboard navigation ────────────────────────────── */
const canvasKeyboard = UMLCanvasKeyboard.create(provide(UMLCanvasKeyboard));
canvasKeyboard.attach();

const erdNameTools = UMLErdNameTools.create(provide(UMLErdNameTools));
erdNameTools.attach();
register({ openErdNameTools: erdNameTools.open });

/* ── Validation results panel ─────────────────────────────── */
const validationPanelController = UMLValidationPanel.create(provide(UMLValidationPanel));
const { run: runValidation, toggle: toggleValidationPanel } = validationPanelController;
validationPanelController.attach();
/* deliberately not `register(validationPanelController)` — its controller exports
   a generic `render`, and app.js reaches its methods directly anyway */

/* ── Properties panel ──────────────────────────────────────── */
function focusProps() {
  const first = document.querySelector<HTMLInputElement | HTMLTextAreaElement>('#props input[type=text], #props textarea');
  if (first) { first.focus(); first.select(); }
}
/* the ER-only property blocks need the panel's own row and heading helpers, so
   the panel constructs them; app.js wires the factory, not a controller */
register({ erdPropertySections: UMLErdPropertySections });
/* GRID and FILL_DEFAULT are read with fallbacks rather than declared, so they
   stay outside `provide` — the same shape UMLCanvasInteraction uses */
const propertyPanel = UMLPropertyPanel.create({ ...provide(UMLPropertyPanel), GRID, FILL_DEFAULT });

function renderProps() {
  return propertyPanel.render();
}

/* ── Export bounds ──────────────────────────────────────────── */
/* bounding box of the active diagram's content, with margin */
function contentBBox() {
  const d = dg();
  if (!d.elements.length) return null;
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  d.elements.forEach(e => {
    x0 = Math.min(x0, e.x); y0 = Math.min(y0, e.y);
    x1 = Math.max(x1, e.x + e.w);
    y1 = Math.max(y1, e.y + e.h + (e.kind === 'interfaceball' ? 20 : 0));
    if (d.type === 'sequence' && e.kind === 'lifeline') y1 = Math.max(y1, getSequenceBottom());
  });
  d.relations.filter(relation => relation.kind === 'bindingconnector').forEach(relation => {
    const route = bindingRoute(relation);
    (route?.points || []).forEach(point => {
      x0 = Math.min(x0, point.x); y0 = Math.min(y0, point.y);
      x1 = Math.max(x1, point.x); y1 = Math.max(y1, point.y);
    });
  });
  const P = 32;
  return { x: Math.max(0, x0 - P), y: Math.max(0, y0 - P), w: (x1 - x0) + P * 2, h: (y1 - y0) + P * 2 };
}

/* ── Project store / persistence UI ────────────────────────── */
const projectStore = UMLProjectStore.create(provide(UMLProjectStore));
const {
  createNewProject,
  openProjectManager,
  openRecoveryHistory,
  scheduleRecoverySave,
} = projectStore;
register(projectStore);
projectStore.attach();

const fileInput = document.getElementById('fileInput');
register({ fileInput });

/* the import preview sheets read only the parsed file, so the import module
   builds them; app.js wires the factory, not a controller */
register({ importPreview: UMLImportPreview });
/* export writers and the import pipeline share nothing but the download helper,
   so they are independent siblings rather than one module */
const diagramExport = UMLDiagramExport.create(provide(UMLDiagramExport));
/* app.js's own Save writes project.json through the same helper */
const { download } = diagramExport;

const importExport = UMLProjectImport.create(provide(UMLProjectImport));
const { importSupportedFile } = importExport;
register({ importSupportedFile });
importExport.attach();

const commands = {
  new() { createNewProject(); },
  open: () => importExport.openProjectFileDialog(),
  importddl: () => importExport.openDdlAppendDialog(),
  importdrawio: () => importExport.openDrawioAppendDialog(),
  save() {
    const filename = `${state.projectName.replace(/[^\p{L}\p{N}._-]+/gu, '-').replace(/^-|-$/g, '') || 'project'}.json`;
    download(filename, new Blob([serialize()], { type: 'application/json' }));
    markSaved();
  },
  projects: openProjectManager,
  recovery: () => openRecoveryHistory(),
  undo, redo,
  selectall: selectAllViews,
  copy: copySelection,
  cut: cutSelection,
  paste: pasteClipboard,
  duplicate: duplicateSelection,
  delete: deleteSelection,
  deletemodel: deleteFromModel,
  models: openModelRepository,
  validate: runValidation,
  validationpanel: toggleValidationPanel,
  explorerfocus: focusExplorer,
  autoresize: autoSizeSelection,
  bringfront() { reorderSelection(true); },
  sendback() { reorderSelection(false); },
  fit: fitToWindow,
  minimap: toggleMinimap,
  exportsvg: () => diagramExport.exportSvgFile(),
  exportpng: () => diagramExport.exportPngFile(),
  exportmermaid: () => diagramExport.exportMermaidFile(),
  exportdrawio: () => diagramExport.exportDrawioFile(),
  exportddl: () => diagramExport.openErdDdlExportDialog(),
  exportall: () => diagramExport.exportAllPngFiles(),
  zoomin() { setZoom(state.zoom * 1.2); },
  zoomout() { setZoom(state.zoom / 1.2); },
  zoomreset() { setZoom(1); },
  about() { alert('UML Studio V7 Professional\nWeb modeler · Project format v30'); },
};

register({ commands });
const commandRouter = UMLCommandRouter.create(provide(UMLCommandRouter));
commandRouter.attach();

/* ── Init ──────────────────────────────────────────────────── */
projectStore.restoreOnStartup();
