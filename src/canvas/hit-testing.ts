'use strict';

/* Hit testing — maps canvas coordinates back to diagram views, relations,
   labels, lifelines, communication connectors, and editable member rows.
   Geometry is injected so this module stays independent from rendering and
   from the application's mutable bootstrap state. */
(function initHitTestingModule<Api>(root: typeof globalThis & { UMLHitTesting?: Api }, factory: () => Api) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root) root.UMLHitTesting = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function createHitTestingModule() {
  const REQUIRED_FUNCTIONS = Object.freeze([
    'bezierPoint',
    'bindingRoute',
    'branchGeom',
    'communicationMessagePoints',
    'communicationSelfConnectorGeom',
    'cubicPoint',
    'dg',
    'distToSegment',
    'getSequenceBottom',
    'isCommMsg',
    'isMsg',
    'lblOff',
    'memberLists',
    'msgDisplayLabel',
    'msgPoints',
    'pointNearPolyline',
    'polylineMidpoint',
    'relEndpoints',
    'relLabel',
    'relationEndRoleLabel',
    'relationSupportsEndQuickEdit',
    'stateSelfTransitionGeom',
    'tw',
  ] as const);
  const REQUIRED_VALUES = Object.freeze([
    'ACTIVITY_CONTAINER_KINDS',
    'PACKAGE_CONTAINER_KINDS',
    'FONT12',
    'LINE_H',
  ] as const);
  const HIT_TOLERANCES = Object.freeze({
    containerBorder: 8,
    fragmentTitleWidth: 80,
    fragmentTitleHeight: 22,
    frameTitleHeight: 24,
    activityTitleSize: 40,
    packageTitleHeight: 54,
    subsystemTitleHeight: 48,
    lifelineLine: 8,
    lifelineTarget: 10,
    relation: 6,
    message: 7,
    connector: 9,
    labelPaddingX: 4,
    labelAbove: 12,
    labelBelow: 4,
  });

  interface HitElement extends DiagramElementBounds {
    _depth?: number;
    _m?: { contentTop?: number; RH?: number };
  }
  interface HitRelation extends DiagramLink {
    y?: number;
    sourceLabel?: string;
    targetLabel?: string;
  }
  type LabelField = 'name' | 'sourceLabel' | 'targetLabel' | 'sourceEndName' | 'targetEndName';
  type CommunicationGeometry =
    | { self: true; startX: number; y: number; width: number; height: number }
    | (DiagramEndpoints & { self?: false; normal: DiagramPoint });
  type MessageGeometry =
    | { self: true; startX: number; endX: number }
    | (DiagramEndpoints & { self?: false });
  type LabeledCurve = DiagramCubicCurve & { label: DiagramPoint };
  interface HitTestingDependencies {
    bezierPoint(curve: DiagramQuadraticCurve, t: number): DiagramPoint;
    bindingRoute(relation: HitRelation): { points: DiagramPoint[] } | null;
    branchGeom(relation: HitRelation): DiagramQuadraticCurve | null;
    communicationMessagePoints(relation: HitRelation): CommunicationGeometry | null;
    communicationSelfConnectorGeom(relation: HitRelation): LabeledCurve | null;
    cubicPoint(curve: DiagramCubicCurve, t: number): DiagramPoint;
    dg(): { type: string; elements: HitElement[]; relations: HitRelation[] };
    distToSegment(point: DiagramPoint, a: DiagramPoint, b: DiagramPoint): number;
    getSequenceBottom(): number;
    isCommMsg(kind: string): boolean;
    isMsg(kind: string): boolean;
    lblOff(relation: HitRelation, field: LabelField): { dx: number; dy: number };
    memberLists(element: HitElement): { kind: string; top: number; h: number; arr: unknown[] }[];
    msgDisplayLabel(relation: HitRelation): string;
    msgPoints(relation: HitRelation): MessageGeometry | null;
    pointNearPolyline(point: DiagramPoint, points: DiagramPoint[], threshold: number): boolean;
    polylineMidpoint(points: DiagramPoint[]): DiagramPoint;
    relEndpoints(relation: HitRelation): DiagramEndpoints | null;
    relLabel(relation: HitRelation): string;
    relationEndRoleLabel(relation: HitRelation, end: 'source' | 'target'): string;
    relationSupportsEndQuickEdit(relation: HitRelation): boolean;
    stateSelfTransitionGeom(relation: HitRelation): LabeledCurve | null;
    tw(text: string, font: string): number;
    ACTIVITY_CONTAINER_KINDS: ReadonlySet<string>;
    PACKAGE_CONTAINER_KINDS: ReadonlySet<string>;
    FONT12: string;
    LINE_H: number;
  }

  function create(dependencies?: HitTestingDependencies) {
    const deps: Partial<HitTestingDependencies> = dependencies || {};
    const missing: string[] = REQUIRED_FUNCTIONS.filter(name => typeof deps[name] !== 'function');
    REQUIRED_VALUES.forEach(name => {
      if (deps[name] == null) missing.push(name);
    });
    (['ACTIVITY_CONTAINER_KINDS', 'PACKAGE_CONTAINER_KINDS'] as const).forEach(name => {
      if (deps[name] != null && typeof deps[name].has !== 'function') missing.push(`${name}.has`);
    });
    if (missing.length) {
      throw new TypeError(`Hit Testing 의존성이 없습니다: ${[...new Set(missing)].join(', ')}`);
    }

    const {
      bezierPoint,
      bindingRoute,
      branchGeom,
      communicationMessagePoints,
      communicationSelfConnectorGeom,
      cubicPoint,
      dg,
      distToSegment,
      getSequenceBottom,
      isCommMsg,
      isMsg,
      lblOff,
      memberLists,
      msgDisplayLabel,
      msgPoints,
      pointNearPolyline,
      polylineMidpoint,
      relEndpoints,
      relLabel,
      relationEndRoleLabel,
      relationSupportsEndQuickEdit,
      stateSelfTransitionGeom,
      tw,
      ACTIVITY_CONTAINER_KINDS,
      PACKAGE_CONTAINER_KINDS,
      FONT12,
      LINE_H,
    } = deps as HitTestingDependencies;

    function inRect(element: DiagramBounds, point: DiagramPoint) {
      return point.x >= element.x && point.x <= element.x + element.w
        && point.y >= element.y && point.y <= element.y + element.h;
    }

    function nearFragmentEdge(element: DiagramBounds, point: DiagramPoint) {
      if (!inRect(element, point)) return false;
      const border = HIT_TOLERANCES.containerBorder;
      if (point.x < element.x + border || point.x > element.x + element.w - border
        || point.y < element.y + border || point.y > element.y + element.h - border) return true;
      return point.x < element.x + HIT_TOLERANCES.fragmentTitleWidth
        && point.y < element.y + HIT_TOLERANCES.fragmentTitleHeight;
    }

    function curveHit<Curve extends DiagramEndpoints>(point: DiagramPoint, curve: Curve, pointAt: (curve: Curve, t: number) => DiagramPoint, segments: number, radius: number) {
      let previous = curve.p1;
      for (let step = 1; step <= segments; step++) {
        const current = pointAt(curve, step / segments);
        if (distToSegment(point, previous, current) < radius) return true;
        previous = current;
      }
      return false;
    }

    function elementAt(point: DiagramPoint) {
      const diagram = dg();
      const elements = diagram.elements;
      if (diagram.type === 'sequence') {
        const execution = elements.filter(element => element.kind === 'execution' && inRect(element, point))
          .sort((a, b) => (b._depth || 0) - (a._depth || 0) || b.y - a.y)[0];
        if (execution) return execution;
      }
      /* Non-lifelines draw above lifelines in sequence diagrams. */
      for (let index = elements.length - 1; index >= 0; index--) {
        const element = elements[index];
        if (element.kind === 'lifeline') continue;
        if (element.kind === 'fragment') {
          if (nearFragmentEdge(element, point)) return element;
          continue;
        }
        if (element.kind === 'boundary' || element.kind === 'frame') {
          if (!inRect(element, point)) continue;
          const border = HIT_TOLERANCES.containerBorder;
          if (point.x < element.x + border || point.x > element.x + element.w - border
            || point.y < element.y + border || point.y > element.y + element.h - border
            || point.y < element.y + HIT_TOLERANCES.frameTitleHeight) return element;
          continue;
        }
        if (element.kind === 'compositestate') {
          if (!inRect(element, point)) continue;
          const border = HIT_TOLERANCES.containerBorder;
          const contentTop = (element._m && element._m.contentTop) || 28;
          if (point.x < element.x + border || point.x > element.x + element.w - border
            || point.y < element.y + border || point.y > element.y + element.h - border
            || point.y < element.y + contentTop) return element;
          continue;
        }
        if (ACTIVITY_CONTAINER_KINDS.has(element.kind)) {
          if (!inRect(element, point)) continue;
          const border = HIT_TOLERANCES.containerBorder;
          const titleBand = element.kind === 'swimlaneh'
            ? point.x < element.x + HIT_TOLERANCES.activityTitleSize
            : point.y < element.y + HIT_TOLERANCES.activityTitleSize;
          if (point.x < element.x + border || point.x > element.x + element.w - border
            || point.y < element.y + border || point.y > element.y + element.h - border || titleBand) return element;
          continue;
        }
        if (diagram.type === 'package' && PACKAGE_CONTAINER_KINDS.has(element.kind)) {
          if (!inRect(element, point)) continue;
          const border = HIT_TOLERANCES.containerBorder;
          const titleHeight = element.kind === 'subsystem'
            ? HIT_TOLERANCES.subsystemTitleHeight : HIT_TOLERANCES.packageTitleHeight;
          if (point.x < element.x + border || point.x > element.x + element.w - border
            || point.y < element.y + border || point.y > element.y + element.h - border
            || point.y < element.y + titleHeight) return element;
          continue;
        }
        if (inRect(element, point)) return element;
      }
      for (let index = elements.length - 1; index >= 0; index--) {
        const element = elements[index];
        if (element.kind !== 'lifeline') continue;
        if (inRect(element, point)) return element;
        const centerX = element.x + element.w / 2;
        if (diagram.type === 'sequence' && Math.abs(point.x - centerX) <= HIT_TOLERANCES.lifelineLine
          && point.y > element.y + element.h && point.y <= getSequenceBottom()) return element;
      }
      return null;
    }

    function lifelineAt(point: DiagramPoint) {
      const elements = dg().elements;
      for (let index = elements.length - 1; index >= 0; index--) {
        const element = elements[index];
        if (element.kind !== 'lifeline') continue;
        const centerX = element.x + element.w / 2;
        if (inRect(element, point)) return element;
        if (Math.abs(point.x - centerX) <= Math.max(HIT_TOLERANCES.lifelineTarget, element.w / 2)
          && point.y >= element.y && point.y <= getSequenceBottom()) return element;
      }
      return null;
    }

    function relationAt(point: DiagramPoint) {
      const relations = dg().relations;
      for (let index = relations.length - 1; index >= 0; index--) {
        const relation = relations[index];
        if (isCommMsg(relation.kind)) {
          const points = communicationMessagePoints(relation);
          if (!points) continue;
          if (points.self) {
            if (point.x >= points.startX - 4 && point.x <= points.startX + points.width + 8
              && point.y >= points.y - HIT_TOLERANCES.message
              && point.y <= points.y + points.height + HIT_TOLERANCES.message) return relation;
          } else if (distToSegment(point, points.p1, points.p2) < HIT_TOLERANCES.message) return relation;
          continue;
        }
        if (isMsg(relation.kind)) {
          const points = msgPoints(relation);
          if (!points || relation.y === undefined) continue;
          if (points.self) {
            const startX = Math.min(points.startX, points.endX) - 4;
            if (point.x >= startX && point.x <= startX + 56 + Math.abs(points.endX - points.startX)
              && point.y >= relation.y - HIT_TOLERANCES.message && point.y <= relation.y + 27) return relation;
          } else {
            const low = Math.min(points.p1.x, points.p2.x) - 4;
            const high = Math.max(points.p1.x, points.p2.x) + 4;
            if (Math.abs(point.y - relation.y) < HIT_TOLERANCES.message
              && point.x >= low && point.x <= high) return relation;
          }
          continue;
        }
        if (relation.kind === 'mindbranch') {
          const geometry = branchGeom(relation);
          if (geometry && curveHit(point, geometry, bezierPoint, 12, HIT_TOLERANCES.message)) return relation;
          continue;
        }
        const communicationCurve = communicationSelfConnectorGeom(relation);
        if (communicationCurve) {
          if (curveHit(point, communicationCurve, cubicPoint, 18, HIT_TOLERANCES.message)) return relation;
          continue;
        }
        const stateCurve = stateSelfTransitionGeom(relation);
        if (stateCurve) {
          if (curveHit(point, stateCurve, cubicPoint, 18, HIT_TOLERANCES.message)) return relation;
          continue;
        }
        if (relation.kind === 'bindingconnector') {
          const route = bindingRoute(relation);
          if (route && pointNearPolyline(point, route.points, HIT_TOLERANCES.message)) return relation;
          continue;
        }
        const endpoints = relEndpoints(relation);
        if (endpoints && distToSegment(point, endpoints.p1, endpoints.p2) < HIT_TOLERANCES.relation) return relation;
      }
      return null;
    }

    function communicationConnectorAt(point: DiagramPoint) {
      const connectors = dg().relations.filter(relation => relation.kind === 'commconnector');
      for (let index = connectors.length - 1; index >= 0; index--) {
        const relation = connectors[index];
        const curve = communicationSelfConnectorGeom(relation);
        if (curve) {
          if (curveHit(point, curve, cubicPoint, 18, HIT_TOLERANCES.connector)) return relation;
          continue;
        }
        const endpoints = relEndpoints(relation);
        if (endpoints && distToSegment(point, endpoints.p1, endpoints.p2) < HIT_TOLERANCES.connector) return relation;
      }
      return null;
    }

    /* Returns { r, field, bx, by, bw }; field identifies the editable label. */
    function relationLabelAt(point: DiagramPoint) {
      const relations = dg().relations;
      const labelHit = (relation: HitRelation, field: LabelField, text: string, x: number, baseY: number, anchor: 'start' | 'middle') => {
        if (!text) return null;
        const offset = lblOff(relation, field);
        x += offset.dx;
        baseY += offset.dy;
        const textWidth = tw(text, FONT12);
        const x0 = (anchor === 'start' ? x : x - textWidth / 2) - HIT_TOLERANCES.labelPaddingX;
        return point.x >= x0 && point.x <= x0 + textWidth + HIT_TOLERANCES.labelPaddingX * 2
          && point.y >= baseY - HIT_TOLERANCES.labelAbove && point.y <= baseY + HIT_TOLERANCES.labelBelow
          ? {
              r: relation,
              field,
              bx: x0,
              by: baseY - HIT_TOLERANCES.labelAbove,
              bw: textWidth + HIT_TOLERANCES.labelPaddingX * 2,
            }
          : null;
      };
      for (let index = relations.length - 1; index >= 0; index--) {
        const relation = relations[index];
        let hit = null;
        if (isCommMsg(relation.kind)) {
          const points = communicationMessagePoints(relation);
          if (!points) continue;
          if (points.self) {
            hit = labelHit(relation, 'name', msgDisplayLabel(relation), points.startX + 8, points.y - 5, 'start');
          } else {
            const middleX = (points.p1.x + points.p2.x) / 2;
            const middleY = (points.p1.y + points.p2.y) / 2;
            hit = labelHit(relation, 'name', msgDisplayLabel(relation),
              middleX + points.normal.x * 9, middleY + points.normal.y * 9 - 4, 'middle');
          }
        } else if (isMsg(relation.kind)) {
          const points = msgPoints(relation);
          if (!points || relation.y === undefined) continue;
          hit = points.self
            ? labelHit(relation, 'name', msgDisplayLabel(relation), points.startX + 8, relation.y - 5, 'start')
            : labelHit(relation, 'name', msgDisplayLabel(relation),
                (points.p1.x + points.p2.x) / 2, relation.y - 6, 'middle');
        } else if (relation.kind === 'mindbranch') {
          const geometry = branchGeom(relation);
          if (!geometry) continue;
          const middle = bezierPoint(geometry, 0.5);
          hit = labelHit(relation, 'name', relLabel(relation), middle.x, middle.y - 6, 'middle');
        } else {
          const communicationCurve = communicationSelfConnectorGeom(relation);
          const stateCurve = communicationCurve ? null : stateSelfTransitionGeom(relation);
          const curve = communicationCurve || stateCurve;
          if (curve) {
            hit = labelHit(relation, 'name', relLabel(relation), curve.label.x, curve.label.y, 'middle');
          } else if (relation.kind === 'bindingconnector') {
            const route = bindingRoute(relation);
            if (!route) continue;
            const middle = polylineMidpoint(route.points);
            hit = labelHit(relation, 'name', relLabel(relation), middle.x, middle.y - 6, 'middle');
          } else {
            const endpoints = relEndpoints(relation);
            if (!endpoints) continue;
            const { p1, p2 } = endpoints;
            hit = labelHit(relation, 'name', relLabel(relation),
              (p1.x + p2.x) / 2, (p1.y + p2.y) / 2 - 6, 'middle');
            if (!hit && relation.sourceLabel) {
              const angle = Math.atan2(p2.y - p1.y, p2.x - p1.x);
              hit = labelHit(relation, 'sourceLabel', relation.sourceLabel,
                p1.x + Math.cos(angle) * 16, p1.y + Math.sin(angle) * 16 - 4, 'middle');
            }
            if (!hit && relation.targetLabel) {
              const angle = Math.atan2(p1.y - p2.y, p1.x - p2.x);
              hit = labelHit(relation, 'targetLabel', relation.targetLabel,
                p2.x + Math.cos(angle) * 16, p2.y + Math.sin(angle) * 16 - 4, 'middle');
            }
            if (!hit && relationSupportsEndQuickEdit(relation)) {
              const sourceRole = relationEndRoleLabel(relation, 'source');
              if (sourceRole) {
                const angle = Math.atan2(p2.y - p1.y, p2.x - p1.x);
                hit = labelHit(relation, 'sourceEndName', sourceRole,
                  p1.x + Math.cos(angle) * 38 - Math.sin(angle) * 11,
                  p1.y + Math.sin(angle) * 38 + Math.cos(angle) * 11 - 4, 'middle');
              }
              const targetRole = relationEndRoleLabel(relation, 'target');
              if (!hit && targetRole) {
                const angle = Math.atan2(p1.y - p2.y, p1.x - p2.x);
                hit = labelHit(relation, 'targetEndName', targetRole,
                  p2.x + Math.cos(angle) * 38 - Math.sin(angle) * 11,
                  p2.y + Math.sin(angle) * 38 + Math.cos(angle) * 11 - 4, 'middle');
              }
            }
          }
        }
        if (hit) return hit;
      }
      return null;
    }

    function memberRowAt(element: HitElement, point: DiagramPoint) {
      if (!['class', 'interface', 'enumeration', 'stereotype', 'informationitem', 'entity', 'object'].includes(element.kind)) return null;
      const rowHeight = element.kind === 'entity' ? ((element._m && element._m.RH) || 17) : LINE_H;
      for (const list of memberLists(element)) {
        const top = element.y + list.top;
        if (point.y >= top && point.y < top + list.h) {
          const index = Math.max(0, Math.floor((point.y - top - (element.kind === 'entity' ? 0 : 4)) / rowHeight));
          return { ...list, index, rowY: top + Math.min(index, list.arr.length) * rowHeight + 2 };
        }
      }
      return null;
    }

    return Object.freeze({
      communicationConnectorAt,
      elementAt,
      inRect,
      lifelineAt,
      memberRowAt,
      nearFragmentEdge,
      relationAt,
      relationLabelAt,
    });
  }

  return Object.freeze({
    REQUIRED_FUNCTIONS,
    REQUIRED_VALUES,
    HIT_TOLERANCES,
    create,
  });
});
