'use strict';

const assert = require('node:assert/strict');
const { activeAt, assignTemporalDepths, DEFAULT_SEQUENCE_TOP, sequenceLifelineTop } = require('../dist/browser/canvas/sequence-layout.js');
const {
  DEFAULT_SEQUENCE_BOTTOM,
  REQUIRED_FUNCTIONS,
  REQUIRED_VALUES,
  create,
} = require('../dist/browser/canvas/interaction-layout.js');

function harness(overrides = {}) {
  const diagram = overrides.diagram || {
    id: 'diagram-1',
    type: 'sequence',
    seqNumbers: true,
    elements: [
      { id: 'life-a', kind: 'lifeline', x: 100, y: 50, w: 40, h: 40 },
      { id: 'life-b', kind: 'lifeline', x: 300, y: 50, w: 40, h: 40 },
      { id: 'life-c', kind: 'lifeline', x: 500, y: 50, w: 40, h: 40 },
    ],
    relations: [],
  };
  const log = { assigned: [], synced: [] };
  const dependencies = {
    activeAt,
    assignTemporalDepths(items) {
      if (overrides.assignError) throw new Error(overrides.assignError);
      log.assigned.push(items);
      return assignTemporalDepths(items);
    },
    byId: id => diagram.elements.find(element => element.id === id),
    dg: () => diagram,
    isCommMsg: kind => kind === 'comm-forward' || kind === 'comm-reverse',
    isMsg: kind => typeof kind === 'string' && kind.startsWith('msg-'),
    relById: id => diagram.relations.find(relation => relation.id === id),
    relEndpoints: relation => relation.endpoints === null
      ? null
      : relation.endpoints || { p1: { x: 120, y: 100 }, p2: { x: 320, y: 100 } },
    relLabel: relation => relation.name || '',
    sequenceLifelineTop,
    syncRelationModel: (message, targetDiagram) => { log.synced.push([message.id, targetDiagram.id]); },
    EXEC_NEST_OFFSET: 8,
    DEFAULT_SEQUENCE_TOP,
    EXEC_WIDTH: 12,
    GRID: 16,
  };
  return {
    controller: create(dependencies),
    dependencies,
    diagram,
    log,
  };
}

const message = (id, kind, from, to, y, extra = {}) => ({ id, kind, from, to, y, name: id, ...extra });

assert.equal(DEFAULT_SEQUENCE_BOTTOM, 520);
assert.ok(Object.isFrozen(REQUIRED_FUNCTIONS));
assert.ok(Object.isFrozen(REQUIRED_VALUES));
assert.throws(() => create(), /Interaction Layout 의존성이 없습니다:.*activeAt/);
{
  const h = harness();
  assert.ok(Object.isFrozen(h.controller));
  assert.throws(() => create({ ...h.dependencies, GRID: '16' }), /GRID\.number/);
  assert.throws(() => create({ ...h.dependencies, EXEC_WIDTH: Number.NaN }), /EXEC_WIDTH\.number/);
}

{
  const h = harness();
  const second = message('second', 'msg-sync', 'life-a', 'life-b', 200);
  const first = message('first', 'msg-sync', 'life-a', 'life-b', 100, { seqNo: 'A' });
  h.diagram.relations.push(second, { id: 'association', kind: 'association' }, first);
  const originalOrder = h.diagram.relations.map(relation => relation.id);

  h.controller.computeSeqNumbers(h.diagram);
  assert.deepEqual(h.diagram.relations.map(relation => relation.id), originalOrder,
    '번호 계산은 저장된 관계 순서를 바꾸면 안 됩니다');
  assert.equal(h.controller.msgDisplayLabel(first), 'A: first');
  assert.equal(h.controller.msgDisplayLabel(second), '2: second');

  first.name = '';
  assert.equal(h.controller.msgDisplayLabel(first), 'A');
  h.diagram.seqNumbers = false;
  assert.equal(h.controller.msgDisplayLabel(second), 'second');
  h.diagram.seqNumbers = true;
  h.diagram.type = 'class';
  assert.equal(h.controller.msgDisplayLabel(second), 'second');
  h.diagram.type = 'sequence';
  h.controller.clearSequenceNumbers();
  assert.equal(h.controller.msgDisplayLabel(second), 'second');
}

{
  const h = harness();
  const forward2 = message('forward-2', 'comm-forward', 'life-a', 'life-b', 0);
  const reverse = message('reverse', 'comm-reverse', 'life-b', 'life-a', 0, { seqNo: 7 });
  const forward1 = message('forward-1', 'comm-forward', 'life-a', 'life-b', 0);
  h.diagram.type = 'communication';
  h.diagram.relations.push(forward2, reverse, forward1);
  h.controller.computeSeqNumbers(h.diagram);
  assert.equal(h.controller.msgDisplayLabel(forward2), '1: forward-2');
  assert.equal(h.controller.msgDisplayLabel(reverse), '7: reverse');
  assert.equal(h.controller.msgDisplayLabel(forward1), '3: forward-1');
}

