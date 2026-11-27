'use strict';

const assert = require('node:assert/strict');
const {
  REQUIRED_FUNCTIONS,
  REQUIRED_VALUES,
  KIND_SETS,
  create,
} = require('../dist/browser/canvas/containment-layout.js');
const {
  snap, center, pointInside, anchorPoint, relationEndpoints,
} = require('../dist/browser/canvas/canvas-geometry.js');

const COMPOSITE_CONTAINER_KINDS = new Set(['class', 'collaboration']);
const IBD_CONTAINER_KINDS = new Set(['ibdframe', 'part', 'reference']);
const IBD_TYPED_KINDS = new Set(['part', 'reference', 'value']);
const PARAMETRIC_CONTAINER_KINDS = new Set(['parametricframe', 'constraintproperty']);
const PACKAGE_CONTAINER_KINDS = new Set(['package', 'model', 'subsystem']);
const TIMING_LABEL_WIDTH = 176;
const TIMING_ROW_HEIGHT = 44;
const STATE_VERTEX_KINDS = new Set(['state', 'compositestate', 'stateinitial', 'statefinal', 'choice']);
const ACTIVITY_CONTAINER_KINDS = new Set(['swimlanev', 'swimlaneh', 'interruptibleregion', 'structuredactivity', 'expansionregion']);
const ACTIVITY_ACTION_KINDS = new Set(['action', 'sendsignal', 'acceptsignal', 'timeevent']);
const ACTIVITY_PIN_KINDS = new Set(['inputpin', 'outputpin', 'expansioninput', 'expansionoutput']);
const ACTIVITY_VERTEX_KINDS = new Set([...ACTIVITY_ACTION_KINDS, 'initial', 'final', 'decision', 'objectnode']);

function harness(diagram) {
  const active = diagram || { id: 'd1', type: 'class', name: 'D', elements: [], relations: [] };
  const state = { diagrams: [active], activeId: active.id, models: {} };
  const dg = () => state.diagrams.find(d => d.id === state.activeId);
  const byId = id => dg().elements.find(e => e.id === id);
  const synced = [];
  const deps = {
    anchorPoint,
    byId,
    center,
    dg,
    pointInside,
    relEndpoints: r => relationEndpoints(r, byId(r.from), byId(r.to)),
    snap,
    syncRelationModel: r => { synced.push(r.id); },
    ACTIVITY_ACTION_KINDS,
    ACTIVITY_CONTAINER_KINDS,
    ACTIVITY_PIN_KINDS,
    ACTIVITY_VERTEX_KINDS,
    COMPOSITE_CONTAINER_KINDS,
    IBD_CONTAINER_KINDS,
    IBD_TYPED_KINDS,
    PACKAGE_CONTAINER_KINDS,
    PARAMETRIC_CONTAINER_KINDS,
    STATE_VERTEX_KINDS,
    TIMING_LABEL_WIDTH,
    TIMING_ROW_HEIGHT,
  };
  return { deps, state, diagram: active, dg, byId, synced, layout: create(deps) };
}

const box = (id, kind, x, y, w, h, extra = {}) => ({ id, kind, x, y, w, h, ...extra });

assert.ok(Object.isFrozen(REQUIRED_FUNCTIONS));
assert.ok(Object.isFrozen(REQUIRED_VALUES));
assert.ok(Object.isFrozen(KIND_SETS));
assert.ok(KIND_SETS.includes('COMPOSITE_CONTAINER_KINDS'));

assert.throws(() => create(), /Containment Layout 의존성이 없습니다/);
assert.throws(() => create({}), /anchorPoint/);
{
  const { deps } = harness();
  const { dg: _dg, ...withoutDg } = deps;
  assert.throws(() => create(withoutDg), /dg/);
  assert.throws(() => create({ ...deps, TIMING_ROW_HEIGHT: null }), /TIMING_ROW_HEIGHT/);
  assert.throws(() => create({ ...deps, IBD_CONTAINER_KINDS: ['ibdframe'] }), /IBD_CONTAINER_KINDS\.has/);
}
{
  const { layout } = harness();
  assert.ok(Object.isFrozen(layout));
}

