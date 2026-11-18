'use strict';

const assert = require('node:assert/strict');
const {
  REQUIRED_FUNCTIONS,
  REQUIRED_VALUES,
  canvasPoint,
  marqueeElementIds,
  create,
} = require('../dist/browser/canvas/canvas-interaction.js');

function fakeEventTarget(rect = { left: 0, top: 0 }) {
  const listeners = new Map();
  return {
    addEventListener(type, listener) {
      const handlers = listeners.get(type) || [];
      handlers.push(listener);
      listeners.set(type, handlers);
    },
    removeEventListener(type, listener) {
      const handlers = listeners.get(type) || [];
      listeners.set(type, handlers.filter(handler => handler !== listener));
    },
    getBoundingClientRect: () => rect,
    listenerCount: type => (listeners.get(type) || []).length,
    emit(type, event) {
      (listeners.get(type) || []).forEach(listener => listener(event));
    },
  };
}

const svg = fakeEventTarget({ left: 20, top: 10 });
assert.deepEqual(canvasPoint({ clientX: 70, clientY: 50 }, svg, 2), { x: 25, y: 20 });
assert.deepEqual(canvasPoint({ clientX: 70, clientY: 50 }, svg, 0), { x: 50, y: 40 });

const elements = [
  { id: 'inside', kind: 'class', x: 15, y: 15, w: 20, h: 20 },
  { id: 'crossing', kind: 'class', x: 35, y: 35, w: 20, h: 20 },
  { id: 'frame-crossing', kind: 'boundary', x: 35, y: 35, w: 20, h: 20 },
  { id: 'frame-inside', kind: 'fragment', x: 12, y: 12, w: 20, h: 20 },
  { id: 'outside', kind: 'class', x: 80, y: 80, w: 10, h: 10 },
];
assert.deepEqual(
  marqueeElementIds({ x0: 40, y0: 40, x1: 10, y1: 10 }, elements),
  ['inside', 'crossing', 'frame-inside'],
  '프레임형 요소는 완전히 포함될 때만, 일반 요소는 교차할 때 선택해야 합니다',
);

assert.throws(() => create(), /dependencies are required/);
assert.throws(() => create({}), /canvas event target/);

const root = fakeEventTarget();
const dependencies = {
  svg,
  eventRoot: root,
  state: { zoom: 1 },
  ...Object.fromEntries(REQUIRED_FUNCTIONS.map(name => [name, () => undefined])),
  ...Object.fromEntries(REQUIRED_VALUES.map(name => [name, {}])),
  /* 요소 배치는 별도 모듈이 맡고, 이 모듈은 위임만 한다 */
  elementPlacement: { placeElementForTool: () => undefined },
};
const controller = create(dependencies);
assert.ok(Object.isFrozen(controller));
controller.attach();
controller.attach();
assert.equal(svg.listenerCount('mousedown'), 1, '중복 attach는 리스너를 중복 등록하지 않아야 합니다');
assert.equal(root.listenerCount('mousemove'), 1);
assert.equal(root.listenerCount('mouseup'), 1);

dependencies.state.tool = 'select';
root.emit('mousemove', { clientX: 60, clientY: 50, target: svg });
assert.equal(controller.state().hoveredMessageId, null, '캔버스를 그리기 전에는 메시지를 찾지 않습니다');

controller.setLinking({ fromId: 'source', x: 10, y: 20, armed: false });
assert.equal(controller.getLinking().fromId, 'source');
assert.equal(controller.state().linking.x, 10);
controller.cancel();
assert.deepEqual(controller.state(), { drag: null, linking: null, marquee: null, hoveredMessageId: null });

controller.detach();
controller.detach();
assert.equal(svg.listenerCount('mousedown'), 0);
assert.equal(root.listenerCount('mousemove'), 0);
assert.equal(root.listenerCount('mouseup'), 0);

/* ── 드래그 중 그리기는 프레임당 한 번으로 합쳐진다 ────────────
   고성능 마우스는 한 프레임에 여러 mousemove를 보낸다. 이벤트마다 캔버스를
   통째로 다시 그리면 600개짜리 다이어그램에서 이벤트 하나가 ~30ms를 먹어
   드래그가 포인터를 따라오지 못한다. */
{
  const frames = [];
  const renders = [];
  const linkingSvg = fakeEventTarget({ left: 0, top: 0 });
  const linkingRoot = fakeEventTarget();
  let cancelled = 0;
  const coalescing = create({
    ...dependencies,
    svg: linkingSvg,
    eventRoot: linkingRoot,
    render: () => { renders.push('render'); },
    requestAnimationFrame: callback => { frames.push(callback); return frames.length; },
    cancelAnimationFrame: () => { cancelled += 1; },
    svgPoint: event => ({ x: event.clientX || 0, y: event.clientY || 0 }),
  });
  coalescing.attach();
  coalescing.setLinking({ fromId: 'source', x: 0, y: 0, armed: false });

  for (let index = 1; index <= 10; index += 1) {
    linkingRoot.emit('mousemove', { clientX: index * 4, clientY: index * 3 });
  }
  assert.equal(renders.length, 0, '이벤트 처리 중에는 그리지 않습니다');
  assert.equal(frames.length, 1, '한 프레임에 몰린 이벤트는 한 번만 예약해야 합니다');
  assert.equal(coalescing.getLinking().x, 40, '모델 상태는 이벤트마다 정확히 따라갑니다');

  frames.shift()();
  assert.equal(renders.length, 1);

  linkingRoot.emit('mousemove', { clientX: 99, clientY: 99 });
  assert.equal(frames.length, 1, '프레임이 지나간 뒤에는 다시 예약합니다');

  coalescing.detach();
  assert.equal(cancelled, 1, '남은 프레임은 detach에서 취소해야 합니다');
}

console.log('canvas interaction tests: ok');
