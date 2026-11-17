'use strict';

/* ERD column expression parser/formatter shared by the editor and tests.
   Storage stays compatible with the existing compact text representation:
   "PK FK UQ NN physical_name <논리명>: TYPE". */
(function initErdColumn<Api>(root: typeof globalThis & { UMLErdColumn?: Api }, factory: () => Api) {
  const api = factory();
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.UMLErdColumn = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function createErdColumn() {
  const FLAG_ORDER = ['PK', 'FK', 'UQ', 'NN'];
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
    while ((match = rest.match(/^(PK|FK|UQ|NN)\b[,\s]*/i))) {
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
    parts.push(value.phys);
    let result = parts.filter(Boolean).join(' ');
    if (value.logical) result += ` <${value.logical}>`;
    if (value.type) result += `: ${value.type}`;
    return result;
  }

  function validateColumn(column: ColumnInput | null | undefined, existingColumns: unknown[] = [], editIndex = -1) {
    const value = normalizeColumn(column);
    if (!value.phys) return { valid: false, field: 'phys', error: '물리명을 입력하세요.' };
    if (value.phys.length > MAX_NAME_LENGTH) {
      return { valid: false, field: 'phys', error: `물리명은 ${MAX_NAME_LENGTH}자 이하여야 합니다.` };
    }
    if (/[<>:\r\n]/.test(value.phys)) {
      return { valid: false, field: 'phys', error: '물리명에는 <, >, : 또는 줄바꿈을 사용할 수 없습니다.' };
    }
    if (value.logical.length > MAX_NAME_LENGTH) {
      return { valid: false, field: 'logical', error: `논리명은 ${MAX_NAME_LENGTH}자 이하여야 합니다.` };
    }
    if (/[<>:\r\n]/.test(value.logical)) {
      return { valid: false, field: 'logical', error: '논리명에는 <, >, : 또는 줄바꿈을 사용할 수 없습니다.' };
    }
    if (value.type.length > MAX_TYPE_LENGTH) {
      return { valid: false, field: 'type', error: `데이터 타입은 ${MAX_TYPE_LENGTH}자 이하여야 합니다.` };
    }
    if (/[:\r\n]/.test(value.type)) {
      return { valid: false, field: 'type', error: '데이터 타입에는 : 또는 줄바꿈을 사용할 수 없습니다.' };
    }
    const duplicate = (Array.isArray(existingColumns) ? existingColumns : []).some((raw, index) =>
      index !== editIndex && parseColumn(raw).phys.trim().toLowerCase() === value.phys.toLowerCase());
    if (duplicate) {
      return { valid: false, field: 'phys', error: `'${value.phys}' 컬럼이 이미 있습니다.` };
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
});
