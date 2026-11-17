'use strict';

/* Safe, non-executing CREATE TABLE importer for PostgreSQL, MySQL and SQLite.
   It preserves the shared ERD subset: columns, PK/FK/NOT NULL/UNIQUE,
   DEFAULT, CHECK, and simple column indexes. */
(function initDdlImporter(root, factory) {
  const commonJs = typeof module !== 'undefined' && module.exports;
  const erdColumn = commonJs ? require('./erd-column.js') : root.UMLErdColumn;
  const erdSchema = commonJs ? require('./erd-schema.js') : root.UMLErdSchema;
  const api = factory(erdColumn, erdSchema);
  if (commonJs) module.exports = api;
  else root.UMLDdlImporter = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function createDdlImporter(erdColumn, erdSchema) {
  if (!erdColumn || typeof erdColumn.formatColumn !== 'function'
    || typeof erdColumn.validateColumn !== 'function') {
    throw new TypeError('DDL Importer에는 UMLErdColumn.formatColumn/validateColumn이 필요합니다.');
  }
  if (!erdSchema || typeof erdSchema.safeSqlFragment !== 'function'
    || typeof erdSchema.normalizeErdChecks !== 'function'
    || typeof erdSchema.normalizeErdIndexes !== 'function'
    || typeof erdSchema.normalizeReferentialAction !== 'function') {
    throw new TypeError('DDL Importer에는 UMLErdSchema 제약·인덱스·FK 동작 API가 필요합니다.');
  }
  const { formatColumn, validateColumn } = erdColumn;
  const {
    safeSqlFragment, normalizeErdChecks, normalizeErdIndexes, normalizeReferentialAction,
  } = erdSchema;
  const MAX_SOURCE_BYTES = 10 * 1024 * 1024;
  const MAX_TOKENS = 200000;
  const MAX_STATEMENTS = 2000;
  const MAX_TABLES = 500;
  const MAX_COLUMNS_PER_TABLE = 500;
  const COLUMN_CONSTRAINTS = new Set([
    'CONSTRAINT', 'NOT', 'NULL', 'PRIMARY', 'UNIQUE', 'CHECK', 'DEFAULT',
    'REFERENCES', 'COLLATE', 'GENERATED', 'AUTO_INCREMENT', 'AUTOINCREMENT', 'COMMENT',
  ]);

  const upper = token => String(token?.value || '').toUpperCase();
  const isKeyword = (token, keyword) => token?.type === 'word' && upper(token) === keyword;
  const isSymbol = (token, symbol) => token?.type === 'symbol' && token.value === symbol;
  const isIdentifier = token => token?.type === 'word' || token?.type === 'identifier';

  function sourceLocation(source, index) {
    const before = String(source || '').slice(0, Math.max(0, index));
    const lines = before.split('\n');
    return { line: lines.length, column: lines.at(-1).length + 1 };
  }

  function locatedError(message, source, index) {
    const location = sourceLocation(source, index);
    return new Error(`DDL ${location.line}:${location.column} · ${message}`);
  }

  function tokenize(source) {
    const text = String(source || '');
    const tokens = [];
    let index = 0;
    const push = (type, value, raw, start, end) => {
      tokens.push({ type, value, raw, start, end });
      if (tokens.length > MAX_TOKENS) throw new Error(`DDL 토큰 수가 제한(${MAX_TOKENS})을 초과합니다.`);
    };
    while (index < text.length) {
      const start = index;
      const char = text[index];
      if (/\s/.test(char)) { index++; continue; }
      if (char === '-' && text[index + 1] === '-') {
        index += 2;
        while (index < text.length && text[index] !== '\n') index++;
        continue;
      }
      if (char === '#') {
        index++;
        while (index < text.length && text[index] !== '\n') index++;
        continue;
      }
      if (char === '/' && text[index + 1] === '*') {
        const close = text.indexOf('*/', index + 2);
        if (close < 0) throw locatedError('닫히지 않은 블록 주석이 있습니다.', text, start);
        index = close + 2;
        continue;
      }
      const dollar = char === '$' ? text.slice(index).match(/^\$(?:[A-Za-z_][A-Za-z0-9_]*)?\$/) : null;
      if (dollar) {
        const marker = dollar[0];
        const close = text.indexOf(marker, index + marker.length);
        if (close < 0) throw locatedError('닫히지 않은 PostgreSQL dollar 문자열이 있습니다.', text, start);
        index = close + marker.length;
        push('string', text.slice(start, index), text.slice(start, index), start, index);
        continue;
      }
      if (char === '\'' || char === '"' || char === '`' || (char === '[' && text[index + 1] !== ']')) {
        const closeChar = char === '[' ? ']' : char;
        const type = char === '\'' ? 'string' : 'identifier';
        index++;
        let value = '';
        let closed = false;
        while (index < text.length) {
          if (text[index] === closeChar) {
            if (text[index + 1] === closeChar) {
              value += closeChar; index += 2; continue;
            }
            index++; closed = true; break;
          }
          if (char === '\'' && text[index] === '\\' && index + 1 < text.length) {
            value += text[index] + text[index + 1]; index += 2; continue;
          }
          value += text[index++];
        }
        if (!closed) {
          throw locatedError(`닫히지 않은 ${type === 'string' ? '문자열' : '식별자'}가 있습니다.`, text, start);
        }
        push(type, value, text.slice(start, index), start, index);
        continue;
      }
      if (/[_\p{L}]/u.test(char)) {
        index++;
        while (index < text.length && /[_$\p{L}\p{N}]/u.test(text[index])) index++;
        const raw = text.slice(start, index);
        push('word', raw, raw, start, index);
        continue;
      }
      if (/\d/.test(char)) {
        index++;
        while (index < text.length && /[\d.eE+-]/.test(text[index])) index++;
        const raw = text.slice(start, index);
        push('number', raw, raw, start, index);
        continue;
      }
      index++;
      push('symbol', char, char, start, index);
    }
    return tokens;
  }

  function splitStatements(tokens) {
    const statements = [];
    let current = [];
    tokens.forEach(token => {
      if (isSymbol(token, ';')) {
        if (current.length) statements.push(current);
        current = [];
      } else current.push(token);
    });
    if (current.length) statements.push(current);
    if (statements.length > MAX_STATEMENTS) {
      throw new Error(`DDL 문장 수가 제한(${MAX_STATEMENTS})을 초과합니다.`);
    }
    return statements;
  }

  function renderTokens(tokens) {
    let result = '';
    let previous = null;
    tokens.forEach(token => {
      if (isSymbol(token, ')') || isSymbol(token, ',') || isSymbol(token, '.') || isSymbol(token, ']')) {
        result = result.trimEnd() + token.raw;
        if (isSymbol(token, ',')) result += ' ';
      } else if (isSymbol(token, '(') || isSymbol(token, '[')) {
        result = result.trimEnd() + token.raw;
      } else {
        const needsSpace = result && !result.endsWith(' ') && previous && !isSymbol(previous, '.')
          && !isSymbol(previous, '(') && !isSymbol(previous, '[');
        result += `${needsSpace ? ' ' : ''}${token.raw}`;
      }
      previous = token;
    });
    return result.trim();
  }

  function renderExpressionTokens(tokens) {
    let result = '';
    let previous = null;
    tokens.forEach(token => {
      if (isSymbol(token, ',')) {
        result = result.trimEnd() + ', ';
      } else if (token.type === 'symbol') {
        result = result.trimEnd() + token.raw;
      } else {
        const previousNeedsSpace = previous && previous.type !== 'symbol';
        result += `${previousNeedsSpace && result && !result.endsWith(' ') ? ' ' : ''}${token.raw}`;
      }
      previous = token;
    });
    return result.trim();
  }

  function qualifiedIdentifier(tokens, start) {
    if (!isIdentifier(tokens[start])) return null;
    const parts = [tokens[start].value];
    let index = start + 1;
    while (isSymbol(tokens[index], '.') && isIdentifier(tokens[index + 1])) {
      parts.push(tokens[index + 1].value);
      index += 2;
    }
    return { parts, name: parts.at(-1), next: index };
  }

  function matchingParen(tokens, openIndex) {
    if (!isSymbol(tokens[openIndex], '(')) return -1;
    let depth = 0;
    for (let index = openIndex; index < tokens.length; index++) {
      if (isSymbol(tokens[index], '(')) depth++;
      if (isSymbol(tokens[index], ')')) {
        depth--;
        if (depth === 0) return index;
      }
    }
    return -1;
  }

  function splitCommaItems(tokens) {
    const items = [];
    let depth = 0;
    let current = [];
    tokens.forEach(token => {
      if (isSymbol(token, '(')) depth++;
      if (isSymbol(token, ')')) depth--;
      if (isSymbol(token, ',') && depth === 0) {
        if (current.length) items.push(current);
        current = [];
      } else current.push(token);
    });
    if (current.length) items.push(current);
    return items;
  }

  function identifierList(tokens, openIndex) {
    const close = matchingParen(tokens, openIndex);
    if (close < 0) throw new Error('컬럼 목록의 닫는 괄호가 없습니다.');
    const names = splitCommaItems(tokens.slice(openIndex + 1, close)).map(item => {
      const identifier = item.find(isIdentifier);
      if (!identifier) throw new Error('컬럼 목록에 올바른 식별자가 없습니다.');
      return identifier.value;
    });
    if (!names.length) throw new Error('컬럼 목록이 비어 있습니다.');
    return { names, next: close + 1 };
  }

  function referenceAt(tokens, referenceIndex) {
    const target = qualifiedIdentifier(tokens, referenceIndex + 1);
    if (!target) throw new Error('REFERENCES 대상 테이블 이름이 없습니다.');
    let targetColumns = [];
    let next = target.next;
    if (isSymbol(tokens[next], '(')) {
      const list = identifierList(tokens, next);
      targetColumns = list.names;
      next = list.next;
    }
    return { targetParts: target.parts, targetTable: target.name, targetColumns, next };
  }

  function referenceActionsAt(tokens, start, warnings) {
    const result = { onDelete: '', onUpdate: '' };
    for (let index = start; index < tokens.length; index++) {
      if (isKeyword(tokens[index], 'MATCH') || isKeyword(tokens[index], 'DEFERRABLE')
        || (isKeyword(tokens[index], 'NOT') && isKeyword(tokens[index + 1], 'DEFERRABLE'))
        || isKeyword(tokens[index], 'INITIALLY')) {
        addWarning(warnings, 'MATCH·DEFERRABLE 정책은 현재 ERD 모델에 저장하지 않습니다.');
        continue;
      }
      if (!isKeyword(tokens[index], 'ON')
        || (!isKeyword(tokens[index + 1], 'DELETE') && !isKeyword(tokens[index + 1], 'UPDATE'))) continue;
      const field = isKeyword(tokens[index + 1], 'DELETE') ? 'onDelete' : 'onUpdate';
      if (result[field]) throw new Error(`중복된 ${field === 'onDelete' ? 'ON DELETE' : 'ON UPDATE'} 절입니다.`);
      let action = '';
      if (isKeyword(tokens[index + 2], 'CASCADE') || isKeyword(tokens[index + 2], 'RESTRICT')) {
        action = upper(tokens[index + 2]);
        index += 2;
      } else if (isKeyword(tokens[index + 2], 'NO') && isKeyword(tokens[index + 3], 'ACTION')) {
        action = 'NO ACTION';
        index += 3;
      } else if (isKeyword(tokens[index + 2], 'SET')
        && (isKeyword(tokens[index + 3], 'NULL') || isKeyword(tokens[index + 3], 'DEFAULT'))) {
        action = `SET ${upper(tokens[index + 3])}`;
        index += 3;
      } else {
        throw new Error(`${field === 'onDelete' ? 'ON DELETE' : 'ON UPDATE'} 참조 동작이 올바르지 않습니다.`);
      }
      result[field] = normalizeReferentialAction(action, field === 'onDelete' ? 'FK ON DELETE' : 'FK ON UPDATE');
    }
    return result;
  }

  function addWarning(warnings, message) {
    if (!warnings.includes(message) && warnings.length < 100) warnings.push(message);
  }

  function nextColumnConstraint(tokens, start) {
    const starters = new Set([
      'CONSTRAINT', 'NOT', 'PRIMARY', 'UNIQUE', 'CHECK', 'DEFAULT', 'REFERENCES',
      'COLLATE', 'GENERATED', 'AUTO_INCREMENT', 'AUTOINCREMENT', 'COMMENT',
    ]);
    let depth = 0;
    for (let index = start; index < tokens.length; index++) {
      if (isSymbol(tokens[index], '(')) depth++;
      else if (isSymbol(tokens[index], ')')) depth--;
      else if (depth === 0 && tokens[index].type === 'word' && starters.has(upper(tokens[index]))) return index;
    }
    return tokens.length;
  }

  function checkAt(tokens, checkIndex, constraintName = '', column = '') {
    const open = tokens.findIndex((token, index) => index > checkIndex && isSymbol(token, '('));
    if (open < 0) throw new Error('CHECK 표현식의 여는 괄호가 없습니다.');
    const close = matchingParen(tokens, open);
    if (close < 0) throw new Error('CHECK 표현식의 닫는 괄호가 없습니다.');
    const expression = safeSqlFragment(renderExpressionTokens(tokens.slice(open + 1, close)), 'CHECK 표현식');
    return { check: { name: constraintName, expression, column }, next: close + 1 };
  }

  function defaultAt(tokens, defaultIndex) {
    const end = nextColumnConstraint(tokens, defaultIndex + 1);
    const expression = safeSqlFragment(renderExpressionTokens(tokens.slice(defaultIndex + 1, end)), 'DEFAULT 값');
    return { expression, next: end };
  }

  function indexedColumns(tokens, openIndex, warnings) {
    const close = matchingParen(tokens, openIndex);
    if (close < 0) throw new Error('인덱스 컬럼 목록의 닫는 괄호가 없습니다.');
    const columns = splitCommaItems(tokens.slice(openIndex + 1, close)).map(item => {
      if (!isIdentifier(item[0])) throw new Error('식 기반 인덱스는 아직 지원하지 않습니다.');
      let index = 1;
      if (isSymbol(item[index], '(')) {
        const prefixClose = matchingParen(item, index);
        if (prefixClose < 0) throw new Error('인덱스 접두 길이의 닫는 괄호가 없습니다.');
        addWarning(warnings, 'MySQL 인덱스 접두 길이는 제외하고 컬럼만 저장했습니다.');
        index = prefixClose + 1;
      }
      const order = ['ASC', 'DESC'].includes(upper(item[index])) ? upper(item[index++]) : '';
      if (index < item.length) {
        addWarning(warnings, '인덱스 COLLATE·NULLS·연산자 클래스 옵션은 제외하고 저장했습니다.');
      }
      return { name: item[0].value, order };
    });
    if (!columns.length) throw new Error('인덱스 컬럼 목록이 비어 있습니다.');
    return { columns, next: close + 1 };
  }

  function parseIndexDefinition(item, start, warnings, kind = 'index', constraintName = '') {
    let index = start;
    let unique = kind === 'unique';
    if (isKeyword(item[index], 'UNIQUE')) { unique = true; index++; }
    if (isKeyword(item[index], 'FULLTEXT') || isKeyword(item[index], 'SPATIAL')
      || isKeyword(item[index], 'EXCLUDE')) {
      addWarning(warnings, `${upper(item[index])} 인덱스는 일반 인덱스로 단순화했습니다.`);
      index++;
    }
    if (isKeyword(item[index], 'INDEX') || isKeyword(item[index], 'KEY')) index++;
    if (isKeyword(item[index], 'IF') && isKeyword(item[index + 1], 'NOT')
      && isKeyword(item[index + 2], 'EXISTS')) index += 3;
    let name = constraintName;
    if (!isSymbol(item[index], '(') && isIdentifier(item[index])) name = item[index++].value;
    if (isKeyword(item[index], 'USING')) {
      addWarning(warnings, '인덱스 USING 방식은 제외하고 저장했습니다.');
      index += isIdentifier(item[index + 1]) ? 2 : 1;
    }
    if (!isSymbol(item[index], '(')) throw new Error('인덱스 컬럼 목록이 없습니다.');
    const parsed = indexedColumns(item, index, warnings);
    index = parsed.next;
    let where = '';
    const whereIndex = item.findIndex((token, tokenIndex) => tokenIndex >= index && isKeyword(token, 'WHERE'));
    if (whereIndex >= 0) {
      where = safeSqlFragment(renderExpressionTokens(item.slice(whereIndex + 1)), '인덱스 WHERE');
      index = item.length;
    }
    if (index < item.length) addWarning(warnings, '인덱스 저장 방식·가시성·테이블스페이스 옵션은 제외했습니다.');
    return { kind, name, unique, columns: parsed.columns, where };
  }

  function parseColumnItem(item, table, warnings) {
    if (!isIdentifier(item[0])) throw new Error(`'${table.name}' 테이블에 올바르지 않은 컬럼 정의가 있습니다.`);
    const name = item[0].value;
    let depth = 0;
    let constraintIndex = item.length;
    for (let index = 1; index < item.length; index++) {
      if (isSymbol(item[index], '(')) depth++;
      if (isSymbol(item[index], ')')) depth--;
      if (depth === 0 && item[index].type === 'word' && COLUMN_CONSTRAINTS.has(upper(item[index]))) {
        constraintIndex = index; break;
      }
    }
    let type = renderTokens(item.slice(1, constraintIndex));
    if (!type) {
      type = 'TEXT';
      addWarning(warnings, `'${table.name}.${name}' 타입이 없어 TEXT로 가져왔습니다.`);
    }
    const column = {
      name, type, primaryKey: false, foreignKey: false, notNull: false,
      unique: false, uniqueName: '', defaultValue: '',
    };
    let nested = 0;
    let constraintName = '';
    for (let index = constraintIndex; index < item.length; index++) {
      if (isSymbol(item[index], '(')) { nested++; continue; }
      if (isSymbol(item[index], ')')) { nested--; continue; }
      if (nested !== 0 || item[index].type !== 'word') continue;
      if (isKeyword(item[index], 'CONSTRAINT')) {
        if (!isIdentifier(item[index + 1])) throw new Error(`'${table.name}.${name}'의 CONSTRAINT 이름이 없습니다.`);
        constraintName = item[index + 1].value;
        index++;
        continue;
      }
      if (isKeyword(item[index], 'NOT') && isKeyword(item[index + 1], 'NULL')) column.notNull = true;
      if (isKeyword(item[index], 'PRIMARY') && isKeyword(item[index + 1], 'KEY')) column.primaryKey = true;
      if (isKeyword(item[index], 'REFERENCES')) {
        const reference = referenceAt(item, index);
        const actions = referenceActionsAt(item, reference.next, warnings);
        column.foreignKey = true;
        table.foreignKeys.push({
          name: '', sourceColumns: [name], ...reference, ...actions,
        });
      }
      if (isKeyword(item[index], 'UNIQUE')) {
        column.unique = true;
        column.uniqueName = constraintName;
        constraintName = '';
      }
      if (isKeyword(item[index], 'DEFAULT')) {
        const parsed = defaultAt(item, index);
        column.defaultValue = parsed.expression;
        index = parsed.next - 1;
      }
      if (isKeyword(item[index], 'CHECK')) {
        const parsed = checkAt(item, index, constraintName, name);
        table.checks.push(parsed.check);
        constraintName = '';
        index = parsed.next - 1;
      }
      if (isKeyword(item[index], 'GENERATED') || isKeyword(item[index], 'AUTO_INCREMENT')
        || isKeyword(item[index], 'AUTOINCREMENT')) {
        addWarning(warnings, '자동 생성·Identity 속성은 현재 ERD 모델에 저장하지 않습니다.');
      }
      if (isKeyword(item[index], 'COMMENT') || isKeyword(item[index], 'COLLATE')) {
        addWarning(warnings, '컬럼 COMMENT·COLLATE 속성은 현재 ERD 모델에 저장하지 않습니다.');
      }
    }
    table.columns.push(column);
  }

  function parseTableConstraint(item, table, warnings) {
    let index = 0;
    let constraintName = '';
    if (isKeyword(item[index], 'CONSTRAINT')) {
      if (!isIdentifier(item[index + 1])) throw new Error(`'${table.name}'의 CONSTRAINT 이름이 없습니다.`);
      constraintName = item[index + 1].value;
      index += 2;
    }
    if (isKeyword(item[index], 'PRIMARY') && isKeyword(item[index + 1], 'KEY')) {
      const open = item.findIndex((token, tokenIndex) => tokenIndex > index && isSymbol(token, '('));
      if (open < 0) throw new Error(`'${table.name}'의 PRIMARY KEY 컬럼 목록이 없습니다.`);
      table.primaryKeyNames.push(...identifierList(item, open).names);
      return;
    }
    if (isKeyword(item[index], 'FOREIGN') && isKeyword(item[index + 1], 'KEY')) {
      const open = item.findIndex((token, tokenIndex) => tokenIndex > index && isSymbol(token, '('));
      if (open < 0) throw new Error(`'${table.name}'의 FOREIGN KEY 컬럼 목록이 없습니다.`);
      const source = identifierList(item, open);
      const references = item.findIndex((token, tokenIndex) => tokenIndex >= source.next && isKeyword(token, 'REFERENCES'));
      if (references < 0) throw new Error(`'${table.name}'의 FOREIGN KEY REFERENCES 절이 없습니다.`);
      const target = referenceAt(item, references);
      const actions = referenceActionsAt(item, target.next, warnings);
      table.foreignKeys.push({ name: constraintName, sourceColumns: source.names, ...target, ...actions });
      return;
    }
    if (isKeyword(item[index], 'UNIQUE')) {
      table.indexes.push(parseIndexDefinition(item, index, warnings, 'unique', constraintName));
      return;
    }
    if (isKeyword(item[index], 'CHECK')) {
      table.checks.push(checkAt(item, index, constraintName).check);
      return;
    }
    if (['KEY', 'INDEX', 'FULLTEXT', 'SPATIAL', 'EXCLUDE'].includes(upper(item[index]))) {
      table.indexes.push(parseIndexDefinition(item, index, warnings, 'index', constraintName));
      return;
    }
    throw new Error(`'${table.name}'에 지원하지 않는 테이블 정의가 있습니다: ${renderTokens(item).slice(0, 120)}`);
  }

  function parseCreateTable(statement, warnings) {
    const tableKeyword = statement.findIndex((token, index) => index > 0 && index < 6 && isKeyword(token, 'TABLE'));
    if (!isKeyword(statement[0], 'CREATE') || tableKeyword < 0) return null;
    let index = tableKeyword + 1;
    if (isKeyword(statement[index], 'IF') && isKeyword(statement[index + 1], 'NOT')
      && isKeyword(statement[index + 2], 'EXISTS')) index += 3;
    const identifier = qualifiedIdentifier(statement, index);
    if (!identifier) throw new Error('CREATE TABLE 이름이 없습니다.');
    index = identifier.next;
    if (!isSymbol(statement[index], '(')) {
      throw new Error(`'${identifier.name}'의 CREATE TABLE AS/OF/PARTITION 형식은 지원하지 않습니다.`);
    }
    const close = matchingParen(statement, index);
    if (close < 0) throw new Error(`'${identifier.name}' CREATE TABLE의 닫는 괄호가 없습니다.`);
    if (identifier.parts.length > 1) {
      addWarning(warnings, `스키마 '${identifier.parts.slice(0, -1).join('.')}'는 제외하고 테이블 '${identifier.name}'만 가져옵니다.`);
    }
    if (statement.slice(close + 1).length) {
      addWarning(warnings, 'ENGINE·TABLESPACE·WITHOUT ROWID 등 테이블 옵션은 현재 ERD 모델에 저장하지 않습니다.');
    }
    const table = {
      name: identifier.name, qualifiedName: identifier.parts.join('.'),
      columns: [], primaryKeyNames: [], foreignKeys: [], checks: [], indexes: [],
    };
    const items = splitCommaItems(statement.slice(index + 1, close));
    if (!items.length) throw new Error(`'${table.name}' 테이블에 컬럼이 없습니다.`);
    items.forEach(item => {
      let first = 0;
      if (isKeyword(item[0], 'CONSTRAINT')) first = 2;
      const tableDefinition = ['PRIMARY', 'FOREIGN', 'UNIQUE', 'CHECK', 'KEY', 'INDEX',
        'FULLTEXT', 'SPATIAL', 'EXCLUDE'].includes(upper(item[first]));
      if (tableDefinition) parseTableConstraint(item, table, warnings);
      else parseColumnItem(item, table, warnings);
    });
    if (table.columns.length > MAX_COLUMNS_PER_TABLE) {
      throw new Error(`'${table.name}' 컬럼 수가 제한(${MAX_COLUMNS_PER_TABLE})을 초과합니다.`);
    }
    const columnByName = new Map();
    table.columns.forEach(column => {
      const key = column.name.toLocaleLowerCase();
      if (columnByName.has(key)) throw new Error(`'${table.name}'에 중복된 컬럼이 있습니다: ${column.name}`);
      columnByName.set(key, column);
    });
    table.primaryKeyNames.forEach(name => {
      const column = columnByName.get(name.toLocaleLowerCase());
      if (!column) throw new Error(`'${table.name}'의 PRIMARY KEY 컬럼을 찾을 수 없습니다: ${name}`);
      column.primaryKey = true;
    });
    table.foreignKeys.forEach(foreignKey => {
      if (foreignKey.sourceColumns.length !== 1 || foreignKey.targetColumns.length > 1) {
        throw new Error(`'${table.name}'의 복합 FOREIGN KEY는 아직 지원하지 않습니다.`);
      }
      const column = columnByName.get(foreignKey.sourceColumns[0].toLocaleLowerCase());
      if (!column) throw new Error(`'${table.name}'의 FOREIGN KEY 컬럼을 찾을 수 없습니다: ${foreignKey.sourceColumns[0]}`);
      column.foreignKey = true;
    });
    normalizeErdChecks(table.checks, table.columns.map(column => column.name));
    normalizeErdIndexes(table.indexes, table.columns.map(column => column.name));
    return table;
  }

  function parseCreateIndex(statement, warnings) {
    if (!isKeyword(statement[0], 'CREATE')) return null;
    let index = 1;
    const unique = isKeyword(statement[index], 'UNIQUE');
    if (unique) index++;
    if (!isKeyword(statement[index], 'INDEX')) return null;
    index++;
    if (isKeyword(statement[index], 'CONCURRENTLY')) {
      addWarning(warnings, 'CREATE INDEX CONCURRENTLY 실행 방식은 제외하고 저장했습니다.');
      index++;
    }
    if (isKeyword(statement[index], 'IF') && isKeyword(statement[index + 1], 'NOT')
      && isKeyword(statement[index + 2], 'EXISTS')) index += 3;
    const indexName = qualifiedIdentifier(statement, index);
    if (!indexName) throw new Error('CREATE INDEX 이름이 없습니다.');
    index = indexName.next;
    if (isKeyword(statement[index], 'USING')) {
      addWarning(warnings, 'CREATE INDEX USING 방식은 제외하고 저장했습니다.');
      index += isIdentifier(statement[index + 1]) ? 2 : 1;
    }
    if (!isKeyword(statement[index], 'ON')) throw new Error(`'${indexName.name}' 인덱스의 ON 테이블이 없습니다.`);
    index++;
    if (isKeyword(statement[index], 'ONLY')) index++;
    const tableName = qualifiedIdentifier(statement, index);
    if (!tableName) throw new Error(`'${indexName.name}' 인덱스의 대상 테이블 이름이 없습니다.`);
    index = tableName.next;
    if (isKeyword(statement[index], 'USING')) {
      addWarning(warnings, 'CREATE INDEX USING 방식은 제외하고 저장했습니다.');
      index += isIdentifier(statement[index + 1]) ? 2 : 1;
    }
    if (!isSymbol(statement[index], '(')) throw new Error(`'${indexName.name}' 인덱스의 컬럼 목록이 없습니다.`);
    const parsed = indexedColumns(statement, index, warnings);
    index = parsed.next;
    let where = '';
    const whereIndex = statement.findIndex((token, tokenIndex) => tokenIndex >= index && isKeyword(token, 'WHERE'));
    if (whereIndex >= 0) {
      where = safeSqlFragment(renderExpressionTokens(statement.slice(whereIndex + 1)), '인덱스 WHERE');
      index = statement.length;
    }
    if (index < statement.length) addWarning(warnings, 'CREATE INDEX INCLUDE·WITH·TABLESPACE 옵션은 제외하고 저장했습니다.');
    if (tableName.parts.length > 1) {
      addWarning(warnings, `인덱스 대상 스키마 '${tableName.parts.slice(0, -1).join('.')}'는 제외했습니다.`);
    }
    return {
      tableName: tableName.name,
      index: { kind: 'index', name: indexName.name, unique, columns: parsed.columns, where },
    };
  }

  function detectedDialect(source) {
    const text = String(source || '');
    const matches = [];
    if (/`[^`]+`|\bENGINE\s*=|\bAUTO_INCREMENT\b/i.test(text)) matches.push('MySQL');
    if (/\bUNLOGGED\b|\bSERIAL\b|\bTABLESPACE\b|::[A-Za-z_]/i.test(text)) matches.push('PostgreSQL');
    if (/\bPRAGMA\b|\bWITHOUT\s+ROWID\b|\bAUTOINCREMENT\b/i.test(text)) matches.push('SQLite');
    return matches.length === 1 ? matches[0] : (matches.length ? '혼합/자동' : '표준/자동');
  }

  function buildProject(tables, warnings, options, dialect) {
    const models = {};
    const elements = [];
    const relations = [];
    const tableByName = new Map();
    tables.forEach((table, tableIndex) => {
      const key = table.name.toLocaleLowerCase();
      if (tableByName.has(key)) throw new Error(`중복된 테이블 이름이 있습니다: ${table.name}`);
      const modelId = `ddl_entity_${tableIndex + 1}`;
      const viewId = `ddl_view_${tableIndex + 1}`;
      table.modelId = modelId; table.viewId = viewId;
      tableByName.set(key, table);
      const model = {
        id: modelId, kind: 'entity', name: table.name,
        columns: table.columns.map(column => {
          const candidate = {
            flags: [column.primaryKey ? 'PK' : '', column.foreignKey ? 'FK' : '',
              column.unique ? 'UQ' : '', column.notNull ? 'NN' : ''].filter(Boolean),
            phys: column.name, logical: '', type: column.type,
          };
          const checked = validateColumn(candidate);
          if (!checked.valid) throw new Error(`'${table.name}.${column.name}'을(를) 가져올 수 없습니다: ${checked.error}`);
          return formatColumn(candidate);
        }),
      };
      const columnDetails = Object.fromEntries(table.columns
        .filter(column => column.defaultValue || column.uniqueName)
        .map(column => [column.name, {
          ...(column.defaultValue ? { defaultValue: column.defaultValue } : {}),
          ...(column.uniqueName ? { uniqueName: column.uniqueName } : {}),
        }]));
      if (Object.keys(columnDetails).length) model.erdColumnDetails = columnDetails;
      if (table.checks.length) model.erdChecks = normalizeErdChecks(
        table.checks, table.columns.map(column => column.name),
      );
      if (table.indexes.length) model.erdIndexes = normalizeErdIndexes(
        table.indexes, table.columns.map(column => column.name),
      );
      models[modelId] = model;
      elements.push({
        id: viewId, modelId,
        x: 80 + (tableIndex % 3) * 360,
        y: 96 + Math.floor(tableIndex / 3) * 260,
        w: 280, h: Math.max(88, 48 + table.columns.length * 22),
      });
    });

    let relationIndex = 0;
    tables.forEach(sourceTable => {
      sourceTable.foreignKeys.forEach(foreignKey => {
        const targetTable = tableByName.get(foreignKey.targetTable.toLocaleLowerCase());
        if (!targetTable) {
          addWarning(warnings, `외부 참조 '${foreignKey.targetParts.join('.')}'는 관계선으로 연결하지 못했습니다.`);
          return;
        }
        const targetColumns = foreignKey.targetColumns.length
          ? foreignKey.targetColumns
          : targetTable.columns.filter(column => column.primaryKey).map(column => column.name);
        if (targetColumns.length !== 1) {
          throw new Error(`'${sourceTable.name}'의 FK가 참조하는 '${targetTable.name}' 단일 PK를 결정할 수 없습니다.`);
        }
        const targetColumn = targetTable.columns.find(column =>
          column.name.toLocaleLowerCase() === targetColumns[0].toLocaleLowerCase());
        const targetPrimaryKeys = targetTable.columns.filter(column => column.primaryKey);
        if (!targetColumn) {
          throw new Error(`'${targetTable.name}'에서 참조 컬럼을 찾을 수 없습니다: ${targetColumns[0]}`);
        }
        if (!targetColumn.primaryKey || targetPrimaryKeys.length !== 1) {
          addWarning(warnings,
            `참조 대상 '${targetTable.name}.${targetColumn.name}'이 단일 PK가 아니어서 FK 관계선을 만들지 않았습니다.`);
          return;
        }
        const sourceColumn = sourceTable.columns.find(column =>
          column.name.toLocaleLowerCase() === foreignKey.sourceColumns[0].toLocaleLowerCase());
        relationIndex++;
        const modelId = `ddl_relation_${relationIndex}`;
        const viewId = `ddl_relation_view_${relationIndex}`;
        models[modelId] = {
          id: modelId, kind: 'erd-1n',
          name: foreignKey.name || `${sourceTable.name}_${sourceColumn.name}_fk`,
          sourceLabel: '0..N', targetLabel: sourceColumn.notNull ? '1' : '0..1',
          foreignKeyEnd: 'source',
          sourceColumnName: sourceColumn.name,
          targetColumnName: targetColumn.name,
          foreignKeyOnDelete: foreignKey.onDelete,
          foreignKeyOnUpdate: foreignKey.onUpdate,
          fromModelId: sourceTable.modelId,
          toModelId: targetTable.modelId,
        };
        relations.push({
          id: viewId, modelId, from: sourceTable.viewId, to: targetTable.viewId,
        });
      });
    });

    const diagramName = String(options?.diagramName || 'Imported DDL').trim() || 'Imported DDL';
    return {
      version: 30,
      models,
      diagrams: [{ id: 'ddl_diagram_1', type: 'erd', name: diagramName, elements, relations }],
      importMeta: {
        dialect,
        warnings,
        tables: tables.length,
        columns: tables.reduce((count, table) => count + table.columns.length, 0),
        foreignKeys: tables.reduce((count, table) => count + table.foreignKeys.length, 0),
        linkedForeignKeys: relations.length,
        checks: tables.reduce((count, table) => count + table.checks.length, 0),
        indexes: tables.reduce((count, table) => count + table.indexes.length, 0),
      },
    };
  }

  function parseDdl(source, options = {}) {
    const text = String(source || '');
    if (!text.trim()) throw new Error('DDL 내용이 비어 있습니다.');
    if (new TextEncoder().encode(text).length > MAX_SOURCE_BYTES) {
      throw new Error('DDL은 10MB 이하만 가져올 수 있습니다.');
    }
    const warnings = [];
    const tables = [];
    const standaloneIndexes = [];
    splitStatements(tokenize(text)).forEach(statement => {
      if (!statement.length) return;
      try {
        const table = parseCreateTable(statement, warnings);
        if (table) {
          tables.push(table);
          if (tables.length > MAX_TABLES) throw new Error(`테이블 수가 제한(${MAX_TABLES})을 초과합니다.`);
          return;
        }
        if (isKeyword(statement[0], 'PRAGMA') || isKeyword(statement[0], 'SET')
          || isKeyword(statement[0], 'BEGIN') || isKeyword(statement[0], 'COMMIT')) {
          addWarning(warnings, `${upper(statement[0])} 문장은 모델에 적용하지 않았습니다.`);
          return;
        }
        const standaloneIndex = parseCreateIndex(statement, warnings);
        if (standaloneIndex) {
          standaloneIndexes.push(standaloneIndex);
          return;
        }
        throw new Error(`지원하지 않는 SQL 문장입니다: ${renderTokens(statement).slice(0, 120)}`);
      } catch (error) {
        if (/^DDL \d+:\d+ · /.test(error.message)) throw error;
        throw locatedError(error.message, text, statement[0]?.start || 0);
      }
    });
    if (!tables.length) throw new Error('가져올 CREATE TABLE 문이 없습니다.');
    standaloneIndexes.forEach(entry => {
      const table = tables.find(candidate => candidate.name.toLocaleLowerCase()
        === entry.tableName.toLocaleLowerCase());
      if (!table) {
        addWarning(warnings, `외부 테이블 '${entry.tableName}'의 인덱스 '${entry.index.name}'은 연결하지 못했습니다.`);
        return;
      }
      table.indexes.push(entry.index);
      normalizeErdIndexes(table.indexes, table.columns.map(column => column.name));
    });
    return buildProject(tables, warnings, options, detectedDialect(text));
  }

  return Object.freeze({
    MAX_SOURCE_BYTES,
    MAX_TOKENS,
    MAX_TABLES,
    MAX_COLUMNS_PER_TABLE,
    tokenize,
    sourceLocation,
    parseDdl,
  });
});
