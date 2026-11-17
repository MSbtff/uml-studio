// @ts-nocheck
'use strict';

/* ERD table constraints and indexes shared by editing, DDL import/export,
   persistence validation, and tests. Column names remain the stable join key
   so older projects that only contain the compact `columns` array still load. */
(function initErdSchema(root, factory) {
  const api = factory();
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.UMLErdSchema = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function createErdSchema() {
  const MAX_EXPRESSION_LENGTH = 4000;
  const MAX_SCHEMA_ITEMS = 500;
  const MAX_INDEX_COLUMNS = 32;
  const MAX_NAME_LENGTH = 120;
  const ERD_REFERENTIAL_ACTIONS = Object.freeze([
    'NO ACTION', 'RESTRICT', 'CASCADE', 'SET NULL', 'SET DEFAULT',
  ]);
  const ERD_REFERENTIAL_ACTION_OPTIONS = Object.freeze([
    Object.freeze(['', '(DB 기본값 · NO ACTION)']),
    ...ERD_REFERENTIAL_ACTIONS.map(value => Object.freeze([value, value])),
  ]);
  const ERD_RELATION_KINDS = new Set(['erd-11', 'erd-1n', 'erd-nm']);

  const sameName = (left, right) => String(left || '').trim().toLocaleLowerCase()
    === String(right || '').trim().toLocaleLowerCase();

  function schemaName(value, description, allowEmpty = true) {
    if (value !== undefined && value !== null && typeof value !== 'string') {
      throw new Error(`${description} 이름은 문자열이어야 합니다.`);
    }
    const name = String(value || '').trim();
    if (!name && allowEmpty) return '';
    if (!name) throw new Error(`${description} 이름이 없습니다.`);
    if (name.length > MAX_NAME_LENGTH) throw new Error(`${description} 이름은 ${MAX_NAME_LENGTH}자 이하여야 합니다.`);
    if (/\0|[\r\n]/.test(name)) throw new Error(`${description} 이름에 제어 문자를 사용할 수 없습니다.`);
    return name;
  }

  function safeSqlFragment(value, description = 'SQL 표현식', allowEmpty = false) {
    if (value !== undefined && value !== null && typeof value !== 'string') {
      throw new Error(`${description}은(는) 문자열이어야 합니다.`);
    }
    const source = String(value == null ? '' : value).trim();
    if (!source && allowEmpty) return '';
    if (!source) throw new Error(`${description}이(가) 비어 있습니다.`);
    if (source.length > MAX_EXPRESSION_LENGTH) {
      throw new Error(`${description}은(는) ${MAX_EXPRESSION_LENGTH}자 이하여야 합니다.`);
    }
    let quote = '';
    let depth = 0;
    for (let index = 0; index < source.length; index++) {
      const char = source[index];
      const next = source[index + 1];
      if (quote) {
        const close = quote === '[' ? ']' : quote;
        if (char === close) {
          if (next === close) { index++; continue; }
          quote = '';
        } else if (quote === '\'' && char === '\\' && next) index++;
        continue;
      }
      if (char === '$') {
        const marker = source.slice(index).match(/^\$(?:[A-Za-z_][A-Za-z0-9_]*)?\$/)?.[0];
        if (marker) {
          const close = source.indexOf(marker, index + marker.length);
          if (close < 0) throw new Error(`${description}의 PostgreSQL dollar 문자열이 닫히지 않았습니다.`);
          index = close + marker.length - 1;
          continue;
        }
      }
      if (char === '\'' || char === '"' || char === '`' || char === '[') {
        quote = char;
        continue;
      }
      if (char === '\0' || char === '\r' || char === '\n') {
        throw new Error(`${description}에 제어 문자나 줄바꿈을 사용할 수 없습니다.`);
      }
      if (char === ';' || (char === '-' && next === '-') || (char === '/' && next === '*')
        || (char === '#' && next !== '>')) {
        throw new Error(`${description}에 SQL 문장 구분자나 주석을 사용할 수 없습니다.`);
      }
      if (char === '(') depth++;
      if (char === ')') {
        depth--;
        if (depth < 0) throw new Error(`${description}의 괄호가 올바르지 않습니다.`);
      }
    }
    if (quote) throw new Error(`${description}의 문자열 또는 식별자가 닫히지 않았습니다.`);
    if (depth !== 0) throw new Error(`${description}의 괄호가 올바르지 않습니다.`);
    return source;
  }

  function normalizeReferentialAction(value, description = 'FK 참조 동작') {
    if (value === undefined) return '';
    if (typeof value !== 'string') throw new Error(`${description}은(는) 문자열이어야 합니다.`);
    const action = value.trim().replace(/\s+/g, ' ').toUpperCase();
    if (!action) return '';
    if (!ERD_REFERENTIAL_ACTIONS.includes(action)) {
      throw new Error(`${description}이(가) 올바르지 않습니다: ${value}`);
    }
    return action;
  }

  function validateReferentialActions(relation) {
    return {
      onDelete: normalizeReferentialAction(relation?.foreignKeyOnDelete, 'FK ON DELETE'),
      onUpdate: normalizeReferentialAction(relation?.foreignKeyOnUpdate, 'FK ON UPDATE'),
    };
  }

  function normalizeColumnDetails(value) {
    if (value === undefined || value === null) return {};
    if (!value || typeof value !== 'object' || Array.isArray(value)) {
      throw new Error('ERD 컬럼 상세 정보가 객체가 아닙니다.');
    }
    const result = {};
    const entries = Object.entries(value);
    if (entries.length > MAX_SCHEMA_ITEMS) throw new Error(`ERD 컬럼 상세 정보는 ${MAX_SCHEMA_ITEMS}개 이하여야 합니다.`);
    entries.forEach(([rawName, rawDetails]) => {
      const name = schemaName(rawName, 'ERD 컬럼', false);
      if (!rawDetails || typeof rawDetails !== 'object' || Array.isArray(rawDetails)) {
        throw new Error(`'${name}' 컬럼 상세 정보가 올바르지 않습니다.`);
      }
      const defaultValue = safeSqlFragment(rawDetails.defaultValue, `'${name}' DEFAULT`, true);
      const uniqueName = schemaName(rawDetails.uniqueName, `'${name}' UNIQUE`, true);
      if (defaultValue || uniqueName) result[name] = { ...(defaultValue ? { defaultValue } : {}), ...(uniqueName ? { uniqueName } : {}) };
    });
    return result;
  }

  function normalizeErdChecks(value, columnNames = []) {
    if (value === undefined || value === null) return [];
    if (!Array.isArray(value) || value.length > MAX_SCHEMA_ITEMS) {
      throw new Error(`ERD CHECK 목록은 배열이며 ${MAX_SCHEMA_ITEMS}개 이하여야 합니다.`);
    }
    const columns = Array.isArray(columnNames) ? columnNames : [];
    const names = new Set();
    return value.map((raw, index) => {
      if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
        throw new Error(`ERD CHECK ${index + 1} 정보가 올바르지 않습니다.`);
      }
      const name = schemaName(raw.name, `ERD CHECK ${index + 1}`, true);
      const expression = safeSqlFragment(raw.expression, `ERD CHECK ${name || index + 1}`);
      const column = schemaName(raw.column, `ERD CHECK ${name || index + 1} 컬럼`, true);
      if (column && columns.length && !columns.some(value => sameName(value, column))) {
        throw new Error(`ERD CHECK '${name || expression}'의 컬럼을 찾을 수 없습니다: ${column}`);
      }
      const key = name.toLocaleLowerCase();
      if (key && names.has(key)) throw new Error(`중복된 ERD CHECK 이름입니다: ${name}`);
      if (key) names.add(key);
      return { name, expression, column };
    });
  }

  function normalizeErdIndexes(value, columnNames = []) {
    if (value === undefined || value === null) return [];
    if (!Array.isArray(value) || value.length > MAX_SCHEMA_ITEMS) {
      throw new Error(`ERD 인덱스 목록은 배열이며 ${MAX_SCHEMA_ITEMS}개 이하여야 합니다.`);
    }
    const available = Array.isArray(columnNames) ? columnNames : [];
    const names = new Set();
    return value.map((raw, index) => {
      if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
        throw new Error(`ERD 인덱스 ${index + 1} 정보가 올바르지 않습니다.`);
      }
      if (raw.kind !== undefined && raw.kind !== 'unique' && raw.kind !== 'index') {
        throw new Error(`ERD 인덱스 ${index + 1} 종류가 올바르지 않습니다: ${raw.kind}`);
      }
      if (raw.unique !== undefined && typeof raw.unique !== 'boolean') {
        throw new Error(`ERD 인덱스 ${index + 1} Unique 값이 올바르지 않습니다.`);
      }
      const kind = raw.kind === 'unique' ? 'unique' : 'index';
      const name = schemaName(raw.name, `ERD ${kind === 'unique' ? 'UNIQUE' : '인덱스'} ${index + 1}`, true);
      const columns = Array.isArray(raw.columns) ? raw.columns : [];
      if (!columns.length || columns.length > MAX_INDEX_COLUMNS) {
        throw new Error(`ERD ${name || index + 1} 인덱스 컬럼은 1~${MAX_INDEX_COLUMNS}개여야 합니다.`);
      }
      const normalizedColumns = columns.map((entry, columnIndex) => {
        const source = typeof entry === 'string' ? { name: entry } : entry;
        if (!source || typeof source !== 'object' || Array.isArray(source)) {
          throw new Error(`ERD 인덱스 '${name || index + 1}'의 ${columnIndex + 1}번째 컬럼이 올바르지 않습니다.`);
        }
        const columnName = schemaName(source.name, `ERD 인덱스 '${name || index + 1}' 컬럼`, false);
        if (available.length && !available.some(value => sameName(value, columnName))) {
          throw new Error(`ERD 인덱스 '${name || index + 1}'의 컬럼을 찾을 수 없습니다: ${columnName}`);
        }
        if (source.order !== undefined && typeof source.order !== 'string') {
          throw new Error(`ERD 인덱스 '${name || index + 1}'의 정렬 방향이 문자열이 아닙니다.`);
        }
        const order = String(source.order || '').trim().toUpperCase();
        if (order && order !== 'ASC' && order !== 'DESC') {
          throw new Error(`ERD 인덱스 '${name || index + 1}'의 정렬 방향이 올바르지 않습니다: ${order}`);
        }
        return { name: columnName, order };
      });
      const unique = kind === 'unique' ? true : raw.unique === true;
      const where = safeSqlFragment(raw.where, `ERD 인덱스 '${name || index + 1}' WHERE`, true);
      const key = name.toLocaleLowerCase();
      if (key && names.has(key)) throw new Error(`중복된 ERD 인덱스 이름입니다: ${name}`);
      if (key) names.add(key);
      return { kind, name, unique, columns: normalizedColumns, where };
    });
  }

  function columnDetailsFor(entity, columnName) {
    const details = normalizeColumnDetails(entity?.erdColumnDetails);
    const key = Object.keys(details).find(name => sameName(name, columnName));
    return key ? { ...details[key] } : { defaultValue: '', uniqueName: '' };
  }

  function replaceColumnDetails(entity, details) {
    const normalized = normalizeColumnDetails(details);
    if (Object.keys(normalized).length) entity.erdColumnDetails = normalized;
    else delete entity.erdColumnDetails;
  }

  function setColumnDetails(entity, columnName, details) {
    const current = normalizeColumnDetails(entity?.erdColumnDetails);
    Object.keys(current).filter(name => sameName(name, columnName)).forEach(name => delete current[name]);
    const normalized = normalizeColumnDetails({ [columnName]: details });
    Object.assign(current, normalized);
    replaceColumnDetails(entity, current);
  }

  function rewriteIdentifier(expression, oldName, newName) {
    const source = String(expression || '');
    let result = '';
    let index = 0;
    while (index < source.length) {
      const char = source[index];
      if (char === '$') {
        const marker = source.slice(index).match(/^\$(?:[A-Za-z_][A-Za-z0-9_]*)?\$/)?.[0];
        if (marker) {
          const close = source.indexOf(marker, index + marker.length);
          const end = close < 0 ? source.length : close + marker.length;
          result += source.slice(index, end);
          index = end;
          continue;
        }
      }
      if (char === '\'' || char === '"' || char === '`' || char === '[') {
        const close = char === '[' ? ']' : char;
        const start = index++;
        let value = '';
        while (index < source.length) {
          if (source[index] === close) {
            if (source[index + 1] === close) { value += close; index += 2; continue; }
            index++;
            break;
          }
          if (char === '\'' && source[index] === '\\' && index + 1 < source.length) {
            value += source[index] + source[index + 1]; index += 2; continue;
          }
          value += source[index++];
        }
        if (char !== '\'' && sameName(value, oldName)) {
          const escaped = String(newName).replaceAll(close, close + close);
          result += `${char}${escaped}${close}`;
        } else result += source.slice(start, index);
        continue;
      }
      if (/[_\p{L}]/u.test(char)) {
        const start = index++;
        while (index < source.length && /[_$\p{L}\p{N}]/u.test(source[index])) index++;
        const word = source.slice(start, index);
        result += sameName(word, oldName) ? newName : word;
        continue;
      }
      result += char;
      index++;
    }
    return result;
  }

  function renameColumnSchema(entity, oldName, newName) {
    if (!entity || !oldName || !newName || String(oldName).trim() === String(newName).trim()) return false;
    const details = normalizeColumnDetails(entity.erdColumnDetails);
    const oldKey = Object.keys(details).find(name => sameName(name, oldName));
    if (oldKey) {
      const value = details[oldKey];
      delete details[oldKey];
      details[newName] = value;
      replaceColumnDetails(entity, details);
    }
    const checks = normalizeErdChecks(entity.erdChecks);
    entity.erdChecks = checks.map(check => ({
      ...check,
      column: sameName(check.column, oldName) ? newName : check.column,
      expression: rewriteIdentifier(check.expression, oldName, newName),
    }));
    if (!entity.erdChecks.length) delete entity.erdChecks;
    const indexes = normalizeErdIndexes(entity.erdIndexes);
    entity.erdIndexes = indexes.map(index => ({
      ...index,
      columns: index.columns.map(column => ({
        ...column, name: sameName(column.name, oldName) ? newName : column.name,
      })),
      where: index.where ? rewriteIdentifier(index.where, oldName, newName) : '',
    }));
    if (!entity.erdIndexes.length) delete entity.erdIndexes;
    return true;
  }

  function foreignKeyColumnImpacts(models, entityModelId, columnName) {
    if (!models || typeof models !== 'object' || !entityModelId || !columnName) return [];
    const impacts = [];
    Object.entries(models).forEach(([relationModelId, relation]) => {
      if (!relation || typeof relation !== 'object' || !ERD_RELATION_KINDS.has(relation.kind)) return;
      const fields = [];
      if (relation.fromModelId === entityModelId && sameName(relation.sourceColumnName, columnName)) {
        fields.push('sourceColumnName');
      }
      if (relation.toModelId === entityModelId && sameName(relation.targetColumnName, columnName)) {
        fields.push('targetColumnName');
      }
      if (fields.length) impacts.push({
        fields,
        relationModelId,
        relationName: String(relation.name || '').trim(),
      });
    });
    return impacts;
  }

  function renameForeignKeyColumnReferences(models, entityModelId, oldName, newName) {
    const source = String(oldName || '').trim();
    const target = String(newName || '').trim();
    if (!source || !target || source === target) return { references: 0, relations: 0 };
    const impacts = foreignKeyColumnImpacts(models, entityModelId, source);
    let references = 0;
    impacts.forEach(impact => {
      const relation = models[impact.relationModelId];
      impact.fields.forEach(field => {
        relation[field] = target;
        references++;
      });
    });
    return { references, relations: impacts.length };
  }

  function disconnectForeignKeyColumnReferences(models, entityModelId, columnName) {
    const impacts = foreignKeyColumnImpacts(models, entityModelId, columnName);
    impacts.forEach(impact => {
      const relation = models[impact.relationModelId];
      relation.foreignKeyEnd = '';
      relation.sourceColumnName = '';
      relation.targetColumnName = '';
      relation.foreignKeyOnDelete = '';
      relation.foreignKeyOnUpdate = '';
    });
    return { impacts, relations: impacts.length };
  }

  function deleteColumnSchema(entity, columnName) {
    if (!entity || !columnName) return { checks: 0, indexes: 0, details: 0 };
    const details = normalizeColumnDetails(entity.erdColumnDetails);
    const detailKeys = Object.keys(details).filter(name => sameName(name, columnName));
    detailKeys.forEach(name => delete details[name]);
    replaceColumnDetails(entity, details);
    const checks = normalizeErdChecks(entity.erdChecks);
    const keptChecks = checks.filter(check => !sameName(check.column, columnName));
    if (keptChecks.length) entity.erdChecks = keptChecks;
    else delete entity.erdChecks;
    const indexes = normalizeErdIndexes(entity.erdIndexes);
    const keptIndexes = indexes.filter(index => !index.columns.some(column => sameName(column.name, columnName)));
    if (keptIndexes.length) entity.erdIndexes = keptIndexes;
    else delete entity.erdIndexes;
    return {
      details: detailKeys.length,
      checks: checks.length - keptChecks.length,
      indexes: indexes.length - keptIndexes.length,
    };
  }

  function copyColumnSchema(entity, columnName) {
    return {
      sourceColumn: columnName,
      details: columnDetailsFor(entity, columnName),
      checks: normalizeErdChecks(entity?.erdChecks)
        .filter(check => sameName(check.column, columnName))
        .map(check => ({ ...check, name: '' })),
    };
  }

  function applyCopiedColumnSchema(entity, columnName, copied) {
    if (!entity || !columnName || !copied) return;
    setColumnDetails(entity, columnName, { ...(copied.details || {}), uniqueName: '' });
    const existing = normalizeErdChecks(entity.erdChecks);
    const additions = normalizeErdChecks(copied.checks || []).map(check => ({
      ...check,
      name: '',
      column: columnName,
      expression: copied.sourceColumn
        ? rewriteIdentifier(check.expression, copied.sourceColumn, columnName)
        : check.expression,
    }));
    if (additions.length) entity.erdChecks = [...existing, ...additions];
  }

  function validateEntitySchema(entity, columnNames) {
    const available = Array.isArray(columnNames) ? columnNames : [];
    const details = normalizeColumnDetails(entity?.erdColumnDetails);
    Object.keys(details).forEach(name => {
      if (available.length && !available.some(column => sameName(column, name))) {
        throw new Error(`ERD 컬럼 상세 정보의 컬럼을 찾을 수 없습니다: ${name}`);
      }
    });
    return {
      columnDetails: details,
      checks: normalizeErdChecks(entity?.erdChecks, available),
      indexes: normalizeErdIndexes(entity?.erdIndexes, available),
    };
  }

  return Object.freeze({
    MAX_EXPRESSION_LENGTH,
    MAX_SCHEMA_ITEMS,
    MAX_INDEX_COLUMNS,
    ERD_REFERENTIAL_ACTIONS,
    ERD_REFERENTIAL_ACTION_OPTIONS,
    safeSqlFragment,
    normalizeReferentialAction,
    validateReferentialActions,
    normalizeColumnDetails,
    normalizeErdChecks,
    normalizeErdIndexes,
    columnDetailsFor,
    setColumnDetails,
    renameColumnSchema,
    deleteColumnSchema,
    foreignKeyColumnImpacts,
    renameForeignKeyColumnReferences,
    disconnectForeignKeyColumnReferences,
    copyColumnSchema,
    applyCopiedColumnSchema,
    rewriteIdentifier,
    validateEntitySchema,
  });
});