{
  const h = harness({
    id: 'd1', type: 'class', name: 'D', relations: [],
    elements: [
      box('root', 'class', 0, 0, 400, 400),
      box('a', 'part', 10, 10, 50, 50, { parentId: 'root' }),
      box('b', 'part', 70, 10, 50, 50, { parentId: 'root' }),
      box('a1', 'port', 12, 12, 18, 18, { parentId: 'a' }),
      box('loose', 'class', 500, 500, 50, 50),
    ],
  });
  const l = h.layout;
  assert.deepEqual(l.childViews('root').map(v => v.id), ['a', 'b']);
  assert.deepEqual(l.childViews('a').map(v => v.id), ['a1']);
  assert.deepEqual(l.childViews('missing'), []);
  assert.deepEqual(l.descendantViews('root').map(v => v.id), ['a', 'a1', 'b']);
  assert.deepEqual(l.descendantViews('a1'), []);

  assert.equal(l.containmentDepth(h.byId('root'), h.diagram), 0);
  assert.equal(l.containmentDepth(h.byId('a'), h.diagram), 1);
  assert.equal(l.containmentDepth(h.byId('a1'), h.diagram), 2);

  assert.deepEqual(l.containmentOrder(h.diagram).map(v => v.id), ['root', 'a', 'a1', 'b', 'loose'],
    '부모가 자식보다 먼저 오는 순서여야 합니다');

  assert.deepEqual(l.rootViews([h.byId('root'), h.byId('a'), h.byId('a1')]).map(v => v.id), ['root'],
    '선택 안에 조상이 있으면 자손은 제외합니다');
  assert.deepEqual(l.rootViews([h.byId('a'), h.byId('b')]).map(v => v.id), ['a', 'b']);

  assert.equal(l.isViewAncestor(h.byId('root'), h.byId('a1')), true);
  assert.equal(l.isViewAncestor(h.byId('a'), h.byId('b')), false);
  assert.equal(l.isViewAncestor(h.byId('a1'), h.byId('root')), false);
}
{
  const h = harness({
    id: 'd1', type: 'class', name: 'D', relations: [],
    elements: [
      box('x', 'class', 0, 0, 10, 10, { parentId: 'y' }),
      box('y', 'class', 0, 0, 10, 10, { parentId: 'x' }),
    ],
  });
  assert.equal(h.layout.containmentDepth(h.byId('x'), h.diagram), 1);
  assert.equal(h.layout.isViewAncestor(h.byId('x'), h.byId('y')), true);
  assert.deepEqual(h.layout.containmentOrder(h.diagram).map(v => v.id).sort(), ['x', 'y']);
}

{
  const h = harness({
    id: 'd1', type: 'package', name: 'P', relations: [],
    elements: [
      box('outer', 'model', 0, 0, 600, 600),
      box('inner', 'package', 100, 100, 200, 200),
      box('note', 'note', 100, 100, 200, 200),
    ],
  });
  assert.equal(h.layout.packageContainerAtPoint({ x: 150, y: 150 }).id, 'inner',
    '겹치면 더 작은 컨테이너가 이깁니다');
  assert.equal(h.layout.packageContainerAtPoint({ x: 500, y: 500 }).id, 'outer');
  assert.equal(h.layout.packageContainerAtPoint({ x: 150, y: 150 }, new Set(['inner'])).id, 'outer',
    '제외 목록은 후보에서 빠집니다');
  assert.equal(h.layout.packageContainerAtPoint({ x: 900, y: 900 }), null);
}
{
  const h = harness({
    id: 'd1', type: 'activity', name: 'A', relations: [],
    elements: [
      box('lane', 'swimlanev', 0, 0, 400, 800),
      box('region', 'interruptibleregion', 50, 50, 200, 200),
      box('act', 'action', 60, 60, 100, 40),
      box('exp', 'expansionregion', 300, 300, 200, 200),
    ],
  });
  assert.equal(h.layout.activityContainerAtPoint({ x: 100, y: 100 }).id, 'region');
  assert.equal(h.layout.activityContainerAtPoint({ x: 350, y: 700 }).id, 'lane');
  assert.equal(h.layout.activityAttachmentOwnerAtPoint('inputpin', { x: 100, y: 70 }).id, 'act',
    'pin은 Action 계열에만 붙습니다');
  assert.equal(h.layout.activityAttachmentOwnerAtPoint('expansioninput', { x: 100, y: 70 }), null);
  assert.equal(h.layout.activityAttachmentOwnerAtPoint('expansioninput', { x: 350, y: 350 }).id, 'exp');
}

