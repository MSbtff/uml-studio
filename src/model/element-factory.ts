'use strict';

/* Element Factory — owns generated view names and the initial persisted shape
   of every element placed on a diagram. Project-wide IDs, counters and the
   active diagram remain host state and are injected. */
type ElementFactoryApi = ReturnType<typeof createElementFactoryModule>;
declare var UMLElementFactory: ElementFactoryApi;

(function initElementFactoryModule(root: typeof globalThis & { UMLElementFactory?: ElementFactoryApi }, factory: () => ElementFactoryApi) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root) root.UMLElementFactory = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, createElementFactoryModule);

function createElementFactoryModule() {
  const REQUIRED_FUNCTIONS = Object.freeze([
    'dg',
    'sequenceLifelineTop',
    'uid',
  ] as const);
  const REQUIRED_VALUES = Object.freeze([
    'ACTIVITY_PIN_KINDS',
    'BDD_CLASSIFIER_KINDS',
    'FILL_DEFAULT',
    'TIMING_ROW_HEIGHT',
    'counters',
  ] as const);
  const NAME_PREFIXES: Readonly<Partial<Record<string, string>>> = Object.freeze({
    c4person: 'Person', c4system: 'System', c4container: 'Container',
    class: 'Class', interface: 'Interface', enumeration: 'Enumeration',
    package: 'Package', model: 'Model', subsystem: 'Subsystem',
    metaclass: 'MetaClass', stereotype: 'Stereotype',
    note: 'Note', actor: 'Actor', usecase: 'UseCase',
    boundary: 'System', action: 'Action', initial: 'Initial', final: 'Final',
    flowfinal: 'FlowFinal', decision: 'Decision', merge: 'Merge', forkbar: 'Fork', joinbar: 'Join',
    swimlanev: 'Partition', swimlaneh: 'Partition', interruptibleregion: 'InterruptibleRegion',
    structuredactivity: 'StructuredActivity', inputpin: 'input', outputpin: 'output',
    sendsignal: 'Send Signal', acceptsignal: 'Accept Signal', timeevent: 'Accept Time Event',
    objectnode: 'Object', centralbuffer: 'Buffer', activitydatastore: 'DataStore',
    activityparameter: 'Parameter', expansionregion: 'ExpansionRegion',
    expansioninput: 'input', expansionoutput: 'output',
    lifeline: ':Object', seqactor: 'Actor', fragment: 'Fragment',
    component: 'Component', interfaceball: 'Interface', artifact: 'Artifact', node: 'Node',
    database: 'Database',
    entity: 'Entity', process: 'Process', external: 'External', datastore: 'DataStore', mindnode: 'Topic',
    state: 'State', compositestate: 'CompositeState', submachinestate: 'SubmachineState', region: 'Region',
    stateinitial: 'Initial', statefinal: 'Final', choice: 'Choice', junction: 'Junction',
    statefork: 'Fork', shallowhistory: 'History', deephistory: 'DeepHistory',
    entrypoint: 'EntryPoint', exitpoint: 'ExitPoint', terminate: 'Terminate', connectionpointref: 'ConnectionPoint',
    object: 'Object', artifactinstance: 'ArtifactInstance', componentinstance: 'ComponentInstance', nodeinstance: 'NodeInstance',
    'comm-forward': 'message', 'comm-reverse': 'reply',
    collaboration: 'Collaboration', part: 'part', reference: 'reference', value: 'value',
    ibdframe: 'Internal Structure', port: 'port', collaborationuse: 'collaborationUse',
    parametricframe: 'Parametric Analysis', constraintproperty: 'constraint',
    constraintparameter: 'parameter',
    timingstate: 'State', timesegment: '', timetick: 'Time',
    timeconstraint: 'at', durationconstraint: 'duration',
    interactionuse: 'Interaction', interactioninline: 'Inline Sequence',
    informationitem: 'Information', requirement: 'Requirement',
    block: 'Block', valuetype: 'ValueType', interfaceblock: 'InterfaceBlock',
    constraintblock: 'ConstraintBlock',
    stateinvariant: 'state', continuation: 'Continuation', frame: 'Sequence',
  });

  interface ActiveDiagram {
    type: string;
    elements?: readonly { kind: string; y: number }[];
  }
  interface ElementFactoryDependencies {
    dg(): ActiveDiagram;
    sequenceLifelineTop(diagram: ActiveDiagram): number;
    uid(): string;
    ACTIVITY_PIN_KINDS: ReadonlySet<string>;
    BDD_CLASSIFIER_KINDS: ReadonlySet<string>;
    FILL_DEFAULT: string;
    TIMING_ROW_HEIGHT: number;
    counters: Record<string, number>;
  }

  function create(dependencies?: ElementFactoryDependencies) {
    const deps: Partial<ElementFactoryDependencies> = dependencies || {};
    const missing: string[] = REQUIRED_FUNCTIONS.filter(name => typeof deps[name] !== 'function');
    REQUIRED_VALUES.forEach(name => {
      if (deps[name] == null) missing.push(name);
    });
    (['ACTIVITY_PIN_KINDS', 'BDD_CLASSIFIER_KINDS'] as const).forEach(name => {
      if (deps[name] != null && typeof deps[name].has !== 'function') missing.push(`${name}.has`);
    });
    if (deps.counters != null && (typeof deps.counters !== 'object' || Array.isArray(deps.counters))) {
      missing.push('counters.object');
    }
    if (deps.TIMING_ROW_HEIGHT != null && !Number.isFinite(deps.TIMING_ROW_HEIGHT)) {
      missing.push('TIMING_ROW_HEIGHT.number');
    }
    if (missing.length) {
      throw new TypeError(`Element Factory 의존성이 없습니다: ${[...new Set(missing)].join(', ')}`);
    }

    const {
      dg,
      sequenceLifelineTop,
      uid,
      ACTIVITY_PIN_KINDS,
      BDD_CLASSIFIER_KINDS,
      FILL_DEFAULT,
      TIMING_ROW_HEIGHT,
      counters,
    } = deps as ElementFactoryDependencies;

    function nextName(kind: string) {
      counters[kind] = (counters[kind] || 0) + 1;
      return (NAME_PREFIXES[kind] || 'Element') + counters[kind];
    }

    function createElement(kind: string, x: number, y: number) {
      /* an actor in a sequence diagram is a lifeline drawn as a stick figure */
      if (kind === 'seqactor') {
        return {
          id: uid(), kind: 'lifeline', isActor: true, x, y: sequenceLifelineTop(dg()),
          w: 0, h: 0, name: nextName('seqactor'), fill: FILL_DEFAULT,
        };
      }
      const base: DiagramBounds & { id: string; kind: string; name: string; fill: string; classifierModelId?: string; columns?: string[] } = {
        id: uid(), kind, x, y, w: 0, h: 0,
        name: nextName(kind), fill: FILL_DEFAULT,
      };
      if (kind === 'c4container') Object.assign(base, { c4ContainerType: 'application' });
      if (kind === 'class') Object.assign(base, {
        attributes: [], operations: [], stereotype: '', isAbstract: false,
        ...(dg().type === 'composite' ? { w: 520, h: 360, fill: '#f5f6ff' } : {}),
      });
      if (kind === 'interface') Object.assign(base, { attributes: [], operations: [] });
      if (kind === 'enumeration') Object.assign(base, { literals: [], operations: [] });
      if (kind === 'package' && dg().type === 'package') Object.assign(base, {
        fill: '#fff8df', stereotype: '', visibility: 'public', w: 320, h: 224,
      });
      if (kind === 'model') Object.assign(base, {
        fill: '#fff5d6', stereotype: 'model', visibility: 'public', w: 720, h: 520,
      });
      if (kind === 'subsystem') Object.assign(base, {
        fill: '#fff9e8', stereotype: 'subsystem', visibility: 'public', w: 280, h: 176,
      });
      if (kind === 'metaclass') Object.assign(base, {
        fill: '#f5effa', visibility: 'public', w: 208, h: 72,
      });
      if (kind === 'stereotype') Object.assign(base, {
        fill: '#f8f1fc', visibility: 'public', attributes: [], operations: [],
        iconContent: '', w: 240, h: 112,
      });
      if (kind === 'informationitem') Object.assign(base, {
        fill: '#eef8f8', visibility: 'public', stereotype: 'information',
        attributes: [], operations: [], receptions: [], w: 208, h: 88,
      });
      if (kind === 'requirement') Object.assign(base, {
        fill: '#edf4fa', visibility: 'public', requirementType: 'requirement',
        requirementId: `REQ-${String(counters.requirement || 1).padStart(3, '0')}`,
        requirementText: 'The system shall ...', risk: 'Medium',
        verificationMethod: 'Analysis', w: 296, h: 144,
      });
      if (BDD_CLASSIFIER_KINDS.has(kind)) Object.assign(base, {
        fill: '#edf4f7', visibility: 'public', isAbstract: false,
        parts: [], references: [], values: [], flowProperties: [],
        constraintProperties: [], properties: [], constraints: [],
        constraintParameters: [], operations: [], receptions: [],
        valueTypeUnit: '', quantityKind: '', w: 256, h: 88,
      });
      if (kind === 'ibdframe') Object.assign(base, {
        name: 'Internal Structure', fill: '#f8fbfc', classifierModelId: '', w: 1200, h: 840,
      });
      if (kind === 'parametricframe') Object.assign(base, {
        name: 'Parametric Analysis', fill: '#fbf9fd', classifierModelId: '', w: 1200, h: 840,
      });
      if (kind === 'note') Object.assign(base, { text: 'Note' });
      if (kind === 'lifeline') {
        base.classifierModelId = '';
        if (dg().type === 'sequence') base.y = sequenceLifelineTop(dg());
        if (dg().type === 'timing') Object.assign(base, {
          w: 1000, h: 132, fill: '#f8eadf', stereotype: '',
        });
      }
      if (kind === 'fragment') Object.assign(base, {
        operator: 'alt', condition: '', operands: ['[success]', '[else]'], w: 240, h: 160,
      });
      if (kind === 'frame') Object.assign(base, { w: 520, h: 360, fill: '#ffffff' });
      if (kind === 'interactionuse') Object.assign(base, { interactionDiagramId: '', w: 200, h: 60 });
      if (kind === 'interactioninline') Object.assign(base, {
        interactionDiagramId: '', fill: '#ffffff', w: 400, h: 240,
      });
      if (kind === 'continuation') Object.assign(base, { w: 120, h: 30 });
      if (kind === 'boundary') Object.assign(base, { w: 280, h: 200 });
      if (kind === 'boundary' && dg().type === 'deployment') base.fill = '#ffffff';
      if (kind === 'database') base.fill = '#dff0e5';
      if (kind === 'node') Object.assign(base, { stereotype: 'device' });
      if (kind === 'entity') base.columns = ['PK id: INTEGER'];
      if (kind === 'mindnode') base.fill = '#d7e6f7';
      if (kind === 'state') Object.assign(base, {
        fill: '#eef1ff', entry: '', doActivity: '', exit: '', internalTransitions: [],
      });
      if (kind === 'compositestate') Object.assign(base, {
        fill: '#f2f4ff', entry: '', doActivity: '', exit: '',
        internalTransitions: [], w: 360, h: 280,
      });
      if (kind === 'submachinestate') Object.assign(base, {
        fill: '#eef1ff', entry: '', doActivity: '', exit: '', internalTransitions: [],
        submachineDiagramId: '', w: 240, h: 96,
      });
      if (kind === 'entrypoint' || kind === 'exitpoint') Object.assign(base, {
        fill: '#ffffff', w: 20, h: 20,
      });
      if (kind === 'terminate') Object.assign(base, { fill: 'transparent', w: 24, h: 24 });
      if (kind === 'connectionpointref') Object.assign(base, {
        fill: '#ffffff', referenceKind: 'entry', w: 20, h: 20,
      });
      if (kind === 'object') Object.assign(base, {
        fill: '#f8f0fb', classifierModelId: '', slots: [],
      });
      if (kind === 'artifactinstance') Object.assign(base, {
        fill: '#f5f1fb', classifierModelId: '', w: 160, h: 64,
      });
      if (kind === 'componentinstance') Object.assign(base, {
        fill: '#f5f1fb', classifierModelId: '', w: 176, h: 64,
      });
      if (kind === 'nodeinstance') Object.assign(base, {
        fill: '#f5f1fb', classifierModelId: '', w: 184, h: 96,
      });
      if (kind === 'collaboration') Object.assign(base, {
        fill: '#f5f6ff', w: 440, h: 320,
      });
      if (kind === 'part') Object.assign(base, {
        fill: dg().type === 'ibd' ? '#eaf2f5' : '#eef1ff',
        classifierModelId: '', w: 176, h: 72,
      });
      if (kind === 'reference') Object.assign(base, {
        fill: '#eef6f8', classifierModelId: '', w: 184, h: 72,
      });
      if (kind === 'value') Object.assign(base, {
        fill: '#f7f4ec', classifierModelId: '', defaultValue: '', w: 184, h: 72,
      });
      if (kind === 'constraintproperty') Object.assign(base, {
        fill: '#f3edf8', classifierModelId: '', visibility: 'public', w: 296, h: 128,
      });
      if (kind === 'constraintparameter') Object.assign(base, {
        fill: '#ffffff', classifierModelId: '', visibility: 'public', w: 18, h: 18,
      });
      if (kind === 'port') Object.assign(base, {
        fill: '#ffffff', classifierModelId: '', providedInterfaceModelId: '',
        requiredInterfaceModelId: '', w: 18, h: 18,
      });
      if (kind === 'collaborationuse') Object.assign(base, {
        fill: '#f7f5ff', collaborationModelId: '', w: 200, h: 80,
      });
      if (kind === 'timingstate') Object.assign(base, {
        fill: '#ffffff', w: 760, h: TIMING_ROW_HEIGHT,
      });
      if (kind === 'timesegment') Object.assign(base, {
        name: '', fill: '#ad6b3d', startTime: '', endTime: '', w: 128, h: 10,
      });
      if (kind === 'timetick') Object.assign(base, {
        name: 'tick', timeValue: '0 ms', fill: 'transparent', w: 8, h: 480,
      });
      if (kind === 'timeconstraint') Object.assign(base, {
        name: 'timeConstraint', constraint: '{t = 0 ms}',
        fill: 'transparent', w: 120, h: 28,
      });
      if (kind === 'durationconstraint') Object.assign(base, {
        name: 'durationConstraint', constraint: '{0 ms..10 ms}',
        fill: 'transparent', w: 176, h: 32,
      });
      if (kind === 'region') Object.assign(base, {
        fill: 'transparent', w: 320, h: 100,
      });
      if (kind === 'swimlanev') Object.assign(base, {
        fill: '#fffdf2', w: 360, h: 560,
      });
      if (kind === 'swimlaneh') Object.assign(base, {
        fill: '#fffdf2', w: 720, h: 208,
      });
      if (kind === 'interruptibleregion') Object.assign(base, {
        fill: '#fffdf6', w: 360, h: 224,
      });
      if (kind === 'structuredactivity') Object.assign(base, {
        fill: '#fff7ed', w: 360, h: 224,
      });
      if (kind === 'expansionregion') Object.assign(base, {
        fill: '#fff8ef', expansionMode: 'parallel', w: 400, h: 224,
      });
      if (ACTIVITY_PIN_KINDS.has(kind)) Object.assign(base, {
        fill: '#ffffff', w: 16, h: 16,
      });
      if (kind === 'centralbuffer' || kind === 'activitydatastore') Object.assign(base, {
        w: 144, h: 56,
      });
      return base;
    }

    return Object.freeze({
      createElement,
      nextName,
    });
  }

  return Object.freeze({
    NAME_PREFIXES,
    REQUIRED_FUNCTIONS,
    REQUIRED_VALUES,
    create,
  });
}
