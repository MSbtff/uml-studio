'use strict';

/* Diagram metadata and palette registry shared by the editor and tests. */
type DiagramRegistryApi = ReturnType<typeof createDiagramRegistry>;
declare var UMLDiagramRegistry: DiagramRegistryApi;

(function initDiagramRegistry(root: typeof globalThis & { UMLDiagramRegistry?: DiagramRegistryApi }, factory: () => DiagramRegistryApi) {
  const api = factory();
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  if (root) root.UMLDiagramRegistry = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, createDiagramRegistry);

function createDiagramRegistry() {
  const DIAGRAM_META = {
    class:      { label: 'Class Diagram', labelKo: '클래스 다이어그램', code: 'CL', color: '#c98f2c' },
    package:    { label: 'Package Diagram', labelKo: '패키지 다이어그램', code: 'PK', color: '#b0763a' },
    profile:    { label: 'Profile Diagram', labelKo: '프로파일 다이어그램', code: 'PF', color: '#76508f' },
    usecase:    { label: 'Use Case Diagram', labelKo: '유스케이스 다이어그램', code: 'UC', color: '#2e9e5b' },
    activity:   { label: 'Activity Diagram', labelKo: '활동 다이어그램', code: 'AC', color: '#d1583a' },
    sequence:   { label: 'Sequence Diagram', labelKo: '시퀀스 다이어그램', code: 'SQ', color: '#1a73e8' },
    interactionoverview:{ label: 'Interaction Overview Diagram', labelKo: '상호작용 개요 다이어그램', code: 'IO', color: '#3b6fb6' },
    informationflow:{ label: 'Information Flow Diagram', labelKo: '정보 흐름 다이어그램', code: 'IF', color: '#397d8c' },
    requirement:{ label: 'Requirement Diagram', labelKo: '요구사항 다이어그램', code: 'RQ', color: '#4f6f8f' },
    bdd:        { label: 'Block Definition Diagram', labelKo: '블록 정의 다이어그램', code: 'BD', color: '#516f86' },
    ibd:        { label: 'Internal Block Diagram', labelKo: '내부 블록 다이어그램', code: 'IB', color: '#3f7583' },
    parametric: { label: 'Parametric Diagram', labelKo: '파라메트릭 다이어그램', code: 'PA', color: '#765f91' },
    component:  { label: 'Component Diagram', labelKo: '컴포넌트 다이어그램', code: 'CM', color: '#7b46d3' },
    deployment: { label: 'Deployment Diagram', labelKo: '배치 다이어그램', code: 'DP', color: '#3f7f7f' },
    erd:        { label: 'ER Diagram', labelKo: 'ER 다이어그램', code: 'ER', color: '#b3417a' },
    c4context:  { label: 'C4 System Context', labelKo: 'C4 시스템 컨텍스트', code: 'L1', color: '#225085' },
    c4container:{ label: 'C4 Container', labelKo: 'C4 컨테이너', code: 'L2', color: '#35739c', fromContext: true },
    dfd:        { label: 'Data Flow Diagram', labelKo: '데이터 흐름 다이어그램', code: 'DF', color: '#3a8fb0' },
    mindmap:    { label: 'Mindmap', labelKo: '마인드맵', code: 'MM', color: '#d1863a' },
    state:      { label: 'State Machine Diagram', labelKo: '상태 머신 다이어그램', code: 'SM', color: '#5b72b2' },
    object:     { label: 'Object Diagram', labelKo: '객체 다이어그램', code: 'OB', color: '#8a5f9e' },
    communication:{ label: 'Communication Diagram', labelKo: '통신 다이어그램', code: 'CO', color: '#2c7a8b' },
    composite:  { label: 'Composite Structure Diagram', labelKo: '복합 구조 다이어그램', code: 'CS', color: '#5f6fa3' },
    timing:     { label: 'Timing Diagram', labelKo: '타이밍 다이어그램', code: 'TM', color: '#ad6b3d' },
  };

  const DIAGRAM_TOOLS: Record<string, { elements: string[]; reuseElements?: string[]; hiddenElements?: string[]; relations: string[] }> = {
    class: {
      elements: ['class', 'interface', 'enumeration', 'package', 'note'],
      relations: ['association', 'directed', 'generalization', 'realization', 'dependency', 'aggregation', 'composition', 'notelink'],
    },
    package: {
      elements: ['package', 'model', 'subsystem', 'note'],
      relations: ['containment', 'dependency', 'notelink'],
    },
    profile: {
      elements: ['metaclass', 'stereotype', 'note'],
      relations: ['extension', 'generalization', 'notelink'],
    },
    usecase: {
      elements: ['actor', 'usecase', 'boundary', 'note'],
      relations: ['association', 'include', 'extend', 'generalization', 'notelink'],
    },
    activity: {
      elements: [
        'action', 'initial', 'final', 'flowfinal', 'decision', 'merge', 'forkbar', 'joinbar',
        'swimlanev', 'swimlaneh', 'interruptibleregion', 'structuredactivity',
        'inputpin', 'outputpin', 'sendsignal', 'acceptsignal', 'timeevent',
        'objectnode', 'centralbuffer', 'activitydatastore', 'activityparameter',
        'expansionregion', 'expansioninput', 'expansionoutput', 'note',
      ],
      relations: ['controlflow', 'objectflow', 'exceptionhandler', 'activityinterrupt', 'notelink'],
    },
    sequence: {
      elements: ['lifeline', 'seqactor', 'execution', 'fragment', 'interactionuse', 'stateinvariant', 'continuation', 'frame', 'note'],
      relations: ['msg-sync', 'msg-async', 'msg-reply', 'msg-create', 'msg-destroy', 'notelink'],
    },
    interactionoverview: {
      elements: ['interactionuse', 'interactioninline', 'initial', 'final', 'forkbar', 'joinbar', 'merge', 'decision', 'note'],
      relations: ['controlflow', 'notelink'],
    },
    informationflow: {
      elements: ['informationitem', 'note'],
      reuseElements: [
        'actor', 'usecase', 'node', 'artifact', 'class', 'component', 'interface',
        'package', 'model', 'subsystem', 'action', 'sendsignal', 'acceptsignal',
        'timeevent', 'objectnode', 'activityparameter', 'object',
        'artifactinstance', 'componentinstance', 'nodeinstance',
      ],
      relations: ['informationflow', 'notelink'],
    },
    requirement: {
      elements: ['requirement', 'note'],
      reuseElements: [
        'actor', 'usecase', 'node', 'artifact', 'class', 'component', 'interface',
        'package', 'model', 'subsystem', 'action', 'sendsignal', 'acceptsignal',
        'timeevent', 'objectnode', 'activityparameter', 'object',
        'artifactinstance', 'componentinstance', 'nodeinstance', 'informationitem',
      ],
      relations: [
        'reqcontainment', 'reqcopy', 'derivereqt', 'verify',
        'satisfy', 'refine', 'trace', 'notelink',
      ],
    },
    bdd: {
      elements: ['block', 'valuetype', 'interfaceblock', 'constraintblock', 'port', 'object', 'note'],
      relations: [
        'association', 'directed', 'generalization', 'dependency',
        'aggregation', 'composition', 'connector', 'notelink',
      ],
    },
    ibd: {
      elements: ['ibdframe', 'part', 'reference', 'value', 'port', 'note'],
      hiddenElements: ['ibdframe'],
      relations: ['connector', 'notelink'],
    },
    parametric: {
      elements: ['parametricframe', 'constraintproperty', 'constraintparameter', 'value', 'note'],
      hiddenElements: ['parametricframe'],
      relations: ['bindingconnector', 'notelink'],
    },
    component: {
      elements: ['component', 'interfaceball', 'artifact', 'package', 'note'],
      relations: ['connector', 'dependency', 'realization', 'directed', 'notelink'],
    },
    deployment: {
      elements: ['node', 'artifact', 'component', 'database', 'boundary', 'note'],
      relations: ['commpath', 'deploy', 'dependency', 'notelink'],
    },
    erd: {
      elements: ['entity', 'note'],
      relations: ['erd-11', 'erd-1n', 'erd-nm', 'notelink'],
    },
    c4context: {
      elements: ['c4person', 'c4system', 'note'],
      relations: ['c4relationship', 'notelink'],
    },
    c4container: {
      elements: ['c4person', 'c4system', 'c4container', 'note'],
      relations: ['c4relationship', 'notelink'],
    },
    dfd: {
      elements: ['process', 'external', 'datastore', 'note'],
      relations: ['dataflow', 'notelink'],
    },
    mindmap: {
      elements: ['mindnode', 'note'],
      relations: ['mindbranch', 'notelink'],
    },
    state: {
      elements: ['state', 'compositestate', 'submachinestate', 'region', 'stateinitial', 'statefinal', 'choice', 'junction', 'statefork', 'shallowhistory', 'deephistory', 'entrypoint', 'exitpoint', 'terminate', 'connectionpointref', 'note'],
      relations: ['transition', 'notelink'],
    },
    object: {
      elements: ['object', 'artifactinstance', 'componentinstance', 'nodeinstance', 'note'],
      relations: ['link', 'directedlink', 'notelink'],
    },
    communication: {
      elements: ['lifeline', 'note'],
      relations: ['commconnector', 'comm-forward', 'comm-reverse', 'notelink'],
    },
    composite: {
      elements: ['class', 'collaboration', 'part', 'port', 'collaborationuse', 'note'],
      relations: ['csconnector', 'rolebinding', 'notelink'],
    },
    timing: {
      elements: ['lifeline', 'timingstate', 'timesegment', 'timetick', 'timeconstraint', 'durationconstraint', 'note'],
      relations: ['timingmessage', 'notelink'],
    },
  };

  function diagramAllowsElementKind(type: string, kind: string) {
    const tools = DIAGRAM_TOOLS[type];
    return !!tools && (tools.elements.includes(kind) || (tools.reuseElements || []).includes(kind));
  }

  function diagramAllowsRelationKind(type: string, kind: string) {
    const tools = DIAGRAM_TOOLS[type];
    return !!tools && tools.relations.includes(kind);
  }

  function registeredElementKinds() {
    return [...new Set(Object.values(DIAGRAM_TOOLS)
      .flatMap(tools => [...tools.elements, ...(tools.reuseElements || [])]))];
  }

  function registeredRelationKinds() {
    return [...new Set(Object.values(DIAGRAM_TOOLS).flatMap(tools => tools.relations))];
  }

  return {
    DIAGRAM_META,
    DIAGRAM_TOOLS,
    diagramAllowsElementKind,
    diagramAllowsRelationKind,
    registeredElementKinds,
    registeredRelationKinds,
  };
}