{
  const composite = harness({ id: 'd1', type: 'composite', name: 'C', relations: [], elements: [] });
  assert.equal(composite.layout.isPortOwner({ kind: 'class' }), true);
  assert.equal(composite.layout.isPortOwner({ kind: 'part' }), true);
  assert.equal(composite.layout.isPortOwner({ kind: 'reference' }), false, 'Composite에서는 reference가 Port 소유자가 아닙니다');

  const ibd = harness({ id: 'd1', type: 'ibd', name: 'I', relations: [], elements: [] });
  assert.equal(ibd.layout.isPortOwner({ kind: 'reference' }), true);
  assert.equal(ibd.layout.isPortOwner({ kind: 'ibdframe' }), true);

  const parametric = harness({ id: 'd1', type: 'parametric', name: 'P', relations: [], elements: [] });
  assert.equal(parametric.layout.isPortOwner({ kind: 'constraintproperty' }), true);
}

{
  const h = harness({
    id: 'd1', type: 'composite', name: 'C', relations: [],
    elements: [
      box('owner', 'class', 100, 100, 200, 100),
      box('p1', 'port', 0, 0, 18, 18, { parentId: 'owner', borderAnchor: { fx: 1, fy: 0.5 } }),
      box('p2', 'port', 0, 0, 18, 18, { parentId: 'owner', borderAnchor: { fx: 0, fy: 0.5 } }),
      box('p3', 'port', 5, 5, 18, 18, { parentId: 'missing' }),
    ],
  });
  h.layout.layoutCompositePorts(h.diagram);
  assert.deepEqual({ x: h.byId('p1').x, y: h.byId('p1').y }, { x: 300 - 9, y: 150 - 9 },
    '오른쪽 앵커 Port는 소유자 오른쪽 변 중앙에 붙습니다');
  assert.deepEqual({ x: h.byId('p2').x, y: h.byId('p2').y }, { x: 100 - 9, y: 150 - 9 });
  assert.deepEqual({ x: h.byId('p3').x, y: h.byId('p3').y }, { x: 5, y: 5 }, '소유자가 없으면 그대로 둡니다');
}
{
  const h = harness({
    id: 'd1', type: 'activity', name: 'A', relations: [],
    elements: [
      box('act', 'action', 200, 200, 160, 60),
      box('in', 'inputpin', 0, 0, 16, 16, { parentId: 'act' }),
      box('out', 'outputpin', 0, 0, 16, 16, { parentId: 'act' }),
    ],
  });
  h.layout.layoutActivityAttachments(h.diagram);
  assert.equal(h.byId('in').x, 200 - 8, 'input pin은 기본으로 왼쪽 변에 붙습니다');
  assert.equal(h.byId('out').x, 360 - 8, 'output pin은 기본으로 오른쪽 변에 붙습니다');
  assert.equal(h.byId('in').y, 230 - 8);
}
{
  const h = harness({
    id: 'd1', type: 'state', name: 'S', relations: [],
    elements: [
      box('sub', 'submachinestate', 100, 100, 300, 120),
      box('entry', 'connectionpointref', 0, 0, 20, 20, { parentId: 'sub', borderAnchor: { fx: 0, fy: 0.5 } }),
      box('orphan', 'connectionpointref', 7, 7, 20, 20, { parentId: 'nope' }),
    ],
  });
  h.layout.layoutConnectionPointRefs(h.diagram);
  assert.deepEqual({ x: h.byId('entry').x, y: h.byId('entry').y }, { x: 90, y: 150 });
  assert.deepEqual({ x: h.byId('orphan').x, y: h.byId('orphan').y }, { x: 7, y: 7 });
}
{
  const h = harness({
    id: 'd1', type: 'parametric', name: 'P', relations: [],
    elements: [
      box('cp', 'constraintproperty', 100, 100, 200, 100),
      box('r', 'constraintparameter', 0, 0, 18, 18, { parentId: 'cp', borderAnchor: { fx: 0, fy: 0.25 } }),
      box('loose', 'constraintparameter', 3, 3, 18, 18, { parentId: 'cp2' }),
    ],
  });
  h.layout.layoutParametricParameters(h.diagram);
  assert.deepEqual({ x: h.byId('r').x, y: h.byId('r').y }, { x: 91, y: 116 });
  assert.deepEqual({ x: h.byId('loose').x, y: h.byId('loose').y }, { x: 3, y: 3 });
}

