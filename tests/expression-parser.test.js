'use strict';

const assert = require('node:assert/strict');
const parser = require('../dist/browser/model/expression-parser.js');

{
  const result = parser.parseAttribute('<<id>> - owner : User [0 .. *] = none');
  assert.equal(result.valid, true);
  assert.equal(result.stereotype, 'id');
  assert.equal(result.visibility, '-');
  assert.equal(result.name, 'owner');
  assert.equal(result.type, 'User');
  assert.equal(result.multiplicity, '0..*');
  assert.equal(result.defaultValue, 'none');
  assert.equal(result.normalized, '«id» - owner: User [0..*] = none');
}

{
  const result = parser.parseAttribute('+ users: User [many]');
  assert.equal(result.valid, false);
  assert.match(result.error, /Multiplicity/);
}

{
  const result = parser.parseOperation('+ draw(ctx: Context, options = {}): void {abstract}');
  assert.equal(result.valid, true);
  assert.equal(result.name, 'draw');
  assert.equal(result.parameters, 'ctx: Context, options = {}');
  assert.equal(result.returnType, 'void');
  assert.equal(result.properties, '{abstract}');
  assert.equal(result.normalized, '+ draw(ctx: Context, options = {}): void {abstract}');
}

{
  const result = parser.parseOperation('+ broken(value: String');
  assert.equal(result.valid, false);
  assert.match(result.error, /닫는 괄호/);
}

{
  const result = parser.parseLifeline('<<boundary>> - view[item] : CanvasView');
  assert.equal(result.valid, true);
  assert.equal(result.stereotype, 'boundary');
  assert.equal(result.visibility, '-');
  assert.equal(result.name, 'view');
  assert.equal(result.selector, 'item');
  assert.equal(result.type, 'CanvasView');
  assert.equal(result.normalized, '«boundary» - view[item]: CanvasView');
}

{
  const result = parser.parseLifeline(':CanvasView');
  assert.equal(result.valid, true);
  assert.equal(result.name, '');
  assert.equal(result.type, 'CanvasView');
  assert.equal(result.normalized, ': CanvasView');
}

{
  const result = parser.parseMessage('<<async>> + result = render(frame, "a=b")');
  assert.equal(result.valid, true);
  assert.equal(result.stereotype, 'async');
  assert.equal(result.visibility, '+');
  assert.equal(result.target, 'result');
  assert.equal(result.name, 'render');
  assert.equal(result.arguments, 'frame, "a=b"');
  assert.equal(result.normalized, '«async» + result = render(frame, "a=b")');
}

{
  const result = parser.parseMessage('render(frame');
  assert.equal(result.valid, false);
  assert.match(result.error, /괄호/);
}

{
  const result = parser.parseName('<<service>> # 주문 처리기');
  assert.equal(result.valid, true);
  assert.equal(result.name, '주문 처리기');
  assert.equal(result.normalized, '«service» # 주문 처리기');
}

console.log('expression parser tests: ok');
