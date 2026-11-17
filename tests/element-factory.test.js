'use strict';

const assert = require('node:assert/strict');
const {
  NAME_PREFIXES,
  REQUIRED_FUNCTIONS,
  REQUIRED_VALUES,
  create,
} = require('../element-factory.js');
const { registeredElementKinds } = require('../diagram-registry.js');
const { sequenceLifelineTop } = require('../sequence-layout.js');

const FILL_DEFAULT = '#fffbd8';
const TIMING_ROW_HEIGHT = 44;

function harness(diagramType = 'class', counters = {}) {
  let idSequence = 0;
  const dependencies = {
    dg: () => ({ type: diagramType }),
    sequenceLifelineTop,
    uid: () => `e${++idSequence}`,
    ACTIVITY_PIN_KINDS: new Set(['inputpin', 'outputpin', 'expansioninput', 'expansionoutput']),
    BDD_CLASSIFIER_KINDS: new Set(['block', 'valuetype', 'interfaceblock', 'constraintblock']),
    FILL_DEFAULT,
    TIMING_ROW_HEIGHT,
    counters,
  };
  return {
    controller: create(dependencies),
    counters,
    dependencies,
  };
}

function assertSubset(actual, expected, message) {
  Object.entries(expected).forEach(([key, value]) => {
    assert.deepEqual(actual[key], value, `${message}: ${key}`);
  });
}

assert.ok(Object.isFrozen(NAME_PREFIXES));
assert.ok(Object.isFrozen(REQUIRED_FUNCTIONS));
assert.ok(Object.isFrozen(REQUIRED_VALUES));
assert.equal(NAME_PREFIXES.class, 'Class');
assert.equal(NAME_PREFIXES['comm-forward'], 'message');
assert.throws(() => create(), /Element Factory 의존성이 없습니다:.*dg/);
{
  const h = harness();
  assert.throws(
    () => create({ ...h.dependencies, ACTIVITY_PIN_KINDS: [] }),
    /ACTIVITY_PIN_KINDS\.has/,
  );
  assert.throws(
    () => create({ ...h.dependencies, BDD_CLASSIFIER_KINDS: [] }),
    /BDD_CLASSIFIER_KINDS\.has/,
  );
  assert.throws(() => create({ ...h.dependencies, counters: [] }), /counters\.object/);
  assert.throws(
    () => create({ ...h.dependencies, TIMING_ROW_HEIGHT: '44' }),
    /TIMING_ROW_HEIGHT\.number/,
  );
}

{
  const h = harness();
  assert.ok(Object.isFrozen(h.controller));
  assert.equal(h.controller.nextName('class'), 'Class1');
  assert.equal(h.controller.nextName('class'), 'Class2');
  assert.equal(h.controller.nextName('comm-forward'), 'message1');
  assert.equal(h.controller.nextName('unknown-kind'), 'Element1');
  assert.deepEqual(h.counters, { class: 2, 'comm-forward': 1, 'unknown-kind': 1 });
}

{
  const actor = harness().controller.createElement('seqactor', 12, 80);
  assert.deepEqual(actor, {
    id: 'e1', kind: 'lifeline', isActor: true, x: 12, y: 32,
    w: 0, h: 0, name: 'Actor1', fill: FILL_DEFAULT,
  });
}

