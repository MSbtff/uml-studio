'use strict';

type StatusBarApi = ReturnType<typeof createStatusBarModule>;
declare var UMLStatusBar: StatusBarApi;

(function initStatusBarModule(root: typeof globalThis & { UMLStatusBar?: StatusBarApi }, factory: () => StatusBarApi) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root) root.UMLStatusBar = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, createStatusBarModule);

function createStatusBarModule() {
  const { displayLabel, label: uiLabel, text: uiText, locale } = globalThis.UMLLanguage
    ?? require('./language.js') as typeof UMLLanguage;

  const REQUIRED_FUNCTIONS = Object.freeze([
    'clearTimeout',
    'dg',
    'diagramKindLabel',
    'isCommMsg',
    'isMsg',
    'setTimeout',
  ] as const);
  const REQUIRED_VALUES = Object.freeze([
    'ACTIVITY_PIN_KINDS',
    'DIAGRAM_META',
    'REL_STYLE',
    'REQUIREMENT_RELATION_KINDS',
    'state',
    'statusLeft',
    'statusRight',
  ] as const);
  const FLASH_DURATION_MS = 1800;

  interface StatusBarState {
    tool: string;
    zoom: number;
    projectName: string;
    dirty?: boolean;
    runtimeErrors?: { count: number };
    autosaveStatus?: string;
    autosaveBackend?: string;
    lastAutosavedAt?: number;
  }
  interface StatusBarDependencies {
    clearTimeout(timer: number): void;
    dg(): { type: string; elements: unknown[]; relations: unknown[] };
    diagramKindLabel(kind: string): string;
    isCommMsg(kind: string): boolean;
    isMsg(kind: string): boolean;
    setTimeout(callback: () => void, delay: number): number;
    ACTIVITY_PIN_KINDS: ReadonlySet<string>;
    REQUIREMENT_RELATION_KINDS: ReadonlySet<string>;
    DIAGRAM_META: Record<string, { label: string }>;
    REL_STYLE: Record<string, unknown>;
    state: StatusBarState;
    statusLeft: Pick<HTMLElement, 'textContent'>;
    statusRight: Pick<HTMLElement, 'textContent'>;
  }

  function create(dependencies?: StatusBarDependencies) {
    const deps: Partial<StatusBarDependencies> = dependencies || {};
    const missing: string[] = REQUIRED_FUNCTIONS.filter(name => typeof deps[name] !== 'function');
    REQUIRED_VALUES.forEach(name => {
      if (deps[name] == null) missing.push(name);
    });
    for (const name of ['ACTIVITY_PIN_KINDS', 'REQUIREMENT_RELATION_KINDS'] as const) {
      if (deps[name] && typeof deps[name].has !== 'function') missing.push(`${name}.has`);
    }
    for (const name of ['DIAGRAM_META', 'REL_STYLE', 'state', 'statusLeft', 'statusRight'] as const) {
      if (deps[name] != null && typeof deps[name] !== 'object') missing.push(name);
    }
    if (missing.length) {
      throw new TypeError(`Status Bar 의존성이 없습니다: ${[...new Set(missing)].join(', ')}`);
    }

    const {
      ACTIVITY_PIN_KINDS,
      DIAGRAM_META,
      REL_STYLE,
      REQUIREMENT_RELATION_KINDS,
      clearTimeout,
      dg,
      diagramKindLabel,
      isCommMsg,
      isMsg,
      setTimeout,
      state,
      statusLeft,
      statusRight,
    } = deps as StatusBarDependencies;
    let flashTimer: number | null = null;

    function toolInstruction() {
      const diagram = dg();
      const tool = state.tool;
      if (tool === 'select') {
        return uiText(
          'Select an element · Enter to edit · Ctrl/Cmd+Enter to add a member · Ctrl/Cmd+Shift+Enter to add an operation · Del to delete',
          '선택 후 Enter 편집 · Ctrl/Cmd+Enter 멤버 추가 · Ctrl/Cmd+Shift+Enter 연산 추가 · Del 삭제',
        );
      }
      if (REL_STYLE[tool]) {
        if (tool === 'informationflow') {
          return uiText(
            'Information Flow: click the sender, then the receiver. Set conveyed information in Properties. Esc to cancel.',
            '정보 흐름: 정보 송신 주체를 클릭한 뒤 수신 주체를 클릭하세요 · 전달 정보는 생성 후 속성에서 선택 · Esc 취소',
          );
        }
        if (REQUIREMENT_RELATION_KINDS.has(tool)) {
          return uiText(
            '{0}: click the start, then the requirement or target. The editor checks SysML direction rules. Esc to cancel.',
            '{0}: 시작 요소를 클릭한 뒤 요구사항 또는 대상 요소를 클릭하세요 · SysML 방향 규칙을 자동 검사합니다 · Esc 취소',
            diagramKindLabel(tool),
          );
        }
        if (isCommMsg(tool)) {
          return uiText(
            '{0}: click a connector to add a message. Esc to cancel.',
            '{0}: 기존 커넥터 선을 클릭해 메시지를 추가하세요 · Esc 취소',
            diagramKindLabel(tool),
          );
        }
        if (isMsg(tool)) {
          return uiText(
            '{0}: click the source and target lifelines. Use the same lifeline for a self-message. Esc to cancel.',
            '{0}: 시작 라이프라인 클릭 → 대상 라이프라인 클릭 (같은 라이프라인 = 자기 호출) · Esc 취소',
            diagramKindLabel(tool),
          );
        }
        return uiText(
          '{0}: click the start, then click or drag to the target. Esc to cancel.',
          '{0}: 시작 요소를 클릭한 뒤 대상 요소를 클릭(또는 드래그)하세요 · Esc 취소',
          diagramKindLabel(tool),
        );
      }
      if (tool === 'region') {
        return uiText(
          'Click inside a composite state to add a region. Multiple regions run in parallel.',
          '복합 상태 내부를 클릭해 영역 추가 · 여러 영역은 직교(동시) 영역으로 표시됩니다',
        );
      }
      if (tool === 'connectionpointref') {
        return uiText(
          'Click the edge of a submachine state to add a connection point reference. Drag along the edge to move it.',
          '하위 상태 머신의 테두리를 클릭해 접점 참조 추가 · 생성 후 드래그로 테두리를 따라 이동',
        );
      }
      if (tool === 'part' || tool === 'collaborationuse') {
        return diagram.type === 'ibd'
          ? uiText(
            'Click inside an IBD frame, part, or reference to add {0}.',
            '내부 블록 프레임 또는 파트/참조 내부를 클릭해 {0} 추가',
            diagramKindLabel(tool),
          )
          : uiText('Click inside a class or collaboration to add {0}.', '클래스 또는 협업 내부를 클릭해 {0} 추가', diagramKindLabel(tool));
      }
      if (tool === 'reference' || tool === 'value') {
        return diagram.type === 'parametric'
          ? uiText('Click inside a parametric frame to add a {0} property.', '파라메트릭 프레임 내부를 클릭해 {0} 속성 추가', diagramKindLabel(tool))
          : uiText(
            'Click inside an IBD frame, part, or reference to add {0}.',
            '내부 블록 프레임 또는 파트/참조 내부를 클릭해 {0} 추가',
            diagramKindLabel(tool),
          );
      }
      if (tool === 'constraintproperty') {
        return uiText('Click inside a parametric frame to add a constraint property.', '파라메트릭 프레임 내부를 클릭해 제약 속성 추가');
      }
      if (tool === 'constraintparameter') {
        return uiText(
          'Click the edge of a parametric frame or constraint property to add a constraint parameter.',
          '파라메트릭 프레임 또는 제약 속성의 테두리를 클릭해 제약 매개변수 추가',
        );
      }
      if (tool === 'port') {
        if (diagram.type === 'bdd') {
          return uiText(
            'Click the edge of a block, interface block, or constraint block to add a port. Drag along the edge to move it.',
            '블록, 인터페이스 블록 또는 제약 블록의 테두리를 클릭해 포트 추가 · 생성 후 드래그로 테두리를 따라 이동',
          );
        }
        return diagram.type === 'ibd'
          ? uiText(
            'Click the edge of an IBD frame, part, or reference to add a port. Drag along the edge to move it.',
            '내부 블록 프레임, 파트 또는 참조의 테두리를 클릭해 포트 추가 · 생성 후 드래그로 테두리를 따라 이동',
          )
          : uiText(
            'Click the edge of a class, collaboration, or part to add a port. Drag along the edge to move it.',
            '클래스, 협업 또는 파트의 테두리를 클릭해 포트 추가 · 생성 후 드래그로 테두리를 따라 이동',
          );
      }
      if (ACTIVITY_PIN_KINDS.has(tool)) {
        const owner = tool === 'expansioninput' || tool === 'expansionoutput'
          ? diagramKindLabel('expansionregion')
          : uiText('action, signal event action, or time event action', '동작 또는 신호·시간 이벤트 동작');
        return uiText(
          'Add {1} at the edge of the {0}. Drag along the edge to move it.',
          '{0}의 테두리를 클릭해 {1} 추가 · 생성 후 드래그로 테두리를 따라 이동',
          owner,
          diagramKindLabel(tool),
        );
      }
      if (tool === 'timingstate') return uiText(
        'Click inside a timing lifeline to add a state or condition.',
        '타이밍 라이프라인 내부를 클릭해 상태·조건 행 추가',
      );
      if (tool === 'timesegment') return uiText(
        'Click a state or condition row to add a time segment. Drag to move or resize it.',
        '상태·조건 행을 클릭해 시간 구간 추가 · 생성 후 좌우 이동과 기간 조절 가능',
      );
      if (tool === 'timeconstraint') return uiText(
        'Click a time segment or timing message to attach a time constraint.',
        '시간 구간 또는 타이밍 메시지를 클릭해 시간 제약 부착',
      );
      if (tool === 'timetick') return uiText('Click the time axis to add a time tick.', '시간축 위치를 클릭해 시간 눈금 추가');
      return uiText('Click the canvas to add {0}.', '캔버스를 클릭해 {0} 생성', diagramKindLabel(tool));
    }

    function runtimeErrorText() {
      const count = state.runtimeErrors?.count;
      return count ? uiText('⚠ Errors: {0} · ', '⚠ 오류 {0}건 · ', count) : '';
    }

    function autosaveStatusText() {
      if (state.autosaveStatus === 'saving') return uiText('Saving to database · ', 'DB 저장 중 · ');
      if (state.autosaveStatus === 'error') return uiText('Database save failed · ', 'DB 저장 오류 · ');
      if (state.autosaveStatus === 'fallback') return uiText('Using recovery storage · ', '비상 저장소 사용 · ');
      if (!state.lastAutosavedAt) return '';
      const savedBackend = state.autosaveBackend === 'sqlite' ? uiText('Saved to SQLite', 'SQLite 저장') : uiText('Autosaved', 'DB 자동저장');
      const savedAt = new Date(state.lastAutosavedAt).toLocaleTimeString(locale, {
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
      });
      return `${savedBackend} ${savedAt} · `;
    }

    function render() {
      const diagram = dg();
      statusLeft.textContent = toolInstruction();
      statusRight.textContent = `${runtimeErrorText()}${state.dirty ? uiText('● Unsaved changes · ', '● 파일 저장 필요 · ') : ''}${autosaveStatusText()}${state.projectName} · ${displayLabel(DIAGRAM_META[diagram.type])} · ${uiLabel('Elements', '요소')} ${diagram.elements.length} · ${uiLabel('Relations', '관계')} ${diagram.relations.length} · ${uiLabel('Zoom', '배율')} ${Math.round(state.zoom * 100)}%`;
    }

    function flash(message: string) {
      if (flashTimer !== null) clearTimeout(flashTimer);
      statusLeft.textContent = message;
      flashTimer = setTimeout(() => {
        flashTimer = null;
        render();
      }, FLASH_DURATION_MS);
    }

    function clearFlash() {
      if (flashTimer !== null) {
        clearTimeout(flashTimer);
        flashTimer = null;
      }
      render();
    }

    return Object.freeze({ clearFlash, flash, render });
  }

  return Object.freeze({
    FLASH_DURATION_MS,
    REQUIRED_FUNCTIONS,
    REQUIRED_VALUES,
    create,
  });
}
