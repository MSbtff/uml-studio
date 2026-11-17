'use strict';

const assert = require('node:assert/strict');
const geometry = require('../canvas-geometry.js');
const router = require('../orthogonal-router.js');
const {
  REQUIRED_FUNCTIONS,
  REQUIRED_VALUES,
  ROUTING,
  create,
} = require('../parametric-binding.js');

const element = (id, kind, extra = {}) => ({ id, kind, x: 0, y: 0, w: 100, h: 60, ...extra });
const connector = (id, extra = {}) => ({ id, kind: 'bindingconnector', from: 'a', to: 'b', ...extra });
const pt = (x, y) => ({ x, y });

function harness(overrides = {}) {
  const diagram = overrides.diagram || { id: 'd1', type: 'parametric', elements: [], relations: [] };
  const calls = [];
  const record = name => (...args) => { calls.push({ name, args }); };
  let idSeq = 0;
  const state = { models: overrides.models || {}, diagrams: [diagram], ...overrides.state };
  const deps = {
    adoptView: view => view,
    byId: id => diagram.elements.find(e => e.id === id) || null,
    childViews: parentId => diagram.elements.filter(e => e.parentId === parentId),
    collectPolylineCrossings: router.collectPolylineCrossings,
    compactBindingWaypoints: geometry.compactBindingWaypoints,
    createElement: (kind, x, y) => ({ id: `p${++idSeq}`, kind, x, y, w: 18, h: 18 }),
    dg: () => diagram,
    distanceAlongPolyline: geometry.distanceAlongPolyline,
    flashStatus: msg => { calls.push({ name: 'flashStatus', args: [msg] }); },
    instanceClassifier: view => (view.classifierModelId ? state.models[view.classifierModelId] : null),
    nearestPolylineSegmentIndex: geometry.nearestPolylineSegmentIndex,
    parseConstraintParameterDefinition: text => {
      const [name, typeName] = String(text).split(':').map(s => s.trim());
      return name ? { name, typeName: typeName || '' } : null;
    },
    relEndpoints: r => r.endpoints || null,
    renderAll: record('renderAll'),
    routeManualOrthogonal: opts => ({ points: [opts.start, ...opts.waypoints, opts.end], via: 'manual' }),
    routeOrthogonal: opts => ({ points: [opts.start, opts.end], via: 'auto', opts }),
    setSelection: ids => { calls.push({ name: 'setSelection', args: [ids] }); },
    snap: v => Math.round(v / 8) * 8,
    snapshot: record('snapshot'),
    GRID: 8,
    state,
    ...overrides.deps,
  };
  return {
    calls, deps, diagram, state,
    pb: create(deps),
    named: name => calls.filter(c => c.name === name),
    messages: () => calls.filter(c => c.name === 'flashStatus').map(c => c.args[0]),
  };
}

/* ── module contract ───────────────────────────────────────── */

assert.ok(Object.isFrozen(REQUIRED_FUNCTIONS));
assert.ok(Object.isFrozen(REQUIRED_VALUES));
assert.ok(Object.isFrozen(ROUTING));
assert.ok(Object.isFrozen(harness().pb), '컨트롤러는 동결해야 합니다');

assert.throws(() => create(), /Parametric Binding 의존성이 없습니다/);
assert.throws(() => create({}), err => {
  REQUIRED_FUNCTIONS.forEach(name => assert.match(err.message, new RegExp(name)));
  REQUIRED_VALUES.forEach(name => assert.match(err.message, new RegExp(name)));
  return true;
});
{
  const { deps } = harness();
  const partial = { ...deps };
  delete partial.routeOrthogonal;
  delete partial.GRID;
  assert.throws(() => create(partial), /Parametric Binding 의존성이 없습니다: routeOrthogonal, GRID$/);
}

/* two independent controllers must not share a route cache */
{
  const a = harness(), b = harness();
  a.diagram.elements.push(element('a', 'part'), element('b', 'part', { x: 300 }));
  a.diagram.relations.push(connector('r1', { endpoints: { p1: pt(0, 0), p2: pt(300, 0) } }));
  a.pb.computeRoutes(a.diagram);
  assert.equal(a.pb.route(a.diagram.relations[0]).via, 'auto');
  assert.equal(b.pb.route(connector('r1', { endpoints: { p1: pt(0, 0), p2: pt(9, 9) } })).via, undefined);
}

/* ── port direction ────────────────────────────────────────── */

