'use strict';

type ParametricBindingApi = ReturnType<typeof createParametricBindingModule>;
declare var UMLParametricBinding: ParametricBindingApi;

(function initParametricBindingModule(root: typeof globalThis & { UMLParametricBinding?: ParametricBindingApi }, factory: () => ParametricBindingApi) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root) root.UMLParametricBinding = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, createParametricBindingModule);

function createParametricBindingModule() {
  const { text: uiText } = globalThis.UMLLanguage
    ?? require('../editor/language.js') as typeof UMLLanguage;

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
  ] as const);
  const REQUIRED_VALUES = Object.freeze([
    'GRID',
    'state',
  ] as const);
  const ROUTING = Object.freeze({
    clearance: 14,
    maxWaypoints: 200,
    parameterHalfSize: 9,
  });
  const CONSTRAINT_TYPE_KINDS = Object.freeze(['block', 'valuetype']);
  const STRAIGHT_ROUTE_METRICS = Object.freeze({
    obstacleHits: 0, crossings: 0, overlap: 0, bends: 0,
    jumpCrossings: [], jumpCount: 0,
  });

  interface ParametricBindingDependencies {
    adoptView: (view: DiagramElement) => DiagramElement;
    byId: (id: string | null | undefined) => DiagramElement | undefined | null;
    childViews: (id: string) => DiagramElement[];
    collectPolylineCrossings: (points: readonly DiagramPoint[], routes: DiagramPoint[][]) => BindingCrossing[];
    compactBindingWaypoints: (points: readonly DiagramPoint[]) => DiagramPoint[];
    createElement: (kind: string, x: number, y: number) => DiagramElement;
    dg: () => EditorDiagram;
    distanceAlongPolyline: (point: DiagramPoint, points: DiagramPoint[]) => number;
    flashStatus: (message: string) => void;
    instanceClassifier: (view: DiagramElement) => DiagramModel | null | undefined;
    nearestPolylineSegmentIndex: (point: DiagramPoint, points: DiagramPoint[]) => number;
    parseConstraintParameterDefinition: (raw: string) => { name: string; typeName: string } | null;
    relEndpoints: (relation: DiagramRelation) => DiagramEndpoints | null;
    renderAll: () => void;
    routeManualOrthogonal: (options: BindingRouteOptions & { waypoints: DiagramPoint[] }) => OrthogonalRoute;
    routeOrthogonal: (options: BindingRouteOptions) => OrthogonalRoute;
    setSelection: (ids: string[]) => void;
    snap: (value: number) => number;
    snapshot: () => void;
    GRID: number;
    state: { models: DiagramModels };
  }

  function create(dependencies?: ParametricBindingDependencies) {
    const deps: Partial<ParametricBindingDependencies> = dependencies || {};
    const missing: string[] = REQUIRED_FUNCTIONS.filter(name => typeof deps[name] !== 'function');
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
    } = deps as ParametricBindingDependencies;

    let routeCache = new Map<string, BindingRoute>();

    function declaredParameters(classifier: DiagramModel) {
      const names = new Set();
      return (classifier.constraintParameters || [])
        .map(parseConstraintParameterDefinition)
        .filter((definition): definition is NonNullable<typeof definition> => Boolean(definition?.name))
        .filter(definition => {
          const key = definition.name.toLowerCase();
          if (names.has(key)) return false;
          names.add(key);
          return true;
        });
    }

    function borderAnchorFor(index: number, sideCounts: [number, number]) {
      const side = index % 2;
      const sideIndex = Math.floor(index / 2);
      return { fx: side, fy: (sideIndex + 1) / (sideCounts[side] + 1) };
    }

    function syncConstraintParameters(container: DiagramElement) {
      const classifier = instanceClassifier(container);
      if (!classifier || classifier.kind !== 'constraintblock') {
        flashStatus(uiText('Select a constraint block type first.', '먼저 Constraint Block Type을 선택하세요'));
        return;
      }
      const declarations = declaredParameters(classifier);
      if (!declarations.length) {
        flashStatus(uiText('The selected constraint block has no parameters.', '선택한 Constraint Block에 정의된 Parameter가 없습니다'));
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
        flashStatus(uiText('All constraint parameters are already in sync.', '모든 Constraint Parameter가 이미 동기화되어 있습니다'));
        return;
      }

      const typeCandidates = Object.values(state.models)
        .filter(model => CONSTRAINT_TYPE_KINDS.includes(model.kind));
      const sideCounts: [number, number] = [
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
      flashStatus(uiText('Added {0} constraint parameters.', 'Constraint Parameter {0}개를 추가했습니다', added.length));
    }

    function portDirection(view: DiagramElement, point: DiagramPoint) {
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

    function obstaclesFor(diagram: EditorDiagram, from: DiagramElement, to: DiagramElement) {
      const excluded = new Set([from.id, to.id]);
      return diagram.elements
        .filter(element => element.kind !== 'parametricframe'
          && !excluded.has(element.id)
          && Number.isFinite(element.w) && element.w > 0
          && Number.isFinite(element.h) && element.h > 0)
        .map(element => ({ x: element.x, y: element.y, w: element.w, h: element.h }));
    }

    function computeRoutes(diagram: EditorDiagram | null | undefined) {
      routeCache = new Map();
      if (!diagram || diagram.type !== 'parametric') return;
      const existingRoutes: DiagramPoint[][] = [];
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
        const jumpCrossings = relation.jumpStyle === 'none'
          ? []
          : collectPolylineCrossings(route.points, existingRoutes);
        routeCache.set(relation.id, { ...route, jumpCrossings, jumpCount: jumpCrossings.length });
        existingRoutes.push(route.points);
      });
    }

    function route(r: DiagramRelation): BindingRoute | null {
      const cached = routeCache.get(r.id);
      if (cached) return cached;
      const endpoints = relEndpoints(r);
      return endpoints ? { points: [endpoints.p1, endpoints.p2], ...STRAIGHT_ROUTE_METRICS } : null;
    }

    function waypoints(r: DiagramRelation) {
      return (Array.isArray(r.manualPoints) ? r.manualPoints : [])
        .filter(point => Number.isFinite(point?.x) && Number.isFinite(point?.y))
        .map(point => ({ x: point.x, y: point.y }));
    }

    function lock(r: DiagramRelation | null | undefined) {
      if (!r || r.kind !== 'bindingconnector') return;
      if (r.routeMode === 'manual' && Array.isArray(r.manualPoints)) return;
      const current = route(r);
      r.routeMode = 'manual';
      r.manualPoints = compactBindingWaypoints((current?.points || []).slice(1, -1));
    }

    function unlock(r: DiagramRelation | null | undefined) {
      if (!r || r.kind !== 'bindingconnector') return;
      delete r.routeMode;
      delete r.manualPoints;
    }

    function addWaypoint(r: DiagramRelation | null | undefined, point: DiagramPoint, segmentIndex?: number) {
      if (!r || r.kind !== 'bindingconnector' || waypoints(r).length >= ROUTING.maxWaypoints) return false;
      const current = route(r);
      if (!current?.points?.length || current.points.length > ROUTING.maxWaypoints + 1) return false;
      const routePoints = current.points.map(item => ({ x: item.x, y: item.y }));
      const index = segmentIndex !== undefined && Number.isInteger(segmentIndex)
        ? Math.max(0, Math.min(routePoints.length - 2, segmentIndex))
        : nearestPolylineSegmentIndex(point, routePoints);
      const existing = r.routeMode === 'manual'
        ? waypoints(r)
        : compactBindingWaypoints(routePoints.slice(1, -1));
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
}
