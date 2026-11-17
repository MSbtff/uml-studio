'use strict';

const assert = require('node:assert/strict');
const schema = require('../erd-schema.js');

assert.ok(Object.isFrozen(schema));
assert.ok(Object.isFrozen(schema.ERD_REFERENTIAL_ACTIONS));
assert.deepEqual(schema.validateReferentialActions({
  foreignKeyOnDelete: ' cascade ', foreignKeyOnUpdate: 'set null',
}), { onDelete: 'CASCADE', onUpdate: 'SET NULL' });
assert.throws(() => schema.normalizeReferentialAction('DELETE ALL'), /올바르지/);
assert.throws(() => schema.normalizeReferentialAction(null), /문자열/);
assert.equal(schema.safeSqlFragment("'a;b'", 'DEFAULT'), "'a;b'");
assert.equal(schema.safeSqlFragment('price >= 0 AND price < 100', 'CHECK'), 'price >= 0 AND price < 100');
assert.equal(schema.safeSqlFragment('$tag$a;b\n$tag$', 'DEFAULT'), '$tag$a;b\n$tag$');
assert.throws(() => schema.safeSqlFragment('1; DROP TABLE users', 'DEFAULT'), /구분자/);
assert.throws(() => schema.safeSqlFragment('value /* hidden */', 'CHECK'), /주석/);
assert.throws(() => schema.safeSqlFragment('(value > 0', 'CHECK'), /괄호/);

{
  const entity = {
    erdColumnDetails: { price: { defaultValue: '0' } },
    erdChecks: [
      { name: 'price_positive', expression: 'price >= 0', column: 'price' },
      { name: 'label_check', expression: "label <> 'price'", column: '' },
    ],
    erdIndexes: [{
      kind: 'index', name: 'price_idx', unique: false,
      columns: [{ name: 'price', order: 'DESC' }], where: 'price > 0',
    }],
  };
  assert.equal(schema.renameColumnSchema(entity, 'price', 'unit_price'), true);
  assert.deepEqual(entity.erdColumnDetails, { unit_price: { defaultValue: '0' } });
  assert.equal(entity.erdChecks[0].column, 'unit_price');
  assert.equal(entity.erdChecks[0].expression, 'unit_price >= 0');
  assert.equal(entity.erdChecks[1].expression, "label <> 'price'", '문자열 안의 이름은 바꾸지 않습니다');
  assert.equal(entity.erdIndexes[0].columns[0].name, 'unit_price');
  assert.equal(entity.erdIndexes[0].where, 'unit_price > 0');
  const removed = schema.deleteColumnSchema(entity, 'unit_price');
  assert.deepEqual(removed, { details: 1, checks: 1, indexes: 1 });
  assert.equal(entity.erdChecks.length, 1);
  assert.equal(entity.erdIndexes, undefined);
}

{
  const models = {
    users: { id: 'users', kind: 'entity', name: 'users' },
    orders: { id: 'orders', kind: 'entity', name: 'orders' },
    outgoing: {
      id: 'outgoing', kind: 'erd-1n', name: 'orders_user_fk',
      fromModelId: 'users', toModelId: 'orders',
      sourceColumnName: 'User_ID', targetColumnName: 'owner_id', foreignKeyEnd: 'target',
      foreignKeyOnDelete: 'CASCADE', foreignKeyOnUpdate: 'RESTRICT',
    },
    incoming: {
      id: 'incoming', kind: 'erd-11', name: 'profile_user_fk',
      fromModelId: 'orders', toModelId: 'users',
      sourceColumnName: 'profile_id', targetColumnName: 'user_id', foreignKeyEnd: 'source',
    },
    unrelated: {
      id: 'unrelated', kind: 'association', name: 'not an ERD relation',
      fromModelId: 'users', sourceColumnName: 'user_id',
    },
  };
  const impacts = schema.foreignKeyColumnImpacts(models, 'users', 'user_id');
  assert.deepEqual(impacts.map(item => item.relationModelId), ['outgoing', 'incoming']);
  assert.deepEqual(schema.renameForeignKeyColumnReferences(models, 'users', 'user_id', 'member_id'), {
    references: 2, relations: 2,
  });
  assert.equal(models.outgoing.sourceColumnName, 'member_id');
  assert.equal(models.incoming.targetColumnName, 'member_id');
  const disconnected = schema.disconnectForeignKeyColumnReferences(models, 'users', 'member_id');
  assert.equal(disconnected.relations, 2);
  for (const relation of [models.outgoing, models.incoming]) {
    assert.equal(relation.foreignKeyEnd, '');
    assert.equal(relation.sourceColumnName, '');
    assert.equal(relation.targetColumnName, '');
    assert.equal(relation.foreignKeyOnDelete, '');
    assert.equal(relation.foreignKeyOnUpdate, '');
  }
}

{
  const entity = {
    erdChecks: [{ name: 'code_check', expression: 'CODE <> 0', column: 'CODE' }],
    erdIndexes: [{ kind: 'index', name: 'code_idx', columns: ['CODE'] }],
  };
  assert.equal(schema.renameColumnSchema(entity, 'CODE', 'code'), true, '대소문자만 바뀌어도 참조 표기를 갱신합니다');
  assert.equal(entity.erdChecks[0].column, 'code');
  assert.equal(entity.erdChecks[0].expression, 'code <> 0');
  assert.equal(entity.erdIndexes[0].columns[0].name, 'code');
}

{
  const source = {
    erdColumnDetails: { email: { defaultValue: "'unknown'", uniqueName: 'email_uq' } },
    erdChecks: [{ name: 'email_nonempty', expression: "email <> ''", column: 'email' }],
  };
  const copied = schema.copyColumnSchema(source, 'email');
  const target = {};
  schema.applyCopiedColumnSchema(target, 'email_copy', copied);
  assert.deepEqual(target.erdColumnDetails, {
    email_copy: { defaultValue: "'unknown'" },
  });
  assert.deepEqual(target.erdChecks, [{ name: '', expression: "email_copy <> ''", column: 'email_copy' }]);
}

{
  const normalized = schema.validateEntitySchema({
    erdColumnDetails: { email: { defaultValue: "'none'" } },
    erdChecks: [{ name: 'email_check', expression: "email <> ''", column: 'email' }],
    erdIndexes: [
      { kind: 'unique', name: 'tenant_email_uq', columns: ['tenant_id', 'email'] },
      { kind: 'index', name: 'email_idx', unique: false, columns: [{ name: 'email', order: 'desc' }] },
    ],
  }, ['tenant_id', 'email']);
  assert.equal(normalized.indexes[0].unique, true);
  assert.equal(normalized.indexes[1].columns[0].order, 'DESC');
  assert.throws(() => schema.validateEntitySchema({
    erdIndexes: [{ kind: 'index', columns: ['missing'] }],
  }, ['id']), /컬럼을 찾을 수 없습니다/);
  assert.throws(() => schema.validateEntitySchema({
    erdIndexes: [{ kind: 'hash', columns: ['id'] }],
  }, ['id']), /종류가 올바르지/);
  assert.throws(() => schema.validateEntitySchema({
    erdColumnDetails: { id: { defaultValue: { unsafe: true } } },
  }, ['id']), /문자열이어야/);
}

console.log('ERD schema tests: ok');
