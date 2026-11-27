'use strict';

const assert = require('node:assert/strict');
const { fragmentOperandLayout } = require('../dist/browser/canvas/sequence-layout.js');
const {
  REQUIRED_FUNCTIONS,
  REQUIRED_VALUES,
  RENDER_STYLE,
  create,
} = require('../dist/browser/canvas/canvas-renderer.js');

class FakeNode {
  constructor(tag) {
    this.tag = tag;
    this.attrs = {};
    this.children = [];
    this.listeners = {};
    this.style = {};
    this._text = '';
    this._html = '';
  }
  get textContent() { return this._text; }
  set textContent(value) { this._text = value; this.children = []; }
  get innerHTML() { return this._html; }
  set innerHTML(value) { this._html = value; this.children = []; }
  setAttribute(name, value) { this.attrs[name] = value; }
  getAttribute(name) { return this.attrs[name]; }
  appendChild(child) { this.children.push(child); return child; }
  addEventListener(type, fn) { (this.listeners[type] = this.listeners[type] || []).push(fn); }
  click() { (this.listeners.click || []).forEach(fn => fn()); }
}

const el = (tag, attrs, parent) => {
  const node = new FakeNode(tag);
  for (const k in attrs) node.setAttribute(k, attrs[k]);
  if (parent) parent.appendChild(node);
  return node;
};

const walk = (node, out = []) => {
  out.push(node);
  node.children.forEach(child => walk(child, out));
  return out;
};
const findAll = (node, predicate) => walk(node).filter(predicate);
const byTag = (node, tag) => findAll(node, n => n.tag === tag);

const element = (id, kind, extra = {}) => ({ id, kind, x: 0, y: 0, w: 100, h: 60, ...extra });
const relation = (id, kind, extra = {}) => ({ id, kind, name: '', ...extra });
const straight = (x1, y1, x2, y2) => ({ p1: { x: x1, y: y1 }, p2: { x: x2, y: y2 } });
const curve = () => ({ p1: { x: 0, y: 0 }, c1: { x: 5, y: 5 }, c2: { x: 9, y: 5 }, p2: { x: 10, y: 0 } });

function harness(overrides = {}) {
  const diagram = overrides.diagram || { id: 'd1', type: 'class', elements: [], relations: [] };
  const calls = [];
  const record = name => (...args) => { calls.push({ name, args }); };
  let seqBars = overrides.seqBars || [];
  let seqNumbers = { m1: '1' };
  const holders = {
    seqopts: new FakeNode('div'),
    erdmode: new FakeNode('div'),
  };
  const svg = new FakeNode('svg');
  const state = {
    zoom: 1,
    selection: [],
    selectedId: null,
    ...overrides.state,
  };
  const document = {
    getElementById: id => (id in holders ? holders[id] : null),
    createElement: tag => new FakeNode(tag),
  };
  const deps = {
    assignTemporalDepths: intervals => intervals.map((interval, index) => ({ ...interval, depth: index })),
    bindingRoute: r => r.route || null,
    bindingWaypoints: r => r.waypoints || [],
    branchGeom: r => r.branch || null,
    byId: id => diagram.elements.find(e => e.id === id) || null,
    center: view => ({ x: view.x + view.w / 2, y: view.y + view.h / 2 }),
    childViews: id => diagram.elements.filter(e => e.parentId === id),
    clearSequenceBars: () => { seqBars = []; calls.push({ name: 'clearSequenceBars', args: [] }); },
    clearSequenceNumbers: () => { seqNumbers = {}; calls.push({ name: 'clearSequenceNumbers', args: [] }); },
    communicationMessagePoints: r => r.communicationPoints || null,
    communicationSelfConnectorGeom: r => r.communicationCurve || null,
    computeBindingRoutes: record('computeBindingRoutes'),
    computeSeqNumbers: record('computeSeqNumbers'),
    computeSequenceLayout: record('computeSequenceLayout'),
    containmentDepth: view => view.depth || 0,
    dg: () => diagram,
    drawElement: (parent, view) => { calls.push({ name: 'drawElement', args: [view.id] }); },
    drawRelation: (parent, r) => { calls.push({ name: 'drawRelation', args: [r.id] }); },
    edgePoint: (from, _to) => ({ x: from.x, y: from.y }),
    el,
    erdMode: () => diagram.erdMode || 'physical',
    getSequenceBars: () => seqBars,
    interactionState: () => overrides.interaction || {},
    isCommMsg: kind => kind === 'comm-forward' || kind === 'comm-reverse',
    isMsg: kind => !!kind && kind.startsWith('msg-'),
    layoutActivityAttachments: record('layoutActivityAttachments'),
    layoutCompositePorts: record('layoutCompositePorts'),
    layoutCompositeRegions: record('layoutCompositeRegions'),
    layoutConnectionPointRefs: record('layoutConnectionPointRefs'),
    layoutParametricParameters: record('layoutParametricParameters'),
    layoutTimingDiagram: record('layoutTimingDiagram'),
    fragmentOperandLayout,
    measure: view => view._metrics || { headH: 20, RH: 16 },
    msgPoints: r => r.messagePoints || null,
    normalizeSize: record('normalizeSize'),
    polylineJumpPath: points => `P${points.length}`,
    relById: id => diagram.relations.find(r => r.id === id) || null,
    relEndpoints: r => r.endpoints || null,
    renderExplorer: record('renderExplorer'),
    renderMinimap: record('renderMinimap'),
    renderStatus: record('renderStatus'),
    renderTabs: record('renderTabs'),
    setErdMode: record('setErdMode'),
    snapshot: record('snapshot'),
    stateSelfTransitionGeom: r => r.stateCurve || null,
    ACTIVITY_PIN_KINDS: new Set(['inputpin', 'outputpin', 'expansioninput', 'expansionoutput']),
    CANVAS_H: 2000,
    CANVAS_W: 3000,
    DASH_SELECT: '4 3',
    ERD_VIEW_MODES: [['physical', '물리만'], ['logical', '논리만'], ['both', '논리 + 물리']],
    EXEC_NEST_OFFSET: 8,
    EXEC_WIDTH: 12,
    FILL_DEFAULT: '#fffbd8',
    STROKE: '#3d3a2e',
    document,
    state,
    svg,
    ...overrides.deps,
  };
  return {
    calls,
    deps,
    diagram,
    holders,
    renderer: create(deps),
    state,
    svg,
    getSeqBars: () => seqBars,
    getSeqNumbers: () => seqNumbers,
    named: name => calls.filter(c => c.name === name),
    selectionLayer() {
      const root = svg.children[svg.children.length - 1];
      return root.children[root.children.length - 1];
    },
    canvasRoot() { return svg.children[svg.children.length - 1]; },
  };
}

