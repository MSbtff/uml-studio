'use strict';

const assert = require('node:assert/strict');
const { spawnSync } = require('node:child_process');
const {
  MAX_SOURCE_BYTES,
  MAX_TABLES,
  MAX_TOKENS,
  parseDdl,
  sourceLocation,
  tokenize,
} = require('../ddl-importer.js');
const { exportErdDdl } = require('../exporters.js');

assert.equal(MAX_SOURCE_BYTES, 10 * 1024 * 1024);
assert.equal(MAX_TABLES, 500);
assert.equal(MAX_TOKENS, 200000);
assert.ok(Object.isFrozen(require('../ddl-importer.js')));
assert.deepEqual(sourceLocation('one\ntwo', 5), { line: 2, column: 2 });

{
  const imported = parseDdl(`
    -- PostgreSQL-style schema
    CREATE TABLE public.users (
      id BIGINT PRIMARY KEY,
      email VARCHAR(120) NOT NULL UNIQUE
    );
    CREATE TABLE public.posts (
      id BIGINT,
      user_id BIGINT NOT NULL,
      body TEXT DEFAULT 'a, b; c',
      CONSTRAINT posts_pk PRIMARY KEY (id),
      CONSTRAINT posts_user_fk FOREIGN KEY (user_id) REFERENCES public.users (id)
        ON DELETE CASCADE ON UPDATE RESTRICT,
      CONSTRAINT posts_user_body_uq UNIQUE (user_id, body),
      CHECK (length(body) > 0)
    );
    CREATE INDEX posts_user_idx ON public.posts(user_id);
  `, { diagramName: 'Blog Schema' });
  assert.equal(imported.diagrams[0].name, 'Blog Schema');
  assert.equal(imported.importMeta.tables, 2);
  assert.equal(imported.importMeta.columns, 5);
  assert.equal(imported.importMeta.foreignKeys, 1);
  assert.equal(imported.importMeta.linkedForeignKeys, 1);
  assert.equal(imported.importMeta.checks, 1);
  assert.equal(imported.importMeta.indexes, 2);
  assert.match(imported.importMeta.dialect, /PostgreSQL|자동/);
  assert.ok(imported.importMeta.warnings.some(message => /스키마/.test(message)));
  assert.ok(!imported.importMeta.warnings.some(message => /현재 ERD 모델에 저장하지 않습니다/.test(message)
    && /UNIQUE|DEFAULT|CHECK|CREATE INDEX/.test(message)));
  assert.ok(!imported.importMeta.warnings.some(message => /ON DELETE/.test(message)));

  const users = Object.values(imported.models).find(model => model.kind === 'entity' && model.name === 'users');
  const posts = Object.values(imported.models).find(model => model.kind === 'entity' && model.name === 'posts');
  const relation = Object.values(imported.models).find(model => model.kind === 'erd-1n');
  assert.deepEqual(users.columns, ['PK id: BIGINT', 'UQ NN email: VARCHAR(120)']);
  assert.deepEqual(posts.columns, ['PK id: BIGINT', 'FK NN user_id: BIGINT', 'body: TEXT']);
  assert.deepEqual(posts.erdColumnDetails, { body: { defaultValue: "'a, b; c'" } });
  assert.deepEqual(posts.erdChecks, [{ name: '', expression: 'length(body)>0', column: '' }]);
  assert.deepEqual(posts.erdIndexes, [
    {
      kind: 'unique', name: 'posts_user_body_uq', unique: true,
      columns: [{ name: 'user_id', order: '' }, { name: 'body', order: '' }], where: '',
    },
    {
      kind: 'index', name: 'posts_user_idx', unique: false,
      columns: [{ name: 'user_id', order: '' }], where: '',
    },
  ]);
  assert.deepEqual({
    foreignKeyEnd: relation.foreignKeyEnd,
    sourceColumnName: relation.sourceColumnName,
    targetColumnName: relation.targetColumnName,
    foreignKeyOnDelete: relation.foreignKeyOnDelete,
    foreignKeyOnUpdate: relation.foreignKeyOnUpdate,
    sourceLabel: relation.sourceLabel,
    targetLabel: relation.targetLabel,
  }, {
    foreignKeyEnd: 'source', sourceColumnName: 'user_id', targetColumnName: 'id',
    foreignKeyOnDelete: 'CASCADE', foreignKeyOnUpdate: 'RESTRICT',
    sourceLabel: '0..N', targetLabel: '1',
  });

  const sqlite = exportErdDdl(imported.diagrams[0], imported.models, 'sqlite');
  const sqliteCheck = spawnSync('python3', ['-c', [
    'import sqlite3, sys',
    'db = sqlite3.connect(":memory:")',
    'db.executescript(sys.stdin.read())',
    'db.execute("INSERT INTO users(id, email) VALUES (1, \'a@example.com\')")',
    'db.execute("INSERT INTO posts(id, user_id, body) VALUES (10, 1, \'ok\')")',
    'db.execute("DELETE FROM users WHERE id = 1")',
    'cascade_ok = db.execute("SELECT COUNT(*) FROM posts WHERE id = 10").fetchone()[0] == 0',
    'db.execute("INSERT INTO users(id, email) VALUES (1, \'a@example.com\')")',
    'db.execute("INSERT INTO posts(id, user_id) VALUES (12, 1)")',
    'db.execute("INSERT INTO posts(id, user_id, body) VALUES (15, 1, \'ok\')")',
    'checks = []',
    'for sql in ["INSERT INTO posts(id, user_id, body) VALUES (11, 999, \'bad\')", "INSERT INTO users(id, email) VALUES (2, \'a@example.com\')", "INSERT INTO posts(id, user_id, body) VALUES (13, 1, \'\')", "INSERT INTO posts(id, user_id, body) VALUES (14, 1, \'ok\')"]:\n try:\n  db.execute(sql)\n except sqlite3.IntegrityError:\n  checks.append(1)',
    'print("constraints-ok" if cascade_ok and len(checks) == 4 and db.execute("SELECT body FROM posts WHERE id = 12").fetchone()[0] == "a, b; c" and db.execute("SELECT name FROM sqlite_schema WHERE type = \'index\' AND name = \'posts_user_idx\'").fetchone() else "failed")',
    'db.close()',
  ].join('\n')], { input: sqlite, encoding: 'utf8' });
  assert.equal(sqliteCheck.status, 0, sqliteCheck.stderr);
  assert.equal(sqliteCheck.stdout.trim(), 'constraints-ok');
}

