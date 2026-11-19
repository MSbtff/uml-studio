'use strict';

/* Canvas rendering orchestration — decides paint order per diagram type,
   rebuilds the SVG scene graph, draws the selection overlay and its drag
   handles, and refreshes the toolbar toggles that belong to the canvas.
   Element and relation painting, layout passes and hit geometry are injected
   so this module only owns the sequencing of a frame. */
interface CanvasRendererDependencies {
  assignTemporalDepths<T extends { el: string | undefined; y0: number; y1: number }>(items: T[]): (T & { depth: number })[];
  bindingRoute: RelationRendererDependencies['bindingRoute'];
  bindingWaypoints(relation: DiagramRelation): DiagramPoint[];
  branchGeom: RelationRendererDependencies['branchGeometry'];
  byId(id: string | undefined): DiagramElement | null | undefined;
  center(view: DiagramBounds): DiagramPoint;
  childViews(id: string): DiagramElement[];
  clearSequenceBars(): void;
  clearSequenceNumbers(): void;
  communicationMessagePoints: RelationRendererDependencies['communicationMessagePoints'];
  communicationSelfConnectorGeom: RelationRendererDependencies['communicationSelfConnectorGeometry'];
  computeBindingRoutes(diagram: EditorDiagram): void;
  computeSeqNumbers(diagram: EditorDiagram): void;
  computeSequenceLayout(diagram: EditorDiagram): void;
  containmentDepth(view: DiagramElement, diagram: EditorDiagram): number;
  dg(): EditorDiagram;
  drawElement(parent: SVGElement, element: DiagramElement): SVGGElement | undefined;
  drawRelation(parent: SVGElement, relation: DiagramRelation): unknown;
  edgePoint(view: DiagramBounds, point: DiagramPoint): DiagramPoint;
  el: SvgElementFactory;
  erdMode(): string;
  fragmentOperandLayout: CanvasInteractionDependencies['fragmentOperandLayout'];
  getSequenceBars(): readonly { manual?: boolean; el?: string; depth: number; y0: number; y1: number }[];
  interactionState(): CanvasInteractionFrame;
  isCommMsg(kind: string): boolean;
  isMsg(kind: string): boolean;
  layoutActivityAttachments(diagram: EditorDiagram): void;
  layoutCompositePorts(diagram: EditorDiagram): void;
  layoutCompositeRegions(diagram: EditorDiagram): void;
  layoutConnectionPointRefs(diagram: EditorDiagram): void;
  layoutParametricParameters(diagram: EditorDiagram): void;
  layoutTimingDiagram(diagram: EditorDiagram): void;
  measure(view: DiagramElement): ElementMeasurement;
  msgPoints: RelationRendererDependencies['messagePoints'];
  normalizeSize(view: DiagramElement): void;
  polylineJumpPath: RelationRendererDependencies['polylineJumpPath'];
  relById(id: string): DiagramRelation | null | undefined;
  relEndpoints: RelationRendererDependencies['relationEndpoints'];
  renderExplorer(): void;
  renderMinimap(): void;
  renderStatus(): void;
  renderTabs(): void;
  setErdMode(mode: string): void;
  snapshot(): void;
  stateSelfTransitionGeom: RelationRendererDependencies['stateSelfTransitionGeometry'];
  ACTIVITY_PIN_KINDS: ReadonlySet<string>;
  CANVAS_H: number;
  CANVAS_W: number;
  DASH_SELECT: string;
  ERD_VIEW_MODES: readonly (readonly [string, string])[];
  EXEC_NEST_OFFSET: number;
  EXEC_WIDTH: number;
  FILL_DEFAULT: string;
  STROKE: string;
  document: Document;
  state: CanvasSelectionState;
  svg: SVGSVGElement;
}

type CanvasRendererApi = ReturnType<typeof createCanvasRendererModule>;
declare var UMLCanvasRenderer: CanvasRendererApi;

(function initCanvasRendererModule(root: typeof globalThis, factory: () => CanvasRendererApi) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root) root.UMLCanvasRenderer = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, createCanvasRendererModule);