function selectionOf(overrides) {
  const h = harness(overrides);
  const g = new FakeNode('g');
  h.renderer.drawSelection(g);
  return { h, g, nodes: walk(g).slice(1) };
}

assert.ok(Object.isFrozen(REQUIRED_FUNCTIONS), 'REQUIRED_FUNCTIONS는 동결해야 합니다');
assert.ok(Object.isFrozen(REQUIRED_VALUES), 'REQUIRED_VALUES는 동결해야 합니다');
assert.ok(Object.isFrozen(RENDER_STYLE), 'RENDER_STYLE은 동결해야 합니다');
assert.ok(Object.isFrozen(harness().renderer), '컨트롤러는 동결해야 합니다');

assert.throws(() => create(), /Canvas Renderer 의존성이 없습니다/);
assert.throws(() => create({}), err => {
  REQUIRED_FUNCTIONS.forEach(name => assert.match(err.message, new RegExp(name)));
  REQUIRED_VALUES.forEach(name => assert.match(err.message, new RegExp(name)));
  return true;
});
{
  const { deps } = harness();
  const partial = { ...deps };
  delete partial.render;
  delete partial.drawElement;
  delete partial.state;
  assert.throws(() => create(partial), /Canvas Renderer 의존성이 없습니다: drawElement, state$/);
}
{
  const { deps } = harness();
  assert.throws(() => create({ ...deps, ACTIVITY_PIN_KINDS: ['inputpin'] }), /ACTIVITY_PIN_KINDS\.has/);
  assert.throws(() => create({ ...deps, document: { getElementById: () => null } }), /document\.createElement/);
}

{
  const { renderer } = harness();
  assert.equal(renderer.drawOrder('frame'), -3);
  assert.equal(renderer.drawOrder('compositestate'), -2);
  assert.equal(renderer.drawOrder('region'), -1);
  assert.equal(renderer.drawOrder('lifeline'), 0);
  assert.equal(renderer.drawOrder('execution'), 0.5);
  assert.equal(renderer.drawOrder('fragment'), 1);
  assert.equal(renderer.drawOrder('class'), 2);

  assert.equal(renderer.timingDrawOrder('lifeline'), -3);
  assert.equal(renderer.timingDrawOrder('timingstate'), -2);
  assert.equal(renderer.timingDrawOrder('timetick'), -1);
  assert.equal(renderer.timingDrawOrder('timesegment'), 1);
  assert.equal(renderer.timingDrawOrder('timeconstraint'), 2);
  assert.equal(renderer.timingDrawOrder('durationconstraint'), 2);
  assert.equal(renderer.timingDrawOrder('note'), 0);

  assert.equal(renderer.activityDrawOrder('swimlanev'), -4);
  assert.equal(renderer.activityDrawOrder('swimlaneh'), -4);
  assert.equal(renderer.activityDrawOrder('interruptibleregion'), -3);
  assert.equal(renderer.activityDrawOrder('structuredactivity'), -2);
  assert.equal(renderer.activityDrawOrder('expansionregion'), -2);
  assert.equal(renderer.activityDrawOrder('inputpin'), 2);
  assert.equal(renderer.activityDrawOrder('action'), 0);
}

{
  const diagram = {
    id: 'd1', type: 'sequence',
    elements: [
      element('msgbox', 'note'),
      element('e2', 'execution', { _depth: 1, y: 10 }),
      element('frag', 'fragment'),
      element('e1', 'execution', { _depth: 0, y: 90 }),
      element('life', 'lifeline'),
      element('e3', 'execution', { _depth: 1, y: 5 }),
    ],
    relations: [],
  };
  const { renderer } = harness({ diagram });
  assert.deepEqual(renderer.orderedElements(diagram).map(e => e.id),
    ['life', 'e1', 'e3', 'e2', 'frag', 'msgbox']);
}

