'use strict';

const assert = require('node:assert/strict');
const { sequenceMessageMinY } = require('../dist/browser/canvas/sequence-layout.js');
const {
  ENDPOINT_MESSAGES,
  REQUIRED_FUNCTIONS,
  REQUIRED_VALUES,
  create,
} = require('../dist/browser/editor/relation-creation.js');

function harness(options = {}) {
  let linking = options.linking === undefined ? { fromId: 'from', x: 20, y: 90 } : options.linking;
  let uidSequence = 0;
  const names = {};
  let legalityMessage = options.legalityMessage || '';
  let directionMessage = options.directionMessage || '';
  const log = {
    adopted: [],
    cardinalities: [],
    cleared: 0,
    flashed: [],
    legality: [],
    rendered: 0,
    selected: [],
    snapshots: 0,
    synced: [],
  };
  const diagram = {
    id: 'diagram',
    type: options.diagramType || 'class',
    elements: options.elements || [
      { id: 'from', kind: 'class' },
      { id: 'target', kind: 'class' },
    ],
    relations: options.relations || [],
  };
  const state = { tool: options.tool || 'association' };
  const dependencies = {
    adoptView(view) {
      log.adopted.push(view);
      return { ...view, modelId: `model-${view.id}` };
    },
    byId: id => diagram.elements.find(element => element.id === id),
    clearLinking() {
      log.cleared += 1;
      linking = null;
    },
    dg: () => diagram,
    sequenceMessageMinY,
    erdDefaultCardinality(kind, end) {
      log.cardinalities.push([kind, end]);
      return end === 'source' ? '0..1' : '1..*';
    },
    flashStatus(message) {
      log.flashed.push(message);
    },
    getLinking: () => linking,
    isMsg: kind => kind.startsWith('msg-'),
    nextName(kind) {
      names[kind] = (names[kind] || 0) + 1;
      return `${kind}-${names[kind]}`;
    },
    relationError(kind, from, to) {
      log.legality.push([kind, from?.id, to?.id]);
      return legalityMessage;
    },
    renderAll() {
      log.rendered += 1;
    },
    setSelection(ids) {
      log.selected.push(ids);
    },
    snap: value => Math.round(value / 8) * 8,
    snapshot() {
      log.snapshots += 1;
    },
    syncRelationModel(relation) {
      log.synced.push(relation.id);
    },
    transitionDirectionError: () => directionMessage,
    uid: () => `r${++uidSequence}`,
    ER_RELATION_KINDS: new Set(['erd-11', 'erd-1n', 'erd-nm']),
    INSTANCE_KINDS: new Set(['object', 'artifactinstance', 'componentinstance', 'nodeinstance']),
    STATE_VERTEX_KINDS: new Set(['state', 'stateinitial', 'statefinal']),
    state,
  };
  return {
    controller: create(dependencies),
    dependencies,
    diagram,
    log,
    state,
    uidSequence: () => uidSequence,
    setDirectionMessage(value) {
      directionMessage = value;
    },
    setLegalityMessage(value) {
      legalityMessage = value;
    },
    setLinking(value) {
      linking = value;
    },
  };
}

assert.ok(Object.isFrozen(ENDPOINT_MESSAGES));
assert.ok(Object.isFrozen(REQUIRED_FUNCTIONS));
assert.ok(Object.isFrozen(REQUIRED_VALUES));
assert.equal(ENDPOINT_MESSAGES.transition,
  'Transition은 상태 머신의 State 또는 Pseudostate 사이에만 연결할 수 있습니다');
assert.throws(() => create(), /Relation Creation 의존성이 없습니다:.*adoptView/);
{
  const h = harness();
  assert.throws(
    () => create({ ...h.dependencies, ER_RELATION_KINDS: [] }),
    /ER_RELATION_KINDS\.has/,
  );
  assert.throws(
    () => create({ ...h.dependencies, INSTANCE_KINDS: [] }),
    /INSTANCE_KINDS\.has/,
  );
  assert.throws(
    () => create({ ...h.dependencies, STATE_VERTEX_KINDS: [] }),
    /STATE_VERTEX_KINDS\.has/,
  );
  assert.throws(() => create({ ...h.dependencies, state: 'invalid' }), /state\.object/);
  assert.ok(Object.isFrozen(h.controller));
}

