'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const {
  REQUIRED_FUNCTIONS,
  REQUIRED_VALUES,
  applyErdNameChanges,
  buildErdNameEntries,
  create,
  previewErdNameChanges,
  replaceLiteral,
} = require('../erd-name-tools.js');

function fixture() {
  const models = {
    users: {
      id: 'users', kind: 'entity', name: 'TB_USER', logicalName: '회원',
      columns: [
        'PK aa <회원번호>: INTEGER',
        'NN aaa <회원상태>: TEXT',
      ],
      erdColumnDetails: {
        aa: { defaultValue: '0' },
        aaa: { defaultValue: "'active'" },
      },
      erdChecks: [{ name: 'user_check', expression: 'aa >= 0 AND aaa <> \'\'', column: 'aa' }],
      erdIndexes: [{ kind: 'index', name: 'user_idx', columns: [{ name: 'aaa', order: '' }], where: 'aa > 0' }],
    },
    orders: {
      id: 'orders', kind: 'entity', name: 'TB_ORDER', logicalName: '주문',
      columns: ['PK id <주문번호>: INTEGER'],
    },
    relation: {
      id: 'relation', kind: 'erd-1n', name: 'user orders',
      fromModelId: 'users', toModelId: 'orders', foreignKeyEnd: 'source',
      sourceColumnName: 'aa', targetColumnName: 'id',
      foreignKeyOnDelete: 'CASCADE', foreignKeyOnUpdate: 'RESTRICT',
    },
    classModel: { id: 'classModel', kind: 'class', name: 'Unrelated' },
  };
  const diagrams = [{
    id: 'erd', type: 'erd', name: 'Main ERD',
    elements: [{ id: 'users-view', modelId: 'users' }, { id: 'orders-view', modelId: 'orders' }],
    relations: [],
  }];
  return { models, diagrams };
}

test('ERD 이름 항목은 엔터티와 컬럼의 논리명·물리명을 모델당 한 번 수집한다', () => {
  const { models } = fixture();
  const entries = buildErdNameEntries(models);
  assert.equal(entries.length, 10);
  assert.ok(entries.some(entry => entry.modelId === 'users'
    && entry.item === 'column' && entry.field === 'logical' && entry.before === '회원번호'));
  assert.ok(!entries.some(entry => entry.modelId === 'relation'));
});

test('문자열 찾기는 정규식 문자를 리터럴로 처리하고 대소문자 옵션을 지킨다', () => {
  assert.equal(replaceLiteral('user.id userXid', {
    query: 'user.id', replacement: 'member_id', matchMode: 'contains', caseSensitive: true,
  }), 'member_id userXid');
  assert.equal(replaceLiteral('TB_USER user_id', {
    query: 'user', replacement: 'member', matchMode: 'contains', caseSensitive: false,
  }), 'TB_member member_id');
  assert.equal(replaceLiteral('User', {
    query: 'user', replacement: 'MEMBER', matchMode: 'exact', caseSensitive: true,
  }), 'User');
});

test('논리명 범위 미리보기와 적용은 물리명과 FK를 건드리지 않는다', () => {
  const { models, diagrams } = fixture();
  const preview = previewErdNameChanges(models, diagrams, {
    query: '회원', replacement: '고객', scope: 'logical', matchMode: 'contains',
  });
  assert.deepEqual(preview.errors, []);
  assert.equal(preview.changes.length, 3);
  assert.equal(preview.modelCount, 1);
  assert.deepEqual(preview.affectedDiagrams, [{ id: 'erd', name: 'Main ERD' }]);
  const result = applyErdNameChanges(models, preview);
  assert.equal(result.changes, 3);
  assert.equal(models.users.logicalName, '고객');
  assert.deepEqual(models.users.columns, [
    'PK aa <고객번호>: INTEGER',
    'NN aaa <고객상태>: TEXT',
  ]);
  assert.equal(models.relation.sourceColumnName, 'aa');
});

test('여러 물리명은 임시 이름을 거쳐 FK·CHECK·인덱스 참조까지 안전하게 변경한다', () => {
  const { models, diagrams } = fixture();
  const preview = previewErdNameChanges(models, diagrams, {
    query: 'a', replacement: 'b', scope: 'physical', matchMode: 'contains', caseSensitive: true,
  });
  assert.deepEqual(preview.errors, []);
  assert.deepEqual(preview.changes.map(change => change.after), ['bb', 'bbb']);
  const result = applyErdNameChanges(models, preview);
  assert.equal(result.columns, 2);
  assert.equal(result.relations, 1);
  assert.deepEqual(models.users.columns, [
    'PK bb <회원번호>: INTEGER',
    'NN bbb <회원상태>: TEXT',
  ]);
  assert.deepEqual(models.users.erdColumnDetails, {
    bb: { defaultValue: '0' },
    bbb: { defaultValue: "'active'" },
  });
  assert.equal(models.users.erdChecks[0].column, 'bb');
  assert.equal(models.users.erdChecks[0].expression, "bb >= 0 AND bbb <> ''");
  assert.equal(models.users.erdIndexes[0].columns[0].name, 'bbb');
  assert.equal(models.users.erdIndexes[0].where, 'bb > 0');
  assert.equal(models.relation.sourceColumnName, 'bb');
  assert.equal(models.relation.foreignKeyOnDelete, 'CASCADE');
});

