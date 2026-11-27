'use strict';

const assert = require('node:assert/strict');
const geometry = require('../dist/browser/canvas/canvas-geometry.js');
const {
  REQUIRED_FUNCTIONS,
  REQUIRED_VALUES,
  HIT_TOLERANCES,
  create,
} = require('../dist/browser/canvas/hit-testing.js');

function harness(overrides = {}) {
  let sequenceBottom = overrides.sequenceBottom ?? 520;
  const diagram = overrides.diagram || { id: 'd1', type: 'class', elements: [], relations: [] };
  const deps = {
    bezierPoint: geometry.bezierPoint,
    bindingRoute: relation => relation.route || null,
    branchGeom: relation => relation.branch || null,
    communicationMessagePoints: relation => relation.communicationPoints || null,
    communicationSelfConnectorGeom: relation => relation.communicationCurve || null,
    cubicPoint: geometry.cubicPoint,
    dg: () => diagram,
    distToSegment: geometry.distToSegment,
    getSequenceBottom: () => sequenceBottom,
    isCommMsg: kind => kind === 'comm-forward' || kind === 'comm-reverse',
    isMsg: kind => !!kind && kind.startsWith('msg-'),
    lblOff: (relation, field) => relation.labelOffsets?.[field] || { dx: 0, dy: 0 },
    memberLists: element => element.memberLists || [],
    msgDisplayLabel: relation => relation.displayLabel ?? relation.name ?? '',
    msgPoints: relation => relation.messagePoints || null,
    pointNearPolyline: geometry.pointNearPolyline,
    polylineMidpoint: points => ({
      x: (points[0].x + points[points.length - 1].x) / 2,
      y: (points[0].y + points[points.length - 1].y) / 2,
    }),
    relEndpoints: relation => relation.endpoints || null,
    relLabel: relation => relation.name || '',
    relationEndRoleLabel: (relation, end) => relation[`${end}EndName`] || '',
    relationSupportsEndQuickEdit: relation => !!relation.supportsEnds,
    stateSelfTransitionGeom: relation => relation.stateCurve || null,
    tw: text => String(text || '').length * 8,
    ACTIVITY_CONTAINER_KINDS: new Set(['swimlanev', 'swimlaneh', 'interruptibleregion']),
    PACKAGE_CONTAINER_KINDS: new Set(['package', 'model', 'subsystem']),
    FONT12: '12px sans-serif',
    LINE_H: 15,
    ...overrides.deps,
  };
  return {
    deps,
    diagram,
    hit: create(deps),
    setSequenceBottom(value) { sequenceBottom = value; },
  };
}

const element = (id, kind, extra = {}) => ({ id, kind, x: 0, y: 0, w: 100, h: 60, ...extra });
const relation = (id, kind, extra = {}) => ({ id, kind, name: '', ...extra });
const straight = (x1, y1, x2, y2) => ({ p1: { x: x1, y: y1 }, p2: { x: x2, y: y2 } });
const cubic = (p1, c1, c2, p2, label = { x: 0, y: 0 }) => ({ p1, c1, c2, p2, label });

assert.ok(Object.isFrozen(REQUIRED_FUNCTIONS));
assert.ok(Object.isFrozen(REQUIRED_VALUES));
assert.ok(Object.isFrozen(HIT_TOLERANCES));
assert.equal(HIT_TOLERANCES.relation, 6);
assert.equal(HIT_TOLERANCES.message, 7);
assert.equal(HIT_TOLERANCES.connector, 9);

assert.throws(() => create(), /Hit Testing 의존성이 없습니다/);
assert.throws(() => create({}), /bezierPoint/);
{
  const { deps } = harness();
  const { dg: _dg, ...withoutDg } = deps;
  assert.throws(() => create(withoutDg), /dg/);
  assert.throws(() => create({ ...deps, ACTIVITY_CONTAINER_KINDS: [] }), /ACTIVITY_CONTAINER_KINDS\.has/);
  assert.throws(() => create({ ...deps, LINE_H: null }), /LINE_H/);
  assert.ok(Object.isFrozen(create(deps)));
}