{
  const h = harness();
  const owner = element('own', 'constraintproperty', { x: 100, y: 100, w: 200, h: 100 });
  h.diagram.elements.push(owner);
  const anchored = (fx, fy) => element('p', 'constraintparameter', { parentId: 'own', borderAnchor: { fx, fy } });
  assert.deepEqual(h.pb.portDirection(anchored(0, 0.5), pt(0, 0)), { x: -1, y: 0 });
  assert.deepEqual(h.pb.portDirection(anchored(1, 0.5), pt(0, 0)), { x: 1, y: 0 });
  assert.deepEqual(h.pb.portDirection(anchored(0.5, 0), pt(0, 0)), { x: 0, y: -1 });
  assert.deepEqual(h.pb.portDirection(anchored(0.5, 1), pt(0, 0)), { x: 0, y: 1 });
}
{
  /* an orphaned or unanchored parameter falls back to its nearest edge */
  const h = harness();
  const loose = element('p', 'constraintparameter', { parentId: 'gone', borderAnchor: { fx: 0, fy: 0.5 }, x: 0, y: 0, w: 100, h: 60 });
  assert.deepEqual(h.pb.portDirection(loose, pt(99, 30)), { x: 1, y: 0 }, '주인이 없으면 앵커를 못 씁니다');
  const noAnchor = element('p', 'constraintparameter', { x: 0, y: 0, w: 100, h: 60 });
  assert.deepEqual(h.pb.portDirection(noAnchor, pt(50, 1)), { x: 0, y: -1 });
}
{
  /* ordinary views always use the nearest edge */
  const h = harness();
  const view = element('v', 'part', { x: 0, y: 0, w: 100, h: 60 });
  assert.deepEqual(h.pb.portDirection(view, pt(2, 30)), { x: -1, y: 0 });
  assert.deepEqual(h.pb.portDirection(view, pt(98, 30)), { x: 1, y: 0 });
  assert.deepEqual(h.pb.portDirection(view, pt(50, 2)), { x: 0, y: -1 });
  assert.deepEqual(h.pb.portDirection(view, pt(50, 58)), { x: 0, y: 1 });
}

/* ── route computation ─────────────────────────────────────── */

{
  const h = harness();
  h.diagram.elements.push(
    element('a', 'part', { x: 0, y: 0 }),
    element('b', 'part', { x: 400, y: 0 }),
    element('c', 'part', { x: 200, y: 0 }),
    element('frame', 'parametricframe', { x: -50, y: -50, w: 900, h: 500 }),
    element('zero', 'part', { x: 10, y: 10, w: 0, h: 20 }),
    element('nan', 'part', { x: 10, y: 10, w: NaN, h: 20 }),
  );
  const rel = connector('r1', { endpoints: { p1: pt(100, 30), p2: pt(400, 30) } });
  h.diagram.relations.push(rel);
  h.pb.computeRoutes(h.diagram);
  const route = h.pb.route(rel);
  assert.equal(route.via, 'auto');
  assert.equal(route.opts.clearance, ROUTING.clearance);
  assert.equal(route.opts.grid, 8);
  assert.deepEqual(route.opts.obstacles.map(o => o.x), [200],
    '프레임 · 양끝 요소 · 크기가 없는 요소는 장애물에서 빼야 합니다');
  assert.deepEqual(route.opts.startDirection, { x: 1, y: 0 });
  assert.deepEqual(route.opts.endDirection, { x: -1, y: 0 });
}

{
  /* only parametric diagrams are routed, and a stale cache is dropped */
  const h = harness();
  h.diagram.elements.push(element('a', 'part'), element('b', 'part', { x: 400 }));
  const rel = connector('r1', { endpoints: { p1: pt(100, 30), p2: pt(400, 30) } });
  h.diagram.relations.push(rel);
  h.pb.computeRoutes(h.diagram);
  assert.equal(h.pb.route(rel).via, 'auto');

  h.diagram.type = 'ibd';
  h.pb.computeRoutes(h.diagram);
  assert.equal(h.pb.route(rel).via, undefined, '캐시를 비우고 직선으로 되돌아가야 합니다');
  h.pb.computeRoutes(null);
  assert.equal(h.pb.route(rel).via, undefined);
}

