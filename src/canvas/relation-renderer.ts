'use strict';

type SvgAttributes = Record<string, string | number | boolean | null | undefined>;
type SvgElementFactory = <Tag extends keyof SVGElementTagNameMap>(tag: Tag, attrs: SvgAttributes, parent?: SVGElement | null) => SVGElementTagNameMap[Tag];
interface SvgTextOptions {
  color?: string;
  size?: number;
  bold?: boolean;
  italic?: boolean;
  underline?: boolean;
  anchor?: 'start' | 'middle' | 'end';
}
type SvgTextFactory = (parent: SVGElement, label: string | undefined | null, x: number, y: number, options?: SvgTextOptions) => SVGTextElement;
interface LabelOffset { dx: number; dy: number }
interface LabeledCubicCurve extends DiagramCubicCurve { label: DiagramPoint }
interface SelfMessagePoints { self: true; startX: number; endX: number; y: number; width: number; height: number }
interface StraightMessagePoints extends DiagramEndpoints { self?: false }
type MessagePoints = SelfMessagePoints | StraightMessagePoints;
type CommunicationMessagePoints = SelfMessagePoints | (StraightMessagePoints & { normal: DiagramPoint });
type RelationEnd = 'source' | 'target';
interface RelationDrawingStyle { head?: string | null; dash?: string | null }
interface ErdCardinalityMarker { canonical: string; min: 'zero' | 'one'; max: 'one' | 'many' }

interface RelationRendererDependencies {
  el: SvgElementFactory;
  text: SvgTextFactory;
  measureText(label: string): number;
  headGeom(tip: DiagramPoint, angle: number, length: number, width: number): { l: DiagramPoint; r: DiagramPoint; bx: number; by: number };
  parseErdCardinality(value?: string, fallback?: string): ErdCardinalityMarker;
  isMessage(kind: string): boolean;
  isCommunicationMessage(kind: string): boolean;
  messagePoints(relation: DiagramRelation): MessagePoints | null;
  messageLabel(relation: DiagramRelation): string;
  communicationSelfConnectorGeometry(relation: DiagramRelation): LabeledCubicCurve | null;
  communicationMessagePoints(relation: DiagramRelation): CommunicationMessagePoints | null;
  stateSelfTransitionGeometry(relation: DiagramRelation): LabeledCubicCurve | null;
  relationEndpoints(relation: DiagramRelation): DiagramEndpoints | null;
  bindingRoute(relation: DiagramRelation): BindingRoute | null;
  polylinePath(points: DiagramPoint[]): string;
  polylineJumpPath(points: DiagramPoint[], crossings: BindingCrossing[], options: { style: string; radius: number }): string;
  polylineMidpoint(points: DiagramPoint[]): DiagramPoint;
  relationLabel(relation: DiagramRelation): string;
  labelOffset(relation: DiagramRelation, field: string): LabelOffset;
  branchGeometry(relation: DiagramRelation): DiagramQuadraticCurve | null;
  bezierPoint(curve: DiagramQuadraticCurve, fraction: number): DiagramPoint;
  relationSupportsEndQuickEdit(relation: DiagramRelation): boolean;
  relationEndAggregation(relation: DiagramRelation, end: RelationEnd): string;
  relationEndNavigability(relation: DiagramRelation, end: RelationEnd): string;
  relationEndRoleLabel(relation: DiagramRelation, end: RelationEnd): string;
  relationStyles: { association: RelationDrawingStyle } & Partial<Record<string, RelationDrawingStyle>>;
  erRelationKinds: ReadonlySet<string>;
  stroke?: string;
  dashRelation?: string;
}

type RelationRendererApi = ReturnType<typeof createRelationRendererModule>;
declare var UMLRelationRenderer: RelationRendererApi;

(function initRelationRenderer(root: typeof globalThis, factory: () => RelationRendererApi) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root) root.UMLRelationRenderer = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, createRelationRendererModule);

