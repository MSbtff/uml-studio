'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const {
  FOCUSABLE_SELECTOR,
  REQUIRED_VALUES,
  create,
} = require('../dist/browser/editor/modal-focus.js');

class FakeNode {
  constructor(document, tagName = 'div') {
    this.attributes = {};
    this.children = [];
    this.disabled = false;
    this.document = document;
    this.hidden = false;
    this.id = '';
    this.isConnected = false;
    this.parent = null;
    this.tabIndex = ['button', 'input', 'select', 'textarea', 'a'].includes(tagName) ? 0 : -1;
    this.tagName = tagName.toUpperCase();
  }
  append(...children) { children.forEach(child => this.appendChild(child)); }
  appendChild(child) {
    child.parent = this;
    child.setConnected(this.isConnected);
    this.children.push(child);
    return child;
  }
  contains(target) {
    return target === this || this.children.some(child => child.contains(target));
  }
  focus() { this.document.activeElement = this; }
  getAttribute(name) { return this.attributes[name] ?? null; }
  hasAttribute(name) { return Object.hasOwn(this.attributes, name); }
  querySelector(selector) {
    if (selector !== '.project-dialog-header strong, strong') return null;
    return this.descendants().find(node => node.tagName === 'STRONG') || null;
  }
  querySelectorAll(selector) {
    assert.equal(selector, FOCUSABLE_SELECTOR);
    return this.descendants().filter(node => (
      ['A', 'BUTTON', 'INPUT', 'SELECT', 'TEXTAREA'].includes(node.tagName)
      || node.hasAttribute('tabindex')
    ));
  }
  descendants() { return this.children.flatMap(child => [child, ...child.descendants()]); }
  remove() {
    if (this.parent) this.parent.children = this.parent.children.filter(child => child !== this);
    this.parent = null;
    this.setConnected(false);
  }
  removeAttribute(name) { delete this.attributes[name]; }
  setAttribute(name, value) {
    this.attributes[name] = String(value);
    if (name === 'tabindex') this.tabIndex = Number(value);
  }
  setConnected(value) {
    this.isConnected = value;
    this.children.forEach(child => child.setConnected(value));
  }
}

function harness() {
  const listeners = new Map();
  const document = {
    activeElement: null,
    addEventListener(type, listener) {
      const handlers = listeners.get(type) || [];
      handlers.push(listener);
      listeners.set(type, handlers);
    },
    removeEventListener(type, listener) {
      listeners.set(type, (listeners.get(type) || []).filter(handler => handler !== listener));
    },
    emit(type, event) { (listeners.get(type) || []).forEach(listener => listener(event)); },
    listenerCount(type) { return (listeners.get(type) || []).length; },
  };
  document.createElement = tagName => new FakeNode(document, tagName);
  const appRoot = document.createElement('main');
  appRoot.inert = false;
  appRoot.setConnected(true);
  const controller = create({ appRoot, document });
  const makeModal = (label = '테스트 모달') => {
    const overlay = document.createElement('div');
    overlay.setConnected(true);
    const dialog = document.createElement('div');
    const header = document.createElement('div');
    header.setAttribute('class', 'project-dialog-header');
    const title = document.createElement('strong');
    title.textContent = label;
    const first = document.createElement('button');
    const last = document.createElement('button');
    header.appendChild(title);
    dialog.append(header, first, last);
    overlay.appendChild(dialog);
    return { dialog, first, last, overlay, title };
  };
  return { appRoot, controller, document, makeModal };
}

function keyEvent(key, options = {}) {
  return {
    key,
    shiftKey: false,
    prevented: false,
    stopped: false,
    preventDefault() { this.prevented = true; },
    stopPropagation() { this.stopped = true; },
    ...options,
  };
}

assert.ok(Object.isFrozen(REQUIRED_VALUES));
assert.equal(typeof FOCUSABLE_SELECTOR, 'string');
assert.throws(() => create(), /requires appRoot/);
assert.throws(() => create({ appRoot: {}, document: {} }), /document\.addEventListener/);

{
  const source = fs.readFileSync(path.join(__dirname, '..', 'dist', 'browser', 'editor', 'modal-focus.js'), 'utf8');
  const context = {};
  context.globalThis = context;
  vm.runInNewContext(source, context);
  assert.equal(typeof context.UMLModalFocus.create, 'function');
}

{
  const h = harness();
  const opener = h.document.createElement('button');
  opener.setConnected(true);
  opener.focus();
  const modal = h.makeModal();
  const handle = h.controller.activate({ ...modal, initialFocus: modal.last });

  assert.ok(Object.isFrozen(handle));
  assert.equal(h.appRoot.inert, true);
  assert.equal(h.controller.size(), 1);
  assert.equal(modal.dialog.getAttribute('role'), 'dialog');
  assert.equal(modal.dialog.getAttribute('aria-modal'), 'true');
  assert.equal(modal.dialog.getAttribute('aria-labelledby'), modal.title.id);
  assert.equal(h.document.activeElement, modal.last);
  assert.equal(h.document.listenerCount('keydown'), 1);

  let event = keyEvent('Tab');
  h.document.emit('keydown', event);
  assert.ok(event.prevented);
  assert.equal(h.document.activeElement, modal.first);

  event = keyEvent('Tab', { shiftKey: true });
  h.document.emit('keydown', event);
  assert.ok(event.prevented);
  assert.equal(h.document.activeElement, modal.last);

  opener.focus();
  h.document.emit('focusin', { target: opener });
  assert.equal(h.document.activeElement, modal.last, '모달 밖으로 이동한 포커스를 되돌려야 합니다');

  assert.equal(handle.close(), true);
  assert.equal(h.appRoot.inert, false);
  assert.equal(h.document.activeElement, opener);
  assert.equal(h.document.listenerCount('keydown'), 0);
  assert.equal(modal.overlay.isConnected, false);
}

{
  const h = harness();
  const modal = h.makeModal();
  const handle = h.controller.activate(modal);
  let reason = '';
  handle.setRequestCloseHandler(closeReason => { reason = closeReason; });
  const event = keyEvent('Escape');
  h.document.emit('keydown', event);
  assert.equal(reason, 'escape');
  assert.ok(event.prevented && event.stopped);
  assert.equal(h.controller.size(), 1, '사용자 정의 닫기 흐름이 완료하기 전에는 제거하면 안 됩니다');
  handle.close({ restoreFocus: false });
}

{
  const h = harness();
  const first = h.makeModal('첫 모달');
  const firstHandle = h.controller.activate(first);
  const second = h.makeModal('둘째 모달');
  const secondHandle = h.controller.activate({ ...second, opener: first.last });
  assert.equal(h.controller.size(), 2);
  assert.equal(first.overlay.inert, true);
  assert.equal(first.overlay.getAttribute('aria-hidden'), 'true');
  assert.equal(first.dialog.getAttribute('aria-modal'), 'false');
  secondHandle.close();
  assert.equal(h.controller.size(), 1);
  assert.equal(h.document.activeElement, first.last);
  assert.equal(h.appRoot.inert, true);
  assert.equal(first.overlay.inert, false);
  assert.equal(first.overlay.getAttribute('aria-hidden'), null);
  assert.equal(first.dialog.getAttribute('aria-modal'), 'true');
  assert.equal(h.controller.closeOverlay(first.overlay), true);
  assert.equal(h.appRoot.inert, false);
  assert.equal(firstHandle.close(), false);
}

console.log('modal focus tests: ok');
