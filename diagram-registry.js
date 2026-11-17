'use strict';

/* Diagram metadata and palette registry shared by the editor and tests. */
(function initDiagramRegistry(root, factory) {
  const api = factory();
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  if (root) root.UMLDiagramRegistry = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function createDiagramRegistry() {
  const DIAGRAM_META = {
    class:      { label: 'Class Diagram',      code: 'CL', color: '#c98f2c' },
    package:    { label: 'Package Diagram',    code: 'PK', color: '#b0763a' },
    profile:    { label: 'Profile Diagram',    code: 'PF', color: '#76508f' },
    usecase:    { label: 'Use Case Diagram',   code: 'UC', color: '#2e9e5b' },
    activity:   { label: 'Activity Diagram',   code: 'AC', color: '#d1583a' },
    sequence:   { label: 'Sequence Diagram',   code: 'SQ', color: '#1a73e8' },
    interactionoverview:{ label: 'Interaction Overview Diagram', code: 'IO', color: '#3b6fb6' },
    informationflow:{ label: 'Information Flow Diagram', code: 'IF', color: '#397d8c' },
    requirement:{ label: 'Requirement Diagram', code: 'RQ', color: '#4f6f8f' },
    bdd:        { label: 'Block Definition Diagram', code: 'BD', color: '#516f86' },
    ibd:        { label: 'Internal Block Diagram', code: 'IB', color: '#3f7583' },
    parametric: { label: 'Parametric Diagram', code: 'PA', color: '#765f91' },
    component:  { label: 'Component Diagram',  code: 'CM', color: '#7b46d3' },
    deployment: { label: 'Deployment Diagram', code: 'DP', color: '#3f7f7f' },
    erd:        { label: 'ER Diagram',          code: 'ER', color: '#b3417a' },
    dfd:        { label: 'Data Flow Diagram',   code: 'DF', color: '#3a8fb0' },
    mindmap:    { label: 'Mindmap',             code: 'MM', color: '#d1863a' },
    state:      { label: 'State Machine Diagram', code: 'SM', color: '#5b72b2' },
    object:     { label: 'Object Diagram',      code: 'OB', color: '#8a5f9e' },
    communication:{ label: 'Communication Diagram', code: 'CO', color: '#2c7a8b' },
    composite:  { label: 'Composite Structure Diagram', code: 'CS', color: '#5f6fa3' },
    timing:     { label: 'Timing Diagram', code: 'TM', color: '#ad6b3d' },
  };

  const DIAGRAM_TOOLS = {
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
      elements: ['node', 'artifact', 'component', 'note'],
      relations: ['commpath', 'deploy', 'dependency', 'notelink'],
    },
    erd: {
      elements: ['entity', 'note'],
      relations: ['erd-11', 'erd-1n', 'erd-nm', 'notelink'],
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

  function diagramAllowsElementKind(type, kind) {
    const tools = DIAGRAM_TOOLS[type];
    return !!tools && (tools.elements.includes(kind) || (tools.reuseElements || []).includes(kind));
  }

  function diagramAllowsRelationKind(type, kind) {
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
});
