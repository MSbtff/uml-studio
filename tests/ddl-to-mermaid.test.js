'use strict';

const assert = require('node:assert/strict');
const { execFileSync } = require('node:child_process');
const { mkdtempSync, rmSync, writeFileSync } = require('node:fs');
const { tmpdir } = require('node:os');
const { join, resolve } = require('node:path');
const { test } = require('node:test');

test('the packed library converts SQL from a standalone project', (t) => {
  const work = mkdtempSync(join(tmpdir(), 'ddl-to-mermaid-'));
  t.after(() => rmSync(work, { recursive: true, force: true }));
  const npm = (...args) => execFileSync('npm', ['--cache', join(work, 'npm-cache'), ...args], {
    cwd: work,
    encoding: 'utf8',
  });

  const source = resolve(__dirname, '../packages/ddl-to-mermaid');
  const [packed] = JSON.parse(npm('pack', source, '--json'));
  assert.ok(packed.files.some((file) => file.path === 'LICENSE'));
  writeFileSync(join(work, 'package.json'), '{"private":true}');
  npm('install', `./${packed.filename}`, '--offline', '--ignore-scripts', '--no-audit', '--no-fund');

  const example = 'node_modules/uml-studio-ddl-to-mermaid/examples/convert.mjs';
  const output = execFileSync(process.execPath, [example], { cwd: work, encoding: 'utf8' });
  assert.match(output, /^%% Database Schema\nerDiagram\n/);
  assert.match(output, /\["users"\]/);
  assert.match(output, /\["posts"\]/);
  assert.match(output, /BIGINT user_id FK/);
  assert.match(output, /\}o\.\.\|\| .+ : "posts_user_id_fk"/);

  execFileSync(process.execPath, ['-e', `
    const assert = require('node:assert/strict');
    const before = Object.keys(globalThis).filter(key => key.startsWith('UML'));
    const { ddlToMermaid } = require('uml-studio-ddl-to-mermaid');
    const { erd } = ddlToMermaid('CREATE TABLE books (owner_id BIGINT REFERENCES users(id));');
    assert.equal(erd.diagrams[0].name, 'Imported DDL');
    assert.equal(erd.importMeta.linkedForeignKeys, 0);
    assert.equal(erd.importMeta.warnings.length, 1);
    assert.equal(JSON.parse(JSON.stringify(erd)).importMeta.tables, 1);
    assert.throws(() => ddlToMermaid('ALTER TABLE users ADD COLUMN name VARCHAR(120);'), /DDL 1:1/);
    assert.throws(() => ddlToMermaid(null), TypeError);
    assert.deepEqual(Object.keys(globalThis).filter(key => key.startsWith('UML')), before);
  `], { cwd: work });
});
