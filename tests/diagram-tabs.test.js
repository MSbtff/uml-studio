'use strict';

const assert = require('node:assert/strict');
const { REQUIRED_FUNCTIONS, REQUIRED_VALUES, create } = require('../dist/browser/editor/diagram-tabs.js');

function fakeNode(tagName = 'div') {
  const listeners = new Map();
  const attributes = new Map();
  let text = '';
  const node = {
    tagName: tagName.toUpperCase(),
    children: [],
    className: '',
    dataset: {},
    style: {},
    value: '',
    innerHTML: '',
    focused: 0,
    selected: 0,
    parentNode: null,
    appendChild(child) { child.parentNode = this; this.children.push(child); return child; },
    append(...children) { children.forEach(child => this.appendChild(child)); },
    addEventListener(type, listener) {
      const handlers = listeners.get(type) || [];
      handlers.push(listener);
      listeners.set(type, handlers);
    },
    removeEventListener(type, listener) {
      listeners.set(type, (listeners.get(type) || []).filter(handler => handler !== listener));
    },
    emit(type, event = {}) { (listeners.get(type) || []).forEach(listener => listener(event)); },
    setAttribute(name, value) { attributes.set(name, String(value)); },
    getAttribute(name) { return attributes.get(name) ?? null; },
    querySelector(selector) {
      if (!selector.startsWith('.')) return null;
      const className = selector.slice(1);
      return this.children.find(child => String(child.className).split(/\s+/).includes(className)) || null;
    },
    getBoundingClientRect() { return { left: 10, bottom: 20, width: 100, height: 20 }; },
    contains(target) { return target === this || this.children.includes(target); },
    replaceWith(replacement) {
      const index = this.parentNode?.children.indexOf(this) ?? -1;
      if (index >= 0) {
        replacement.parentNode = this.parentNode;
        this.parentNode.children[index] = replacement;
      }
    },
    remove() {
      const index = this.parentNode?.children.indexOf(this) ?? -1;
      if (index >= 0) this.parentNode.children.splice(index, 1);
    },
    focus() { this.focused += 1; },
    select() { this.selected += 1; },
    blur() { this.emit('blur'); },
    get textContent() { return text; },
    set textContent(value) { text = String(value); if (value === '') this.children = []; },
  };
  return node;
}

assert.ok(Object.isFrozen(REQUIRED_FUNCTIONS));
assert.ok(Object.isFrozen(REQUIRED_VALUES));
assert.throws(() => create(), /Diagram Tabs 의존성이 없습니다/);

const tabs = fakeNode();
const body = fakeNode('body');
const documentListeners = new Map();
const document = {
  body,
  createElement: tagName => fakeNode(tagName),
  addEventListener(type, listener) { documentListeners.set(type, listener); },
  removeEventListener(type, listener) {
    if (documentListeners.get(type) === listener) documentListeners.delete(type);
  },
  getElementById(id) {
    const find = node => {
      if (node.id === id) return node;
      for (const child of node.children || []) {
        const found = find(child);
        if (found) return found;
      }
      return null;
    };
    return find(body);
  },
};

const sequenceRef = { kind: 'interactionuse', name: 'Sequence Diagram', interactionDiagramId: 'sequence-1' };
const state = {
  activeId: 'class-1',
  selection: [],
  tool: 'select',
  models: { ref: sequenceRef },
  diagrams: [
    { id: 'class-1', type: 'class', name: 'Class Diagram', elements: [], relations: [] },
    { id: 'sequence-1', type: 'sequence', name: 'Sequence Diagram', elements: [], relations: [] },
  ],
};
let nextId = 0;
let snapshotCalls = 0;
let renderAllCalls = 0;
let renderExplorerCalls = 0;
let clearLinkingCalls = 0;
let confirmResult = true;
const dependencies = {
  ...Object.fromEntries(REQUIRED_FUNCTIONS.map(name => [name, () => undefined])),
  adoptView: view => view,
  clearLinking: () => { clearLinkingCalls += 1; },
  confirmAction: () => confirmResult,
  createElement: kind => ({ id: `frame-${++nextId}`, kind, x: 48, y: 48 }),
  normalizeSize: view => { view.w = 640; view.h = 420; },
  renderAll: () => { renderAllCalls += 1; },
  renderExplorer: () => { renderExplorerCalls += 1; },
  setSelection: ids => { state.selection = ids; },
  setTimeout: callback => callback(),
  snapshot: () => { snapshotCalls += 1; },
  uid: () => `diagram-${++nextId}`,
  document,
  state,
  tabs,
  viewport: { innerWidth: 1200, innerHeight: 800 },
  DIAGRAM_META: {
    class: { label: 'Class Diagram', color: '#111', code: 'CL' },
    sequence: { label: 'Sequence Diagram', color: '#222', code: 'SQ' },
    c4container: { label: 'C4 Container', color: '#35739c', code: 'L2', fromContext: true },
    ibd: { label: 'Internal Block Diagram', color: '#333', code: 'IB' },
  },
};

