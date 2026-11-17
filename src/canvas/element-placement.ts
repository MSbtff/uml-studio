'use strict';

/* Element placement — the "active tool is an element kind, so put one where the
   user clicked" half of the canvas mousedown handler. Every branch creates one
   view, attaches it to whatever container it landed in, selects it and drops
   back to the select tool; none of it touches the drag or linking state, which
   is why it can live outside the interaction state machine. */
(function initElementPlacement<Api>(root: typeof globalThis & { UMLElementPlacement?: Api }, factory: () => Api) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root) root.UMLElementPlacement = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function createElementPlacementModule() {
  const REQUIRED_FUNCTIONS = Object.freeze([
    'activityAttachmentOwnerAtPoint',
    'adoptView',
    'attachPartToCompositeContainer',
    'attachToActivityContainer',
    'attachToContainingRegion',
    'attachToInternalBlockContainer',
    'attachToParametricContainer',
    'borderAnchorFrac',
    'childViews',
    'compositeAtPoint',
    'compositeContainerAtPoint',
    'compositePortOwnerAtPoint',
    'createElement',
    'dg',
    'flashStatus',
    'ibdContainerAtPoint',
    'lifelineAt',
    'normalizeSize',
    'packageContainerAtPoint',
    'parametricContainerAtPoint',
    'relationAt',
    'renderAll',
    'setSelection',
    'snap',
    'snapshot',
    'timingLifelineAtPoint',
    'timingStateAtPoint',
    'uid',
  ] as const);
  const REQUIRED_VALUES = Object.freeze([
    'state',
    'ACTIVITY_PIN_KINDS',
    'FILL_DEFAULT',
    'IBD_TYPED_KINDS',
    'KIND_META',
    'PACKAGE_CONTAINER_KINDS',
    'STATE_VERTEX_KINDS',
  ] as const);

  interface PlaceableElement extends DiagramElementBounds {
    name?: string;
    lifeId?: string;
    interactionDiagramId?: string;
    constrainedViewId?: string;
    anchorRatio?: number;
    borderAnchor?: DiagramAnchor;
    fill?: string;
    stateOrder?: number;
    regionOrder?: number;
  }
  interface PlacementDiagram {
    id: string;
    type: string;
    name: string;
    elements: PlaceableElement[];
    relations: DiagramLink[];
  }
  type ElementAtPoint = (point: DiagramPoint) => PlaceableElement | null | undefined;
  type AttachElement = (element: PlaceableElement) => void;
  interface PlacementDependencies {
    activityAttachmentOwnerAtPoint(kind: string, point: DiagramPoint): ReturnType<ElementAtPoint>;
    adoptView(view: PlaceableElement): PlaceableElement;
    attachPartToCompositeContainer: AttachElement;
    attachToActivityContainer: AttachElement;
    attachToContainingRegion: AttachElement;
    attachToInternalBlockContainer: AttachElement;
    attachToParametricContainer: AttachElement;
    borderAnchorFrac(host: DiagramElementBounds, point: DiagramPoint): DiagramAnchor;
    childViews(parentId: string): PlaceableElement[];
    compositeAtPoint: ElementAtPoint;
    compositeContainerAtPoint: ElementAtPoint;
    compositePortOwnerAtPoint: ElementAtPoint;
    createElement(kind: string, x: number, y: number): PlaceableElement;
    dg(): PlacementDiagram;
    flashStatus(message: string): void;
    ibdContainerAtPoint: ElementAtPoint;
    lifelineAt: ElementAtPoint;
    normalizeSize: AttachElement;
    packageContainerAtPoint(point: DiagramPoint, excludedIds: Set<string>): ReturnType<ElementAtPoint>;
    parametricContainerAtPoint: ElementAtPoint;
    relationAt(point: DiagramPoint): DiagramLink | null | undefined;
    renderAll(): void;
    setSelection(ids: string[]): void;
    snap(value: number): number;
    snapshot(): void;
    timingLifelineAtPoint: ElementAtPoint;
    timingStateAtPoint: ElementAtPoint;
    uid(): string;
    state: { diagrams: PlacementDiagram[]; activeId: string; tool: string };
    ACTIVITY_PIN_KINDS: ReadonlySet<string>;
    FILL_DEFAULT: string;
    IBD_TYPED_KINDS: ReadonlySet<string>;
    KIND_META: Record<string, { label: string }>;
    PACKAGE_CONTAINER_KINDS: ReadonlySet<string>;
    STATE_VERTEX_KINDS: ReadonlySet<string>;
  }

  function create(dependencies?: PlacementDependencies) {
    const deps: Partial<PlacementDependencies> = dependencies || {};
    const missing: string[] = REQUIRED_FUNCTIONS.filter(name => typeof deps[name] !== 'function');
    REQUIRED_VALUES.forEach(name => {
      if (deps[name] == null) missing.push(name);
    });
    if (missing.length) {
      throw new TypeError(`요소 배치 의존성이 없습니다: ${[...new Set(missing)].join(', ')}`);
    }

    const {
      activityAttachmentOwnerAtPoint,
      adoptView,
      attachPartToCompositeContainer,
      attachToActivityContainer,
      attachToContainingRegion,
      attachToInternalBlockContainer,
      attachToParametricContainer,
      borderAnchorFrac,
      childViews,
      compositeAtPoint,
      compositeContainerAtPoint,
      compositePortOwnerAtPoint,
      createElement,
      dg,
      flashStatus,
      ibdContainerAtPoint,
      lifelineAt,
      normalizeSize,
      packageContainerAtPoint,
      parametricContainerAtPoint,
      relationAt,
      renderAll,
      setSelection,
      snap,
      snapshot,
      timingLifelineAtPoint,
      timingStateAtPoint,
      uid,
      state,
      ACTIVITY_PIN_KINDS,
      FILL_DEFAULT,
      IBD_TYPED_KINDS,
      KIND_META,
      PACKAGE_CONTAINER_KINDS,
      STATE_VERTEX_KINDS,
    } = deps as PlacementDependencies;

    /* the caller has already decided the tool places an element */
    function placeElementForTool(p: DiagramPoint, tool: string, hitEl?: PlaceableElement | null) {
      if (tool === 'interactioninline') {
        snapshot();
        const current = dg();
        const sequenceNumber = state.diagrams.filter(diagram => diagram.type === 'sequence').length + 1;
        const sequence = {
          id: uid(), type: 'sequence', name: `Inline Sequence ${sequenceNumber}`,
          elements: [], relations: [],
        };
        state.diagrams.push(sequence);
        const inline = adoptView(createElement('interactioninline', snap(p.x), snap(p.y)));
        inline.interactionDiagramId = sequence.id;
        inline.name = sequence.name;
        current.elements.push(inline);
        state.activeId = current.id;
        setSelection([inline.id]);
        state.tool = 'select';
        renderAll();
        flashStatus('인라인 Sequence Diagram을 만들었습니다 · 프레임을 더블클릭해 편집하세요');
        return;
      }
      if (tool === 'execution') {
        /* an Execution box must sit on a lifeline — snap to the one under the cursor */
        const life = lifelineAt(p);
        if (!life) { flashStatus('Execution 박스는 라이프라인(점선) 위에서 클릭해 만드세요'); return; }
        snapshot();
        const e = adoptView({ id: uid(), kind: 'execution', lifeId: life.id, x: life.x + life.w / 2 - 6, y: snap(Math.max(life.y + life.h + 8, p.y)), w: 12, h: 56, fill: FILL_DEFAULT });
        dg().elements.push(e);
        setSelection([e.id]);
        state.tool = 'select';
        renderAll();
        return;
      }
      if (tool === 'connectionpointref') {
        const owner = hitEl && hitEl.kind === 'submachinestate' ? hitEl : null;
        if (!owner) {
          flashStatus('Connection Point Reference는 Submachine State의 테두리를 클릭해 추가하세요');
          return;
        }
        snapshot();
        const ref = adoptView(createElement('connectionpointref', p.x - 10, p.y - 10));
        ref.parentId = owner.id;
        ref.borderAnchor = borderAnchorFrac(owner, p);
        dg().elements.push(ref);
        setSelection([ref.id]);
        state.tool = 'select';
        renderAll();
        return;
      }
      if (dg().type === 'ibd' && IBD_TYPED_KINDS.has(tool)) {
        const owner = ibdContainerAtPoint(p);
        if (!owner) {
          flashStatus(`${KIND_META[tool].label}는 IBD Frame 또는 Part/Reference 내부를 클릭해 추가하세요`);
          return;
        }
        snapshot();
        const child = adoptView(createElement(tool, snap(p.x - 88), snap(p.y - 32)));
        child.parentId = owner.id;
        normalizeSize(child);
        dg().elements.push(child);
        attachToInternalBlockContainer(child);
        setSelection([child.id]);
        state.tool = 'select';
        renderAll();
        return;
      }
      if (dg().type === 'parametric' && ['constraintproperty', 'value'].includes(tool)) {
        const owner = parametricContainerAtPoint(p);
        if (!owner || owner.kind !== 'parametricframe') {
          flashStatus(`${KIND_META[tool].label}는 Parametric Frame 내부를 클릭해 추가하세요`);
          return;
        }
        snapshot();
        const child = adoptView(createElement(tool, snap(p.x - 104), snap(p.y - 40)));
        child.parentId = owner.id;
        normalizeSize(child);
        dg().elements.push(child);
        attachToParametricContainer(child);
        setSelection([child.id]);
        state.tool = 'select';
        renderAll();
        return;
      }
      if (tool === 'constraintparameter') {
        const owner = parametricContainerAtPoint(p);
        if (!owner) {
          flashStatus('Constraint Parameter는 Parametric Frame 또는 Constraint Property의 테두리를 클릭해 추가하세요');
          return;
        }
        snapshot();
        const parameter = adoptView(createElement('constraintparameter', p.x - 9, p.y - 9));
        parameter.parentId = owner.id;
        parameter.borderAnchor = borderAnchorFrac(owner, p);
        dg().elements.push(parameter);
        setSelection([parameter.id]);
        state.tool = 'select';
        renderAll();
        return;
      }
      if (tool === 'part' || tool === 'collaborationuse') {
        const owner = compositeContainerAtPoint(p);
        if (!owner) {
          flashStatus(`${KIND_META[tool].label}는 Class 또는 Collaboration 내부를 클릭해 추가하세요`);
          return;
        }
        snapshot();
        const child = adoptView(createElement(tool, snap(p.x - (tool === 'part' ? 76 : 88)), snap(p.y - 32)));
        child.parentId = owner.id;
        normalizeSize(child);
        dg().elements.push(child);
        attachPartToCompositeContainer(child);
        setSelection([child.id]);
        state.tool = 'select';
        renderAll();
        return;
      }
      if (tool === 'port') {
        const owner = compositePortOwnerAtPoint(p);
        if (!owner) {
          flashStatus(dg().type === 'bdd'
            ? 'Port는 Block, Interface Block 또는 Constraint Block의 테두리를 클릭해 추가하세요'
            : dg().type === 'ibd'
              ? 'Port는 IBD Frame, Part 또는 Reference의 테두리를 클릭해 추가하세요'
              : 'Port는 Class, Collaboration 또는 Part의 테두리를 클릭해 추가하세요');
          return;
        }
        snapshot();
        const port = adoptView(createElement('port', p.x - 9, p.y - 9));
        port.parentId = owner.id;
        port.borderAnchor = borderAnchorFrac(owner, p);
        dg().elements.push(port);
        setSelection([port.id]);
        state.tool = 'select';
        renderAll();
        return;
      }
      if (ACTIVITY_PIN_KINDS.has(tool)) {
        const owner = activityAttachmentOwnerAtPoint(tool, p);
        if (!owner) {
          const expected = tool === 'expansioninput' || tool === 'expansionoutput'
            ? 'Expansion Region'
            : 'Action 또는 Signal/Time Event Action';
          flashStatus(`${KIND_META[tool].label}는 ${expected}의 테두리를 클릭해 추가하세요`);
          return;
        }
        snapshot();
        const pin = adoptView(createElement(tool, p.x - 8, p.y - 8));
        pin.parentId = owner.id;
        pin.borderAnchor = borderAnchorFrac(owner, p);
        dg().elements.push(pin);
        setSelection([pin.id]);
        state.tool = 'select';
        renderAll();
        return;
      }
      if (tool === 'timingstate') {
        const owner = timingLifelineAtPoint(p);
        if (!owner) {
          flashStatus('State / Condition은 Timing Lifeline 내부를 클릭해 추가하세요');
          return;
        }
        snapshot();
        const stateView = adoptView(createElement('timingstate', owner.x, owner.y));
        stateView.parentId = owner.id;
        stateView.stateOrder = childViews(owner.id).filter(child => child.kind === 'timingstate').length;
        dg().elements.push(stateView);
        setSelection([stateView.id]);
        state.tool = 'select';
        renderAll();
        return;
      }
      if (tool === 'timesegment') {
        const owner = timingStateAtPoint(p);
        if (!owner) {
          flashStatus('Time Segment는 State / Condition 행을 클릭해 추가하세요');
          return;
        }
        snapshot();
        const segment = adoptView(createElement('timesegment', snap(p.x - 64), owner.y));
        segment.parentId = owner.id;
        dg().elements.push(segment);
        setSelection([segment.id]);
        state.tool = 'select';
        renderAll();
        return;
      }
      if (tool === 'timeconstraint') {
        const hitTimingRelation = relationAt(p);
        const segment = hitEl?.kind === 'timesegment' ? hitEl : null;
        const target = segment || (hitTimingRelation?.kind === 'timingmessage' ? hitTimingRelation : null);
        if (!target) {
          flashStatus('Time Constraint는 Time Segment 또는 Message 위를 클릭해 추가하세요');
          return;
        }
        snapshot();
        const constraintView = adoptView(createElement('timeconstraint', snap(p.x - 56), snap(p.y - 40)));
        constraintView.constrainedViewId = target.id;
        constraintView.anchorRatio = segment
          ? Math.max(0, Math.min(1, (p.x - segment.x) / Math.max(1, segment.w)))
          : 0.5;
        dg().elements.push(constraintView);
        setSelection([constraintView.id]);
        state.tool = 'select';
        renderAll();
        return;
      }
      if (tool === 'region') {
        const owner = compositeAtPoint(p);
        if (!owner || owner.kind !== 'compositestate') {
          flashStatus('Region은 Composite State 내부에서 클릭해 추가하세요');
          return;
        }
        snapshot();
        const count = childViews(owner.id).filter(x => x.kind === 'region').length;
        const region = adoptView(createElement('region', owner.x, owner.y));
        region.parentId = owner.id;
        region.regionOrder = count;
        dg().elements.push(region);
        setSelection([region.id]);
        state.tool = 'select';
        renderAll();
        return;
      }
      snapshot();
      const e = adoptView(createElement(tool, snap(p.x), snap(p.y)));
      dg().elements.push(e);
      if (dg().type === 'state' && STATE_VERTEX_KINDS.has(e.kind)) attachToContainingRegion(e);
      if (dg().type === 'activity') attachToActivityContainer(e);
      if (dg().type === 'package' && PACKAGE_CONTAINER_KINDS.has(e.kind)) {
        const owner = packageContainerAtPoint(p, new Set([e.id]));
        if (owner) e.parentId = owner.id;
      }
      if (tool === 'compositestate') {
        const region = adoptView(createElement('region', e.x, e.y));
        region.parentId = e.id;
        region.regionOrder = 0;
        dg().elements.push(region);
      }
      setSelection([e.id]);
      state.tool = 'select';
      renderAll();
      return;
    }

    return Object.freeze({ placeElementForTool });
  }

  return Object.freeze({ REQUIRED_FUNCTIONS, REQUIRED_VALUES, create });
});
