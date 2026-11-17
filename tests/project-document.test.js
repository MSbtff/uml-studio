'use strict';

const assert = require('node:assert/strict');
const {
  PROJECT_VERSION,
  REQUIRED_FUNCTIONS,
  REQUIRED_VALUES,
  SAMPLE_METHODS,
  create,
} = require('../project-document.js');

const SAMPLE_TYPES = Object.freeze({
  sampleActivity: 'activity',
  sampleBlockDefinition: 'bdd',
  sampleCommunication: 'communication',
  sampleComponent: 'component',
  sampleCompositeState: 'state',
  sampleCompositeStructure: 'composite',
  sampleDFD: 'dfd',
  sampleDeployment: 'deployment',
  sampleERD: 'erd',
  sampleInformationFlow: 'informationflow',
  sampleInternalBlock: 'ibd',
  sampleMindmap: 'mindmap',
  sampleObject: 'object',
  samplePackage: 'package',
  sampleParametric: 'parametric',
  sampleProfile: 'profile',
  sampleRequirement: 'requirement',
  sampleSequence: 'sequence',
  sampleState: 'state',
  sampleTiming: 'timing',
  sampleUseCase: 'usecase',
});

function harness() {
  let idSequence = 41;
  let generatedId = 0;
  const state = {
    projectId: 'p-current',
    projectName: 'Current Project',
    models: { model: { id: 'model', kind: 'class', name: 'Model' } },
    diagrams: [{ id: 'diagram-a', type: 'class', name: 'Class', elements: [], relations: [] }],
    activeId: 'diagram-a',
  };
  const counters = { class: 2 };
  const log = {
    alerts: [],
    clearValidation: 0,
    dirty: 0,
    hydrated: [],
    markedSaved: 0,
    rendered: 0,
    resetHistory: 0,
    sampleCalls: [],
    scheduled: [],
    selections: [],
    stringified: [],
    synced: 0,
    validated: [],
  };

  const sampleDiagrams = {};
  SAMPLE_METHODS.forEach(name => {
    if (name === 'sampleSubmachineStatePair') {
      sampleDiagrams[name] = () => {
        log.sampleCalls.push(name);
        return [
          { id: 'sample-submachine-a', type: 'state', name: 'Checkout State Machine', elements: [], relations: [] },
          { id: 'sample-submachine-b', type: 'state', name: 'Payment State Machine', elements: [], relations: [] },
        ];
      };
      return;
    }
    if (name === 'sampleInteractionOverviewPair') {
      sampleDiagrams[name] = () => {
        log.sampleCalls.push(name);
        return [
          { id: 'sample-io', type: 'interactionoverview', name: 'Interaction Overview', elements: [], relations: [] },
          { id: 'sample-inline', type: 'sequence', name: 'Inline Sequence', elements: [], relations: [] },
        ];
      };
      return;
    }
    if (name.startsWith('sample')) {
      sampleDiagrams[name] = requestedName => {
        log.sampleCalls.push(name);
        return {
          id: `sample-${name}`,
          type: SAMPLE_TYPES[name],
          name: requestedName || name,
          elements: [],
          relations: [],
        };
      };
      return;
    }
    sampleDiagrams[name] = () => {
      log.sampleCalls.push(name);
    };
  });

  const dependencies = {
    alert: message => log.alerts.push(message),
    cleanProjectName: value => String(value || '').trim() || 'Untitled Project',
    clearValidationResults: () => { log.clearValidation += 1; },
    getIdSeq: () => idSequence,
    hydrateCurrentProject: models => log.hydrated.push(models),
    markDirty: () => { log.dirty += 1; },
    markSaved: () => { log.markedSaved += 1; },
    projectUid: () => 'p-generated',
    renderAll: () => { log.rendered += 1; },
    resetHistory: () => { log.resetHistory += 1; },
    scheduleRecoverySave: delay => log.scheduled.push(delay),
    setIdSeq: value => { idSequence = value; },
    setSelection: ids => log.selections.push([...ids]),
    stringifyProject(data, pretty) {
      log.stringified.push({ data, pretty });
      return JSON.stringify(data, null, pretty ? 2 : 0);
    },
    syncAllRelationModels: () => { log.synced += 1; },
    uid: () => `generated-${++generatedId}`,
    validProjectId: value => typeof value === 'string' && /^p-[a-z-]+$/.test(value),
    validateProjectData: (data, registries) => log.validated.push({ data, registries }),
    counters,
    sampleDiagrams,
    state,
    DIAGRAM_META: { class: {}, erd: {}, state: {} },
    DIAGRAM_TOOLS: {
      class: { elements: ['class'] },
      erd: { elements: ['entity'] },
    },
    REL_STYLE: { association: {}, 'erd-1n': {} },
  };

  return {
    controller: create(dependencies),
    counters,
    dependencies,
    getIdSequence: () => idSequence,
    log,
    sampleDiagrams,
    state,
  };
}

assert.equal(PROJECT_VERSION, 30);
assert.ok(Object.isFrozen(REQUIRED_FUNCTIONS));
assert.ok(Object.isFrozen(REQUIRED_VALUES));
assert.ok(Object.isFrozen(SAMPLE_METHODS));
assert.throws(() => create(), /Project Document 의존성이 없습니다:.*stringifyProject/);
{
  const h = harness();
  assert.throws(
    () => create({ ...h.dependencies, sampleDiagrams: { ...h.sampleDiagrams, sampleERD: null } }),
    /sampleDiagrams\.sampleERD/,
  );
}