{
  const diagram = {
    id: 'd1', type: 'state',
    elements: [element('s', 'state'), element('r', 'region'), element('f', 'frame'), element('c', 'compositestate')],
    relations: [],
  };
  const { renderer } = harness({ diagram });
  assert.deepEqual(renderer.orderedElements(diagram).map(e => e.id), ['f', 'c', 'r', 's']);
}

{
  const diagram = {
    id: 'd1', type: 'timing',
    elements: [
      element('seg', 'timesegment'),
      element('tickB', 'timetick', { depth: 2 }),
      element('life', 'lifeline'),
      element('tickA', 'timetick', { depth: 1 }),
      element('con', 'timeconstraint'),
    ],
    relations: [],
  };
  const { renderer } = harness({ diagram });
  assert.deepEqual(renderer.orderedElements(diagram).map(e => e.id),
    ['life', 'tickA', 'tickB', 'seg', 'con']);
}

{
  const diagram = {
    id: 'd1', type: 'activity',
    elements: [
      element('pin', 'inputpin'),
      element('act', 'action'),
      element('lane', 'swimlanev'),
      element('reg', 'interruptibleregion'),
      element('str', 'structuredactivity'),
    ],
    relations: [],
  };
  const { renderer } = harness({ diagram });
  assert.deepEqual(renderer.orderedElements(diagram).map(e => e.id),
    ['lane', 'reg', 'str', 'act', 'pin']);
}

['composite', 'bdd', 'ibd', 'parametric', 'package'].forEach(type => {
  const diagram = {
    id: 'd1', type,
    elements: [element('deep', 'part', { depth: 3 }), element('top', 'block', { depth: 0 }), element('mid', 'part', { depth: 1 })],
    relations: [],
  };
  const { renderer } = harness({ diagram });
  assert.deepEqual(renderer.orderedElements(diagram).map(e => e.id), ['top', 'mid', 'deep'],
    `${type} 다이어그램은 포함 깊이 순서로 그려야 합니다`);
});

{
  const diagram = {
    id: 'd1', type: 'class',
    elements: [element('b', 'class'), element('a', 'class')],
    relations: [],
  };
  const { renderer } = harness({ diagram });
  assert.equal(renderer.orderedElements(diagram), diagram.elements);
}

{
  const h = harness({ diagram: { id: 'd1', type: 'state', elements: [element('a', 'state')], relations: [] } });
  h.renderer.render();
  assert.equal(h.named('layoutCompositeRegions').length, 1);
  assert.equal(h.named('layoutConnectionPointRefs').length, 1);
  assert.equal(h.named('normalizeSize').length, 1);
  assert.equal(h.named('computeBindingRoutes').length, 1);
  assert.equal(h.named('clearSequenceBars').length, 1);
  assert.equal(h.named('clearSequenceNumbers').length, 1);
  assert.deepEqual(h.getSeqNumbers(), {}, 'sequence 계열이 아니면 메시지 번호를 비워야 합니다');
}

['composite', 'bdd', 'ibd'].forEach(type => {
  const h = harness({ diagram: { id: 'd1', type, elements: [], relations: [] } });
  h.renderer.render();
  assert.equal(h.named('layoutCompositePorts').length, 1, `${type}는 포트 레이아웃을 실행해야 합니다`);
});

{
  const h = harness({ diagram: { id: 'd1', type: 'parametric', elements: [], relations: [] } });
  h.renderer.render();
  assert.equal(h.named('layoutParametricParameters').length, 1);
}
{
  const h = harness({ diagram: { id: 'd1', type: 'activity', elements: [], relations: [] } });
  h.renderer.render();
  assert.equal(h.named('layoutActivityAttachments').length, 1);
}
{
  const h = harness({ diagram: { id: 'd1', type: 'timing', elements: [], relations: [] } });
  h.renderer.render();
  assert.equal(h.named('layoutTimingDiagram').length, 1);
}

{
  const life = element('life', 'lifeline', { x: 100, w: 40 });
  const exec1 = element('x1', 'execution', { y: 10, h: 40, lifeId: 'life' });
  const exec2 = element('x2', 'execution', { y: 20, h: 40, lifeId: 'life' });
  const orphan = element('x3', 'execution', { y: 30, h: 10, lifeId: 'missing' });
  const h = harness({ diagram: { id: 'd1', type: 'sequence', elements: [life, exec1, exec2, orphan], relations: [] } });
  h.renderer.render();
  assert.equal(exec1._depth, 0);
  assert.equal(exec1.x, 100 + 20 - 6 + 0);
  assert.equal(exec2._depth, 1);
  assert.equal(exec2.x, 100 + 20 - 6 + 8);
  assert.equal(orphan.x, 0, '라이프라인이 없는 Execution은 그대로 둬야 합니다');
  assert.equal(h.named('computeSequenceLayout').length, 1);
  assert.equal(h.named('computeSeqNumbers').length, 1);
  assert.equal(h.named('clearSequenceBars').length, 0);
  assert.equal(h.named('clearSequenceNumbers').length, 0);
}

{
  const h = harness({
    diagram: { id: 'd1', type: 'communication', elements: [], relations: [] },
    seqBars: [{ el: 'life', y0: 0, y1: 10, depth: 0 }],
  });
  h.renderer.render();
  assert.equal(h.named('clearSequenceBars').length, 1);
  assert.equal(h.named('clearSequenceNumbers').length, 0);
  assert.equal(h.named('computeSeqNumbers').length, 1);
  assert.deepEqual(h.getSeqBars(), []);
}