{
  const h = harness({
    id: 'd1', type: 'state', name: 'S', relations: [],
    elements: [
      box('cs', 'compositestate', 100, 100, 400, 300, { _m: { contentTop: 40 } }),
      box('r2', 'region', 0, 0, 0, 0, { parentId: 'cs', regionOrder: 1 }),
      box('r1', 'region', 0, 0, 0, 0, { parentId: 'cs', regionOrder: 0 }),
      box('inner', 'state', 160, 180, 40, 20, { parentId: 'r1' }),
    ],
  });
  h.layout.layoutCompositeRegions(h.diagram);
  const r1 = h.byId('r1'), r2 = h.byId('r2');
  assert.equal(r1.regionOrder, 0);
  assert.equal(r2.regionOrder, 1);
  assert.equal(r1.x, 106, 'Region은 소유자 안쪽으로 6px 들여씁니다');
  assert.equal(r1.w, 388);
  assert.equal(r1.y, 140, 'contentTop 아래에서 시작합니다');
  assert.equal(r2.y, r1.y + r1.h, '직교 Region은 위아래로 균등 분할합니다');
  assert.ok(Math.abs(r1.h - r2.h) <= 1);
  assert.equal(r1.y + r1.h + r2.h, 394);

  const beforeY = h.byId('inner').y;
  h.byId('cs').h = 600;
  h.layout.layoutCompositeRegions(h.diagram);
  assert.ok(h.byId('inner').y !== beforeY, 'Region이 커지면 자식도 비례해 이동합니다');
  assert.ok(h.byId('inner').y >= h.byId('r1').y - 8);
}
{
  const h = harness({
    id: 'd1', type: 'state', name: 'S', relations: [],
    elements: [box('cs', 'compositestate', 0, 0, 200, 200)],
  });
  assert.doesNotThrow(() => h.layout.layoutCompositeRegions(h.diagram), 'Region이 없으면 아무것도 하지 않습니다');
}

{
  const h = harness({
    id: 'd1', type: 'state', name: 'S', relations: [],
    elements: [
      box('cs', 'compositestate', 100, 100, 400, 300),
      box('r1', 'region', 106, 140, 388, 120, { parentId: 'cs' }),
    ],
  });
  assert.equal(h.layout.regionAtPoint({ x: 200, y: 200 }).id, 'r1');
  assert.equal(h.layout.regionAtPoint({ x: 200, y: 200 }, new Set(['r1'])), null);
  assert.equal(h.layout.compositeAtPoint({ x: 200, y: 200 }).id, 'cs');
  assert.equal(h.layout.compositeAtPoint({ x: 900, y: 900 }), null);
}

