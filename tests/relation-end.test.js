'use strict';

const assert = require('node:assert/strict');
const {
  RELATION_END_QUICK_EDIT_KINDS,
  ER_RELATION_KINDS,
  ASSOCIATION_QUALIFIER_KINDS,
  VISIBILITY_SYMBOL,
  VISIBILITY_VALUE,
  relationSupportsEndQuickEdit,
  relationEndField,
  relationEndMultiplicity,
  relationEndAggregation,
  relationEndNavigability,
  relationEndExpression,
  relationEndRoleLabel,
  validRelationEndMultiplicity,
} = require('../dist/browser/model/relation-end.js');

assert.ok(RELATION_END_QUICK_EDIT_KINDS.has('association'));
assert.ok(RELATION_END_QUICK_EDIT_KINDS.has('erd-1n'));
assert.ok(ER_RELATION_KINDS.has('erd-nm'));
assert.ok(ASSOCIATION_QUALIFIER_KINDS.has('composition'));
assert.equal(relationSupportsEndQuickEdit({ kind: 'directedlink' }), true);
assert.equal(relationSupportsEndQuickEdit({ kind: 'dependency' }), false);
assert.equal(relationSupportsEndQuickEdit(null), false);

assert.equal(relationEndField('source', 'EndName'), 'sourceEndName');
assert.equal(relationEndField('target', 'Qualifiers'), 'targetQualifiers');
assert.equal(relationEndMultiplicity({ sourceLabel: '0..1', targetLabel: '*' }, 'source'), '0..1');
assert.equal(relationEndMultiplicity({ sourceLabel: '0..1', targetLabel: '*' }, 'target'), '*');

assert.equal(relationEndAggregation({ kind: 'aggregation' }, 'target'), 'shared');
assert.equal(relationEndAggregation({ kind: 'composition' }, 'target'), 'composite');
assert.equal(relationEndAggregation({ kind: 'composition', targetAggregation: 'none' }, 'target'), 'none');
assert.equal(relationEndNavigability({ kind: 'directed' }, 'target'), 'navigable');
assert.equal(relationEndNavigability({ kind: 'directed', targetNavigability: 'notNavigable' }, 'target'), 'notNavigable');
assert.equal(relationEndNavigability({ kind: 'association' }, 'source'), 'unspecified');

const relation = {
  kind: 'association',
  sourceEndStereotype: 'owner',
  sourceEndVisibility: 'private',
  sourceEndName: 'account',
  sourceQualifiers: ['id: UUID', 'tenant: String'],
};
assert.equal(relationEndExpression(relation, 'source'), '«owner» - account');
assert.equal(relationEndRoleLabel(relation, 'source'), '«owner» - account [id: UUID, tenant: String]');
assert.equal(VISIBILITY_SYMBOL.protected, '#');
assert.equal(VISIBILITY_VALUE['~'], 'package');

for (const value of ['', '1', '*', '0..1', '1..*', '0..1, 2..*']) {
  assert.equal(validRelationEndMultiplicity(value), true, `${value}는 UML multiplicity로 유효해야 합니다`);
}
for (const value of ['a', '1...', '1..', '1, nope']) {
  assert.equal(validRelationEndMultiplicity(value), false, `${value}는 UML multiplicity로 거부해야 합니다`);
}
assert.equal(validRelationEndMultiplicity('0..N', true), true);
assert.equal(validRelationEndMultiplicity('1..N, 0..1', true), true);
assert.equal(validRelationEndMultiplicity('0..N', false), false);

console.log('relation end tests: ok');