{
  const diagram = {
    id: 'd1', type: 'class',
    elements: [element('a', 'class'), element('b', 'class')],
    relations: [relation('r1', 'assoc'), relation('r2', 'assoc')],
  };
  const h = harness({ diagram, state: { zoom: 1.5 } });
  h.renderer.render();

  assert.equal(h.svg.getAttribute('viewBox'), '0 0 3000 2000');
  assert.equal(h.svg.getAttribute('width'), '4500');
  assert.equal(h.svg.getAttribute('height'), '3000');

  const defs = byTag(h.svg, 'defs');
  assert.equal(defs.length, 1);
  assert.equal(byTag(defs[0], 'filter')[0].getAttribute('id'), 'shadow');
  assert.equal(byTag(defs[0], 'feDropShadow').length, 1);
  assert.equal(byTag(defs[0], 'pattern')[0].getAttribute('id'), 'grid');

  const root = h.canvasRoot();
  assert.equal(root.getAttribute('transform'), 'translate(0.5 0.5)');
  const backdrops = root.children.filter(n => n.tag === 'rect');
  assert.equal(backdrops.length, 2);
  assert.equal(backdrops[0].getAttribute('fill'), '#ffffff');
  assert.equal(backdrops[1].getAttribute('fill'), 'url(#grid)');

  const groups = root.children.filter(n => n.tag === 'g');
  assert.equal(groups.length, 3, '요소 · 관계 · 선택 레이어를 만들어야 합니다');
  assert.equal(groups[2].getAttribute('pointer-events'), 'none', '선택 레이어는 클릭을 가로채면 안 됩니다');

  assert.deepEqual(h.named('drawElement').map(c => c.args[0]), ['a', 'b']);
  assert.deepEqual(h.named('drawRelation').map(c => c.args[0]), ['r1', 'r2']);

  h.renderer.render();
  assert.equal(byTag(h.svg, 'defs').length, 1, '이전 프레임의 노드는 지워야 합니다');
}

{
  const elements = [element('db', 'database'), element('frame', 'boundary'), element('server', 'node')];
  const h = harness({ diagram: { type: 'deployment', elements, relations: [] } });
  h.renderer.render();
  assert.deepEqual(h.named('drawElement').map(c => c.args[0]), ['frame', 'db', 'server']);
  assert.deepEqual(elements.map(item => item.id), ['db', 'frame', 'server']);
}

{
  const h = harness();
  h.renderer.render();
  ['renderExplorer', 'renderStatus', 'renderTabs', 'renderMinimap'].forEach(name => {
    assert.equal(h.named(name).length, 1, `${name}은 프레임마다 한 번 호출해야 합니다`);
  });
}

{
  const life = element('life', 'lifeline', { x: 100, w: 40, fill: '#eef' });
  const h = harness({
    diagram: { id: 'd1', type: 'sequence', elements: [life], relations: [] },
    seqBars: [
      { el: 'life', y0: 20, y1: 80, depth: 1 },
      { el: 'life', y0: 0, y1: 2, depth: 0 },
      { el: 'life', y0: 0, y1: 10, depth: 0, manual: true },
      { el: 'gone', y0: 0, y1: 10, depth: 0 },
    ],
  });
  h.renderer.render();
  const root = h.canvasRoot();
  const gRel = root.children.filter(n => n.tag === 'g')[1];
  const bars = gRel.children;
  assert.equal(bars.length, 2, '수동 Execution과 사라진 라이프라인은 건너뛰어야 합니다');
  assert.equal(bars[0].getAttribute('x'), 100 + 20 - 6 + 8);
  assert.equal(bars[0].getAttribute('height'), 60);
  assert.equal(bars[0].getAttribute('fill'), '#eef');
  assert.equal(bars[0].getAttribute('stroke'), '#3d3a2e');
  assert.equal(bars[1].getAttribute('height'), 6, '아주 짧은 활성 구간도 최소 높이를 지켜야 합니다');
}

{
  const h = harness({
    diagram: { id: 'd1', type: 'sequence', elements: [element('life', 'lifeline', { x: 0, w: 40 })], relations: [] },
    seqBars: [{ el: 'life', y0: 0, y1: 30, depth: 0 }],
  });
  h.renderer.render();
  const gRel = h.canvasRoot().children.filter(n => n.tag === 'g')[1];
  assert.equal(gRel.children[0].getAttribute('fill'), '#fffbd8');
}

{
  const from = element('a', 'class', { x: 10, y: 20 });
  const h = harness({
    diagram: { id: 'd1', type: 'class', elements: [from], relations: [] },
    interaction: { linking: { fromId: 'a', x: 300, y: 400 } },
  });
  h.renderer.render();
  const line = h.canvasRoot().children.find(n => n.tag === 'line');
  assert.ok(line, '연결 중에는 미리보기 선을 그려야 합니다');
  assert.deepEqual([line.getAttribute('x1'), line.getAttribute('y1'), line.getAttribute('x2'), line.getAttribute('y2')],
    [10, 20, 300, 400]);
  assert.equal(line.getAttribute('stroke'), RENDER_STYLE.accent);
  assert.equal(line.getAttribute('pointer-events'), 'none');
}
{
  const h = harness({ interaction: { linking: { fromId: 'gone', x: 1, y: 2 } } });
  h.renderer.render();
  assert.equal(h.canvasRoot().children.filter(n => n.tag === 'line').length, 0,
    '사라진 요소에서 시작한 연결은 그리지 않아야 합니다');
}