{
  const { hit } = harness();
  const box = element('box', 'class', { x: 10, y: 20, w: 30, h: 40 });
  assert.equal(hit.inRect(box, { x: 10, y: 20 }), true, '테두리 좌표도 요소에 포함된다');
  assert.equal(hit.inRect(box, { x: 41, y: 20 }), false);

  const fragment = element('fragment', 'fragment', { x: 10, y: 10, w: 200, h: 120 });
  assert.equal(hit.nearFragmentEdge(fragment, { x: 12, y: 70 }), true);
  assert.equal(hit.nearFragmentEdge(fragment, { x: 60, y: 20 }), true, '오각형 제목 영역은 클릭 가능하다');
  assert.equal(hit.nearFragmentEdge(fragment, { x: 100, y: 70 }), false, '프레임 내부는 뒤 요소에 통과시킨다');
}
{
  const frame = element('frame', 'frame', { x: 0, y: 0, w: 300, h: 200 });
  const child = element('child', 'class', { x: 80, y: 70, w: 100, h: 60 });
  const h = harness({ diagram: { id: 'd1', type: 'class', elements: [frame, child], relations: [] } });
  assert.equal(h.hit.elementAt({ x: 100, y: 90 }), child, '위에 그린 자식 요소가 배경 프레임보다 우선한다');
  assert.equal(h.hit.elementAt({ x: 250, y: 120 }), null, '프레임 내부 빈 공간은 선택하지 않는다');
  assert.equal(h.hit.elementAt({ x: 3, y: 120 }), frame, '프레임 테두리는 선택할 수 있다');
  assert.equal(h.hit.elementAt({ x: 140, y: 12 }), frame, '프레임 제목 띠는 선택할 수 있다');
}
{
  const activity = element('activity', 'swimlanev', { x: 0, y: 0, w: 240, h: 180 });
  const h = harness({ diagram: { id: 'd1', type: 'activity', elements: [activity], relations: [] } });
  assert.equal(h.hit.elementAt({ x: 120, y: 25 }), activity);
  assert.equal(h.hit.elementAt({ x: 120, y: 90 }), null);
}
{
  const pkg = element('pkg', 'package', { x: 0, y: 0, w: 240, h: 180 });
  const h = harness({ diagram: { id: 'd1', type: 'package', elements: [pkg], relations: [] } });
  assert.equal(h.hit.elementAt({ x: 120, y: 45 }), pkg);
  assert.equal(h.hit.elementAt({ x: 120, y: 100 }), null);
}

{
  const shallow = element('exec-1', 'execution', { x: 96, y: 90, w: 12, h: 80, _depth: 1 });
  const deep = element('exec-2', 'execution', { x: 100, y: 100, w: 12, h: 50, _depth: 3 });
  const life = element('life', 'lifeline', { x: 60, y: 20, w: 80, h: 50 });
  const h = harness({
    sequenceBottom: 400,
    diagram: { id: 'd1', type: 'sequence', elements: [deep, shallow, life], relations: [] },
  });
  assert.equal(h.hit.elementAt({ x: 104, y: 120 }), deep);
  assert.equal(h.hit.elementAt({ x: 100, y: 250 }), life, '라이프라인 점선도 요소 선택 대상이다');
  h.setSequenceBottom(200);
  assert.equal(h.hit.elementAt({ x: 100, y: 250 }), null, '현재 렌더링의 동적 하단 경계를 사용한다');
}
{
  const back = element('life-1', 'lifeline', { x: 40, y: 20, w: 80, h: 50 });
  const front = element('life-2', 'lifeline', { x: 60, y: 20, w: 80, h: 50 });
  const h = harness({
    sequenceBottom: 300,
    diagram: { id: 'd1', type: 'sequence', elements: [back, front], relations: [] },
  });
  assert.equal(h.hit.lifelineAt({ x: 100, y: 200 }), front, '겹친 라이프라인은 앞쪽 뷰가 우선한다');
  assert.equal(h.hit.lifelineAt({ x: 160, y: 200 }), null);
}

