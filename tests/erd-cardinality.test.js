'use strict';

const assert = require('node:assert/strict');
const {
  erdDefaultCardinality,
  parseErdCardinality,
  normalizeErdCardinality,
  erdMermaidMarker,
  erdDrawioArrow,
} = require('../dist/browser/model/erd-cardinality.js');

assert.equal(erdDefaultCardinality('erd-1n', 'source'), '1');
assert.equal(erdDefaultCardinality('erd-1n', 'target'), '1..N');
assert.deepEqual(parseErdCardinality('0..N'), { min: 'zero', max: 'many', canonical: '0..N' });
assert.deepEqual(parseErdCardinality('N'), { min: 'one', max: 'many', canonical: '1..N' });
assert.equal(normalizeErdCardinality('0..*'), '0..N');
assert.equal(normalizeErdCardinality('1..*'), '1..N');

assert.equal(erdMermaidMarker('1', '1', 'left'), '||');
assert.equal(erdMermaidMarker('0..1', '1', 'right'), 'o|');
assert.equal(erdMermaidMarker('0..N', '1..N', 'right'), 'o{');
assert.equal(erdMermaidMarker('1..N', '1..N', 'left'), '}|');

assert.equal(erdDrawioArrow('1', '1'), 'ERmandOne');
assert.equal(erdDrawioArrow('0..1', '1'), 'ERzeroToOne');
assert.equal(erdDrawioArrow('0..N', '1..N'), 'ERzeroToMany');
assert.equal(erdDrawioArrow('1..N', '1..N'), 'ERoneToMany');

console.log('erd cardinality tests: ok');
