interface CanvasSelectionState { selectedId: string | null; selection: string[]; tool: string; zoom: number }
interface CanvasLinking extends DiagramPoint { fromId: string; armed: boolean; message?: { y: number; targetId?: string } }
interface CanvasMarquee { x0: number; y0: number; x1: number; y1: number }
interface CanvasEndpointDrag { mode: 'endpoint'; rel: DiagramRelation; end: 'src' | 'dst'; hoverId?: string | null }
interface CanvasColumnDrag { mode: 'erdcolumn'; entity: DiagramElement; fromIndex: number; targetIndex: number; start: DiagramPoint; moved: boolean }
interface AxisDrag {
  start: DiagramPoint;
  moved: boolean;
  axis?: DiagramMoveAxis;
  previous?: DiagramPoint;
  offset?: DiagramPoint;
}
interface MessageSpacingGuide { before: number; after: number; y: number }
interface CanvasMessageDrag {
  mode: 'msgmove';
  rel: DiagramRelation;
  startY: number;
  originY: number;
  peerRows: readonly number[];
  guide?: MessageSpacingGuide;
  moved: boolean;
}
type CanvasDrag = CanvasEndpointDrag | CanvasColumnDrag
  | CanvasMessageDrag
  | { mode: 'shiftselect'; id: string; start: DiagramPoint; begin(): void }
  | { mode: 'resize'; dir: string; el: DiagramElement; orig: DiagramBounds; start: DiagramPoint; origins: Map<string, DiagramPoint> }
  | (AxisDrag & { mode: 'move'; el: DiagramElement; origins: Map<string, DiagramPoint> })
  | { mode: 'connectionpoint' | 'compositeport' | 'activityattachment'; el: DiagramElement; moved: boolean }
  | { mode: 'operanddivider'; fragment: DiagramElement; index: number; boundaries: number[]; minHeight: number; startY: number; moved: boolean }
  | (AxisDrag & { mode: 'sequencemove'; wholeDiagram: boolean; elements: (DiagramPoint & { view: DiagramElement })[]; messages: { view: DiagramRelation; y: number }[]; minX: number; minY: number })
  | (AxisDrag & { mode: 'groupmove'; els: { e: DiagramElement; ox: number; oy: number }[] })
  | { mode: 'marquee' }
  | (AxisDrag & { mode: 'label'; rel: DiagramRelation; field: string; orig: LabelOffset })
  | { mode: 'routepoint'; rel: DiagramRelation; index: number; moved: boolean }
  | { mode: 'relmove'; rel: DiagramRelation; start: DiagramPoint; origEp: DiagramEndpoints | null; origManualPoints: DiagramPoint[]; moved: boolean };

type CanvasRelationRule = (kind: string, from: DiagramElement | null | undefined, to: DiagramElement | null | undefined, relationId?: string) => string;
interface CanvasInteractionDependencies {
  cancelAnimationFrame(handle: number): void;
  requestAnimationFrame(callback: FrameRequestCallback): number;
  ACTIVITY_PIN_KINDS: ReadonlySet<string>;
  INSTANCE_KINDS: ReadonlySet<string>;
  STATE_VERTEX_KINDS: ReadonlySet<string>;
  KIND_META: Partial<Record<string, unknown>>;
  REL_STYLE: Partial<Record<string, unknown>>;
  elementPlacement: { placeElementForTool(point: DiagramPoint, tool: string, hit?: DiagramElement | null): unknown };
  attachPartToCompositeContainer(view: DiagramElement): void;
  attachToActivityContainer(view: DiagramElement): void;
  attachToContainingRegion(view: DiagramElement): void;
  attachToInternalBlockContainer(view: DiagramElement): void;
  attachToPackageContainer(view: DiagramElement): void;
  attachToParametricContainer(view: DiagramElement): void;
  bindingWaypoints(relation: DiagramRelation): DiagramPoint[];
  borderAnchorFrac(view: DiagramElement, point: DiagramPoint): DiagramAnchor;
  branchGeom(relation: DiagramRelation): DiagramEndpoints | null;
  byId(id?: string | null): DiagramElement | null | undefined;
  closeInlineEditor(): void;
  communicationConnectorAt(point: DiagramPoint): DiagramRelation | null | undefined;
  completeLink(target: DiagramElement, point: DiagramPoint): DiagramRelation | undefined;
  createCommunicationMessage(connector: DiagramRelation, kind: string): void;
  descendantViews(id: string): DiagramElement[];
  dg(): EditorDiagram;
  elementAt(point: DiagramPoint): DiagramElement | null | undefined;
  ensureMemberArray(view: DiagramElement, kind: 'columns'): string[];
  eventRoot: Pick<Window, 'addEventListener' | 'removeEventListener'>;
  flashStatus(message: string): void;
  fragmentOperandLayout(view: DiagramElement): { boundaries: number[]; minHeight: number };
  handleCanvasQuickEdit(event: MouseEvent, point: DiagramPoint): boolean;
  isCommMsg(kind: string): boolean;
  isInteractionMsg(kind: string): boolean;
  isMsg(kind?: string): boolean;
  isPortOwner(view: DiagramElement): boolean;
  lifelineAt(point: DiagramPoint): DiagramElement | null;
  lblOff(relation: DiagramRelation, field: string): LabelOffset;
  markDirty(): void;
  measure(view: DiagramElement): ElementMeasurement;
  memberRowAt(view: DiagramElement, point: DiagramPoint): { kind: string; index: number; arr: readonly unknown[] } | null;
  moveErdColumnTo(view: DiagramElement, from: number, to: number): boolean;
  moveViewTree(view: DiagramElement, dx: number, dy: number, origins: ReadonlyMap<string, DiagramPoint>, grid?: number, axis?: DiagramMoveAxis): void;
  msgPoints(relation: DiagramRelation): MessagePoints | null;
  nearestSequenceMessage(point: DiagramPoint, tolerance: number): DiagramRelation | null;
  openRelationQuickEdit(relation: DiagramRelation): boolean;
  relById(id: string | null): DiagramRelation | null | undefined;
  relEndpoints(relation: DiagramRelation): DiagramEndpoints | null;
  relationAt(point: DiagramPoint): DiagramRelation | null | undefined;
  relationError: CanvasRelationRule;
  relationLabelAt(point: DiagramPoint): QuickEditLabelHit | null;
  render(): void;
  renderProps(): void;
  rootViews(views: DiagramElement[]): DiagramElement[];
  sequenceMessageMinY(diagram: EditorDiagram): number;
  setSelection(ids: string[]): void;
  snap(value: number): number;
  snapshot(): void;
  state: CanvasSelectionState;
  stateSelfTransitionGeom(relation: DiagramRelation): LabeledCubicCurve | null;
  svg: SVGSVGElement;
  syncCommunicationMessages(relation: DiagramRelation): void;
  syncReconnectedRelationModel(relation: DiagramRelation): void;
  transitionDirectionError(from: DiagramElement | null | undefined, to: DiagramElement | null | undefined): string;
}

