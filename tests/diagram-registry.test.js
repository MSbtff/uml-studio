'use strict';

const assert = require('node:assert/strict');
const {
  DIAGRAM_META,
  DIAGRAM_TOOLS,
  diagramAllowsElementKind,
  diagramAllowsRelationKind,
  registeredElementKinds,
  registeredRelationKinds,
} = require('../dist/browser/model/diagram-registry.js');

assert.deepEqual(Object.keys(DIAGRAM_TOOLS).sort(), Object.keys(DIAGRAM_META).sort(),
  '모든 다이어그램은 메타데이터와 도구 구성을 함께 가져야 합니다');
assert.equal(Object.keys(DIAGRAM_META).length, 22);

Object.entries(DIAGRAM_META).forEach(([type, meta]) => {
  assert.ok(meta.label, `${type} 다이어그램 라벨이 필요합니다`);
  assert.match(meta.code, /^[A-Z]{2}$/);
  assert.match(meta.color, /^#[0-9a-f]{6}$/i);
});

Object.entries(DIAGRAM_TOOLS).forEach(([type, tools]) => {
  assert.ok(Array.isArray(tools.elements) && tools.elements.length, `${type} 요소 도구가 필요합니다`);
  assert.ok(Array.isArray(tools.relations) && tools.relations.length, `${type} 관계 도구가 필요합니다`);
  assert.equal(new Set(tools.elements).size, tools.elements.length, `${type} 요소 도구가 중복됩니다`);
  assert.equal(new Set(tools.relations).size, tools.relations.length, `${type} 관계 도구가 중복됩니다`);
  (tools.hiddenElements || []).forEach(kind => {
    assert.ok(tools.elements.includes(kind), `${type} 숨김 요소 ${kind}가 elements에 없습니다`);
  });
});

assert.equal(diagramAllowsElementKind('class', 'class'), true);
assert.equal(diagramAllowsElementKind('class', 'actor'), false);
assert.equal(diagramAllowsElementKind('informationflow', 'component'), true,
  '재사용 요소도 허용 요소로 판정해야 합니다');
assert.equal(diagramAllowsElementKind('unknown', 'class'), false);
assert.equal(diagramAllowsRelationKind('erd', 'erd-1n'), true);
assert.equal(diagramAllowsRelationKind('erd', 'generalization'), false);
assert.ok(registeredElementKinds().includes('entity'));
assert.ok(registeredElementKinds().includes('informationitem'));
assert.ok(registeredRelationKinds().includes('bindingconnector'));
assert.equal(new Set(registeredElementKinds()).size, registeredElementKinds().length);
assert.equal(new Set(registeredRelationKinds()).size, registeredRelationKinds().length);

console.log('diagram registry tests: ok');
