'use strict';

const assert = require('node:assert/strict');
const {
  hydrateView,
  hydrateProject,
  validateProjectData,
  stringifyProject,
} = require('../dist/browser/model/model-core.js');

const options = {
  diagramTypes: ['class'],
  elementKinds: ['class', 'interface'],
  relationKinds: ['association'],
};

function legacyProject() {
  return {
    version: 10,
    diagrams: [{
      id: 'd1', type: 'class', name: 'Main',
      elements: [
        { id: 'v1', kind: 'class', name: 'User', attributes: [], operations: [], x: 10, y: 10, w: 100, h: 50 },
        { id: 'v2', kind: 'interface', name: 'Account', operations: [], x: 200, y: 10, w: 100, h: 50 },
      ],
      relations: [
        { id: 'r1', kind: 'association', from: 'v1', to: 'v2', name: '', sourceLabel: '', targetLabel: '' },
      ],
    }],
  };
}

let seq = 1;
const nextId = () => `m${seq++}`;

{
  const boundary = { id: 'boundary', kind: 'boundary', name: 'External' };
  const project = {
    version: 10,
    diagrams: [{ id: 'deployment', type: 'deployment', elements: [boundary], relations: [] }],
  };
  const deploymentOptions = { diagramTypes: ['deployment'], elementKinds: ['boundary'] };
  assert.equal(validateProjectData(project, deploymentOptions), true);
  boundary.borderStyle = 'dashed';
  assert.equal(validateProjectData(project, deploymentOptions), true);
  boundary.borderStyle = 'invalid';
  assert.throws(() => validateProjectData(project, deploymentOptions), /경계 테두리 스타일/);
}

{
  const project = legacyProject();
  assert.equal(validateProjectData(project, options), true);
  const models = hydrateProject(project.diagrams, {}, nextId);
  assert.equal(Object.keys(models).length, 3, '요소 2개와 관계 1개의 모델이 생성되어야 한다');
  assert.equal(project.diagrams[0].elements[0].name, 'User');
  assert.equal(Object.prototype.propertyIsEnumerable.call(project.diagrams[0].elements[0], 'name'), false);

  const secondView = hydrateView({
    id: 'v3', modelId: project.diagrams[0].elements[0].modelId,
    x: 10, y: 100, w: 100, h: 50,
  }, models, nextId);
  secondView.name = 'Member';
  assert.equal(project.diagrams[0].elements[0].name, 'Member', '같은 모델의 모든 뷰에 변경이 반영되어야 한다');

  project.diagrams[0].elements[0]._m = { runtime: true };
  project.diagrams[0].elements[0]._depth = 2;
  const json = stringifyProject({ version: 11, models, diagrams: project.diagrams }, true);
  const saved = JSON.parse(json);
  assert.equal(saved.diagrams[0].elements[0].name, undefined, '의미 속성은 뷰에 중복 저장하지 않는다');
  assert.equal(saved.diagrams[0].elements[0]._m, undefined, '렌더링 캐시는 저장하지 않는다');
  assert.equal(saved.diagrams[0].elements[0]._depth, undefined, '실행 막대의 계산된 깊이는 저장하지 않는다');
  assert.equal(saved.models[project.diagrams[0].elements[0].modelId].name, 'Member');
}

{
  const fragment = { id: 'fragment-model', kind: 'fragment', name: 'Fragment', operator: 'alt',
    condition: '[fallback]', operands: ['[success]', '[else]'] };
  const original = { id: 'original', modelId: fragment.id, x: 30, y: 100, w: 240, h: 160 };
  const copy = { ...original, id: 'copy', x: 300 };
  const sharedView = { ...original, id: 'shared-view' };
  const diagrams = [
    { id: 'd1', type: 'sequence', elements: [original, copy], relations: [] },
    { id: 'd2', type: 'sequence', elements: [sharedView], relations: [] },
  ];
  const models = hydrateProject(diagrams, { [fragment.id]: fragment }, nextId);
  assert.equal(original.modelId, fragment.id);
  assert.equal(sharedView.modelId, fragment.id);
  assert.notEqual(copy.modelId, fragment.id);
  assert.deepEqual(models[copy.modelId], { ...fragment, id: copy.modelId });
  copy.operands[0] = '[copied guard]';
  assert.deepEqual(original.operands, ['[success]', '[else]']);

  const saved = JSON.parse(stringifyProject({ version: 30, diagrams, models }, false));
  const reloaded = hydrateProject(saved.diagrams, saved.models, nextId);
  assert.equal(Object.keys(reloaded).length, 2);
  assert.deepEqual(saved.diagrams[0].elements[1], { id: 'copy', modelId: copy.modelId, x: 300, y: 100, w: 240, h: 160 });
  assert.deepEqual(reloaded[copy.modelId].operands, ['[copied guard]', '[else]']);
}

{
  const identified = legacyProject();
  identified.projectId = 'p-safe-project';
  identified.projectName = 'Safe Project';
  assert.equal(validateProjectData(identified, options), true);
  identified.projectId = '../unsafe';
  assert.throws(() => validateProjectData(identified, options), /프로젝트 ID/);
  identified.projectId = 'p-safe-project';
  identified.projectName = '';
  assert.throws(() => validateProjectData(identified, options), /프로젝트 이름/);
}

