'use strict';

const assert = require('node:assert/strict');
const { fragmentOperandLayout } = require('../sequence-layout.js');
const { create, elementFamily, FAMILY_KINDS } = require('../element-renderer.js');

function node(tag = 'root', attrs = {}) {
  return {
    tag,
    attrs: { ...attrs },
    children: [],
    textContent: '',
    setAttribute(name, value) { this.attrs[name] = value; },
  };
}

function append(tag, attrs, parent) {
  const child = node(tag, attrs);
  parent.children.push(child);
  return child;
}

function addText(parent, value, x, y, options = {}) {
  const child = node('text', { value, x, y, ...options });
  child.textContent = value;
  parent.children.push(child);
  return child;
}

let diagram = { type: 'class', elements: [], relations: [] };
const dependencies = {
  el: append,
  text: addText,
  measureText: value => String(value).length * 7,
  currentDiagram: () => diagram,
  isMessage: kind => kind?.startsWith('msg-'),
  sequenceBottom: () => 540,
  fragmentOperandLayout,
  packageElementTitle: element => element.name,
  compositePortDirection: () => ({ x: 1, y: 0 }),
  byId: id => diagram.elements.find(element => element.id === id),
  childViews: parentId => diagram.elements.filter(element => element.parentId === parentId),
  timingConstraintAnchor: () => ({ x: 180, y: 120 }),
  referencedInteraction: element => element.referencedDiagram || null,
  referencedInteractionName: element => element.referencedDiagram?.name || 'Missing Interaction',
};

const renderer = create(dependencies);
const base = (kind, model = {}) => ({
  id: `${kind}-1`, kind, name: kind, x: 20, y: 30, w: 160, h: 80,
  _m: model,
});
const render = element => {
  const root = node();
  const group = renderer.draw(root, element);
  return { root, group };
};

assert.throws(() => create({}), /요소 렌더러 의존성이 없습니다/);
assert.ok(Object.isFrozen(renderer));
assert.ok(Object.isFrozen(FAMILY_KINDS));
assert.ok(Object.values(FAMILY_KINDS).every(Object.isFrozen));
assert.equal(renderer.draw(node(), null), undefined);
assert.equal(renderer.draw(node(), { kind: 'class' }), undefined);

assert.equal(elementFamily('note'), 'structure');
assert.equal(elementFamily('action'), 'activity');
assert.equal(elementFamily('state'), 'state');
assert.equal(elementFamily('lifeline'), 'interaction');
assert.equal(elementFamily('entity'), 'runtime');
assert.equal(elementFamily('class'), 'classifier');
assert.equal(new Set(Object.values(FAMILY_KINDS).flat()).size,
  Object.values(FAMILY_KINDS).flat().length,
  '요소 종류는 하나의 렌더러 계열에만 속해야 합니다');

const note = render(base('note', { lines: ['first', 'second'] })).group;
assert.equal(note.attrs['data-id'], 'note-1');
assert.equal(note.attrs['data-element-family'], 'structure');
assert.equal(note.children.filter(child => child.tag === 'path').length, 2);
assert.deepEqual(note.children.filter(child => child.tag === 'text').map(child => child.attrs.value),
  ['first', 'second']);

const port = render({
  ...base('port', { title: 'api' }),
  w: 20, h: 20, providedInterfaceModelId: 'provided', requiredInterfaceModelId: 'required',
}).group;
assert.ok(port.children.some(child => child.tag === 'circle'), '제공 인터페이스 롤리팝을 그려야 합니다');
assert.ok(port.children.some(child => child.tag === 'path'), '요구 인터페이스 소켓을 그려야 합니다');

const action = render(base('action')).group;
assert.equal(action.children[0].tag, 'rect');
assert.equal(action.children[0].attrs.rx, 11);
assert.equal(action.children[1].attrs.value, 'action');

const state = render(base('state', {
  headH: 28, behaviors: ['entry / load()', 'exit / save()'],
})).group;
assert.ok(state.children.some(child => child.tag === 'line'));
assert.deepEqual(state.children.filter(child => child.tag === 'text').map(child => child.attrs.value),
  ['state', 'entry / load()', 'exit / save()']);

diagram = { type: 'sequence', elements: [], relations: [] };
const lifeline = render(base('lifeline', { stereo: '', title: 'renderer:Service' })).group;
assert.equal(lifeline.attrs['data-quick-edit'], 'lifeline-name');
assert.ok(lifeline.children.some(child =>
  child.tag === 'line' && child.attrs['stroke-dasharray'] === '6 5' && child.attrs.y2 === 540));
assert.ok(lifeline.children.some(child => child.tag === 'line' && child.attrs.stroke === '#24231f'),
  '인스턴스 이름 밑줄을 그려야 합니다');

diagram = { type: 'timing', elements: [], relations: [] };
const timeConstraint = render({
  ...base('timeconstraint'), constraint: '{t < 20ms}', constrainedViewId: 'segment', anchorRatio: 0.5,
}).group;
assert.equal(timeConstraint.children[0].attrs.x2, 180);
assert.equal(timeConstraint.children.at(-1).attrs.value, '{t < 20ms}');

diagram = { type: 'erd', elements: [], relations: [] };
const entity = render(base('entity', {
  headH: 24, primaryTitle: 'Order', secondaryTitle: 'orders', RH: 18,
  cols: [{ flags: ['PK', 'FK'], logical: '주문 ID', phys: 'order_id', type: 'UUID' }],
  showLog: true, showType: true, showPhys: true, xLog: 48, xType: 104, xPhys: 130,
})).group;
assert.equal(entity.children[0].attrs.stroke, '#943126');
assert.equal(entity.children.filter(child => child.tag === 'g').length, 2,
  'PK와 FK 배지를 각각 렌더링해야 합니다');
assert.ok(entity.children.some(child => child.tag === 'rect' && child.attrs['data-erd-column-index'] === 0));

diagram = { type: 'class', elements: [], relations: [] };
const classifier = render(base('class', {
  title: 'CanvasView', stereo: '«controller»', headH: 34,
  attrs: ['- id: UUID'], ops: ['+ render()'], receptions: [],
  showAttrs: true, showOps: true, showReceptions: false,
  aH: 24, oH: 24, hasIcon: false,
})).group;
assert.equal(classifier.children[0].tag, 'rect');
assert.equal(classifier.attrs['data-element-family'], 'classifier');
assert.deepEqual(classifier.children.filter(child => child.tag === 'text').map(child => child.attrs.value),
  ['«controller»', 'CanvasView', '- id: UUID', '+ render()']);
assert.equal(classifier.children.filter(child => child.tag === 'line').length, 2);

const iconClassifier = render(base('class', {
  title: 'IconClass', stereo: '', headH: 60,
  attrs: [], ops: [], receptions: [], showAttrs: false, showOps: false, showReceptions: false,
  hasIcon: true,
  icon: {
    valid: true, width: 10, height: 10,
    commands: [{ op: 'l', values: [0, 0, 10, 10], style: { fill: 'none', line: '#123', width: 1, alpha: 1, pattern: [] } }],
  },
})).group;
assert.ok(iconClassifier.children.some(child => child.tag === 'g' && child.attrs.transform));

console.log('element renderer tests: ok');
