'use strict';

const assert = require('node:assert/strict');
const {
  DASH_PATTERNS,
  KIND_META,
  REL_STYLE,
  presentationRegistryProblems,
} = require('../dist/browser/model/presentation-registry.js');
const {
  registeredElementKinds,
  registeredRelationKinds,
} = require('../dist/browser/model/diagram-registry.js');

assert.deepEqual(DASH_PATTERNS, {
  relation: '6 4',
  lifeline: '6 4',
  note: '3 3',
  selection: '3 2',
});

assert.equal(Object.keys(KIND_META).length, 146);
assert.equal(Object.keys(REL_STYLE).length, 48);
assert.deepEqual(
  Object.keys(KIND_META).sort(),
  [...registeredElementKinds(), ...registeredRelationKinds()].sort(),
  '도구로 등록된 모든 요소와 관계에 표현 메타데이터가 정확히 하나씩 필요합니다',
);
assert.deepEqual(
  Object.keys(REL_STYLE).sort(),
  registeredRelationKinds().sort(),
  '모든 관계 도구에는 선 스타일이 필요합니다',
);

Object.entries(KIND_META).forEach(([kind, meta]) => {
  assert.ok(meta.label, `${kind} 라벨이 필요합니다`);
  assert.ok(meta.icon, `${kind} 아이콘이 필요합니다`);
  assert.match(meta.color, /^#[0-9a-f]{6}$/i, `${kind} 색상 형식이 잘못되었습니다`);
  assert.ok(Object.isFrozen(meta), `${kind} 메타데이터는 읽기 전용이어야 합니다`);
});

const validHeads = new Set([null, 'open', 'triangle', 'diamond', 'diamond-filled', 'circle-plus', 'filled', 'x']);
Object.entries(REL_STYLE).forEach(([kind, style]) => {
  assert.ok(KIND_META[kind], `${kind} 관계에도 종류 메타데이터가 필요합니다`);
  assert.ok(style.dash === null || typeof style.dash === 'string');
  assert.ok(validHeads.has(style.head), `${kind} 관계 끝 모양이 잘못되었습니다`);
  assert.ok(Object.isFrozen(style), `${kind} 관계 스타일은 읽기 전용이어야 합니다`);
});

assert.deepEqual(presentationRegistryProblems(), []);
assert.deepEqual(
  presentationRegistryProblems(
    { invalid: { label: '', icon: '', color: 'red' } },
    { missing: { dash: 7, head: 'unknown' } },
  ),
  [
    '잘못된 종류 메타데이터: invalid',
    '종류 메타데이터가 없는 관계: missing',
    '잘못된 관계 선 스타일: missing',
    '잘못된 관계 끝 모양: missing',
  ],
  '레지스트리 오류를 종류별로 조기에 진단해야 합니다',
);
assert.ok(Object.isFrozen(DASH_PATTERNS));
assert.ok(Object.isFrozen(KIND_META));
assert.ok(Object.isFrozen(REL_STYLE));
assert.throws(() => { KIND_META.class.label = 'Changed'; }, TypeError);
assert.throws(() => { REL_STYLE.association.head = 'open'; }, TypeError);

console.log('presentation registry tests: ok');
