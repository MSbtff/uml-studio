'use strict';

const assert = require('node:assert/strict');
const { create, relationMessageStyle, ERD_ENDS, ERD_LINE } = require('../relation-renderer.js');
const { headGeom, polylinePath, bezierPoint } = require('../canvas-geometry.js');
const { REL_STYLE } = require('../presentation-registry.js');
const {
  ER_RELATION_KINDS,
  relationSupportsEndQuickEdit,
  relationEndAggregation,
  relationEndNavigability,
  relationEndRoleLabel,
} = require('../relation-end.js');
const { parseErdCardinality } = require('../erd-cardinality.js');
const { polylineJumpPath, polylineMidpoint } = require('../orthogonal-router.js');

function node(tag = 'root', attrs = {}) {
  return {
    tag,
    attrs: { ...attrs },
    children: [],
    setAttribute(name, value) { this.attrs[name] = value; },
  };
}

function append(tag, attrs, parent) {
  const child = node(tag, attrs);
  parent.children.push(child);
  return child;
}

function addText(parent, value, x, y, options = {}) {
  const child = node('text', { value, x, y, ...options });
  parent.children.push(child);
  return child;
}

const endpoints = { p1: { x: 0, y: 40 }, p2: { x: 200, y: 40 } };
const dependencies = {
  el: append,
  text: addText,
  measureText: value => String(value).length * 6,
  headGeom,
  parseErdCardinality,
  isMessage: kind => kind?.startsWith('msg-'),
  isCommunicationMessage: kind => kind === 'comm-forward' || kind === 'comm-reverse',
  messagePoints: relation => relation.points,
  messageLabel: relation => relation.label || relation.name || '',
  communicationSelfConnectorGeometry: relation => relation.communicationCurve || null,
  communicationMessagePoints: relation => relation.communicationPoints,
  stateSelfTransitionGeometry: relation => relation.stateCurve || null,
  relationEndpoints: relation => relation.endpoints === null ? null : (relation.endpoints || endpoints),
  bindingRoute: relation => relation.route,
  polylinePath,
  polylineJumpPath,
  polylineMidpoint,
  relationLabel: relation => relation.label || relation.name || '',
  labelOffset: (relation, field) => relation.lblOff?.[field] || { dx: 0, dy: 0 },
  branchGeometry: relation => relation.branch || null,
  bezierPoint,
  relationSupportsEndQuickEdit,
  relationEndAggregation,
  relationEndNavigability,
  relationEndRoleLabel,
  relationStyles: REL_STYLE,
  erRelationKinds: ER_RELATION_KINDS,
};

const renderer = create(dependencies);
const render = relation => {
  const root = node();
  const group = renderer.draw(root, relation);
  return { root, group };
};
const visibleLine = group => group.children.find(child =>
  child.tag === 'line' && child.attrs.stroke !== 'transparent');

assert.throws(() => create({}), /관계 렌더러 의존성이 없습니다/);
assert.ok(Object.isFrozen(renderer));
assert.ok(Object.isFrozen(ERD_ENDS));
assert.equal(ERD_LINE, '#9c4130');
assert.deepEqual(relationMessageStyle({}), { head: 'filled', dash: null });
assert.deepEqual(relationMessageStyle({ messageSort: 'reply' }), { head: 'open', dash: '6 4' });
assert.deepEqual(relationMessageStyle({ messageSort: 'asynchCall' }), { head: 'open', dash: null });
assert.deepEqual(relationMessageStyle({ messageSort: 'asynchSignal' }), { head: 'open', dash: null });
assert.deepEqual(relationMessageStyle({ messageSort: 'createMessage' }, '3 2'), { head: 'open', dash: '3 2' });
assert.deepEqual(relationMessageStyle({ messageSort: 'deleteMessage' }), { head: 'x', dash: null });

const generalization = render({ id: 'general', kind: 'generalization', name: 'inherits' }).group;
assert.equal(generalization.attrs['data-rel'], 'general');
assert.equal(generalization.children.filter(child => child.tag === 'path').length, 1);
assert.equal(visibleLine(generalization).attrs.x2, 186, '삼각형 머리 아래로 선이 들어가지 않아야 합니다');
assert.equal(generalization.children.at(-1).attrs.value, 'inherits');

const dependency = render({ id: 'dependency', kind: 'dependency' }).group;
assert.equal(visibleLine(dependency).attrs['stroke-dasharray'], '6 4');
assert.equal(dependency.children.find(child => child.tag === 'path').attrs.fill, 'none');

const composition = render({
  id: 'composition', kind: 'composition',
  sourceEndName: 'whole', targetEndName: 'part', sourceLabel: '1', targetLabel: '0..*',
}).group;
assert.equal(visibleLine(composition).attrs.x2, 180);
assert.ok(composition.children.some(child => child.tag === 'path' && child.attrs.fill === '#3d3a2e'));
assert.deepEqual(
  composition.children.filter(child => child.tag === 'text').map(child => child.attrs.value),
  ['1', '0..*', 'whole', 'part'],
);

const erd = render({
  id: 'erd', kind: 'erd-1n', sourceLabel: '0..1', targetLabel: '1..N',
}).group;
assert.equal(visibleLine(erd).attrs['stroke-dasharray'], '6 3');
assert.equal(visibleLine(erd).attrs.stroke, ERD_LINE);
assert.deepEqual(
  erd.children.filter(child => child.tag === 'g').map(child => child.attrs['data-erd-cardinality']),
  ['0..1', '1..N'],
);