{
  const h = harness({ interaction: { marquee: { x0: 90, y0: 80, x1: 30, y1: 20 } } });
  h.renderer.render();
  const rects = h.canvasRoot().children.filter(n => n.tag === 'rect');
  const marquee = rects[rects.length - 1];
  assert.deepEqual([marquee.getAttribute('x'), marquee.getAttribute('y')], [30, 20],
    '역방향 드래그도 정규화해야 합니다');
  assert.deepEqual([marquee.getAttribute('width'), marquee.getAttribute('height')], [60, 60]);
  assert.equal(marquee.getAttribute('pointer-events'), 'none');
}

{
  const entity = element('t', 'entity', { x: 200, y: 100, w: 160, _metrics: { headH: 24, RH: 18 } });
  const h = harness({
    diagram: { id: 'd1', type: 'erd', elements: [entity], relations: [] },
    interaction: { drag: { mode: 'erdcolumn', moved: true, entity, fromIndex: 0, targetIndex: 2 } },
  });
  h.renderer.render();
  const root = h.canvasRoot();
  const band = root.children.filter(n => n.tag === 'rect').pop();
  assert.equal(band.getAttribute('y'), 100 + 24 + 2 * 18);
  assert.equal(band.getAttribute('height'), 18);
  const line = root.children.find(n => n.tag === 'line');
  assert.equal(line.getAttribute('y1'), 100 + 24 + 3 * 18, '아래로 옮길 때는 대상 행 아래에 삽입선을 그려야 합니다');
  assert.equal(root.children.filter(n => n.tag === 'circle').length, 2);
}
{
  const entity = element('t', 'entity', { x: 0, y: 0, w: 100, _metrics: { headH: 10, RH: 20 } });
  const h = harness({
    diagram: { id: 'd1', type: 'erd', elements: [entity], relations: [] },
    interaction: { drag: { mode: 'erdcolumn', moved: true, entity, fromIndex: 3, targetIndex: 1 } },
  });
  h.renderer.render();
  const line = h.canvasRoot().children.find(n => n.tag === 'line');
  assert.equal(line.getAttribute('y1'), 10 + 1 * 20);
}
{
  const entity = element('t', 'entity');
  const h = harness({
    diagram: { id: 'd1', type: 'erd', elements: [entity], relations: [] },
    interaction: { drag: { mode: 'erdcolumn', moved: false, entity, fromIndex: 0, targetIndex: 1 } },
  });
  h.renderer.render();
  assert.equal(h.canvasRoot().children.filter(n => n.tag === 'line').length, 0);
}

{
  const target = element('t', 'class', { x: 50, y: 60, w: 80, h: 40 });
  const rel = relation('r1', 'assoc', { endpoints: straight(0, 0, 10, 10) });
  const h = harness({
    diagram: { id: 'd1', type: 'class', elements: [target], relations: [rel] },
    interaction: { drag: { mode: 'endpoint', rel, end: 'dst', hoverId: 't' } },
  });
  h.renderer.render();
  const root = h.canvasRoot();
  const ring = root.children.find(n => n.tag === 'circle');
  assert.deepEqual([ring.getAttribute('cx'), ring.getAttribute('cy')], [10, 10]);
  assert.equal(ring.getAttribute('r'), 8);
  const highlight = root.children.filter(n => n.tag === 'rect').pop();
  assert.deepEqual([highlight.getAttribute('x'), highlight.getAttribute('y')], [46, 56]);
  assert.deepEqual([highlight.getAttribute('width'), highlight.getAttribute('height')], [88, 48]);
  assert.equal(highlight.getAttribute('stroke'), RENDER_STYLE.reconnectTarget);
}
{
  const rel = relation('r1', 'mindbranch', { branch: { p1: { x: 1, y: 2 }, p2: { x: 3, y: 4 }, c: { x: 2, y: 3 } } });
  const h = harness({
    diagram: { id: 'd1', type: 'mindmap', elements: [], relations: [rel] },
    interaction: { drag: { mode: 'endpoint', rel, end: 'src' } },
  });
  h.renderer.render();
  const ring = h.canvasRoot().children.find(n => n.tag === 'circle');
  assert.deepEqual([ring.getAttribute('cx'), ring.getAttribute('cy')], [1, 2]);
}

{
  const { nodes } = selectionOf({
    diagram: {
      id: 'd1', type: 'class',
      elements: [element('a', 'class', { x: 10, y: 20 }), element('b', 'class', { x: 30, y: 40 })],
      relations: [],
    },
    state: { selection: ['a', 'b', 'gone'], selectedId: null },
  });
  assert.equal(nodes.length, 2, '사라진 id는 건너뛰고 핸들은 그리지 않아야 합니다');
  nodes.forEach(n => {
    assert.equal(n.tag, 'rect');
    assert.equal(n.getAttribute('fill'), 'none');
    assert.equal(n.getAttribute('stroke-dasharray'), '4 3');
  });
  assert.deepEqual([nodes[0].getAttribute('x'), nodes[0].getAttribute('y')], [7, 17]);
  assert.deepEqual([nodes[0].getAttribute('width'), nodes[0].getAttribute('height')], [106, 66]);
}

