'use strict';

const assert = require('node:assert/strict');
const {
  REQUIRED_FUNCTIONS,
  REQUIRED_VALUES,
  create,
  toolIcon,
} = require('../toolbox.js');

function fakeNode(tagName = 'div') {
  const listeners = new Map();
  const attributes = new Map();
  let html = '';
  const node = {
    tagName: tagName.toUpperCase(),
    children: [],
    className: '',
    dataset: {},
    textContent: '',
    appendChild(child) { this.children.push(child); return child; },
    addEventListener(type, listener) { listeners.set(type, listener); },
    emit(type, event = {}) { listeners.get(type)?.(event); },
    setAttribute(name, value) { attributes.set(name, String(value)); },
    getAttribute(name) { return attributes.get(name) ?? null; },
    get innerHTML() { return html; },
    set innerHTML(value) {
      html = String(value);
      if (value === '') this.children = [];
    },
  };
  node.classList = {
    contains(value) { return node.className.split(/\s+/).includes(value); },
    toggle(value, force) {
      const values = new Set(node.className.split(/\s+/).filter(Boolean));
      if (force) values.add(value); else values.delete(value);
      node.className = [...values].join(' ');
    },
  };
  return node;
}

assert.ok(Object.isFrozen(REQUIRED_FUNCTIONS));
assert.ok(Object.isFrozen(REQUIRED_VALUES));
assert.throws(() => create(), /clearLinking/);
assert.match(toolIcon('class'), /^<svg/);
assert.match(toolIcon('class'), /rect/);
assert.equal(
  toolIcon('unknown'),
  '<svg width="20" height="20" viewBox="0 0 20 20" aria-hidden="true" focusable="false"></svg>',
);

const toolbox = fakeNode();
const document = { createElement: tagName => fakeNode(tagName) };
const state = { tool: 'select' };
let clearCalls = 0;
let canvasRenderCalls = 0;
const controller = create({
  clearLinking: () => { clearCalls += 1; },
  dg: () => ({ type: 'class' }),
  diagramKindLabel: id => ({ class: 'Class', association: 'Association' })[id] || id,
  renderCanvas: () => { canvasRenderCalls += 1; },
  document,
  state,
  toolbox,
  DIAGRAM_TOOLS: {
    class: {
      elements: ['class', 'note'],
      hiddenElements: ['note'],
      relations: ['association'],
    },
  },
});

assert.ok(Object.isFrozen(controller));
controller.render();
assert.equal(toolbox.children.length, 6, '그룹 3개와 표시 가능한 도구 3개를 렌더링해야 합니다');
assert.deepEqual(
  toolbox.children.filter(node => node.className === 'tb-group').map(node => node.textContent),
  ['Tools', 'Elements', 'Relationships'],
);
const selectTool = toolbox.children.find(node => /tb-tool/.test(node.className) && /Select/.test(node.innerHTML));
assert.match(selectTool.className, /active/);
const classTool = toolbox.children.find(node => /tb-tool/.test(node.className) && />Class</.test(node.innerHTML));
assert.equal(classTool.tagName, 'BUTTON');
assert.equal(classTool.type, 'button');
assert.equal(classTool.getAttribute('aria-label'), 'Class 도구');
assert.equal(classTool.getAttribute('aria-pressed'), 'false');
classTool.emit('click');
assert.equal(clearCalls, 1);
assert.equal(state.tool, 'class');
assert.equal(canvasRenderCalls, 1);
assert.match(classTool.className, /active/);
assert.equal(classTool.getAttribute('aria-pressed'), 'true');
assert.equal(selectTool.getAttribute('aria-pressed'), 'false');

console.log('toolbox tests: ok');
