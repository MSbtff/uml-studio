'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const { join } = require('node:path');
const { test } = require('node:test');
const vm = require('node:vm');

const filename = join(__dirname, '..', 'dist', 'browser', 'editor', 'language.js');
const source = fs.readFileSync(filename, 'utf8');

function loadBrowserLanguage(localStorage) {
  const context = { localStorage };
  vm.runInNewContext(source, context, { filename });
  return context.UMLLanguage;
}

test('browser locale uses the saved value and defaults to English when storage is unavailable', () => {
  const preferences = new Map([['uml-studio-language', 'unexpected']]);
  const storage = {
    getItem: (key) => preferences.get(key),
    setItem: (key, value) => preferences.set(key, value),
  };
  const english = loadBrowserLanguage(storage);
  assert.equal(english.current, 'en');
  assert.equal(english.locale, 'en-US');
  assert.equal(english.text('{1} has {0} rows.', '{1}: {0}행', 2, 'Orders'), 'Orders has 2 rows.');
  const tool = { label: 'Lifeline', labelKo: '라이프라인' };
  assert.equal(english.displayLabel(tool), 'Lifeline');
  english.save('ko');

  const korean = loadBrowserLanguage(storage);
  assert.equal(korean.current, 'ko');
  assert.equal(korean.displayLabel(tool), '라이프라인');
  assert.equal(korean.displayLabel({ label: 'Custom' }), 'Custom');
  assert.equal(korean.displayLabel(undefined, 'unknown'), 'unknown');
  assert.equal(korean.label('{0} view', '뷰 {0}개', 1), '뷰 1개');
  assert.equal(korean.label('Settings', '설정'), '설정');
  assert.equal(korean.text('{1} has {0} rows.', '{1}: {0}행', 2, 'Orders'), 'Orders: 2행');
  assert.equal(loadBrowserLanguage(undefined).current, 'en');
});

test('CommonJS diagnostics and pre-existing English labels retain their text', () => {
  const language = require(filename);
  assert.equal(language.text('Invalid column.', '컬럼이 올바르지 않습니다.'), '컬럼이 올바르지 않습니다.');
  assert.equal(language.label('Settings', '설정'), 'Settings');
});
