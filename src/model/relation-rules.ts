'use strict';

/* Relation rules — the per-diagram legality checks that decide whether a link
   the user is drawing may exist.  Every rule is pure: it takes the relation
   kind and the two endpoint views and returns a Korean message, or '' when the
   link is allowed. */
type RelationRulesApi = ReturnType<typeof createRelationRulesModule>;
declare var UMLRelationRules: RelationRulesApi;

(function initRelationRulesModule(root: typeof globalThis & { UMLRelationRules?: RelationRulesApi }, factory: () => RelationRulesApi) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root) root.UMLRelationRules = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, createRelationRulesModule);

function createRelationRulesModule() {
  const { displayLabel, text: uiText } = globalThis.UMLLanguage
    ?? require('../editor/language.js') as typeof UMLLanguage;

  const REQUIRED_FUNCTIONS = Object.freeze([
    'activityAncestor',
    'bindingTypeCompatibility',
    'dg',
    'isViewAncestor',
  ] as const);
  const REQUIRED_VALUES = Object.freeze([
    'state',
    'ACTIVITY_ACTION_KINDS',
    'ACTIVITY_OBJECT_KINDS',
    'ACTIVITY_VERTEX_KINDS',
    'BDD_CLASSIFIER_KINDS',
    'BDD_RELATION_KINDS',
    'COMPOSITE_CONNECTABLE_KINDS',
    'IBD_CONNECTABLE_KINDS',
    'INFORMATION_FLOW_ENDPOINT_KINDS',
    'KIND_META',
    'PACKAGE_CONTAINER_KINDS',
    'PARAMETRIC_CONNECTABLE_KINDS',
    'REQUIREMENT_MODEL_ELEMENT_KINDS',
    'REQUIREMENT_RELATION_KINDS',
  ] as const);
  const KIND_SETS = Object.freeze(REQUIRED_VALUES.filter((name): name is KindSetName => name.endsWith('_KINDS')));

  type KindSetName = Extract<typeof REQUIRED_VALUES[number], `${string}_KINDS`>;
  type Endpoint = Pick<DiagramElementBounds, 'id' | 'kind' | 'parentId'> & {
    referenceKind?: string;
    classifierModelId?: string;
  };
  type CandidateEndpoint = Endpoint | null | undefined;
  type RelationRulesDependencies = Record<KindSetName, ReadonlySet<string>> & {
    activityAncestor(view: Endpoint, kind: string): Endpoint | null | undefined;
    bindingTypeCompatibility(fromId: string | undefined, toId: string | undefined, models: Record<string, unknown>): { status: string; message: string };
    dg(): { type: string; relations: DiagramLink[] };
    isViewAncestor(view: Endpoint, candidate: Endpoint): boolean;
    state: { models: Record<string, unknown> };
    KIND_META: Record<string, { label: string }>;
  };

  function create(dependencies?: RelationRulesDependencies) {
    const deps: Partial<RelationRulesDependencies> = dependencies || {};
    const missing: string[] = REQUIRED_FUNCTIONS.filter(name => typeof deps[name] !== 'function');
    REQUIRED_VALUES.forEach(name => {
      if (deps[name] == null) missing.push(name);
    });
    KIND_SETS.forEach(name => {
      if (deps[name] != null && typeof deps[name].has !== 'function') missing.push(`${name}.has`);
    });
    if (deps.KIND_META != null && typeof deps.KIND_META !== 'object') missing.push('KIND_META');
    if (missing.length) {
      throw new TypeError(`Relation Rules 의존성이 없습니다: ${[...new Set(missing)].join(', ')}`);
    }

    const {
      activityAncestor,
      bindingTypeCompatibility,
      dg,
      isViewAncestor,
      state,
      ACTIVITY_ACTION_KINDS,
      ACTIVITY_OBJECT_KINDS,
      ACTIVITY_VERTEX_KINDS,
      BDD_CLASSIFIER_KINDS,
      BDD_RELATION_KINDS,
      COMPOSITE_CONNECTABLE_KINDS,
      IBD_CONNECTABLE_KINDS,
      INFORMATION_FLOW_ENDPOINT_KINDS,
      KIND_META,
      PACKAGE_CONTAINER_KINDS,
      PARAMETRIC_CONNECTABLE_KINDS,
      REQUIREMENT_MODEL_ELEMENT_KINDS,
      REQUIREMENT_RELATION_KINDS,
    } = deps as RelationRulesDependencies;

    function transitionDirectionError(from: CandidateEndpoint, to: CandidateEndpoint) {
      if (!from || !to) return '';
      if (['statefinal', 'exitpoint', 'terminate'].includes(from.kind)) {
        return uiText('{0} cannot have outgoing transitions.', '{0}에서는 나가는 Transition을 만들 수 없습니다', displayLabel(KIND_META[from.kind]));
      }
      if (from.kind === 'connectionpointref' && (from.referenceKind || 'entry') === 'entry') {
        return uiText(
          'Entry connection point references cannot have outgoing transitions.',
          'Entry Connection Point Reference에서는 나가는 Transition을 만들 수 없습니다',
        );
      }
      if (to.kind === 'entrypoint') return uiText('Entry points cannot have incoming transitions.', 'Entry Point에는 들어오는 Transition을 만들 수 없습니다');
      if (to.kind === 'connectionpointref' && (to.referenceKind || 'entry') === 'exit') {
        return uiText(
          'Exit connection point references cannot have incoming transitions.',
          'Exit Connection Point Reference에는 들어오는 Transition을 만들 수 없습니다',
        );
      }
      return '';
    }

    function compositeRelationError(kind: string, from: CandidateEndpoint, to: CandidateEndpoint) {
      if (kind === 'csconnector' && (!from || !to
        || !COMPOSITE_CONNECTABLE_KINDS.has(from.kind) || !COMPOSITE_CONNECTABLE_KINDS.has(to.kind))) {
        return uiText(
          'Connect composite structure connectors between parts or ports.',
          'Composite Structure Connector는 Part 또는 Port 사이에만 연결할 수 있습니다',
        );
      }
      if (kind === 'rolebinding' && (!from || !to || from.kind !== 'collaborationuse' || to.kind !== 'part')) {
        return uiText('Connect a role binding from a collaboration use to a part.', 'Role Binding은 Collaboration Use에서 Part 방향으로 연결하세요');
      }
      return '';
    }

    function activityRelationError(kind: string, from: CandidateEndpoint, to: CandidateEndpoint) {
      if (!['controlflow', 'objectflow', 'exceptionhandler', 'activityinterrupt'].includes(kind)) return '';
      if (!from || !to || !ACTIVITY_VERTEX_KINDS.has(from.kind) || !ACTIVITY_VERTEX_KINDS.has(to.kind)) {
        return uiText('Connect {0} between activity nodes.', '{0}는 Activity Node 사이에만 연결할 수 있습니다', displayLabel(KIND_META[kind]));
      }
      if (from.id === to.id) return uiText('{0} cannot connect an element to itself.', '{0}는 같은 요소에 다시 연결할 수 없습니다', displayLabel(KIND_META[kind]));
      if (['final', 'flowfinal'].includes(from.kind)) return uiText(
        '{0} cannot have outgoing flows.',
        '{0}에서는 나가는 흐름을 만들 수 없습니다',
        displayLabel(KIND_META[from.kind]),
      );
      if (to.kind === 'initial') return uiText('Initial nodes cannot have incoming flows.', 'Initial Node에는 들어오는 흐름을 만들 수 없습니다');
      if (kind === 'controlflow' && (ACTIVITY_OBJECT_KINDS.has(from.kind) || ACTIVITY_OBJECT_KINDS.has(to.kind))) {
        return uiText('Use object flows for object nodes and pins.', 'Object Node와 Pin에는 Object Flow를 사용하세요');
      }
      if (kind === 'objectflow') {
        const allowed = (view: Endpoint) => ACTIVITY_OBJECT_KINDS.has(view.kind)
          || ACTIVITY_ACTION_KINDS.has(view.kind) || view.kind === 'structuredactivity';
        if (!allowed(from) || !allowed(to)) return uiText(
          'Connect object flows between actions, object nodes, pins, or expansion nodes.',
          'Object Flow는 Action, Object Node, Pin 또는 Expansion Node 사이에 연결하세요',
        );
        if (from.kind === 'inputpin' || from.kind === 'expansioninput') {
          return uiText('Use {0} as the target of an external object flow.', '{0}은 외부 Object Flow의 도착점으로 사용하세요', displayLabel(KIND_META[from.kind]));
        }
        if (to.kind === 'outputpin' || to.kind === 'expansionoutput') {
          return uiText('Use {0} as the source of an external object flow.', '{0}은 외부 Object Flow의 시작점으로 사용하세요', displayLabel(KIND_META[to.kind]));
        }
      }
      if (kind === 'exceptionhandler') {
        const actionLike = (view: Endpoint) => ACTIVITY_ACTION_KINDS.has(view.kind) || view.kind === 'structuredactivity';
        if (!actionLike(from) || !actionLike(to)) return uiText(
          'Connect exception handlers between actions or structured activity nodes.',
          'Exception Handler는 Action 또는 Structured Activity Node 사이에 연결하세요',
        );
      }
      if (kind === 'activityinterrupt') {
        const region = activityAncestor(from, 'interruptibleregion');
        if (!region) return uiText(
          'Start an activity interrupt at a node inside an interruptible activity region.',
          'Activity Interrupt는 Interruptible Activity Region 내부의 노드에서 시작해야 합니다',
        );
        if (activityAncestor(to, 'interruptibleregion')?.id === region.id) {
          return uiText(
            'The activity interrupt target must be outside the source interruptible activity region.',
            'Activity Interrupt의 대상은 같은 Interruptible Activity Region 밖에 있어야 합니다',
          );
        }
      }
      return '';
    }

    function packageRelationError(kind: string, from: CandidateEndpoint, to: CandidateEndpoint) {
      if (kind === 'containment') {
        if (!from || !to || !PACKAGE_CONTAINER_KINDS.has(from.kind) || !PACKAGE_CONTAINER_KINDS.has(to.kind)) {
          return uiText(
            'Connect containment from a package, model, or subsystem to its container.',
            'Containment는 Package, Model 또는 Subsystem에서 컨테이너 방향으로 연결하세요',
          );
        }
        if (from.id === to.id || isViewAncestor(from, to)) {
          return uiText('Package containment cannot create a cycle.', 'Package 포함 관계가 순환할 수 없습니다');
        }
      }
      if (kind === 'dependency' && dg().type === 'package'
        && (!from || !to || !PACKAGE_CONTAINER_KINDS.has(from.kind) || !PACKAGE_CONTAINER_KINDS.has(to.kind))) {
        return uiText(
          'Connect package dependencies between packages, models, or subsystems.',
          'Package Diagram의 Dependency는 Package, Model 또는 Subsystem 사이에 연결하세요',
        );
      }
      return '';
    }

    function profileRelationError(kind: string, from: CandidateEndpoint, to: CandidateEndpoint, ignoredRelationId = '') {
      if (dg().type !== 'profile') return '';
      if (kind === 'extension') {
        if (!from || !to || from.kind !== 'stereotype' || to.kind !== 'metaclass') {
          return uiText('Connect an extension from a stereotype to a metaclass.', 'Extension은 Stereotype에서 MetaClass 방향으로 연결하세요');
        }
        if (dg().relations.some(relation =>
          relation.id !== ignoredRelationId && relation.kind === 'extension'
          && relation.from === from.id && relation.to === to.id)) {
          return uiText('An extension already connects this stereotype and metaclass.', '같은 Stereotype과 MetaClass 사이에 Extension이 이미 있습니다');
        }
      }
      if (kind === 'generalization') {
        if (!from || !to || from.kind !== 'stereotype' || to.kind !== 'stereotype') {
          return uiText('Connect profile generalizations between stereotypes.', 'Profile Diagram의 Generalization은 Stereotype 사이에만 연결하세요');
        }
        if (from.id === to.id) return uiText('A stereotype cannot generalize itself.', 'Stereotype은 자기 자신을 일반화할 수 없습니다');
        const graph = new Map<string, string[]>();
        dg().relations.filter(relation =>
          relation.id !== ignoredRelationId && relation.kind === 'generalization').forEach(relation => {
          const targets = graph.get(relation.from);
          if (targets) targets.push(relation.to);
          else graph.set(relation.from, [relation.to]);
        });
        const pending = [to.id], seen = new Set();
        while (pending.length) {
          const current = pending.pop()!;
          if (current === from.id) return uiText('Stereotype generalization cannot create a cycle.', 'Stereotype Generalization이 순환할 수 없습니다');
          if (seen.has(current)) continue;
          seen.add(current);
          pending.push(...(graph.get(current) || []));
        }
      }
      return '';
    }

    function informationFlowRelationError(kind: string, from: CandidateEndpoint, to: CandidateEndpoint) {
      if (kind !== 'informationflow') return '';
      if (!from || !to || !INFORMATION_FLOW_ENDPOINT_KINDS.has(from.kind) || !INFORMATION_FLOW_ENDPOINT_KINDS.has(to.kind)) {
        return uiText(
          'Connect information flows between senders and receivers such as classes, components, actors, or nodes.',
          'Information Flow는 Class, Component, Actor, Node 같은 정보 송수신 주체 사이에 연결하세요',
        );
      }
      if (from.id === to.id) return uiText(
        'An information flow cannot connect an element to itself.',
        'Information Flow는 같은 요소에 다시 연결할 수 없습니다',
      );
      return '';
    }

    function requirementRelationError(kind: string, from: CandidateEndpoint, to: CandidateEndpoint) {
      if (!REQUIREMENT_RELATION_KINDS.has(kind)) return '';
      if (!from || !to || !REQUIREMENT_MODEL_ELEMENT_KINDS.has(from.kind)
        || !REQUIREMENT_MODEL_ELEMENT_KINDS.has(to.kind)) {
        return uiText(
          'Connect requirement relationships between requirements or traceable model elements.',
          'Requirement 관계는 Requirement 또는 추적 가능한 모델 요소 사이에 연결하세요',
        );
      }
      if (from.id === to.id) return uiText(
        'A requirement relationship cannot connect an element to itself.',
        'Requirement 관계는 같은 요소로 되돌아갈 수 없습니다',
      );
      if (['reqcontainment', 'reqcopy', 'derivereqt'].includes(kind)
        && (from.kind !== 'requirement' || to.kind !== 'requirement')) {
        return uiText('Connect {0} between requirements.', '{0}는 Requirement 사이에만 연결할 수 있습니다', displayLabel(KIND_META[kind]));
      }
      if (['verify', 'satisfy', 'refine'].includes(kind) && to.kind !== 'requirement') {
        return uiText('Connect {0} from a model element to a requirement.', '{0}는 모델 요소에서 Requirement 방향으로 연결하세요', displayLabel(KIND_META[kind]));
      }
      return '';
    }

    function bddRelationError(kind: string, from: CandidateEndpoint, to: CandidateEndpoint, ignoredRelationId = '') {
      if (dg().type !== 'bdd' || !BDD_RELATION_KINDS.has(kind)) return '';
      if (!from || !to) return uiText('BDD relationship endpoint not found.', 'BDD 관계의 연결 대상을 찾을 수 없습니다');
      if (kind === 'notelink') {
        return from.kind === 'note' || to.kind === 'note'
          ? ''
          : uiText('One endpoint of a note link must be a note.', 'Note Link의 한쪽 끝은 Note여야 합니다');
      }
      if (from.id === to.id) return uiText('{0} cannot connect an element to itself.', '{0}는 같은 요소로 되돌아갈 수 없습니다', displayLabel(KIND_META[kind]));
      if (kind === 'connector') {
        return from.kind === 'port' && to.kind === 'port'
          ? ''
          : uiText('Connect BDD connectors between ports.', 'BDD Connector는 Port 사이에 연결하세요');
      }
      if (kind === 'generalization') {
        if (!BDD_CLASSIFIER_KINDS.has(from.kind) || from.kind !== to.kind) {
          return uiText(
            'Connect BDD generalizations between block classifiers of the same kind.',
            'BDD Generalization은 같은 종류의 Block Classifier 사이에 연결하세요',
          );
        }
      } else if (kind === 'composition' || kind === 'aggregation') {
        if (!BDD_CLASSIFIER_KINDS.has(from.kind) || !BDD_CLASSIFIER_KINDS.has(to.kind)) {
          return uiText('Connect {0} between block classifiers.', '{0}은 Block Classifier 사이에 연결하세요', displayLabel(KIND_META[kind]));
        }
      } else {
        const structural = (view: Endpoint) => BDD_CLASSIFIER_KINDS.has(view.kind) || view.kind === 'object';
        if (!structural(from) || !structural(to)) {
          return uiText(
            'Connect {0} between block classifiers or objects.',
            '{0}은 Block Classifier 또는 Object 사이에 연결하세요',
            displayLabel(KIND_META[kind]),
          );
        }
      }
      if (kind === 'generalization' || kind === 'composition') {
        const graph = new Map<string, string[]>();
        dg().relations.filter(relation =>
          relation.id !== ignoredRelationId && relation.kind === kind).forEach(relation => {
          const targets = graph.get(relation.from);
          if (targets) targets.push(relation.to);
          else graph.set(relation.from, [relation.to]);
        });
        const pending = [to.id], seen = new Set();
        while (pending.length) {
          const current = pending.pop()!;
          if (current === from.id) {
            return kind === 'generalization'
              ? uiText('BDD generalization cannot create a cycle.', 'BDD Generalization이 순환할 수 없습니다')
              : uiText('Block composition cannot create a cycle.', 'Block Composition 계층이 순환할 수 없습니다');
          }
          if (seen.has(current)) continue;
          seen.add(current);
          pending.push(...(graph.get(current) || []));
        }
      }
      return '';
    }

    function ibdRelationError(kind: string, from: CandidateEndpoint, to: CandidateEndpoint, ignoredRelationId = '') {
      if (dg().type !== 'ibd') return '';
      if (!from || !to) return uiText('IBD relationship endpoint not found.', 'IBD 관계의 연결 대상을 찾을 수 없습니다');
      if (kind === 'notelink') {
        return from.kind === 'note' || to.kind === 'note'
          ? ''
          : uiText('One endpoint of a note link must be a note.', 'Note Link의 한쪽 끝은 Note여야 합니다');
      }
      if (kind !== 'connector') return uiText(
        'Internal block diagrams allow connectors and note links.',
        'Internal Block Diagram에서는 Connector와 Note Link만 사용할 수 있습니다',
      );
      if (!IBD_CONNECTABLE_KINDS.has(from.kind) || !IBD_CONNECTABLE_KINDS.has(to.kind)) {
        return uiText('Connect IBD connectors between parts, references, or ports.', 'IBD Connector는 Part, Reference 또는 Port 사이에 연결하세요');
      }
      if (from.id === to.id) return uiText('An IBD connector cannot connect an element to itself.', 'IBD Connector는 같은 요소로 되돌아갈 수 없습니다');
      if (dg().relations.some(relation =>
        relation.id !== ignoredRelationId && relation.kind === 'connector'
        && ((relation.from === from.id && relation.to === to.id)
          || (relation.from === to.id && relation.to === from.id)))) {
        return uiText('These IBD elements are already connected.', '같은 IBD 요소 사이에 Connector가 이미 있습니다');
      }
      return '';
    }

    function parametricRelationError(kind: string, from: CandidateEndpoint, to: CandidateEndpoint, ignoredRelationId = '') {
      if (dg().type !== 'parametric') return '';
      if (!from || !to) return uiText('Parametric relationship endpoint not found.', 'Parametric 관계의 연결 대상을 찾을 수 없습니다');
      if (kind === 'notelink') {
        return from.kind === 'note' || to.kind === 'note'
          ? ''
          : uiText('One endpoint of a note link must be a note.', 'Note Link의 한쪽 끝은 Note여야 합니다');
      }
      if (kind !== 'bindingconnector') {
        return uiText(
          'Parametric diagrams allow binding connectors and note links.',
          'Parametric Diagram에서는 Binding Connector와 Note Link만 사용할 수 있습니다',
        );
      }
      if (!PARAMETRIC_CONNECTABLE_KINDS.has(from.kind) || !PARAMETRIC_CONNECTABLE_KINDS.has(to.kind)) {
        return uiText(
          'Connect binding connectors between constraint parameters or value properties.',
          'Binding Connector는 Constraint Parameter 또는 Value Property 사이에 연결하세요',
        );
      }
      if (from.id === to.id) return uiText('A binding connector cannot connect an element to itself.', 'Binding Connector는 같은 요소로 되돌아갈 수 없습니다');
      const compatibility = bindingTypeCompatibility(
        from.classifierModelId,
        to.classifierModelId,
        state.models,
      );
      if (compatibility.status === 'error') return compatibility.message;
      if (dg().relations.some(relation =>
        relation.id !== ignoredRelationId && relation.kind === 'bindingconnector'
        && ((relation.from === from.id && relation.to === to.id)
          || (relation.from === to.id && relation.to === from.id)))) {
        return uiText('These parameters or values are already connected.', '같은 Parameter/Value 사이에 Binding Connector가 이미 있습니다');
      }
      return '';
    }

    /* The per-diagram rules in the order completeLink applies them; the first
       non-empty message wins. */
    const DIAGRAM_RULES = Object.freeze([
      compositeRelationError,
      activityRelationError,
      packageRelationError,
      profileRelationError,
      informationFlowRelationError,
      requirementRelationError,
      bddRelationError,
      ibdRelationError,
      parametricRelationError,
    ]);

    function relationError(kind: string, from: CandidateEndpoint, to: CandidateEndpoint, ignoredRelationId = '') {
      for (const rule of DIAGRAM_RULES) {
        const message = rule(kind, from, to, ignoredRelationId);
        if (message) return message;
      }
      return '';
    }

    return Object.freeze({
      activityRelationError,
      bddRelationError,
      compositeRelationError,
      ibdRelationError,
      informationFlowRelationError,
      packageRelationError,
      parametricRelationError,
      profileRelationError,
      relationError,
      requirementRelationError,
      transitionDirectionError,
    });
  }

  return Object.freeze({ REQUIRED_FUNCTIONS, REQUIRED_VALUES, KIND_SETS, create });
}
