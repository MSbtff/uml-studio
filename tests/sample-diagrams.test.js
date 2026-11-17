'use strict';

const assert = require('node:assert/strict');
const {
  REQUIRED_FUNCTIONS,
  REQUIRED_VALUES,
  create,
} = require('../dist/browser/model/sample-diagrams.js');

const BDD_CLASSIFIER_KINDS = new Set(['block', 'valuetype', 'interfaceblock', 'constraintblock']);
const FILL_DEFAULT = '#fffbd8';

/* A miniature of app.js' model repository: every view gets a model, and the
   sample linkers rewrite those modelIds so one sample reuses another's model. */
function harness() {
  let idSeq = 1;
  const state = {
    projectId: '', projectName: '', models: {}, diagrams: [], activeId: null,
    selection: [], selectedId: null,
  };
  const uid = () => 'e' + (idSeq++);
  const modelUid = () => 'm' + (idSeq++);
  const hydrateView = view => {
    if (!view.modelId) {
      const model = { id: modelUid(), kind: view.kind, name: view.name || '' };
      state.models[model.id] = model;
      view.modelId = model.id;
    }
    return view;
  };
  const syncRelationModel = (relation, diagram) => {
    const model = state.models[relation.modelId];
    if (!model || !diagram) return;
    const from = diagram.elements.find(e => e.id === relation.from);
    const to = diagram.elements.find(e => e.id === relation.to);
    model.fromModelId = from ? from.modelId : null;
    model.toModelId = to ? to.modelId : null;
  };
  const deps = {
    cleanProjectName: value => String(value || '').trim().slice(0, 200) || 'Untitled Project',
    hydrateCurrentProject() {
      state.diagrams.forEach(diagram => {
        diagram.elements.forEach(hydrateView);
        diagram.relations.forEach(hydrateView);
        diagram.relations.forEach(relation => syncRelationModel(relation, diagram));
      });
    },
    projectUid: () => 'p-test',
    setSelection: ids => { state.selection = ids; state.selectedId = ids.length === 1 ? ids[0] : null; },
    syncRelationModel,
    uid,
    state,
    BDD_CLASSIFIER_KINDS,
    FILL_DEFAULT,
  };
  return { state, deps, samples: create(deps) };
}

assert.ok(Object.isFrozen(REQUIRED_FUNCTIONS));
assert.ok(Object.isFrozen(REQUIRED_VALUES));

/* 의존성 누락은 초기화 시점에 명확한 오류를 낸다 */
assert.throws(() => create(), /Sample Diagrams 의존성이 없습니다/);
assert.throws(() => create({}), /uid/);
{
  const { deps } = harness();
  const { state: _state, ...withoutState } = deps;
  assert.throws(() => create(withoutState), /state/);
  assert.throws(() => create({ ...deps, state: { diagrams: null } }), /state\.diagrams/);
  assert.throws(() => create({ ...deps, BDD_CLASSIFIER_KINDS: {} }), /BDD_CLASSIFIER_KINDS\.has/);
}

const { state, samples } = harness();
assert.ok(Object.isFrozen(samples));

/* ── 개별 샘플 빌더 ─────────────────────────────────────────── */
const klass = samples.sampleClass();
assert.equal(klass.type, 'class');
assert.equal(klass.name, 'Class Diagram');
assert.ok(klass.elements.some(e => e.kind === 'interface' && e.name === 'Drawable'));
assert.ok(klass.elements.every(e => e.id && typeof e.fill === 'string'));
assert.ok(klass.relations.some(r => r.kind === 'realization'));
assert.equal(klass.elements.find(e => e.kind === 'class' && e.name === 'Shape').fill, FILL_DEFAULT);

assert.equal(samples.sampleActivity().name, 'Activity Diagram');
assert.equal(samples.sampleActivity('Advanced Activity Workflow').name, 'Advanced Activity Workflow');

const [checkout, payment] = samples.sampleSubmachineStatePair();
assert.equal(checkout.name, 'Checkout State Machine');
const submachineState = checkout.elements.find(e => e.kind === 'submachinestate');
assert.equal(submachineState.submachineDiagramId, payment.id,
  'Submachine State는 짝이 되는 다이어그램 id를 참조해야 합니다');

const sequence = samples.sampleSequence();
const [overview, inlineSequence] = samples.sampleInteractionOverviewPair(sequence);
assert.equal(overview.type, 'interactionoverview');
assert.equal(inlineSequence.name, 'Authorize Payment');
assert.ok(overview.elements.some(e => e.kind === 'interactionuse' && e.interactionDiagramId === sequence.id));
assert.ok(overview.elements.some(e => e.kind === 'interactioninline' && e.interactionDiagramId === inlineSequence.id));