{
  const h = harness({
    id: 'd1', type: 'package', name: 'P',
    elements: [
      box('outer', 'model', 0, 0, 600, 600),
      box('pkg', 'package', 100, 100, 100, 100),
    ],
    relations: [{ id: 'c1', kind: 'containment', from: 'pkg', to: 'other', srcAnchor: { fx: 0, fy: 0 } }],
  });
  h.layout.attachToPackageContainer(h.byId('pkg'));
  assert.equal(h.byId('pkg').parentId, 'outer');
  const containment = h.diagram.relations[0];
  assert.equal(containment.to, 'outer', 'Containment 관계의 대상도 함께 옮깁니다');
  assert.equal(containment.srcAnchor, undefined, '앵커는 초기화합니다');
  assert.deepEqual(h.synced, ['c1']);

  h.byId('pkg').x = 2000; h.byId('pkg').y = 2000;
  h.layout.attachToPackageContainer(h.byId('pkg'));
  assert.equal(h.byId('pkg').parentId, undefined);
  assert.deepEqual(h.diagram.relations, []);
}
{
  const h = harness({
    id: 'd1', type: 'package', name: 'P', relations: [],
    elements: [box('note', 'note', 10, 10, 50, 50)],
  });
  h.layout.attachToPackageContainer(h.byId('note'));
  assert.equal(h.byId('note').parentId, undefined, 'Package 컨테이너가 아닌 종류는 건드리지 않습니다');
}
{
  const h = harness({
    id: 'd1', type: 'activity', name: 'A', relations: [],
    elements: [
      box('lane', 'swimlanev', 0, 0, 400, 800),
      box('act', 'action', 100, 100, 100, 40),
      box('pin', 'inputpin', 100, 100, 16, 16),
    ],
  });
  h.layout.attachToActivityContainer(h.byId('act'));
  assert.equal(h.byId('act').parentId, 'lane');
  h.layout.attachToActivityContainer(h.byId('pin'));
  assert.equal(h.byId('pin').parentId, undefined, 'pin은 컨테이너 재부착 대상이 아닙니다');
  h.byId('act').x = 2000;
  h.layout.attachToActivityContainer(h.byId('act'));
  assert.equal(h.byId('act').parentId, undefined);
}
{
  const h = harness({
    id: 'd1', type: 'ibd', name: 'I', relations: [],
    elements: [
      box('frame', 'ibdframe', 0, 0, 800, 600),
      box('part', 'part', 100, 100, 200, 100),
    ],
  });
  h.layout.attachToInternalBlockContainer(h.byId('part'));
  assert.equal(h.byId('part').parentId, 'frame');
  h.byId('part').x = -50; h.byId('part').y = 0;
  h.layout.attachToInternalBlockContainer(h.byId('part'));
  assert.equal(h.byId('part').x, 16, '왼쪽 여백 12px 이상으로 스냅합니다');
  assert.equal(h.byId('part').y, 48, 'ibdframe은 위쪽 44px를 머리글로 비웁니다');
}
{
  const h = harness({
    id: 'd1', type: 'parametric', name: 'P', relations: [],
    elements: [
      box('frame', 'parametricframe', 0, 0, 800, 600),
      box('v', 'value', 100, 100, 200, 80),
    ],
  });
  h.layout.attachToParametricContainer(h.byId('v'));
  assert.equal(h.byId('v').parentId, 'frame');
  h.byId('v').y = 0;
  h.layout.attachToParametricContainer(h.byId('v'));
  assert.equal(h.byId('v').y, 48);
}
{
  const h = harness({
    id: 'd1', type: 'composite', name: 'C', relations: [],
    elements: [
      box('owner', 'class', 0, 0, 600, 400),
      box('part', 'part', 100, 100, 100, 60),
    ],
  });
  h.layout.attachPartToCompositeContainer(h.byId('part'));
  assert.equal(h.byId('part').parentId, 'owner');
  h.byId('part').x = 2000; h.byId('part').y = -100;
  h.layout.attachPartToCompositeContainer(h.byId('part'));
  assert.equal(h.byId('part').parentId, 'owner', '소유자는 유지합니다');
  assert.equal(h.byId('part').y, 48, 'Composite 소유자는 위쪽 48px를 비웁니다');
  assert.equal(h.byId('part').x, snap(600 - 100 - 12));
}
{
  const h = harness({
    id: 'd1', type: 'state', name: 'S', relations: [],
    elements: [
      box('cs', 'compositestate', 0, 0, 400, 400),
      box('r1', 'region', 10, 40, 380, 200, { parentId: 'cs' }),
      box('st', 'state', 100, 100, 80, 40),
    ],
  });
  h.layout.attachToContainingRegion(h.byId('st'));
  assert.equal(h.byId('st').parentId, 'r1');
  h.byId('st').y = 900;
  h.layout.attachToContainingRegion(h.byId('st'));
  assert.equal(h.byId('st').parentId, undefined);
}