const elementCases = [
  ['class', 'class', { attributes: [], operations: [], stereotype: '', isAbstract: false, w: 0, h: 0 }],
  ['class', 'composite', { attributes: [], operations: [], stereotype: '', isAbstract: false, w: 520, h: 360, fill: '#f5f6ff' }],
  ['interface', 'class', { attributes: [], operations: [] }],
  ['enumeration', 'class', { literals: [], operations: [] }],
  ['package', 'package', { fill: '#fff8df', stereotype: '', visibility: 'public', w: 320, h: 224 }],
  ['package', 'class', { fill: FILL_DEFAULT, w: 0, h: 0 }],
  ['model', 'package', { fill: '#fff5d6', stereotype: 'model', visibility: 'public', w: 720, h: 520 }],
  ['subsystem', 'package', { fill: '#fff9e8', stereotype: 'subsystem', visibility: 'public', w: 280, h: 176 }],
  ['metaclass', 'profile', { fill: '#f5effa', visibility: 'public', w: 208, h: 72 }],
  ['stereotype', 'profile', { fill: '#f8f1fc', visibility: 'public', attributes: [], operations: [], iconContent: '', w: 240, h: 112 }],
  ['informationitem', 'informationflow', { fill: '#eef8f8', visibility: 'public', stereotype: 'information', attributes: [], operations: [], receptions: [], w: 208, h: 88 }],
  ['block', 'bdd', { fill: '#edf4f7', visibility: 'public', isAbstract: false, parts: [], references: [], values: [], flowProperties: [], constraintProperties: [], properties: [], constraints: [], constraintParameters: [], operations: [], receptions: [], valueTypeUnit: '', quantityKind: '', w: 256, h: 88 }],
  ['ibdframe', 'ibd', { name: 'Internal Structure', fill: '#f8fbfc', classifierModelId: '', w: 1200, h: 840 }],
  ['parametricframe', 'parametric', { name: 'Parametric Analysis', fill: '#fbf9fd', classifierModelId: '', w: 1200, h: 840 }],
  ['note', 'class', { text: 'Note' }],
  ['lifeline', 'sequence', { classifierModelId: '', y: 32, w: 0, h: 0 }],
  ['lifeline', 'timing', { classifierModelId: '', y: 20, w: 1000, h: 132, fill: '#f8eadf', stereotype: '' }],
  ['fragment', 'sequence', { operator: 'alt', condition: '', operands: ['[success]', '[else]'], w: 240, h: 160 }],
  ['frame', 'sequence', { w: 520, h: 360, fill: '#ffffff' }],
  ['interactionuse', 'activity', { interactionDiagramId: '', w: 200, h: 60 }],
  ['interactioninline', 'activity', { interactionDiagramId: '', fill: '#ffffff', w: 400, h: 240 }],
  ['continuation', 'sequence', { w: 120, h: 30 }],
  ['boundary', 'usecase', { w: 280, h: 200 }],
  ['node', 'deployment', { stereotype: 'device' }],
  ['entity', 'erd', { columns: ['PK id: INTEGER'] }],
  ['mindnode', 'mindmap', { fill: '#d7e6f7' }],
  ['state', 'state', { fill: '#eef1ff', entry: '', doActivity: '', exit: '', internalTransitions: [] }],
  ['compositestate', 'state', { fill: '#f2f4ff', entry: '', doActivity: '', exit: '', internalTransitions: [], w: 360, h: 280 }],
  ['submachinestate', 'state', { fill: '#eef1ff', entry: '', doActivity: '', exit: '', internalTransitions: [], submachineDiagramId: '', w: 240, h: 96 }],
  ['entrypoint', 'state', { fill: '#ffffff', w: 20, h: 20 }],
  ['exitpoint', 'state', { fill: '#ffffff', w: 20, h: 20 }],
  ['terminate', 'state', { fill: 'transparent', w: 24, h: 24 }],
  ['connectionpointref', 'state', { fill: '#ffffff', referenceKind: 'entry', w: 20, h: 20 }],
  ['object', 'object', { fill: '#f8f0fb', classifierModelId: '', slots: [] }],
  ['artifactinstance', 'object', { fill: '#f5f1fb', classifierModelId: '', w: 160, h: 64 }],
  ['componentinstance', 'object', { fill: '#f5f1fb', classifierModelId: '', w: 176, h: 64 }],
  ['nodeinstance', 'object', { fill: '#f5f1fb', classifierModelId: '', w: 184, h: 96 }],
  ['collaboration', 'composite', { fill: '#f5f6ff', w: 440, h: 320 }],
  ['part', 'ibd', { fill: '#eaf2f5', classifierModelId: '', w: 176, h: 72 }],
  ['part', 'composite', { fill: '#eef1ff', classifierModelId: '', w: 176, h: 72 }],
  ['reference', 'ibd', { fill: '#eef6f8', classifierModelId: '', w: 184, h: 72 }],
  ['value', 'ibd', { fill: '#f7f4ec', classifierModelId: '', defaultValue: '', w: 184, h: 72 }],
  ['constraintproperty', 'parametric', { fill: '#f3edf8', classifierModelId: '', visibility: 'public', w: 296, h: 128 }],
  ['constraintparameter', 'parametric', { fill: '#ffffff', classifierModelId: '', visibility: 'public', w: 18, h: 18 }],
  ['port', 'ibd', { fill: '#ffffff', classifierModelId: '', providedInterfaceModelId: '', requiredInterfaceModelId: '', w: 18, h: 18 }],
  ['collaborationuse', 'composite', { fill: '#f7f5ff', collaborationModelId: '', w: 200, h: 80 }],
  ['timingstate', 'timing', { fill: '#ffffff', w: 760, h: TIMING_ROW_HEIGHT }],
  ['timesegment', 'timing', { name: '', fill: '#ad6b3d', startTime: '', endTime: '', w: 128, h: 10 }],
  ['timetick', 'timing', { name: 'tick', timeValue: '0 ms', fill: 'transparent', w: 8, h: 480 }],
  ['timeconstraint', 'timing', { name: 'timeConstraint', constraint: '{t = 0 ms}', fill: 'transparent', w: 120, h: 28 }],
  ['durationconstraint', 'timing', { name: 'durationConstraint', constraint: '{0 ms..10 ms}', fill: 'transparent', w: 176, h: 32 }],
  ['region', 'state', { fill: 'transparent', w: 320, h: 100 }],
  ['swimlanev', 'activity', { fill: '#fffdf2', w: 360, h: 560 }],
  ['swimlaneh', 'activity', { fill: '#fffdf2', w: 720, h: 208 }],
  ['interruptibleregion', 'activity', { fill: '#fffdf6', w: 360, h: 224 }],
  ['structuredactivity', 'activity', { fill: '#fff7ed', w: 360, h: 224 }],
  ['expansionregion', 'activity', { fill: '#fff8ef', expansionMode: 'parallel', w: 400, h: 224 }],
  ['inputpin', 'activity', { fill: '#ffffff', w: 16, h: 16 }],
  ['outputpin', 'activity', { fill: '#ffffff', w: 16, h: 16 }],
  ['centralbuffer', 'activity', { w: 144, h: 56 }],
  ['activitydatastore', 'activity', { w: 144, h: 56 }],
];

