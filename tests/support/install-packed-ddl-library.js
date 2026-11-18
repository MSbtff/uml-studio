'use strict';

const { execFileSync } = require('node:child_process');
const { writeFileSync } = require('node:fs');
const { join, resolve } = require('node:path');

function installPackedDdlLibrary(work) {
  const npm = (...args) => execFileSync('npm', ['--cache', join(work, 'npm-cache'), ...args], {
    cwd: work,
    encoding: 'utf8',
  });

  const source = resolve(__dirname, '../../packages/ddl-to-mermaid');
  const [packed] = JSON.parse(npm('pack', source, '--json'));
  writeFileSync(join(work, 'package.json'), '{"private":true}');
  npm('install', `./${packed.filename}`, '--offline', '--ignore-scripts', '--no-audit', '--no-fund');
  return packed;
}

module.exports = { installPackedDdlLibrary };