function createCanvasRendererModule() {
  const { text: uiText } = globalThis.UMLLanguage
    ?? require('../editor/language.js') as typeof UMLLanguage;

  const REQUIRED_FUNCTIONS = Object.freeze([
    'assignTemporalDepths',
    'bindingRoute',
    'bindingWaypoints',
    'branchGeom',
    'byId',
    'center',
    'childViews',
    'clearSequenceBars',
    'clearSequenceNumbers',
    'communicationMessagePoints',
    'communicationSelfConnectorGeom',
    'computeBindingRoutes',
    'computeSeqNumbers',
    'computeSequenceLayout',
    'containmentDepth',
    'dg',
    'drawElement',
    'drawRelation',
    'edgePoint',
    'el',
    'erdMode',
    'fragmentOperandLayout',
    'getSequenceBars',
    'interactionState',
    'isCommMsg',
    'isMsg',
    'layoutActivityAttachments',
    'layoutCompositePorts',
    'layoutCompositeRegions',
    'layoutConnectionPointRefs',
    'layoutParametricParameters',
    'layoutTimingDiagram',
    'measure',
    'msgPoints',
    'normalizeSize',
    'polylineJumpPath',
    'relById',
    'relEndpoints',
    'renderExplorer',
    'renderMinimap',
    'renderStatus',
    'renderTabs',
    'setErdMode',
    'snapshot',
    'stateSelfTransitionGeom',
  ] as const);
  const REQUIRED_VALUES = Object.freeze([
    'ACTIVITY_PIN_KINDS',
    'CANVAS_H',
    'CANVAS_W',
    'DASH_SELECT',
    'ERD_VIEW_MODES',
    'EXEC_NEST_OFFSET',
    'EXEC_WIDTH',
    'FILL_DEFAULT',
    'STROKE',
    'document',
    'state',
    'svg',
  ] as const);
  /* selection overlay look — the visual handles and the wider transparent
     areas that make them easy to grab */
  const RENDER_STYLE = Object.freeze({
    accent: '#1a73e8',
    reconnectTarget: '#2e9e5b',
    handleFill: '#ffffff',
    handleSize: 7,
    endpointHandleSize: 9,
    endpointHitSize: 20,
    routePointSize: 7,
    routePointHitSize: 14,
    routePointFill: '#dcecff',
    highlightWidth: 3,
    curveHighlightWidth: 4,
    highlightOpacity: 0.25,
  });
  /* diagram types whose paint order is decided by containment nesting alone */
  const CONTAINMENT_ORDERED_TYPES = Object.freeze(['composite', 'bdd', 'ibd', 'parametric', 'package']);
  const SEQ_OPTS_HOLDER_ID = 'seqopts';
  const ERD_MODE_HOLDER_ID = 'erdmode';

  function create(dependencies?: CanvasRendererDependencies) {
    const deps: Partial<CanvasRendererDependencies> = dependencies || {};
    const missing: string[] = REQUIRED_FUNCTIONS.filter(name => typeof deps[name] !== 'function');
    REQUIRED_VALUES.forEach(name => {
      if (deps[name] == null) missing.push(name);
    });
    if (deps.ACTIVITY_PIN_KINDS != null && typeof deps.ACTIVITY_PIN_KINDS.has !== 'function') {
      missing.push('ACTIVITY_PIN_KINDS.has');
    }
    if (deps.document != null && typeof deps.document.createElement !== 'function') {
      missing.push('document.createElement');
    }
    if (missing.length) {
      throw new TypeError(`Canvas Renderer 의존성이 없습니다: ${[...new Set(missing)].join(', ')}`);
    }

    const {
      assignTemporalDepths,
      bindingRoute,
      bindingWaypoints,
      branchGeom,
      byId,
      center,
      childViews,
      clearSequenceBars,
      clearSequenceNumbers,
      communicationMessagePoints,
      communicationSelfConnectorGeom,
      computeBindingRoutes,
      computeSeqNumbers,
      computeSequenceLayout,
      containmentDepth,
      dg,
      drawElement,
      drawRelation,
      edgePoint,
      el,
      erdMode,
      fragmentOperandLayout,
      getSequenceBars,
      interactionState,
      isCommMsg,
      isMsg,
      layoutActivityAttachments,
      layoutCompositePorts,
      layoutCompositeRegions,
      layoutConnectionPointRefs,
      layoutParametricParameters,
      layoutTimingDiagram,
      measure,
      msgPoints,
      normalizeSize,
      polylineJumpPath,
      relById,
      relEndpoints,
      renderExplorer,
      renderMinimap,
      renderStatus,
      renderTabs,
      setErdMode,
      snapshot,
      stateSelfTransitionGeom,
      ACTIVITY_PIN_KINDS,
      CANVAS_H,
      CANVAS_W,
      DASH_SELECT,
      ERD_VIEW_MODES,
      EXEC_NEST_OFFSET,
      EXEC_WIDTH,
      FILL_DEFAULT,
      STROKE,
      document,
      state,
      svg,
    } = deps as CanvasRendererDependencies;

    /* ── Paint order ─────────────────────────────────────────── */

    function drawOrder(kind: string) {
      if (kind === 'frame') return -3;      // behind everything
      if (kind === 'compositestate') return -2;
      if (kind === 'region') return -1;
      if (kind === 'lifeline') return 0;
      if (kind === 'execution') return 0.5; // on the lifeline, under fragments/messages
      if (kind === 'fragment') return 1;
      return 2;
    }

    function timingDrawOrder(kind: string) {
      if (kind === 'lifeline') return -3;
      if (kind === 'timingstate') return -2;
      if (kind === 'timetick') return -1;
      if (kind === 'timesegment') return 1;
      if (kind === 'timeconstraint' || kind === 'durationconstraint') return 2;
      return 0;
    }

    function activityDrawOrder(kind: string) {
      if (kind === 'swimlanev' || kind === 'swimlaneh') return -4;
      if (kind === 'interruptibleregion') return -3;
      if (kind === 'structuredactivity' || kind === 'expansionregion') return -2;
      if (ACTIVITY_PIN_KINDS.has(kind)) return 2;
      return 0;
    }

    function orderedElements(d: EditorDiagram) {
      if (d.type === 'sequence' || d.type === 'state') {
        return d.elements.slice().sort((a, b) => {
          const order = drawOrder(a.kind) - drawOrder(b.kind);
          if (order) return order;
          if (a.kind === 'execution' && b.kind === 'execution') return (a._depth || 0) - (b._depth || 0) || a.y - b.y;
          return 0;
        });
      }
      if (d.type === 'timing') {
        return d.elements.slice().sort((a, b) => {
          const order = timingDrawOrder(a.kind) - timingDrawOrder(b.kind);
          return order || containmentDepth(a, d) - containmentDepth(b, d);
        });
      }
      if (d.type === 'activity') {
        return d.elements.slice().sort((a, b) => {
          const order = activityDrawOrder(a.kind) - activityDrawOrder(b.kind);
          return order || containmentDepth(a, d) - containmentDepth(b, d);
        });
      }
      if (CONTAINMENT_ORDERED_TYPES.includes(d.type)) {
        return d.elements.slice().sort((a, b) => containmentDepth(a, d) - containmentDepth(b, d));
      }
      return d.elements;
    }

    /* ── Layout passes run before a frame is painted ─────────── */

    function runLayoutPasses(d: EditorDiagram) {
      d.elements.forEach(normalizeSize);
      if (d.type === 'state') {
        layoutCompositeRegions(d);
        layoutConnectionPointRefs(d);
      }
      if (d.type === 'composite' || d.type === 'bdd' || d.type === 'ibd') layoutCompositePorts(d);
      if (d.type === 'parametric') layoutParametricParameters(d);
      if (d.type === 'activity') layoutActivityAttachments(d);
      if (d.type === 'timing') layoutTimingDiagram(d);
      if (d.type === 'sequence') {
        /* keep Execution boxes glued to their lifeline centre; nested boxes
           on the same lifeline step right whenever their time ranges overlap */
        const execs = d.elements.filter(e => e.kind === 'execution');
        const intervals = assignTemporalDepths(execs.map(e => ({ id: e.id, el: e.lifeId, y0: e.y, y1: e.y + e.h, ref: e })));
        intervals.forEach(interval => {
          const e = interval.ref;
          const life = d.elements.find(l => l.id === e.lifeId);
          if (!life) return;
          e._depth = interval.depth;
          e.x = life.x + life.w / 2 - EXEC_WIDTH / 2 + interval.depth * EXEC_NEST_OFFSET;
        });
        computeSequenceLayout(d);
        computeSeqNumbers(d);
      } else if (d.type === 'communication') {
        clearSequenceBars();
        computeSeqNumbers(d);
      } else { clearSequenceBars(); clearSequenceNumbers(); }
      computeBindingRoutes(d);
    }

    /* ── Scene graph ─────────────────────────────────────────── */

    function buildCanvasRoot() {
      svg.setAttribute('viewBox', `0 0 ${CANVAS_W} ${CANVAS_H}`);
      svg.setAttribute('width', String(CANVAS_W * state.zoom));
      svg.setAttribute('height', String(CANVAS_H * state.zoom));
      svg.textContent = '';

      const defs = el('defs', {}, svg);
      const f = el('filter', { id: 'shadow', x: '-20%', y: '-20%', width: '150%', height: '150%' }, defs);
      el('feDropShadow', { dx: 3, dy: 3, stdDeviation: 1, 'flood-color': '#000', 'flood-opacity': 0.16 }, f);
      const pat = el('pattern', { id: 'grid', width: 16, height: 16, patternUnits: 'userSpaceOnUse' }, defs);
      el('circle', { cx: 1, cy: 1, r: 0.8, fill: '#dadcd2' }, pat);

      const root = el('g', { transform: 'translate(0.5 0.5)' }, svg);
      el('rect', { x: -0.5, y: -0.5, width: CANVAS_W, height: CANVAS_H, fill: '#ffffff' }, root);
      el('rect', { x: -0.5, y: -0.5, width: CANVAS_W, height: CANVAS_H, fill: 'url(#grid)', 'pointer-events': 'none' }, root);
      return root;
    }

    /* activation bars above lifelines, below messages — follow the
       owning lifeline's fill colour so recolouring a lifeline is consistent */
    function drawActivationBars(gRel: SVGGElement) {
      getSequenceBars().forEach(b => {
        if (b.manual) return; // manual Execution elements were already rendered above
        const life = byId(b.el);
        if (!life) return;
        const cx = life.x + life.w / 2;
        el('rect', {
          x: cx - EXEC_WIDTH / 2 + b.depth * EXEC_NEST_OFFSET, y: b.y0,
          width: EXEC_WIDTH, height: Math.max(6, b.y1 - b.y0),
          fill: life.fill || FILL_DEFAULT, stroke: STROKE, 'stroke-width': 1,
        }, gRel);
      });
    }

    /* ── In-progress interaction feedback ────────────────────── */

    function drawLinkingPreview(root: SVGElement, linking: CanvasLinking) {
      const from = byId(linking.fromId);
      if (!from) return;
      if (linking.message) {
        const { y, targetId } = linking.message;
        const target = targetId ? byId(targetId) : null;
        const x = center(from).x;
        const endX = target ? center(target).x : linking.x;
        const self = target?.id === from.id;
        const endY = self ? y + 20 : y;
        const direction = endX > x ? 1 : -1;
        const path = self
          ? `M ${x} ${y} h44 v20 H ${endX}`
          : `M ${x} ${y} H ${endX}`;
        if (target) el('circle', {
          'data-message-link-target': target.id, cx: endX, cy: endY, r: 8 / state.zoom,
          fill: 'none', stroke: RENDER_STYLE.accent, 'pointer-events': 'none',
          'vector-effect': 'non-scaling-stroke',
        }, root);
        el('path', {
          'data-message-link-preview': '',
          d: path, fill: 'none', stroke: RENDER_STYLE.accent, 'stroke-dasharray': '5 4',
          'pointer-events': 'none', 'vector-effect': 'non-scaling-stroke',
        }, root);
        if (target) el('path', {
          d: `M ${endX - direction * 8} ${endY - 4} L ${endX} ${endY} L ${endX - direction * 8} ${endY + 4}`,
          fill: 'none', stroke: RENDER_STYLE.accent, 'pointer-events': 'none',
        }, root);
        return;
      }
      const p = edgePoint(from, linking);
      el('line', {
        x1: p.x, y1: p.y, x2: linking.x, y2: linking.y,
        stroke: RENDER_STYLE.accent, 'stroke-width': 1.2, 'stroke-dasharray': '5 4', 'pointer-events': 'none',
      }, root);
    }

    function drawMarquee(root: SVGElement, marquee: CanvasMarquee) {
      el('rect', {
        x: Math.min(marquee.x0, marquee.x1), y: Math.min(marquee.y0, marquee.y1),
        width: Math.abs(marquee.x1 - marquee.x0), height: Math.abs(marquee.y1 - marquee.y0),
        fill: 'rgba(26,115,232,0.07)', stroke: RENDER_STYLE.accent, 'stroke-width': 1,
        'stroke-dasharray': '4 3', 'pointer-events': 'none',
      }, root);
    }

    function drawColumnDropIndicator(root: SVGElement, drag: CanvasColumnDrag) {
      const entity = drag.entity;
      const metrics = entity._m || measure(entity);
      if (metrics.headH === undefined || metrics.RH === undefined) return;
      const bodyTop = entity.y + metrics.headH;
      const rowTop = bodyTop + drag.targetIndex * metrics.RH;
      const insertY = rowTop + (drag.targetIndex > drag.fromIndex ? metrics.RH : 0);
      el('rect', {
        x: entity.x + 1, y: rowTop, width: entity.w - 2, height: metrics.RH,
        fill: 'rgba(26,115,232,.10)', stroke: 'none', 'pointer-events': 'none',
      }, root);
      el('line', {
        x1: entity.x + 2, y1: insertY, x2: entity.x + entity.w - 2, y2: insertY,
        stroke: RENDER_STYLE.accent, 'stroke-width': 2.5, 'pointer-events': 'none',
      }, root);
      el('circle', { cx: entity.x + 2, cy: insertY, r: 3, fill: RENDER_STYLE.accent, 'pointer-events': 'none' }, root);
      el('circle', { cx: entity.x + entity.w - 2, cy: insertY, r: 3, fill: RENDER_STYLE.accent, 'pointer-events': 'none' }, root);
    }

    /* 끝점 드래그 중: 현재 연결점 링 + 재연결 대상 하이라이트 */
    function drawEndpointDragFeedback(root: SVGElement, drag: CanvasEndpointDrag) {
      const rr = drag.rel;
      const ep2 = rr.kind === 'mindbranch' ? branchGeom(rr) : relEndpoints(rr);
      if (ep2) {
        const pt = drag.end === 'src' ? ep2.p1 : ep2.p2;
        el('circle', { cx: pt.x, cy: pt.y, r: 8, fill: 'none', stroke: RENDER_STYLE.accent, 'stroke-width': 2, 'pointer-events': 'none' }, root);
      }
      if (drag.hoverId) {
        const t = byId(drag.hoverId);
        if (t) el('rect', {
          x: t.x - 4, y: t.y - 4, width: t.w + 8, height: t.h + 8,
          fill: 'none', stroke: RENDER_STYLE.reconnectTarget, 'stroke-width': 2, 'stroke-dasharray': '5 3', 'pointer-events': 'none',
        }, root);
      }
    }

    function drawMessageSpacingGuide(root: SVGElement, drag: CanvasMessageDrag) {
      const guide = drag.guide;
      const points = guide && msgPoints(drag.rel);
      if (!guide || !points) return;
      const left = points.self ? Math.min(points.startX, points.endX) : Math.min(points.p1.x, points.p2.x);
      const right = points.self ? points.startX + points.width : Math.max(points.p1.x, points.p2.x);
      const x = right + 16 / state.zoom;
      const tick = 5 / state.zoom;
      const { before, after, y } = guide;
      el('path', {
        'data-message-spacing-guide': '',
        d: `M ${left} ${y} H ${x}
          M ${x} ${before} V ${after}
          M ${x - tick} ${before} h${2 * tick}
          M ${x - tick} ${y} h${2 * tick}
          M ${x - tick} ${after} h${2 * tick}`,
        fill: 'none', stroke: RENDER_STYLE.reconnectTarget, 'stroke-dasharray': '4 3',
        'pointer-events': 'none', 'vector-effect': 'non-scaling-stroke',
      }, root);
    }

    function render() {
      const d = dg();
      const { drag, linking, marquee, hoveredMessageId } = interactionState();
      runLayoutPasses(d);

      const root = buildCanvasRoot();
      const gEl = el('g', {}, root);
      const gRel = el('g', {}, root);
      const gSel = el('g', { 'pointer-events': 'none' }, root);

      orderedElements(d).forEach(e => {
        const group = drawElement(gEl, e);
        if (group && state.tool === 'select' && e.kind === 'fragment' && e.id !== state.selectedId) {
          drawOperandDividers(group, e);
        }
      });
      drawActivationBars(gRel);
      d.relations.forEach(r => drawRelation(gRel, r));
      if (hoveredMessageId && !state.selection.includes(hoveredMessageId)) {
        const hovered = relById(hoveredMessageId);
        if (hovered) drawMessageSelection(el('g', { 'data-message-hover': hovered.id }, gSel), hovered, false);
      }
      drawSelection(gSel);

      if (linking) drawLinkingPreview(root, linking);
      if (marquee) drawMarquee(root, marquee);
      if (drag && drag.mode === 'erdcolumn' && drag.moved) drawColumnDropIndicator(root, drag);
      if (drag && drag.mode === 'endpoint') drawEndpointDragFeedback(root, drag);
      if (drag?.mode === 'msgmove' && drag.guide) drawMessageSpacingGuide(root, drag);

      renderExplorer();
      renderStatus();
      renderTabs();
      renderErdMode();
      renderSeqOpts();
      renderMinimap();
    }

    /* ── Canvas-owned toolbar toggles ────────────────────────── */

    /* sequence-number toggle for sequence diagrams (shares the toolbar holder) */
    function renderSeqOpts() {
      const holder = document.getElementById(SEQ_OPTS_HOLDER_ID);
      if (!holder) return;
      const d = dg();
      if (!['sequence', 'communication'].includes(d.type)) { holder.innerHTML = ''; holder.style.display = 'none'; return; }
      holder.style.display = 'inline-flex';
      holder.innerHTML = '';
      holder.setAttribute('role', 'group');
      holder.setAttribute('aria-label', uiText('Sequence display options', '시퀀스 표시 옵션'));
      const b = document.createElement('button');
      b.textContent = uiText('Message Numbers', '메시지 번호');
      if (d.seqNumbers !== false) b.className = 'mode-active';
      b.title = uiText('Show or hide sequence message numbers', '메시지 시퀀스 번호 표시/숨김');
      b.setAttribute('aria-pressed', d.seqNumbers !== false ? 'true' : 'false');
      b.addEventListener('click', () => { snapshot(); d.seqNumbers = d.seqNumbers === false; render(); });
      holder.appendChild(b);
    }

    /* logical / physical / both view toggle for ER diagrams */
    function renderErdMode() {
      const holder = document.getElementById(ERD_MODE_HOLDER_ID);
      if (!holder) return;
      const d = dg();
      if (d.type !== 'erd') { holder.innerHTML = ''; holder.style.display = 'none'; return; }
      holder.style.display = 'inline-flex';
      holder.innerHTML = uiText('<span class="erd-mode-label">Show</span>', '<span class="erd-mode-label">표시</span>');
      holder.setAttribute('role', 'group');
      holder.setAttribute('aria-label', uiText('ERD display mode', 'ERD 표시 모드'));
      ERD_VIEW_MODES.forEach(([mode, label]) => {
        const b = document.createElement('button');
        b.textContent = label;
        b.title = uiText('Show ERD names in {0} mode', 'ERD {0} 표시', label);
        b.setAttribute('aria-pressed', erdMode() === mode ? 'true' : 'false');
        if (erdMode() === mode) b.className = 'mode-active';
        b.addEventListener('click', () => setErdMode(mode));
        holder.appendChild(b);
      });
    }

    /* ── Selection overlay ───────────────────────────────────── */

    function handlePositions(e: DiagramBounds) {
      const midx = e.x + e.w / 2, midy = e.y + e.h / 2;
      return [
        { dir: 'nw', x: e.x - 3, y: e.y - 3, cursor: 'nwse-resize' },
        { dir: 'n',  x: midx,    y: e.y - 3, cursor: 'ns-resize' },
        { dir: 'ne', x: e.x + e.w + 3, y: e.y - 3, cursor: 'nesw-resize' },
        { dir: 'e',  x: e.x + e.w + 3, y: midy, cursor: 'ew-resize' },
        { dir: 'se', x: e.x + e.w + 3, y: e.y + e.h + 3, cursor: 'nwse-resize' },
        { dir: 's',  x: midx, y: e.y + e.h + 3, cursor: 'ns-resize' },
        { dir: 'sw', x: e.x - 3, y: e.y + e.h + 3, cursor: 'nesw-resize' },
        { dir: 'w',  x: e.x - 3, y: midy, cursor: 'ew-resize' },
      ];
    }

    /* elements whose geometry is derived from a parent — resizing them by
       hand would be undone by the next layout pass */
    const UNRESIZABLE_KINDS = ['region', 'connectionpointref', 'port', 'inputpin', 'outputpin',
      'expansioninput', 'expansionoutput', 'timingstate', 'timetick', 'timeconstraint'];

    function outlineRect(g: SVGElement, view: DiagramBounds) {
      el('rect', {
        x: view.x - 3, y: view.y - 3, width: view.w + 6, height: view.h + 6,
        fill: 'none', stroke: RENDER_STYLE.accent, 'stroke-width': 1, 'stroke-dasharray': DASH_SELECT,
      }, g);
    }

    function highlightLine(g: SVGElement, p1: DiagramPoint, p2: DiagramPoint) {
      el('line', {
        x1: p1.x, y1: p1.y, x2: p2.x, y2: p2.y,
        stroke: RENDER_STYLE.accent, 'stroke-width': RENDER_STYLE.highlightWidth, opacity: RENDER_STYLE.highlightOpacity,
      }, g);
    }

    function highlightPath(g: SVGElement, d: string) {
      el('path', {
        d, fill: 'none', stroke: RENDER_STYLE.accent,
        'stroke-width': RENDER_STYLE.curveHighlightWidth, opacity: RENDER_STYLE.highlightOpacity,
      }, g);
    }

    const cubicPath = (curve: DiagramCubicCurve) =>
      `M ${curve.p1.x} ${curve.p1.y} C ${curve.c1.x} ${curve.c1.y}, ${curve.c2.x} ${curve.c2.y}, ${curve.p2.x} ${curve.p2.y}`;

    function elementHandles(g: SVGElement, e: DiagramElement) {
      let handles = UNRESIZABLE_KINDS.includes(e.kind) ? [] : handlePositions(e);
      if (e.kind === 'timesegment') handles = handles.filter(handle => handle.dir === 'e' || handle.dir === 'w');
      if (e.kind === 'submachinestate') {
        const refs = childViews(e.id).filter(child => child.kind === 'connectionpointref');
        handles = handles.filter(handle => !refs.some(ref => {
          const point = center(ref);
          return Math.hypot(handle.x - point.x, handle.y - point.y) < 14;
        }));
      }
      const size = RENDER_STYLE.handleSize;
      handles.forEach(h => {
        el('rect', {
          x: h.x - size / 2, y: h.y - size / 2, width: size, height: size,
          fill: RENDER_STYLE.handleFill, stroke: RENDER_STYLE.accent, 'stroke-width': 1,
          'data-handle': h.dir, 'pointer-events': 'all', cursor: h.cursor,
        }, g);
      });
      if (state.tool === 'select' && e.kind === 'fragment') drawOperandDividers(g, e, true);
    }

    function drawOperandDividers(g: SVGElement, e: DiagramElement, showGrip = false) {
      const { boundaries, minHeight } = fragmentOperandLayout(e);
      boundaries.slice(1, -1).forEach((y, offset) => {
        const index = offset + 1;
        if (boundaries[index + 1] - boundaries[index - 1] <= 2 * minHeight) return;
        el('rect', {
          x: e.x + 8, y: y - 6, width: e.w - 16, height: 12,
          fill: 'transparent', 'pointer-events': 'all',
          'data-operand-divider': index, 'data-fragment-id': e.id, cursor: 'ns-resize',
        }, g);
        if (showGrip) {
          el('rect', {
            x: e.x + e.w / 2 - 9, y: y - 2, width: 18, height: 4, rx: 2,
            fill: RENDER_STYLE.accent,
          }, g);
        }
      });
    }

    function endpointHandle(g: SVGElement, pt: DiagramPoint, which: 'src' | 'dst') {
      /* 넉넉한 투명 히트 영역 (20px) — 시각적 핸들은 9px 유지 */
      const hit = RENDER_STYLE.endpointHitSize;
      const size = RENDER_STYLE.endpointHandleSize;
      el('rect', {
        x: pt.x - hit / 2, y: pt.y - hit / 2, width: hit, height: hit,
        fill: 'transparent', 'data-endpoint': which, 'pointer-events': 'all', cursor: 'crosshair',
      }, g);
      el('rect', {
        x: pt.x - size / 2, y: pt.y - size / 2, width: size, height: size,
        fill: RENDER_STYLE.handleFill, stroke: RENDER_STYLE.accent, 'stroke-width': 1.4,
        'data-endpoint': which, 'pointer-events': 'all', cursor: 'crosshair',
      }, g);
    }

    function routePointHandles(g: SVGElement, r: DiagramRelation) {
      const hit = RENDER_STYLE.routePointHitSize;
      const size = RENDER_STYLE.routePointSize;
      bindingWaypoints(r).forEach((point, index) => {
        el('rect', {
          x: point.x - hit / 2, y: point.y - hit / 2, width: hit, height: hit,
          fill: 'transparent', 'data-route-point': index,
          'pointer-events': 'all', cursor: 'move',
        }, g);
        el('rect', {
          x: point.x - size / 2, y: point.y - size / 2, width: size, height: size,
          fill: RENDER_STYLE.routePointFill, stroke: RENDER_STYLE.accent, 'stroke-width': 1.2,
          'data-route-point': index, 'pointer-events': 'all', cursor: 'move',
        }, g);
      });
    }

    function drawMessageControls(g: SVGElement, relation: DiagramRelation, points: MessagePoints) {
      const center = points.self
        ? { x: points.startX + points.width / 2, y: points.y }
        : { x: (points.p1.x + points.p2.x) / 2, y: (points.p1.y + points.p2.y) / 2 };
      const scale = 1 / state.zoom;
      const controls = [
        { action: 'move', x: center.x, label: uiText('Move message vertically', '메시지 높이 이동'), cursor: 'ns-resize',
          icon: 'M 0 -6 V 6 M -3 -3 L 0 -6 L 3 -3 M -3 3 L 0 6 L 3 3' },
        { action: 'edit', x: center.x + 26 * scale, label: uiText('Edit message name', '메시지 이름 편집'), cursor: 'pointer',
          icon: 'M -6 5 L -5 1 L 3 -7 L 7 -3 L -1 5 Z M 1 -5 L 5 -1' },
      ];
      controls.forEach(({ action, x, label, cursor, icon }) => {
        const button = el('g', {
          transform: `translate(${x} ${center.y}) scale(${scale})`,
          'data-message-action': action, 'data-message-id': relation.id,
          'aria-label': label, role: action === 'edit' ? 'button' : 'img',
          'pointer-events': 'all', cursor,
        }, g);
        el('title', {}, button).textContent = label;
        el('rect', {
          x: -11, y: -11, width: 22, height: 22, rx: 5,
          fill: RENDER_STYLE.handleFill, stroke: RENDER_STYLE.accent,
        }, button);
        el('path', { d: icon, stroke: RENDER_STYLE.accent, fill: 'none', 'stroke-width': 1.4 }, button);
      });
    }

    function drawMessageSelection(g: SVGElement, r: DiagramRelation, showHandles = true) {
      if (isCommMsg(r.kind)) {
        const pts = communicationMessagePoints(r);
        if (!pts) return true;
        if (pts.self) {
          el('rect', {
            x: pts.startX - 4, y: pts.y - 8, width: pts.width + 12, height: pts.height + 14,
            fill: 'none', stroke: RENDER_STYLE.accent, 'stroke-width': 1, 'stroke-dasharray': DASH_SELECT,
          }, g);
        } else {
          highlightLine(g, pts.p1, pts.p2);
        }
        return true;
      }
      if (isMsg(r.kind)) {
        const pts = msgPoints(r);
        if (!pts) return true;
        if (pts.self) {
          const sx = Math.min(pts.startX, pts.endX) - 4;
          el('rect', {
            x: sx, y: (r.y ?? pts.y) - 8, width: pts.width + 12 + Math.abs(pts.endX - pts.startX), height: pts.height + 14,
            fill: 'none', stroke: RENDER_STYLE.accent, 'stroke-width': 1, 'stroke-dasharray': DASH_SELECT,
          }, g);
        } else {
          highlightLine(g, pts.p1, pts.p2);
        }
        if (showHandles && state.tool === 'select') drawMessageControls(g, r, pts);
        return true;
      }
      return false;
    }

    function drawSelection(g: SVGElement) {
      /* multi-selection: dashed outlines only (no resize handles) */
      if (state.selection.length > 1) {
        state.selection.forEach(sid => {
          const se = byId(sid);
          if (se) outlineRect(g, se);
          else {
            const relation = relById(sid);
            if (relation) drawMessageSelection(g, relation, false);
          }
        });
        return;
      }
      const id = state.selectedId;
      if (!id) return;
      const e = byId(id);
      if (e) {
        outlineRect(g, e);
        elementHandles(g, e);
        return;
      }
      const r = relById(id);
      if (!r) return;
      if (drawMessageSelection(g, r)) return;
      if (r.kind === 'mindbranch') {
        const bg = branchGeom(r);
        if (!bg) return;
        highlightPath(g, `M ${bg.p1.x} ${bg.p1.y} Q ${bg.c.x} ${bg.c.y} ${bg.p2.x} ${bg.p2.y}`);
        endpointHandle(g, bg.p1, 'src');
        endpointHandle(g, bg.p2, 'dst');
        return;
      }
      const commSelfCurve = communicationSelfConnectorGeom(r);
      if (commSelfCurve) {
        highlightPath(g, cubicPath(commSelfCurve));
        return;
      }
      const selfCurve = stateSelfTransitionGeom(r);
      if (selfCurve) {
        highlightPath(g, cubicPath(selfCurve));
        endpointHandle(g, selfCurve.p1, 'src');
        endpointHandle(g, selfCurve.p2, 'dst');
        return;
      }
      if (r.kind === 'bindingconnector') {
        const route = bindingRoute(r);
        if (!route || route.points.length < 2) return;
        el('path', {
          d: polylineJumpPath(route.points, route.jumpCrossings, {
            style: r.jumpStyle || 'arc',
            radius: 6,
          }), fill: 'none', stroke: RENDER_STYLE.accent,
          'stroke-width': RENDER_STYLE.curveHighlightWidth, opacity: RENDER_STYLE.highlightOpacity,
          'stroke-linejoin': 'round',
        }, g);
        endpointHandle(g, route.points[0], 'src');
        endpointHandle(g, route.points[route.points.length - 1], 'dst');
        if (r.routeMode === 'manual') routePointHandles(g, r);
        return;
      }
      const ep = relEndpoints(r);
      if (!ep) return;
      highlightLine(g, ep.p1, ep.p2);
      endpointHandle(g, ep.p1, 'src');
      endpointHandle(g, ep.p2, 'dst');
    }

    return Object.freeze({
      activityDrawOrder,
      drawOrder,
      drawSelection,
      handlePositions,
      orderedElements,
      render,
      renderErdMode,
      renderSeqOpts,
      timingDrawOrder,
    });
  }

  return Object.freeze({
    REQUIRED_FUNCTIONS,
    REQUIRED_VALUES,
    RENDER_STYLE,
    create,
  });
}