{
  const broken = legacyProject();
  broken.diagrams[0].relations[0].to = 'missing';
  assert.throws(() => validateProjectData(broken, options), /연결 대상/);
}

{
  const broken = legacyProject();
  broken.diagrams.push({ ...broken.diagrams[0] });
  assert.throws(() => validateProjectData(broken, options), /중복된 다이어그램 ID/);
}

{
  const broken = {
    version: 11,
    models: {},
    diagrams: [{
      id: 'd1', type: 'class', name: 'Main',
      elements: [{ id: 'v1', modelId: 'missing', x: 0, y: 0 }],
      relations: [],
    }],
  };
  assert.throws(() => validateProjectData(broken, options), /요소 종류|모델을 찾을 수/);
}

{
  const nestedOptions = {
    diagramTypes: ['state'],
    elementKinds: ['compositestate', 'region', 'state'],
    relationKinds: ['transition'],
  };
  const models = {
    mc: { id: 'mc', kind: 'compositestate', name: 'Order' },
    mr: { id: 'mr', kind: 'region', name: 'Payment' },
    ms: { id: 'ms', kind: 'state', name: 'Pending' },
  };
  const project = {
    version: 13, models,
    diagrams: [{
      id: 'sd1', type: 'state', name: 'Nested', relations: [],
      elements: [
        { id: 'vc', modelId: 'mc', x: 0, y: 0 },
        { id: 'vr', modelId: 'mr', parentId: 'vc', x: 0, y: 30 },
        { id: 'vs', modelId: 'ms', parentId: 'vr', x: 20, y: 60 },
      ],
    }],
  };
  assert.equal(validateProjectData(project, nestedOptions), true);
  project.diagrams[0].elements[2].parentId = 'missing';
  assert.throws(() => validateProjectData(project, nestedOptions), /포함 부모/);
  project.diagrams[0].elements[2].parentId = 'vr';
  project.diagrams[0].elements[0].parentId = 'vs';
  assert.throws(() => validateProjectData(project, nestedOptions), /순환/);
}

{
  const stateOptions = {
    diagramTypes: ['state'],
    elementKinds: ['submachinestate', 'connectionpointref', 'entrypoint'],
    relationKinds: ['transition'],
  };
  const models = {
    ms: { id: 'ms', kind: 'submachinestate', name: 'Payment', submachineDiagramId: 'sub' },
    mr: { id: 'mr', kind: 'connectionpointref', name: 'entry', referenceKind: 'entry' },
    me: { id: 'me', kind: 'entrypoint', name: 'entry' },
  };
  const project = {
    version: 14, models, activeId: 'top',
    diagrams: [
      {
        id: 'top', type: 'state', name: 'Top', relations: [],
        elements: [
          { id: 'vs', modelId: 'ms', x: 100, y: 100, w: 240, h: 96 },
          { id: 'vr', modelId: 'mr', parentId: 'vs', borderAnchor: { fx: 0, fy: 0.5 }, x: 90, y: 138, w: 20, h: 20 },
        ],
      },
      { id: 'sub', type: 'state', name: 'Sub', relations: [], elements: [{ id: 've', modelId: 'me', x: 20, y: 20, w: 20, h: 20 }] },
    ],
  };
  assert.equal(validateProjectData(project, stateOptions), true);
  hydrateProject(project.diagrams, models, nextId);
  assert.equal(project.diagrams[0].elements[0].submachineDiagramId, 'sub');
  assert.equal(project.diagrams[0].elements[1].referenceKind, 'entry');
  const saved = JSON.parse(stringifyProject(project, false));
  assert.deepEqual(saved.diagrams[0].elements[1].borderAnchor, { fx: 0, fy: 0.5 });
  assert.equal(saved.diagrams[0].elements[1].referenceKind, undefined);
  assert.equal(saved.models.mr.referenceKind, 'entry');
}

{
  const packageOptions = {
    diagramTypes: ['package'],
    elementKinds: ['model', 'package', 'subsystem'],
    relationKinds: ['containment', 'dependency'],
  };
  const models = {
    root: { id: 'root', kind: 'model', name: 'UML Studio', visibility: 'public' },
    child: { id: 'child', kind: 'package', name: 'application', visibility: 'protected' },
    ownership: { id: 'ownership', kind: 'containment', name: '' },
  };
  const project = {
    version: 21, models, activeId: 'packages',
    diagrams: [{
      id: 'packages', type: 'package', name: 'Architecture Packages',
      elements: [
        { id: 'rootView', modelId: 'root', x: 20, y: 20, w: 720, h: 520 },
        { id: 'childView', modelId: 'child', parentId: 'rootView', x: 80, y: 120, w: 320, h: 240 },
      ],
      relations: [
        { id: 'ownershipView', modelId: 'ownership', from: 'childView', to: 'rootView' },
      ],
    }],
  };
  assert.equal(validateProjectData(project, packageOptions), true);
  hydrateProject(project.diagrams, models, nextId);
  assert.equal(project.diagrams[0].elements[1].visibility, 'protected');
  const saved = JSON.parse(stringifyProject(project, false));
  assert.equal(saved.diagrams[0].elements[1].visibility, undefined);
  assert.equal(saved.models.child.visibility, 'protected');

  const unsupported = JSON.parse(stringifyProject(project, false));
  unsupported.version = 31;
  assert.throws(() => validateProjectData(unsupported, packageOptions), /지원하지 않는 프로젝트 버전/);
}