{
  /* relations whose endpoints cannot be resolved are skipped */
  const h = harness();
  h.diagram.elements.push(element('a', 'part'));
  const noEndpoints = connector('r1');
  const missingView = connector('r2', { to: 'gone', endpoints: { p1: pt(0, 0), p2: pt(9, 9) } });
  h.diagram.relations.push(noEndpoints, missingView, { id: 'r3', kind: 'connector' });
  assert.doesNotThrow(() => h.pb.computeRoutes(h.diagram));
  assert.equal(h.pb.route(noEndpoints), null, '끝점을 못 구하면 라우트가 없습니다');
  assert.equal(h.pb.route(missingView).via, undefined,
    '요소 한쪽이 사라진 관계는 라우팅에서 빠지고 직선으로 남습니다');
}

{
  /* each route sees the ones laid before it, so jumps accumulate */
  const h = harness();
  h.diagram.elements.push(element('a', 'part', { x: 0, y: 0 }), element('b', 'part', { x: 400, y: 0 }));
  const first = connector('r1', { endpoints: { p1: pt(50, -100), p2: pt(50, 100) } });
  const second = connector('r2', { endpoints: { p1: pt(-50, 0), p2: pt(150, 0) } });
  h.diagram.relations.push(first, second);
  h.pb.computeRoutes(h.diagram);
  assert.equal(h.pb.route(first).jumpCount, 0, '첫 라우트는 넘을 선이 없습니다');
  assert.equal(h.pb.route(second).jumpCount, h.pb.route(second).jumpCrossings.length);
  assert.ok(h.pb.route(second).jumpCount > 0, '나중 라우트는 앞선 라우트를 넘어야 합니다');
}
{
  /* jumpStyle 'none' opts out of the crossings entirely */
  const h = harness();
  h.diagram.elements.push(element('a', 'part', { x: 0, y: 0 }), element('b', 'part', { x: 400, y: 0 }));
  const first = connector('r1', { endpoints: { p1: pt(50, -100), p2: pt(50, 100) } });
  const second = connector('r2', { jumpStyle: 'none', endpoints: { p1: pt(-50, 0), p2: pt(150, 0) } });
  h.diagram.relations.push(first, second);
  h.pb.computeRoutes(h.diagram);
  assert.deepEqual(h.pb.route(second).jumpCrossings, []);
  assert.equal(h.pb.route(second).jumpCount, 0);
}

{
  /* a manual route is handed its own waypoints */
  const h = harness();
  h.diagram.elements.push(element('a', 'part'), element('b', 'part', { x: 400 }));
  const rel = connector('r1', {
    routeMode: 'manual',
    manualPoints: [pt(150, 30), pt(150, 90)],
    endpoints: { p1: pt(100, 30), p2: pt(400, 90) },
  });
  h.diagram.relations.push(rel);
  h.pb.computeRoutes(h.diagram);
  const route = h.pb.route(rel);
  assert.equal(route.via, 'manual');
  assert.deepEqual(route.points, [pt(100, 30), pt(150, 30), pt(150, 90), pt(400, 90)]);
}

{
  /* the fallback route is a straight line with zeroed metrics */
  const h = harness();
  const rel = connector('r1', { endpoints: { p1: pt(1, 2), p2: pt(3, 4) } });
  const route = h.pb.route(rel);
  assert.deepEqual(route.points, [pt(1, 2), pt(3, 4)]);
  assert.deepEqual(
    [route.obstacleHits, route.crossings, route.overlap, route.bends, route.jumpCount, route.jumpCrossings],
    [0, 0, 0, 0, 0, []]);
  assert.equal(h.pb.route(connector('r2')), null);
}

/* ── manual waypoints ──────────────────────────────────────── */

{
  const h = harness();
  assert.deepEqual(h.pb.waypoints(connector('r1')), []);
  assert.deepEqual(h.pb.waypoints(connector('r1', { manualPoints: 'nope' })), []);
  assert.deepEqual(
    h.pb.waypoints(connector('r1', { manualPoints: [pt(1, 2), { x: NaN, y: 3 }, null, pt(4, 5)] })),
    [pt(1, 2), pt(4, 5)], '좌표가 온전한 점만 남겨야 합니다');
  const source = [{ x: 1, y: 2, extra: 'drop me' }];
  assert.deepEqual(h.pb.waypoints(connector('r1', { manualPoints: source })), [pt(1, 2)]);
  assert.notEqual(h.pb.waypoints(connector('r1', { manualPoints: source }))[0], source[0],
    '원본 점을 그대로 넘기면 안 됩니다');
}

