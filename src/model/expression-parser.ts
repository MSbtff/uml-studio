'use strict';

type ExpressionParserApi = ReturnType<typeof createExpressionParser>;
declare var UMLExpressionParser: ExpressionParserApi;

(function initExpressionParser(root: typeof globalThis & { UMLExpressionParser?: ExpressionParserApi }, factory: () => ExpressionParserApi) {
  const api = factory();
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  if (root) root.UMLExpressionParser = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, createExpressionParser);

function createExpressionParser() {
  const { text: uiText } = globalThis.UMLLanguage
    ?? require('../editor/language.js') as typeof UMLLanguage;

  const VISIBILITY = new Set(['+', '#', '-', '~']);

  const ok = <Fields extends object>(fields: Fields, normalized: string) => ({ valid: true as const, ...fields, normalized });
  const fail = (error: string) => ({ valid: false as const, error });

  function prefix(source: unknown) {
    let rest = String(source || '').trim();
    let stereotype = '';
    const unicode = rest.match(/^«([^»]+)»\s*/);
    const ascii = rest.match(/^<<([^<>]+)>>\s*/);
    const match = unicode || ascii;
    if (match) {
      stereotype = match[1].trim();
      rest = rest.slice(match[0].length).trimStart();
    }
    let visibility = '';
    if (VISIBILITY.has(rest[0])) {
      visibility = rest[0];
      rest = rest.slice(1).trimStart();
    }
    return { stereotype, visibility, rest };
  }

  function prefixText(parsed: ReturnType<typeof prefix>) {
    return [parsed.stereotype ? `«${parsed.stereotype}»` : '', parsed.visibility]
      .filter(Boolean).join(' ');
  }

  function scan(source: string, visit: (char: string, index: number) => boolean) {
    const depths: Record<string, number> = { '(': 0, '[': 0, '{': 0 };
    const closing: Partial<Record<string, string>> = { ')': '(', ']': '[', '}': '{' };
    let quote = '', escaped = false;
    for (let index = 0; index < source.length; index++) {
      const char = source[index];
      if (quote) {
        if (escaped) escaped = false;
        else if (char === '\\') escaped = true;
        else if (char === quote) quote = '';
        continue;
      }
      if (char === '"' || char === "'") { quote = char; continue; }
      const topLevel = depths['('] === 0 && depths['['] === 0 && depths['{'] === 0;
      if (topLevel && visit(char, index) === true) return index;
      if (Object.prototype.hasOwnProperty.call(depths, char)) depths[char]++;
      else {
        const open = closing[char];
        if (open === undefined) continue;
        if (depths[open] <= 0) return -2;
        depths[open]--;
      }
    }
    if (quote || Object.values(depths).some(value => value !== 0)) return -2;
    return -1;
  }

  function topLevelIndex(source: string, target: string) {
    return scan(source, char => char === target);
  }

  function matchingParen(source: string, start: number) {
    let depth = 0, quote = '', escaped = false;
    for (let index = start; index < source.length; index++) {
      const char = source[index];
      if (quote) {
        if (escaped) escaped = false;
        else if (char === '\\') escaped = true;
        else if (char === quote) quote = '';
        continue;
      }
      if (char === '"' || char === "'") { quote = char; continue; }
      if (char === '(') depth++;
      if (char === ')' && --depth === 0) return index;
      if (depth < 0) return -1;
    }
    return -1;
  }

  function validMemberName(name: string) {
    return !!name && !/[\s:()[\]=]/.test(name);
  }

  function parseName(source: unknown) {
    const parsed = prefix(source);
    const name = parsed.rest.trim();
    if (!name) return fail(uiText('Enter a name.', '이름을 입력하세요.'));
    if (scan(name, () => false) === -2) return fail(uiText('Unclosed parenthesis or quote.', '괄호 또는 따옴표가 닫히지 않았습니다.'));
    const normalized = [prefixText(parsed), name].filter(Boolean).join(' ');
    return ok({ stereotype: parsed.stereotype, visibility: parsed.visibility, name }, normalized);
  }

  function parseAttribute(source: unknown) {
    const parsed = prefix(source);
    let rest = parsed.rest.trim();
    if (!rest) return fail(uiText('Enter an attribute name.', '속성 이름을 입력하세요.'));
    if (scan(rest, () => false) === -2) return fail(uiText(
      'Unclosed parenthesis or quote in the attribute expression.',
      '속성 표현식의 괄호 또는 따옴표가 닫히지 않았습니다.',
    ));

    let defaultValue = '';
    const equalAt = topLevelIndex(rest, '=');
    if (equalAt >= 0) {
      defaultValue = rest.slice(equalAt + 1).trim();
      rest = rest.slice(0, equalAt).trim();
      if (!defaultValue) return fail(uiText('Enter a default value or remove the equals sign.', '기본값을 입력하거나 = 기호를 제거하세요.'));
    }

    let multiplicity = '';
    const multiplicityMatch = rest.match(/\[\s*([^\]]+)\s*\]\s*$/);
    if (multiplicityMatch) {
      multiplicity = multiplicityMatch[1].trim();
      rest = rest.slice(0, multiplicityMatch.index).trim();
      if (!/^(?:\d+|\*)(?:\s*\.\.\s*(?:\d+|\*))?$/.test(multiplicity)) {
        return fail(uiText('Enter a multiplicity such as 1, *, 0..1, or 0..*.', 'Multiplicity는 1, *, 0..1, 0..* 형식이어야 합니다.'));
      }
      multiplicity = multiplicity.replace(/\s+/g, '');
    }

    let type = '';
    const colonAt = topLevelIndex(rest, ':');
    if (colonAt >= 0) {
      type = rest.slice(colonAt + 1).trim();
      rest = rest.slice(0, colonAt).trim();
      if (!type) return fail(uiText('Enter an attribute type or remove the colon.', '속성 타입을 입력하거나 : 기호를 제거하세요.'));
    }
    const name = rest;
    if (!validMemberName(name)) return fail(uiText('Attribute names cannot contain spaces or parentheses.', '속성 이름에는 공백이나 괄호를 사용할 수 없습니다.'));

    const core = `${name}${type ? `: ${type}` : ''}${multiplicity ? ` [${multiplicity}]` : ''}${defaultValue ? ` = ${defaultValue}` : ''}`;
    const normalized = [prefixText(parsed), core].filter(Boolean).join(' ');
    return ok({
      stereotype: parsed.stereotype, visibility: parsed.visibility,
      name, type, multiplicity, defaultValue,
    }, normalized);
  }

  function parseOperation(source: unknown) {
    const parsed = prefix(source);
    let rest = parsed.rest.trim();
    if (!rest) return fail(uiText('Enter an operation name.', '연산 이름을 입력하세요.'));

    let properties = '';
    const propertyMatch = rest.match(/\s*(\{[^{}]+\})\s*$/);
    if (propertyMatch) {
      properties = propertyMatch[1].trim();
      rest = rest.slice(0, propertyMatch.index).trim();
    }

    let returnType = '';
    let name = rest, parameters = '', hasParentheses = false;
    const openAt = rest.indexOf('(');
    if (openAt >= 0) {
      const closeAt = matchingParen(rest, openAt);
      if (closeAt < 0) return fail(uiText('Missing closing parenthesis for operation parameters.', '연산 매개변수의 닫는 괄호가 없습니다.'));
      name = rest.slice(0, openAt).trim();
      parameters = rest.slice(openAt + 1, closeAt).trim();
      hasParentheses = true;
      const tail = rest.slice(closeAt + 1).trim();
      if (tail) {
        if (!tail.startsWith(':')) return fail(uiText(
          'Only the return type can follow the operation parentheses.',
          '연산 괄호 뒤에는 반환 타입만 올 수 있습니다.',
        ));
        returnType = tail.slice(1).trim();
        if (!returnType) return fail(uiText('Enter a return type or remove the colon.', '반환 타입을 입력하거나 : 기호를 제거하세요.'));
      }
    } else {
      const colonAt = topLevelIndex(rest, ':');
      if (colonAt >= 0) {
        name = rest.slice(0, colonAt).trim();
        returnType = rest.slice(colonAt + 1).trim();
        if (!returnType) return fail(uiText('Enter a return type or remove the colon.', '반환 타입을 입력하거나 : 기호를 제거하세요.'));
      }
    }
    if (!validMemberName(name)) return fail(uiText('Operation names cannot contain spaces or parentheses.', '연산 이름에는 공백이나 괄호를 사용할 수 없습니다.'));
    if (parameters && scan(parameters, () => false) === -2) return fail(uiText('Invalid parameter expression.', '매개변수 표현식이 올바르지 않습니다.'));

    const signature = `${name}${hasParentheses ? `(${parameters})` : ''}${returnType ? `: ${returnType}` : ''}`;
    const normalized = [prefixText(parsed), signature, properties].filter(Boolean).join(' ');
    return ok({
      stereotype: parsed.stereotype, visibility: parsed.visibility,
      name, parameters, returnType, properties,
    }, normalized);
  }

  function parseLifeline(source: unknown) {
    const parsed = prefix(source);
    let rest = parsed.rest.trim();
    if (!rest) return fail(uiText('Enter a lifeline name or type.', '라이프라인 이름 또는 타입을 입력하세요.'));
    if (scan(rest, () => false) === -2) return fail(uiText(
      'Unclosed parenthesis or quote in the lifeline expression.',
      '라이프라인 표현식의 괄호 또는 따옴표가 닫히지 않았습니다.',
    ));

    let type = '';
    const colonAt = topLevelIndex(rest, ':');
    if (colonAt >= 0) {
      type = rest.slice(colonAt + 1).trim();
      rest = rest.slice(0, colonAt).trim();
      if (!type) return fail(uiText('Enter a lifeline type or remove the colon.', '라이프라인 타입을 입력하거나 : 기호를 제거하세요.'));
    }
    let selector = '';
    const selectorMatch = rest.match(/\[([^\]]*)\]\s*$/);
    if (selectorMatch) {
      selector = selectorMatch[1].trim();
      rest = rest.slice(0, selectorMatch.index).trim();
      if (!selector) return fail(uiText('Enter a selector value or remove the brackets.', 'Selector 값을 입력하거나 대괄호를 제거하세요.'));
    }
    const name = rest;
    if (!name && !type) return fail(uiText('A lifeline name or type is required.', '라이프라인 이름 또는 타입이 필요합니다.'));
    const core = `${name}${selector ? `[${selector}]` : ''}${type ? `${name ? ': ' : ': '}${type}` : ''}`;
    const normalized = [prefixText(parsed), core].filter(Boolean).join(' ');
    return ok({ stereotype: parsed.stereotype, visibility: parsed.visibility, name, selector, type }, normalized);
  }

  function parseMessage(source: unknown) {
    const parsed = prefix(source);
    let rest = parsed.rest.trim();
    if (!rest) return fail(uiText('Enter a message name.', '메시지 이름을 입력하세요.'));
    let target = '';
    const equalAt = topLevelIndex(rest, '=');
    if (equalAt >= 0) {
      target = rest.slice(0, equalAt).trim();
      rest = rest.slice(equalAt + 1).trim();
      if (!target || !rest) return fail(uiText('Use target = message for a message assignment.', '메시지 대입식은 target = message 형식이어야 합니다.'));
    }
    let name = rest, argumentsText = '', hasParentheses = false;
    const openAt = rest.indexOf('(');
    if (openAt >= 0) {
      const closeAt = matchingParen(rest, openAt);
      if (closeAt < 0 || rest.slice(closeAt + 1).trim()) return fail(uiText('Invalid message call parentheses.', '메시지 호출 괄호가 올바르지 않습니다.'));
      name = rest.slice(0, openAt).trim();
      argumentsText = rest.slice(openAt + 1, closeAt).trim();
      hasParentheses = true;
    }
    if (!validMemberName(name)) return fail(uiText('Message names cannot contain spaces or parentheses.', '메시지 이름에는 공백이나 괄호를 사용할 수 없습니다.'));
    const call = `${name}${hasParentheses ? `(${argumentsText})` : ''}`;
    const core = target ? `${target} = ${call}` : call;
    const normalized = [prefixText(parsed), core].filter(Boolean).join(' ');
    return ok({
      stereotype: parsed.stereotype, visibility: parsed.visibility,
      target, name, arguments: argumentsText,
    }, normalized);
  }

  function parse(kind: string, source: unknown) {
    switch (kind) {
      case 'attribute':
      case 'slot': return parseAttribute(source);
      case 'operation': return parseOperation(source);
      case 'lifeline': return parseLifeline(source);
      case 'message': return parseMessage(source);
      case 'name':
      case 'literal':
      case 'reception': return parseName(source);
      default: return ok({ value: String(source || '').trim() }, String(source || '').trim());
    }
  }

  return {
    parse,
    parseName,
    parseAttribute,
    parseOperation,
    parseLifeline,
    parseMessage,
  };
}
