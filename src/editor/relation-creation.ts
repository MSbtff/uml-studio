'use strict';

/* Relation Creation — validates and commits new relation views while the host
   keeps ownership of diagram state, legality rules and pointer interaction. */
type RelationCreationApi = ReturnType<typeof createRelationCreationModule>;
declare var UMLRelationCreation: RelationCreationApi;

(function initRelationCreationModule(root: typeof globalThis & { UMLRelationCreation?: RelationCreationApi }, factory: () => RelationCreationApi) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root) root.UMLRelationCreation = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, createRelationCreationModule);

function createRelationCreationModule() {
  const { text: uiText } = globalThis.UMLLanguage
    ?? require('./language.js') as typeof UMLLanguage;

  const REQUIRED_FUNCTIONS = Object.freeze([
    'adoptView',
    'byId',
    'clearLinking',
    'dg',
    'erdDefaultCardinality',
    'flashStatus',
    'getLinking',
    'isMsg',
    'nextName',
    'relationError',
    'renderAll',
    'sequenceMessageMinY',
    'setSelection',
    'snap',
    'snapshot',
    'syncRelationModel',
    'transitionDirectionError',
    'uid',
  ] as const);
  const REQUIRED_VALUES = Object.freeze([
    'ER_RELATION_KINDS',
    'INSTANCE_KINDS',
    'STATE_VERTEX_KINDS',
    'state',
  ] as const);
  const ENDPOINT_MESSAGES = Object.freeze({
    transition: uiText('Connect transitions between states or pseudostates.', 'Transition은 상태 머신의 State 또는 Pseudostate 사이에만 연결할 수 있습니다'),
    link: uiText(
      'Connect links between objects or artifact, component, or node instances.',
      'Link는 Object 또는 Artifact/Component/Node Instance 사이에만 연결할 수 있습니다',
    ),
    commconnector: uiText('Connect communication connectors between lifelines.', 'Communication Connector는 Lifeline 사이에만 연결할 수 있습니다'),
    timingmessage: uiText('Connect timing messages between time segments.', 'Timing Message는 Time Segment 사이에만 연결할 수 있습니다'),
  });

  interface CreatedRelation extends DiagramLink {
    name: string;
    sourceLabel?: string;
    targetLabel?: string;
    foreignKeyEnd?: string;
    sourceColumnName?: string;
    targetColumnName?: string;
    foreignKeyOnDelete?: string;
    foreignKeyOnUpdate?: string;
    trigger?: string;
    guard?: string;
    effect?: string;
    messageSort?: string;
    isRequired?: boolean;
    conveyedModelIds?: string[];
    itemFlowModelIds?: string[];
    connectorId?: string;
    seqNo?: string;
    y?: number;
  }
  interface RelationDiagram { type: string; elements?: DiagramElementBounds[]; relations: CreatedRelation[] }
  interface RelationCreationDependencies {
    adoptView(view: CreatedRelation): CreatedRelation;
    byId(id: string): DiagramElementBounds | null | undefined;
    clearLinking(): void;
    dg(): RelationDiagram;
    erdDefaultCardinality(kind: string, end: 'source' | 'target'): string;
    flashStatus(message: string): void;
    getLinking(): { fromId: string; y: number } | null;
    isMsg(kind: string): boolean;
    nextName(kind: string): string;
    relationError(kind: string, from: ReturnType<RelationCreationDependencies['byId']>, to: DiagramElementBounds): string | null;
    renderAll(): void;
    sequenceMessageMinY(diagram: RelationDiagram): number;
    setSelection(ids: string[]): void;
    snap(value: number): number;
    snapshot(): void;
    syncRelationModel(relation: CreatedRelation): void;
    transitionDirectionError(from: ReturnType<RelationCreationDependencies['byId']>, to: DiagramElementBounds): string | null;
    uid(): string;
    ER_RELATION_KINDS: ReadonlySet<string>;
    INSTANCE_KINDS: ReadonlySet<string>;
    STATE_VERTEX_KINDS: ReadonlySet<string>;
    state: { tool: string };
  }

  function create(dependencies?: RelationCreationDependencies) {
    const deps: Partial<RelationCreationDependencies> = dependencies || {};
    const missing: string[] = REQUIRED_FUNCTIONS.filter(name => typeof deps[name] !== 'function');
    REQUIRED_VALUES.forEach(name => {
      if (deps[name] == null) missing.push(name);
    });
    (['ER_RELATION_KINDS', 'INSTANCE_KINDS', 'STATE_VERTEX_KINDS'] as const).forEach(name => {
      if (deps[name] != null && typeof deps[name].has !== 'function') missing.push(`${name}.has`);
    });
    if (deps.state != null && typeof deps.state !== 'object') missing.push('state.object');
    if (missing.length) {
      throw new TypeError(`Relation Creation 의존성이 없습니다: ${[...new Set(missing)].join(', ')}`);
    }

    const {
      adoptView,
      byId,
      clearLinking,
      dg,
      erdDefaultCardinality,
      flashStatus,
      getLinking,
      isMsg,
      nextName,
      relationError,
      renderAll,
      sequenceMessageMinY,
      setSelection,
      snap,
      snapshot,
      syncRelationModel,
      transitionDirectionError,
      uid,
      ER_RELATION_KINDS,
      INSTANCE_KINDS,
      STATE_VERTEX_KINDS,
      state,
    } = deps as RelationCreationDependencies;

    function finishLink() {
      clearLinking();
      state.tool = 'select';
      renderAll();
    }

    function rejectLink(message: string) {
      flashStatus(message);
      finishLink();
    }

    function createCommunicationMessage(connector: DiagramLink, kind: string) {
      const from = kind === 'comm-reverse' ? connector.to : connector.from;
      const to = kind === 'comm-reverse' ? connector.from : connector.to;
      snapshot();
      const message = adoptView({
        id: uid(), kind, from, to, connectorId: connector.id,
        name: nextName(kind), seqNo: '', messageSort: 'synchCall',
      });
      dg().relations.push(message);
      syncRelationModel(message);
      setSelection([message.id]);
      state.tool = 'select';
      renderAll();
    }

    function completeLink(target: DiagramElementBounds, point?: DiagramPoint | null) {
      const kind = state.tool;
      const linking = getLinking();
      if (!linking) return;
      const from = byId(linking.fromId);
      if (kind === 'transition'
        && (!from || !STATE_VERTEX_KINDS.has(from.kind) || !STATE_VERTEX_KINDS.has(target.kind))) {
        rejectLink(ENDPOINT_MESSAGES.transition);
        return;
      }
      if (kind === 'transition') {
        const directionError = transitionDirectionError(from, target);
        if (directionError) {
          rejectLink(directionError);
          return;
        }
      }
      if ((kind === 'link' || kind === 'directedlink')
        && (!from || !INSTANCE_KINDS.has(from.kind) || !INSTANCE_KINDS.has(target.kind))) {
        rejectLink(ENDPOINT_MESSAGES.link);
        return;
      }
      if (kind === 'commconnector'
        && (!from || from.kind !== 'lifeline' || target.kind !== 'lifeline')) {
        rejectLink(ENDPOINT_MESSAGES.commconnector);
        return;
      }
      if (kind === 'timingmessage'
        && (!from || from.kind !== 'timesegment' || target.kind !== 'timesegment')) {
        rejectLink(ENDPOINT_MESSAGES.timingmessage);
        return;
      }
      const legalityError = relationError(kind, from, target);
      if (legalityError) {
        rejectLink(legalityError);
        return;
      }
      if (!from) { finishLink(); return; }
      if (kind === 'containment') {
        const existing = dg().relations.find(relation =>
          relation.kind === 'containment' && relation.from === from.id);
        if (existing) {
          snapshot();
          existing.to = target.id;
          delete existing.srcAnchor;
          delete existing.dstAnchor;
          from.parentId = target.id;
          syncRelationModel(existing);
          setSelection([existing.id]);
          finishLink();
          return;
        }
      }
      const raw: CreatedRelation = {
        id: uid(), kind, from: linking.fromId, to: target.id,
        name: '', sourceLabel: '', targetLabel: '',
      };
      if (ER_RELATION_KINDS.has(kind)) {
        raw.sourceLabel = erdDefaultCardinality(kind, 'source');
        raw.targetLabel = erdDefaultCardinality(kind, 'target');
        raw.foreignKeyEnd = '';
        raw.sourceColumnName = '';
        raw.targetColumnName = '';
        raw.foreignKeyOnDelete = '';
        raw.foreignKeyOnUpdate = '';
      }
      if (kind === 'transition') Object.assign(raw, { trigger: '', guard: '', effect: '' });
      if (kind === 'timingmessage') raw.messageSort = 'synchCall';
      if (kind === 'extension') raw.isRequired = false;
      if (kind === 'informationflow') raw.conveyedModelIds = [];
      if (kind === 'connector' && dg().type === 'ibd') raw.itemFlowModelIds = [];
      if (isMsg(kind)) {
        if (!from || from.kind !== 'lifeline' || target.kind !== 'lifeline') {
          finishLink();
          return;
        }
        raw.y = Math.max(sequenceMessageMinY(dg()), snap(point ? point.y : linking.y));
      }
      snapshot();
      const relation = adoptView(raw);
      dg().relations.push(relation);
      if (kind === 'containment') from.parentId = target.id;
      syncRelationModel(relation);
      setSelection([relation.id]);
      finishLink();
      return relation;
    }

    return Object.freeze({
      completeLink,
      createCommunicationMessage,
    });
  }

  return Object.freeze({
    ENDPOINT_MESSAGES,
    REQUIRED_FUNCTIONS,
    REQUIRED_VALUES,
    create,
  });
}