elementCases.forEach(([kind, diagramType, expected]) => {
  const view = harness(diagramType).controller.createElement(kind, 10, 20);
  assert.equal(view.id, 'e1', `${kind}: id`);
  assert.equal(view.kind, kind, `${kind}: kind`);
  assert.equal(view.x, 10, `${kind}: x`);
  assertSubset(view, expected, `${diagramType}/${kind}`);
});

{
  const h = harness();
  const views = registeredElementKinds().map(kind => h.controller.createElement(kind, 0, 0));
  assert.equal(views.length, registeredElementKinds().length);
  assert.equal(new Set(views.map(view => view.id)).size, views.length,
    '등록된 모든 요소 종류는 중복되지 않는 ID로 생성되어야 합니다');
  views.forEach(view => assert.equal(typeof view.name, 'string'));
}

{
  const h = harness('requirement');
  const first = h.controller.createElement('requirement', 0, 0);
  const second = h.controller.createElement('requirement', 0, 0);
  assertSubset(first, {
    name: 'Requirement1', requirementId: 'REQ-001', requirementType: 'requirement',
    requirementText: 'The system shall ...', risk: 'Medium',
    verificationMethod: 'Analysis', visibility: 'public', w: 296, h: 144,
  }, '첫 번째 Requirement');
  assert.equal(second.name, 'Requirement2');
  assert.equal(second.requirementId, 'REQ-002');
}

{
  const h = harness();
  const first = h.controller.createElement('class', 0, 0);
  const second = h.controller.createElement('class', 0, 0);
  first.attributes.push('+ changed: boolean');
  assert.deepEqual(second.attributes, [], '새 요소의 편집 배열은 다른 요소와 공유하지 않아야 합니다');
}

console.log('element factory tests: ok');
