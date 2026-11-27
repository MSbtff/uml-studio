'use strict';

interface DdlColumnApi {
  formatColumn(column: { flags: string[]; phys: string; logical: string; type: string }): string;
  validateColumn(column: { flags: string[]; phys: string; logical: string; type: string }): { valid: boolean; error?: string };
}

interface DdlSchemaApi {
  safeSqlFragment(value: unknown, description?: string): string;
  normalizeErdChecks(value: unknown, columns?: string[]): ErdSchemaCheck[];
  normalizeErdIndexes(value: unknown, columns?: string[]): ErdSchemaIndex[];
  normalizeReferentialAction(value: unknown, description?: string): string;
}

type DdlImporterApi = ReturnType<typeof createDdlImporter>;
declare var UMLDdlImporter: DdlImporterApi;

(function initDdlImporter(
  root: typeof globalThis & { UMLErdColumn?: DdlColumnApi; UMLErdSchema?: DdlSchemaApi; UMLDdlImporter?: DdlImporterApi },
  factory: (erdColumn?: DdlColumnApi, erdSchema?: DdlSchemaApi) => DdlImporterApi,
) {
  const commonJs = typeof module !== 'undefined' && module.exports;
  const erdColumn = commonJs ? require('../model/erd-column.js') : root.UMLErdColumn;
  const erdSchema = commonJs ? require('../model/erd-schema.js') : root.UMLErdSchema;
  const api = factory(erdColumn, erdSchema);
  if (commonJs) module.exports = api;
  else root.UMLDdlImporter = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, createDdlImporter);

function createDdlImporter(erdColumn?: DdlColumnApi, erdSchema?: DdlSchemaApi) {
  const { text: uiText } = globalThis.UMLLanguage
    ?? require('../editor/language.js') as typeof UMLLanguage;

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
  interface Token {
    type: 'word' | 'string' | 'number' | 'identifier' | 'symbol';
    value: string;
    raw: string;
    start: number;
    end: number;
  }
  interface Column {
    name: string;
    type: string;
    primaryKey: boolean;
    foreignKey: boolean;
    notNull: boolean;
    unique: boolean;
    uniqueName: string;
    defaultValue: string;
  }
  interface ForeignKey {
    name: string;
    sourceColumns: string[];
    targetTable: string;
    targetParts: string[];
    targetColumns: string[];
    onDelete: string;
    onUpdate: string;
  }
  interface Table {
    name: string;
    qualifiedName: string;
    columns: Column[];
    primaryKeyNames: string[];
    foreignKeys: ForeignKey[];
    checks: ErdSchemaCheck[];
    indexes: ErdSchemaIndex[];
  }
  interface StandaloneIndex {
    tableName: string;
    index: ErdSchemaIndex;
  }
  interface EntityModel {
    id: string;
    kind: 'entity';
    name: string;
    columns: string[];
    erdColumnDetails?: Record<string, ErdColumnDetails>;
    erdChecks?: ErdSchemaCheck[];
    erdIndexes?: ErdSchemaIndex[];
  }
  interface RelationModel {
    id: string;
    kind: 'erd-1n';
    name: string;
    sourceLabel: '0..N';
    targetLabel: '0..1' | '1';
    foreignKeyEnd: 'source';
    sourceColumnName: string;
    targetColumnName: string;
    foreignKeyOnDelete: string;
    foreignKeyOnUpdate: string;
    fromModelId: string;
    toModelId: string;
  }
  type EntityView = DiagramBounds & { id: string; modelId: string };
  interface RelationView { id: string; modelId: string; from: string; to: string }
  interface Options { diagramName?: string }

  const MAX_SOURCE_BYTES = 10 * 1024 * 1024;
  const MAX_TOKENS = 200000;
  const MAX_STATEMENTS = 2000;
  const MAX_TABLES = 500;
  const MAX_COLUMNS_PER_TABLE = 500;
  const COLUMN_CONSTRAINTS = new Set([
    'CONSTRAINT', 'NOT', 'NULL', 'PRIMARY', 'UNIQUE', 'CHECK', 'DEFAULT',
    'REFERENCES', 'COLLATE', 'GENERATED', 'AUTO_INCREMENT', 'AUTOINCREMENT', 'COMMENT',
  ]);

  const upper = (token?: Token | null) => String(token?.value || '').toUpperCase();
  const isKeyword = (token: Token | undefined, keyword: string) => token?.type === 'word' && upper(token) === keyword;
  const isSymbol = (token: Token | undefined, symbol: string) => token?.type === 'symbol' && token.value === symbol;
  const isIdentifier = (token?: Token) => token?.type === 'word' || token?.type === 'identifier';

  function sourceLocation(source: unknown, index: number) {
    const before = String(source || '').slice(0, Math.max(0, index));
    const lines = before.split('\n');
    return { line: lines.length, column: lines[lines.length - 1].length + 1 };
  }

  function locatedError(message: string, source: unknown, index: number) {
    const location = sourceLocation(source, index);
    return new Error(`DDL ${location.line}:${location.column} · ${message}`);
  }

  function tokenize(source: unknown) {
    const text = String(source || '');
    const tokens: Token[] = [];
    let index = 0;
    const push = (type: Token['type'], value: string, raw: string, start: number, end: number) => {
      tokens.push({ type, value, raw, start, end });
      if (tokens.length > MAX_TOKENS) throw new Error(uiText('DDL exceeds the limit of {0} tokens.', 'DDL 토큰 수가 제한({0})을 초과합니다.', MAX_TOKENS));
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
        if (close < 0) throw locatedError(uiText('Unclosed block comment.', '닫히지 않은 블록 주석이 있습니다.'), text, start);
        index = close + 2;
        continue;
      }
      const dollar = char === '$' ? text.slice(index).match(/^\$(?:[A-Za-z_][A-Za-z0-9_]*)?\$/) : null;
      if (dollar) {
        const marker = dollar[0];
        const close = text.indexOf(marker, index + marker.length);
        if (close < 0) throw locatedError(uiText('Unclosed PostgreSQL dollar-quoted string.', '닫히지 않은 PostgreSQL dollar 문자열이 있습니다.'), text, start);
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
          throw locatedError(uiText(
            'Unclosed {0}.',
            '닫히지 않은 {0}가 있습니다.',
            type === 'string' ? uiText('string', '문자열') : uiText('identifier', '식별자'),
          ), text, start);
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

  function splitStatements(tokens: Token[]) {
    const statements: Token[][] = [];
    let current: Token[] = [];
    tokens.forEach(token => {
      if (isSymbol(token, ';')) {
        if (current.length) statements.push(current);
        current = [];
      } else current.push(token);
    });
    if (current.length) statements.push(current);
    if (statements.length > MAX_STATEMENTS) {
      throw new Error(uiText('DDL exceeds the limit of {0} statements.', 'DDL 문장 수가 제한({0})을 초과합니다.', MAX_STATEMENTS));
    }
    return statements;
  }

  function renderTokens(tokens: Token[]) {
    let result = '';
    let previous: Token | null = null;
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

  function renderExpressionTokens(tokens: Token[]) {
    let result = '';
    let previous: Token | null = null;
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

  function qualifiedIdentifier(tokens: Token[], start: number) {
    if (!isIdentifier(tokens[start])) return null;
    const parts = [tokens[start].value];
    let index = start + 1;
    while (isSymbol(tokens[index], '.') && isIdentifier(tokens[index + 1])) {
      parts.push(tokens[index + 1].value);
      index += 2;
    }
    return { parts, name: parts[parts.length - 1], next: index };
  }

  function matchingParen(tokens: Token[], openIndex: number) {
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

  function splitCommaItems(tokens: Token[]) {
    const items: Token[][] = [];
    let depth = 0;
    let current: Token[] = [];
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

  function identifierList(tokens: Token[], openIndex: number) {
    const close = matchingParen(tokens, openIndex);
    if (close < 0) throw new Error(uiText('Missing closing parenthesis in the column list.', '컬럼 목록의 닫는 괄호가 없습니다.'));
    const names = splitCommaItems(tokens.slice(openIndex + 1, close)).map(item => {
      const identifier = item.find(isIdentifier);
      if (!identifier) throw new Error(uiText('Expected an identifier in the column list.', '컬럼 목록에 올바른 식별자가 없습니다.'));
      return identifier.value;
    });
    if (!names.length) throw new Error(uiText('The column list is empty.', '컬럼 목록이 비어 있습니다.'));
    return { names, next: close + 1 };
  }

  function referenceAt(tokens: Token[], referenceIndex: number) {
    const target = qualifiedIdentifier(tokens, referenceIndex + 1);
    if (!target) throw new Error(uiText('Expected a table name after REFERENCES.', 'REFERENCES 대상 테이블 이름이 없습니다.'));
    let targetColumns: string[] = [];
    let next = target.next;
    if (isSymbol(tokens[next], '(')) {
      const list = identifierList(tokens, next);
      targetColumns = list.names;
      next = list.next;
    }
    return { targetParts: target.parts, targetTable: target.name, targetColumns, next };
  }

  function referenceActionsAt(tokens: Token[], start: number, warnings: string[]) {
    const result = { onDelete: '', onUpdate: '' };
    for (let index = start; index < tokens.length; index++) {
      if (isKeyword(tokens[index], 'MATCH') || isKeyword(tokens[index], 'DEFERRABLE')
        || (isKeyword(tokens[index], 'NOT') && isKeyword(tokens[index + 1], 'DEFERRABLE'))
        || isKeyword(tokens[index], 'INITIALLY')) {
        addWarning(warnings, uiText('MATCH and DEFERRABLE options are skipped.', 'MATCH·DEFERRABLE 정책은 현재 ERD 모델에 저장하지 않습니다.'));
        continue;
      }
      if (!isKeyword(tokens[index], 'ON')
        || (!isKeyword(tokens[index + 1], 'DELETE') && !isKeyword(tokens[index + 1], 'UPDATE'))) continue;
      const field = isKeyword(tokens[index + 1], 'DELETE') ? 'onDelete' : 'onUpdate';
      if (result[field]) throw new Error(uiText('Duplicate {0} clause.', '중복된 {0} 절입니다.', field === 'onDelete' ? 'ON DELETE' : 'ON UPDATE'));
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
        throw new Error(uiText('Invalid {0} referential action.', '{0} 참조 동작이 올바르지 않습니다.', field === 'onDelete' ? 'ON DELETE' : 'ON UPDATE'));
      }
      result[field] = normalizeReferentialAction(action, field === 'onDelete' ? 'FK ON DELETE' : 'FK ON UPDATE');
    }
    return result;
  }

  function addWarning(warnings: string[], message: string) {
    if (!warnings.includes(message) && warnings.length < 100) warnings.push(message);
  }

  function nextColumnConstraint(tokens: Token[], start: number) {
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

  function checkAt(tokens: Token[], checkIndex: number, constraintName = '', column = '') {
    const open = tokens.findIndex((token, index) => index > checkIndex && isSymbol(token, '('));
    if (open < 0) throw new Error(uiText('Missing opening parenthesis for the CHECK expression.', 'CHECK 표현식의 여는 괄호가 없습니다.'));
    const close = matchingParen(tokens, open);
    if (close < 0) throw new Error(uiText('Missing closing parenthesis for the CHECK expression.', 'CHECK 표현식의 닫는 괄호가 없습니다.'));
    const expression = safeSqlFragment(renderExpressionTokens(tokens.slice(open + 1, close)), uiText('CHECK expression', 'CHECK 표현식'));
    return { check: { name: constraintName, expression, column }, next: close + 1 };
  }

  function defaultAt(tokens: Token[], defaultIndex: number) {
    const end = nextColumnConstraint(tokens, defaultIndex + 1);
    const expression = safeSqlFragment(renderExpressionTokens(tokens.slice(defaultIndex + 1, end)), uiText('DEFAULT value', 'DEFAULT 값'));
    return { expression, next: end };
  }

  function indexedColumns(tokens: Token[], openIndex: number, warnings: string[]) {
    const close = matchingParen(tokens, openIndex);
    if (close < 0) throw new Error(uiText('Missing closing parenthesis in the index column list.', '인덱스 컬럼 목록의 닫는 괄호가 없습니다.'));
    const columns = splitCommaItems(tokens.slice(openIndex + 1, close)).map((item): ErdSchemaIndex['columns'][number] => {
      if (!isIdentifier(item[0])) throw new Error(uiText('Expression indexes are unsupported.', '식 기반 인덱스는 아직 지원하지 않습니다.'));
      let index = 1;
      if (isSymbol(item[index], '(')) {
        const prefixClose = matchingParen(item, index);
        if (prefixClose < 0) throw new Error(uiText('Missing closing parenthesis for the index prefix length.', '인덱스 접두 길이의 닫는 괄호가 없습니다.'));
        addWarning(warnings, uiText('Imported the column without its MySQL index prefix length.', 'MySQL 인덱스 접두 길이는 제외하고 컬럼만 저장했습니다.'));
        index = prefixClose + 1;
      }
      const direction = upper(item[index]);
      const order = direction === 'ASC' || direction === 'DESC' ? direction : '';
      if (order) index++;
      if (index < item.length) {
        addWarning(warnings, uiText('Skipped index COLLATE, NULLS, and operator class options.', '인덱스 COLLATE·NULLS·연산자 클래스 옵션은 제외하고 저장했습니다.'));
      }
      return { name: item[0].value, order };
    });
    if (!columns.length) throw new Error(uiText('The index column list is empty.', '인덱스 컬럼 목록이 비어 있습니다.'));
    return { columns, next: close + 1 };
  }

  function parseIndexDefinition(item: Token[], start: number, warnings: string[], kind: ErdSchemaIndex['kind'] = 'index', constraintName = ''): ErdSchemaIndex {
    let index = start;
    let unique = kind === 'unique';
    if (isKeyword(item[index], 'UNIQUE')) { unique = true; index++; }
    if (isKeyword(item[index], 'FULLTEXT') || isKeyword(item[index], 'SPATIAL')
      || isKeyword(item[index], 'EXCLUDE')) {
      addWarning(warnings, uiText('Imported the {0} index as a regular index.', '{0} 인덱스는 일반 인덱스로 단순화했습니다.', upper(item[index])));
      index++;
    }
    if (isKeyword(item[index], 'INDEX') || isKeyword(item[index], 'KEY')) index++;
    if (isKeyword(item[index], 'IF') && isKeyword(item[index + 1], 'NOT')
      && isKeyword(item[index + 2], 'EXISTS')) index += 3;
    let name = constraintName;
    if (!isSymbol(item[index], '(') && isIdentifier(item[index])) name = item[index++].value;
    if (isKeyword(item[index], 'USING')) {
      addWarning(warnings, uiText('Skipped the index USING method.', '인덱스 USING 방식은 제외하고 저장했습니다.'));
      index += isIdentifier(item[index + 1]) ? 2 : 1;
    }
    if (!isSymbol(item[index], '(')) throw new Error(uiText('Missing index column list.', '인덱스 컬럼 목록이 없습니다.'));
    const parsed = indexedColumns(item, index, warnings);
    index = parsed.next;
    let where = '';
    const whereIndex = item.findIndex((token, tokenIndex) => tokenIndex >= index && isKeyword(token, 'WHERE'));
    if (whereIndex >= 0) {
      where = safeSqlFragment(renderExpressionTokens(item.slice(whereIndex + 1)), uiText('Index WHERE clause', '인덱스 WHERE'));
      index = item.length;
    }
    if (index < item.length) addWarning(warnings, uiText(
      'Skipped index storage, visibility, and tablespace options.',
      '인덱스 저장 방식·가시성·테이블스페이스 옵션은 제외했습니다.',
    ));
    return { kind, name, unique, columns: parsed.columns, where };
  }

  function parseColumnItem(item: Token[], table: Table, warnings: string[]) {
    if (!isIdentifier(item[0])) throw new Error(uiText(
      'Table \'{0}\' has an invalid column definition.',
      '\'{0}\' 테이블에 올바르지 않은 컬럼 정의가 있습니다.',
      table.name,
    ));
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
      addWarning(warnings, uiText('Imported \'{0}.{1}\' as TEXT because it has no type.', '\'{0}.{1}\' 타입이 없어 TEXT로 가져왔습니다.', table.name, name));
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
        if (!isIdentifier(item[index + 1])) throw new Error(uiText(
          'Missing CONSTRAINT name on \'{0}.{1}\'.',
          '\'{0}.{1}\'의 CONSTRAINT 이름이 없습니다.',
          table.name,
          name,
        ));
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
        addWarning(warnings, uiText('Skipped generated and identity column options.', '자동 생성·Identity 속성은 현재 ERD 모델에 저장하지 않습니다.'));
      }
      if (isKeyword(item[index], 'COMMENT') || isKeyword(item[index], 'COLLATE')) {
        addWarning(warnings, uiText('Skipped column COMMENT and COLLATE options.', '컬럼 COMMENT·COLLATE 속성은 현재 ERD 모델에 저장하지 않습니다.'));
      }
    }
    table.columns.push(column);
  }

  function parseTableConstraint(item: Token[], table: Table, warnings: string[]) {
    let index = 0;
    let constraintName = '';
    if (isKeyword(item[index], 'CONSTRAINT')) {
      if (!isIdentifier(item[index + 1])) throw new Error(uiText(
        'Missing CONSTRAINT name on \'{0}\'.',
        '\'{0}\'의 CONSTRAINT 이름이 없습니다.',
        table.name,
      ));
      constraintName = item[index + 1].value;
      index += 2;
    }
    if (isKeyword(item[index], 'PRIMARY') && isKeyword(item[index + 1], 'KEY')) {
      const open = item.findIndex((token, tokenIndex) => tokenIndex > index && isSymbol(token, '('));
      if (open < 0) throw new Error(uiText('Missing PRIMARY KEY column list on \'{0}\'.', '\'{0}\'의 PRIMARY KEY 컬럼 목록이 없습니다.', table.name));
      table.primaryKeyNames.push(...identifierList(item, open).names);
      return;
    }
    if (isKeyword(item[index], 'FOREIGN') && isKeyword(item[index + 1], 'KEY')) {
      const open = item.findIndex((token, tokenIndex) => tokenIndex > index && isSymbol(token, '('));
      if (open < 0) throw new Error(uiText('Missing FOREIGN KEY column list on \'{0}\'.', '\'{0}\'의 FOREIGN KEY 컬럼 목록이 없습니다.', table.name));
      const source = identifierList(item, open);
      const references = item.findIndex((token, tokenIndex) => tokenIndex >= source.next && isKeyword(token, 'REFERENCES'));
      if (references < 0) throw new Error(uiText(
        'Missing FOREIGN KEY REFERENCES clause on \'{0}\'.',
        '\'{0}\'의 FOREIGN KEY REFERENCES 절이 없습니다.',
        table.name,
      ));
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
    throw new Error(uiText(
      'Unsupported table definition on \'{0}\': {1}',
      '\'{0}\'에 지원하지 않는 테이블 정의가 있습니다: {1}',
      table.name,
      renderTokens(item).slice(0, 120),
    ));
  }

  function parseCreateTable(statement: Token[], warnings: string[]): Table | null {
    const tableKeyword = statement.findIndex((token, index) => index > 0 && index < 6 && isKeyword(token, 'TABLE'));
    if (!isKeyword(statement[0], 'CREATE') || tableKeyword < 0) return null;
    let index = tableKeyword + 1;
    if (isKeyword(statement[index], 'IF') && isKeyword(statement[index + 1], 'NOT')
      && isKeyword(statement[index + 2], 'EXISTS')) index += 3;
    const identifier = qualifiedIdentifier(statement, index);
    if (!identifier) throw new Error(uiText('Missing CREATE TABLE name.', 'CREATE TABLE 이름이 없습니다.'));
    index = identifier.next;
    if (!isSymbol(statement[index], '(')) {
      throw new Error(uiText(
        'Unsupported CREATE TABLE AS, OF, or PARTITION form for \'{0}\'.',
        '\'{0}\'의 CREATE TABLE AS/OF/PARTITION 형식은 지원하지 않습니다.',
        identifier.name,
      ));
    }
    const close = matchingParen(statement, index);
    if (close < 0) throw new Error(uiText(
      'Missing closing parenthesis in CREATE TABLE for \'{0}\'.',
      '\'{0}\' CREATE TABLE의 닫는 괄호가 없습니다.',
      identifier.name,
    ));
    if (identifier.parts.length > 1) {
      addWarning(warnings, uiText(
        'Imported table \'{1}\' without schema \'{0}\'.',
        '스키마 \'{0}\'는 제외하고 테이블 \'{1}\'만 가져옵니다.',
        identifier.parts.slice(0, -1).join('.'),
        identifier.name,
      ));
    }
    if (statement.slice(close + 1).length) {
      addWarning(warnings, uiText(
        'Skipped table options such as ENGINE, TABLESPACE, and WITHOUT ROWID.',
        'ENGINE·TABLESPACE·WITHOUT ROWID 등 테이블 옵션은 현재 ERD 모델에 저장하지 않습니다.',
      ));
    }
    const table: Table = {
      name: identifier.name, qualifiedName: identifier.parts.join('.'),
      columns: [], primaryKeyNames: [], foreignKeys: [], checks: [], indexes: [],
    };
    const items = splitCommaItems(statement.slice(index + 1, close));
    if (!items.length) throw new Error(uiText('Table \'{0}\' has no columns.', '\'{0}\' 테이블에 컬럼이 없습니다.', table.name));
    items.forEach(item => {
      let first = 0;
      if (isKeyword(item[0], 'CONSTRAINT')) first = 2;
      const tableDefinition = ['PRIMARY', 'FOREIGN', 'UNIQUE', 'CHECK', 'KEY', 'INDEX',
        'FULLTEXT', 'SPATIAL', 'EXCLUDE'].includes(upper(item[first]));
      if (tableDefinition) parseTableConstraint(item, table, warnings);
      else parseColumnItem(item, table, warnings);
    });
    if (table.columns.length > MAX_COLUMNS_PER_TABLE) {
      throw new Error(uiText(
        'Table \'{0}\' exceeds the limit of {1} columns.',
        '\'{0}\' 컬럼 수가 제한({1})을 초과합니다.',
        table.name,
        MAX_COLUMNS_PER_TABLE,
      ));
    }
    const columnByName = new Map<string, Column>();
    table.columns.forEach(column => {
      const key = column.name.toLocaleLowerCase();
      if (columnByName.has(key)) throw new Error(uiText(
        'Duplicate column on \'{0}\': {1}',
        '\'{0}\'에 중복된 컬럼이 있습니다: {1}',
        table.name,
        column.name,
      ));
      columnByName.set(key, column);
    });
    table.primaryKeyNames.forEach(name => {
      const column = columnByName.get(name.toLocaleLowerCase());
      if (!column) throw new Error(uiText(
        'PRIMARY KEY column not found on \'{0}\': {1}',
        '\'{0}\'의 PRIMARY KEY 컬럼을 찾을 수 없습니다: {1}',
        table.name,
        name,
      ));
      column.primaryKey = true;
    });
    table.foreignKeys.forEach(foreignKey => {
      if (foreignKey.sourceColumns.length !== 1 || foreignKey.targetColumns.length > 1) {
        throw new Error(uiText(
          'Composite FOREIGN KEY constraints are unsupported on \'{0}\'.',
          '\'{0}\'의 복합 FOREIGN KEY는 아직 지원하지 않습니다.',
          table.name,
        ));
      }
      const column = columnByName.get(foreignKey.sourceColumns[0].toLocaleLowerCase());
      if (!column) throw new Error(uiText(
        'FOREIGN KEY column not found on \'{0}\': {1}',
        '\'{0}\'의 FOREIGN KEY 컬럼을 찾을 수 없습니다: {1}',
        table.name,
        foreignKey.sourceColumns[0],
      ));
      column.foreignKey = true;
    });
    normalizeErdChecks(table.checks, table.columns.map(column => column.name));
    normalizeErdIndexes(table.indexes, table.columns.map(column => column.name));
    return table;
  }

  function parseCreateIndex(statement: Token[], warnings: string[]): StandaloneIndex | null {
    if (!isKeyword(statement[0], 'CREATE')) return null;
    let index = 1;
    const unique = isKeyword(statement[index], 'UNIQUE');
    if (unique) index++;
    if (!isKeyword(statement[index], 'INDEX')) return null;
    index++;
    if (isKeyword(statement[index], 'CONCURRENTLY')) {
      addWarning(warnings, uiText('Skipped the CONCURRENTLY option on CREATE INDEX.', 'CREATE INDEX CONCURRENTLY 실행 방식은 제외하고 저장했습니다.'));
      index++;
    }
    if (isKeyword(statement[index], 'IF') && isKeyword(statement[index + 1], 'NOT')
      && isKeyword(statement[index + 2], 'EXISTS')) index += 3;
    const indexName = qualifiedIdentifier(statement, index);
    if (!indexName) throw new Error(uiText('Missing CREATE INDEX name.', 'CREATE INDEX 이름이 없습니다.'));
    index = indexName.next;
    if (isKeyword(statement[index], 'USING')) {
      addWarning(warnings, uiText('Skipped the USING method on CREATE INDEX.', 'CREATE INDEX USING 방식은 제외하고 저장했습니다.'));
      index += isIdentifier(statement[index + 1]) ? 2 : 1;
    }
    if (!isKeyword(statement[index], 'ON')) throw new Error(uiText(
      'Missing ON clause for index \'{0}\'.',
      '\'{0}\' 인덱스의 ON 테이블이 없습니다.',
      indexName.name,
    ));
    index++;
    if (isKeyword(statement[index], 'ONLY')) index++;
    const tableName = qualifiedIdentifier(statement, index);
    if (!tableName) throw new Error(uiText('Missing target table name for index \'{0}\'.', '\'{0}\' 인덱스의 대상 테이블 이름이 없습니다.', indexName.name));
    index = tableName.next;
    if (isKeyword(statement[index], 'USING')) {
      addWarning(warnings, uiText('Skipped the USING method on CREATE INDEX.', 'CREATE INDEX USING 방식은 제외하고 저장했습니다.'));
      index += isIdentifier(statement[index + 1]) ? 2 : 1;
    }
    if (!isSymbol(statement[index], '(')) throw new Error(uiText(
      'Missing column list for index \'{0}\'.',
      '\'{0}\' 인덱스의 컬럼 목록이 없습니다.',
      indexName.name,
    ));
    const parsed = indexedColumns(statement, index, warnings);
    index = parsed.next;
    let where = '';
    const whereIndex = statement.findIndex((token, tokenIndex) => tokenIndex >= index && isKeyword(token, 'WHERE'));
    if (whereIndex >= 0) {
      where = safeSqlFragment(renderExpressionTokens(statement.slice(whereIndex + 1)), uiText('Index WHERE clause', '인덱스 WHERE'));
      index = statement.length;
    }
    if (index < statement.length) addWarning(warnings, uiText(
      'Skipped CREATE INDEX INCLUDE, WITH, and TABLESPACE options.',
      'CREATE INDEX INCLUDE·WITH·TABLESPACE 옵션은 제외하고 저장했습니다.',
    ));
    if (tableName.parts.length > 1) {
      addWarning(warnings, uiText(
        'Skipped index target schema \'{0}\'.',
        '인덱스 대상 스키마 \'{0}\'는 제외했습니다.',
        tableName.parts.slice(0, -1).join('.'),
      ));
    }
    return {
      tableName: tableName.name,
      index: { kind: 'index', name: indexName.name, unique, columns: parsed.columns, where },
    };
  }

  function detectedDialect(source: unknown) {
    const text = String(source || '');
    const matches = [];
    if (/`[^`]+`|\bENGINE\s*=|\bAUTO_INCREMENT\b/i.test(text)) matches.push('MySQL');
    if (/\bUNLOGGED\b|\bSERIAL\b|\bTABLESPACE\b|::[A-Za-z_]/i.test(text)) matches.push('PostgreSQL');
    if (/\bPRAGMA\b|\bWITHOUT\s+ROWID\b|\bAUTOINCREMENT\b/i.test(text)) matches.push('SQLite');
    return matches.length === 1 ? matches[0] : (matches.length ? uiText('Mixed / automatic', '혼합/자동') : uiText('Standard / automatic', '표준/자동'));
  }

  function buildProject(tables: Table[], warnings: string[], options: Options, dialect: string) {
    const models: Record<string, EntityModel | RelationModel> = {};
    const elements: EntityView[] = [];
    const relations: RelationView[] = [];
    const tableByName = new Map<string, Table & { modelId: string; viewId: string }>();
    const placedTables = tables.map((table, tableIndex) => {
      const key = table.name.toLocaleLowerCase();
      if (tableByName.has(key)) throw new Error(uiText('Duplicate table name: {0}', '중복된 테이블 이름이 있습니다: {0}', table.name));
      const modelId = `ddl_entity_${tableIndex + 1}`;
      const viewId = `ddl_view_${tableIndex + 1}`;
      const placedTable = { ...table, modelId, viewId };
      tableByName.set(key, placedTable);
      const model: EntityModel = {
        id: modelId, kind: 'entity', name: table.name,
        columns: table.columns.map(column => {
          const candidate = {
            flags: [column.primaryKey ? 'PK' : '', column.foreignKey ? 'FK' : '',
              column.unique ? 'UQ' : '', column.notNull ? 'NN' : ''].filter(Boolean),
            phys: column.name, logical: '', type: column.type,
          };
          const checked = validateColumn(candidate);
          if (!checked.valid) throw new Error(uiText(
            'Could not import \'{0}.{1}\': {2}',
            '\'{0}.{1}\'을(를) 가져올 수 없습니다: {2}',
            table.name,
            column.name,
            checked.error,
          ));
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
      return placedTable;
    });

    let relationIndex = 0;
    placedTables.forEach(sourceTable => {
      sourceTable.foreignKeys.forEach(foreignKey => {
        const targetTable = tableByName.get(foreignKey.targetTable.toLocaleLowerCase());
        if (!targetTable) {
          addWarning(warnings, uiText(
            'Skipped the relationship to external reference \'{0}\'.',
            '외부 참조 \'{0}\'는 관계선으로 연결하지 못했습니다.',
            foreignKey.targetParts.join('.'),
          ));
          return;
        }
        const targetColumns = foreignKey.targetColumns.length
          ? foreignKey.targetColumns
          : targetTable.columns.filter(column => column.primaryKey).map(column => column.name);
        if (targetColumns.length !== 1) {
          throw new Error(uiText(
            'Could not find the single-column primary key on \'{1}\' referenced by \'{0}\'.',
            '\'{0}\'의 FK가 참조하는 \'{1}\' 단일 PK를 결정할 수 없습니다.',
            sourceTable.name,
            targetTable.name,
          ));
        }
        const targetColumn = targetTable.columns.find(column =>
          column.name.toLocaleLowerCase() === targetColumns[0].toLocaleLowerCase());
        const targetPrimaryKeys = targetTable.columns.filter(column => column.primaryKey);
        if (!targetColumn) {
          throw new Error(uiText(
            'Referenced column on \'{0}\' not found: {1}',
            '\'{0}\'에서 참조 컬럼을 찾을 수 없습니다: {1}',
            targetTable.name,
            targetColumns[0],
          ));
        }
        if (!targetColumn.primaryKey || targetPrimaryKeys.length !== 1) {
          addWarning(warnings,
            uiText(
              'Skipped the foreign key relationship because \'{0}.{1}\' is not a single-column primary key.',
              '참조 대상 \'{0}.{1}\'이 단일 PK가 아니어서 FK 관계선을 만들지 않았습니다.',
              targetTable.name,
              targetColumn.name,
            ));
          return;
        }
        const sourceColumn = sourceTable.columns.find(column =>
          column.name.toLocaleLowerCase() === foreignKey.sourceColumns[0].toLocaleLowerCase());
        if (!sourceColumn) {
          throw new Error(uiText(
            'FOREIGN KEY column not found on \'{0}\': {1}',
            '\'{0}\'의 FOREIGN KEY 컬럼을 찾을 수 없습니다: {1}',
            sourceTable.name,
            foreignKey.sourceColumns[0],
          ));
        }
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
      diagrams: [{ id: 'ddl_diagram_1', type: 'erd' as const, name: diagramName, elements, relations }],
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

  function parseDdl(source: unknown, options: Options = {}) {
    const text = String(source || '');
    if (!text.trim()) throw new Error(uiText('The DDL input is empty.', 'DDL 내용이 비어 있습니다.'));
    if (new TextEncoder().encode(text).length > MAX_SOURCE_BYTES) {
      throw new Error(uiText('DDL input must be 10 MB or smaller.', 'DDL은 10MB 이하만 가져올 수 있습니다.'));
    }
    const warnings: string[] = [];
    const tables: Table[] = [];
    const standaloneIndexes: StandaloneIndex[] = [];
    splitStatements(tokenize(text)).forEach(statement => {
      if (!statement.length) return;
      try {
        const table = parseCreateTable(statement, warnings);
        if (table) {
          tables.push(table);
          if (tables.length > MAX_TABLES) throw new Error(uiText('DDL exceeds the limit of {0} tables.', '테이블 수가 제한({0})을 초과합니다.', MAX_TABLES));
          return;
        }
        if (isKeyword(statement[0], 'PRAGMA') || isKeyword(statement[0], 'SET')
          || isKeyword(statement[0], 'BEGIN') || isKeyword(statement[0], 'COMMIT')) {
          addWarning(warnings, uiText('Skipped {0} statement.', '{0} 문장은 모델에 적용하지 않았습니다.', upper(statement[0])));
          return;
        }
        const standaloneIndex = parseCreateIndex(statement, warnings);
        if (standaloneIndex) {
          standaloneIndexes.push(standaloneIndex);
          return;
        }
        throw new Error(uiText('Unsupported SQL statement: {0}', '지원하지 않는 SQL 문장입니다: {0}', renderTokens(statement).slice(0, 120)));
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        if (/^DDL \d+:\d+ · /.test(message)) throw error;
        throw locatedError(message, text, statement[0]?.start || 0);
      }
    });
    if (!tables.length) throw new Error(uiText('No CREATE TABLE statements to import.', '가져올 CREATE TABLE 문이 없습니다.'));
    standaloneIndexes.forEach(entry => {
      const table = tables.find(candidate => candidate.name.toLocaleLowerCase()
        === entry.tableName.toLocaleLowerCase());
      if (!table) {
        addWarning(warnings, uiText(
          'Skipped index \'{1}\' on external table \'{0}\'.',
          '외부 테이블 \'{0}\'의 인덱스 \'{1}\'은 연결하지 못했습니다.',
          entry.tableName,
          entry.index.name,
        ));
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
}
