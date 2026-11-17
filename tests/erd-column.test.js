'use strict';

const assert = require('node:assert/strict');
const {
  parseColumn, formatColumn, validateColumn, copiedColumnValue, reorderColumns,
} = require('../dist/browser/model/erd-column.js');

{
  const column = parseColumn('fk,uq,PK nn user_id <작성자번호>: BIGINT');
  assert.deepEqual(column.flags, ['PK', 'FK', 'UQ', 'NN']);
  assert.equal(column.phys, 'user_id');
  assert.equal(column.logical, '작성자번호');
  assert.equal(column.type, 'BIGINT');
}

{
  const raw = formatColumn({ flags: ['NN', 'UQ', 'PK', 'PK'], phys: ' id ', logical: ' 번호 ', type: ' BIGINT ' });
  assert.equal(raw, 'PK UQ NN id <번호>: BIGINT');
  assert.deepEqual(parseColumn(raw), { flags: ['PK', 'UQ', 'NN'], phys: 'id', logical: '번호', type: 'BIGINT' });
}

{
  const result = validateColumn({ phys: 'user_id', logical: '작성자번호', type: 'BIGINT', flags: ['FK', 'NN'] }, [
    'PK id: BIGINT',
  ]);
  assert.equal(result.valid, true);
  assert.equal(result.value, 'FK NN user_id <작성자번호>: BIGINT');
}

{
  const missing = validateColumn({ phys: ' ' });
  assert.equal(missing.valid, false);
  assert.equal(missing.field, 'phys');

  const delimiter = validateColumn({ phys: 'user:id' });
  assert.equal(delimiter.valid, false);
  assert.match(delimiter.error, /사용할 수 없습니다/);
}

{
  const duplicate = validateColumn({ phys: 'ID', type: 'INTEGER' }, ['PK id: BIGINT']);
  assert.equal(duplicate.valid, false);
  assert.match(duplicate.error, /이미 있습니다/);

  const editingSelf = validateColumn({ phys: 'ID', type: 'BIGINT' }, ['PK id: INTEGER'], 0);
  assert.equal(editingSelf.valid, true);
}

{
  const copied = copiedColumnValue('FK NN user_id <작성자번호>: BIGINT', ['PK id: BIGINT']);
  assert.equal(copied, 'FK NN user_id <작성자번호>: BIGINT');

  const renamed = copiedColumnValue('PK id <번호>: BIGINT', [
    'PK id: BIGINT', 'id_copy: BIGINT', 'ID_COPY2: BIGINT',
  ]);
  assert.equal(renamed, 'PK id_copy3 <번호>: BIGINT');
}

{
  const columns = ['PK id: BIGINT', 'name: VARCHAR(255)', 'FK team_id: BIGINT'];
  assert.deepEqual(reorderColumns(columns, 2, 0), [
    'FK team_id: BIGINT', 'PK id: BIGINT', 'name: VARCHAR(255)',
  ]);
  assert.deepEqual(reorderColumns(columns, 0, 2), [
    'name: VARCHAR(255)', 'FK team_id: BIGINT', 'PK id: BIGINT',
  ]);
  assert.deepEqual(reorderColumns(columns, 1, 1), columns);
  assert.deepEqual(columns, ['PK id: BIGINT', 'name: VARCHAR(255)', 'FK team_id: BIGINT']);
}

console.log('erd column tests: ok');
