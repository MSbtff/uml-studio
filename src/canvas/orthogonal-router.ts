// @ts-nocheck
'use strict';

(function initOrthogonalRouter(root, factory) {
  const api = factory();
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  if (root) root.UMLOrthogonalRouter = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function createOrthogonalRouter() {
  const EPSILON = 0.001;

  const samePoint = (a, b) =>
    Math.abs(a.x - b.x) < EPSILON && Math.abs(a.y - b.y) < EPSILON;

  function simplifyPoints(points) {
    const unique = [];
    points.forEach(point => {
      const normalized = { x: Number(point.x), y: Number(point.y) };
      if (!unique.length || !samePoint(unique[unique.length - 1], normalized)) unique.push(normalized);
    });
    const simplified = [];
    unique.forEach(point => {
      while (simplified.length >= 2) {
        const a = simplified[simplified.length - 2];
        const b = simplified[simplified.length - 1];
        const vertical = Math.abs(a.x - b.x) < EPSILON && Math.abs(b.x - point.x) < EPSILON;
        const horizontal = Math.abs(a.y - b.y) < EPSILON && Math.abs(b.y - point.y) < EPSILON;
        const continues = vertical
          ? (b.y - a.y) * (point.y - b.y) >= -EPSILON
          : horizontal
            ? (b.x - a.x) * (point.x - b.x) >= -EPSILON
            : false;
        if (!(vertical || horizontal) || !continues) break;
        simplified.pop();
      }
      simplified.push(point);
    });
    return simplified;
  }

  function polylineSegments(points) {
    const segments = [];
    for (let index = 1; index < points.length; index++) {
      if (!samePoint(points[index - 1], points[index])) {
        segments.push({ a: points[index - 1], b: points[index] });
      }
    }
    return segments;
  }

  function polylineMidpoint(points) {
    const segments = polylineSegments(points);
    const lengths = segments.map(segment =>
      Math.abs(segment.b.x - segment.a.x) + Math.abs(segment.b.y - segment.a.y));
    const total = lengths.reduce((sum, value) => sum + value, 0);
    if (!segments.length || total < EPSILON) return points[0] || { x: 0, y: 0 };
    let remaining = total / 2;
    for (let index = 0; index < segments.length; index++) {
      const segment = segments[index], length = lengths[index];
      if (remaining <= length) {
        const ratio = length ? remaining / length : 0;
        return {
          x: segment.a.x + (segment.b.x - segment.a.x) * ratio,
          y: segment.a.y + (segment.b.y - segment.a.y) * ratio,
        };
      }
      remaining -= length;
    }
    return { ...segments[segments.length - 1].b };
  }

  const expandRect = (rect, amount) => ({
    x: rect.x - amount,
    y: rect.y - amount,
    w: rect.w + amount * 2,
    h: rect.h + amount * 2,
  });

  function segmentIntersectsRect(segment, rect) {
    const { a, b } = segment;
    const right = rect.x + rect.w, bottom = rect.y + rect.h;
    if (Math.abs(a.x - b.x) < EPSILON) {
      if (a.x <= rect.x + EPSILON || a.x >= right - EPSILON) return false;
      const low = Math.min(a.y, b.y), high = Math.max(a.y, b.y);
      return Math.max(low, rect.y) < Math.min(high, bottom) - EPSILON;
    }
    if (Math.abs(a.y - b.y) < EPSILON) {
      if (a.y <= rect.y + EPSILON || a.y >= bottom - EPSILON) return false;
      const low = Math.min(a.x, b.x), high = Math.max(a.x, b.x);
      return Math.max(low, rect.x) < Math.min(high, right) - EPSILON;
    }
    return true;
  }

  const betweenStrict = (value, a, b) =>
    value > Math.min(a, b) + EPSILON && value < Math.max(a, b) - EPSILON;

  function segmentRelationship(first, second) {
    const firstVertical = Math.abs(first.a.x - first.b.x) < EPSILON;
    const secondVertical = Math.abs(second.a.x - second.b.x) < EPSILON;
    if (firstVertical !== secondVertical) {
      const vertical = firstVertical ? first : second;
      const horizontal = firstVertical ? second : first;
      const crosses = betweenStrict(vertical.a.x, horizontal.a.x, horizontal.b.x)
        && betweenStrict(horizontal.a.y, vertical.a.y, vertical.b.y);
      return { crossings: crosses ? 1 : 0, overlap: 0 };
    }
    if (firstVertical && Math.abs(first.a.x - second.a.x) < EPSILON) {
      const overlap = Math.max(0,
        Math.min(Math.max(first.a.y, first.b.y), Math.max(second.a.y, second.b.y))
        - Math.max(Math.min(first.a.y, first.b.y), Math.min(second.a.y, second.b.y)));
      return { crossings: 0, overlap };
    }
    if (!firstVertical && Math.abs(first.a.y - second.a.y) < EPSILON) {
      const overlap = Math.max(0,
        Math.min(Math.max(first.a.x, first.b.x), Math.max(second.a.x, second.b.x))
        - Math.max(Math.min(first.a.x, first.b.x), Math.min(second.a.x, second.b.x)));
      return { crossings: 0, overlap };
    }
    return { crossings: 0, overlap: 0 };
  }

  function segmentIntersectionPoint(first, second) {
    const firstVertical = Math.abs(first.a.x - first.b.x) < EPSILON;
    const secondVertical = Math.abs(second.a.x - second.b.x) < EPSILON;
    if (firstVertical === secondVertical) return null;
    const vertical = firstVertical ? first : second;
    const horizontal = firstVertical ? second : first;
    if (!betweenStrict(vertical.a.x, horizontal.a.x, horizontal.b.x)
      || !betweenStrict(horizontal.a.y, vertical.a.y, vertical.b.y)) return null;
    return { x: vertical.a.x, y: horizontal.a.y };
  }

  function collectPolylineCrossings(points, existingRoutes) {
    const crossings = [];
    const seen = new Set();
    polylineSegments(points).forEach((segment, segmentIndex) => {
      (Array.isArray(existingRoutes) ? existingRoutes : []).forEach((route, routeIndex) => {
        polylineSegments(route).forEach(existing => {
          const point = segmentIntersectionPoint(segment, existing);
          if (!point) return;
          const key = `${segmentIndex}:${point.x.toFixed(3)}:${point.y.toFixed(3)}`;
          if (seen.has(key)) return;
          seen.add(key);
          crossings.push({ point, segmentIndex, routeIndex });
        });
      });
    });
    return crossings;
  }

  function polylineJumpPath(points, crossings, options) {
    if (!Array.isArray(points) || !points.length) return '';
    const style = options?.style || 'arc';
    const radius = Number.isFinite(options?.radius) ? Math.max(2, options.radius) : 6;
    if (style === 'none' || !Array.isArray(crossings) || !crossings.length) {
      return points.map((point, index) =>
        `${index ? 'L' : 'M'} ${point.x} ${point.y}`).join(' ');
    }
    const commands = [`M ${points[0].x} ${points[0].y}`];
    for (let index = 1; index < points.length; index++) {
      const a = points[index - 1], b = points[index];
      const vertical = Math.abs(a.x - b.x) < EPSILON;
      const length = Math.abs(b.x - a.x) + Math.abs(b.y - a.y);
      const direction = vertical ? Math.sign(b.y - a.y) : Math.sign(b.x - a.x);
      const candidates = crossings
        .filter(crossing => crossing.segmentIndex === index - 1)
        .map(crossing => ({
          ...crossing,
          distance: vertical
            ? Math.abs(crossing.point.y - a.y)
            : Math.abs(crossing.point.x - a.x),
        }))
        .filter(crossing =>
          crossing.distance > radius + EPSILON
          && crossing.distance < length - radius - EPSILON)
        .sort((first, second) => first.distance - second.distance);
      let previousDistance = -Infinity;
      candidates.forEach(crossing => {
        if (crossing.distance - previousDistance < radius * 2 + 2) return;
        previousDistance = crossing.distance;
        const before = vertical
          ? { x: crossing.point.x, y: crossing.point.y - direction * radius }
          : { x: crossing.point.x - direction * radius, y: crossing.point.y };
        const after = vertical
          ? { x: crossing.point.x, y: crossing.point.y + direction * radius }
          : { x: crossing.point.x + direction * radius, y: crossing.point.y };
        commands.push(`L ${before.x} ${before.y}`);
        if (style === 'gap') {
          commands.push(`M ${after.x} ${after.y}`);
        } else {
          const control = vertical
            ? { x: crossing.point.x + radius * 2, y: crossing.point.y }
            : { x: crossing.point.x, y: crossing.point.y - radius * 2 };
          commands.push(`Q ${control.x} ${control.y} ${after.x} ${after.y}`);
        }
      });
      commands.push(`L ${b.x} ${b.y}`);
    }
    return commands.join(' ');
  }

  function routeMetrics(points, obstacles, existingRoutes, clearance) {
    const simplified = simplifyPoints(points);
    const segments = polylineSegments(simplified);
    const rawSegments = polylineSegments(points);
    const expanded = obstacles.map(rect => expandRect(rect, clearance));
    let obstacleHits = 0, crossings = 0, overlap = 0, length = 0;
    rawSegments.forEach((segment, index) => {
      const endpointLeg = index === 0 || index === rawSegments.length - 1;
      if (!endpointLeg) {
        expanded.forEach(rect => {
          if (segmentIntersectsRect(segment, rect)) obstacleHits++;
        });
      }
    });
    segments.forEach(segment => {
      length += Math.abs(segment.b.x - segment.a.x) + Math.abs(segment.b.y - segment.a.y);
      existingRoutes.forEach(route => {
        polylineSegments(route).forEach(existing => {
          const relationship = segmentRelationship(segment, existing);
          crossings += relationship.crossings;
          overlap += relationship.overlap;
        });
      });
    });
    return {
      points: simplified,
      obstacleHits,
      crossings,
      overlap,
      bends: Math.max(0, simplified.length - 2),
      length,
      score: obstacleHits * 1000000
        + crossings * 6000
        + overlap * 120
        + Math.max(0, simplified.length - 2) * 48
        + length,
    };
  }

  const snapLane = (value, grid) => Math.round(value / grid) * grid;

  function appendOrthogonal(points, target, preferredFinalDirection) {
    const current = points[points.length - 1];
    if (samePoint(current, target)) return;
    if (Math.abs(current.x - target.x) < EPSILON
      || Math.abs(current.y - target.y) < EPSILON) {
      points.push(target);
      return;
    }
    if (preferredFinalDirection?.x) {
      points.push({ x: target.x, y: current.y });
    } else if (preferredFinalDirection?.y) {
      points.push({ x: current.x, y: target.y });
    } else {
      const previous = points[points.length - 2];
      const previousHorizontal = previous
        && Math.abs(previous.y - current.y) < EPSILON;
      if (previousHorizontal) {
        const reverses = (current.x - previous.x) * (target.x - current.x) < -EPSILON;
        points.push(reverses
          ? { x: current.x, y: target.y }
          : { x: target.x, y: current.y });
      } else if (previous) {
        const reverses = (current.y - previous.y) * (target.y - current.y) < -EPSILON;
        points.push(reverses
          ? { x: target.x, y: current.y }
          : { x: current.x, y: target.y });
      } else {
        points.push({ x: target.x, y: current.y });
      }
    }
    points.push(target);
  }

  function routeOrthogonal(options) {
    const start = { ...options.start }, end = { ...options.end };
    const clearance = Number.isFinite(options.clearance) ? options.clearance : 12;
    const grid = Number.isFinite(options.grid) && options.grid > 0 ? options.grid : 8;
    const startDirection = options.startDirection || { x: Math.sign(end.x - start.x) || 1, y: 0 };
    const endDirection = options.endDirection || { x: Math.sign(start.x - end.x) || -1, y: 0 };
    const startLead = {
      x: start.x + startDirection.x * clearance,
      y: start.y + startDirection.y * clearance,
    };
    const endLead = {
      x: end.x + endDirection.x * clearance,
      y: end.y + endDirection.y * clearance,
    };
    const obstacles = Array.isArray(options.obstacles) ? options.obstacles : [];
    const existingRoutes = Array.isArray(options.existingRoutes) ? options.existingRoutes : [];
    const expanded = obstacles.map(rect => expandRect(rect, clearance));
    const existingPoints = existingRoutes.flat();
    const allX = [
      startLead.x, endLead.x,
      ...expanded.flatMap(rect => [rect.x, rect.x + rect.w]),
      ...existingPoints.map(point => point.x),
    ];
    const allY = [
      startLead.y, endLead.y,
      ...expanded.flatMap(rect => [rect.y, rect.y + rect.h]),
      ...existingPoints.map(point => point.y),
    ];
    const laneX = new Set([
      snapLane((startLead.x + endLead.x) / 2, grid),
      snapLane(Math.min(...allX) - clearance - grid, grid),
      snapLane(Math.max(...allX) + clearance + grid, grid),
    ]);
    const laneY = new Set([
      snapLane((startLead.y + endLead.y) / 2, grid),
      snapLane(Math.min(...allY) - clearance - grid, grid),
      snapLane(Math.max(...allY) + clearance + grid, grid),
    ]);
    expanded.forEach(rect => {
      laneX.add(snapLane(rect.x - grid, grid));
      laneX.add(snapLane(rect.x + rect.w + grid, grid));
      laneY.add(snapLane(rect.y - grid, grid));
      laneY.add(snapLane(rect.y + rect.h + grid, grid));
    });

    const candidates = [];
    if (Math.abs(startLead.x - endLead.x) < EPSILON
      || Math.abs(startLead.y - endLead.y) < EPSILON) {
      candidates.push([start, startLead, endLead, end]);
    }
    candidates.push(
      [start, startLead, { x: endLead.x, y: startLead.y }, endLead, end],
      [start, startLead, { x: startLead.x, y: endLead.y }, endLead, end],
    );
    [...laneX].sort((a, b) => a - b).forEach(x => {
      candidates.push([
        start, startLead,
        { x, y: startLead.y },
        { x, y: endLead.y },
        endLead, end,
      ]);
    });
    [...laneY].sort((a, b) => a - b).forEach(y => {
      candidates.push([
        start, startLead,
        { x: startLead.x, y },
        { x: endLead.x, y },
        endLead, end,
      ]);
    });

    const ranked = candidates.map((points, index) => ({
      ...routeMetrics(points, obstacles, existingRoutes, clearance),
      index,
    })).sort((a, b) => a.score - b.score || a.index - b.index);
    return ranked[0] || routeMetrics([start, end], obstacles, existingRoutes, clearance);
  }

  function routeManualOrthogonal(options) {
    const start = { ...options.start }, end = { ...options.end };
    const clearance = Number.isFinite(options.clearance) ? options.clearance : 12;
    const startDirection = options.startDirection || { x: Math.sign(end.x - start.x) || 1, y: 0 };
    const endDirection = options.endDirection || { x: Math.sign(start.x - end.x) || -1, y: 0 };
    const waypoints = (Array.isArray(options.waypoints) ? options.waypoints : [])
      .filter(point => Number.isFinite(point?.x) && Number.isFinite(point?.y))
      .map(point => ({ x: Number(point.x), y: Number(point.y) }));
    const firstWaypoint = waypoints[0];
    const lastWaypoint = waypoints[waypoints.length - 1];
    const startForward = firstWaypoint
      ? (firstWaypoint.x - start.x) * startDirection.x
        + (firstWaypoint.y - start.y) * startDirection.y
      : clearance * 2;
    const endForward = lastWaypoint
      ? (lastWaypoint.x - end.x) * endDirection.x
        + (lastWaypoint.y - end.y) * endDirection.y
      : clearance * 2;
    const startClearance = startForward > 0
      ? Math.min(clearance, Math.max(2, startForward / 2))
      : clearance;
    const endClearance = endForward > 0
      ? Math.min(clearance, Math.max(2, endForward / 2))
      : clearance;
    const startLead = {
      x: start.x + startDirection.x * startClearance,
      y: start.y + startDirection.y * startClearance,
    };
    const endLead = {
      x: end.x + endDirection.x * endClearance,
      y: end.y + endDirection.y * endClearance,
    };
    const points = [start];
    appendOrthogonal(points, startLead, startDirection);
    waypoints.forEach(point => appendOrthogonal(points, point));
    appendOrthogonal(points, endLead, endDirection);
    appendOrthogonal(points, end, endDirection);
    return routeMetrics(
      points,
      Array.isArray(options.obstacles) ? options.obstacles : [],
      Array.isArray(options.existingRoutes) ? options.existingRoutes : [],
      clearance,
    );
  }

  return {
    routeOrthogonal,
    routeManualOrthogonal,
    simplifyPoints,
    polylineSegments,
    polylineMidpoint,
    segmentIntersectsRect,
    segmentRelationship,
    segmentIntersectionPoint,
    collectPolylineCrossings,
    polylineJumpPath,
  };
});