{
  const profileOptions = {
    diagramTypes: ['profile'],
    elementKinds: ['metaclass', 'stereotype'],
    relationKinds: ['extension'],
  };
  const models = {
    meta: { id: 'meta', kind: 'metaclass', name: 'Class', visibility: 'public' },
    stereo: {
      id: 'stereo', kind: 'stereotype', name: 'Entity', visibility: 'public',
      attributes: ['+ tableName: String'], operations: [],
      iconContent: '!icon 40 40\ne 6 8 34 30',
    },
    extension: { id: 'extension', kind: 'extension', name: '', isRequired: true },
  };
  const project = {
    version: 22, models, activeId: 'profile',
    diagrams: [{
      id: 'profile', type: 'profile', name: 'Domain Profile',
      elements: [
        { id: 'metaView', modelId: 'meta', x: 500, y: 80, w: 220, h: 72 },
        { id: 'stereoView', modelId: 'stereo', x: 40, y: 80, w: 260, h: 160 },
      ],
      relations: [
        { id: 'extensionView', modelId: 'extension', from: 'stereoView', to: 'metaView' },
      ],
    }],
  };
  assert.equal(validateProjectData(project, profileOptions), true);
  hydrateProject(project.diagrams, models, nextId);
  assert.match(project.diagrams[0].elements[1].iconContent, /^!icon/);
  assert.equal(project.diagrams[0].relations[0].isRequired, true);
  const saved = JSON.parse(stringifyProject(project, false));
  assert.equal(saved.diagrams[0].elements[1].iconContent, undefined);
  assert.match(saved.models.stereo.iconContent, /^!icon/);
  assert.equal(saved.models.extension.isRequired, true);
}

{
  const interactionOptions = {
    diagramTypes: ['interactionoverview', 'sequence'],
    elementKinds: ['interactionuse', 'interactioninline', 'lifeline'],
    relationKinds: ['controlflow'],
  };
  const models = {
    use: { id: 'use', kind: 'interactionuse', name: 'Authorize', interactionDiagramId: 'sequence' },
    inline: { id: 'inline', kind: 'interactioninline', name: 'Authorize', interactionDiagramId: 'sequence' },
    life: { id: 'life', kind: 'lifeline', name: ':Gateway' },
  };
  const project = {
    version: 23, models, activeId: 'overview',
    diagrams: [
      {
        id: 'overview', type: 'interactionoverview', name: 'Checkout Overview', relations: [],
        elements: [
          { id: 'useView', modelId: 'use', x: 40, y: 80, w: 200, h: 60 },
          { id: 'inlineView', modelId: 'inline', x: 320, y: 40, w: 400, h: 240 },
        ],
      },
      {
        id: 'sequence', type: 'sequence', name: 'Authorize', relations: [],
        elements: [{ id: 'lifeView', modelId: 'life', x: 80, y: 32, w: 100, h: 40 }],
      },
    ],
  };
  assert.equal(validateProjectData(project, interactionOptions), true);
  hydrateProject(project.diagrams, models, nextId);
  assert.equal(project.diagrams[0].elements[1].interactionDiagramId, 'sequence');
  const saved = JSON.parse(stringifyProject(project, false));
  assert.equal(saved.diagrams[0].elements[1].interactionDiagramId, undefined);
  assert.equal(saved.models.inline.interactionDiagramId, 'sequence');
  saved.models.inline.interactionDiagramId = 'missing';
  assert.throws(() => validateProjectData(saved, interactionOptions), /Sequence Diagram 참조/);
}

{
  const objectOptions = {
    diagramTypes: ['object'],
    elementKinds: ['object'],
    relationKinds: ['link'],
  };
  const models = {
    mc: { id: 'mc', kind: 'class', name: 'User' },
    mo: { id: 'mo', kind: 'object', name: 'alice', classifierModelId: 'mc', slots: ['+ id: Integer = 1'] },
  };
  const project = {
    version: 15, models, activeId: 'od1',
    diagrams: [{ id: 'od1', type: 'object', name: 'Objects', relations: [], elements: [{ id: 'vo', modelId: 'mo', x: 10, y: 10, w: 160, h: 64 }] }],
  };
  assert.equal(validateProjectData(project, objectOptions), true);
  hydrateProject(project.diagrams, models, nextId);
  assert.equal(project.diagrams[0].elements[0].classifierModelId, 'mc');
  assert.deepEqual(project.diagrams[0].elements[0].slots, ['+ id: Integer = 1']);
  const saved = JSON.parse(stringifyProject(project, false));
  assert.equal(saved.diagrams[0].elements[0].classifierModelId, undefined);
  assert.equal(saved.models.mo.classifierModelId, 'mc');
  assert.deepEqual(saved.models.mo.slots, ['+ id: Integer = 1']);
}