const controller = create(dependencies);
assert.ok(Object.isFrozen(controller));
assert.equal(controller.switchDiagram('class-1'), false);
assert.equal(controller.switchDiagram('sequence-1'), true);
assert.equal(state.activeId, 'sequence-1');
assert.equal(clearLinkingCalls, 1);
assert.equal(renderAllCalls, 1);

controller.render();
assert.equal(tabs.children.length, 3, '다이어그램 두 개와 추가 탭을 렌더링해야 합니다');
assert.equal(tabs.getAttribute('role'), 'tablist');
const sequenceShell = tabs.children.find(shell => shell.querySelector?.('.tab')
  ?.querySelector?.('.tab-name')?.textContent === 'Sequence Diagram');
const sequenceTab = sequenceShell.querySelector('.tab');
assert.equal(sequenceTab.tagName, 'BUTTON');
assert.equal(sequenceTab.getAttribute('role'), 'tab');
assert.equal(sequenceTab.getAttribute('aria-selected'), 'true');
assert.equal(sequenceTab.getAttribute('aria-keyshortcuts'), 'F2 Delete');
assert.equal(sequenceTab.tabIndex, 0);
const classTab = tabs.children[0].querySelector('.tab');
assert.equal(classTab.getAttribute('aria-selected'), 'false');
assert.equal(classTab.tabIndex, -1);
assert.equal(sequenceShell.querySelector('.tab-close').tagName, 'BUTTON');
assert.equal(tabs.children.at(-1).tagName, 'BUTTON');
sequenceTab.emit('dblclick', { preventDefault() {} });
const renameInput = sequenceShell.querySelector('.tab-rename');
renameInput.value = 'Checkout Sequence';
renameInput.emit('blur');
assert.equal(state.diagrams[1].name, 'Checkout Sequence');
assert.equal(sequenceRef.name, 'Checkout Sequence');
assert.equal(renderExplorerCalls, 1);

const renamedSequenceTab = tabs.children[1].querySelector('.tab');
let keyPrevented = 0;
renamedSequenceTab.emit('keydown', {
  key: 'ArrowLeft',
  preventDefault: () => { keyPrevented += 1; },
  stopPropagation() {},
});
assert.equal(keyPrevented, 1);
assert.equal(state.activeId, 'class-1');
assert.ok(tabs.children[0].querySelector('.tab').focused > 0,
  '방향키로 이동한 활성 탭에 포커스를 둬야 합니다');

confirmResult = false;
assert.equal(controller.deleteDiagram(state.diagrams[1]), false);
assert.equal(state.diagrams.length, 2);
confirmResult = true;
assert.equal(controller.deleteDiagram(state.diagrams[1]), true);
assert.equal(state.diagrams.length, 1);
assert.equal(state.activeId, 'class-1');
assert.equal(sequenceRef.interactionDiagramId, '');

const ibd = controller.addDiagram('ibd');
assert.equal(ibd.type, 'ibd');
assert.equal(ibd.elements.length, 1);
assert.equal(ibd.elements[0].kind, 'ibdframe');
assert.deepEqual(state.selection, [ibd.elements[0].id]);
assert.equal(state.activeId, ibd.id);
assert.ok(snapshotCalls >= 3);

const system = { id: 'system-view', modelId: 'm-erp', name: 'ERP', kind: 'c4system', c4ContextFocus: true };
const context = { id: 'c4-context', type: 'c4context', name: 'C4 System Context', elements: [system], relations: [] };
state.diagrams.push(context);
state.models[system.modelId] = { id: system.modelId, kind: system.kind, name: system.name };
controller.switchDiagram(context.id);
controller.openC4Container(system);
const container = state.diagrams.at(-1);
const boundary = container.elements[0];
assert.equal(container.type, 'c4container');
assert.equal(container.c4AutoName, true);
assert.equal(boundary.c4Boundary, true);
assert.equal(boundary.modelId, system.modelId);
assert.deepEqual(controller.c4ContextFor(boundary), { diagram: context, view: system });
controller.switchDiagram(context.id);
const beforeReopen = snapshotCalls;
controller.openC4Container(system);
assert.equal(state.activeId, container.id);
assert.deepEqual(state.selection, [boundary.id]);
assert.equal(snapshotCalls, beforeReopen, 'Reopening L2 should keep the existing diagram');

console.log('diagram tabs tests: ok');
