'use strict';

const assert = require('node:assert/strict');
const { parseIconScript, validColor, MAX_COMMANDS } = require('../dist/browser/model/icon-script.js');

{
  const parsed = parseIconScript([
    '!icon 40 40 # logical coordinate system',
    '%l #76508f',
    '%f #f8f1fc',
    '%a 0.8',
    '%w 2',
    '%p 4 2',
    'e 6 8 34 30',
    'l 11 34 29 34',
    'fp 10 10 30 10 20 30',
  ].join('\n'));
  assert.equal(parsed.valid, true);
  assert.equal(parsed.width, 40);
  assert.equal(parsed.height, 40);
  assert.equal(parsed.commands.length, 3);
  assert.deepEqual(parsed.commands[0].style.pattern, [4, 2]);
  assert.equal(parsed.commands[0].style.line, '#76508f');
}

{
  const parsed = parseIconScript('!icon 40 40\nscript alert(1)\n%l url(javascript:bad)');
  assert.equal(parsed.valid, false);
  assert.match(parsed.errors.join('\n'), /지원하지 않는 명령|안전한 CSS 색상/);
  assert.equal(parsed.commands.length, 0);
}

{
  const commands = Array.from({ length: MAX_COMMANDS + 2 }, (_, index) => `l 0 ${index} 40 ${index}`);
  const parsed = parseIconScript(['!icon 40 40', ...commands].join('\n'));
  assert.equal(parsed.valid, false);
  assert.equal(parsed.commands.length, MAX_COMMANDS);
  assert.match(parsed.errors.join('\n'), /최대 200개의 도형 명령/);
}

assert.equal(validColor('#abc'), true);
assert.equal(validColor('#76508f'), true);
assert.equal(validColor('transparent'), true);
assert.equal(validColor('url(javascript:bad)'), false);

console.log('icon-script tests: ok');
