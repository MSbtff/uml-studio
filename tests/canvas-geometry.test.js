'use strict';

const assert = require('node:assert/strict');
const {
  GRID,
  snap,
  snapUp,
  center,
  pointInside,
  edgePoint,
  anchorPoint,
  borderAnchorFrac,
  nestedContainmentEndpoints,
  relationEndpoints,
  compactBindingWaypoints,
  distToSegment,
  nearestPolylineSegmentIndex,
  distanceAlongPolyline,
  pointNearPolyline,
  polylinePath,
  headGeom,
  curvedBranchGeometry,
  bezierPoint,
  selfTransitionGeometry,
  cubicPoint,
} = require('../dist/browser/canvas/canvas-geometry.js');

const closeTo = (actual, expected, tolerance = 1e-9) => {
  assert.ok(Math.abs(actual - expected) <= tolerance, `${actual} ≉ ${expected}`);
};
const closePoint = (actual, expected, tolerance) => {
  closeTo(actual.x, expected.x, tolerance);
  closeTo(actual.y, expected.y, tolerance);
};

assert.equal(GRID, 8);
assert.equal(snap(11), 8);
assert.equal(snap(12), 16);
assert.equal(snap(-11), -8);
assert.equal(snap(14, 10), 10);
assert.equal(snapUp(9), 16);
assert.equal(snapUp(-9), -8);
assert.equal(snapUp(11, 10), 20);

const rect = { kind: 'class', x: 10, y: 20, w: 100, h: 60 };
assert.deepEqual(center(rect), { x: 60, y: 50 });
assert.equal(pointInside(rect, { x: 10, y: 20 }), true, '경계는 요소 내부로 판정해야 합니다');
assert.equal(pointInside(rect, { x: 14, y: 24 }, 4), true);
assert.equal(pointInside(rect, { x: 13, y: 24 }, 4), false);
assert.equal(pointInside(rect, { x: 111, y: 50 }), false);

assert.deepEqual(edgePoint(rect, { x: 210, y: 50 }), { x: 110, y: 50 });
assert.deepEqual(edgePoint(rect, center(rect)), center(rect));
closePoint(
  edgePoint({ kind: 'usecase', x: 0, y: 0, w: 100, h: 50 }, { x: 100, y: 50 }),
  { x: 85.35533905932738, y: 42.67766952966369 },
);
assert.deepEqual(
  edgePoint({ kind: 'initial', x: 0, y: 0, w: 40, h: 40 }, { x: 60, y: 20 }),
  { x: 40, y: 20 },
);
assert.deepEqual(
  edgePoint({ kind: 'decision', x: 0, y: 0, w: 100, h: 60 }, { x: 100, y: 60 }),
  { x: 75, y: 45 },
);

assert.deepEqual(anchorPoint(rect, { fx: 0.25, fy: 1 }), { x: 35, y: 80 });
assert.deepEqual(borderAnchorFrac(rect, { x: 45, y: 23 }), { fx: 0.35, fy: 0 });
assert.deepEqual(borderAnchorFrac(rect, { x: 200, y: 55 }), { fx: 1, fy: 35 / 60 });
const ellipseAnchor = borderAnchorFrac(
  { kind: 'usecase', x: 0, y: 0, w: 100, h: 50 },
  { x: 100, y: 50 },
);
closeTo(ellipseAnchor.fx, 0.8535533905932737);
closeTo(ellipseAnchor.fy, 0.8535533905932737);

const from = { id: 'from', kind: 'class', x: 0, y: 0, w: 100, h: 60 };
const to = { id: 'to', kind: 'class', x: 200, y: 0, w: 100, h: 60 };
assert.deepEqual(
  relationEndpoints({ kind: 'dependency' }, from, to),
  { p1: { x: 100, y: 30 }, p2: { x: 200, y: 30 } },
);
assert.deepEqual(
  relationEndpoints({ kind: 'dependency', srcAnchor: { fx: 0.5, fy: 0 }, dstAnchor: { fx: 0, fy: 0.5 } }, from, to),
  { p1: { x: 50, y: 0 }, p2: { x: 200, y: 30 } },
);
assert.equal(relationEndpoints({ kind: 'dependency' }, from, null), null);