{
  /* lock freezes the current route as manual points, without the two ends */
  const h = harness();
  h.diagram.elements.push(element('a', 'part'), element('b', 'part', { x: 400 }));
  const rel = connector('r1', {
    routeMode: 'manual',
    manualPoints: [pt(150, 30), pt(150, 90)],
    endpoints: { p1: pt(100, 30), p2: pt(400, 90) },
  });
  h.diagram.relations.push(rel);
  h.pb.computeRoutes(h.diagram);
  delete rel.routeMode; delete rel.manualPoints;
  h.pb.lock(rel);
  assert.equal(rel.routeMode, 'manual');
  assert.deepEqual(rel.manualPoints, [pt(150, 30), pt(150, 90)]);

  /* locking again must not overwrite what the user already adjusted */
  rel.manualPoints = [pt(1, 1)];
  h.pb.lock(rel);
  assert.deepEqual(rel.manualPoints, [pt(1, 1)]);

  h.pb.unlock(rel);
  assert.equal('routeMode' in rel, false);
  assert.equal('manualPoints' in rel, false);
}
{
  const h = harness();
  const notAConnector = { id: 'x', kind: 'connector', routeMode: 'manual', manualPoints: [pt(1, 1)] };
  h.pb.lock(notAConnector);
  h.pb.unlock(notAConnector);
  assert.deepEqual(notAConnector.manualPoints, [pt(1, 1)], 'Binding Connector가 아니면 손대지 않습니다');
  assert.doesNotThrow(() => { h.pb.lock(null); h.pb.unlock(null); });
}

{
  /* a new waypoint sorts into the right place along the route */
  const h = harness();
  const rel = connector('r1', { endpoints: { p1: pt(0, 0), p2: pt(200, 0) } });
  assert.equal(h.pb.addWaypoint(rel, pt(101, 3)), true);
  assert.equal(rel.routeMode, 'manual');
  assert.deepEqual(rel.manualPoints, [pt(104, 0)], '새 점은 그리드에 맞춰야 합니다');

  assert.equal(h.pb.addWaypoint(rel, pt(50, 2)), true);
  assert.deepEqual(rel.manualPoints, [pt(48, 0), pt(104, 0)], '앞쪽 점은 앞에 끼워야 합니다');

  assert.equal(h.pb.addWaypoint(rel, pt(180, 2)), true);
  assert.deepEqual(rel.manualPoints, [pt(48, 0), pt(104, 0), pt(184, 0)], '뒤쪽 점은 끝에 붙여야 합니다');
}
{
  /* an explicit segment index wins over the nearest-segment guess, and is clamped */
  const h = harness();
  const rel = connector('r1', { endpoints: { p1: pt(0, 0), p2: pt(200, 0) } });
  assert.equal(h.pb.addWaypoint(rel, pt(40, 0), 99), true);
  assert.deepEqual(rel.manualPoints, [pt(40, 0)]);
  const other = connector('r2', { endpoints: { p1: pt(0, 0), p2: pt(200, 0) } });
  assert.equal(h.pb.addWaypoint(other, pt(40, 0), -5), true);
  assert.deepEqual(other.manualPoints, [pt(40, 0)]);
}
{
  /* guards: wrong kind, no route, and the waypoint ceiling */
  const h = harness();
  assert.equal(h.pb.addWaypoint(null, pt(0, 0)), false);
  assert.equal(h.pb.addWaypoint({ id: 'x', kind: 'connector' }, pt(0, 0)), false);
  assert.equal(h.pb.addWaypoint(connector('r1'), pt(0, 0)), false, '라우트가 없으면 추가할 수 없습니다');
  const full = connector('r2', {
    endpoints: { p1: pt(0, 0), p2: pt(200, 0) },
    routeMode: 'manual',
    manualPoints: Array.from({ length: ROUTING.maxWaypoints }, (_, i) => pt(i, 0)),
  });
  assert.equal(h.pb.addWaypoint(full, pt(10, 0)), false, '경유점 상한을 넘길 수 없습니다');
}

/* ── Constraint Parameter synchronisation ──────────────────── */

const constraintHarness = (parameters, extra = {}) => {
  const container = element('c1', 'constraintproperty', { x: 100, y: 100, w: 200, h: 100, classifierModelId: 'cb' });
  const h = harness({
    diagram: { id: 'd1', type: 'parametric', elements: [container], relations: [] },
    models: {
      cb: { id: 'cb', kind: 'constraintblock', constraintParameters: parameters },
      t1: { id: 't1', kind: 'valuetype', name: 'Real' },
      t2: { id: 't2', kind: 'block', name: 'Mass' },
      t3: { id: 't3', kind: 'class', name: 'Ignored' },
      ...extra.models,
    },
  });
  return { h, container };
};