{
  const { nodes } = selectionOf({ state: { selection: [], selectedId: null } });
  assert.equal(nodes.length, 0, '선택이 없으면 아무것도 그리지 않아야 합니다');
}

{
  const { nodes } = selectionOf({
    diagram: { id: 'd1', type: 'class', elements: [element('a', 'class', { x: 0, y: 0, w: 100, h: 60 })], relations: [] },
    state: { selection: ['a'], selectedId: 'a' },
  });
  assert.equal(nodes.length, 9);
  const handles = nodes.slice(1);
  assert.deepEqual(handles.map(n => n.getAttribute('data-handle')),
    ['nw', 'n', 'ne', 'e', 'se', 's', 'sw', 'w']);
  handles.forEach(n => {
    assert.equal(n.getAttribute('width'), RENDER_STYLE.handleSize);
    assert.equal(n.getAttribute('pointer-events'), 'all');
    assert.equal(n.getAttribute('fill'), RENDER_STYLE.handleFill);
  });
  assert.equal(handles[0].getAttribute('cursor'), 'nwse-resize');
  assert.equal(handles[1].getAttribute('cursor'), 'ns-resize');
  assert.deepEqual([handles[0].getAttribute('x'), handles[0].getAttribute('y')], [-6.5, -6.5]);
  assert.deepEqual([handles[4].getAttribute('x'), handles[4].getAttribute('y')], [99.5, 59.5]);
}

['region', 'connectionpointref', 'port', 'inputpin', 'outputpin', 'expansioninput',
  'expansionoutput', 'timingstate', 'timetick', 'timeconstraint'].forEach(kind => {
  const { nodes } = selectionOf({
    diagram: { id: 'd1', type: 'state', elements: [element('a', kind)], relations: [] },
    state: { selection: ['a'], selectedId: 'a' },
  });
  assert.equal(nodes.length, 1, `${kind}은 부모가 배치하므로 크기 핸들이 없어야 합니다`);
});

{
  const { nodes } = selectionOf({
    diagram: { id: 'd1', type: 'timing', elements: [element('a', 'timesegment')], relations: [] },
    state: { selection: ['a'], selectedId: 'a' },
  });
  assert.deepEqual(nodes.slice(1).map(n => n.getAttribute('data-handle')), ['e', 'w']);
}

{
  const host = element('a', 'submachinestate', { x: 0, y: 0, w: 100, h: 60 });
  const ref = element('cp', 'connectionpointref', { parentId: 'a', x: 46, y: -8, w: 16, h: 16 });
  const { nodes } = selectionOf({
    diagram: { id: 'd1', type: 'state', elements: [host, ref], relations: [] },
    state: { selection: ['a'], selectedId: 'a' },
  });
  const dirs = nodes.slice(1).map(n => n.getAttribute('data-handle'));
  assert.ok(!dirs.includes('n'), '연결점 참조와 겹치는 핸들은 숨겨야 합니다');
  assert.equal(dirs.length, 7);
}

{
  const rel = relation('r1', 'assoc', { endpoints: straight(0, 0, 100, 0) });
  const { nodes } = selectionOf({
    diagram: { id: 'd1', type: 'class', elements: [], relations: [rel] },
    state: { selection: ['r1'], selectedId: 'r1' },
  });
  assert.equal(nodes.length, 5);
  assert.equal(nodes[0].tag, 'line');
  assert.equal(nodes[0].getAttribute('opacity'), RENDER_STYLE.highlightOpacity);
  assert.deepEqual(nodes.slice(1).map(n => n.getAttribute('data-endpoint')), ['src', 'src', 'dst', 'dst']);
  assert.equal(nodes[1].getAttribute('fill'), 'transparent');
  assert.equal(nodes[1].getAttribute('width'), RENDER_STYLE.endpointHitSize);
  assert.equal(nodes[2].getAttribute('width'), RENDER_STYLE.endpointHandleSize);
  assert.ok(nodes[1].getAttribute('width') > nodes[2].getAttribute('width'),
    '히트 영역은 시각적 핸들보다 넓어야 합니다');
  assert.equal(nodes[2].getAttribute('cursor'), 'crosshair');
}
{
  const { nodes } = selectionOf({
    diagram: { id: 'd1', type: 'class', elements: [], relations: [relation('r1', 'assoc')] },
    state: { selection: ['r1'], selectedId: 'r1' },
  });
  assert.equal(nodes.length, 0, '끝점을 계산할 수 없으면 아무것도 그리지 않아야 합니다');
}
{
  const { nodes } = selectionOf({ state: { selection: ['ghost'], selectedId: 'ghost' } });
  assert.equal(nodes.length, 0, '요소도 관계도 아닌 id는 무시해야 합니다');
}

