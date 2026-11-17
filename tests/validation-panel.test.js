'use strict';

const assert = require('node:assert/strict');
const {
  REQUIRED_FUNCTIONS,
  REQUIRED_VALUES,
  create,
} = require('../dist/browser/editor/validation-panel.js');

function fakeNode(tagName = 'div') {
  const listeners = new Map();
  const attributes = new Map();
  const classes = new Set();
  let text = '';
  return {
    tagName: tagName.toUpperCase(),
    children: [],
    className: '',
    hidden: false,
    tabIndex: -1,
    classList: {
      contains: name => classes.has(name),
      toggle(name, force) {
        if (force === undefined ? !classes.has(name) : force) classes.add(name);
        else classes.delete(name);
      },
    },
    append(...children) { this.children.push(...children); },
    appendChild(child) { this.children.push(child); return child; },
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
    setAttribute(name, value) { attributes.set(name, String(value)); },
    getAttribute(name) { return attributes.get(name); },
    get textContent() { return text; },
    set textContent(value) {
      text = String(value);
      if (value === '') this.children = [];
    },
  };
}

function harness() {
  const validationPanel = fakeNode();
  validationPanel.hidden = true;
  const validationSummary = fakeNode();
  const validationResults = fakeNode();
  const rerunButton = fakeNode('button');
  const closeButton = fakeNode('button');
  const wrap = { clientWidth: 100, clientHeight: 80, scrollLeft: 0, scrollTop: 0 };
  const diagram = {
    id: 'diagram-1',
    elements: [{ id: 'element-1', kind: 'class', x: 100, y: 200, w: 40, h: 60 }],
    relations: [
      { id: 'binding-1', kind: 'bindingconnector' },
      { id: 'comm-1', kind: 'comm-forward' },
      { id: 'message-1', kind: 'msg-call' },
      { id: 'association-1', kind: 'association' },
    ],
  };
  const state = {
    activeId: diagram.id,
    diagrams: [diagram],
    models: { 'model-1': { id: 'model-1' } },
    tool: 'association',
    validationStale: false,
    zoom: 2,
  };
  const log = {
    cleared: 0,
    communicationPoints: 0,
    endpointPoints: 0,
    flashed: [],
    messagePoints: 0,
    rendered: 0,
    selected: [],
    validated: [],
  };
  let nextIssues = [];
  const activeDiagram = () => state.diagrams.find(candidate => candidate.id === state.activeId);
  const dependencies = {
    bindingRoute: relation => relation.id === 'binding-1'
      ? { points: [{ x: 10, y: 20 }, { x: 70, y: 100 }] }
      : null,
    byId: id => activeDiagram()?.elements.find(element => element.id === id),
    clearLinking: () => { log.cleared += 1; },
    communicationMessagePoints: () => {
      log.communicationPoints += 1;
      return { p1: { x: 30, y: 40 }, p2: { x: 90, y: 120 } };
    },
    flashStatus: message => { log.flashed.push(message); },
    isCommMsg: kind => kind.startsWith('comm-'),
    isMsg: kind => kind.startsWith('msg-'),
    msgPoints: () => {
      log.messagePoints += 1;
      return { p1: { x: 40, y: 50 }, p2: { x: 100, y: 130 } };
    },
    polylineMidpoint: () => ({ x: 40, y: 60 }),
    relById: id => activeDiagram()?.relations.find(relation => relation.id === id),
    relEndpoints: () => {
      log.endpointPoints += 1;
      return { p1: { x: 50, y: 60 }, p2: { x: 110, y: 140 } };
    },
    renderAll: () => { log.rendered += 1; },
    setSelection: ids => { log.selected.push(ids); },
    validateProject: project => {
      log.validated.push(project);
      return nextIssues.map(item => ({ ...item }));
    },
    closeButton,
    document: { createElement: tagName => fakeNode(tagName) },
    rerunButton,
    state,
    validationPanel,
    validationResults,
    validationSummary,
    wrap,
  };
  return {
    closeButton,
    controller: create(dependencies),
    dependencies,
    diagram,
    log,
    rerunButton,
    setIssues: value => { nextIssues = value; },
    state,
    validationPanel,
    validationResults,
    validationSummary,
    wrap,
  };
}

const issue = (severity, code, viewId = 'element-1') => ({
  severity,
  code,
  message: `${code} message`,
  diagramId: 'diagram-1',
  diagramName: 'Class Diagram',
  modelName: 'Customer',
  viewId,
});

assert.ok(Object.isFrozen(REQUIRED_FUNCTIONS));
assert.ok(Object.isFrozen(REQUIRED_VALUES));
assert.throws(() => create(), /Validation Panel 의존성이 없습니다:.*bindingRoute/);
{
  const h = harness();
  assert.ok(Object.isFrozen(h.controller));
  assert.throws(() => create({ ...h.dependencies, state: 'invalid' }), /state\.object/);
  assert.throws(() => create({ ...h.dependencies, document: {} }), /document\.createElement/);
  assert.throws(() => create({ ...h.dependencies, rerunButton: {} }), /rerunButton\.addEventListener/);
  assert.throws(() => create({ ...h.dependencies, validationResults: {} }), /validationResults\.appendChild/);
  assert.throws(() => create({ ...h.dependencies, validationSummary: {} }), /validationSummary\.classList\.toggle/);
}

