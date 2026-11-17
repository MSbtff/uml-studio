'use strict';

(function initCanvasGeometry(root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root) root.UMLCanvasGeometry = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function createCanvasGeometry() {
  const GRID = 8;

  const ELLIPSE_KINDS = new Set([
    'usecase', 'process', 'collaboration', 'collaborationuse',
  ]);
  const CIRCLE_KINDS = new Set([
    'initial', 'final', 'interfaceball', 'stateinitial', 'statefinal', 'junction',
    'shallowhistory', 'deephistory', 'entrypoint', 'exitpoint', 'terminate',
    'connectionpointref',
  ]);
  const DIAMOND_KINDS = new Set(['decision', 'choice']);

  function snap(value, grid = GRID) {
    return Math.round(value / grid) * grid;
  }

  function snapUp(value, grid = GRID) {
    return Math.ceil(value / grid) * grid;
  }

  function center(rect) {
    return { x: rect.x + rect.w / 2, y: rect.y + rect.h / 2 };
  }

  function pointInside(rect, point, inset = 0) {
    return point.x >= rect.x + inset
      && point.x <= rect.x + rect.w - inset
      && point.y >= rect.y + inset
      && point.y <= rect.y + rect.h - inset;
  }

  /* Point where the ray from the element center toward `toward` meets its
     rendered outline. UML shapes use ellipse, circle, diamond, or rectangle. */
  function edgePoint(element, toward) {
    const middle = center(element);
    const dx = toward.x - middle.x, dy = toward.y - middle.y;
    if (dx === 0 && dy === 0) return middle;
    const a = element.w / 2, b = element.h / 2;
    let scale;
    if (ELLIPSE_KINDS.has(element.kind)) {
      scale = 1 / Math.sqrt((dx * dx) / (a * a) + (dy * dy) / (b * b));
    } else if (CIRCLE_KINDS.has(element.kind)) {
      scale = Math.min(a, b) / Math.hypot(dx, dy);
    } else if (DIAMOND_KINDS.has(element.kind)) {
      scale = 1 / (Math.abs(dx) / a + Math.abs(dy) / b);
    } else {
      const sx = dx !== 0 ? a / Math.abs(dx) : Infinity;
      const sy = dy !== 0 ? b / Math.abs(dy) : Infinity;
      scale = Math.min(sx, sy);
    }
    return { x: middle.x + dx * scale, y: middle.y + dy * scale };
  }

  function anchorPoint(element, anchor) {
    return { x: element.x + anchor.fx * element.w, y: element.y + anchor.fy * element.h };
  }

  /* Fractional anchor on the nearest outline. Curved shapes use angular
     projection; rectangular shapes preserve the cursor's nearest-edge offset. */
  function borderAnchorFrac(host, point) {
    if (ELLIPSE_KINDS.has(host.kind) || CIRCLE_KINDS.has(host.kind) || DIAMOND_KINDS.has(host.kind)) {
      const outline = edgePoint(host, point);
      return { fx: (outline.x - host.x) / host.w, fy: (outline.y - host.y) / host.h };
    }
    const x = Math.max(host.x, Math.min(host.x + host.w, point.x));
    const y = Math.max(host.y, Math.min(host.y + host.h, point.y));
    const left = x - host.x, right = host.x + host.w - x;
    const top = y - host.y, bottom = host.y + host.h - y;
    const nearest = Math.min(left, right, top, bottom);
    const fx = (x - host.x) / host.w, fy = (y - host.y) / host.h;
    if (nearest === top) return { fx, fy: 0 };
    if (nearest === bottom) return { fx, fy: 1 };
    if (nearest === left) return { fx: 0, fy };
    return { fx: 1, fy };
  }

  function nestedContainmentEndpoints(relation, child, owner) {
    if (relation.kind !== 'containment'
      || child.parentId !== owner.id
      || relation.srcAnchor
      || relation.dstAnchor) return null;
    const gaps = [
      { side: 'left', value: child.x - owner.x },
      { side: 'right', value: owner.x + owner.w - child.x - child.w },
      { side: 'top', value: child.y - owner.y },
      { side: 'bottom', value: owner.y + owner.h - child.y - child.h },
    ].filter(item => item.value >= 0).sort((a, b) => a.value - b.value);
    if (!gaps.length) return null;
    const side = gaps[0].side;
    if (side === 'left') {
      const y = child.y + child.h / 2;
      return { p1: { x: child.x, y }, p2: { x: owner.x, y } };
    }
    if (side === 'right') {
      const y = child.y + child.h / 2;
      return { p1: { x: child.x + child.w, y }, p2: { x: owner.x + owner.w, y } };
    }
    if (side === 'top') {
      const x = child.x + child.w / 2;
      return { p1: { x, y: child.y }, p2: { x, y: owner.y } };
    }
    const x = child.x + child.w / 2;
    return { p1: { x, y: child.y + child.h }, p2: { x, y: owner.y + owner.h } };
  }

  function relationEndpoints(relation, from, to) {
    if (!from || !to) return null;
    const containment = nestedContainmentEndpoints(relation, from, to);
    if (containment) return containment;
    const sourceAnchor = relation.srcAnchor ? anchorPoint(from, relation.srcAnchor) : null;
    const targetAnchor = relation.dstAnchor ? anchorPoint(to, relation.dstAnchor) : null;
    return {
      p1: sourceAnchor || edgePoint(from, targetAnchor || center(to)),
      p2: targetAnchor || edgePoint(to, sourceAnchor || center(from)),
    };
  }

  function compactBindingWaypoints(points, grid = GRID) {
    return points.reduce((result, point) => {
      const current = { x: point.x, y: point.y };
      const previous = result[result.length - 1];
      if (previous
        && Math.abs(current.x - previous.x) + Math.abs(current.y - previous.y) < grid) {
        result[result.length - 1] = current;
      } else {
        result.push(current);
      }
      return result;
    }, []);
  }

  function distToSegment(point, a, b) {
    const lengthSquared = (b.x - a.x) ** 2 + (b.y - a.y) ** 2;
    if (!lengthSquared) return Math.hypot(point.x - a.x, point.y - a.y);
    let ratio = ((point.x - a.x) * (b.x - a.x) + (point.y - a.y) * (b.y - a.y)) / lengthSquared;
    ratio = Math.max(0, Math.min(1, ratio));
    return Math.hypot(
      point.x - (a.x + ratio * (b.x - a.x)),
      point.y - (a.y + ratio * (b.y - a.y)),
    );
  }

  function nearestPolylineSegmentIndex(point, points) {
    let bestIndex = 0, bestDistance = Infinity;
    for (let index = 1; index < points.length; index++) {
      const distance = distToSegment(point, points[index - 1], points[index]);
      if (distance < bestDistance) {
        bestIndex = index - 1;
        bestDistance = distance;
      }
    }
    return bestIndex;
  }

  function distanceAlongPolyline(point, points) {
    let walked = 0, bestDistance = Infinity, bestPosition = 0;
    for (let index = 1; index < points.length; index++) {
      const a = points[index - 1], b = points[index];
      const length = Math.abs(b.x - a.x) + Math.abs(b.y - a.y);
      let ratio = 0;
      if (Math.abs(b.x - a.x) >= Math.abs(b.y - a.y) && Math.abs(b.x - a.x) > 0.001) {
        ratio = Math.max(0, Math.min(1, (point.x - a.x) / (b.x - a.x)));
      } else if (Math.abs(b.y - a.y) > 0.001) {
        ratio = Math.max(0, Math.min(1, (point.y - a.y) / (b.y - a.y)));
      }
      const projected = {
        x: a.x + (b.x - a.x) * ratio,
        y: a.y + (b.y - a.y) * ratio,
      };
      const distance = Math.hypot(point.x - projected.x, point.y - projected.y);
      if (distance < bestDistance) {
        bestDistance = distance;
        bestPosition = walked + length * ratio;
      }
      walked += length;
    }
    return bestPosition;
  }

  function pointNearPolyline(point, points, threshold) {
    for (let index = 1; index < points.length; index++) {
      if (distToSegment(point, points[index - 1], points[index]) < threshold) return true;
    }
    return false;
  }

  function polylinePath(points) {
    return points.map((point, index) =>
      `${index ? 'L' : 'M'} ${point.x} ${point.y}`).join(' ');
  }

  function headGeom(tip, angle, length, width) {
    const cos = Math.cos(angle), sin = Math.sin(angle);
    const bx = tip.x - cos * length, by = tip.y - sin * length;
    const px = -sin, py = cos;
    return {
      bx,
      by,
      l: { x: bx + px * width / 2, y: by + py * width / 2 },
      r: { x: bx - px * width / 2, y: by - py * width / 2 },
    };
  }

  function curvedBranchGeometry(p1, p2) {
    const dx = p2.x - p1.x, dy = p2.y - p1.y;
    const length = Math.hypot(dx, dy) || 1;
    const bend = Math.min(24, length * 0.18);
    return {
      p1,
      p2,
      c: {
        x: (p1.x + p2.x) / 2 - dy / length * bend,
        y: (p1.y + p2.y) / 2 + dx / length * bend,
      },
    };
  }

  function bezierPoint(curve, t) {
    const u = 1 - t;
    return {
      x: u * u * curve.p1.x + 2 * t * u * curve.c.x + t * t * curve.p2.x,
      y: u * u * curve.p1.y + 2 * t * u * curve.c.y + t * t * curve.p2.y,
    };
  }

  function selfTransitionGeometry(relation, host) {
    if (!host || relation.kind !== 'transition' || relation.from !== relation.to) return null;
    const p1 = relation.srcAnchor
      ? anchorPoint(host, relation.srcAnchor)
      : { x: host.x + host.w * 0.3, y: host.y };
    const p2 = relation.dstAnchor
      ? anchorPoint(host, relation.dstAnchor)
      : { x: host.x + host.w * 0.7, y: host.y };
    const lift = Math.max(38, Math.min(64, host.w * 0.32));
    const c1 = { x: p1.x, y: Math.min(p1.y, p2.y) - lift };
    const c2 = { x: p2.x, y: Math.min(p1.y, p2.y) - lift };
    return {
      p1,
      p2,
      c1,
      c2,
      label: { x: (p1.x + p2.x) / 2, y: Math.min(c1.y, c2.y) - 5 },
    };
  }

  function cubicPoint(curve, t) {
    const u = 1 - t;
    return {
      x: u ** 3 * curve.p1.x
        + 3 * u * u * t * curve.c1.x
        + 3 * u * t * t * curve.c2.x
        + t ** 3 * curve.p2.x,
      y: u ** 3 * curve.p1.y
        + 3 * u * u * t * curve.c1.y
        + 3 * u * t * t * curve.c2.y
        + t ** 3 * curve.p2.y,
    };
  }

  return Object.freeze({
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
  });
});