{
  const rel = relation('r1', 'mindbranch', {
    branch: { p1: { x: 0, y: 0 }, c: { x: 5, y: 10 }, p2: { x: 10, y: 0 } },
  });
  const { nodes } = selectionOf({
    diagram: { id: 'd1', type: 'mindmap', elements: [], relations: [rel] },
    state: { selection: ['r1'], selectedId: 'r1' },
  });
  assert.equal(nodes[0].tag, 'path');
  assert.equal(nodes[0].getAttribute('d'), 'M 0 0 Q 5 10 10 0');
  assert.equal(nodes[0].getAttribute('stroke-width'), RENDER_STYLE.curveHighlightWidth);
  assert.equal(nodes.length, 5);
}
{
  const { nodes } = selectionOf({
    diagram: { id: 'd1', type: 'mindmap', elements: [], relations: [relation('r1', 'mindbranch')] },
    state: { selection: ['r1'], selectedId: 'r1' },
  });
  assert.equal(nodes.length, 0);
}

{
  const rel = relation('r1', 'commconnector', { communicationCurve: curve() });
  const { nodes } = selectionOf({
    diagram: { id: 'd1', type: 'communication', elements: [], relations: [rel] },
    state: { selection: ['r1'], selectedId: 'r1' },
  });
  assert.equal(nodes.length, 1);
  assert.equal(nodes[0].getAttribute('d'), 'M 0 0 C 5 5, 9 5, 10 0');
}

{
  const rel = relation('r1', 'transition', { stateCurve: curve() });
  const { nodes } = selectionOf({
    diagram: { id: 'd1', type: 'state', elements: [], relations: [rel] },
    state: { selection: ['r1'], selectedId: 'r1' },
  });
  assert.equal(nodes.length, 5);
  assert.equal(nodes[0].getAttribute('d'), 'M 0 0 C 5 5, 9 5, 10 0');
  assert.deepEqual(nodes.slice(1).map(n => n.getAttribute('data-endpoint')), ['src', 'src', 'dst', 'dst']);
}

{
  const points = [{ x: 0, y: 0 }, { x: 10, y: 0 }, { x: 10, y: 10 }];
  const auto = relation('r1', 'bindingconnector', { route: { points, jumpCrossings: [] } });
  const { nodes: autoNodes } = selectionOf({
    diagram: { id: 'd1', type: 'parametric', elements: [], relations: [auto] },
    state: { selection: ['r1'], selectedId: 'r1' },
  });
  assert.equal(autoNodes[0].getAttribute('d'), 'P3');
  assert.equal(autoNodes[0].getAttribute('stroke-linejoin'), 'round');
  assert.equal(autoNodes.length, 5, '자동 라우팅에는 경유점 핸들이 없어야 합니다');

  const manual = relation('r2', 'bindingconnector', {
    route: { points, jumpCrossings: [] },
    routeMode: 'manual',
    waypoints: [{ x: 10, y: 0 }, { x: 10, y: 5 }],
  });
  const { nodes: manualNodes } = selectionOf({
    diagram: { id: 'd1', type: 'parametric', elements: [], relations: [manual] },
    state: { selection: ['r2'], selectedId: 'r2' },
  });
  const routePoints = manualNodes.filter(n => n.getAttribute('data-route-point') !== undefined);
  assert.equal(routePoints.length, 4, '경유점마다 히트 영역과 핸들을 그려야 합니다');
  assert.deepEqual(routePoints.map(n => n.getAttribute('data-route-point')), [0, 0, 1, 1]);
  assert.equal(routePoints[0].getAttribute('fill'), 'transparent');
  assert.equal(routePoints[0].getAttribute('width'), RENDER_STYLE.routePointHitSize);
  assert.equal(routePoints[1].getAttribute('fill'), RENDER_STYLE.routePointFill);
  assert.equal(routePoints[1].getAttribute('cursor'), 'move');
}
{
  const rel = relation('r1', 'bindingconnector', { route: { points: [{ x: 0, y: 0 }], jumpCrossings: [] } });
  const { nodes } = selectionOf({
    diagram: { id: 'd1', type: 'parametric', elements: [], relations: [rel] },
    state: { selection: ['r1'], selectedId: 'r1' },
  });
  assert.equal(nodes.length, 0);
}

{
  const self = relation('r1', 'comm-forward', {
    communicationPoints: { self: true, startX: 20, y: 30, width: 40, height: 10 },
  });
  const { nodes: selfNodes } = selectionOf({
    diagram: { id: 'd1', type: 'communication', elements: [], relations: [self] },
    state: { selection: ['r1'], selectedId: 'r1' },
  });
  assert.equal(selfNodes.length, 1);
  assert.deepEqual([selfNodes[0].getAttribute('x'), selfNodes[0].getAttribute('y')], [16, 22]);
  assert.deepEqual([selfNodes[0].getAttribute('width'), selfNodes[0].getAttribute('height')], [52, 24]);

  const straightMsg = relation('r2', 'comm-reverse', { communicationPoints: straight(0, 0, 50, 0) });
  const { nodes: straightNodes } = selectionOf({
    diagram: { id: 'd1', type: 'communication', elements: [], relations: [straightMsg] },
    state: { selection: ['r2'], selectedId: 'r2' },
  });
  assert.equal(straightNodes.length, 1);
  assert.equal(straightNodes[0].tag, 'line');
  assert.equal(straightNodes[0].getAttribute('stroke-width'), RENDER_STYLE.highlightWidth);
}
{
  const rel = relation('r1', 'comm-forward');
  const { nodes } = selectionOf({
    diagram: { id: 'd1', type: 'communication', elements: [], relations: [rel] },
    state: { selection: ['r1'], selectedId: 'r1' },
  });
  assert.equal(nodes.length, 0);
}

