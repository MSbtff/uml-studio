// @ts-nocheck
(function initViewportControllerModule(root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root) root.UMLViewportController = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function createViewportControllerModule() {
  'use strict';

  const REQUIRED_FUNCTIONS = Object.freeze([
    'bindingRoute', 'branchGeom', 'communicationMessagePoints', 'contentBBox', 'dg', 'el',
    'flashStatus', 'isCommMsg', 'isMsg', 'msgPoints', 'polylinePath', 'relEndpoints', 'renderCanvas',
  ]);
  const REQUIRED_VALUES = Object.freeze([
    'document', 'eventRoot', 'state', 'minimap', 'minimapSvg', 'svg', 'wrap',
    'KIND_META', 'CANVAS_W', 'CANVAS_H',
  ]);
  const SCROLL_OPTIONS = Object.freeze({ passive: true });
  const WHEEL_OPTIONS = Object.freeze({ passive: false });

  function create(deps = {}) {
    REQUIRED_FUNCTIONS.forEach(name => {
      if (typeof deps[name] !== 'function') throw new Error(`UMLViewportController requires ${name}()`);
    });
    REQUIRED_VALUES.forEach(name => {
      if (deps[name] == null) throw new Error(`UMLViewportController requires ${name}`);
    });

    const {
      bindingRoute, branchGeom, communicationMessagePoints, contentBBox, dg, el,
      flashStatus, isCommMsg, isMsg, msgPoints, polylinePath, relEndpoints, renderCanvas,
      document, eventRoot, state, minimap, minimapSvg, svg, wrap,
      KIND_META, CANVAS_W, CANVAS_H,
    } = deps;
    let minimapMap = null;
    let pan = null;
    let attached = false;

    function setZoom(zoom) {
      state.zoom = Math.min(3, Math.max(0.25, zoom));
      const label = document.getElementById('zoomLabel');
      if (label) label.textContent = Math.round(state.zoom * 100) + '%';
      renderCanvas();
    }

    function fitToWindow() {
      const bbox = contentBBox();
      if (!bbox) {
        flashStatus('맞춤 표시할 요소가 없습니다');
        return false;
      }
      const zoom = Math.min(3, Math.max(0.25, Math.min(
        Math.max(120, wrap.clientWidth - 56) / bbox.w,
        Math.max(120, wrap.clientHeight - 56) / bbox.h,
      )));
      setZoom(zoom);
      wrap.scrollLeft = Math.max(0, (bbox.x + bbox.w / 2) * zoom - wrap.clientWidth / 2);
      wrap.scrollTop = Math.max(0, (bbox.y + bbox.h / 2) * zoom - wrap.clientHeight / 2);
      updateMinimapViewport();
      return true;
    }

    function renderMinimap() {
      minimap.hidden = !state.showMinimap;
      const button = document.getElementById('minimapButton');
      if (button) {
        button.classList.toggle('mode-active', state.showMinimap);
        button.setAttribute('aria-pressed', String(state.showMinimap));
      }
      if (!state.showMinimap) return;
      const bounds = contentBBox() || { x: 0, y: 0, w: CANVAS_W, h: CANVAS_H };
      const width = 180;
      const height = 120;
      const padding = 6;
      const scale = Math.min(
        (width - padding * 2) / Math.max(1, bounds.w),
        (height - padding * 2) / Math.max(1, bounds.h),
      );
      const ox = (width - bounds.w * scale) / 2 - bounds.x * scale;
      const oy = (height - bounds.h * scale) / 2 - bounds.y * scale;
      minimapMap = { bounds, scale, ox, oy };
      minimapSvg.textContent = '';
      el('rect', { x: 0, y: 0, width, height, fill: '#f8f9fb' }, minimapSvg);
      dg().relations.forEach(relation => {
        if (relation.kind === 'bindingconnector') {
          const route = bindingRoute(relation);
          if (!route) return;
          const points = route.points.map(point => ({
            x: ox + point.x * scale,
            y: oy + point.y * scale,
          }));
          el('path', {
            d: polylinePath(points), fill: 'none',
            stroke: '#a2a7af', 'stroke-width': .7,
          }, minimapSvg);
          return;
        }
        const endpoints = isCommMsg(relation.kind)
          ? communicationMessagePoints(relation)
          : (isMsg(relation.kind)
            ? msgPoints(relation)
            : (relation.kind === 'mindbranch' ? branchGeom(relation) : relEndpoints(relation)));
        if (!endpoints || endpoints.self) return;
        el('line', {
          x1: ox + endpoints.p1.x * scale,
          y1: oy + endpoints.p1.y * scale,
          x2: ox + endpoints.p2.x * scale,
          y2: oy + endpoints.p2.y * scale,
          stroke: '#a2a7af', 'stroke-width': .7,
        }, minimapSvg);
      });
      dg().elements.forEach(element => {
        const color = KIND_META[element.kind]?.color || '#70757d';
        el('rect', {
          x: ox + element.x * scale,
          y: oy + element.y * scale,
          width: Math.max(2, element.w * scale),
          height: Math.max(2, element.h * scale),
          fill: color, 'fill-opacity': .28, stroke: color, 'stroke-width': .7,
        }, minimapSvg);
      });
      el('rect', {
        id: 'minimap-viewport', x: 0, y: 0, width: 10, height: 10,
        fill: '#1a73e8', 'fill-opacity': .08, stroke: '#1a73e8', 'stroke-width': 1.2,
      }, minimapSvg);
      updateMinimapViewport();
    }

    function updateMinimapViewport() {
      if (!state.showMinimap || !minimapMap) return;
      const viewport = document.getElementById('minimap-viewport');
      if (!viewport) return;
      const { scale, ox, oy } = minimapMap;
      const x = wrap.scrollLeft / state.zoom;
      const y = wrap.scrollTop / state.zoom;
      const width = wrap.clientWidth / state.zoom;
      const height = wrap.clientHeight / state.zoom;
      viewport.setAttribute('x', ox + x * scale);
      viewport.setAttribute('y', oy + y * scale);
      viewport.setAttribute('width', Math.max(4, width * scale));
      viewport.setAttribute('height', Math.max(4, height * scale));
    }

    function toggleMinimap(force) {
      state.showMinimap = force == null ? !state.showMinimap : !!force;
      renderMinimap();
    }

    function handleMinimapMouseDown(event) {
      if (!minimapMap) return;
      event.preventDefault();
      const rect = minimapSvg.getBoundingClientRect();
      const px = (event.clientX - rect.left) * 180 / rect.width;
      const py = (event.clientY - rect.top) * 120 / rect.height;
      const x = (px - minimapMap.ox) / minimapMap.scale;
      const y = (py - minimapMap.oy) / minimapMap.scale;
      wrap.scrollLeft = Math.max(0, x * state.zoom - wrap.clientWidth / 2);
      wrap.scrollTop = Math.max(0, y * state.zoom - wrap.clientHeight / 2);
      updateMinimapViewport();
    }

    function handleWheel(event) {
      if (!(event.ctrlKey || event.metaKey)) return;
      event.preventDefault();
      setZoom(state.zoom * (event.deltaY < 0 ? 1.1 : 0.9));
    }

    function handlePanStart(event) {
      if (event.button !== 1) return;
      event.preventDefault();
      pan = {
        x: event.clientX,
        y: event.clientY,
        scrollLeft: wrap.scrollLeft,
        scrollTop: wrap.scrollTop,
      };
    }

    function handlePanMove(event) {
      if (!pan) return;
      wrap.scrollLeft = pan.scrollLeft - (event.clientX - pan.x);
      wrap.scrollTop = pan.scrollTop - (event.clientY - pan.y);
    }

    function handlePanEnd(event) {
      if (event.button === 1) pan = null;
    }

    function handleAuxClick(event) {
      if (event.button === 1) event.preventDefault();
    }

    function attach() {
      if (attached) return;
      attached = true;
      minimap.addEventListener('mousedown', handleMinimapMouseDown);
      wrap.addEventListener('scroll', updateMinimapViewport, SCROLL_OPTIONS);
      wrap.addEventListener('wheel', handleWheel, WHEEL_OPTIONS);
      svg.addEventListener('mousedown', handlePanStart);
      svg.addEventListener('auxclick', handleAuxClick);
      eventRoot.addEventListener('mousemove', handlePanMove);
      eventRoot.addEventListener('mouseup', handlePanEnd);
    }

    function detach() {
      if (!attached) return;
      attached = false;
      pan = null;
      minimap.removeEventListener('mousedown', handleMinimapMouseDown);
      wrap.removeEventListener('scroll', updateMinimapViewport, SCROLL_OPTIONS);
      wrap.removeEventListener('wheel', handleWheel, WHEEL_OPTIONS);
      svg.removeEventListener('mousedown', handlePanStart);
      svg.removeEventListener('auxclick', handleAuxClick);
      eventRoot.removeEventListener('mousemove', handlePanMove);
      eventRoot.removeEventListener('mouseup', handlePanEnd);
    }

    return Object.freeze({
      attach,
      detach,
      fitToWindow,
      renderMinimap,
      setZoom,
      toggleMinimap,
      updateMinimapViewport,
    });
  }

  return Object.freeze({ REQUIRED_FUNCTIONS, REQUIRED_VALUES, create });
});