{
  const { layout } = harness();
  assert.deepEqual(layout.compositePortDirection({ borderAnchor: { fx: 0, fy: 0.5 } }), { x: -1, y: 0 });
  assert.deepEqual(layout.compositePortDirection({ borderAnchor: { fx: 1, fy: 0.5 } }), { x: 1, y: 0 });
  assert.deepEqual(layout.compositePortDirection({ borderAnchor: { fx: 0.5, fy: 0 } }), { x: 0, y: -1 });
  assert.deepEqual(layout.compositePortDirection({ borderAnchor: { fx: 0.5, fy: 1 } }), { x: 0, y: 1 });
  assert.deepEqual(layout.compositePortDirection({}), { x: 1, y: 0 }, '앵커가 없으면 오른쪽이 기본입니다');
}

{
  const h = harness({
    id: 'd1', type: 'activity', name: 'A', relations: [],
    elements: [
      box('lane', 'swimlanev', 0, 0, 400, 800),
      box('exp', 'expansionregion', 50, 50, 200, 200, { parentId: 'lane' }),
      box('act', 'action', 60, 60, 100, 40, { parentId: 'exp' }),
    ],
  });
  assert.equal(h.layout.activityAncestor(h.byId('act'), 'expansionregion').id, 'exp');
  assert.equal(h.layout.activityAncestor(h.byId('act'), 'swimlanev').id, 'lane');
  assert.equal(h.layout.activityAncestor(h.byId('act'), 'structuredactivity'), null);
  assert.equal(h.layout.activityAncestor(h.byId('lane'), 'swimlanev'), null, '자기 자신은 조상이 아닙니다');
}