{
  const h = harness();
  h.controller.attach();
  h.controller.attach();
  assert.equal(h.rerunButton.listenerCount('click'), 1);
  assert.equal(h.closeButton.listenerCount('click'), 1);

  h.state.validationStale = true;
  h.controller.updateSummary();
  assert.equal(h.validationSummary.textContent, '프로젝트가 변경되었습니다. 다시 검사하세요.');
  assert.equal(h.validationSummary.classList.contains('validation-stale'), true);

  h.setIssues([
    issue('error', 'UML001'),
    issue('warning', 'UML002'),
    issue('info', 'PRJ001'),
  ]);
  h.rerunButton.emit('click');
  assert.equal(h.state.validationStale, false);
  assert.equal(h.validationPanel.hidden, false);
  assert.equal(h.validationResults.children.length, 3);
  assert.equal(h.validationSummary.textContent, '1 errors · 1 warnings · 1 info');
  assert.equal(h.validationSummary.classList.contains('validation-stale'), false);
  assert.deepEqual(h.log.validated[0], { models: h.state.models, diagrams: h.state.diagrams });
  assert.deepEqual(h.log.flashed, ['검증 완료 · 오류 1 · 경고 1']);
  assert.equal(h.controller.hasIssues(), true);
  assert.equal(h.controller.isVisible(), true);

  const copied = h.controller.getIssues();
  copied[0].code = 'CHANGED';
  assert.equal(h.controller.getIssues()[0].code, 'UML001', '검증 결과 상태를 외부에서 변경할 수 없어야 합니다');

  const row = h.validationResults.children[0];
  assert.equal(row.tabIndex, 0);
  assert.equal(row.getAttribute('role'), 'button');
  assert.equal(row.getAttribute('aria-label'), 'UML001 UML001 message');
  row.emit('keydown', { key: 'Escape', preventDefault: () => assert.fail('Escape는 처리하면 안 됩니다') });
  let prevented = 0;
  row.emit('keydown', { key: ' ', preventDefault: () => { prevented += 1; } });
  assert.equal(prevented, 1, 'Space 키 탐색은 페이지 스크롤을 막아야 합니다');
  assert.deepEqual(h.log.selected.at(-1), ['element-1']);
  assert.equal(h.state.tool, 'select');
  assert.equal(h.wrap.scrollLeft, 190);
  assert.equal(h.wrap.scrollTop, 420);
  row.emit('keydown', { key: 'Enter', preventDefault: () => { prevented += 1; } });
  row.emit('click');
  assert.equal(h.log.cleared, 3);
  assert.equal(h.log.rendered, 3);

  h.closeButton.emit('click');
  assert.equal(h.validationPanel.hidden, true);
  h.controller.toggle();
  assert.equal(h.validationPanel.hidden, false, '기존 결과가 있으면 검사 없이 표시만 전환해야 합니다');
  assert.equal(h.log.validated.length, 1);

  h.controller.detach();
  h.controller.detach();
  assert.equal(h.rerunButton.listenerCount('click'), 0);
  assert.equal(h.closeButton.listenerCount('click'), 0);
}

{
  const h = harness();
  h.controller.toggle();
  assert.equal(h.log.validated.length, 1, '결과가 없고 닫힌 패널을 열면 즉시 검사해야 합니다');
  assert.equal(h.validationPanel.hidden, false);
  assert.equal(h.validationResults.children.length, 1);
  assert.equal(h.validationResults.children[0].className, 'validation-empty');
  assert.equal(h.validationSummary.textContent, '문제가 없습니다.');
  assert.deepEqual(h.log.flashed, ['검증 완료 · 문제가 없습니다']);

  h.controller.clear();
  assert.equal(h.validationPanel.hidden, true);
  assert.equal(h.controller.hasIssues(), false);
  assert.deepEqual(h.controller.getIssues(), []);
  assert.equal(h.validationResults.children.length, 0);
}

{
  const h = harness();
  assert.equal(h.controller.navigateToIssue({ diagramId: 'missing', viewId: 'none' }), false);
  assert.equal(h.log.rendered, 0);

  assert.equal(h.controller.navigateToIssue(issue('error', 'PRJ002', 'missing-view')), true);
  assert.deepEqual(h.log.selected.at(-1), []);

  h.controller.navigateToIssue(issue('error', 'PAR024', 'binding-1'));
  assert.equal(h.wrap.scrollLeft, 30);
  assert.equal(h.wrap.scrollTop, 80);

  h.controller.navigateToIssue(issue('warning', 'SEQ001', 'comm-1'));
  assert.equal(h.log.communicationPoints, 1);
  assert.equal(h.wrap.scrollLeft, 70);
  assert.equal(h.wrap.scrollTop, 120);

  h.controller.navigateToIssue(issue('warning', 'SEQ002', 'message-1'));
  assert.equal(h.log.messagePoints, 1);
  assert.equal(h.wrap.scrollLeft, 90);
  assert.equal(h.wrap.scrollTop, 140);

  h.controller.navigateToIssue(issue('error', 'UML003', 'association-1'));
  assert.equal(h.log.endpointPoints, 1);
  assert.equal(h.wrap.scrollLeft, 110);
  assert.equal(h.wrap.scrollTop, 160);
}

console.log('validation panel tests: ok');