for (const [builder, type] of [
  ['samplePackage', 'package'], ['sampleProfile', 'profile'], ['sampleUseCase', 'usecase'],
  ['sampleState', 'state'], ['sampleCompositeState', 'state'], ['sampleComponent', 'component'],
  ['sampleDeployment', 'deployment'], ['sampleERD', 'erd'], ['sampleDFD', 'dfd'],
  ['sampleMindmap', 'mindmap'], ['sampleObject', 'object'], ['sampleCommunication', 'communication'],
  ['sampleCompositeStructure', 'composite'], ['sampleTiming', 'timing'],
  ['sampleInformationFlow', 'informationflow'], ['sampleRequirement', 'requirement'],
  ['sampleBlockDefinition', 'bdd'], ['sampleInternalBlock', 'ibd'], ['sampleParametric', 'parametric'],
]) {
  const diagram = samples[builder]();
  assert.equal(diagram.type, type, `${builder}는 ${type} 다이어그램이어야 합니다`);
  assert.ok(diagram.id && diagram.name, `${builder}에 id와 이름이 필요합니다`);
  assert.ok(Array.isArray(diagram.elements) && Array.isArray(diagram.relations));
  const viewIds = new Set(diagram.elements.map(e => e.id));
  diagram.relations.forEach(relation => {
    assert.ok(viewIds.has(relation.from), `${builder} 관계의 from은 요소여야 합니다`);
    assert.ok(viewIds.has(relation.to), `${builder} 관계의 to는 요소여야 합니다`);
  });
}

/* ── 전체 샘플 프로젝트 ─────────────────────────────────────── */
samples.sampleProject();
assert.equal(state.projectId, 'p-test');
assert.equal(state.projectName, 'UML Studio Samples');
assert.equal(state.diagrams.length, 26, '샘플 프로젝트 다이어그램 수는 유지되어야 합니다');
assert.equal(state.activeId, state.diagrams[0].id);
assert.equal(state.diagrams[0].type, 'class');

const allIds = state.diagrams.flatMap(d => [d.id, ...d.elements.map(v => v.id), ...d.relations.map(v => v.id)]);
assert.equal(new Set(allIds).size, allIds.length, '샘플 뷰 id는 중복되면 안 됩니다');

const byType = type => state.diagrams.filter(d => d.type === type);
assert.equal(byType('sequence').length, 2, 'Sequence 샘플과 인라인 Sequence가 모두 있어야 합니다');
assert.equal(byType('state').length, 4);

/* 샘플 사이 모델 연결: Object 인스턴스는 Class 샘플의 모델을 가리킨다 */
const objectSample = state.diagrams.find(d => d.name === 'Runtime Object Snapshot');
const canvasViewInstance = objectSample.elements.find(e => e.name === 'canvasView');
assert.ok(canvasViewInstance.classifierModelId, 'Object 인스턴스에 classifier가 연결되어야 합니다');
assert.equal(state.models[canvasViewInstance.classifierModelId].name, 'CanvasView');
assert.equal(state.models[canvasViewInstance.classifierModelId].kind, 'class');

const communicationSample = state.diagrams.find(d => d.name === 'Diagram Rendering Communication');
const editorLifeline = communicationSample.elements.find(e => e.name === 'editor');
assert.equal(state.models[editorLifeline.classifierModelId].name, 'DiagramEditor');

const timingSample = state.diagrams.find(d => d.name === 'Frame Rendering Timing');
const timingRenderer = timingSample.elements.find(e => e.kind === 'lifeline' && e.name === 'renderer');
assert.equal(state.models[timingRenderer.classifierModelId].name, 'RenderEngine');

/* IBD의 part/port는 BDD 블록 모델을 재사용한다 */
const bddSample = state.diagrams.find(d => d.type === 'bdd');
const ibdSample = state.diagrams.find(d => d.type === 'ibd');
const bddEngine = bddSample.elements.find(e => e.name === 'Rendering Engine');
const ibdRenderer = ibdSample.elements.find(e => e.name === 'renderer');
assert.equal(ibdRenderer.classifierModelId, bddEngine.modelId,
  'IBD part는 BDD Block 모델을 그대로 참조해야 합니다');
const interfaceBlock = bddSample.elements.find(e => e.kind === 'interfaceblock');
assert.ok(ibdSample.elements.filter(e => e.kind === 'port')
  .every(port => port.classifierModelId === interfaceBlock.modelId));
assert.ok(ibdSample.relations.filter(r => r.kind === 'connector')
  .every(r => Array.isArray(r.itemFlowModelIds) && !('itemFlowNames' in r)),
'connector의 itemFlowNames는 modelId로 변환되어야 합니다');