{
  const communicationOptions = {
    diagramTypes: ['communication'],
    elementKinds: ['lifeline'],
    relationKinds: ['commconnector', 'comm-forward'],
  };
  const models = {
    l1: { id: 'l1', kind: 'lifeline', name: 'client' },
    l2: { id: 'l2', kind: 'lifeline', name: 'server' },
    c1: { id: 'c1', kind: 'commconnector', name: '' },
    m1: { id: 'm1', kind: 'comm-forward', name: 'request()', seqNo: '1.1', messageSort: 'asynchCall' },
  };
  const project = {
    version: 17, models, activeId: 'co1',
    diagrams: [{
      id: 'co1', type: 'communication', name: 'Communication',
      elements: [
        { id: 'vl1', modelId: 'l1', x: 20, y: 20, w: 120, h: 48 },
        { id: 'vl2', modelId: 'l2', x: 280, y: 160, w: 120, h: 48 },
      ],
      relations: [
        { id: 'vc1', modelId: 'c1', from: 'vl1', to: 'vl2' },
        { id: 'vm1', modelId: 'm1', from: 'vl1', to: 'vl2', connectorId: 'vc1' },
      ],
    }],
  };
  assert.equal(validateProjectData(project, communicationOptions), true);
  hydrateProject(project.diagrams, models, nextId);
  assert.equal(project.diagrams[0].relations[1].messageSort, 'asynchCall');
  assert.equal(project.diagrams[0].relations[1].connectorId, 'vc1');
  const saved = JSON.parse(stringifyProject(project, false));
  assert.equal(saved.diagrams[0].relations[1].messageSort, undefined);
  assert.equal(saved.diagrams[0].relations[1].connectorId, 'vc1');
  assert.equal(saved.models.m1.messageSort, 'asynchCall');

  const broken = JSON.parse(stringifyProject(project, false));
  broken.diagrams[0].relations[1].connectorId = 'missing';
  assert.throws(() => validateProjectData(broken, communicationOptions), /Connector를 찾을 수 없습니다/);
}

{
  const compositeOptions = {
    diagramTypes: ['composite'],
    elementKinds: ['class', 'collaboration', 'part', 'port', 'collaborationuse'],
    relationKinds: ['csconnector', 'rolebinding'],
  };
  const models = {
    owner: { id: 'owner', kind: 'class', name: 'Editor' },
    type: { id: 'type', kind: 'class', name: 'Canvas' },
    iface: { id: 'iface', kind: 'interface', name: 'Drawable' },
    collab: { id: 'collab', kind: 'collaboration', name: 'Rendering' },
    part: { id: 'part', kind: 'part', name: 'canvas', classifierModelId: 'type' },
    port: {
      id: 'port', kind: 'port', name: 'draw', classifierModelId: 'iface',
      providedInterfaceModelId: 'iface', requiredInterfaceModelId: '',
    },
    use: { id: 'use', kind: 'collaborationuse', name: 'rendering', collaborationModelId: 'collab' },
  };
  const project = {
    version: 18, models, activeId: 'cs1',
    diagrams: [{
      id: 'cs1', type: 'composite', name: 'Composite Structure', relations: [],
      elements: [
        { id: 'ownerView', modelId: 'owner', x: 0, y: 0, w: 600, h: 400 },
        { id: 'collabView', modelId: 'collab', x: 700, y: 0, w: 300, h: 220 },
        { id: 'partView', modelId: 'part', parentId: 'ownerView', x: 80, y: 120, w: 180, h: 72 },
        {
          id: 'portView', modelId: 'port', parentId: 'partView',
          borderAnchor: { fx: 1, fy: 0.5 }, x: 251, y: 147, w: 18, h: 18,
        },
        { id: 'useView', modelId: 'use', parentId: 'ownerView', x: 320, y: 120, w: 200, h: 80 },
      ],
    }],
  };
  assert.equal(validateProjectData(project, compositeOptions), true);
  hydrateProject(project.diagrams, models, nextId);
  const port = project.diagrams[0].elements[3];
  assert.equal(port.classifierModelId, 'iface');
  assert.equal(port.providedInterfaceModelId, 'iface');
  assert.deepEqual(port.borderAnchor, { fx: 1, fy: 0.5 });
  const use = project.diagrams[0].elements[4];
  assert.equal(use.collaborationModelId, 'collab');
  const saved = JSON.parse(stringifyProject(project, false));
  assert.equal(saved.diagrams[0].elements[3].providedInterfaceModelId, undefined);
  assert.equal(saved.models.port.providedInterfaceModelId, 'iface');
  assert.equal(saved.models.use.collaborationModelId, 'collab');
}