{
  const self = relation('r1', 'msg-sync', { y: 100, messagePoints: { self: true, startX: 10, endX: 30, y: 100, width: 44, height: 20 } });
  const { nodes: selfNodes } = selectionOf({
    diagram: { id: 'd1', type: 'sequence', elements: [], relations: [self] },
    state: { tool: 'select', selection: ['r1'], selectedId: 'r1' },
  });
  assert.deepEqual(selfNodes.filter(node => node.getAttribute('data-message-action'))
    .map(node => node.getAttribute('data-message-action')), ['move', 'edit']);
  assert.deepEqual([selfNodes[0].getAttribute('x'), selfNodes[0].getAttribute('y')], [6, 92]);
  assert.deepEqual([selfNodes[0].getAttribute('width'), selfNodes[0].getAttribute('height')], [76, 34]);

  const straightMsg = relation('r2', 'msg-async', { messagePoints: straight(0, 10, 80, 10) });
  const { nodes: straightNodes } = selectionOf({
    diagram: { id: 'd1', type: 'sequence', elements: [], relations: [straightMsg] },
    state: { tool: 'select', selection: ['r2'], selectedId: 'r2' },
  });
  assert.equal(straightNodes[0].tag, 'line');
  const controls = straightNodes.filter(node => node.getAttribute('data-message-action'));
  assert.deepEqual(controls.map(node => node.getAttribute('data-message-action')), ['move', 'edit']);
  assert.ok(controls.every(node => node.getAttribute('data-message-id') === straightMsg.id));
}
{
  const { nodes } = selectionOf({
    diagram: { id: 'd1', type: 'sequence', elements: [], relations: [relation('r1', 'msg-sync')] },
    state: { selection: ['r1'], selectedId: 'r1' },
  });
  assert.equal(nodes.length, 0);
}

{
  const diagram = { id: 'd1', type: 'sequence', elements: [], relations: [] };
  const h = harness({ diagram });
  h.renderer.renderSeqOpts();
  const holder = h.holders.seqopts;
  assert.equal(holder.style.display, 'inline-flex');
  assert.equal(holder.children.length, 1);
  const button = holder.children[0];
  assert.equal(button.textContent, '메시지 번호');
  assert.equal(button.className, 'mode-active', '기본값은 번호 표시입니다');

  button.click();
  assert.equal(diagram.seqNumbers, false, '켜져 있던 번호는 꺼져야 합니다');
  assert.equal(h.named('snapshot').length, 1);
  assert.ok(h.named('renderStatus').length > 0, '토글은 캔버스를 다시 그려야 합니다');
  assert.equal(h.holders.seqopts.children.length, 1, '토글 후에도 버튼은 하나여야 합니다');
  assert.equal(h.holders.seqopts.children[0].className, undefined);

  h.holders.seqopts.children[0].click();
  assert.equal(diagram.seqNumbers, true, '다시 누르면 번호가 돌아와야 합니다');
}
{
  const h = harness({ diagram: { id: 'd1', type: 'communication', elements: [], relations: [] } });
  h.renderer.renderSeqOpts();
  assert.equal(h.holders.seqopts.style.display, 'inline-flex');
}
{
  const h = harness({ diagram: { id: 'd1', type: 'class', elements: [], relations: [] } });
  h.holders.seqopts.style.display = 'inline-flex';
  h.renderer.renderSeqOpts();
  assert.equal(h.holders.seqopts.style.display, 'none');
  assert.equal(h.holders.seqopts.innerHTML, '');
}
{
  const h = harness({ deps: { document: { getElementById: () => null, createElement: tag => new FakeNode(tag) } } });
  assert.doesNotThrow(() => h.renderer.renderSeqOpts());
}

{
  const diagram = { id: 'd1', type: 'erd', elements: [], relations: [], erdMode: 'logical' };
  const h = harness({ diagram });
  h.renderer.renderErdMode();
  const holder = h.holders.erdmode;
  assert.equal(holder.style.display, 'inline-flex');
  assert.equal(holder.getAttribute('role'), 'group');
  assert.equal(holder.getAttribute('aria-label'), 'ERD 표시 모드');
  assert.match(holder.innerHTML, /erd-mode-label/);
  assert.equal(holder.children.length, 3);
  assert.deepEqual(holder.children.map(b => b.textContent), ['물리만', '논리만', '논리 + 물리']);
  assert.deepEqual(holder.children.map(b => b.getAttribute('aria-pressed')), ['false', 'true', 'false']);
  assert.equal(holder.children[1].className, 'mode-active');
  assert.equal(holder.children[0].title, 'ERD 물리만 표시');

  holder.children[2].click();
  assert.deepEqual(h.named('setErdMode').map(c => c.args[0]), ['both']);
}
{
  const h = harness({ diagram: { id: 'd1', type: 'class', elements: [], relations: [] } });
  h.holders.erdmode.style.display = 'inline-flex';
  h.renderer.renderErdMode();
  assert.equal(h.holders.erdmode.style.display, 'none');
  assert.equal(h.holders.erdmode.innerHTML, '');
}

console.log('canvas renderer tests: ok');
