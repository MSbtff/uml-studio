'use strict';

/* ERD cardinality helpers shared by canvas rendering, editors and exporters.
   Existing sourceLabel/targetLabel values remain valid for project compatibility. */
type ErdCardinalityApi = ReturnType<typeof createErdCardinality>;
declare var UMLErdCardinality: ErdCardinalityApi;

(function initErdCardinality(root: typeof globalThis & { UMLErdCardinality?: ErdCardinalityApi }, factory: () => ErdCardinalityApi) {
  const api = factory();
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.UMLErdCardinality = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, createErdCardinality);

function createErdCardinality() {
  const { text: uiText } = globalThis.UMLLanguage
    ?? require('../editor/language.js') as typeof UMLLanguage;

  const ERD_CARDINALITY_OPTIONS = [
    ['0..1', uiText('0..1 · Zero or one', '0..1 · 선택 한 개')],
    ['1', uiText('1 · Exactly one', '1 · 필수 한 개')],
    ['0..N', uiText('0..N · Zero or more', '0..N · 선택 여러 개')],
    ['1..N', uiText('1..N · One or more', '1..N · 필수 여러 개')],
  ];
  type Cardinality = '0..1' | '1' | '0..N' | '1..N';
  type ParsedCardinality = { min: 'zero' | 'one'; max: 'one' | 'many'; canonical: Cardinality };

  const DEFAULTS: Partial<Record<string, [Cardinality, Cardinality]>> = {
    'erd-11': ['1', '1'],
    'erd-1n': ['1', '1..N'],
    'erd-nm': ['1..N', '1..N'],
  };

  function erdDefaultCardinality(kind: string, end: string | number): Cardinality {
    const values = DEFAULTS[kind] || ['1', '1'];
    return values[end === 'target' || end === 1 ? 1 : 0];
  }

  function parseErdCardinality(value: unknown, fallback = '1'): ParsedCardinality {
    const raw = String(value == null || value === '' ? fallback : value).trim().toUpperCase()
      .replace(/\s+/g, '');
    if (['0..1', '0:1', 'ZEROORONE', 'ONEORZERO'].includes(raw)) {
      return { min: 'zero', max: 'one', canonical: '0..1' };
    }
    if (['1', '1..1', 'ONLYONE', 'ONE'].includes(raw)) {
      return { min: 'one', max: 'one', canonical: '1' };
    }
    if (/^(?:0\.\.(?:\*|N|M)|0\+|ZEROOR(?:MORE|MANY)|MANY\(0\))$/.test(raw)) {
      return { min: 'zero', max: 'many', canonical: '0..N' };
    }
    if (/^(?:1\.\.(?:\*|N|M)|1\+|N|M|MANY|ONEOR(?:MORE|MANY)|MANY\(1\))$/.test(raw)) {
      return { min: 'one', max: 'many', canonical: '1..N' };
    }
    if (raw === '*') return { min: 'zero', max: 'many', canonical: '0..N' };
    const range = raw.match(/^(\d+)\.\.(\d+|\*|N|M)$/);
    if (range) {
      return {
        min: range[1] === '0' ? 'zero' : 'one',
        max: range[2] === '1' ? 'one' : 'many',
        canonical: range[1] === '0'
          ? (range[2] === '1' ? '0..1' : '0..N')
          : (range[2] === '1' ? '1' : '1..N'),
      };
    }
    return parseErdCardinality(fallback === value ? '1' : fallback, '1');
  }

  function normalizeErdCardinality(value: unknown, fallback = '1') {
    return parseErdCardinality(value, fallback).canonical;
  }

  function erdMermaidMarker(value: unknown, fallback: string, side: 'left' | 'right') {
    const cardinality = parseErdCardinality(value, fallback);
    if (side === 'left') {
      if (cardinality.max === 'one') return cardinality.min === 'zero' ? '|o' : '||';
      return cardinality.min === 'zero' ? '}o' : '}|';
    }
    if (cardinality.max === 'one') return cardinality.min === 'zero' ? 'o|' : '||';
    return cardinality.min === 'zero' ? 'o{' : '|{';
  }

  function erdDrawioArrow(value: unknown, fallback: string) {
    const cardinality = parseErdCardinality(value, fallback);
    if (cardinality.max === 'one') return cardinality.min === 'zero' ? 'ERzeroToOne' : 'ERmandOne';
    return cardinality.min === 'zero' ? 'ERzeroToMany' : 'ERoneToMany';
  }

  return {
    ERD_CARDINALITY_OPTIONS,
    erdDefaultCardinality,
    parseErdCardinality,
    normalizeErdCardinality,
    erdMermaidMarker,
    erdDrawioArrow,
  };
}