{
  const timingOptions = {
    diagramTypes: ['timing'],
    elementKinds: ['lifeline', 'timingstate', 'timesegment', 'timetick', 'timeconstraint', 'durationconstraint'],
    relationKinds: ['timingmessage'],
  };
  const models = {
    classifier: { id: 'classifier', kind: 'component', name: 'Renderer' },
    lifeline: { id: 'lifeline', kind: 'lifeline', name: 'renderer', classifierModelId: 'classifier' },
    state: { id: 'state', kind: 'timingstate', name: 'Rendering' },
    segment: { id: 'segment', kind: 'timesegment', name: '', startTime: '20 ms', endTime: '60 ms' },
    tick: { id: 'tick', kind: 'timetick', name: 'tick20', timeValue: '20 ms' },
    timeConstraint: { id: 'timeConstraint', kind: 'timeconstraint', name: 'start', constraint: '{t = 20 ms}' },
    duration: { id: 'duration', kind: 'durationconstraint', name: 'duration', constraint: '{20 ms..60 ms}' },
    message: { id: 'message', kind: 'timingmessage', name: 'render()', messageSort: 'synchCall' },
  };
  const project = {
    version: 19, models, activeId: 'timing',
    diagrams: [{
      id: 'timing', type: 'timing', name: 'Frame Timing',
      elements: [
        { id: 'lifelineView', modelId: 'lifeline', x: 20, y: 20, w: 900, h: 132 },
        { id: 'stateView', modelId: 'state', parentId: 'lifelineView', stateOrder: 0, x: 20, y: 64, w: 900, h: 44 },
        { id: 'segmentView', modelId: 'segment', parentId: 'stateView', x: 240, y: 80, w: 240, h: 10 },
        { id: 'tickView', modelId: 'tick', x: 236, y: 20, w: 8, h: 180 },
        { id: 'constraintView', modelId: 'timeConstraint', constrainedViewId: 'segmentView', x: 300, y: 40, w: 120, h: 28 },
        { id: 'durationView', modelId: 'duration', x: 240, y: 220, w: 240, h: 32 },
      ],
      relations: [
        { id: 'messageView', modelId: 'message', from: 'segmentView', to: 'segmentView' },
      ],
    }],
  };
  assert.equal(validateProjectData(project, timingOptions), true);
  hydrateProject(project.diagrams, models, nextId);
  const segment = project.diagrams[0].elements[2];
  assert.equal(segment.startTime, '20 ms');
  assert.equal(segment.endTime, '60 ms');
  assert.equal(project.diagrams[0].elements[4].constraint, '{t = 20 ms}');
  const saved = JSON.parse(stringifyProject(project, false));
  assert.equal(saved.diagrams[0].elements[2].startTime, undefined);
  assert.equal(saved.models.segment.startTime, '20 ms');
  assert.equal(saved.diagrams[0].elements[4].constrainedViewId, 'segmentView');
  assert.equal(saved.models.timeConstraint.constraint, '{t = 20 ms}');

  saved.diagrams[0].elements[4].constrainedViewId = 'missing';
  assert.throws(() => validateProjectData(saved, timingOptions), /Time Constraint의 연결 대상/);
}

{
  const informationFlowOptions = {
    diagramTypes: ['informationflow'],
    elementKinds: ['component', 'class', 'informationitem'],
    relationKinds: ['informationflow'],
  };
  const models = {
    editor: { id: 'editor', kind: 'component', name: 'DiagramEditor' },
    canvas: { id: 'canvas', kind: 'class', name: 'CanvasView', attributes: [], operations: [] },
    document: {
      id: 'document', kind: 'informationitem', name: 'DiagramDocument',
      visibility: 'public', stereotype: 'information',
      attributes: ['+ diagrams: Diagram[*]'], operations: ['+ validate(): Boolean'], receptions: ['documentLoaded'],
    },
    flow: {
      id: 'flow', kind: 'informationflow', name: 'load',
      conveyedModelIds: ['document'], fromModelId: 'editor', toModelId: 'canvas',
    },
  };
  const project = {
    version: 24, models, activeId: 'information',
    diagrams: [{
      id: 'information', type: 'informationflow', name: 'Rendering Information Flow',
      elements: [
        { id: 'editorView', modelId: 'editor', x: 20, y: 40, w: 180, h: 72 },
        { id: 'canvasView', modelId: 'canvas', x: 420, y: 40, w: 180, h: 96 },
        { id: 'documentView', modelId: 'document', x: 220, y: 240, w: 220, h: 112 },
      ],
      relations: [{ id: 'flowView', modelId: 'flow', from: 'editorView', to: 'canvasView' }],
    }],
  };
  assert.equal(validateProjectData(project, informationFlowOptions), true);
  hydrateProject(project.diagrams, models, nextId);
  assert.deepEqual(project.diagrams[0].elements[2].receptions, ['documentLoaded']);
  assert.deepEqual(project.diagrams[0].relations[0].conveyedModelIds, ['document']);
  const saved = JSON.parse(stringifyProject(project, false));
  assert.equal(saved.diagrams[0].elements[2].receptions, undefined);
  assert.deepEqual(saved.models.document.receptions, ['documentLoaded']);
  assert.deepEqual(saved.models.flow.conveyedModelIds, ['document']);

  saved.models.flow.conveyedModelIds = ['missing'];
  assert.throws(() => validateProjectData(saved, informationFlowOptions), /conveyed 참조/);
}