/* Parametric은 BDD의 Constraint Block / ValueType을 참조한다 */
const parametricSample = state.diagrams.find(d => d.type === 'parametric');
const renderBudget = bddSample.elements.find(e => e.name === 'Render Budget');
const milliseconds = bddSample.elements.find(e => e.name === 'Milliseconds');
assert.equal(parametricSample.elements.find(e => e.kind === 'parametricframe').classifierModelId, renderBudget.modelId);
assert.equal(parametricSample.elements.find(e => e.kind === 'constraintproperty').classifierModelId, renderBudget.modelId);
assert.ok(parametricSample.elements.filter(e => e.kind === 'constraintparameter' || e.kind === 'value')
  .every(e => e.classifierModelId === milliseconds.modelId));

/* Information Flow는 conveyedNames를 modelId로 바꾸고 앵커를 유지한다 */
const flowSample = state.diagrams.find(d => d.type === 'informationflow');
const loadFlow = flowSample.relations.find(r => r.name === 'load');
assert.deepEqual(loadFlow.srcAnchor, { fx: 1, fy: 0.3 });
assert.ok(!('conveyedNames' in loadFlow));
assert.equal(loadFlow.conveyedModelIds.length, 1);
assert.equal(state.models[loadFlow.conveyedModelIds[0]].name, 'DiagramDocument');

/* Composite Structure의 collaboration use는 collaboration 뷰 모델을 참조한다 */
const compositeSample = state.diagrams.find(d => d.type === 'composite');
const collaboration = compositeSample.elements.find(e => e.kind === 'collaboration');
const collaborationUse = compositeSample.elements.find(e => e.kind === 'collaborationuse');
assert.equal(collaborationUse.collaborationModelId, collaboration.modelId);

/* ── 오래된 프로젝트 보정(upgrade) ──────────────────────────── */
{
  const fresh = harness();
  fresh.samples.sampleProject();
  const timing = fresh.state.diagrams.find(d => d.name === 'Frame Rendering Timing');
  const constraint = timing.elements.find(e => e.name === 'renderStart');
  delete constraint.anchorRatio;
  fresh.samples.upgradeSampleTimingLayout();
  assert.equal(constraint.anchorRatio, 0, '오래된 Timing 샘플은 anchorRatio를 복구해야 합니다');

  const communication = fresh.state.diagrams.find(d => d.name === 'Diagram Rendering Communication');
  const layer = communication.elements.find(e => e.name === 'layer');
  layer.x = 440; layer.y = 432;
  communication.relations.filter(r => r.kind === 'commconnector')[0].name = 'commands';
  fresh.samples.upgradeSampleCommunicationLayout();
  assert.equal(layer.x, 280);
  assert.equal(communication.relations.filter(r => r.kind === 'commconnector')[0].name, '');

  const composite = fresh.state.diagrams.find(d => d.type === 'composite');
  const rolebinding = composite.relations.find(r => r.kind === 'rolebinding');
  rolebinding.name = ''; rolebinding.targetLabel = 'canvasRole';
  fresh.samples.upgradeSampleCompositeStructureLayout();
  assert.equal(rolebinding.name, 'canvasRole');
  assert.equal(rolebinding.targetLabel, '');

  /* 샘플이 없는 프로젝트에서도 보정 함수는 조용히 통과한다 */
  fresh.state.diagrams = [];
  assert.doesNotThrow(() => {
    fresh.samples.upgradeSampleTimingLayout();
    fresh.samples.upgradeSampleCommunicationLayout();
    fresh.samples.upgradeSampleCompositeStructureLayout();
    fresh.samples.upgradeSampleInformationFlowLayout();
    fresh.samples.linkSampleObjectClassifiers();
    fresh.samples.linkSampleBlockDefinitionModels();
    fresh.samples.reconcileTraceabilitySampleModels();
  });
}

/* ── 빈 프로젝트 ────────────────────────────────────────────── */
{
  const fresh = harness();
  fresh.state.projectName = '  My Project  ';
  fresh.samples.sampleEmpty();
  assert.equal(fresh.state.projectId, 'p-test');
  assert.equal(fresh.state.projectName, 'My Project');
  assert.deepEqual(fresh.state.models, {});
  assert.equal(fresh.state.diagrams.length, 1);
  assert.equal(fresh.state.diagrams[0].type, 'class');
  assert.equal(fresh.state.diagrams[0].name, 'Class Diagram');
  assert.deepEqual(fresh.state.diagrams[0].elements, []);
  assert.equal(fresh.state.activeId, fresh.state.diagrams[0].id);
  assert.deepEqual(fresh.state.selection, []);
}

console.log('sample diagrams tests: ok');