{
  const first = relation('r1', 'association', { endpoints: straight(0, 20, 100, 20) });
  const front = relation('r2', 'dependency', { endpoints: straight(0, 20, 100, 20) });
  const h = harness({ diagram: { id: 'd1', type: 'class', elements: [], relations: [first, front] } });
  assert.equal(h.hit.relationAt({ x: 50, y: 24 }), front, '나중에 그린 관계가 우선한다');
  assert.equal(h.hit.relationAt({ x: 50, y: 27 }), null);
}
{
  const message = relation('msg', 'msg-sync', {
    y: 80,
    messagePoints: { p1: { x: 20, y: 80 }, p2: { x: 140, y: 80 } },
  });
  const selfMessage = relation('self-msg', 'msg-sync', {
    y: 120,
    messagePoints: { self: true, startX: 50, endX: 58 },
  });
  const communication = relation('comm-msg', 'comm-forward', {
    communicationPoints: { p1: { x: 20, y: 160 }, p2: { x: 140, y: 160 }, normal: { x: 0, y: 1 } },
  });
  const selfCommunication = relation('comm-self', 'comm-forward', {
    communicationPoints: { self: true, startX: 180, y: 180, width: 44, height: 20 },
  });
  const h = harness({
    diagram: { id: 'd1', type: 'sequence', elements: [], relations: [message, selfMessage, communication, selfCommunication] },
  });
  assert.equal(h.hit.relationAt({ x: 80, y: 84 }), message);
  assert.equal(h.hit.relationAt({ x: 70, y: 125 }), selfMessage);
  assert.equal(h.hit.relationAt({ x: 80, y: 164 }), communication);
  assert.equal(h.hit.relationAt({ x: 220, y: 196 }), selfCommunication);
}
{
  const mind = relation('mind', 'mindbranch', {
    branch: { p1: { x: 0, y: 0 }, c: { x: 50, y: 60 }, p2: { x: 100, y: 0 } },
  });
  const state = relation('state', 'transition', {
    stateCurve: cubic(
      { x: 120, y: 100 }, { x: 120, y: 40 }, { x: 200, y: 40 }, { x: 200, y: 100 }, { x: 160, y: 30 },
    ),
  });
  const binding = relation('binding', 'bindingconnector', {
    route: { points: [{ x: 0, y: 140 }, { x: 100, y: 140 }] },
  });
  const h = harness({ diagram: { id: 'd1', type: 'mindmap', elements: [], relations: [mind, state, binding] } });
  assert.equal(h.hit.relationAt({ x: 50, y: 30 }), mind);
  assert.equal(h.hit.relationAt({ x: 160, y: 55 }), state);
  assert.equal(h.hit.relationAt({ x: 50, y: 145 }), binding);
}
{
  const ordinary = relation('ordinary', 'association', { endpoints: straight(0, 20, 100, 20) });
  const connector = relation('connector', 'commconnector', { endpoints: straight(0, 40, 100, 40) });
  const selfConnector = relation('self-connector', 'commconnector', {
    communicationCurve: cubic(
      { x: 120, y: 40 }, { x: 170, y: 40 }, { x: 170, y: 90 }, { x: 120, y: 90 }, { x: 170, y: 105 },
    ),
  });
  const h = harness({
    diagram: { id: 'd1', type: 'communication', elements: [], relations: [ordinary, connector, selfConnector] },
  });
  assert.equal(h.hit.communicationConnectorAt({ x: 50, y: 47 }), connector);
  assert.equal(h.hit.communicationConnectorAt({ x: 158, y: 65 }), selfConnector);
  assert.equal(h.hit.communicationConnectorAt({ x: 50, y: 20 }), null, '일반 관계는 메시지 생성 대상이 아니다');
}

{
  const named = relation('named', 'association', { name: 'link', endpoints: straight(0, 50, 100, 50) });
  const h = harness({ diagram: { id: 'd1', type: 'class', elements: [], relations: [named] } });
  const hit = h.hit.relationLabelAt({ x: 50, y: 40 });
  assert.equal(hit.r, named);
  assert.equal(hit.field, 'name');
  assert.deepEqual({ bx: hit.bx, by: hit.by, bw: hit.bw }, { bx: 30, by: 32, bw: 40 });
}
{
  const labeled = relation('labeled', 'association', {
    endpoints: straight(0, 50, 100, 50),
    sourceLabel: '1',
    targetLabel: '*',
    sourceEndName: 'owner',
    targetEndName: 'items',
    supportsEnds: true,
  });
  const h = harness({ diagram: { id: 'd1', type: 'class', elements: [], relations: [labeled] } });
  assert.equal(h.hit.relationLabelAt({ x: 16, y: 42 }).field, 'sourceLabel');
  assert.equal(h.hit.relationLabelAt({ x: 84, y: 42 }).field, 'targetLabel');
  assert.equal(h.hit.relationLabelAt({ x: 38, y: 52 }).field, 'sourceEndName');
  assert.equal(h.hit.relationLabelAt({ x: 62, y: 28 }).field, 'targetEndName');
}
{
  const named = relation('offset', 'association', {
    name: 'link',
    endpoints: straight(0, 50, 100, 50),
    labelOffsets: { name: { dx: 20, dy: 10 } },
  });
  const h = harness({ diagram: { id: 'd1', type: 'class', elements: [], relations: [named] } });
  assert.equal(h.hit.relationLabelAt({ x: 50, y: 40 }), null);
  assert.equal(h.hit.relationLabelAt({ x: 70, y: 50 }).r, named);
}

{
  const rows = ['id', 'name'];
  const entity = element('entity', 'entity', {
    y: 100,
    _m: { RH: 17 },
    memberLists: [{ kind: 'column', arr: rows, top: 30, h: 34 }],
  });
  const h = harness();
  assert.deepEqual(h.hit.memberRowAt(entity, { x: 10, y: 147 }), {
    kind: 'column', arr: rows, top: 30, h: 34, index: 1, rowY: 149,
  });
  assert.equal(h.hit.memberRowAt(entity, { x: 10, y: 165 }), null);

  const classView = element('class', 'class', {
    y: 100,
    _m: {},
    memberLists: [{ kind: 'attribute', arr: ['name'], top: 20, h: 30 }],
  });
  assert.equal(h.hit.memberRowAt(classView, { x: 10, y: 129 }).index, 0);
  assert.equal(h.hit.memberRowAt(element('note', 'note'), { x: 10, y: 10 }), null);
}

console.log('hit testing tests: ok');