{
  const h = harness({
    id: 'd1', type: 'timing', name: 'T',
    elements: [
      box('l1', 'lifeline', 100, 100, 1000, 100),
      box('s2', 'timingstate', 0, 0, 0, 0, { parentId: 'l1', stateOrder: 1 }),
      box('s1', 'timingstate', 0, 0, 0, 0, { parentId: 'l1', stateOrder: 0 }),
      box('seg', 'timesegment', 0, 0, 100, 4, { parentId: 's1' }),
      box('tick', 'timetick', 300, 0, 8, 0),
      box('tc', 'timeconstraint', 0, 0, 120, 28, { constrainedViewId: 'seg', anchorRatio: 0 }),
    ],
    relations: [],
  });
  h.layout.layoutTimingDiagram(h.diagram);
  const l1 = h.byId('l1'), s1 = h.byId('s1'), s2 = h.byId('s2'), seg = h.byId('seg');
  assert.equal(l1.h, 44 + 2 * TIMING_ROW_HEIGHT, '상태 행 수만큼 라이프라인이 높아집니다');
  assert.equal(s1.stateOrder, 0);
  assert.equal(s2.stateOrder, 1);
  assert.equal(s1.y, 100 + 44);
  assert.equal(s2.y, 100 + 44 + TIMING_ROW_HEIGHT);
  assert.equal(s1.w, l1.w);
  assert.equal(s1.h, TIMING_ROW_HEIGHT);
  assert.equal(seg.h, 10, 'Time Segment 두께는 고정입니다');
  assert.equal(seg.x, 100 + TIMING_LABEL_WIDTH + 8, '라벨 칸 안쪽으로는 들어가지 않습니다');
  assert.equal(seg.y, s1.y + s1.h / 2 - 5);

  const tick = h.byId('tick');
  assert.equal(tick.y, 100);
  assert.equal(tick.w, 8);
  assert.equal(tick.h, Math.max(120, l1.y + l1.h + 40 - 100));

  const tc = h.byId('tc');
  assert.equal(tc.x, seg.x - 60, 'Time Constraint는 대상 Segment 시작점에 맞춥니다');
  assert.equal(tc.y, seg.y + seg.h / 2 - 54);
}
{
  const h = harness({
    id: 'd1', type: 'timing', name: 'T', relations: [],
    elements: [box('tick', 'timetick', 300, 0, 8, 0)],
  });
  h.layout.layoutTimingDiagram(h.diagram);
  assert.equal(h.byId('tick').y, 72);
  assert.equal(h.byId('tick').h, Math.max(120, 560 - 72));
}
{
  const h = harness({
    id: 'd1', type: 'timing', name: 'T',
    elements: [
      box('a', 'timesegment', 100, 100, 60, 10),
      box('b', 'timesegment', 400, 300, 60, 10),
    ],
    relations: [{ id: 'm1', kind: 'timingmessage', from: 'a', to: 'b' }],
  });
  const onElement = h.layout.timingConstraintAnchor('a', h.diagram, 0.5);
  assert.deepEqual(onElement, { x: 130, y: 105 });
  assert.deepEqual(h.layout.timingConstraintAnchor('a', h.diagram, 0), { x: 100, y: 105 });
  assert.deepEqual(h.layout.timingConstraintAnchor('a', h.diagram, 99), { x: 160, y: 105 }, '비율은 0~1로 자릅니다');
  assert.deepEqual(h.layout.timingConstraintAnchor('a', h.diagram, NaN), { x: 130, y: 105 });
  const onMessage = h.layout.timingConstraintAnchor('m1', h.diagram);
  assert.ok(onMessage && Number.isFinite(onMessage.x) && Number.isFinite(onMessage.y),
    'Timing Message에도 Constraint를 붙일 수 있습니다');
  assert.equal(h.layout.timingConstraintAnchor('nope', h.diagram), null);
}
{
  const h = harness({
    id: 'd1', type: 'timing', name: 'T', relations: [],
    elements: [
      box('l1', 'lifeline', 0, 0, 1000, 200),
      box('s1', 'timingstate', 0, 44, 1000, 44, { parentId: 'l1' }),
    ],
  });
  assert.equal(h.layout.timingLifelineAtPoint({ x: 500, y: 20 }).id, 'l1');
  assert.equal(h.layout.timingStateAtPoint({ x: 500, y: 60 }).id, 's1');
  assert.equal(h.layout.timingStateAtPoint({ x: 500, y: 500 }), null);
}

{
  const h = harness({
    id: 'd1', type: 'class', name: 'D', relations: [],
    elements: [
      box('root', 'class', 100, 100, 200, 100),
      box('child', 'part', 120, 120, 60, 30, { parentId: 'root' }),
    ],
  });
  h.layout.moveViewTree(h.byId('root'), 40, 24);
  assert.equal(h.byId('root').x, snap(140));
  assert.equal(h.byId('child').x, snap(160), '자손도 함께 움직입니다');
  assert.equal(h.byId('child').y, snap(144));

  const tree = [h.byId('root'), h.byId('child')];
  const origins = new Map(tree.map(v => [v.id, { x: v.x, y: v.y }]));
  h.layout.moveViewTree(h.byId('root'), 8, 8, origins);
  h.layout.moveViewTree(h.byId('root'), 16, 16, origins);
  assert.equal(h.byId('root').x, snap(140 + 16), '마지막 델타만 반영됩니다');

  h.layout.moveViewTree(h.byId('root'), -100000, -100000);
  assert.equal(h.byId('root').x, 0);
  assert.equal(h.byId('root').y, 0);
}
{
  const h = harness({
    id: 'd1', type: 'sequence', name: 'S', relations: [],
    elements: [box('l', 'lifeline', 100, 32, 80, 40)],
  });
  h.layout.moveViewTree(h.byId('l'), 40, 200);
  assert.equal(h.byId('l').x, snap(140));
  assert.equal(h.byId('l').y, 32, 'Sequence 라이프라인의 y는 고정입니다');
}

console.log('containment layout tests: ok');
