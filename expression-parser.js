'use strict';

/* StarUML-compatible QuickEdit expression parser/normalizer. */
(function initExpressionParser(root, factory) {
  const api = factory();
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  if (root) root.UMLExpressionParser = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function createExpressionParser() {
  const VISIBILITY = new Set(['+', '#', '-', '~']);

  const ok = (fields, normalized) => ({ valid: true, ...fields, normalized });
  const fail = error => ({ valid: false, error });

  function prefix(source) {
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

  function prefixText(parsed) {
    return [parsed.stereotype ? `«${parsed.stereotype}»` : '', parsed.visibility]
      .filter(Boolean).join(' ');
  }

  function scan(source, visit) {
    const depths = { '(': 0, '[': 0, '{': 0 };
    const closing = { ')': '(', ']': '[', '}': '{' };
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
      else if (closing[char]) {
        const open = closing[char];
        if (depths[open] <= 0) return -2;
        depths[open]--;
      }
    }
    if (quote || Object.values(depths).some(value => value !== 0)) return -2;
    return -1;
  }

  function topLevelIndex(source, target) {
    return scan(source, char => char === target);
  }

  function matchingParen(source, start) {
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

  function validMemberName(name) {
    return !!name && !/[\s:()[\]=]/.test(name);
  }

  function parseName(source) {
    const parsed = prefix(source);
    const name = parsed.rest.trim();
    if (!name) return fail('이름을 입력하세요.');
    if (scan(name, () => false) === -2) return fail('괄호 또는 따옴표가 닫히지 않았습니다.');
    const normalized = [prefixText(parsed), name].filter(Boolean).join(' ');
    return ok({ stereotype: parsed.stereotype, visibility: parsed.visibility, name }, normalized);
  }

  function parseAttribute(source) {
    const parsed = prefix(source);
    let rest = parsed.rest.trim();
    if (!rest) return fail('속성 이름을 입력하세요.');
    if (scan(rest, () => false) === -2) return fail('속성 표현식의 괄호 또는 따옴표가 닫히지 않았습니다.');

    let defaultValue = '';
    const equalAt = topLevelIndex(rest, '=');
    if (equalAt >= 0) {
      defaultValue = rest.slice(equalAt + 1).trim();
      rest = rest.slice(0, equalAt).trim();
      if (!defaultValue) return fail('기본값을 입력하거나 = 기호를 제거하세요.');
    }

    let multiplicity = '';
    const multiplicityMatch = rest.match(/\[\s*([^\]]+)\s*\]\s*$/);
    if (multiplicityMatch) {
      multiplicity = multiplicityMatch[1].trim();
      rest = rest.slice(0, multiplicityMatch.index).trim();
      if (!/^(?:\d+|\*)(?:\s*\.\.\s*(?:\d+|\*))?$/.test(multiplicity)) {
        return fail('Multiplicity는 1, *, 0..1, 0..* 형식이어야 합니다.');
      }
      multiplicity = multiplicity.replace(/\s+/g, '');
    }

    let type = '';
    const colonAt = topLevelIndex(rest, ':');
    if (colonAt >= 0) {
      type = rest.slice(colonAt + 1).trim();
      rest = rest.slice(0, colonAt).trim();
      if (!type) return fail('속성 타입을 입력하거나 : 기호를 제거하세요.');
    }
    const name = rest;
    if (!validMemberName(name)) return fail('속성 이름에는 공백이나 괄호를 사용할 수 없습니다.');

    const core = `${name}${type ? `: ${type}` : ''}${multiplicity ? ` [${multiplicity}]` : ''}${defaultValue ? ` = ${defaultValue}` : ''}`;
    const normalized = [prefixText(parsed), core].filter(Boolean).join(' ');
    return ok({
      stereotype: parsed.stereotype, visibility: parsed.visibility,
      name, type, multiplicity, defaultValue,
    }, normalized);
  }

  function parseOperation(source) {
    const parsed = prefix(source);
    let rest = parsed.rest.trim();
    if (!rest) return fail('연산 이름을 입력하세요.');

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
      if (closeAt < 0) return fail('연산 매개변수의 닫는 괄호가 없습니다.');
      name = rest.slice(0, openAt).trim();
      parameters = rest.slice(openAt + 1, closeAt).trim();
      hasParentheses = true;
      const tail = rest.slice(closeAt + 1).trim();
      if (tail) {
        if (!tail.startsWith(':')) return fail('연산 괄호 뒤에는 반환 타입만 올 수 있습니다.');
        returnType = tail.slice(1).trim();
        if (!returnType) return fail('반환 타입을 입력하거나 : 기호를 제거하세요.');
      }
    } else {
      const colonAt = topLevelIndex(rest, ':');
      if (colonAt >= 0) {
        name = rest.slice(0, colonAt).trim();
        returnType = rest.slice(colonAt + 1).trim();
        if (!returnType) return fail('반환 타입을 입력하거나 : 기호를 제거하세요.');
      }
    }
    if (!validMemberName(name)) return fail('연산 이름에는 공백이나 괄호를 사용할 수 없습니다.');
    if (parameters && scan(parameters, () => false) === -2) return fail('매개변수 표현식이 올바르지 않습니다.');

    const signature = `${name}${hasParentheses ? `(${parameters})` : ''}${returnType ? `: ${returnType}` : ''}`;
    const normalized = [prefixText(parsed), signature, properties].filter(Boolean).join(' ');
    return ok({
      stereotype: parsed.stereotype, visibility: parsed.visibility,
      name, parameters, returnType, properties,
    }, normalized);
  }

  function parseLifeline(source) {
    const parsed = prefix(source);
    let rest = parsed.rest.trim();
    if (!rest) return fail('라이프라인 이름 또는 타입을 입력하세요.');
    if (scan(rest, () => false) === -2) return fail('라이프라인 표현식의 괄호 또는 따옴표가 닫히지 않았습니다.');

    let type = '';
    const colonAt = topLevelIndex(rest, ':');
    if (colonAt >= 0) {
      type = rest.slice(colonAt + 1).trim();
      rest = rest.slice(0, colonAt).trim();
      if (!type) return fail('라이프라인 타입을 입력하거나 : 기호를 제거하세요.');
    }
    let selector = '';
    const selectorMatch = rest.match(/\[([^\]]*)\]\s*$/);
    if (selectorMatch) {
      selector = selectorMatch[1].trim();
      rest = rest.slice(0, selectorMatch.index).trim();
      if (!selector) return fail('Selector 값을 입력하거나 대괄호를 제거하세요.');
    }
    const name = rest;
    if (!name && !type) return fail('라이프라인 이름 또는 타입이 필요합니다.');
    const core = `${name}${selector ? `[${selector}]` : ''}${type ? `${name ? ': ' : ': '}${type}` : ''}`;
    const normalized = [prefixText(parsed), core].filter(Boolean).join(' ');
    return ok({ stereotype: parsed.stereotype, visibility: parsed.visibility, name, selector, type }, normalized);
  }

  function parseMessage(source) {
    const parsed = prefix(source);
    let rest = parsed.rest.trim();
    if (!rest) return fail('메시지 이름을 입력하세요.');
    let target = '';
    const equalAt = topLevelIndex(rest, '=');
    if (equalAt >= 0) {
      target = rest.slice(0, equalAt).trim();
      rest = rest.slice(equalAt + 1).trim();
      if (!target || !rest) return fail('메시지 대입식은 target = message 형식이어야 합니다.');
    }
    let name = rest, argumentsText = '', hasParentheses = false;
    const openAt = rest.indexOf('(');
    if (openAt >= 0) {
      const closeAt = matchingParen(rest, openAt);
      if (closeAt < 0 || rest.slice(closeAt + 1).trim()) return fail('메시지 호출 괄호가 올바르지 않습니다.');
      name = rest.slice(0, openAt).trim();
      argumentsText = rest.slice(openAt + 1, closeAt).trim();
      hasParentheses = true;
    }
    if (!validMemberName(name)) return fail('메시지 이름에는 공백이나 괄호를 사용할 수 없습니다.');
    const call = `${name}${hasParentheses ? `(${argumentsText})` : ''}`;
    const core = target ? `${target} = ${call}` : call;
    const normalized = [prefixText(parsed), core].filter(Boolean).join(' ');
    return ok({
      stereotype: parsed.stereotype, visibility: parsed.visibility,
      target, name, arguments: argumentsText,
    }, normalized);
  }

  function parse(kind, source) {
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
});