{
  const { h, container } = constraintHarness(['x : Real', 'y : Mass', 'z : Unknown', 'w : Ignored']);
  h.pb.syncConstraintParameters(container);
  const added = h.diagram.elements.filter(e => e.kind === 'constraintparameter');
  assert.equal(added.length, 4);
  assert.deepEqual(added.map(p => p.name), ['x', 'y', 'z', 'w']);
  assert.deepEqual(added.map(p => p.parentId), ['c1', 'c1', 'c1', 'c1']);
  /* alternate sides, spread evenly down each one */
  assert.deepEqual(added.map(p => p.borderAnchor), [
    { fx: 0, fy: 1 / 3 }, { fx: 1, fy: 1 / 3 },
    { fx: 0, fy: 2 / 3 }, { fx: 1, fy: 2 / 3 },
  ]);
  /* left side sits on the container's left border, right side on its right */
  assert.deepEqual([added[0].x, added[1].x], [100 - 9, 300 - 9]);
  assert.equal(added[0].y, 100 + 50 - 9);
  assert.deepEqual(added.map(p => p.classifierModelId), ['t1', 't2', '', ''],
    'Block · ValueType 이름이 맞을 때만 타입을 연결합니다');
  assert.equal(h.named('snapshot').length, 1);
  assert.equal(h.named('renderAll').length, 1);
  assert.deepEqual(h.named('setSelection')[0].args[0], added.map(p => p.id));
  assert.deepEqual(h.messages(), ['Constraint Parameter 4개를 추가했습니다']);
}

{
  /* duplicate names collapse, case-insensitively */
  const { h, container } = constraintHarness(['x : Real', 'X : Real', 'y : Real']);
  h.pb.syncConstraintParameters(container);
  const added = h.diagram.elements.filter(e => e.kind === 'constraintparameter');
  assert.deepEqual(added.map(p => p.name), ['x', 'y']);
}

{
  /* only the missing ones are added, and their side follows the full declaration order */
  const { h, container } = constraintHarness(['x : Real', 'y : Real', 'z : Real']);
  h.diagram.elements.push({ id: 'existing', kind: 'constraintparameter', parentId: 'c1', name: ' X ' });
  h.pb.syncConstraintParameters(container);
  const added = h.diagram.elements.filter(e => e.kind === 'constraintparameter' && e.id !== 'existing');
  assert.deepEqual(added.map(p => p.name), ['y', 'z']);
  assert.deepEqual(added.map(p => p.borderAnchor.fx), [1, 0],
    '이미 있는 파라미터도 자리 계산에는 포함됩니다');
  assert.deepEqual(h.messages(), ['Constraint Parameter 2개를 추가했습니다']);
}

{
  /* nothing to do */
  const { h, container } = constraintHarness(['x : Real']);
  h.diagram.elements.push({ id: 'existing', kind: 'constraintparameter', parentId: 'c1', name: 'x' });
  h.pb.syncConstraintParameters(container);
  assert.deepEqual(h.messages(), ['모든 Constraint Parameter가 이미 동기화되어 있습니다']);
  assert.equal(h.named('snapshot').length, 0);
}

{
  /* refusals */
  const bare = element('c1', 'constraintproperty');
  const h1 = harness({ diagram: { id: 'd1', type: 'parametric', elements: [bare], relations: [] } });
  h1.pb.syncConstraintParameters(bare);
  assert.deepEqual(h1.messages(), ['먼저 Constraint Block Type을 선택하세요']);

  const { h: h2, container: c2 } = constraintHarness([], {});
  h2.pb.syncConstraintParameters(c2);
  assert.deepEqual(h2.messages(), ['선택한 Constraint Block에 정의된 Parameter가 없습니다']);

  const { h: h3, container: c3 } = constraintHarness(['', '  ']);
  h3.pb.syncConstraintParameters(c3);
  assert.deepEqual(h3.messages(), ['선택한 Constraint Block에 정의된 Parameter가 없습니다']);

  const wrongType = element('c1', 'constraintproperty', { classifierModelId: 'blk' });
  const h4 = harness({
    diagram: { id: 'd1', type: 'parametric', elements: [wrongType], relations: [] },
    models: { blk: { id: 'blk', kind: 'block', name: 'NotAConstraint' } },
  });
  h4.pb.syncConstraintParameters(wrongType);
  assert.deepEqual(h4.messages(), ['먼저 Constraint Block Type을 선택하세요']);
  [h1, h2, h3, h4].forEach(h => assert.equal(h.named('snapshot').length, 0));
}

console.log('parametric binding tests: ok');