{
  const h = harness();
  h.diagram.relations.push(
    message('call', 'msg-sync', 'life-a', 'life-b', 100),
    message('nested', 'msg-sync', 'life-a', 'life-b', 120),
    message('reply-nested', 'msg-reply', 'life-b', 'life-a', 160),
    message('reply-call', 'msg-reply', 'life-b', 'life-a', 200),
    message('unmatched', 'msg-sync', 'life-a', 'life-b', 250),
    message('self', 'msg-sync', 'life-a', 'life-a', 300),
  );
  h.diagram.elements.push({
    id: 'manual', kind: 'execution', lifeId: 'life-c', x: 0, y: 600, w: 12, h: 80, _depth: 2,
  });

  h.controller.computeSequenceLayout(h.diagram);
  const bars = h.controller.getSequenceBars();
  assert.equal(h.controller.getSequenceBottom(), 728);
  assert.equal(Object.isFrozen(bars), true, '배치 캐시 배열은 외부에서 변경할 수 없어야 합니다');
  assert.equal(bars.every(Object.isFrozen), true, '배치 캐시 항목도 외부에서 변경할 수 없어야 합니다');
  assert.deepEqual(bars.map(bar => bar.id), [
    'auto-nested-reply-nested',
    'auto-call-reply-call',
    'auto-self',
    'auto-unmatched',
    'manual',
  ]);
  assert.equal(bars.find(bar => bar.id === 'auto-call-reply-call').depth, 0);
  assert.equal(bars.find(bar => bar.id === 'auto-nested-reply-nested').depth, 1);
  assert.equal(bars.find(bar => bar.id === 'auto-unmatched').y1, 298);
  assert.equal(bars.find(bar => bar.id === 'manual').manual, true);
  assert.equal(h.log.assigned.length, 1);

  assert.throws(() => bars.push({}), TypeError);
  assert.throws(() => { bars[0].depth = 99; }, TypeError);

  const callPoints = h.controller.msgPoints(message('point', 'msg-sync', 'life-a', 'life-b', 100));
  assert.deepEqual(callPoints, { p1: { x: 120, y: 100 }, p2: { x: 314, y: 100 } });
  const replyPoints = h.controller.msgPoints(message('point-reply', 'msg-reply', 'life-b', 'life-a', 180));
  assert.deepEqual(replyPoints, { p1: { x: 314, y: 180 }, p2: { x: 120, y: 180 } });
  const selfPoints = h.controller.msgPoints(message('self-point', 'msg-sync', 'life-a', 'life-a', 300));
  assert.deepEqual(selfPoints, {
    self: true, cx: 120, startX: 126, endX: 126, depth: 0, y: 300, width: 44, height: 20,
  });

  h.controller.clearSequenceBars();
  assert.equal(Object.isFrozen(h.controller.getSequenceBars()), true);
  assert.deepEqual(h.controller.getSequenceBars(), []);
  assert.equal(h.controller.getSequenceBottom(), 728,
    '막대 초기화는 기존 동작처럼 라이프라인 하단 계산값을 유지해야 합니다');
}

{
  const h = harness();
  h.diagram.elements.push({ id: 'manual', kind: 'execution', lifeId: 'life-b', y: 100, h: 80 });
  h.diagram.relations.push(
    message('to-manual', 'msg-sync', 'life-a', 'life-b', 110),
    message('manual-self', 'msg-sync', 'life-b', 'life-b', 130),
  );
  h.controller.computeSequenceLayout(h.diagram);
  assert.deepEqual(h.controller.getSequenceBars().map(bar => bar.id), ['manual'],
    '수동 Execution이 있는 Lifeline에는 자동 활성 구간을 만들면 안 됩니다');

  assert.equal(h.controller.msgPoints({ from: 'missing', to: 'life-a', y: 10 }), null);
  h.controller.clearSequenceBars();
  assert.deepEqual(h.controller.msgPoints({ from: 'life-a', to: 'life-a', y: 10 }), {
    self: true, cx: 120, startX: 120, endX: 120, depth: -1, y: 10, width: 44, height: 20,
  });
}

{
  const first = harness();
  first.diagram.relations.push(message('call', 'msg-sync', 'life-a', 'life-b', 600));
  first.controller.computeSequenceLayout(first.diagram);
  const originalBottom = first.controller.getSequenceBottom();
  const originalBars = first.controller.getSequenceBars();

  const failing = harness({ diagram: first.diagram, assignError: 'layout failed' });
  assert.throws(() => failing.controller.computeSequenceLayout(failing.diagram), /layout failed/);
  assert.equal(failing.controller.getSequenceBottom(), DEFAULT_SEQUENCE_BOTTOM,
    '배치 계산이 실패하면 부분 계산된 하단 값을 공개하면 안 됩니다');
  assert.deepEqual(failing.controller.getSequenceBars(), []);
  assert.ok(originalBottom > DEFAULT_SEQUENCE_BOTTOM);
  assert.ok(originalBars.length > 0);
}