{
  const imported = parseDdl(`
    SET FOREIGN_KEY_CHECKS = 0;
    CREATE TABLE \`users\` (
      \`id\` BIGINT NOT NULL AUTO_INCREMENT,
      PRIMARY KEY (\`id\`)
    ) ENGINE=InnoDB;
    CREATE TABLE \`orders\` (
      \`id\` BIGINT PRIMARY KEY,
      \`user_id\` BIGINT,
      FOREIGN KEY user_fk (\`user_id\`) REFERENCES \`users\` (\`id\`),
      KEY \`idx_user\` (\`user_id\`)
    ) ENGINE=InnoDB;
  `);
  assert.equal(imported.importMeta.dialect, 'MySQL');
  assert.equal(imported.importMeta.linkedForeignKeys, 1);
  assert.ok(imported.importMeta.warnings.some(message => /SET/.test(message)));
  assert.ok(imported.importMeta.warnings.some(message => /자동 생성/.test(message)));
  assert.ok(imported.importMeta.warnings.some(message => /테이블 옵션/.test(message)));
  const orders = Object.values(imported.models).find(model => model.kind === 'entity' && model.name === 'orders');
  assert.equal(orders.erdIndexes[0].name, 'idx_user');
}

{
  const imported = parseDdl(`
    PRAGMA foreign_keys = ON;
    CREATE TABLE parent (id INTEGER PRIMARY KEY);
    CREATE TABLE child (
      id INTEGER PRIMARY KEY,
      parent_id INTEGER REFERENCES parent ON DELETE SET NULL ON UPDATE NO ACTION
    ) WITHOUT ROWID;
  `);
  const relation = Object.values(imported.models).find(model => model.kind === 'erd-1n');
  assert.equal(imported.importMeta.dialect, 'SQLite');
  assert.equal(relation.targetColumnName, 'id', 'REFERENCES 컬럼 생략 시 단일 PK를 사용합니다');
  assert.equal(relation.targetLabel, '0..1', 'nullable FK는 선택 참조로 가져옵니다');
  assert.equal(relation.foreignKeyOnUpdate, 'NO ACTION');
  assert.equal(relation.foreignKeyOnDelete, 'SET NULL');
}

{
  const unresolved = parseDdl(`
    CREATE TABLE audit_log (
      id BIGINT PRIMARY KEY,
      actor_id BIGINT REFERENCES external_users(id)
    );
  `);
  assert.equal(unresolved.diagrams[0].relations.length, 0);
  assert.ok(unresolved.importMeta.warnings.some(message => /외부 참조/.test(message)));
  const audit = Object.values(unresolved.models).find(model => model.kind === 'entity');
  assert.match(audit.columns[1], /^FK actor_id/);
}

{
  const tokens = tokenize(`CREATE TABLE "odd;name" ("a,b" TEXT DEFAULT ';');`);
  assert.ok(tokens.some(token => token.type === 'identifier' && token.value === 'odd;name'));
  assert.ok(tokens.some(token => token.type === 'string' && token.value === ';'));
  assert.throws(() => parseDdl(''), /비어/);
  assert.throws(() => parseDdl('\n\nDROP TABLE users;'), /DDL 3:1 · 지원하지 않는 SQL 문장/);
  assert.throws(() => parseDdl('CREATE TABLE users (id BIGINT;'), /닫는 괄호/);
  assert.throws(() => parseDdl('\n\/\* unclosed'), /DDL 2:1 · 닫히지 않은 블록 주석/);
  assert.throws(() => parseDdl(`
    CREATE TABLE parent (a BIGINT, b BIGINT, PRIMARY KEY (a, b));
    CREATE TABLE child (a BIGINT, b BIGINT, FOREIGN KEY (a, b) REFERENCES parent(a, b));
  `), /복합 FOREIGN KEY/);
  assert.throws(() => parseDdl(`
    CREATE TABLE parent (id BIGINT PRIMARY KEY);
    CREATE TABLE child (parent_id BIGINT REFERENCES parent(id) ON DELETE REMOVE);
  `), /ON DELETE 참조 동작/);
}

console.log('DDL importer tests: ok');