{
  const h = harness({ linking: null });
  h.controller.completeLink({ id: 'target', kind: 'class' }, { y: 100 });
  assert.equal(h.diagram.relations.length, 0);
  assert.equal(h.log.snapshots, 0);
  assert.equal(h.log.rendered, 0);
}

{
  const h = harness({ tool: 'comm-forward' });
  const connector = { id: 'connector', kind: 'commconnector', from: 'from', to: 'target' };
  h.controller.createCommunicationMessage(connector, 'comm-forward');
  h.controller.createCommunicationMessage(connector, 'comm-reverse');
  assertSubset(h.diagram.relations[0], {
    id: 'r1', kind: 'comm-forward', from: 'from', to: 'target',
    connectorId: 'connector', name: 'comm-forward-1', seqNo: '', messageSort: 'synchCall',
  });
  assertSubset(h.diagram.relations[1], {
    id: 'r2', kind: 'comm-reverse', from: 'target', to: 'from',
    connectorId: 'connector', name: 'comm-reverse-1', seqNo: '', messageSort: 'synchCall',
  });
  assert.equal(h.log.snapshots, 2);
  assert.deepEqual(h.log.synced, ['r1', 'r2']);
  assert.deepEqual(h.log.selected, [['r1'], ['r2']]);
  assert.equal(h.state.tool, 'select');
  assert.equal(h.log.rendered, 2);
}

function assertSubset(actual, expected) {
  Object.entries(expected).forEach(([key, value]) => assert.deepEqual(actual[key], value, key));
}

function assertRejected(options, expectedMessage) {
  const h = harness(options);
  h.controller.completeLink(h.diagram.elements[1], { y: 100 });
  assert.deepEqual(h.log.flashed, [expectedMessage]);
  assert.equal(h.log.cleared, 1);
  assert.equal(h.state.tool, 'select');
  assert.equal(h.log.rendered, 1);
  assert.equal(h.log.snapshots, 0);
  assert.equal(h.diagram.relations.length, options.relations?.length || 0);
  return h;
}

assertRejected({ tool: 'transition' }, ENDPOINT_MESSAGES.transition);
assertRejected({
  tool: 'transition',
  elements: [{ id: 'from', kind: 'state' }, { id: 'target', kind: 'class' }],
}, ENDPOINT_MESSAGES.transition);
assertRejected({
  tool: 'transition',
  directionMessage: '이 방향으로 Transition을 만들 수 없습니다',
  elements: [{ id: 'from', kind: 'state' }, { id: 'target', kind: 'state' }],
}, '이 방향으로 Transition을 만들 수 없습니다');
assertRejected({ tool: 'link' }, ENDPOINT_MESSAGES.link);
assertRejected({ tool: 'directedlink' }, ENDPOINT_MESSAGES.link);
assertRejected({ tool: 'commconnector' }, ENDPOINT_MESSAGES.commconnector);
assertRejected({ tool: 'timingmessage' }, ENDPOINT_MESSAGES.timingmessage);
{
  const h = assertRejected({ legalityMessage: '통합 관계 규칙 오류' }, '통합 관계 규칙 오류');
  assert.deepEqual(h.log.legality, [['association', 'from', 'target']]);
}

{
  const existing = {
    id: 'existing', kind: 'containment', from: 'from', to: 'old-target',
    srcAnchor: 0.25, dstAnchor: 0.75,
  };
  const h = harness({
    tool: 'containment',
    elements: [{ id: 'from', kind: 'package' }, { id: 'target', kind: 'package' }],
    relations: [existing],
  });
  h.controller.completeLink(h.diagram.elements[1], null);
  assert.equal(existing.to, 'target');
  assert.equal('srcAnchor' in existing, false);
  assert.equal('dstAnchor' in existing, false);
  assert.equal(h.diagram.elements[0].parentId, 'target');
  assert.equal(h.diagram.relations.length, 1);
  assert.equal(h.uidSequence(), 0);
  assert.equal(h.log.snapshots, 1);
  assert.deepEqual(h.log.synced, ['existing']);
  assert.deepEqual(h.log.selected, [['existing']]);
}