test('컬럼과 같은 다이어그램의 엔터티 물리명 충돌은 적용 전에 거부한다', () => {
  const { models, diagrams } = fixture();
  models.users.columns.push('member_id <고객번호>: INTEGER');
  let preview = previewErdNameChanges(models, diagrams, {
    query: 'aa', replacement: 'member_id', scope: 'physical', matchMode: 'exact',
  });
  assert.match(preview.errors.join('\n'), /이미 있습니다/);
  assert.throws(() => applyErdNameChanges(models, preview), /검증을 통과한/);

  preview = previewErdNameChanges(models, diagrams, {
    query: 'TB_USER', replacement: 'TB_ORDER', scope: 'physical', matchMode: 'exact',
  });
  assert.match(preview.errors.join('\n'), /중복된 엔터티 물리명/);
});

test('빈 검색은 준비되지 않은 미리보기이며 오래된 미리보기는 적용하지 않는다', () => {
  const { models, diagrams } = fixture();
  const empty = previewErdNameChanges(models, diagrams, { query: '', replacement: 'x' });
  assert.equal(empty.ready, false);
  assert.deepEqual(empty.changes, []);

  const preview = previewErdNameChanges(models, diagrams, {
    query: '회원', replacement: '고객', scope: 'logical', matchMode: 'exact',
  });
  models.users.logicalName = '사용자';
  assert.throws(() => applyErdNameChanges(models, preview), /미리보기 이후/);
});

test('한도를 넘는 검색어와 변경 건수는 적용 전에 막는다', () => {
  const { models, diagrams } = fixture();
  const tooLong = previewErdNameChanges(models, diagrams, {
    query: 'a'.repeat(121), replacement: 'b',
  });
  assert.equal(tooLong.ready, true);
  assert.deepEqual(tooLong.changes, []);
  assert.match(tooLong.errors.join('\n'), /찾을 이름은 120자 이하여야 합니다\./);

  /* 한 글자 검색은 프로젝트 전체를 건드릴 수 있으므로 건수 상한이 필요하다 */
  const many = { models: {}, diagrams: [{ id: 'd', type: 'erd', elements: [], relations: [] }] };
  for (let index = 0; index < 5001; index++) {
    many.models[`m${index}`] = {
      id: `m${index}`, kind: 'entity', name: `t_a_${index}`, columns: [],
    };
    many.diagrams[0].elements.push({ id: `v${index}`, modelId: `m${index}` });
  }
  const overflow = previewErdNameChanges(many.models, many.diagrams, {
    query: 'a', replacement: 'b', scope: 'physical',
  });
  assert.equal(overflow.changes.length, 5001);
  assert.deepEqual(overflow.errors, ['한 번에 변경할 수 있는 이름은 5000개입니다.']);
  assert.throws(() => applyErdNameChanges(many.models, overflow),
    /검증을 통과한 ERD 이름 변경 미리보기가 필요합니다\./);
  assert.equal(many.models.m0.name, 't_a_0', '상한을 넘은 미리보기는 아무것도 바꾸지 않습니다');
});

test('컨트롤러 계약은 누락 의존성을 즉시 거부한다', () => {
  assert.ok(Object.isFrozen(REQUIRED_FUNCTIONS));
  assert.ok(Object.isFrozen(REQUIRED_VALUES));
  assert.throws(() => create(), /ERD Name Tools 의존성이 없습니다/);
  assert.throws(() => create({}), /ERD Name Tools 의존성이 없습니다/);

  const base = {
    flashStatus: () => {}, renderAll: () => {}, rollbackLastSnapshot: () => {},
    snapshot: () => {}, confirmAction: () => true,
    document: { createElement: () => ({}), getElementById: () => null, body: {} },
    modalFocus: { activate: () => ({}), closeOverlay: () => true },
    state: { models: {}, diagrams: [] },
    triggerButton: { addEventListener: () => {}, removeEventListener: () => {} },
  };
  assert.throws(() => create({ ...base, document: {} }), /document\.createElement/);
  assert.throws(() => create({ ...base, triggerButton: {} }), /triggerButton\.addEventListener/);
  assert.throws(() => create({ ...base, modalFocus: { activate: () => ({}) } }),
    /modalFocus\.closeOverlay/);
});
