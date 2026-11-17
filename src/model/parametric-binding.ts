// @ts-nocheck
'use strict';

/* Parametric diagram support — Constraint Parameter ports and the Binding
   Connector routes that attach to them. Both halves share the `borderAnchor`
   convention: a parameter records which edge of its Constraint Property it
   sits on, and the router turns that anchor back into the direction a route
   must leave the port. Geometry, the orthogonal router and the element factory
   are injected, so this module owns only the parametric rules and the route
   cache for the diagram being rendered. */
(function initParametricBindingModule(root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root) root.UMLParametricBinding = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function createParametricBindingModule() {
  const REQUIRED_FUNCTIONS = Object.freeze([
    'adoptView',
    'byId',
    'childViews',
    'collectPolylineCrossings',
    'compactBindingWaypoints',
    'createElement',
    'dg',
    'distanceAlongPolyline',
    'flashStatus',
    'instanceClassifier',
    'nearestPolylineSegmentIndex',
    'parseConstraintParameterDefinition',
    'relEndpoints',
    'renderAll',
    'routeManualOrthogonal',
    'routeOrthogonal',
    'setSelection',
    'snap',
    'snapshot',
  ]);
  const REQUIRED_VALUES = Object.freeze([
    'GRID',
    'state',
  ]);
  const ROUTING = Object.freeze({
    /* how far a route keeps away from the boxes it passes */
    clearance: 14,
    /* a manual route stays editable — refuse to grow past this */
    maxWaypoints: 200,
    /* half the side of a Constraint Parameter port, used to centre it on the border */
    parameterHalfSize: 9,
  });
  const CONSTRAINT_TYPE_KINDS = Object.freeze(['block', 'valuetype']);
  /* the straight fallback used before a diagram has been routed */
  const STRAIGHT_ROUTE_METRICS = Object.freeze({
    obstacleHits: 0, crossings: 0, overlap: 0, bends: 0,
    jumpCrossings: [], jumpCount: 0,
  });

  function create(dependencies) {
    const deps = dependencies || {};
    const missing = REQUIRED_FUNCTIONS.filter(name => typeof deps[name] !== 'function');
    REQUIRED_VALUES.forEach(name => {
      if (deps[name] == null) missing.push(name);
    });
    if (missing.length) {
      throw new TypeError(`Parametric Binding 의존성이 없습니다: ${[...new Set(missing)].join(', ')}`);
    }

    const {
      adoptView,
      byId,
      childViews,
      collectPolylineCrossings,
      compactBindingWaypoints,
      createElement,
      dg,
      distanceAlongPolyline,
      flashStatus,
      instanceClassifier,
      nearestPolylineSegmentIndex,
      parseConstraintParameterDefinition,
      relEndpoints,
      renderAll,
      routeManualOrthogonal,
      routeOrthogonal,
      setSelection,
      snap,
      snapshot,
      GRID,
      state,
    } = deps;

    /* routes for the diagram currently being rendered, keyed by relation id */
    let routeCache = new Map();

    /* ── Constraint Parameters ───────────────────────────────── */

    /* the parameters declared by the Constraint Block this property is typed
       by, in declaration order and without duplicate names */
    function declaredParameters(classifier) {
      const names = new Set();
      return (classifier.constraintParameters || [])
        .map(parseConstraintParameterDefinition)
        .filter(definition => definition && definition.name)
        .filter(definition => {
          const key = definition.name.toLowerCase();
          if (names.has(key)) return false;
          names.add(key);
          return true;
        });
    }

    /* parameters alternate left/right border, each side spread evenly */
    function borderAnchorFor(index, sideCounts) {
      const side = index % 2;
      const sideIndex = Math.floor(index / 2);
      return { fx: side, fy: (sideIndex + 1) / (sideCounts[side] + 1) };
    }

    function syncConstraintParameters(container) {
      const classifier = instanceClassifier(container);
      if (!classifier || classifier.kind !== 'constraintblock') {
        flashStatus('먼저 Constraint Block Type을 선택하세요');
        return;
      }
      const declarations = declaredParameters(classifier);
      if (!declarations.length) {
        flashStatus('선택한 Constraint Block에 정의된 Parameter가 없습니다');
        return;
      }
      const existingNames = new Set(childViews(container.id)
        .filter(child => child.kind === 'constraintparameter')
        .map(child => String(child.name || '').trim().toLowerCase())
        .filter(Boolean));
      const missing = declarations
        .map((definition, index) => ({ ...definition, index }))
        .filter(definition => !existingNames.has(definition.name.toLowerCase()));
      if (!missing.length) {
        flashStatus('모든 Constraint Parameter가 이미 동기화되어 있습니다');
        return;
      }

      const typeCandidates = Object.values(state.models)
        .filter(model => CONSTRAINT_TYPE_KINDS.includes(model.kind));
      const sideCounts = [
        declarations.filter((_, index) => index % 2 === 0).length,
        declarations.filter((_, index) => index % 2 === 1).length,
      ];
      snapshot();
      const added = missing.map(definition => {
        const side = definition.index % 2;
        const parameter = adoptView(createElement(
          'constraintparameter',
          container.x + (side ? container.w : 0) - ROUTING.parameterHalfSize,
          container.y + container.h / 2 - ROUTING.parameterHalfSize,
        ));
        parameter.name = definition.name;
        parameter.parentId = container.id;
        parameter.borderAnchor = borderAnchorFor(definition.index, sideCounts);
        const type = typeCandidates.find(model =>
          String(model.name || '').trim().toLowerCase() === definition.typeName.toLowerCase());
        parameter.classifierModelId = type?.id || '';
        dg().elements.push(parameter);
        return parameter;
      });
      setSelection(added.map(parameter => parameter.id));
      renderAll();
      flashStatus(`Constraint Parameter ${added.length}개를 추가했습니다`);
    }

    /* ── Route geometry ──────────────────────────────────────── */

    /* which way a route leaves this view: an anchored parameter uses the
       border it was pinned to, anything else uses its nearest edge */
    function portDirection(view, point) {
      if (view.kind === 'constraintparameter') {
        const owner = byId(view.parentId);
        const anchor = view.borderAnchor;
        if (owner && anchor) {
          if (anchor.fx === 0) return { x: -1, y: 0 };
          if (anchor.fx === 1) return { x: 1, y: 0 };
          if (anchor.fy === 0) return { x: 0, y: -1 };
          if (anchor.fy === 1) return { x: 0, y: 1 };
        }
      }
      const distances = [
        { distance: Math.abs(point.x - view.x), direction: { x: -1, y: 0 } },
        { distance: Math.abs(point.x - view.x - view.w), direction: { x: 1, y: 0 } },
        { distance: Math.abs(point.y - view.y), direction: { x: 0, y: -1 } },
        { distance: Math.abs(point.y - view.y - view.h), direction: { x: 0, y: 1 } },
      ].sort((a, b) => a.distance - b.distance);
      return distances[0].direction;
    }

    /* everything a route has to avoid: the frame is scenery, and the two
       views being connected are where the route starts and ends */
    function obstaclesFor(diagram, from, to) {
      const excluded = new Set([from.id, to.id]);
      return diagram.elements
        .filter(element => element.kind !== 'parametricframe'
          && !excluded.has(element.id)
          && Number.isFinite(element.w) && element.w > 0
          && Number.isFinite(element.h) && element.h > 0)
        .map(element => ({ x: element.x, y: element.y, w: element.w, h: element.h }));
    }

    /* routes are laid one at a time so each can see and jump the earlier ones */
    function computeRoutes(diagram) {
      routeCache = new Map();
      if (!diagram || diagram.type !== 'parametric') return;
      const existingRoutes = [];
      diagram.relations.filter(relation => relation.kind === 'bindingconnector').forEach(relation => {
        const endpoints = relEndpoints(relation);
        const from = byId(relation.from), to = byId(relation.to);
        if (!endpoints || !from || !to) return;
        const routeOptions = {
          start: endpoints.p1,
          end: endpoints.p2,
          startDirection: portDirection(from, endpoints.p1),
          endDirection: portDirection(to, endpoints.p2),
          obstacles: obstaclesFor(diagram, from, to),
          existingRoutes,
          clearance: ROUTING.clearance,
          grid: GRID,
        };
        const route = relation.routeMode === 'manual'
          ? routeManualOrthogonal({ ...routeOptions, waypoints: waypoints(relation) })
          : routeOrthogonal(routeOptions);
        route.jumpCrossings = relation.jumpStyle === 'none'
          ? []
          : collectPolylineCrossings(route.points, existingRoutes);
        route.jumpCount = route.jumpCrossings.length;
        routeCache.set(relation.id, route);
        existingRoutes.push(route.points);
      });
    }

    function route(r) {
      const cached = routeCache.get(r.id);
      if (cached) return cached;
      const endpoints = relEndpoints(r);
      return endpoints ? { points: [endpoints.p1, endpoints.p2], ...STRAIGHT_ROUTE_METRICS } : null;
    }

    /* ── Manual waypoints ────────────────────────────────────── */

    function waypoints(r) {
      return (Array.isArray(r.manualPoints) ? r.manualPoints : [])
        .filter(point => Number.isFinite(point?.x) && Number.isFinite(point?.y))
        .map(point => ({ x: point.x, y: point.y }));
    }

    /* freeze the route as it looks now so later edits stop moving it */
    function lock(r) {
      if (!r || r.kind !== 'bindingconnector') return;
      if (r.routeMode === 'manual' && Array.isArray(r.manualPoints)) return;
      const current = route(r);
      r.routeMode = 'manual';
      r.manualPoints = compactBindingWaypoints((current?.points || []).slice(1, -1));
    }

    function unlock(r) {
      if (!r || r.kind !== 'bindingconnector') return;
      delete r.routeMode;
      delete r.manualPoints;
    }

    function addWaypoint(r, point, segmentIndex) {
      if (!r || r.kind !== 'bindingconnector' || waypoints(r).length >= ROUTING.maxWaypoints) return false;
      const current = route(r);
      if (!current?.points?.length || current.points.length > ROUTING.maxWaypoints + 1) return false;
      const routePoints = current.points.map(item => ({ x: item.x, y: item.y }));
      const index = Number.isInteger(segmentIndex)
        ? Math.max(0, Math.min(routePoints.length - 2, segmentIndex))
        : nearestPolylineSegmentIndex(point, routePoints);
      const existing = r.routeMode === 'manual'
        ? waypoints(r)
        : compactBindingWaypoints(routePoints.slice(1, -1));
      /* clamp onto the segment first so the new point sorts into the right place */
      const a = routePoints[index], b = routePoints[index + 1];
      const insertionPosition = distanceAlongPolyline({
        x: Math.max(Math.min(point.x, Math.max(a.x, b.x)), Math.min(a.x, b.x)),
        y: Math.max(Math.min(point.y, Math.max(a.y, b.y)), Math.min(a.y, b.y)),
      }, routePoints);
      const insertAt = existing.findIndex(waypoint =>
        distanceAlongPolyline(waypoint, routePoints) > insertionPosition);
      r.routeMode = 'manual';
      r.manualPoints = existing;
      r.manualPoints.splice(insertAt < 0 ? existing.length : insertAt, 0, {
        x: snap(point.x), y: snap(point.y),
      });
      return true;
    }

    return Object.freeze({
      addWaypoint,
      computeRoutes,
      lock,
      portDirection,
      route,
      syncConstraintParameters,
      unlock,
      waypoints,
    });
  }

  return Object.freeze({
    REQUIRED_FUNCTIONS,
    REQUIRED_VALUES,
    ROUTING,
    create,
  });
});