const owner = { id: 'owner', kind: 'package', x: 0, y: 0, w: 300, h: 200 };
const child = { id: 'child', parentId: 'owner', kind: 'class', x: 12, y: 60, w: 100, h: 60 };
const containment = { kind: 'containment' };
assert.deepEqual(nestedContainmentEndpoints(containment, child, owner), {
  p1: { x: 12, y: 90 }, p2: { x: 0, y: 90 },
});
assert.deepEqual(relationEndpoints(containment, child, owner), {
  p1: { x: 12, y: 90 }, p2: { x: 0, y: 90 },
});
assert.deepEqual(nestedContainmentEndpoints(containment, { ...child, x: 188 }, owner), {
  p1: { x: 288, y: 90 }, p2: { x: 300, y: 90 },
});
assert.deepEqual(nestedContainmentEndpoints(containment, { ...child, x: 100, y: 12 }, owner), {
  p1: { x: 150, y: 12 }, p2: { x: 150, y: 0 },
});
assert.deepEqual(nestedContainmentEndpoints(containment, { ...child, x: 100, y: 128 }, owner), {
  p1: { x: 150, y: 188 }, p2: { x: 150, y: 200 },
});
assert.equal(nestedContainmentEndpoints({ kind: 'dependency' }, child, owner), null);
assert.equal(nestedContainmentEndpoints({ ...containment, srcAnchor: { fx: 0, fy: 0.5 } }, child, owner), null);

assert.deepEqual(compactBindingWaypoints([
  { x: 0, y: 0 }, { x: 3, y: 2 }, { x: 11, y: 2 }, { x: 18, y: 2 },
]), [{ x: 3, y: 2 }, { x: 18, y: 2 }]);
assert.deepEqual(compactBindingWaypoints([{ x: 0, y: 0 }, { x: 5, y: 0 }], 5), [
  { x: 0, y: 0 }, { x: 5, y: 0 },
]);

assert.equal(distToSegment({ x: 5, y: 3 }, { x: 0, y: 0 }, { x: 10, y: 0 }), 3);
assert.equal(distToSegment({ x: 3, y: 4 }, { x: 0, y: 0 }, { x: 0, y: 0 }), 5);
assert.equal(distToSegment({ x: 15, y: 0 }, { x: 0, y: 0 }, { x: 10, y: 0 }), 5);
const polyline = [{ x: 0, y: 0 }, { x: 100, y: 0 }, { x: 100, y: 100 }];
assert.equal(nearestPolylineSegmentIndex({ x: 80, y: 70 }, polyline), 1);
assert.equal(nearestPolylineSegmentIndex({ x: 20, y: 5 }, polyline), 0);
assert.equal(distanceAlongPolyline({ x: 60, y: 20 }, polyline), 60);
assert.equal(distanceAlongPolyline({ x: 80, y: 70 }, polyline), 170);
assert.equal(pointNearPolyline({ x: 50, y: 6 }, polyline, 7), true);
assert.equal(pointNearPolyline({ x: 50, y: 7 }, polyline, 7), false);
assert.equal(polylinePath(polyline), 'M 0 0 L 100 0 L 100 100');
assert.equal(polylinePath([]), '');

assert.deepEqual(headGeom({ x: 20, y: 10 }, 0, 12, 10), {
  bx: 8, by: 10, l: { x: 8, y: 15 }, r: { x: 8, y: 5 },
});
const branch = curvedBranchGeometry({ x: 0, y: 0 }, { x: 100, y: 0 });
assert.deepEqual(branch, { p1: { x: 0, y: 0 }, p2: { x: 100, y: 0 }, c: { x: 50, y: 18 } });
assert.deepEqual(bezierPoint(branch, 0), branch.p1);
assert.deepEqual(bezierPoint(branch, 1), branch.p2);
assert.deepEqual(bezierPoint(branch, 0.5), { x: 50, y: 9 });

const selfHost = { id: 'state', kind: 'state', x: 100, y: 200, w: 100, h: 60 };
const selfCurve = selfTransitionGeometry({ kind: 'transition', from: 'state', to: 'state' }, selfHost);
assert.deepEqual(selfCurve, {
  p1: { x: 130, y: 200 }, p2: { x: 170, y: 200 },
  c1: { x: 130, y: 162 }, c2: { x: 170, y: 162 },
  label: { x: 150, y: 157 },
});
assert.equal(selfTransitionGeometry({ kind: 'transition', from: 'a', to: 'b' }, selfHost), null);
assert.equal(selfTransitionGeometry({ kind: 'dependency', from: 'state', to: 'state' }, selfHost), null);
assert.equal(selfTransitionGeometry({ kind: 'transition', from: 'state', to: 'state' }, null), null);
assert.deepEqual(cubicPoint(selfCurve, 0), selfCurve.p1);
assert.deepEqual(cubicPoint(selfCurve, 1), selfCurve.p2);
closePoint(cubicPoint(selfCurve, 0.5), { x: 150, y: 171.5 });

assert.ok(Object.isFrozen(require('../dist/browser/canvas/canvas-geometry.js')));
console.log('canvas geometry tests: ok');
