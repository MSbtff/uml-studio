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

  const types = join(work, 'consumer.mts');
  writeFileSync(types, `
    import { ddlToMermaid, type DdlConversion, type ImportedErd } from 'uml-studio-ddl-to-mermaid';
    const output: DdlConversion = ddlToMermaid('CREATE TABLE books (id BIGINT);');
    const erd: ImportedErd = output.erd;
    const name: string = erd.diagrams[0].name;
    // @ts-expect-error The package accepts SQL strings.
    ddlToMermaid(1);
  `);
  const compiler = resolve(__dirname, '../node_modules/typescript/bin/tsc');
  execFileSync(process.execPath, [
    compiler, '--strict', '--noEmit', '--module', 'NodeNext', '--target', 'ES2022', types,
  ], { cwd: work });

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
    const names = ddlToMermaid('CREATE TABLE stock ("PK" INTEGER PRIMARY KEY, "FK value" TEXT, "UK" TEXT, "자재" TEXT, "수량" INTEGER, "item name" TEXT, item_name TEXT);');
    assert.deepEqual(Object.values(names.erd.models)[0].columns.slice(0, 2), [
      'PK "PK": INTEGER', '"FK value": TEXT',
    ]);
    assert.match(names.mermaid, /INTEGER T_PK PK "PK"/);
    assert.match(names.mermaid, /TEXT T_UK "UK"/);
    assert.match(names.mermaid, /TEXT 자재$/m);
    assert.match(names.mermaid, /INTEGER 수량$/m);
    assert.match(names.mermaid, /TEXT item_name "item name"/);
    assert.match(names.mermaid, /TEXT item_name_2 "item_name"/);
    assert.throws(() => ddlToMermaid('ALTER TABLE users ADD COLUMN name VARCHAR(120);'), /DDL 1:1/);
    assert.throws(() => ddlToMermaid(null), TypeError);
    assert.deepEqual(Object.keys(globalThis).filter(key => key.startsWith('UML')), before);
  `], { cwd: work });
});