const branch = render({
  id: 'branch', kind: 'mindbranch', name: 'topic',
  branch: { p1: { x: 0, y: 0 }, c: { x: 50, y: 18 }, p2: { x: 100, y: 0 } },
}).group;
assert.equal(branch.children[0].attrs.d, 'M 0 0 Q 50 18 100 0');
assert.equal(branch.children.at(-1).attrs.value, 'topic');

const binding = render({
  id: 'binding', kind: 'bindingconnector', name: 'bind', routeMode: 'manual', jumpStyle: 'none',
  route: {
    points: [{ x: 0, y: 0 }, { x: 40, y: 0 }, { x: 40, y: 40 }],
    jumpCrossings: [], jumpCount: 2, bends: 1, crossings: 1,
  },
}).group;
assert.equal(binding.attrs['data-route-mode'], 'manual');
assert.equal(binding.attrs['data-route-jumps'], 0);
assert.equal(binding.children[0].attrs['pointer-events'], 'stroke');
assert.equal(binding.children.at(-1).attrs.value, 'bind');

const sequence = render({
  id: 'message', kind: 'msg-reply', y: 80, label: 'reply()',
  points: { p1: { x: 20, y: 80 }, p2: { x: 180, y: 80 }, self: false },
}).group;
assert.equal(visibleLine(sequence).attrs['stroke-dasharray'], '6 4');
assert.equal(sequence.children.at(-1).attrs.value, 'reply()');

const sequenceSelf = render({
  id: 'self-message', kind: 'msg-sync', y: 100,
  points: { startX: 80, endX: 80, y: 100, width: 44, height: 20, self: true },
}).group;
assert.ok(sequenceSelf.children.some(child => child.tag === 'rect' && child.attrs.fill === 'transparent'));
assert.ok(sequenceSelf.children.some(child => child.tag === 'path' && child.attrs.d.includes('L 124 120')));

const communication = render({
  id: 'communication', kind: 'comm-forward', label: '1: call()',
  communicationPoints: {
    self: false, p1: { x: 20, y: 50 }, p2: { x: 180, y: 70 }, normal: { x: 0, y: -1 },
  },
}).group;
assert.ok(communication.children.some(child => child.tag === 'rect' && child.attrs.opacity === 0.9));
assert.equal(communication.children.at(-1).attrs.value, '1: call()');

const communicationSelf = render({
  id: 'communication-self', kind: 'commconnector', name: 'loop',
  communicationCurve: {
    p1: { x: 20, y: 50 }, c1: { x: 20, y: 10 }, c2: { x: 80, y: 10 }, p2: { x: 80, y: 50 },
    label: { x: 50, y: 5 },
  },
}).group;
assert.equal(communicationSelf.children[0].attrs.d, 'M 20 50 C 20 10, 80 10, 80 50');
assert.equal(communicationSelf.children.at(-1).attrs.value, 'loop');

const stateSelf = render({
  id: 'state-self', kind: 'transition', label: 'retry',
  stateCurve: {
    p1: { x: 20, y: 50 }, c1: { x: 20, y: 10 }, c2: { x: 80, y: 10 }, p2: { x: 80, y: 50 },
    label: { x: 50, y: 5 },
  },
}).group;
assert.ok(stateSelf.children.some(child => child.tag === 'path' && child.attrs['stroke-linecap'] === 'round'));
assert.equal(stateSelf.children.at(-1).attrs.value, 'retry');

assert.equal(renderer.draw(node(), { id: 'missing', kind: 'dependency', endpoints: null }), undefined);
assert.equal(renderer.draw(node(), { id: 'missing-route', kind: 'bindingconnector' }), undefined);

let communicationGeometryCalls = 0;
let stateGeometryCalls = 0;
const countedRenderer = create({
  ...dependencies,
  communicationSelfConnectorGeometry: relation => {
    communicationGeometryCalls += 1;
    return relation.communicationCurve || null;
  },
  stateSelfTransitionGeometry: relation => {
    stateGeometryCalls += 1;
    return relation.stateCurve || null;
  },
});
countedRenderer.draw(node(), {
  id: 'counted-communication', kind: 'commconnector',
  communicationCurve: {
    p1: { x: 20, y: 50 }, c1: { x: 20, y: 10 }, c2: { x: 80, y: 10 }, p2: { x: 80, y: 50 },
    label: { x: 50, y: 5 },
  },
});
countedRenderer.draw(node(), {
  id: 'counted-state', kind: 'transition',
  stateCurve: {
    p1: { x: 20, y: 50 }, c1: { x: 20, y: 10 }, c2: { x: 80, y: 10 }, p2: { x: 80, y: 50 },
    label: { x: 50, y: 5 },
  },
});
assert.equal(communicationGeometryCalls, 2,
  '자기 연결 기하 계산은 관계 하나당 한 번만 수행해야 합니다');
assert.equal(stateGeometryCalls, 1,
  '상태 자기 전이 기하 계산은 관계 하나당 한 번만 수행해야 합니다');
console.log('relation renderer tests: ok');