{
  const h = harness();
  const selfConnector = { id: 'self-connector', kind: 'commconnector', from: 'life-a', to: 'life-a' };
  assert.equal(h.controller.communicationSelfConnectorGeom(null), null);
  assert.equal(h.controller.communicationSelfConnectorGeom({ kind: 'association' }), null);
  assert.equal(h.controller.communicationSelfConnectorGeom({ kind: 'commconnector', from: 'life-a', to: 'life-b' }), null);
  assert.equal(h.controller.communicationSelfConnectorGeom({ ...selfConnector, from: 'missing', to: 'missing' }), null);
  assert.deepEqual(h.controller.communicationSelfConnectorGeom(selfConnector), {
    p1: { x: 140, y: 64 },
    p2: { x: 140, y: 78.8 },
    c1: { x: 188, y: 64 },
    c2: { x: 188, y: 78.8 },
    label: { x: 188, y: 94.8 },
  });
}

{
  const h = harness();
  const connector = { id: 'connector', kind: 'commconnector', from: 'life-a', to: 'life-b' };
  const forward1 = { id: 'forward-1', kind: 'comm-forward', connectorId: connector.id };
  const forward2 = { id: 'forward-2', kind: 'comm-forward', connectorId: connector.id };
  const reverse = { id: 'reverse', kind: 'comm-reverse', connectorId: connector.id };
  h.diagram.relations.push(connector, forward1, forward2, reverse);

  assert.equal(h.controller.communicationMessagePoints({ kind: 'association' }), null);
  assert.equal(h.controller.communicationMessagePoints({ kind: 'comm-forward', connectorId: 'missing' }), null);
  h.diagram.relations.push({ id: 'wrong', kind: 'association' });
  assert.equal(h.controller.communicationMessagePoints({ kind: 'comm-forward', connectorId: 'wrong' }), null);
  assert.deepEqual(h.controller.communicationMessagePoints(forward1), {
    p1: { x: 144, y: 128 },
    p2: { x: 296, y: 128 },
    normal: { x: -0, y: 1 },
  });
  assert.deepEqual(h.controller.communicationMessagePoints(forward2), {
    p1: { x: 144, y: 148 },
    p2: { x: 296, y: 148 },
    normal: { x: -0, y: 1 },
  });
  assert.deepEqual(h.controller.communicationMessagePoints(reverse), {
    p1: { x: 296, y: 72 },
    p2: { x: 144, y: 72 },
    normal: { x: -0, y: -1 },
  });

  connector.endpoints = null;
  assert.equal(h.controller.communicationMessagePoints(forward1), null);
}

{
  const h = harness();
  const connector = { id: 'self', kind: 'commconnector', from: 'life-a', to: 'life-a' };
  const first = { id: 'first', kind: 'comm-forward', connectorId: connector.id };
  const second = { id: 'second', kind: 'comm-forward', connectorId: connector.id };
  h.diagram.relations.push(connector, first, second);
  assert.deepEqual(h.controller.communicationMessagePoints(second), {
    self: true, startX: 140, endX: 140, y: 76, width: 52, height: 20,
  });
  connector.from = 'missing';
  connector.to = 'missing';
  assert.equal(h.controller.communicationMessagePoints(second), null);
}

{
  const h = harness();
  const connector = { id: 'connector', kind: 'commconnector', from: 'life-a', to: 'life-b' };
  const forward = { id: 'forward', kind: 'comm-forward', connectorId: connector.id, from: 'old', to: 'old' };
  const reverse = { id: 'reverse', kind: 'comm-reverse', connectorId: connector.id, from: 'old', to: 'old' };
  const unrelated = { id: 'other', kind: 'comm-forward', connectorId: 'other', from: 'x', to: 'y' };
  h.diagram.relations.push(connector, forward, reverse, unrelated);

  h.controller.syncCommunicationMessages(null);
  h.controller.syncCommunicationMessages({ kind: 'association' });
  assert.equal(h.log.synced.length, 0);
  h.controller.syncCommunicationMessages(connector);
  assert.deepEqual([forward.from, forward.to], ['life-a', 'life-b']);
  assert.deepEqual([reverse.from, reverse.to], ['life-b', 'life-a']);
  assert.deepEqual([unrelated.from, unrelated.to], ['x', 'y']);
  assert.deepEqual(h.log.synced, [['forward', 'diagram-1'], ['reverse', 'diagram-1']]);
}

console.log('interaction layout tests: ok');