{
  const requirementOptions = {
    diagramTypes: ['requirement'],
    elementKinds: ['requirement', 'component'],
    relationKinds: ['satisfy'],
  };
  const models = {
    requirement: {
      id: 'requirement', kind: 'requirement', name: 'Render Within Budget',
      visibility: 'public', requirementType: 'performanceRequirement',
      requirementId: 'REQ-RND-020',
      requirementText: 'The system shall render within 100 milliseconds.',
      risk: 'Medium', verificationMethod: 'Analysis',
    },
    renderer: { id: 'renderer', kind: 'component', name: 'RenderEngine' },
    satisfy: { id: 'satisfy', kind: 'satisfy', name: '' },
  };
  const project = {
    version: 25, models, activeId: 'requirements',
    diagrams: [{
      id: 'requirements', type: 'requirement', name: 'Rendering Requirements',
      elements: [
        { id: 'requirementView', modelId: 'requirement', x: 320, y: 40, w: 320, h: 160 },
        { id: 'rendererView', modelId: 'renderer', x: 320, y: 320, w: 224, h: 88 },
      ],
      relations: [
        { id: 'satisfyView', modelId: 'satisfy', from: 'rendererView', to: 'requirementView' },
      ],
    }],
  };
  assert.equal(validateProjectData(project, requirementOptions), true);
  hydrateProject(project.diagrams, models, nextId);
  const requirement = project.diagrams[0].elements[0];
  assert.equal(requirement.requirementType, 'performanceRequirement');
  assert.equal(requirement.requirementId, 'REQ-RND-020');
  assert.equal(requirement.requirementText, 'The system shall render within 100 milliseconds.');
  assert.equal(requirement.risk, 'Medium');
  assert.equal(requirement.verificationMethod, 'Analysis');
  const saved = JSON.parse(stringifyProject(project, false));
  assert.equal(saved.diagrams[0].elements[0].requirementId, undefined);
  assert.equal(saved.models.requirement.requirementId, 'REQ-RND-020');
  assert.equal(saved.models.requirement.verificationMethod, 'Analysis');
}

{
  const bddOptions = {
    diagramTypes: ['bdd'],
    elementKinds: ['block', 'valuetype', 'interfaceblock', 'constraintblock', 'port'],
    relationKinds: ['composition', 'connector'],
  };
  const models = {
    system: {
      id: 'system', kind: 'block', name: 'Rendering System', visibility: 'public',
      parts: ['renderer: Rendering Engine [1]'], references: [], values: ['budget: Milliseconds = 100'],
      flowProperties: ['in document: DiagramDocument'], constraintProperties: ['rule: Render Budget'],
      properties: [], constraints: ['{ renderTime <= budget }'], constraintParameters: [],
      operations: ['+ render(): void'], receptions: [],
    },
    milliseconds: {
      id: 'milliseconds', kind: 'valuetype', name: 'Milliseconds', visibility: 'public',
      valueTypeUnit: 'ms', quantityKind: 'Time', properties: ['+ value: Real'],
      constraints: ['{ value >= 0 }'], operations: [], receptions: [],
    },
    api: {
      id: 'api', kind: 'interfaceblock', name: 'IRendering', visibility: 'public',
      flowProperties: ['in document: DiagramDocument'], operations: ['+ render(): void'],
    },
    port: {
      id: 'port', kind: 'port', name: 'render', classifierModelId: 'api',
      providedInterfaceModelId: 'api', requiredInterfaceModelId: '',
    },
    composition: { id: 'composition', kind: 'composition', name: 'renderer' },
  };
  const project = {
    version: 26, models, activeId: 'bdd',
    diagrams: [{
      id: 'bdd', type: 'bdd', name: 'Rendering BDD',
      elements: [
        { id: 'systemView', modelId: 'system', x: 40, y: 40, w: 320, h: 240 },
        { id: 'valueView', modelId: 'milliseconds', x: 40, y: 400, w: 240, h: 120 },
        { id: 'apiView', modelId: 'api', x: 520, y: 40, w: 280, h: 160 },
        {
          id: 'portView', modelId: 'port', parentId: 'systemView',
          borderAnchor: { fx: 1, fy: 0.5 }, x: 351, y: 140, w: 18, h: 18,
        },
      ],
      relations: [
        { id: 'compositionView', modelId: 'composition', from: 'valueView', to: 'systemView' },
      ],
    }],
  };
  assert.equal(validateProjectData(project, bddOptions), true);
  hydrateProject(project.diagrams, models, nextId);
  const system = project.diagrams[0].elements[0];
  assert.deepEqual(system.parts, ['renderer: Rendering Engine [1]']);
  assert.deepEqual(system.flowProperties, ['in document: DiagramDocument']);
  assert.equal(project.diagrams[0].elements[1].valueTypeUnit, 'ms');
  const saved = JSON.parse(stringifyProject(project, false));
  assert.equal(saved.diagrams[0].elements[0].parts, undefined);
  assert.deepEqual(saved.models.system.constraintProperties, ['rule: Render Budget']);
  assert.equal(saved.models.milliseconds.quantityKind, 'Time');
  assert.equal(saved.models.port.classifierModelId, 'api');
}

