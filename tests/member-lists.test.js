'use strict';

const assert = require('node:assert/strict');
const vm = require('node:vm');
const {
  MEMBER_FIELDS,
  REQUIRED_FUNCTIONS,
  REQUIRED_VALUES,
  create,
} = require('../member-lists.js');

assert.ok(Object.isFrozen(REQUIRED_FUNCTIONS));
assert.ok(Object.isFrozen(REQUIRED_VALUES));
assert.ok(Object.isFrozen(MEMBER_FIELDS));
assert.deepEqual(MEMBER_FIELDS, {
  attribute: 'attributes',
  column: 'columns',
  literal: 'literals',
  operation: 'operations',
  reception: 'receptions',
  slot: 'slots',
});
assert.throws(() => { MEMBER_FIELDS.attribute = 'changed'; }, TypeError);

const controller = create();
assert.ok(Object.isFrozen(controller));

{
  const members = ['name: String'];
  const element = { attributes: members };
  assert.equal(controller.ensureMemberArray(element, 'attributes'), members,
    '기존 배열 참조를 교체하면 편집 중인 컨트롤러가 오래된 배열을 보게 됩니다');

  const foreignArray = vm.runInNewContext("['cross-realm']");
  element.attributes = foreignArray;
  assert.equal(controller.ensureMemberArray(element, 'attributes'), foreignArray,
    '다른 실행 영역에서 생성된 배열도 그대로 보존해야 합니다');

  for (const invalid of [undefined, null, 'not-array', {}, new Uint8Array([1])]) {
    element.attributes = invalid;
    const normalized = controller.ensureMemberArray(element, 'attributes');
    assert.deepEqual(normalized, []);
    assert.equal(element.attributes, normalized);
  }
}

{
  const element = { kind: 'class' };
  assert.deepEqual(controller.memberLists(element), []);
  assert.equal('attributes' in element, false, '측정 정보가 없으면 저장 데이터를 만들면 안 됩니다');
  assert.equal(controller.memberListByKind(element, 'attribute'), null);
}

{
  const entity = {
    kind: 'entity',
    columns: ['PK id: BIGINT'],
    _m: { headH: 24, aH: 51 },
  };
  const lists = controller.memberLists(entity);
  assert.deepEqual(lists, [{ kind: 'column', arr: entity.columns, top: 24, h: 51 }]);
  assert.equal(controller.memberListByKind(entity, 'column').arr, entity.columns);
  assert.equal(controller.memberListByKind(entity, 'operation'), null);
}

{
  const object = {
    kind: 'object',
    slots: ['status = active'],
    _m: { headH: 32, slotH: 25 },
  };
  assert.deepEqual(controller.memberLists(object), [
    { kind: 'slot', arr: object.slots, top: 32, h: 25 },
  ]);
}

{
  const enumeration = {
    kind: 'enumeration',
    literals: ['PENDING', 'DONE'],
    operations: ['next(): Status'],
    _m: {
      headH: 30,
      aH: 40,
      oH: 25,
      rH: 0,
      showAttrs: true,
      showOps: true,
      showReceptions: false,
    },
  };
  assert.deepEqual(controller.memberLists(enumeration), [
    { kind: 'literal', arr: enumeration.literals, top: 30, h: 40 },
    { kind: 'operation', arr: enumeration.operations, top: 70, h: 25 },
  ]);
}

{
  const classView = {
    kind: 'class',
    attributes: ['-id: Long'],
    operations: ['+save(): void'],
    _m: {
      headH: 34,
      aH: 31,
      oH: 27,
      rH: 0,
      showAttrs: true,
      showOps: true,
      showReceptions: false,
    },
  };
  const metricsBefore = { ...classView._m };
  assert.deepEqual(controller.memberLists(classView), [
    { kind: 'attribute', arr: classView.attributes, top: 34, h: 31 },
    { kind: 'operation', arr: classView.operations, top: 65, h: 27 },
  ]);
  assert.deepEqual(classView._m, metricsBefore, '목록 조회는 측정 캐시를 변경하면 안 됩니다');
}

{
  const informationItem = {
    kind: 'informationitem',
    _m: {
      headH: 28,
      aH: 20,
      oH: 24,
      rH: 18,
      showAttrs: true,
      showOps: true,
      showReceptions: true,
    },
  };
  assert.deepEqual(controller.memberLists(informationItem), [
    { kind: 'attribute', arr: informationItem.attributes, top: 28, h: 20 },
    { kind: 'operation', arr: informationItem.operations, top: 48, h: 24 },
    { kind: 'reception', arr: informationItem.receptions, top: 72, h: 18 },
  ]);
  assert.deepEqual(informationItem.attributes, []);
  assert.deepEqual(informationItem.operations, []);
  assert.deepEqual(informationItem.receptions, []);
}

{
  const receptionOnly = {
    kind: 'informationitem',
    _m: {
      headH: 28,
      aH: 0,
      oH: 0,
      rH: 18,
      showAttrs: false,
      showOps: false,
      showReceptions: true,
    },
  };
  assert.deepEqual(controller.memberLists(receptionOnly), [
    { kind: 'reception', arr: receptionOnly.receptions, top: 28, h: 18 },
  ]);

  const noCompartments = {
    kind: 'class',
    _m: { headH: 28, showAttrs: false, showOps: false, showReceptions: false },
  };
  assert.deepEqual(controller.memberLists(noCompartments), []);
}

console.log('member lists tests: ok');