{
  const h = harness();
  assert.ok(Object.isFrozen(h.controller));
  const data = h.controller.projectData();
  assert.equal(h.log.synced, 1);
  assert.deepEqual(data, {
    version: 30,
    projectId: 'p-current',
    projectName: 'Current Project',
    models: h.state.models,
    diagrams: h.state.diagrams,
    activeId: 'diagram-a',
    idSeq: 41,
    counters: h.counters,
  });

  const compact = h.controller.captureState();
  const pretty = h.controller.serialize();
  assert.equal(compact.includes('\n'), false);
  assert.equal(pretty.includes('\n'), true);
  assert.deepEqual(h.log.stringified.map(call => call.pretty), [false, true]);
}

{
  const h = harness();
  h.controller.restoreState(JSON.stringify({
    projectId: 'invalid id',
    projectName: ' Restored ',
    models: { restored: { id: 'restored', kind: 'class', name: 'Restored' } },
    diagrams: [
      { id: 'restored-a', type: 'class', name: 'A', elements: [], relations: [] },
      { id: 'restored-b', type: 'class', name: 'B', elements: [], relations: [] },
    ],
    activeId: 'missing',
    idSeq: 88,
    counters: { actor: 3 },
  }));
  assert.equal(h.getIdSequence(), 88);
  assert.deepEqual(h.counters, { actor: 3 });
  assert.equal(h.state.projectId, 'p-current', 'History 복원은 현재 프로젝트 ID를 우선 보존해야 합니다');
  assert.equal(h.state.projectName, 'Restored');
  assert.equal(h.state.activeId, 'restored-a');
  assert.deepEqual(h.log.selections, [[]]);
  assert.equal(h.log.dirty, 1);
  assert.equal(h.log.rendered, 1);
}

{
  const h = harness();
  const loaded = h.controller.load(JSON.stringify({
    version: 30,
    projectId: 'p-file',
    projectName: 'File Project',
    models: {},
    diagrams: [{ id: 'loaded', type: 'class', name: 'Loaded', elements: [], relations: [] }],
    activeId: 'loaded',
    idSeq: 12,
    counters: { class: 7 },
  }), {
    persist: false,
    projectId: 'p-option',
    projectName: ' Option Project ',
  });
  assert.equal(loaded, true);
  assert.equal(h.state.projectId, 'p-option');
  assert.equal(h.state.projectName, 'Option Project');
  assert.equal(h.getIdSequence(), 12);
  assert.deepEqual(h.counters, { class: 7 });
  assert.equal(h.log.validated.length, 1);
  assert.deepEqual(h.log.validated[0].registries, {
    diagramTypes: ['class', 'erd', 'state'],
    elementKinds: ['class', 'entity'],
    relationKinds: ['association', 'erd-1n'],
  });
  assert.equal(h.log.resetHistory, 1);
  assert.equal(h.log.clearValidation, 1);
  assert.equal(h.log.markedSaved, 1);
  assert.deepEqual(h.log.scheduled, []);
  assert.ok(h.log.sampleCalls.includes('reconcileTraceabilitySampleModels'));
}

{
  const h = harness();
  const entity = name => ({ id: name, kind: 'entity', name, elements: [], relations: [] });
  const erd = {
    id: 'erd',
    type: 'erd',
    name: 'ERD',
    elements: [entity('User'), entity('Post'), entity('Tag')],
    relations: [],
  };
  assert.equal(h.controller.load(JSON.stringify({
    version: 9,
    projectId: 'p-old',
    projectName: 'Old',
    diagrams: [erd],
    activeId: 'erd',
  })), true);
  const migratedErd = h.state.diagrams.find(diagram => diagram.id === 'erd');
  assert.equal(migratedErd.erdMode, 'both');
  assert.equal(migratedErd.elements[0].name, 'TB_USER');
  assert.equal(migratedErd.elements[0].logicalName, '회원');
  assert.equal(migratedErd.elements[2].columns[1], 'NN name <태그명>: VARCHAR2(30)');
  assert.deepEqual(h.log.scheduled, [0]);
}

{
  const h = harness();
  assert.equal(h.controller.load(JSON.stringify({
    version: 7,
    projectName: 'Legacy',
    elements: [{ id: 'legacy-class', kind: 'class', name: 'Legacy' }],
    relations: [],
  }), { persist: false }), true);
  assert.equal(h.state.diagrams[0].type, 'class');
  assert.equal(h.state.diagrams[0].elements[0].id, 'legacy-class');
  assert.ok(h.state.diagrams.some(diagram => diagram.type === 'parametric'));
  assert.ok(h.log.sampleCalls.includes('sampleInteractionOverviewPair'));
}

{
  const h = harness();
  assert.equal(h.controller.load('{broken'), false);
  assert.equal(h.log.alerts.length, 1);
  assert.match(h.log.alerts[0], /파일을 읽을 수 없습니다/);
  assert.equal(h.controller.load('{broken', { silent: true }), false);
  assert.equal(h.log.alerts.length, 1, 'silent 로드는 사용자 경고를 표시하지 않아야 합니다');
}

console.log('project document tests: ok');