{
  const ibdOptions = {
    diagramTypes: ['ibd'],
    elementKinds: ['ibdframe', 'part', 'reference', 'value', 'port'],
    relationKinds: ['connector'],
  };
  const models = {
    system: { id: 'system', kind: 'block', name: 'Rendering System' },
    engine: { id: 'engine', kind: 'block', name: 'Rendering Engine' },
    frameType: { id: 'frameType', kind: 'valuetype', name: 'RenderedFrame' },
    frame: { id: 'frame', kind: 'ibdframe', name: 'Internal Structure', classifierModelId: 'system' },
    renderer: { id: 'renderer', kind: 'part', name: 'renderer', classifierModelId: 'engine' },
    output: { id: 'output', kind: 'port', name: 'frame', classifierModelId: 'frameType' },
    connector: {
      id: 'connector', kind: 'connector', name: 'rendered image',
      itemFlowModelIds: ['frameType'],
    },
  };
  const project = {
    version: 27, models, activeId: 'ibd',
    diagrams: [{
      id: 'ibd', type: 'ibd', name: 'Rendering IBD',
      elements: [
        { id: 'frameView', modelId: 'frame', x: 40, y: 40, w: 900, h: 640 },
        { id: 'rendererView', modelId: 'renderer', parentId: 'frameView', x: 160, y: 180, w: 200, h: 80 },
        {
          id: 'outputView', modelId: 'output', parentId: 'rendererView',
          borderAnchor: { fx: 1, fy: 0.5 }, x: 351, y: 210, w: 18, h: 18,
        },
      ],
      relations: [
        { id: 'connectorView', modelId: 'connector', from: 'rendererView', to: 'outputView' },
      ],
    }],
  };
  assert.equal(validateProjectData(project, ibdOptions), true);
  hydrateProject(project.diagrams, models, nextId);
  assert.equal(project.diagrams[0].elements[0].classifierModelId, 'system');
  assert.deepEqual(project.diagrams[0].relations[0].itemFlowModelIds, ['frameType']);
  const saved = JSON.parse(stringifyProject(project, false));
  assert.equal(saved.diagrams[0].relations[0].itemFlowModelIds, undefined);
  assert.deepEqual(saved.models.connector.itemFlowModelIds, ['frameType']);
}

{
  const parametricOptions = {
    diagramTypes: ['parametric'],
    elementKinds: ['parametricframe', 'constraintproperty', 'constraintparameter', 'value'],
    relationKinds: ['bindingconnector'],
  };
  const models = {
    ruleType: {
      id: 'ruleType', kind: 'constraintblock', name: 'Render Budget',
      constraints: ['{ renderTime <= frameBudget }'],
      constraintParameters: ['renderTime: Milliseconds', 'frameBudget: Milliseconds'],
    },
    milliseconds: { id: 'milliseconds', kind: 'valuetype', name: 'Milliseconds' },
    frame: {
      id: 'frame', kind: 'parametricframe', name: 'Analysis',
      classifierModelId: 'ruleType',
    },
    rule: {
      id: 'rule', kind: 'constraintproperty', name: 'budget',
      classifierModelId: 'ruleType',
    },
    parameter: {
      id: 'parameter', kind: 'constraintparameter', name: 'renderTime',
      classifierModelId: 'milliseconds',
    },
    value: {
      id: 'value', kind: 'value', name: 'actualRenderTime',
      classifierModelId: 'milliseconds', defaultValue: '42 ms',
    },
    binding: { id: 'binding', kind: 'bindingconnector', name: '' },
  };
  const project = {
    version: 30, models, activeId: 'parametric',
    diagrams: [{
      id: 'parametric', type: 'parametric', name: 'Render Budget Analysis',
      elements: [
        { id: 'frameView', modelId: 'frame', x: 40, y: 40, w: 900, h: 640 },
        { id: 'ruleView', modelId: 'rule', parentId: 'frameView', x: 320, y: 200, w: 300, h: 160 },
        {
          id: 'parameterView', modelId: 'parameter', parentId: 'ruleView',
          borderAnchor: { fx: 0, fy: 0.5 }, x: 311, y: 270, w: 18, h: 18,
        },
        { id: 'valueView', modelId: 'value', parentId: 'frameView', x: 80, y: 240, w: 200, h: 80 },
      ],
      relations: [
        {
          id: 'bindingView', modelId: 'binding', from: 'valueView', to: 'parameterView',
          routeMode: 'manual', manualPoints: [{ x: 296, y: 280 }, { x: 304, y: 280 }],
          jumpStyle: 'gap',
        },
      ],
    }],
  };
  assert.equal(validateProjectData(project, parametricOptions), true);
  hydrateProject(project.diagrams, models, nextId);
  assert.equal(project.diagrams[0].elements[0].classifierModelId, 'ruleType');
  assert.equal(project.diagrams[0].elements[3].defaultValue, '42 ms');
  const saved = JSON.parse(stringifyProject(project, false));
  assert.equal(saved.diagrams[0].elements[3].defaultValue, undefined);
  assert.equal(saved.models.value.defaultValue, '42 ms');
  assert.equal(saved.diagrams[0].relations[0].routeMode, 'manual');
  assert.equal(saved.diagrams[0].relations[0].jumpStyle, 'gap');
  assert.deepEqual(saved.diagrams[0].relations[0].manualPoints, [
    { x: 296, y: 280 }, { x: 304, y: 280 },
  ]);
  saved.diagrams[0].relations[0].manualPoints = [{ x: Infinity, y: 280 }];
  assert.throws(() => validateProjectData(saved, parametricOptions), /수동 라우팅 굴곡점/);
  saved.diagrams[0].relations[0].manualPoints = [];
  saved.diagrams[0].relations[0].jumpStyle = 'invalid';
  assert.throws(() => validateProjectData(saved, parametricOptions), /Line Jump 스타일/);
}

