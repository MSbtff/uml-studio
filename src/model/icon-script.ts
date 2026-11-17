'use strict';

/*
 * Safe parser for StarUML-style stereotype icon scripts.
 *
 * The language is intentionally data-only: commands are normalized into a
 * bounded drawing list and are never evaluated as JavaScript.
 */
(function initIconScript<Api>(root: typeof globalThis & { UMLIconScript?: Api }, factory: () => Api) {
  const api = factory();
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  if (root) root.UMLIconScript = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function createIconScript() {
  const MAX_LINES = 240;
  const MAX_COMMANDS = 200;
  const COLOR_NAMES = new Set([
    'black', 'white', 'red', 'green', 'blue', 'gray', 'grey', 'yellow',
    'orange', 'purple', 'pink', 'brown', 'cyan', 'magenta', 'transparent', 'none',
  ]);
  const FIXED_ARITY: Partial<Record<string, number>> = {
    l: 4, r: 4, rr: 5, e: 4, a: 5,
    fr: 4, frr: 5, fe: 4, fa: 5,
  };
  const POLY_COMMANDS = new Set(['pl', 'pg', 'fp']);

  type IconStyle = { line: string; fill: string; alpha: number; width: number; pattern: number[] };
  type DrawingCommand = { op: string; values: number[]; style: IconStyle; line: number };

  const cloneStyle = (style: IconStyle) => ({
    line: style.line,
    fill: style.fill,
    alpha: style.alpha,
    width: style.width,
    pattern: style.pattern.slice(),
  });

  function validColor(value?: string | null) {
    return /^#[0-9a-f]{3,8}$/i.test(value || '') || COLOR_NAMES.has(String(value || '').toLowerCase());
  }

  function parseNumbers(tokens: string[], lineNo: number, errors: string[]) {
    const values = tokens.map(Number);
    if (values.some(value => !Number.isFinite(value) || Math.abs(value) > 10000)) {
      errors.push(`${lineNo}행: 좌표와 크기는 -10000~10000 범위의 숫자여야 합니다.`);
      return null;
    }
    return values;
  }

  function parseIconScript(source: unknown) {
    const text = String(source || '');
    if (!text.trim()) return { valid: true, width: 40, height: 40, commands: [], errors: [] };
    const rawLines = text.replace(/\r/g, '').split('\n');
    const errors: string[] = [];
    const commands: DrawingCommand[] = [];
    if (rawLines.length > MAX_LINES) {
      return {
        valid: false, width: 40, height: 40, commands: [],
        errors: [`Icon Script는 최대 ${MAX_LINES}행까지 사용할 수 있습니다.`],
      };
    }

    let width = 40, height = 40, headerSeen = false;
    const style: IconStyle = { line: '#3d3a2e', fill: '#fffbd8', alpha: 1, width: 1, pattern: [] };

    rawLines.forEach((raw, index) => {
      const lineNo = index + 1;
      const trimmed = raw.trim();
      if (!trimmed || trimmed.startsWith('#')) return;
      const tokens = trimmed.split(/\s+/);
      const op = tokens[0].toLowerCase();

      if (!headerSeen) {
        if (op !== '!icon') {
          errors.push(`${lineNo}행: 첫 명령은 !icon width height 헤더여야 합니다.`);
          headerSeen = true;
          return;
        }
        const values = parseNumbers(tokens.slice(1, 3), lineNo, errors);
        if (!values || values.length !== 2 || values.some(value => value <= 0 || value > 1000)) {
          errors.push(`${lineNo}행: Icon 좌표계의 폭과 높이는 1~1000이어야 합니다.`);
        } else {
          [width, height] = values;
        }
        headerSeen = true;
        return;
      }

      if (commands.length >= MAX_COMMANDS) {
        if (!errors.some(error => error.includes('도형 명령'))) {
          errors.push(`Icon Script는 최대 ${MAX_COMMANDS}개의 도형 명령을 사용할 수 있습니다.`);
        }
        return;
      }

      if (op === '%l' || op === '%f') {
        const color = tokens[1] || (op === '%l' ? '#3d3a2e' : '#fffbd8');
        if (!validColor(color)) errors.push(`${lineNo}행: 안전한 CSS 색상 또는 #RGB/#RRGGBB 값을 사용하세요.`);
        else style[op === '%l' ? 'line' : 'fill'] = color;
        return;
      }
      if (op === '%a') {
        const alpha = Number(tokens[1]);
        if (!Number.isFinite(alpha) || alpha < 0 || alpha > 1) errors.push(`${lineNo}행: alpha는 0~1이어야 합니다.`);
        else style.alpha = alpha;
        return;
      }
      if (op === '%w') {
        const strokeWidth = Number(tokens[1]);
        if (!Number.isFinite(strokeWidth) || strokeWidth <= 0 || strokeWidth > 50) errors.push(`${lineNo}행: 선 굵기는 0보다 크고 50 이하여야 합니다.`);
        else style.width = strokeWidth;
        return;
      }
      if (op === '%p') {
        const patternTokens = tokens.slice(1).filter(token => !token.startsWith('#'));
        const pattern = parseNumbers(patternTokens, lineNo, errors);
        if (pattern && (pattern.length > 12 || pattern.some(value => value <= 0))) {
          errors.push(`${lineNo}행: 선 패턴은 최대 12개의 양수로 지정하세요.`);
        } else if (pattern) style.pattern = pattern;
        return;
      }

      const valueTokens = tokens.slice(1).filter(token => !token.startsWith('#'));
      if (Object.prototype.hasOwnProperty.call(FIXED_ARITY, op)) {
        if (valueTokens.length !== FIXED_ARITY[op]) {
          errors.push(`${lineNo}행: ${op} 명령에는 숫자 ${FIXED_ARITY[op]}개가 필요합니다.`);
          return;
        }
      } else if (POLY_COMMANDS.has(op)) {
        if (valueTokens.length < 4 || valueTokens.length % 2 !== 0) {
          errors.push(`${lineNo}행: ${op} 명령에는 두 점 이상의 x y 좌표쌍이 필요합니다.`);
          return;
        }
      } else {
        errors.push(`${lineNo}행: 지원하지 않는 명령입니다: ${op}`);
        return;
      }
      const values = parseNumbers(valueTokens, lineNo, errors);
      if (values) commands.push({ op, values, style: cloneStyle(style), line: lineNo });
    });

    if (!headerSeen) errors.push('!icon width height 헤더가 필요합니다.');
    return { valid: errors.length === 0, width, height, commands, errors };
  }

  return { parseIconScript, validColor, MAX_LINES, MAX_COMMANDS };
});