function createdRelation(options, point = { y: 100 }) {
  const h = harness(options);
  h.controller.completeLink(h.diagram.elements[1], point);
  assert.equal(h.diagram.relations.length, 1, options.tool);
  assert.equal(h.log.snapshots, 1, options.tool);
  assert.equal(h.log.cleared, 1, options.tool);
  assert.equal(h.state.tool, 'select', options.tool);
  assert.deepEqual(h.log.selected, [['r1']], options.tool);
  assert.deepEqual(h.log.synced, ['r1'], options.tool);
  return { h, relation: h.diagram.relations[0] };
}

{
  const { relation } = createdRelation({ tool: 'association' });
  assertSubset(relation, {
    id: 'r1', kind: 'association', from: 'from', to: 'target',
    name: '', sourceLabel: '', targetLabel: '', modelId: 'model-r1',
  });
}
{
  const { h, relation } = createdRelation({
    tool: 'erd-1n',
    elements: [{ id: 'from', kind: 'entity' }, { id: 'target', kind: 'entity' }],
  });
  assertSubset(relation, {
    sourceLabel: '0..1', targetLabel: '1..*',
    foreignKeyEnd: '', sourceColumnName: '', targetColumnName: '',
    foreignKeyOnDelete: '', foreignKeyOnUpdate: '',
  });
  assert.deepEqual(h.log.cardinalities, [['erd-1n', 'source'], ['erd-1n', 'target']]);
}
{
  const { relation } = createdRelation({
    tool: 'transition',
    elements: [{ id: 'from', kind: 'state' }, { id: 'target', kind: 'state' }],
  });
  assertSubset(relation, { trigger: '', guard: '', effect: '' });
}
{
  const { relation } = createdRelation({
    tool: 'timingmessage',
    elements: [{ id: 'from', kind: 'timesegment' }, { id: 'target', kind: 'timesegment' }],
  });
  assert.equal(relation.messageSort, 'synchCall');
}
{
  const { relation } = createdRelation({ tool: 'extension' });
  assert.equal(relation.isRequired, false);
}
{
  const { relation } = createdRelation({ tool: 'informationflow' });
  assert.deepEqual(relation.conveyedModelIds, []);
}
{
  const { relation } = createdRelation({ tool: 'connector', diagramType: 'ibd' });
  assert.deepEqual(relation.itemFlowModelIds, []);
}
{
  const { relation } = createdRelation({
    tool: 'msg-sync',
    elements: [{ id: 'from', kind: 'lifeline' }, { id: 'target', kind: 'lifeline' }],
  }, { y: 101 });
  assert.equal(relation.y, 104);
}
{
  const { relation } = createdRelation({
    tool: 'msg-reply',
    linking: { fromId: 'from', y: 90 },
    elements: [{ id: 'from', kind: 'lifeline' }, { id: 'target', kind: 'lifeline' }],
  }, null);
  assert.equal(relation.y, 96);
}
{
  const h = harness({ tool: 'msg-sync' });
  h.controller.completeLink(h.diagram.elements[1], { y: 100 });
  assert.equal(h.diagram.relations.length, 0);
  assert.equal(h.uidSequence(), 1, '잘못된 Message도 기존 동작처럼 생성 ID 하나를 소비합니다');
  assert.equal(h.log.snapshots, 0);
  assert.equal(h.log.cleared, 1);
}
{
  const { h, relation } = createdRelation({
    tool: 'containment',
    elements: [{ id: 'from', kind: 'package' }, { id: 'target', kind: 'package' }],
  });
  assert.equal(h.diagram.elements[0].parentId, 'target');
  assert.equal(relation.kind, 'containment');
}

console.log('relation creation tests: ok');
