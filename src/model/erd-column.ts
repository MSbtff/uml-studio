'use strict';

interface ErdColumnValue {
  flags: string[];
  phys: string;
  logical: string;
  type: string;
}

type ErdColumnValidation =
  | { valid: true; column: ErdColumnValue; value: string }
  | { valid: false; field: 'phys' | 'logical' | 'type'; error: string };

/* ERD column expression parser/formatter shared by the editor and tests.
   Storage stays compatible with the existing compact text representation:
   "PK FK UQ NN physical_name <논리명>: TYPE". */
type ErdColumnApi = ReturnType<typeof createErdColumn>;
declare var UMLErdColumn: ErdColumnApi;

(function initErdColumn(root: typeof globalThis & { UMLErdColumn?: ErdColumnApi }, factory: () => ErdColumnApi) {
  const api = factory();
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.UMLErdColumn = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, createErdColumn);

function createErdColumn() {
  const { text: uiText } = globalThis.UMLLanguage
    ?? require('../editor/language.js') as typeof UMLLanguage;

  const FLAG_ORDER = ['PK', 'FK', 'UQ', 'NN'];
  const FLAG_PREFIX = /^(PK|FK|UQ|NN)\b[,\s]*/i;
  const MAX_NAME_LENGTH = 120;
  const MAX_TYPE_LENGTH = 160;
  type ColumnInput = { flags?: unknown; phys?: unknown; logical?: unknown; type?: unknown };

  function orderedFlags(flags: unknown) {
    const values = new Set((Array.isArray(flags) ? flags : [])
      .map(flag => String(flag || '').toUpperCase())
      .filter(flag => FLAG_ORDER.includes(flag)));
    return FLAG_ORDER.filter(flag => values.has(flag));
  }

  function parseColumn(raw: unknown) {
    let rest = String(raw || '').trim();
    const flags = [];
    let match;
    while ((match = rest.match(FLAG_PREFIX))) {
      flags.push(match[1].toUpperCase());
      rest = rest.slice(match[0].length);
    }
    let type = '';
    const colonAt = rest.lastIndexOf(':');
    if (colonAt >= 0) {
      type = rest.slice(colonAt + 1).trim();
      rest = rest.slice(0, colonAt).trim();
    }
    let logical = '';
    const logicalMatch = rest.match(/<([^>]*)>\s*$/);
    if (logicalMatch) {
      logical = logicalMatch[1].trim();
      rest = rest.slice(0, logicalMatch.index).trim();
    }
    const quotedName = rest.match(/^"((?:[^"]|"")*)"$/);
    if (quotedName) rest = quotedName[1].replace(/""/g, '"');
    return { flags: orderedFlags(flags), phys: rest, logical, type };
  }

  function normalizeColumn(column?: ColumnInput | null) {
    const value = column || {};
    return {
      flags: orderedFlags(value.flags),
      phys: String(value.phys || '').trim(),
      logical: String(value.logical || '').trim(),
      type: String(value.type || '').trim(),
    };
  }

  function formatColumn(column?: ColumnInput | null) {
    const value = normalizeColumn(column);
    const parts = [];
    if (value.flags.length) parts.push(value.flags.join(' '));
    // Quote names that would otherwise be read as flags, or as quoted names.
    const phys = FLAG_PREFIX.test(value.phys) || value.phys.startsWith('"')
      ? `"${value.phys.replace(/"/g, '""')}"` : value.phys;
    parts.push(phys);
    let result = parts.filter(Boolean).join(' ');
    if (value.logical) result += ` <${value.logical}>`;
    if (value.type) result += `: ${value.type}`;
    return result;
  }

  function validateColumn(column: ColumnInput | null | undefined, existingColumns: unknown[] = [], editIndex = -1): ErdColumnValidation {
    const value = normalizeColumn(column);
    if (!value.phys) return { valid: false, field: 'phys', error: uiText('Enter a physical name.', '물리명을 입력하세요.') };
    if (value.phys.length > MAX_NAME_LENGTH) {
      return { valid: false, field: 'phys', error: uiText(
        'The physical name must be at most {0} characters.',
        '물리명은 {0}자 이하여야 합니다.',
        MAX_NAME_LENGTH,
      ) };
    }
    if (/[<>:\r\n]/.test(value.phys)) {
      return { valid: false, field: 'phys', error: uiText(
        'The physical name cannot contain <, >, :, or line breaks.',
        '물리명에는 <, >, : 또는 줄바꿈을 사용할 수 없습니다.',
      ) };
    }
    if (value.logical.length > MAX_NAME_LENGTH) {
      return { valid: false, field: 'logical', error: uiText(
        'The logical name must be at most {0} characters.',
        '논리명은 {0}자 이하여야 합니다.',
        MAX_NAME_LENGTH,
      ) };
    }
    if (/[<>:\r\n]/.test(value.logical)) {
      return { valid: false, field: 'logical', error: uiText(
        'The logical name cannot contain <, >, :, or line breaks.',
        '논리명에는 <, >, : 또는 줄바꿈을 사용할 수 없습니다.',
      ) };
    }
    if (value.type.length > MAX_TYPE_LENGTH) {
      return { valid: false, field: 'type', error: uiText(
        'The data type must be at most {0} characters.',
        '데이터 타입은 {0}자 이하여야 합니다.',
        MAX_TYPE_LENGTH,
      ) };
    }
    if (/[:\r\n]/.test(value.type)) {
      return { valid: false, field: 'type', error: uiText('The data type cannot contain : or line breaks.', '데이터 타입에는 : 또는 줄바꿈을 사용할 수 없습니다.') };
    }
    const duplicate = (Array.isArray(existingColumns) ? existingColumns : []).some((raw, index) =>
      index !== editIndex && parseColumn(raw).phys.trim().toLowerCase() === value.phys.toLowerCase());
    if (duplicate) {
      return { valid: false, field: 'phys', error: uiText('Column \'{0}\' already exists.', '\'{0}\' 컬럼이 이미 있습니다.', value.phys) };
    }
    return { valid: true, column: value, value: formatColumn(value) };
  }

  function copiedColumnValue(raw: unknown, existingColumns: unknown[] = []) {
    const column = parseColumn(raw);
    const usedNames = new Set((Array.isArray(existingColumns) ? existingColumns : [])
      .map(value => parseColumn(value).phys.trim().toLowerCase())
      .filter(Boolean));
    const baseName = column.phys || 'column';
    let nextName = baseName;
    let copyNumber = 1;
    while (usedNames.has(nextName.toLowerCase())) {
      nextName = `${baseName}_copy${copyNumber === 1 ? '' : copyNumber}`;
      copyNumber++;
    }
    return formatColumn({ ...column, phys: nextName });
  }

  function reorderColumns<T>(columns: readonly T[] | null | undefined, fromIndex: unknown, targetIndex: unknown): T[] {
    const values = Array.isArray(columns) ? [...columns] : [];
    const from = Number(fromIndex);
    const target = Number(targetIndex);
    if (!Number.isInteger(from) || !Number.isInteger(target)
      || from < 0 || from >= values.length
      || target < 0 || target >= values.length
      || from === target) return values;
    const [column] = values.splice(from, 1);
    values.splice(target, 0, column);
    return values;
  }

  return { FLAG_ORDER, parseColumn, formatColumn, validateColumn, copiedColumnValue, reorderColumns };
}