type CanvasInteractionApi = ReturnType<typeof createCanvasInteractionModule>;
declare var UMLCanvasInteraction: CanvasInteractionApi;
type CanvasInteractionFrame = ReturnType<ReturnType<CanvasInteractionApi['create']>['state']>;

function createCanvasInteractionModule() {
  'use strict';
  const { text: uiText } = globalThis.UMLLanguage
    ?? require('../editor/language.js') as typeof UMLLanguage;


  const MESSAGE_PICK_RADIUS = 8;
  const DRAG_THRESHOLD = 3;
  const SPACING_SNAP_RADIUS = 6;

  function dragOffset(drag: AxisDrag, point: DiagramPoint, shift: boolean) {
    const previous = drag.previous ?? drag.start;
    const dx = point.x - previous.x;
    const dy = point.y - previous.y;
    const offset = drag.offset ?? { x: 0, y: 0 };
    if (!shift) drag.axis = undefined;
    else if (!drag.axis && (dx || dy)) drag.axis = Math.abs(dx) >= Math.abs(dy) ? 'x' : 'y';
    drag.previous = point;
    drag.offset = {
      x: offset.x + (drag.axis === 'y' ? 0 : dx),
      y: offset.y + (drag.axis === 'x' ? 0 : dy),
    };
    return drag.offset;
  }

  function spacingGuide(rows: readonly number[], y: number, tolerance: number): MessageSpacingGuide | undefined {
    const afterIndex = rows.findIndex(row => row > y);
    if (afterIndex <= 0) return;
    const before = rows[afterIndex - 1];
    const after = rows[afterIndex];
    const middle = (before + after) / 2;
    if (Math.abs(y - middle) <= Math.min(tolerance, (after - before) / 4)) {
      return { before, after, y: middle };
    }
  }

  function canvasPoint(event: Pick<MouseEvent, 'clientX' | 'clientY'>, svg: Pick<SVGSVGElement, 'getBoundingClientRect'>, zoom: number) {
    const rect = svg.getBoundingClientRect();
    const scale = Number.isFinite(zoom) && zoom > 0 ? zoom : 1;
    return {
      x: (event.clientX - rect.left) / scale,
      y: (event.clientY - rect.top) / scale,
    };
  }

  function marqueeBounds({ x0, y0, x1, y1 }: CanvasMarquee) {
    return { left: Math.min(x0, x1), top: Math.min(y0, y1), right: Math.max(x0, x1), bottom: Math.max(y0, y1) };
  }

  function marqueeElementIds(marquee: CanvasMarquee, elements: DiagramElement[]) {
    const { left, top, right, bottom } = marqueeBounds(marquee);
    return elements.filter(element => {
      if (element.kind === 'boundary' || element.kind === 'fragment') {
        return element.x >= left && element.y >= top
          && element.x + element.w <= right && element.y + element.h <= bottom;
      }
      return element.x < right && element.x + element.w > left
        && element.y < bottom && element.y + element.h > top;
    }).map(element => element.id);
  }

  const REQUIRED_FUNCTIONS = Object.freeze([
    'cancelAnimationFrame',
    'requestAnimationFrame',
    'attachPartToCompositeContainer',
    'attachToActivityContainer',
    'attachToContainingRegion',
    'attachToInternalBlockContainer',
    'attachToPackageContainer',
    'attachToParametricContainer',
    'bindingWaypoints',
    'borderAnchorFrac',
    'branchGeom',
    'byId',
    'closeInlineEditor',
    'communicationConnectorAt',
    'completeLink',
    'createCommunicationMessage',
    'descendantViews',
    'dg',
    'elementAt',
    'ensureMemberArray',
    'flashStatus',
    'fragmentOperandLayout',
    'handleCanvasQuickEdit',
    'isCommMsg',
    'isInteractionMsg',
    'isMsg',
    'isPortOwner',
    'lifelineAt',
    'lblOff',
    'markDirty',
    'measure',
    'memberRowAt',
    'moveErdColumnTo',
    'moveViewTree',
    'msgPoints',
    'nearestSequenceMessage',
    'openRelationQuickEdit',
    'relById',
    'relEndpoints',
    'relationAt',
    'relationError',
    'relationLabelAt',
    'render',
    'renderProps',
    'rootViews',
    'sequenceMessageMinY',
    'setSelection',
    'snap',
    'snapshot',
    'stateSelfTransitionGeom',
    'syncCommunicationMessages',
    'syncReconnectedRelationModel',
    'transitionDirectionError',
  ] as const);
  const REQUIRED_VALUES = Object.freeze([
    'ACTIVITY_PIN_KINDS',
    'elementPlacement',
    'INSTANCE_KINDS',
    'KIND_META',
    'REL_STYLE',
    'STATE_VERTEX_KINDS',
  ] as const);

  function create(deps: CanvasInteractionDependencies) {
    if (!deps || typeof deps !== 'object') {
      throw new TypeError('Canvas interaction dependencies are required');
    }

    const {
      cancelAnimationFrame,
      requestAnimationFrame,
      ACTIVITY_PIN_KINDS,
      elementPlacement,
      INSTANCE_KINDS,
      KIND_META,
      REL_STYLE,
      STATE_VERTEX_KINDS,
      attachPartToCompositeContainer,
      attachToActivityContainer,
      attachToContainingRegion,
      attachToInternalBlockContainer,
      attachToPackageContainer,
      attachToParametricContainer,
      bindingWaypoints,
      borderAnchorFrac,
      branchGeom,
      byId,
      closeInlineEditor,
      communicationConnectorAt,
      completeLink,
      createCommunicationMessage,
      descendantViews,
      dg,
      elementAt,
      ensureMemberArray,
      eventRoot,
      flashStatus,
      fragmentOperandLayout,
      handleCanvasQuickEdit,
      isCommMsg,
      isInteractionMsg,
      isMsg,
      isPortOwner,
      lifelineAt,
      lblOff,
      markDirty,
      measure,
      memberRowAt,
      moveErdColumnTo,
      moveViewTree,
      msgPoints,
      nearestSequenceMessage,
      openRelationQuickEdit,
      relById,
      relEndpoints,
      relationAt,
      relationError,
      relationLabelAt,
      render,
      renderProps,
      rootViews,
      sequenceMessageMinY,
      setSelection,
      snap,
      snapshot,
      state,
      stateSelfTransitionGeom,
      svg,
      syncCommunicationMessages,
      syncReconnectedRelationModel,
      transitionDirectionError,
    } = deps;

    if (!svg || typeof svg.addEventListener !== 'function') {
      throw new TypeError('A canvas event target is required');
    }
    if (!eventRoot || typeof eventRoot.addEventListener !== 'function') {
      throw new TypeError('A root event target is required');
    }
    if (!state || typeof state !== 'object') {
      throw new TypeError('Canvas interaction state is required');
    }
    const missingValues = REQUIRED_VALUES.filter(name => deps[name] == null);
    if (missingValues.length) {
      throw new TypeError(`Canvas interaction value dependencies are missing: ${missingValues.join(', ')}`);
    }
    if (typeof deps.elementPlacement?.placeElementForTool !== 'function') {
      throw new TypeError('Canvas interaction value dependencies are missing: elementPlacement.placeElementForTool');
    }
    const missingFunctions = REQUIRED_FUNCTIONS.filter(name => typeof deps[name] !== 'function');
    if (missingFunctions.length) {
      throw new TypeError(`Canvas interaction function dependencies are missing: ${missingFunctions.join(', ')}`);
    }

    let drag: CanvasDrag | null = null;
    let linking: CanvasLinking | null = null;
    let marquee: CanvasMarquee | null = null;
    let hoveredMessageId: string | null = null;

    function highlightMessage(id: string | null) {
      if (hoveredMessageId === id) return;
      hoveredMessageId = id;
      scheduleRender();
    }

    function beginSequenceMove(start: DiagramPoint) {
      const diagram = dg();
      if (diagram.type !== 'sequence') return false;
      const selected = new Set(state.selection);
      const selectedElements = diagram.elements.filter(view => selected.has(view.id));
      const sequenceMessages = diagram.relations.filter( (relation): relation is DiagramRelation & { y: number } => isMsg(relation.kind) && Number.isFinite(relation.y));
      const selectedMessages = sequenceMessages.filter(view => selected.has(view.id));
      const wholeDiagram = diagram.elements.length > 0 && selectedElements.length === diagram.elements.length
        && selectedMessages.length === sequenceMessages.length;
      if (!wholeDiagram && (selected.size < 2 || !selectedMessages.length)) return false;

      const elements = selectedElements.filter(view => wholeDiagram || view.kind !== 'lifeline')
        .map(view => ({ view, x: view.x, y: view.y }));
      const messages = selectedMessages.map(view => ({ view, y: view.y }));
      const messageMinY = wholeDiagram ? 0 : sequenceMessageMinY(diagram);
      drag = {
        mode: 'sequencemove', start, moved: false, wholeDiagram, elements, messages,
        minX: Math.max(0, Math.min(...elements.map(({ x }) => x))),
        minY: Math.max(0, Math.min(...elements.map(({ y }) => y), ...messages.map(({ y }) => y - messageMinY))),
      };
      return true;
    }

    function toggleSelection(id: string) {
      const selected = new Set(state.selection.filter(selectedId => byId(selectedId) || isMsg(relById(selectedId)?.kind)));
      if (selected.has(id)) selected.delete(id);
      else selected.add(id);
      setSelection([...selected]);
      render(); renderProps();
    }

    function svgPoint(ev: MouseEvent) {
      return canvasPoint(ev, svg, state.zoom);
    }

    function selectRelation(relation: DiagramRelation) {
      if (state.selectedId === relation.id) return;
      setSelection([relation.id]);
      render(); renderProps();
    }

    function beginElementMove(hitEl: DiagramElement, start: DiagramPoint) {
      if (!state.selection.includes(hitEl.id)) {
        setSelection([hitEl.id]);
        render(); renderProps();
      }
      if (beginSequenceMove(start)) return;
      if (state.selection.length > 1) {
        const roots = rootViews(state.selection.map(byId).filter((view): view is DiagramElement => view != null));
        const moving = [...new Map(roots.flatMap(root => [root, ...descendantViews(root.id)]).map(view => [view.id, view])).values()];
        drag = {
          mode: 'groupmove', start, moved: false,
          els: moving.map(e => ({ e, ox: e.x, oy: e.y })),
        };
      } else {
        if (hitEl.kind === 'region' || hitEl.kind === 'timingstate') { drag = null; return; }
        if (hitEl.kind === 'connectionpointref') {
          drag = { mode: 'connectionpoint', el: hitEl, moved: false };
          return;
        }
        if (hitEl.kind === 'port' || hitEl.kind === 'constraintparameter') {
          drag = { mode: 'compositeport', el: hitEl, moved: false };
          return;
        }
        if (ACTIVITY_PIN_KINDS.has(hitEl.kind)) {
          drag = { mode: 'activityattachment', el: hitEl, moved: false };
          return;
        }
        const tree = [hitEl, ...descendantViews(hitEl.id)];
        drag = {
          mode: 'move', el: hitEl, moved: false,
          start, origins: new Map(tree.map(view => [view.id, { x: view.x, y: view.y }])),
        };
      }
    }

    function beginLabelMove(rel: DiagramRelation, field: string, start: DiagramPoint) {
      drag = { mode: 'label', rel, field, start, orig: { ...lblOff(rel, field) }, moved: false };
    }

    function beginMessageMove(rel: DiagramRelation, start: DiagramPoint) {
      if (rel.y === undefined) return;
      const rows = new Set<number>();
      for (const peer of dg().relations) {
        if (peer.id === rel.id || !isMsg(peer.kind) || peer.y === undefined) continue;
        if ([peer.from, peer.to].includes(rel.from) || [peer.from, peer.to].includes(rel.to)) rows.add(peer.y);
      }
      drag = { mode: 'msgmove', rel, startY: start.y, originY: rel.y, peerRows: [...rows].sort((a, b) => a - b), moved: false };
    }

    function startDrag(id: string, start: DiagramPoint, shift: boolean, begin: () => void) {
      if (shift) drag = { mode: 'shiftselect', id, start, begin };
      else begin();
    }

    function messageNear(point: DiagramPoint, element?: DiagramElement | null) {
      if (state.tool !== 'select' || dg().type !== 'sequence') return null;
      const hit = element === undefined ? elementAt(point) : element;
      if (hit && hit.kind !== 'lifeline') return null;
      return nearestSequenceMessage(point, MESSAGE_PICK_RADIUS / state.zoom);
    }

    function updateLink(link: CanvasLinking, point: DiagramPoint) {
      link.x = point.x;
      link.y = point.y;
      if (isMsg(state.tool)) {
        link.message = {
          y: Math.max(sequenceMessageMinY(dg()), snap(point.y)),
          targetId: lifelineAt(point)?.id,
        };
      }
    }

    function finishLinkAt(target: DiagramElement, point: DiagramPoint, event: MouseEvent) {
      const relation = completeLink(target, point);
      if (relation && isMsg(relation.kind)) {
        event.preventDefault();
        openRelationQuickEdit(relation);
      }
    }

    function handleMouseDown(ev: MouseEvent) {
    if (ev.button !== 0) return;
    closeInlineEditor();
    const p = svgPoint(ev);

    const target = ev.target as Element | null;
    const messageControl = target?.closest?.('[data-message-action]');
    if (state.tool === 'select' && messageControl) {
      const relation = relById(messageControl.getAttribute('data-message-id'));
      if (relation && isMsg(relation.kind)) {
        ev.preventDefault();
        highlightMessage(null);
        if (messageControl.getAttribute('data-message-action') === 'edit' || ev.detail >= 2) openRelationQuickEdit(relation);
        else beginMessageMove(relation, p);
        return;
      }
    }
    highlightMessage(null);
    const divider = target?.getAttribute?.('data-operand-divider');
    if (state.tool === 'select' && divider != null) {
      const fragment = byId(target?.getAttribute('data-fragment-id'));
      const index = Number(divider);
      if (fragment?.kind === 'fragment' && Number.isInteger(index) && index > 0 && index < (fragment.operands?.length ?? 0)) {
        const { boundaries, minHeight } = fragmentOperandLayout(fragment);
        drag = { mode: 'operanddivider', fragment, index, boundaries, minHeight, startY: p.y, moved: false };
        if (state.selectedId !== fragment.id) {
          setSelection([fragment.id]);
          render(); renderProps();
        }
        ev.preventDefault();
        return;
      }
    }

    if (state.tool === 'select' && ev.detail >= 2 && handleCanvasQuickEdit(ev, p)) {
      drag = null;
      ev.preventDefault();
      return;
    }

    const routePointIndex = target?.getAttribute?.('data-route-point');
    if (routePointIndex != null && state.selectedId) {
      const r = relById(state.selectedId);
      const index = Number(routePointIndex);
      if (r?.kind === 'bindingconnector'
        && r.routeMode === 'manual'
        && Number.isInteger(index)
        && bindingWaypoints(r)[index]) {
        drag = { mode: 'routepoint', rel: r, index, moved: false };
        ev.preventDefault();
        return;
      }
    }

    const epDir = target?.getAttribute?.('data-endpoint');
    if ((epDir === 'src' || epDir === 'dst') && state.selectedId) {
      const r = relById(state.selectedId);
      if (r && !isInteractionMsg(r.kind)) {
        snapshot();
        drag = { mode: 'endpoint', rel: r, end: epDir };
        ev.preventDefault();
        return;
      }
    }

    const hDir = target?.getAttribute?.('data-handle');
    if (hDir && state.selectedId) {
      const e = byId(state.selectedId);
      if (e) {
        snapshot();
        const tree = [e, ...descendantViews(e.id)];
        drag = {
          mode: 'resize', dir: hDir, el: e, orig: { x: e.x, y: e.y, w: e.w, h: e.h }, start: p,
          origins: new Map(tree.map(view => [view.id, { x: view.x, y: view.y }])),
        };
        ev.preventDefault();
        return;
      }
    }

    const tool = state.tool;

    if (state.tool === 'select') {
      const selRel = relById(state.selectedId);
      if (selRel && !isInteractionMsg(selRel.kind)) {
        const ep = selRel.kind === 'mindbranch' ? branchGeom(selRel) : (stateSelfTransitionGeom(selRel) || relEndpoints(selRel));
        if (ep) {
          const dSrc = Math.hypot(p.x - ep.p1.x, p.y - ep.p1.y);
          const dDst = Math.hypot(p.x - ep.p2.x, p.y - ep.p2.y);
          if (Math.min(dSrc, dDst) <= 14) {
            snapshot();
            drag = { mode: 'endpoint', rel: selRel, end: dSrc <= dDst ? 'src' : 'dst' };
            ev.preventDefault();
            return;
          }
        }
      }
    }

    const hitEl = elementAt(p);

    if (isCommMsg(tool)) {
      const connector = communicationConnectorAt(p);
      if (!connector) {
        flashStatus(uiText(
          'Click an existing connector to add a communication message.',
          '통신 메시지는 먼저 만든 커넥터 선을 클릭해 추가하세요',
        ));
        return;
      }
      createCommunicationMessage(connector, tool);
      return;
    }

    if (KIND_META[tool] && !REL_STYLE[tool] && tool !== 'select') {
      elementPlacement.placeElementForTool(p, tool, hitEl);
      return;
    }

    if (REL_STYLE[tool]) {
      const endpoint = isMsg(tool) ? lifelineAt(p) : hitEl;
      if (linking && linking.armed && endpoint) {
        const self = endpoint.id === linking.fromId;
        if (!self || tool === 'msg-sync' || tool === 'msg-async' || tool === 'transition' || tool === 'commconnector') {
          finishLinkAt(endpoint, p, ev);
          return;
        }
      }
      if (endpoint) {
        linking = { fromId: endpoint.id, x: p.x, y: p.y, armed: false };
        updateLink(linking, p);
        render();
      }
      return;
    }

    if (tool === 'select' && !ev.shiftKey && hitEl?.kind === 'entity') {
      const row = memberRowAt(hitEl, p);
      if (row?.kind === 'column' && row.index < row.arr.length) {
        if (state.selection.length !== 1 || state.selectedId !== hitEl.id) {
          setSelection([hitEl.id]); render(); renderProps();
        }
        drag = {
          mode: 'erdcolumn', entity: hitEl, fromIndex: row.index, targetIndex: row.index,
          start: p, moved: false,
        };
        ev.preventDefault();
        return;
      }
    }

    const message = messageNear(p, hitEl);
    if (hitEl && !message) {
      startDrag(hitEl.id, p, ev.shiftKey, () => beginElementMove(hitEl, p));
      return;
    }
    const labelHit = relationLabelAt(p);
    const hitRel = labelHit?.r ?? message ?? relationAt(p);
    if (hitRel) {
      if (isMsg(hitRel.kind)) {
        startDrag(hitRel.id, p, ev.shiftKey, () => {
          if (state.selection.includes(hitRel.id) && (!labelHit || !ev.shiftKey) && beginSequenceMove(p)) return;
          selectRelation(hitRel);
          if (labelHit) beginLabelMove(hitRel, labelHit.field, p);
          else beginMessageMove(hitRel, p);
        });
        return;
      }
      selectRelation(hitRel);
      if (labelHit) {
        beginLabelMove(hitRel, labelHit.field, p);
      } else if (isCommMsg(hitRel.kind)) {
        drag = null;
      } else {
        const ep = hitRel.kind === 'mindbranch' ? branchGeom(hitRel) : (stateSelfTransitionGeom(hitRel) || relEndpoints(hitRel));
        const dSrc = ep ? Math.hypot(p.x - ep.p1.x, p.y - ep.p1.y) : Infinity;
        const dDst = ep ? Math.hypot(p.x - ep.p2.x, p.y - ep.p2.y) : Infinity;
        if (Math.min(dSrc, dDst) <= 14) {
          snapshot();
          drag = { mode: 'endpoint', rel: hitRel, end: dSrc <= dDst ? 'src' : 'dst' };
        } else if (!stateSelfTransitionGeom(hitRel)) {
          drag = {
            mode: 'relmove', rel: hitRel, start: p, origEp: relEndpoints(hitRel), moved: false,
            origManualPoints: bindingWaypoints(hitRel),
          };
        }
      }
      return;
    }
    if (state.selection.length) { setSelection([]); renderProps(); }
    marquee = { x0: p.x, y0: p.y, x1: p.x, y1: p.y };
    drag = { mode: 'marquee' };
    render();
    }

    let renderFrame = 0;
    function scheduleRender() {
      if (renderFrame) return;
      renderFrame = requestAnimationFrame(() => {
        renderFrame = 0;
        render();
      });
    }

    function marqueeHits(mq: CanvasMarquee) {
      const diagram = dg();
      const ids = marqueeElementIds(mq, diagram.elements);
      if (diagram.type !== 'sequence') return ids;
      const { left, top, right, bottom } = marqueeBounds(mq);
      if (left === right || top === bottom) return ids;
      const crossesHorizontal = (x1: number, x2: number, y: number) =>
        y >= top && y <= bottom && Math.min(x1, x2) <= right && Math.max(x1, x2) >= left;
      for (const relation of diagram.relations) {
        if (!isMsg(relation.kind)) continue;
        const points = msgPoints(relation);
        if (!points) continue;
        if (points.self) {
          const bendX = points.startX + points.width;
          const endY = points.y + points.height;
          if (crossesHorizontal(points.startX, bendX, points.y)
            || crossesHorizontal(points.endX, bendX, endY)
            || (bendX >= left && bendX <= right && points.y <= bottom && endY >= top)) {
            ids.push(relation.id);
          }
        } else if (crossesHorizontal(points.p1.x, points.p2.x, points.p1.y)) {
          ids.push(relation.id);
        }
      }
      return ids;
    }

    function handleMouseMove(ev: MouseEvent) {
    const p = svgPoint(ev);
    if (linking) { updateLink(linking, p); scheduleRender(); return; }
    if (drag?.mode === 'shiftselect') {
      if (Math.hypot(p.x - drag.start.x, p.y - drag.start.y) * state.zoom < DRAG_THRESHOLD) return;
      const { begin } = drag;
      drag = null;
      begin();
    }
    if (!drag) {
      const onCanvas = svg.firstElementChild && ev.target instanceof Node && svg.contains(ev.target);
      const next = onCanvas ? messageNear(p) : null;
      highlightMessage(next?.id ?? null);
      return;
    }
    if (drag.mode === 'erdcolumn') {
      const dx = p.x - drag.start.x, dy = p.y - drag.start.y;
      if (!drag.moved && Math.hypot(dx, dy) < 4) return;
      const columns = ensureMemberArray(drag.entity, 'columns');
      if (!columns.length) return;
      const metrics = drag.entity._m || measure(drag.entity);
      if (metrics.headH === undefined || metrics.RH === undefined) return;
      const bodyTop = drag.entity.y + metrics.headH;
      drag.moved = true;
      drag.targetIndex = Math.max(0, Math.min(columns.length - 1,
        Math.floor((p.y - bodyTop) / metrics.RH)));
      scheduleRender();
    } else if (drag.mode === 'move') {
      if (!drag.moved && Math.hypot(p.x - drag.start.x, p.y - drag.start.y) * state.zoom < DRAG_THRESHOLD) return;
      const origin = drag.origins.get(drag.el.id);
      if (!origin) return;
      if (!drag.moved) { snapshot(); drag.moved = true; }
      const { x, y } = dragOffset(drag, p, ev.shiftKey);
      const dx = snap(origin.x + x) - origin.x;
      const dy = snap(origin.y + y) - origin.y;
      moveViewTree(drag.el, dx, dy, drag.origins, undefined, drag.axis);
      scheduleRender();
    } else if (drag.mode === 'connectionpoint') {
      const owner = byId(drag.el.parentId);
      if (!owner || owner.kind !== 'submachinestate') return;
      if (!drag.moved) { snapshot(); drag.moved = true; }
      drag.el.borderAnchor = borderAnchorFrac(owner, p);
      scheduleRender();
    } else if (drag.mode === 'compositeport') {
      const owner = byId(drag.el.parentId);
      if (!owner || !isPortOwner(owner)) return;
      if (!drag.moved) { snapshot(); drag.moved = true; }
      drag.el.borderAnchor = borderAnchorFrac(owner, p);
      scheduleRender();
    } else if (drag.mode === 'activityattachment') {
      const owner = byId(drag.el.parentId);
      if (!owner) return;
      if (!drag.moved) { snapshot(); drag.moved = true; }
      drag.el.borderAnchor = borderAnchorFrac(owner, p);
      scheduleRender();
    } else if (drag.mode === 'operanddivider') {
      const { fragment, index, boundaries, minHeight, startY } = drag;
      const previous = boundaries[index];
      const target = previous + p.y - startY;
      const y = Math.min(boundaries[index + 1] - minHeight, Math.max(boundaries[index - 1] + minHeight, target));
      if (!drag.moved && y === previous) return;
      if (!drag.moved) { snapshot(); drag.moved = true; }
      const top = boundaries[0];
      const height = boundaries[boundaries.length - 1] - top;
      fragment.operandDividers = boundaries.slice(1, -1)
        .map((boundary, offset) => ((offset + 1 === index ? y : boundary) - top) / height);
      scheduleRender();
    } else if (drag.mode === 'sequencemove') {
      const offset = dragOffset(drag, p, ev.shiftKey && drag.wholeDiagram);
      const dx = drag.wholeDiagram ? Math.max(-drag.minX, snap(offset.x)) : 0;
      const dy = Math.max(-drag.minY, snap(offset.y));
      if (!drag.moved && !dx && !dy) return;
      if (!drag.moved) { snapshot(); drag.moved = true; }
      drag.elements.forEach(({ view, x, y }) => {
        view.x = x + dx;
        view.y = y + dy;
      });
      drag.messages.forEach(({ view, y }) => { view.y = y + dy; });
      scheduleRender();
    } else if (drag.mode === 'groupmove') {
      if (!drag.moved) { snapshot(); drag.moved = true; }
      const { x, y } = dragOffset(drag, p, ev.shiftKey);
      const { axis } = drag;
      drag.els.forEach(({ e, ox, oy }) => {
        if (axis !== 'y') e.x = snap(ox + x);
        if (axis !== 'x' && !(dg().type === 'sequence' && e.kind === 'lifeline')) e.y = snap(oy + y);
      });
      scheduleRender();
    } else if (drag.mode === 'marquee' && marquee) {
      marquee.x1 = p.x; marquee.y1 = p.y;
      setSelection(marqueeHits(marquee));
      scheduleRender();
    } else if (drag.mode === 'msgmove') {
      const offset = p.y - drag.startY;
      if (!drag.moved && Math.abs(offset) * state.zoom < DRAG_THRESHOLD) return;
      const minimum = sequenceMessageMinY(dg());
      const targetY = Math.max(minimum, drag.originY + offset);
      drag.guide = spacingGuide(drag.peerRows, targetY, SPACING_SNAP_RADIUS / state.zoom);
      const y = drag.guide?.y ?? Math.max(minimum, snap(targetY));
      if (!drag.moved && y === drag.originY) { scheduleRender(); return; }
      if (!drag.moved) { snapshot(); drag.moved = true; }
      drag.rel.y = y;
      scheduleRender();
    } else if (drag.mode === 'label') {
      if (!drag.moved && Math.hypot(p.x - drag.start.x, p.y - drag.start.y) * state.zoom < DRAG_THRESHOLD) return;
      if (!drag.moved) { snapshot(); drag.moved = true; }
      const { x, y } = dragOffset(drag, p, ev.shiftKey);
      const r = drag.rel;
      r.lblOff = r.lblOff || {};
      r.lblOff[drag.field] = { dx: drag.orig.dx + x, dy: drag.orig.dy + y };
      scheduleRender();
    } else if (drag.mode === 'routepoint') {
      const waypoints = bindingWaypoints(drag.rel);
      if (waypoints[drag.index]) {
        if (!drag.moved) { snapshot(); drag.moved = true; }
        waypoints[drag.index] = { x: snap(p.x), y: snap(p.y) };
        drag.rel.manualPoints = waypoints;
        scheduleRender();
      }
    } else if (drag.mode === 'relmove' && drag.origEp) {
      if (!drag.moved) { snapshot(); drag.moved = true; }
      const r = drag.rel;
      const dx = p.x - drag.start.x, dy = p.y - drag.start.y;
      const clamp01 = (v: number) => Math.max(0, Math.min(1, v));
      const apply = (id: string, anchorKey: 'srcAnchor' | 'dstAnchor', pt: DiagramPoint) => {
        const host = byId(id);
        if (!host) return;
        const side = borderAnchorFrac(host, pt);
        const tx = pt.x + dx, ty = pt.y + dy;
        const onHorizontalEdge = side.fy === 0 || side.fy === 1;
        r[anchorKey] = onHorizontalEdge
          ? { fx: clamp01((tx - host.x) / host.w), fy: side.fy }
          : { fx: side.fx, fy: clamp01((ty - host.y) / host.h) };
      };
      apply(r.from, 'srcAnchor', drag.origEp.p1);
      apply(r.to, 'dstAnchor', drag.origEp.p2);
      if (r.kind === 'bindingconnector' && r.routeMode === 'manual') {
        r.manualPoints = drag.origManualPoints
          .map(point => ({ x: snap(point.x + dx), y: snap(point.y + dy) }));
      }
      scheduleRender();
    } else if (drag.mode === 'endpoint') {
      const r = drag.rel;
      const curId = drag.end === 'src' ? r.from : r.to;
      const otherId = drag.end === 'src' ? r.to : r.from;
      const host = byId(curId);
      if (host) {
        const t = elementAt(p);
        drag.hoverId = (t && t.id !== curId && t.id !== otherId) ? t.id : null;
        if (!drag.hoverId) {
          r[drag.end === 'src' ? 'srcAnchor' : 'dstAnchor'] = borderAnchorFrac(host, p);
        }
        scheduleRender();
      }
    } else if (drag.mode === 'resize') {
      const { dir, el: e, orig, start, origins } = drag;
      const dx = p.x - start.x, dy = p.y - start.y;
      const m = e._m || measure(e);
      let { x, y, w, h } = orig;
      if (dir.includes('e')) w = orig.w + dx;
      if (dir.includes('s')) h = orig.h + dy;
      if (dir.includes('w')) { w = orig.w - dx; x = orig.x + dx; }
      if (dir.includes('n')) { h = orig.h - dy; y = orig.y + dy; }
      w = Math.max(snap(w), m.minW); h = Math.max(snap(h), m.minH);
      if (dir.includes('w')) x = orig.x + orig.w - w;
      if (dir.includes('n')) y = orig.y + orig.h - h;
      e.x = snap(x); e.y = dg().type === 'sequence' && e.kind === 'lifeline' ? orig.y : snap(y); e.w = w; e.h = h;
      const tx = e.x - orig.x, ty = e.y - orig.y;
      descendantViews(e.id).forEach(child => {
        const origin = origins.get(child.id);
        if (origin) { child.x = snap(origin.x + tx); child.y = snap(origin.y + ty); }
      });
      scheduleRender();
    }
    }

    function handleMouseUp(ev: MouseEvent) {
    if (linking) {
      const p = svgPoint(ev);
      const target = isMsg(state.tool) ? lifelineAt(p) : elementAt(p);
      if (target && target.id !== linking.fromId) finishLinkAt(target, p, ev);
      else if (target) { linking.armed = true; }
      else { linking = null; render(); }
      return;
    }
    if (drag?.mode === 'shiftselect') {
      const { id } = drag;
      drag = null;
      toggleSelection(id);
      return;
    }
    if (drag && drag.mode === 'marquee') {
      marquee = null;
      drag = null;
      render(); renderProps();
      return;
    }
    if (drag?.mode === 'sequencemove' || drag?.mode === 'operanddivider'
      || drag?.mode === 'msgmove' || drag?.mode === 'label' || drag?.mode === 'groupmove') {
      const moved = drag.moved;
      const hasGuide = drag.mode === 'msgmove' && drag.guide;
      drag = null;
      if (moved) {
        markDirty();
        render(); renderProps();
      } else if (hasGuide) scheduleRender();
      return;
    }
    if (drag && drag.mode === 'erdcolumn') {
      const { entity, fromIndex, targetIndex, moved } = drag;
      drag = null;
      if (moved && fromIndex !== targetIndex) moveErdColumnTo(entity, fromIndex, targetIndex);
      else render();
      return;
    }
    if (drag && drag.mode === 'routepoint') {
      const moved = drag.moved;
      drag = null;
      if (moved) { render(); renderProps(); }
      return;
    }
    if (drag && drag.mode === 'endpoint') {
      const p = svgPoint(ev);
      const r = drag.rel;
      const curId = drag.end === 'src' ? r.from : r.to;
      const otherId = drag.end === 'src' ? r.to : r.from;
      const target = elementAt(p);
      if (target && target.id !== curId && target.id !== otherId) {
        if (r.kind === 'transition' && !STATE_VERTEX_KINDS.has(target.kind)) {
          flashStatus(uiText('Reconnect transitions to a state or pseudostate.', '전이는 상태 또는 의사 상태에만 재연결할 수 있습니다'));
        } else if ((r.kind === 'link' || r.kind === 'directedlink') && !INSTANCE_KINDS.has(target.kind)) {
          flashStatus(uiText('Reconnect links between objects or instances.', 'Link는 Object 또는 Instance 사이에만 재연결할 수 있습니다'));
        } else if (r.kind === 'commconnector' && target.kind !== 'lifeline') {
          flashStatus(uiText('Reconnect communication connectors between lifelines.', '통신 커넥터는 라이프라인 사이에만 재연결할 수 있습니다'));
        } else if (r.kind === 'timingmessage' && target.kind !== 'timesegment') {
          flashStatus(uiText('Reconnect timing messages between time segments.', '타이밍 메시지는 시간 구간 사이에만 재연결할 수 있습니다'));
        } else {
          const nextFrom = drag.end === 'src' ? target : byId(r.from);
          const nextTo = drag.end === 'dst' ? target : byId(r.to);
          const directionError = r.kind === 'transition' ? transitionDirectionError(nextFrom, nextTo) : '';
          const error = directionError || relationError(r.kind, nextFrom, nextTo, r.id);
          if (error) {
            flashStatus(error);
          } else {
            const previousFrom = byId(r.from), previousTo = byId(r.to);
            if (drag.end === 'src') r.from = target.id; else r.to = target.id;
            delete r[drag.end === 'src' ? 'srcAnchor' : 'dstAnchor'];
            if (r.kind === 'containment' && nextFrom && nextTo) {
              if (previousFrom && previousFrom.parentId === previousTo?.id) delete previousFrom.parentId;
              nextFrom.parentId = nextTo.id;
            }
            syncReconnectedRelationModel(r);
            syncCommunicationMessages(r);
          }
        }
      }
      drag = null;
      render(); renderProps();
      return;
    }
    if (drag && drag.mode === 'move') {
      if (drag.moved) {
        attachToContainingRegion(drag.el);
        attachPartToCompositeContainer(drag.el);
        attachToInternalBlockContainer(drag.el);
        attachToParametricContainer(drag.el);
        attachToActivityContainer(drag.el);
        attachToPackageContainer(drag.el);
        markDirty();
      }
      drag = null;
      render(); renderProps();
      return;
    }
    if (drag && (drag.mode === 'connectionpoint' || drag.mode === 'compositeport' || drag.mode === 'activityattachment')) {
      drag = null;
      render(); renderProps();
      return;
    }
    drag = null;
    }

    let attached = false;

    function attach() {
      if (attached) return;
      svg.addEventListener('mousedown', handleMouseDown);
      eventRoot.addEventListener('mousemove', handleMouseMove);
      eventRoot.addEventListener('mouseup', handleMouseUp);
      attached = true;
    }

    function detach() {
      if (!attached) return;
      svg.removeEventListener('mousedown', handleMouseDown);
      eventRoot.removeEventListener('mousemove', handleMouseMove);
      eventRoot.removeEventListener('mouseup', handleMouseUp);
      if (renderFrame) { cancelAnimationFrame(renderFrame); renderFrame = 0; }
      attached = false;
    }

    return Object.freeze({
      attach,
      detach,
      state: () => ({ drag, linking, marquee, hoveredMessageId }),
      getLinking: () => linking,
      setLinking(value: CanvasLinking | null) { linking = value; },
      cancel() {
        drag = null;
        linking = null;
        marquee = null;
        hoveredMessageId = null;
      },
    });
  }

  return Object.freeze({
    REQUIRED_FUNCTIONS,
    REQUIRED_VALUES,
    canvasPoint,
    marqueeElementIds,
    create,
  });
}

(function initCanvasInteraction(global: typeof globalThis, factory: () => CanvasInteractionApi) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  global.UMLCanvasInteraction = api;
})(typeof window !== 'undefined' ? window : globalThis, createCanvasInteractionModule);