{
  const endOptions = {
    diagramTypes: ['class'], elementKinds: ['class'], relationKinds: ['association'],
  };
  const models = {
    customer: { id: 'customer', kind: 'class', name: 'Customer' },
    order: { id: 'order', kind: 'class', name: 'Order' },
    owns: {
      id: 'owns', kind: 'association', name: 'owns',
      sourceLabel: '1', targetLabel: '0..*',
      sourceEndName: 'customer', sourceEndVisibility: 'public',
      sourceNavigability: 'notNavigable', sourceAggregation: 'none',
      targetEndName: 'orders', targetEndStereotype: 'collection',
      targetNavigability: 'navigable', targetAggregation: 'composite',
      targetQualifiers: ['id: UUID'],
    },
  };
  const project = {
    version: 30, models, activeId: 'ends',
    diagrams: [{
      id: 'ends', type: 'class', name: 'Relationship Ends',
      elements: [
        { id: 'customerView', modelId: 'customer', x: 0, y: 0 },
        { id: 'orderView', modelId: 'order', x: 260, y: 0 },
      ],
      relations: [{ id: 'ownsView', modelId: 'owns', from: 'customerView', to: 'orderView' }],
    }],
  };
  assert.equal(validateProjectData(project, endOptions), true);
  hydrateProject(project.diagrams, models, nextId);
  assert.equal(project.diagrams[0].relations[0].targetAggregation, 'composite');
  assert.deepEqual(project.diagrams[0].relations[0].targetQualifiers, ['id: UUID']);
  const saved = JSON.parse(stringifyProject(project, false));
  assert.equal(saved.diagrams[0].relations[0].targetEndName, undefined);
  assert.equal(saved.models.owns.targetEndName, 'orders');
  assert.deepEqual(saved.models.owns.targetQualifiers, ['id: UUID']);

  saved.models.owns.targetNavigability = 'sideways';
  assert.throws(() => validateProjectData(saved, endOptions), /끝점 탐색 방향/);
  saved.models.owns.targetNavigability = 'navigable';
  saved.models.owns.targetQualifiers = new Array(51).fill('id: UUID');
  assert.throws(() => validateProjectData(saved, endOptions), /끝점 한정자/);
}

{
  const erdOptions = {
    diagramTypes: ['erd'], elementKinds: ['entity'], relationKinds: ['erd-1n'],
  };
  const project = {
    version: 30,
    models: {
      posts: {
        id: 'posts', kind: 'entity', name: 'posts', columns: ['FK user_id: BIGINT'],
        erdColumnDetails: { user_id: { defaultValue: '0' } },
        erdChecks: [{ name: 'user_positive', expression: 'user_id > 0', column: 'user_id' }],
        erdIndexes: [{ kind: 'index', name: 'user_idx', columns: ['user_id'] }],
      },
      users: { id: 'users', kind: 'entity', name: 'users', columns: ['PK id: BIGINT'] },
      writes: {
        id: 'writes', kind: 'erd-1n', name: 'writes', foreignKeyEnd: 'source',
        sourceColumnName: 'user_id', targetColumnName: 'id',
        foreignKeyOnDelete: 'CASCADE', foreignKeyOnUpdate: 'RESTRICT',
      },
    },
    diagrams: [{
      id: 'erd', type: 'erd', name: 'ERD',
      elements: [
        { id: 'postsView', modelId: 'posts' }, { id: 'usersView', modelId: 'users' },
      ],
      relations: [{ id: 'writesView', modelId: 'writes', from: 'postsView', to: 'usersView' }],
    }],
  };
  assert.equal(validateProjectData(project, erdOptions), true);
  hydrateProject(project.diagrams, project.models, nextId);
  assert.equal(project.diagrams[0].relations[0].sourceColumnName, 'user_id');
  assert.equal(project.diagrams[0].relations[0].foreignKeyOnDelete, 'CASCADE');
  const saved = JSON.parse(stringifyProject(project, false));
  assert.equal(saved.diagrams[0].relations[0].foreignKeyEnd, undefined);
  assert.equal(saved.models.writes.foreignKeyEnd, 'source');
  assert.equal(saved.models.writes.foreignKeyOnUpdate, 'RESTRICT');
  assert.equal(saved.models.posts.erdChecks[0].expression, 'user_id > 0');
  saved.models.writes.foreignKeyEnd = 'left';
  assert.throws(() => validateProjectData(saved, erdOptions), /FK 보유 끝점/);
  saved.models.writes.foreignKeyEnd = 'source';
  saved.models.writes.sourceColumnName = 123;
  assert.throws(() => validateProjectData(saved, erdOptions), /FK 컬럼 이름/);
  saved.models.writes.sourceColumnName = 'user_id';
  saved.models.writes.foreignKeyOnDelete = 'DELETE ALL';
  assert.throws(() => validateProjectData(saved, erdOptions), /FK 참조 동작/);
  saved.models.writes.foreignKeyOnDelete = 'CASCADE';
  saved.models.posts.erdChecks[0].expression = '1; DROP TABLE users';
  assert.throws(() => validateProjectData(saved, erdOptions), /SQL 문장 구분자/);
}

console.log('model-core tests: ok');
