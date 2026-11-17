'use strict';

const assert = require('node:assert/strict');
const { assignTemporalDepths, activeAt } = require('../dist/browser/canvas/sequence-layout.js');

{
  const bars = assignTemporalDepths([
    { id: 'outer', el: 'life1', y0: 10, y1: 220 },
    { id: 'middle', el: 'life1', y0: 50, y1: 200 },
    { id: 'inner', el: 'life1', y0: 90, y1: 140 },
    { id: 'later', el: 'life1', y0: 160, y1: 190 },
  ]);
  assert.deepEqual(bars.map(x => x.depth), [0, 1, 2, 2]);
  assert.equal(activeAt(bars, 'life1', 100)[0].id, 'inner');
  assert.equal(activeAt(bars, 'life1', 170)[0].id, 'later');
}

{
  const bars = assignTemporalDepths([
    { id: 'a', el: 'life1', y0: 10, y1: 50 },
    { id: 'b', el: 'life1', y0: 50, y1: 90 },
    { id: 'c', el: 'life2', y0: 20, y1: 80 },
  ]);
  assert.deepEqual(bars.map(x => x.depth), [0, 0, 0], '맞닿거나 다른 라이프라인인 막대는 같은 깊이를 쓸 수 있다');
}

{
  const bars = assignTemporalDepths([
    { id: 'short', el: 'life1', y0: 10, y1: 30 },
    { id: 'long', el: 'life1', y0: 10, y1: 100 },
  ]);
  assert.equal(bars.find(x => x.id === 'long').depth, 0);
  assert.equal(bars.find(x => x.id === 'short').depth, 1);
}

console.log('sequence-layout tests: ok');
