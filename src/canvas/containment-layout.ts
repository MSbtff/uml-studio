'use strict';

type ContainmentLayoutApi = ReturnType<typeof createContainmentLayoutModule>;
declare var UMLContainmentLayout: ContainmentLayoutApi;

(function initContainmentLayoutModule(root: typeof globalThis & { UMLContainmentLayout?: ContainmentLayoutApi }, factory: () => ContainmentLayoutApi) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root) root.UMLContainmentLayout = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, createContainmentLayoutModule);

function createContainmentLayoutModule() {
  const REQUIRED_FUNCTIONS = Object.freeze([
    'anchorPoint',
    'byId',
    'center',
    'dg',
    'pointInside',
    'relEndpoints',
    'snap',
    'syncRelationModel',
  ] as const);
  const REQUIRED_VALUES = Object.freeze([
    'ACTIVITY_ACTION_KINDS',
    'ACTIVITY_CONTAINER_KINDS',
    'ACTIVITY_PIN_KINDS',
    'ACTIVITY_VERTEX_KINDS',
    'COMPOSITE_CONTAINER_KINDS',
    'IBD_CONTAINER_KINDS',
    'IBD_TYPED_KINDS',
    'PACKAGE_CONTAINER_KINDS',
    'PARAMETRIC_CONTAINER_KINDS',
    'STATE_VERTEX_KINDS',
    'TIMING_LABEL_WIDTH',
    'TIMING_ROW_HEIGHT',
  ] as const);
  const KIND_SETS = Object.freeze(REQUIRED_VALUES.filter((name): name is KindSet => name.endsWith('_KINDS')));

  type KindSet = Extract<typeof REQUIRED_VALUES[number], `${string}_KINDS`>;

  type ContainmentDependencies = Record<KindSet, ReadonlySet<string>> & {
    anchorPoint: (view: DiagramBounds, anchor: DiagramAnchor) => DiagramPoint;
    byId: (id?: string | null) => DiagramElement | undefined | null;
    center: (view: DiagramBounds) => DiagramPoint;
    dg: () => EditorDiagram;
    pointInside: (view: DiagramBounds, point: DiagramPoint, margin?: number) => boolean;
    relEndpoints: (relation: DiagramRelation) => DiagramEndpoints | null;
    snap: (value: number, grid?: number) => number;
    syncRelationModel: (relation: DiagramRelation) => void;
    TIMING_LABEL_WIDTH: number;
    TIMING_ROW_HEIGHT: number;
  };

  function create(dependencies?: ContainmentDependencies) {
    const deps: Partial<ContainmentDependencies> = dependencies || {};
    const missing: string[] = REQUIRED_FUNCTIONS.filter(name => typeof deps[name] !== 'function');
    REQUIRED_VALUES.forEach(name => {
      if (deps[name] == null) missing.push(name);
    });
    KIND_SETS.forEach(name => {
      const value = deps[name];
      if (value != null && typeof value.has !== 'function') missing.push(`${name}.has`);
    });
    if (missing.length) {
      throw new TypeError(`Containment Layout 의존성이 없습니다: ${[...new Set(missing)].join(', ')}`);
    }

    const {
      anchorPoint,
      byId,
      center,
      dg,
      pointInside,
      relEndpoints,
      snap,
      syncRelationModel,
      ACTIVITY_ACTION_KINDS,
      ACTIVITY_CONTAINER_KINDS,
      ACTIVITY_PIN_KINDS,
      ACTIVITY_VERTEX_KINDS,
      COMPOSITE_CONTAINER_KINDS,
      IBD_CONTAINER_KINDS,
      IBD_TYPED_KINDS,
      PACKAGE_CONTAINER_KINDS,
      PARAMETRIC_CONTAINER_KINDS,
      STATE_VERTEX_KINDS,
      TIMING_LABEL_WIDTH,
      TIMING_ROW_HEIGHT,
    } = deps as ContainmentDependencies;

    function childViews(parentId: string, diagram = dg()) {
      return diagram.elements.filter(e => e.parentId === parentId);
    }

    function descendantViews(parentId: string, diagram = dg()) {
      const out: DiagramElement[] = [];
      const visit = (id: string): void => childViews(id, diagram).forEach(child => { out.push(child); visit(child.id); });
      visit(parentId);
      return out;
    }

    function containmentDepth(view: DiagramElement, diagram: EditorDiagram) {
      let depth = 0;
      let current: DiagramElement | undefined = view;
      const seen = new Set([view.id]);
      while (current.parentId) {
        current = diagram.elements.find(e => e.id === current?.parentId);
        if (!current || seen.has(current.id)) break;
        seen.add(current.id); depth++;
      }
      return depth;
    }

    function containmentOrder(diagram: EditorDiagram) {
      const out: DiagramElement[] = [];
      const seen = new Set<string>();
      const visit = (view: DiagramElement) => {
        if (!view || seen.has(view.id)) return;
        seen.add(view.id); out.push(view);
        diagram.elements.filter(child => child.parentId === view.id).forEach(visit);
      };
      diagram.elements.filter(view => !view.parentId || !diagram.elements.some(x => x.id === view.parentId)).forEach(visit);
      diagram.elements.forEach(visit);
      return out;
    }

    function rootViews(views: DiagramElement[], diagram = dg()) {
      const selected = new Set(views.map(e => e.id));
      return views.filter(view => {
        let parent = diagram.elements.find(e => e.id === view.parentId);
        while (parent) {
          if (selected.has(parent.id)) return false;
          parent = diagram.elements.find(e => e.id === parent?.parentId);
        }
        return true;
      });
    }

    const regionLayoutCache = new WeakMap<DiagramElement, DiagramBounds>();

    function regionAtPoint(p: DiagramPoint, excludeIds = new Set<string>()) {
      return dg().elements
        .filter(e => e.kind === 'region' && !excludeIds.has(e.id) && pointInside(e, p, 2))
        .sort((a, b) => (a.w * a.h) - (b.w * b.h))[0] || null;
    }

    function compositeAtPoint(p: DiagramPoint) {
      const direct = dg().elements
        .filter(e => e.kind === 'compositestate' && pointInside(e, p))
        .sort((a, b) => (a.w * a.h) - (b.w * b.h))[0];
      if (direct) return direct;
      const region = regionAtPoint(p);
      return region ? byId(region.parentId) : null;
    }

    function layoutCompositeRegions(diagram: EditorDiagram) {
      diagram.elements.filter(e => e.kind === 'compositestate').forEach(owner => {
        const regions = diagram.elements
          .filter(e => e.kind === 'region' && e.parentId === owner.id)
          .sort((a, b) => (a.regionOrder || 0) - (b.regionOrder || 0) || a.id.localeCompare(b.id));
        if (!regions.length) return;
        const top = owner.y + ((owner._m && owner._m.contentTop) || 28);
        const innerX = owner.x + 6, innerW = Math.max(40, owner.w - 12);
        const available = Math.max(48, owner.y + owner.h - top - 6);
        regions.forEach((region, index) => {
          const y0 = top + available * index / regions.length;
          const y1 = top + available * (index + 1) / regions.length;
          const next = { x: innerX, y: y0, w: innerW, h: y1 - y0 };
          const previous = regionLayoutCache.get(region);
          if (previous && (previous.x !== next.x || previous.y !== next.y || previous.w !== next.w || previous.h !== next.h)) {
            childViews(region.id, diagram).forEach(child => {
              const px = previous.w ? (child.x - previous.x) / previous.w : 0;
              const py = previous.h ? (child.y - previous.y) / previous.h : 0;
              const targetX = next.x + px * next.w;
              const targetY = next.y + py * next.h;
              const tree = [child, ...descendantViews(child.id, diagram)];
              const origins = new Map(tree.map(view => [view.id, { x: view.x, y: view.y }]));
              moveViewTree(child, targetX - child.x, targetY - child.y, origins);
            });
          }
          region.x = next.x; region.y = next.y; region.w = next.w; region.h = next.h;
          region.regionOrder = index;
          regionLayoutCache.set(region, { ...next });
        });
      });
    }

    function layoutConnectionPointRefs(diagram: EditorDiagram) {
      diagram.elements.filter(e => e.kind === 'connectionpointref').forEach(ref => {
        const owner = diagram.elements.find(e => e.id === ref.parentId);
        if (!owner || owner.kind !== 'submachinestate') return;
        const anchor = ref.borderAnchor || { fx: 0, fy: 0.5 };
        const point = anchorPoint(owner, anchor);
        ref.x = point.x - ref.w / 2;
        ref.y = point.y - ref.h / 2;
      });
    }

    function compositeContainerAtPoint(p: DiagramPoint, excludeIds = new Set<string>()) {
      return dg().elements
        .filter(e => COMPOSITE_CONTAINER_KINDS.has(e.kind) && !excludeIds.has(e.id) && pointInside(e, p, 4))
        .sort((a, b) => (a.w * a.h) - (b.w * b.h))[0] || null;
    }

    function compositePortOwnerAtPoint(p: DiagramPoint, excludeIds = new Set<string>()) {
      return dg().elements
        .filter(e => isPortOwner(e) && !excludeIds.has(e.id) && pointInside(e, p))
        .sort((a, b) => (a.w * a.h) - (b.w * b.h))[0] || null;
    }

    function isPortOwner(view: DiagramElement, diagram = dg()) {
      return COMPOSITE_CONTAINER_KINDS.has(view.kind) || view.kind === 'part'
        || (diagram?.type === 'ibd' && IBD_CONTAINER_KINDS.has(view.kind))
        || (diagram?.type === 'parametric' && PARAMETRIC_CONTAINER_KINDS.has(view.kind));
    }

    function layoutCompositePorts(diagram: EditorDiagram) {
      diagram.elements.filter(e => e.kind === 'port').forEach(port => {
        const owner = diagram.elements.find(e => e.id === port.parentId);
        if (!owner || !isPortOwner(owner, diagram)) return;
        const anchor = port.borderAnchor || { fx: 1, fy: 0.5 };
        const point = anchorPoint(owner, anchor);
        port.x = point.x - port.w / 2;
        port.y = point.y - port.h / 2;
      });
    }

    function activityContainerAtPoint(p: DiagramPoint, excludeIds = new Set<string>()) {
      return dg().elements
        .filter(e => ACTIVITY_CONTAINER_KINDS.has(e.kind) && !excludeIds.has(e.id) && pointInside(e, p, 4))
        .sort((a, b) => (a.w * a.h) - (b.w * b.h))[0] || null;
    }

    function activityAttachmentOwnerAtPoint(kind: string, p: DiagramPoint) {
      const allowed = (kind === 'expansioninput' || kind === 'expansionoutput')
        ? new Set(['expansionregion'])
        : ACTIVITY_ACTION_KINDS;
      return dg().elements
        .filter(e => allowed.has(e.kind) && pointInside(e, p))
        .sort((a, b) => (a.w * a.h) - (b.w * b.h))[0] || null;
    }

    function layoutActivityAttachments(diagram: EditorDiagram) {
      diagram.elements.filter(e => ACTIVITY_PIN_KINDS.has(e.kind)).forEach(pin => {
        const owner = diagram.elements.find(e => e.id === pin.parentId);
        if (!owner) return;
        const anchor = pin.borderAnchor || { fx: pin.kind.includes('input') ? 0 : 1, fy: 0.5 };
        const point = anchorPoint(owner, anchor);
        pin.x = point.x - pin.w / 2;
        pin.y = point.y - pin.h / 2;
      });
    }

    function activityAncestor(view: DiagramElement, kind: string, diagram = dg()) {
      let current: DiagramElement | undefined = view;
      const seen = new Set();
      while (current && current.parentId && !seen.has(current.parentId)) {
        seen.add(current?.parentId);
        current = diagram.elements.find(e => e.id === current?.parentId);
        if (current && current.kind === kind) return current;
      }
      return null;
    }

    function attachToActivityContainer(view: DiagramElement) {
      if (dg().type !== 'activity' || ACTIVITY_PIN_KINDS.has(view.kind)) return;
      if (!ACTIVITY_VERTEX_KINDS.has(view.kind) && !ACTIVITY_CONTAINER_KINDS.has(view.kind)) return;
      const excluded = new Set([view.id, ...descendantViews(view.id).map(child => child.id)]);
      const target = activityContainerAtPoint(center(view), excluded);
      if (target) view.parentId = target.id;
      else if (view.parentId && ACTIVITY_CONTAINER_KINDS.has(byId(view.parentId)?.kind || '')) delete view.parentId;
    }

    function packageContainerAtPoint(p: DiagramPoint, excludeIds = new Set<string>()) {
      return dg().elements
        .filter(e => PACKAGE_CONTAINER_KINDS.has(e.kind) && !excludeIds.has(e.id) && pointInside(e, p, 6))
        .sort((a, b) => (a.w * a.h) - (b.w * b.h))[0] || null;
    }

    function isViewAncestor(ancestor: DiagramElement, view: DiagramElement, diagram = dg()) {
      let current: DiagramElement | undefined = view;
      const seen = new Set();
      while (current && current.parentId && !seen.has(current.parentId)) {
        seen.add(current?.parentId);
        current = diagram.elements.find(element => element.id === current?.parentId);
        if (current && current.id === ancestor.id) return true;
      }
      return false;
    }

    function attachToPackageContainer(view: DiagramElement) {
      if (dg().type !== 'package' || !PACKAGE_CONTAINER_KINDS.has(view.kind)) return;
      const excluded = new Set([view.id, ...descendantViews(view.id).map(child => child.id)]);
      const target = packageContainerAtPoint(center(view), excluded);
      const containment = dg().relations.find(relation => relation.kind === 'containment' && relation.from === view.id);
      if (target) {
        view.parentId = target.id;
        if (containment && containment.to !== target.id) {
          containment.to = target.id;
          delete containment.srcAnchor; delete containment.dstAnchor;
          syncRelationModel(containment);
        }
      } else if (view.parentId && PACKAGE_CONTAINER_KINDS.has(byId(view.parentId)?.kind || '')) {
        delete view.parentId;
        if (containment) dg().relations = dg().relations.filter(relation => relation.id !== containment.id);
      }
    }

    function compositePortDirection(port: DiagramElement) {
      const anchor = port.borderAnchor || { fx: 1, fy: 0.5 };
      if (anchor.fx === 0) return { x: -1, y: 0 };
      if (anchor.fx === 1) return { x: 1, y: 0 };
      if (anchor.fy === 0) return { x: 0, y: -1 };
      return { x: 0, y: 1 };
    }

    function attachPartToCompositeContainer(part: DiagramElement) {
      if (dg().type !== 'composite' || !['part', 'collaborationuse'].includes(part.kind)) return;
      const excluded = new Set([part.id, ...descendantViews(part.id).map(x => x.id)]);
      const target = compositeContainerAtPoint(center(part), excluded);
      if (target) {
        part.parentId = target.id;
        return;
      }
      const owner = byId(part.parentId);
      if (!owner || !COMPOSITE_CONTAINER_KINDS.has(owner.kind)) return;
      part.x = snap(Math.min(Math.max(part.x, owner.x + 12), owner.x + owner.w - part.w - 12));
      part.y = snap(Math.min(Math.max(part.y, owner.y + 48), owner.y + owner.h - part.h - 12));
    }

    function ibdContainerAtPoint(p: DiagramPoint, excludeIds = new Set<string>()) {
      return dg().elements
        .filter(e => IBD_CONTAINER_KINDS.has(e.kind) && !excludeIds.has(e.id) && pointInside(e, p, 4))
        .sort((a, b) => (a.w * a.h) - (b.w * b.h))[0] || null;
    }

    function attachToInternalBlockContainer(view: DiagramElement) {
      if (dg().type !== 'ibd' || !IBD_TYPED_KINDS.has(view.kind)) return;
      const excluded = new Set([view.id, ...descendantViews(view.id).map(child => child.id)]);
      const target = ibdContainerAtPoint(center(view), excluded);
      if (target) view.parentId = target.id;
      const owner = byId(view.parentId);
      if (!owner || !IBD_CONTAINER_KINDS.has(owner.kind)) return;
      const topInset = owner.kind === 'ibdframe' ? 44 : 12;
      view.x = snap(Math.min(Math.max(view.x, owner.x + 12), owner.x + owner.w - view.w - 12));
      view.y = snap(Math.min(Math.max(view.y, owner.y + topInset), owner.y + owner.h - view.h - 12));
    }

    function parametricContainerAtPoint(p: DiagramPoint, excludeIds = new Set<string>()) {
      return dg().elements
        .filter(e => PARAMETRIC_CONTAINER_KINDS.has(e.kind) && !excludeIds.has(e.id) && pointInside(e, p, 4))
        .sort((a, b) => (a.w * a.h) - (b.w * b.h))[0] || null;
    }

    function attachToParametricContainer(view: DiagramElement) {
      if (dg().type !== 'parametric' || !['constraintproperty', 'value'].includes(view.kind)) return;
      const excluded = new Set([view.id, ...descendantViews(view.id).map(child => child.id)]);
      const target = parametricContainerAtPoint(center(view), excluded);
      if (target?.kind === 'parametricframe') view.parentId = target.id;
      const owner = byId(view.parentId);
      if (!owner || owner.kind !== 'parametricframe') return;
      view.x = snap(Math.min(Math.max(view.x, owner.x + 12), owner.x + owner.w - view.w - 12));
      view.y = snap(Math.min(Math.max(view.y, owner.y + 44), owner.y + owner.h - view.h - 12));
    }

    function layoutParametricParameters(diagram: EditorDiagram) {
      diagram.elements.filter(e => e.kind === 'constraintparameter').forEach(parameter => {
        const owner = diagram.elements.find(e => e.id === parameter.parentId);
        if (!owner || !PARAMETRIC_CONTAINER_KINDS.has(owner.kind)) return;
        const anchor = parameter.borderAnchor || { fx: 1, fy: 0.5 };
        const point = anchorPoint(owner, anchor);
        parameter.x = point.x - parameter.w / 2;
        parameter.y = point.y - parameter.h / 2;
      });
    }

    function timingLifelineAtPoint(p: DiagramPoint) {
      return dg().elements
        .filter(e => e.kind === 'lifeline' && pointInside(e, p))
        .sort((a, b) => (a.w * a.h) - (b.w * b.h))[0] || null;
    }

    function timingStateAtPoint(p: DiagramPoint) {
      return dg().elements
        .filter(e => e.kind === 'timingstate' && pointInside(e, p))
        .sort((a, b) => (a.w * a.h) - (b.w * b.h))[0] || null;
    }

    function timingConstraintAnchor(targetId: string | undefined, diagram: EditorDiagram, ratio = 0.5) {
      const element = diagram.elements.find(e => e.id === targetId);
      if (element) {
        const position = Math.max(0, Math.min(1, Number.isFinite(ratio) ? ratio : 0.5));
        return { x: element.x + element.w * position, y: element.y + element.h / 2 };
      }
      const relation = diagram.relations.find(r => r.id === targetId && r.kind === 'timingmessage');
      const ep = relation && relEndpoints(relation);
      return ep ? { x: (ep.p1.x + ep.p2.x) / 2, y: (ep.p1.y + ep.p2.y) / 2 } : null;
    }

    function layoutTimingDiagram(diagram: EditorDiagram) {
      const lifelines = diagram.elements.filter(e => e.kind === 'lifeline').sort((a, b) => a.y - b.y || a.x - b.x);
      lifelines.forEach(lifeline => {
        const states = diagram.elements
          .filter(e => e.kind === 'timingstate' && e.parentId === lifeline.id)
          .sort((a, b) => (a.stateOrder || 0) - (b.stateOrder || 0) || a.id.localeCompare(b.id));
        lifeline.h = Math.max(lifeline.h, 44 + Math.max(1, states.length) * TIMING_ROW_HEIGHT);
        states.forEach((stateView, index) => {
          stateView.stateOrder = index;
          stateView.x = lifeline.x;
          stateView.y = lifeline.y + 44 + index * TIMING_ROW_HEIGHT;
          stateView.w = lifeline.w;
          stateView.h = TIMING_ROW_HEIGHT;
          diagram.elements.filter(e => e.kind === 'timesegment' && e.parentId === stateView.id).forEach(segment => {
            segment.h = 10;
            segment.x = Math.max(lifeline.x + TIMING_LABEL_WIDTH + 8,
              Math.min(segment.x, lifeline.x + lifeline.w - segment.w - 8));
            segment.y = stateView.y + stateView.h / 2 - segment.h / 2;
          });
        });
      });
      const top = lifelines.length ? Math.min(...lifelines.map(e => e.y)) : 72;
      const bottom = lifelines.length ? Math.max(...lifelines.map(e => e.y + e.h)) + 40 : 560;
      diagram.elements.filter(e => e.kind === 'timetick').forEach(tick => {
        tick.y = top;
        tick.w = 8;
        tick.h = Math.max(120, bottom - top);
      });
      diagram.elements.filter(e => e.kind === 'timeconstraint').forEach(constraintView => {
        const anchor = timingConstraintAnchor(constraintView.constrainedViewId, diagram, constraintView.anchorRatio);
        if (!anchor) return;
        constraintView.x = anchor.x - constraintView.w / 2;
        constraintView.y = anchor.y - 54;
      });
    }

    function attachToContainingRegion(e: DiagramElement) {
      if (dg().type !== 'state' || e.kind === 'region' || !STATE_VERTEX_KINDS.has(e.kind)) return;
      const excluded = new Set([e.id, ...descendantViews(e.id).map(x => x.id)]);
      const target = regionAtPoint(center(e), excluded);
      if (target) e.parentId = target.id;
      else delete e.parentId;
    }

    function moveViewTree(e: DiagramElement, dx: number, dy: number, origins?: ReadonlyMap<string, DiagramPoint>, grid?: number, axis?: DiagramMoveAxis) {
      const all = [e, ...descendantViews(e.id)];
      all.forEach(view => {
        const origin = origins && origins.get(view.id);
        if (axis !== 'y') view.x = Math.max(0, snap((origin ? origin.x : view.x) + dx, grid));
        if (axis !== 'x' && !(dg().type === 'sequence' && view.kind === 'lifeline')) {
          view.y = Math.max(0, snap((origin ? origin.y : view.y) + dy, grid));
        }
        if (view.kind === 'region') regionLayoutCache.set(view, { x: view.x, y: view.y, w: view.w, h: view.h });
      });
    }

    return Object.freeze({
      activityAncestor,
      activityAttachmentOwnerAtPoint,
      activityContainerAtPoint,
      attachPartToCompositeContainer,
      attachToActivityContainer,
      attachToContainingRegion,
      attachToInternalBlockContainer,
      attachToPackageContainer,
      attachToParametricContainer,
      childViews,
      compositeAtPoint,
      compositeContainerAtPoint,
      compositePortDirection,
      compositePortOwnerAtPoint,
      containmentDepth,
      containmentOrder,
      descendantViews,
      ibdContainerAtPoint,
      isPortOwner,
      isViewAncestor,
      layoutActivityAttachments,
      layoutCompositePorts,
      layoutCompositeRegions,
      layoutConnectionPointRefs,
      layoutParametricParameters,
      layoutTimingDiagram,
      moveViewTree,
      packageContainerAtPoint,
      parametricContainerAtPoint,
      regionAtPoint,
      rootViews,
      timingConstraintAnchor,
      timingLifelineAtPoint,
      timingStateAtPoint,
    });
  }

  return Object.freeze({ REQUIRED_FUNCTIONS, REQUIRED_VALUES, KIND_SETS, create });
}
