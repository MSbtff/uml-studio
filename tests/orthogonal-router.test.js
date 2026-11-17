'use strict';

const assert = require('node:assert/strict');
const {
  routeOrthogonal,
  routeManualOrthogonal,
  polylineSegments,
  polylineMidpoint,
  segmentIntersectsRect,
  segmentRelationship,
  segmentIntersectionPoint,
  collectPolylineCrossings,
  polylineJumpPath,
} = require('../orthogonal-router.js');

const horizontalOptions = {
  start: { x: 20, y: 100 },
  end: { x: 300, y: 100 },
  startDirection: { x: 1, y: 0 },
  endDirection: { x: -1, y: 0 },
  clearance: 12,
  grid: 8,
};

{
  const route = routeOrthogonal(horizontalOptions);
  assert.deepEqual(route.points, [{ x: 20, y: 100 }, { x: 300, y: 100 }]);
  assert.equal(route.obstacleHits, 0);
  assert.equal(route.bends, 0);
}

{
  const obstacle = { x: 128, y: 72, w: 64, h: 56 };
  const route = routeOrthogonal({ ...horizontalOptions, obstacles: [obstacle] });
  assert.equal(route.obstacleHits, 0, '장애물 없는 후보 경로를 선택해야 합니다');
  assert.ok(route.bends >= 2, '중앙 장애물은 두 번 이상 꺾어 우회해야 합니다');
  assert.ok(polylineSegments(route.points).every(segment => !segmentIntersectsRect(segment, obstacle)));
}

{
  const existing = [[{ x: 160, y: 40 }, { x: 160, y: 160 }]];
  const route = routeOrthogonal({
    ...horizontalOptions,
    obstacles: [{ x: 140, y: 80, w: 40, h: 40 }],
    existingRoutes: existing,
  });
  assert.equal(route.obstacleHits, 0);
  assert.equal(route.crossings, 0, '기존 선과 교차하지 않는 외곽 후보를 우선해야 합니다');
}

{
  const route = routeManualOrthogonal({
    ...horizontalOptions,
    waypoints: [{ x: 120, y: 160 }, { x: 220, y: 160 }],
  });
  assert.ok(route.points.some(point => point.x === 120 && point.y === 160));
  assert.ok(polylineSegments(route.points).some(segment =>
    segment.a.y === 160 && segment.b.y === 160
    && 220 >= Math.min(segment.a.x, segment.b.x)
    && 220 <= Math.max(segment.a.x, segment.b.x)),
  '단순화된 직선 위에서도 사용자가 지정한 중간점을 통과해야 합니다');
  assert.ok(polylineSegments(route.points).every(segment =>
    segment.a.x === segment.b.x || segment.a.y === segment.b.y),
  '수동 중간점을 통과하는 경로도 항상 직교해야 합니다');
}

{
  const route = routeManualOrthogonal({
    ...horizontalOptions,
    waypoints: [{ x: 160, y: 160 }],
  });
  assert.ok(route.points.some(point => point.x === 160 && point.y === 160),
    '왕복 구간이 생겨도 사용자가 지정한 단일 중간점을 제거하면 안 됩니다');
}

{
  const midpoint = polylineMidpoint([
    { x: 0, y: 0 }, { x: 60, y: 0 }, { x: 60, y: 40 },
  ]);
  assert.deepEqual(midpoint, { x: 50, y: 0 });
}

{
  assert.deepEqual(
    segmentRelationship(
      { a: { x: 0, y: 50 }, b: { x: 100, y: 50 } },
      { a: { x: 50, y: 0 }, b: { x: 50, y: 100 } },
    ),
    { crossings: 1, overlap: 0 },
  );
  assert.equal(
    segmentRelationship(
      { a: { x: 0, y: 50 }, b: { x: 100, y: 50 } },
      { a: { x: 40, y: 50 }, b: { x: 120, y: 50 } },
    ).overlap,
    60,
  );
}

{
  const horizontal = [{ x: 20, y: 80 }, { x: 220, y: 80 }];
  const vertical = [{ x: 120, y: 20 }, { x: 120, y: 160 }];
  assert.deepEqual(
    segmentIntersectionPoint(
      { a: horizontal[0], b: horizontal[1] },
      { a: vertical[0], b: vertical[1] },
    ),
    { x: 120, y: 80 },
  );
  const crossings = collectPolylineCrossings(horizontal, [vertical]);
  assert.deepEqual(crossings, [
    { point: { x: 120, y: 80 }, segmentIndex: 0, routeIndex: 0 },
  ]);
  const arc = polylineJumpPath(horizontal, crossings, { style: 'arc', radius: 6 });
  assert.match(arc, /L 114 80 Q 120 68 126 80/);
  const gap = polylineJumpPath(horizontal, crossings, { style: 'gap', radius: 6 });
  assert.match(gap, /L 114 80 M 126 80/);
}

console.log('orthogonal-router tests: ok');