function createRelationRendererModule() {
  const ERD_LINE = '#9c4130';
  const ERD_ENDS: Readonly<Partial<Record<string, readonly string[]>>> = Object.freeze({
    'erd-11': Object.freeze(['1', '1']),
    'erd-1n': Object.freeze(['1', '1..N']),
    'erd-nm': Object.freeze(['1..N', '1..N']),
  });

  const REQUIRED_FUNCTIONS = [
    'el', 'text', 'measureText', 'headGeom', 'parseErdCardinality',
    'isMessage', 'isCommunicationMessage', 'messagePoints', 'messageLabel',
    'communicationSelfConnectorGeometry', 'communicationMessagePoints',
    'stateSelfTransitionGeometry', 'relationEndpoints', 'bindingRoute',
    'polylinePath', 'polylineJumpPath', 'polylineMidpoint', 'relationLabel',
    'labelOffset', 'branchGeometry', 'bezierPoint', 'relationSupportsEndQuickEdit',
    'relationEndAggregation', 'relationEndNavigability', 'relationEndRoleLabel',
  ] as const;

  function relationMessageStyle(relation: Pick<DiagramRelation, 'messageSort'>, dashRelation = '6 4') {
    const sort = relation.messageSort || 'synchCall';
    if (sort === 'reply') return { head: 'open', dash: dashRelation };
    if (sort === 'asynchCall' || sort === 'asynchSignal') return { head: 'open', dash: null };
    if (sort === 'createMessage') return { head: 'open', dash: dashRelation };
    if (sort === 'deleteMessage') return { head: 'x', dash: null };
    return { head: 'filled', dash: null };
  }

  function create(dependencies?: RelationRendererDependencies) {
    const deps: Partial<RelationRendererDependencies> = dependencies || {};
    const missing: string[] = REQUIRED_FUNCTIONS.filter(name => typeof deps[name] !== 'function');
    if (!deps.relationStyles || typeof deps.relationStyles !== 'object') missing.push('relationStyles');
    if (!deps.erRelationKinds || typeof deps.erRelationKinds.has !== 'function') missing.push('erRelationKinds');
    if (missing.length) {
      throw new TypeError(`관계 렌더러 의존성이 없습니다: ${missing.join(', ')}`);
    }

    const {
      el,
      text,
      measureText,
      headGeom,
      parseErdCardinality,
      isMessage,
      isCommunicationMessage,
      messagePoints,
      messageLabel,
      communicationSelfConnectorGeometry,
      communicationMessagePoints,
      stateSelfTransitionGeometry,
      relationEndpoints,
      bindingRoute,
      polylinePath,
      polylineJumpPath,
      polylineMidpoint,
      relationLabel,
      labelOffset,
      branchGeometry,
      bezierPoint,
      relationSupportsEndQuickEdit,
      relationEndAggregation,
      relationEndNavigability,
      relationEndRoleLabel,
      relationStyles,
      erRelationKinds,
    } = deps as RelationRendererDependencies;
    const stroke = deps.stroke || '#3d3a2e';
    const dashRelation = deps.dashRelation || '6 4';

    function drawTriangle(group: SVGElement, tip: DiagramPoint, angle: number, filled: boolean) {
      const head = headGeom(tip, angle, filled ? 12 : 14, filled ? 10 : 12);
      el('path', {
        d: `M ${tip.x} ${tip.y} L ${head.l.x} ${head.l.y} L ${head.r.x} ${head.r.y} Z`,
        fill: filled ? stroke : '#ffffff', stroke, 'stroke-width': 1, 'stroke-linejoin': 'miter',
      }, group);
      return { x: head.bx, y: head.by };
    }

    function drawOpenArrow(group: SVGElement, tip: DiagramPoint, angle: number) {
      const head = headGeom(tip, angle, 12, 10);
      el('path', {
        d: `M ${head.l.x} ${head.l.y} L ${tip.x} ${tip.y} L ${head.r.x} ${head.r.y}`,
        fill: 'none', stroke, 'stroke-width': 1, 'stroke-linecap': 'round',
      }, group);
      return tip;
    }

    function drawCirclePlus(group: SVGElement, tip: DiagramPoint, angle: number) {
      const cos = Math.cos(angle), sin = Math.sin(angle);
      const cx = tip.x - cos * 7, cy = tip.y - sin * 7;
      const px = -sin, py = cos;
      el('circle', { cx, cy, r: 6, fill: '#ffffff', stroke, 'stroke-width': 1.1 }, group);
      el('path', {
        d: `M ${cx - cos * 3.5} ${cy - sin * 3.5} L ${cx + cos * 3.5} ${cy + sin * 3.5}
            M ${cx - px * 3.5} ${cy - py * 3.5} L ${cx + px * 3.5} ${cy + py * 3.5}`,
        fill: 'none', stroke, 'stroke-width': 1,
      }, group);
      return { x: tip.x - cos * 13, y: tip.y - sin * 13 };
    }

    function drawDiamond(group: SVGElement, tip: DiagramPoint, angle: number, filled: boolean) {
      const length = 10, width = 8;
      const cos = Math.cos(angle), sin = Math.sin(angle);
      const middle = { x: tip.x - cos * length, y: tip.y - sin * length };
      const back = { x: tip.x - cos * length * 2, y: tip.y - sin * length * 2 };
      const px = -sin, py = cos;
      el('path', {
        d: `M ${tip.x} ${tip.y} L ${middle.x + px * width / 2} ${middle.y + py * width / 2} L ${back.x} ${back.y} L ${middle.x - px * width / 2} ${middle.y - py * width / 2} Z`,
        fill: filled ? stroke : '#ffffff', stroke, 'stroke-width': 1, 'stroke-linejoin': 'miter',
      }, group);
      return back;
    }

    function drawXMark(group: SVGElement, point: DiagramPoint) {
      const size = 6;
      el('path', {
        d: `M ${point.x - size} ${point.y - size} L ${point.x + size} ${point.y + size} M ${point.x - size} ${point.y + size} L ${point.x + size} ${point.y - size}`,
        stroke, 'stroke-width': 1.6, fill: 'none',
      }, group);
    }

    function drawErdEnd(group: SVGElement, point: DiagramPoint, angle: number, cardinality: ErdCardinalityMarker | string) {
      const ux = Math.cos(angle), uy = Math.sin(angle);
      const px = -uy, py = ux;
      const parsed = typeof cardinality === 'string'
        ? parseErdCardinality(cardinality)
        : cardinality;
      const marker = el('g', {
        'data-erd-cardinality': parsed.canonical, 'pointer-events': 'none',
      }, group);
      const bar = (distance: number) => {
        const x = point.x + ux * distance, y = point.y + uy * distance;
        el('line', {
          x1: x - px * 6, y1: y - py * 6, x2: x + px * 6, y2: y + py * 6,
          stroke: ERD_LINE, 'stroke-width': 1.3,
        }, marker);
      };
      if (parsed.max === 'one') {
        bar(5);
      } else {
        const x = point.x + ux * 11, y = point.y + uy * 11;
        el('path', {
          d: `M ${x} ${y} L ${point.x + ux + px * 7} ${point.y + uy + py * 7} M ${x} ${y} L ${point.x + ux} ${point.y + uy} M ${x} ${y} L ${point.x + ux - px * 7} ${point.y + uy - py * 7}`,
          fill: 'none', stroke: ERD_LINE, 'stroke-width': 1.2,
        }, marker);
      }
      if (parsed.min === 'zero') {
        el('circle', {
          cx: point.x + ux * 18, cy: point.y + uy * 18, r: 4.4,
          fill: '#ffffff', stroke: ERD_LINE, 'stroke-width': 1.3,
        }, marker);
      } else {
        bar(18);
      }
    }

    function drawStateSelfTransition(parent: SVGElement, relation: DiagramRelation, curve: LabeledCubicCurve) {
      const group = el('g', { 'data-rel': relation.id }, parent);
      const path = `M ${curve.p1.x} ${curve.p1.y} C ${curve.c1.x} ${curve.c1.y}, ${curve.c2.x} ${curve.c2.y}, ${curve.p2.x} ${curve.p2.y}`;
      el('path', { d: path, fill: 'none', stroke: 'transparent', 'stroke-width': 12 }, group);
      el('path', { d: path, fill: 'none', stroke, 'stroke-width': 1, 'pointer-events': 'none' }, group);
      drawOpenArrow(group, curve.p2, Math.atan2(curve.p2.y - curve.c2.y, curve.p2.x - curve.c2.x));
      const label = relationLabel(relation);
      if (label) {
        const offset = labelOffset(relation, 'name');
        text(group, label, curve.label.x + offset.dx, curve.label.y + offset.dy, { anchor: 'middle' });
      }
      return group;
    }

    function drawCommunicationSelfConnector(parent: SVGElement, relation: DiagramRelation, curve: LabeledCubicCurve) {
      const group = el('g', { 'data-rel': relation.id }, parent);
      const path = `M ${curve.p1.x} ${curve.p1.y} C ${curve.c1.x} ${curve.c1.y}, ${curve.c2.x} ${curve.c2.y}, ${curve.p2.x} ${curve.p2.y}`;
      el('path', { d: path, fill: 'none', stroke: 'transparent', 'stroke-width': 12 }, group);
      el('path', { d: path, fill: 'none', stroke, 'stroke-width': 1, 'pointer-events': 'none' }, group);
      if (relation.name) {
        const offset = labelOffset(relation, 'name');
        text(group, relation.name, curve.label.x + offset.dx, curve.label.y + offset.dy, { anchor: 'middle' });
      }
      return group;
    }

    function drawCommunicationMessageLabel(group: SVGElement, label: string, x: number, y: number, anchor: 'start' | 'middle', offset: LabelOffset) {
      if (!label) return;
      const position = offset || { dx: 0, dy: 0 };
      const tx = x + position.dx, ty = y + position.dy;
      const width = measureText(label);
      const left = anchor === 'start' ? tx - 3 : tx - width / 2 - 3;
      el('rect', { x: left, y: ty - 12, width: width + 6, height: 16, fill: '#ffffff', opacity: 0.9 }, group);
      text(group, label, tx, ty, { anchor });
    }

    function drawCommunicationMessage(parent: SVGElement, relation: DiagramRelation) {
      const points = communicationMessagePoints(relation);
      if (!points) return undefined;
      const style = relationMessageStyle(relation, dashRelation);
      const label = messageLabel(relation);
      const group = el('g', { 'data-rel': relation.id }, parent);
      if (points.self) {
        const width = points.width, height = points.height, x = points.startX, y = points.y;
        el('rect', { x: x - 4, y: y - 8, width: width + 12, height: height + 14, fill: 'transparent' }, group);
        let end = { x: points.endX, y: y + height };
        if (style.head === 'filled') end = drawTriangle(group, end, Math.PI, true);
        else if (style.head === 'open') end = drawOpenArrow(group, end, Math.PI);
        else if (style.head === 'x') { drawXMark(group, end); end = { x: end.x + 7, y: end.y }; }
        const path = el('path', {
          d: `M ${x} ${y} L ${x + width} ${y} L ${x + width} ${y + height} L ${end.x} ${end.y}`,
          fill: 'none', stroke, 'stroke-width': 1, 'pointer-events': 'none',
        }, group);
        if (style.dash) path.setAttribute('stroke-dasharray', style.dash);
        if (label) drawCommunicationMessageLabel(group, label, x + 8, y - 5, 'start', labelOffset(relation, 'name'));
        return group;
      }
      const angle = Math.atan2(points.p2.y - points.p1.y, points.p2.x - points.p1.x);
      el('line', {
        x1: points.p1.x, y1: points.p1.y, x2: points.p2.x, y2: points.p2.y,
        stroke: 'transparent', 'stroke-width': 12,
      }, group);
      let end = points.p2;
      if (style.head === 'filled') end = drawTriangle(group, points.p2, angle, true);
      else if (style.head === 'open') end = drawOpenArrow(group, points.p2, angle);
      else if (style.head === 'x') {
        drawXMark(group, points.p2);
        end = { x: points.p2.x - Math.cos(angle) * 7, y: points.p2.y - Math.sin(angle) * 7 };
      }
      const line = el('line', {
        x1: points.p1.x, y1: points.p1.y, x2: end.x, y2: end.y,
        stroke, 'stroke-width': 1, 'pointer-events': 'none',
      }, group);
      if (style.dash) line.setAttribute('stroke-dasharray', style.dash);
      if (label) {
        const middleX = (points.p1.x + points.p2.x) / 2;
        const middleY = (points.p1.y + points.p2.y) / 2;
        drawCommunicationMessageLabel(
          group,
          label,
          middleX + points.normal.x * 9,
          middleY + points.normal.y * 9 - 4,
          'middle',
          labelOffset(relation, 'name'),
        );
      }
      return group;
    }

    function drawBindingConnector(parent: SVGElement, relation: DiagramRelation) {
      const route = bindingRoute(relation);
      if (!route || route.points.length < 2) return undefined;
      const jumpStyle = relation.jumpStyle || 'arc';
      const group = el('g', {
        'data-rel': relation.id,
        'data-route-mode': relation.routeMode === 'manual' ? 'manual' : 'auto',
        'data-route-bends': route.bends || 0,
        'data-route-crossings': route.crossings || 0,
        'data-route-jumps': jumpStyle === 'none' ? 0 : (route.jumpCount || 0),
        'data-jump-style': jumpStyle,
      }, parent);
      el('path', {
        d: polylinePath(route.points), fill: 'none', stroke: 'transparent', 'stroke-width': 12,
        'stroke-linejoin': 'round', 'pointer-events': 'stroke',
      }, group);
      el('path', {
        d: polylineJumpPath(route.points, route.jumpCrossings, { style: jumpStyle, radius: 6 }),
        fill: 'none', stroke, 'stroke-width': 1.2,
        'stroke-linecap': 'square', 'stroke-linejoin': 'miter', 'pointer-events': 'none',
      }, group);
      const label = relationLabel(relation);
      if (label) {
        const midpoint = polylineMidpoint(route.points);
        const offset = labelOffset(relation, 'name');
        text(group, label, midpoint.x + offset.dx, midpoint.y - 6 + offset.dy, { anchor: 'middle' });
      }
      return group;
    }

    function drawBranch(parent: SVGElement, relation: DiagramRelation) {
      const geometry = branchGeometry(relation);
      if (!geometry) return undefined;
      const group = el('g', { 'data-rel': relation.id }, parent);
      const path = `M ${geometry.p1.x} ${geometry.p1.y} Q ${geometry.c.x} ${geometry.c.y} ${geometry.p2.x} ${geometry.p2.y}`;
      el('path', { d: path, fill: 'none', stroke: 'transparent', 'stroke-width': 12 }, group);
      el('path', {
        d: path, fill: 'none', stroke, 'stroke-width': 1.4,
        'stroke-linecap': 'round', 'pointer-events': 'none',
      }, group);
      if (relation.name) {
        const midpoint = bezierPoint(geometry, 0.5);
        const offset = labelOffset(relation, 'name');
        text(group, relation.name, midpoint.x + offset.dx, midpoint.y - 6 + offset.dy, { anchor: 'middle' });
      }
      return group;
    }

    function drawSequenceMessage(parent: SVGElement, relation: DiagramRelation) {
      const style = relationStyles[relation.kind] || relationStyles.association;
      const points = messagePoints(relation);
      if (!points) return undefined;
      const group = el('g', { 'data-rel': relation.id }, parent);
      const label = messageLabel(relation);
      if (points.self) {
        const { startX: x, endX, y, width, height } = points;
        const hitX = Math.min(x, endX) - 4;
        el('rect', { x: hitX, y: y - 8, width: width + 12 + Math.abs(endX - x), height: height + 14, fill: 'transparent' }, group);
        let end = { x: endX, y: y + height };
        if (style.head === 'filled') end = drawTriangle(group, end, Math.PI, true);
        else if (style.head === 'open') end = drawOpenArrow(group, end, Math.PI);
        const path = el('path', {
          d: `M ${x} ${y} L ${x + width} ${y} L ${x + width} ${y + height} L ${end.x} ${end.y}`,
          fill: 'none', stroke, 'stroke-width': 1, 'pointer-events': 'none',
        }, group);
        if (style.dash) path.setAttribute('stroke-dasharray', style.dash);
        if (label) {
          const offset = labelOffset(relation, 'name');
          text(group, label, x + 8 + offset.dx, y - 5 + offset.dy);
        }
        return group;
      }
      const { p1, p2 } = points;
      const angle = p2.x > p1.x ? 0 : Math.PI;
      el('line', { x1: p1.x, y1: p1.y, x2: p2.x, y2: p2.y, stroke: 'transparent', 'stroke-width': 12 }, group);
      let end = p2;
      if (style.head === 'filled') end = drawTriangle(group, p2, angle, true);
      else if (style.head === 'open') end = drawOpenArrow(group, p2, angle);
      else if (style.head === 'x') {
        drawXMark(group, p2);
        end = { x: p2.x - (p2.x > p1.x ? 7 : -7), y: p2.y };
      }
      const line = el('line', {
        x1: p1.x, y1: p1.y, x2: end.x, y2: end.y,
        stroke, 'stroke-width': 1, 'pointer-events': 'none',
      }, group);
      if (style.dash) line.setAttribute('stroke-dasharray', style.dash);
      if (label) {
        const offset = labelOffset(relation, 'name');
        text(group, label, (p1.x + p2.x) / 2 + offset.dx, p1.y - 6 + offset.dy, { anchor: 'middle' });
      }
      return group;
    }

    function drawGenericRelation(parent: SVGElement, relation: DiagramRelation) {
      const endpoints = relationEndpoints(relation);
      if (!endpoints) return undefined;
      const style = relation.kind === 'timingmessage'
        ? relationMessageStyle(relation, dashRelation)
        : (relationStyles[relation.kind] || relationStyles.association);
      const { p1, p2 } = endpoints;
      const angle = Math.atan2(p2.y - p1.y, p2.x - p1.x);
      const group = el('g', { 'data-rel': relation.id }, parent);
      el('line', { x1: p1.x, y1: p1.y, x2: p2.x, y2: p2.y, stroke: 'transparent', 'stroke-width': 10 }, group);

      let start = p1, end = p2;
      const semanticEnds = relationSupportsEndQuickEdit(relation) && !erRelationKinds.has(relation.kind);
      if (semanticEnds) {
        const sourceAggregation = relationEndAggregation(relation, 'source');
        const targetAggregation = relationEndAggregation(relation, 'target');
        if (sourceAggregation !== 'none') {
          start = drawDiamond(group, p1, angle + Math.PI, sourceAggregation === 'composite');
        } else if (relationEndNavigability(relation, 'source') === 'navigable') {
          drawOpenArrow(group, p1, angle + Math.PI);
        } else if (relationEndNavigability(relation, 'source') === 'notNavigable') {
          drawXMark(group, p1);
        }
        if (targetAggregation !== 'none') {
          end = drawDiamond(group, p2, angle, targetAggregation === 'composite');
        } else if (relationEndNavigability(relation, 'target') === 'navigable') {
          drawOpenArrow(group, p2, angle);
        } else if (relationEndNavigability(relation, 'target') === 'notNavigable') {
          drawXMark(group, p2);
        }
      } else if (style.head === 'triangle') end = drawTriangle(group, p2, angle, false);
      else if (style.head === 'filled') end = drawTriangle(group, p2, angle, true);
      else if (style.head === 'diamond') end = drawDiamond(group, p2, angle, false);
      else if (style.head === 'diamond-filled') end = drawDiamond(group, p2, angle, true);
      else if (style.head === 'open') end = drawOpenArrow(group, p2, angle);
      else if (style.head === 'circle-plus') end = drawCirclePlus(group, p2, angle);

      const erd = ERD_ENDS[relation.kind];
      const line = el('line', {
        x1: start.x, y1: start.y, x2: end.x, y2: end.y,
        stroke: erd ? ERD_LINE : stroke, 'stroke-width': erd ? 1.2 : 1, 'pointer-events': 'none',
      }, group);
      if (style.dash) line.setAttribute('stroke-dasharray', style.dash);
      else if (erd) line.setAttribute('stroke-dasharray', '6 3');
      if (erd) {
        drawErdEnd(group, p1, angle, parseErdCardinality(relation.sourceLabel, erd[0]));
        drawErdEnd(group, p2, angle + Math.PI, parseErdCardinality(relation.targetLabel, erd[1]));
      }

      const label = relationLabel(relation);
      const middleX = (p1.x + p2.x) / 2, middleY = (p1.y + p2.y) / 2;
      if (label) {
        const offset = labelOffset(relation, 'name');
        text(group, label, middleX + offset.dx, middleY - 6 + offset.dy, { anchor: 'middle' });
      }
      const endLabel = (point: DiagramPoint, other: DiagramPoint, value: string | undefined, field: string) => {
        if (!value) return;
        const endAngle = Math.atan2(other.y - point.y, other.x - point.x);
        const offset = labelOffset(relation, field);
        text(
          group,
          value,
          point.x + Math.cos(endAngle) * (erd ? 30 : 16) + offset.dx,
          point.y + Math.sin(endAngle) * (erd ? 30 : 16) - 4 + offset.dy,
          { anchor: 'middle' },
        );
      };
      endLabel(p1, p2, relation.sourceLabel, 'sourceLabel');
      endLabel(p2, p1, relation.targetLabel, 'targetLabel');
      const endRole = (point: DiagramPoint, other: DiagramPoint, value: string | undefined, field: string) => {
        if (!value) return;
        const endAngle = Math.atan2(other.y - point.y, other.x - point.x);
        const nx = -Math.sin(endAngle), ny = Math.cos(endAngle);
        const offset = labelOffset(relation, field);
        text(
          group,
          value,
          point.x + Math.cos(endAngle) * 38 + nx * 11 + offset.dx,
          point.y + Math.sin(endAngle) * 38 + ny * 11 - 4 + offset.dy,
          { anchor: 'middle' },
        );
      };
      if (relationSupportsEndQuickEdit(relation)) {
        endRole(p1, p2, relationEndRoleLabel(relation, 'source'), 'sourceEndName');
        endRole(p2, p1, relationEndRoleLabel(relation, 'target'), 'targetEndName');
      }
      return group;
    }

    function draw(parent: SVGElement, relation: DiagramRelation) {
      if (isMessage(relation.kind)) return drawSequenceMessage(parent, relation);
      if (isCommunicationMessage(relation.kind)) return drawCommunicationMessage(parent, relation);
      if (relation.kind === 'mindbranch') return drawBranch(parent, relation);
      if (relation.kind === 'bindingconnector') return drawBindingConnector(parent, relation);
      const communicationCurve = communicationSelfConnectorGeometry(relation);
      if (communicationCurve) return drawCommunicationSelfConnector(parent, relation, communicationCurve);
      const stateCurve = stateSelfTransitionGeometry(relation);
      if (stateCurve) return drawStateSelfTransition(parent, relation, stateCurve);
      return drawGenericRelation(parent, relation);
    }

    return Object.freeze({ draw });
  }

  return Object.freeze({ ERD_ENDS, ERD_LINE, relationMessageStyle, create });
}
