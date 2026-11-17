'use strict';

const assert = require('node:assert/strict');
const {
  REQUIRED_FUNCTIONS,
  REQUIRED_VALUES,
  create,
} = require('../dist/browser/canvas/viewport-controller.js');

function fakeTarget(extra = {}) {
  const listeners = new Map();
  return {
    ...extra,
    addEventListener(type, listener) {
      const handlers = listeners.get(type) || [];
      handlers.push(listener);
      listeners.set(type, handlers);
    },
    removeEventListener(type, listener) {
      listeners.set(type, (listeners.get(type) || []).filter(handler => handler !== listener));
    },
    emit(type, event = {}) { (listeners.get(type) || []).forEach(listener => listener(event)); },
    listenerCount(type) { return (listeners.get(type) || []).length; },
  };
}

function attrNode(extra = {}) {
  const attributes = {};
  return fakeTarget({
    ...extra,
    attributes,
    setAttribute(name, value) { attributes[name] = String(value); },
    getAttribute(name) { return attributes[name]; },
  });
}

assert.ok(Object.isFrozen(REQUIRED_FUNCTIONS));
assert.ok(Object.isFrozen(REQUIRED_VALUES));
assert.throws(() => create(), /bindingRoute/);

const nodes = {
  zoomLabel: attrNode(),
  minimapButton: attrNode({
    classList: {
      active: new Set(),
      toggle(name, force) { force ? this.active.add(name) : this.active.delete(name); },
    },
  }),
};
const document = { getElementById: id => nodes[id] || null };
const minimap = fakeTarget({ hidden: true });
const minimapSvg = fakeTarget({
  textContent: '',
  getBoundingClientRect: () => ({ left: 0, top: 0, width: 180, height: 120 }),
});
const svg = fakeTarget();
const wrap = fakeTarget({
  clientWidth: 500,
  clientHeight: 400,
  scrollLeft: 100,
  scrollTop: 50,
});
const eventRoot = fakeTarget();
const state = { zoom: 1, showMinimap: false };
let bbox = { x: 100, y: 100, w: 800, h: 400 };
let renderCalls = 0;
const statuses = [];
const shapes = [];
const dependencies = {
  ...Object.fromEntries(REQUIRED_FUNCTIONS.map(name => [name, () => undefined])),
  contentBBox: () => bbox,
  dg: () => ({
    elements: [{ id: 'e1', kind: 'class', x: 100, y: 100, w: 200, h: 100 }],
    relations: [],
  }),
  el: (tag, attrs, parent) => {
    const node = attrNode({ tag, parent });
    Object.entries(attrs).forEach(([name, value]) => node.setAttribute(name, value));
    shapes.push(node);
    if (attrs.id) nodes[attrs.id] = node;
    return node;
  },
  flashStatus: message => { statuses.push(message); },
  renderCanvas: () => { renderCalls += 1; },
  document,
  eventRoot,
  state,
  minimap,
  minimapSvg,
  svg,
  wrap,
  KIND_META: { class: { color: '#123456' } },
  CANVAS_W: 3000,
  CANVAS_H: 2000,
};

const controller = create(dependencies);
assert.ok(Object.isFrozen(controller));
controller.setZoom(10);
assert.equal(state.zoom, 3);
assert.equal(nodes.zoomLabel.textContent, '300%');
assert.equal(renderCalls, 1);
controller.setZoom(0.1);
assert.equal(state.zoom, 0.25);

controller.toggleMinimap(true);
assert.equal(state.showMinimap, true);
assert.equal(minimap.hidden, false);
assert.equal(nodes.minimapButton.getAttribute('aria-pressed'), 'true');
assert.ok(nodes.minimapButton.classList.active.has('mode-active'));
assert.ok(shapes.some(node => node.tag === 'rect' && node.getAttribute('fill') === '#123456'));
assert.ok(Number(nodes['minimap-viewport'].getAttribute('width')) >= 4);

controller.attach();
controller.attach();
assert.equal(wrap.listenerCount('wheel'), 1, '뷰포트 이벤트는 중복 등록하면 안 됩니다');
let prevented = 0;
state.zoom = 1;
wrap.emit('wheel', { ctrlKey: false, metaKey: false, deltaY: -1, preventDefault: () => { prevented += 1; } });
assert.equal(state.zoom, 1);
wrap.emit('wheel', { ctrlKey: true, metaKey: false, deltaY: -1, preventDefault: () => { prevented += 1; } });
assert.equal(prevented, 1);
assert.equal(state.zoom, 1.1);

wrap.scrollLeft = 100;
wrap.scrollTop = 50;
svg.emit('mousedown', { button: 1, clientX: 10, clientY: 20, preventDefault: () => { prevented += 1; } });
eventRoot.emit('mousemove', { clientX: 15, clientY: 26 });
assert.equal(wrap.scrollLeft, 95);
assert.equal(wrap.scrollTop, 44);
eventRoot.emit('mouseup', { button: 1 });
eventRoot.emit('mousemove', { clientX: 30, clientY: 40 });
assert.equal(wrap.scrollLeft, 95, '팬 종료 후에는 스크롤을 변경하면 안 됩니다');

bbox = null;
assert.equal(controller.fitToWindow(), false);
assert.deepEqual(statuses, ['맞춤 표시할 요소가 없습니다']);
bbox = { x: 100, y: 100, w: 800, h: 400 };
assert.equal(controller.fitToWindow(), true);
assert.equal(state.zoom, 0.555);

controller.detach();
controller.detach();
assert.equal(wrap.listenerCount('wheel'), 0);
assert.equal(svg.listenerCount('mousedown'), 0);
assert.equal(eventRoot.listenerCount('mousemove'), 0);

console.log('viewport controller tests: ok');
