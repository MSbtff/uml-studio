(function (global) {
  'use strict';

  function canvasPoint(event, svg, zoom) {
    const rect = svg.getBoundingClientRect();
    const scale = Number.isFinite(zoom) && zoom > 0 ? zoom : 1;
    return {
      x: (event.clientX - rect.left) / scale,
      y: (event.clientY - rect.top) / scale,
    };
  }

  function marqueeBounds({ x0, y0, x1, y1 }) {
    return { left: Math.min(x0, x1), top: Math.min(y0, y1), right: Math.max(x0, x1), bottom: Math.max(y0, y1) };
  }

  function marqueeElementIds(marquee, elements) {
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
    'activityRelationError',
    'attachPartToCompositeContainer',
    'attachToActivityContainer',
    'attachToContainingRegion',
    'attachToInternalBlockContainer',
    'attachToPackageContainer',
    'attachToParametricContainer',
    'bddRelationError',
    'bindingWaypoints',
    'borderAnchorFrac',
    'branchGeom',
    'byId',
    'closeInlineEditor',
    'communicationConnectorAt',
    'completeLink',
    'compositeRelationError',
    'createCommunicationMessage',
    'descendantViews',
    'dg',
    'elementAt',
    'ensureMemberArray',
    'flashStatus',
    'fragmentOperandLayout',
    'handleCanvasQuickEdit',
    'ibdRelationError',
    'informationFlowRelationError',
    'isCommMsg',
    'isInteractionMsg',
    'isMsg',
    'isPortOwner',
    'lblOff',
    'markDirty',
    'measure',
    'memberRowAt',
    'moveErdColumnTo',
    'moveViewTree',
    'msgPoints',
    'packageRelationError',
    'parametricRelationError',
    'profileRelationError',
    'relById',
    'relEndpoints',
    'relationAt',
    'relationLabelAt',
    'render',
    'renderProps',
    'requirementRelationError',
    'rootViews',
    'sequenceMessageMinY',
    'setSelection',
    'snap',
    'snapshot',
    'stateSelfTransitionGeom',
    'syncCommunicationMessages',
    'syncRelationModel',
    'transitionDirectionError',
  ]);
  const REQUIRED_VALUES = Object.freeze([
    'ACTIVITY_PIN_KINDS',
    'elementPlacement',
    'INSTANCE_KINDS',
    'KIND_META',
    'REL_STYLE',
    'STATE_VERTEX_KINDS',
  ]);

  function create(deps) {
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
      activityRelationError,
      attachPartToCompositeContainer,
      attachToActivityContainer,
      attachToContainingRegion,
      attachToInternalBlockContainer,
      attachToPackageContainer,
      attachToParametricContainer,
      bddRelationError,
      bindingWaypoints,
      borderAnchorFrac,
      branchGeom,
      byId,
      closeInlineEditor,
      communicationConnectorAt,
      completeLink,
      compositeRelationError,
      createCommunicationMessage,
      descendantViews,
      dg,
      elementAt,
      ensureMemberArray,
      eventRoot,
      flashStatus,
      fragmentOperandLayout,
      handleCanvasQuickEdit,
      ibdRelationError,
      informationFlowRelationError,
      isCommMsg,
      isInteractionMsg,
      isMsg,
      isPortOwner,
      lblOff,
      markDirty,
      measure,
      memberRowAt,
      moveErdColumnTo,
      moveViewTree,
      msgPoints,
      packageRelationError,
      parametricRelationError,
      profileRelationError,
      relById,
      relEndpoints,
      relationAt,
      relationLabelAt,
      render,
      renderProps,
      requirementRelationError,
      rootViews,
      sequenceMessageMinY,
      setSelection,
      snap,
      snapshot,
      state,
      stateSelfTransitionGeom,
      svg,
      syncCommunicationMessages,
      syncRelationModel,
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

    let drag = null;
    let linking = null;
    let marquee = null;

    function beginSequenceMove(start) {
      const diagram = dg();
      if (diagram.type !== 'sequence') return false;
      const selected = new Set(state.selection);
      const selectedElements = diagram.elements.filter(view => selected.has(view.id));
      const sequenceMessages = diagram.relations.filter(relation => isMsg(relation.kind) && Number.isFinite(relation.y));
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

    function toggleSelection(id) {
      const selected = new Set(state.selection.filter(selectedId => byId(selectedId) || isMsg(relById(selectedId)?.kind)));
      if (selected.has(id)) selected.delete(id);
      else selected.add(id);
      setSelection([...selected]);
      render(); renderProps();
    }

  function svgPoint(ev) {
      return canvasPoint(ev, svg, state.zoom);
    }

    function handleMouseDown(ev) {
    if (ev.button !== 0) return;
    closeInlineEditor();
    const p = svgPoint(ev);

    const divider = ev.target.getAttribute?.('data-operand-divider');
    if (state.tool === 'select' && divider != null) {
      const fragment = byId(ev.target.getAttribute('data-fragment-id'));
      const index = Number(divider);
      if (fragment?.kind === 'fragment' && Number.isInteger(index) && index > 0 && index < fragment.operands?.length) {
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

    /* render() replaces SVG nodes after selection, so native dblclick targets
       are not stable. MouseEvent.detail survives that replacement and routes
       every element, member row and relationship through one QuickEdit path. */
    if (state.tool === 'select' && ev.detail >= 2 && handleCanvasQuickEdit(ev, p)) {
      drag = null;
      ev.preventDefault();
      return;
    }

    const routePointIndex = ev.target.getAttribute && ev.target.getAttribute('data-route-point');
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

    /* relation endpoint handle → drag to re-anchor or reconnect */
    const epDir = ev.target.getAttribute && ev.target.getAttribute('data-endpoint');
    if (epDir && state.selectedId) {
      const r = relById(state.selectedId);
      if (r && !isInteractionMsg(r.kind)) {
        snapshot();
        drag = { mode: 'endpoint', rel: r, end: epDir };
        ev.preventDefault();
        return;
      }
    }

    const hDir = ev.target.getAttribute && ev.target.getAttribute('data-handle');
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

    /* 이미 선택된 관계라면, 끝점 14px 이내를 최우선으로 잡는다
       (요소/라벨/선 몸통보다 우선 — 끝점이 겹쳐 있어도 확실히 잡히도록) */
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
        flashStatus('Communication Message는 먼저 만든 Connector 선을 클릭해 추가하세요');
        return;
      }
      createCommunicationMessage(connector, tool);
      return;
    }

    /* element creation */
    if (KIND_META[tool] && !REL_STYLE[tool] && tool !== 'select') {
      /* placing a view touches no drag or linking state, so it lives in its own
         module and this handler only decides that the tool asked for it */
      elementPlacement.placeElementForTool(p, tool, hitEl);
      return;
    }

    /* relation creation */
    if (REL_STYLE[tool]) {
      if (linking && linking.armed && hitEl) {
        const self = hitEl.id === linking.fromId;
        if (!self || tool === 'msg-sync' || tool === 'msg-async' || tool === 'transition' || tool === 'commconnector') {
          completeLink(hitEl, p);
          return;
        }
      }
      if (hitEl) {
        linking = { fromId: hitEl.id, x: p.x, y: p.y, armed: false };
        render();
      }
      return;
    }

    /* ERD 본문에서는 컬럼 행 드래그가 테이블 전체 이동보다 우선한다. */
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

    /* select / move */
    if (hitEl) {
      if (ev.shiftKey) {
        toggleSelection(hitEl.id);
        return;
      }
      if (!state.selection.includes(hitEl.id)) {
        setSelection([hitEl.id]);
        render(); renderProps();
      }
      if (beginSequenceMove(p)) return;
      if (state.selection.length > 1) {
        /* group move: every selected element follows the drag */
        const roots = rootViews(state.selection.map(byId).filter(Boolean));
        const moving = [...new Map(roots.flatMap(root => [root, ...descendantViews(root.id)]).map(view => [view.id, view])).values()];
        drag = {
          mode: 'groupmove', start: p, moved: false,
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
          mode: 'move', el: hitEl, moved: false, offx: p.x - hitEl.x, offy: p.y - hitEl.y,
          start: p, origins: new Map(tree.map(view => [view.id, { x: view.x, y: view.y }])),
        };
      }
      return;
    }
    const labelHit = relationLabelAt(p);
    const hitRel = labelHit ? labelHit.r : relationAt(p);
    if (hitRel) {
      if (isMsg(hitRel.kind)) {
        if (ev.shiftKey) { toggleSelection(hitRel.id); return; }
        if (state.selection.includes(hitRel.id) && beginSequenceMove(p)) return;
      }
      if (state.selectedId !== hitRel.id) { setSelection([hitRel.id]); render(); renderProps(); }
      if (labelHit) {
        /* drag the label itself to reposition it */
        drag = { mode: 'label', rel: hitRel, field: labelHit.field, start: p, orig: { ...lblOff(hitRel, labelHit.field) }, moved: false };
      } else if (isMsg(hitRel.kind)) {
        drag = { mode: 'msgmove', rel: hitRel, moved: false };
      } else if (isCommMsg(hitRel.kind)) {
        drag = null; // Communication Message 위치는 소유 Connector와 순서로 자동 배치된다.
      } else {
        /* 끝에서 14px 이내를 잡으면 그 끝점만 이동, 그 외에는 선 전체 이동 */
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
    /* empty canvas: start rubber-band (marquee) selection */
    if (state.selection.length) { setSelection([]); renderProps(); }
    marquee = { x0: p.x, y0: p.y, x1: p.x, y1: p.y };
    drag = { mode: 'marquee' };
    render();
    }

    /* A high-polling mouse delivers several mousemove events per displayed
       frame, and each one used to redraw the whole canvas — on a 600-element
       diagram that is ~30ms of work per event, so the drag fell behind the
       pointer. Model state still updates on every event (the pointer stays
       exact); only the paint is coalesced to at most one per frame. */
    let renderFrame = 0;
    function scheduleRender() {
      if (renderFrame) return;
      renderFrame = requestAnimationFrame(() => {
        renderFrame = 0;
        render();
      });
    }

    function marqueeHits(mq) {
      const diagram = dg();
      const ids = marqueeElementIds(mq, diagram.elements);
      if (diagram.type !== 'sequence') return ids;
      const { left, top, right, bottom } = marqueeBounds(mq);
      if (left === right || top === bottom) return ids;
      const crossesHorizontal = (x1, x2, y) =>
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

    function handleMouseMove(ev) {
    const p = svgPoint(ev);
    if (linking) { linking.x = p.x; linking.y = p.y; scheduleRender(); return; }
    if (!drag) return;
    if (drag.mode === 'erdcolumn') {
      const dx = p.x - drag.start.x, dy = p.y - drag.start.y;
      if (!drag.moved && Math.hypot(dx, dy) < 4) return;
      const columns = ensureMemberArray(drag.entity, 'columns');
      if (!columns.length) return;
      const metrics = drag.entity._m || measure(drag.entity);
      const bodyTop = drag.entity.y + metrics.headH;
      drag.moved = true;
      drag.targetIndex = Math.max(0, Math.min(columns.length - 1,
        Math.floor((p.y - bodyTop) / metrics.RH)));
      scheduleRender();
    } else if (drag.mode === 'move') {
      if (!drag.moved) { snapshot(); drag.moved = true; }
      const origin = drag.origins.get(drag.el.id);
      const targetX = snap(p.x - drag.offx);
      const targetY = snap(p.y - drag.offy);
      moveViewTree(drag.el, targetX - origin.x, targetY - origin.y, drag.origins);
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
      const height = boundaries.at(-1) - top;
      fragment.operandDividers = boundaries.slice(1, -1)
        .map((boundary, offset) => ((offset + 1 === index ? y : boundary) - top) / height);
      scheduleRender();
    } else if (drag.mode === 'sequencemove') {
      const dx = drag.wholeDiagram ? Math.max(-drag.minX, snap(p.x - drag.start.x)) : 0;
      const dy = Math.max(-drag.minY, snap(p.y - drag.start.y));
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
      const dx = p.x - drag.start.x, dy = p.y - drag.start.y;
      drag.els.forEach(({ e, ox, oy }) => {
        e.x = snap(ox + dx);
        e.y = dg().type === 'sequence' && e.kind === 'lifeline' ? oy : snap(oy + dy);
      });
      scheduleRender();
    } else if (drag.mode === 'marquee') {
      marquee.x1 = p.x; marquee.y1 = p.y;
      setSelection(marqueeHits(marquee));   // 드래그 중 실시간 선택
      scheduleRender();
    } else if (drag.mode === 'msgmove') {
      if (!drag.moved) { snapshot(); drag.moved = true; }
      drag.rel.y = Math.max(sequenceMessageMinY(dg()), snap(p.y));
      scheduleRender();
    } else if (drag.mode === 'label') {
      if (!drag.moved) { snapshot(); drag.moved = true; }
      const r = drag.rel;
      r.lblOff = r.lblOff || {};
      r.lblOff[drag.field] = { dx: drag.orig.dx + (p.x - drag.start.x), dy: drag.orig.dy + (p.y - drag.start.y) };
      scheduleRender();
    } else if (drag.mode === 'routepoint') {
      const waypoints = bindingWaypoints(drag.rel);
      if (waypoints[drag.index]) {
        if (!drag.moved) { snapshot(); drag.moved = true; }
        waypoints[drag.index] = { x: snap(p.x), y: snap(p.y) };
        drag.rel.manualPoints = waypoints;
        scheduleRender();
      }
    } else if (drag.mode === 'relmove') {
      if (!drag.moved) { snapshot(); drag.moved = true; }
      const r = drag.rel;
      const dx = p.x - drag.start.x, dy = p.y - drag.start.y;
      const clamp01 = v => Math.max(0, Math.min(1, v));
      /* each endpoint SLIDES ALONG the edge it already sits on:
         a point on a top/bottom edge only moves left↔right, a point on a
         left/right edge only moves up↔down. So a vertical relation slides
         horizontally and a horizontal one slides vertically — no surprise
         axis. (Use the square endpoint handles to switch edges.) */
      const apply = (id, anchorKey, pt) => {
        const host = byId(id);
        if (!host) return;
        const side = borderAnchorFrac(host, pt);           // which edge the end is on
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
        /* when hovering a *different* element, don't fight it with an anchor —
           show it as a reconnect target instead. Otherwise snap to the nearest
           border of the current host (stable, no centre-angle jitter). */
        const t = elementAt(p);
        drag.hoverId = (t && t.id !== curId && t.id !== otherId) ? t.id : null;
        if (!drag.hoverId) {
          r[drag.end === 'src' ? 'srcAnchor' : 'dstAnchor'] = borderAnchorFrac(host, p);
        }
        scheduleRender();
      }
    } else if (drag.mode === 'resize') {
      const { dir, el: e, orig, start } = drag;
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
        const origin = drag.origins.get(child.id);
        if (origin) { child.x = snap(origin.x + tx); child.y = snap(origin.y + ty); }
      });
      scheduleRender();
    }
    }

    function handleMouseUp(ev) {
    if (linking) {
      const p = svgPoint(ev);
      const target = elementAt(p);
      if (target && target.id !== linking.fromId) completeLink(target, p);
      else if (target) { linking.armed = true; }       // click-click mode
      else { linking = null; render(); }
      return;
    }
    if (drag && drag.mode === 'marquee') {
      marquee = null;
      drag = null;
      render(); renderProps();
      return;
    }
    if (drag?.mode === 'sequencemove' || drag?.mode === 'operanddivider') {
      const moved = drag.moved;
      drag = null;
      if (moved) {
        markDirty();
        render(); renderProps();
      }
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
      /* dropped on another element → reconnect the relation to it */
      if (target && target.id !== curId && target.id !== otherId) {
        if (r.kind === 'transition' && !STATE_VERTEX_KINDS.has(target.kind)) {
          flashStatus('Transition은 State 또는 Pseudostate에만 재연결할 수 있습니다');
        } else if ((r.kind === 'link' || r.kind === 'directedlink') && !INSTANCE_KINDS.has(target.kind)) {
          flashStatus('Link는 Object 또는 Instance 사이에만 재연결할 수 있습니다');
        } else if (r.kind === 'commconnector' && target.kind !== 'lifeline') {
          flashStatus('Communication Connector는 Lifeline 사이에만 재연결할 수 있습니다');
        } else if (r.kind === 'timingmessage' && target.kind !== 'timesegment') {
          flashStatus('Timing Message는 Time Segment 사이에만 재연결할 수 있습니다');
        } else {
          const nextFrom = drag.end === 'src' ? target : byId(r.from);
          const nextTo = drag.end === 'dst' ? target : byId(r.to);
          const directionError = r.kind === 'transition' ? transitionDirectionError(nextFrom, nextTo) : '';
          const compositeError = compositeRelationError(r.kind, nextFrom, nextTo);
          const activityError = activityRelationError(r.kind, nextFrom, nextTo);
          const packageError = packageRelationError(r.kind, nextFrom, nextTo);
          const profileError = profileRelationError(r.kind, nextFrom, nextTo, r.id);
          const informationFlowError = informationFlowRelationError(r.kind, nextFrom, nextTo);
          const requirementError = requirementRelationError(r.kind, nextFrom, nextTo);
          const bddError = bddRelationError(r.kind, nextFrom, nextTo, r.id);
          const ibdError = ibdRelationError(r.kind, nextFrom, nextTo, r.id);
          const parametricError = parametricRelationError(r.kind, nextFrom, nextTo, r.id);
          if (directionError || compositeError || activityError || packageError || profileError || informationFlowError || requirementError || bddError || ibdError || parametricError) {
            flashStatus(directionError || compositeError || activityError || packageError || profileError || informationFlowError || requirementError || bddError || ibdError || parametricError);
          } else {
            const previousFrom = byId(r.from), previousTo = byId(r.to);
            if (drag.end === 'src') r.from = target.id; else r.to = target.id;
            delete r[drag.end === 'src' ? 'srcAnchor' : 'dstAnchor'];
            if (r.kind === 'containment') {
              if (previousFrom && previousFrom.parentId === previousTo?.id) delete previousFrom.parentId;
              nextFrom.parentId = nextTo.id;
            }
            syncRelationModel(r);
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
      /* a frame queued by the last drag must not paint into a detached canvas */
      if (renderFrame) { cancelAnimationFrame(renderFrame); renderFrame = 0; }
      attached = false;
    }

    return Object.freeze({
      attach,
      detach,
      state: () => ({ drag, linking, marquee }),
      getLinking: () => linking,
      setLinking(value) { linking = value; },
      cancel() {
        drag = null;
        linking = null;
        marquee = null;
      },
    });
  }

  const api = Object.freeze({
    REQUIRED_FUNCTIONS,
    REQUIRED_VALUES,
    canvasPoint,
    marqueeElementIds,
    create,
  });
  if (typeof module === 'object' && module.exports) module.exports = api;
  global.UMLCanvasInteraction = api;
})(typeof window !== 'undefined' ? window : globalThis);
