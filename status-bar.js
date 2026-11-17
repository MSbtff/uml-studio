'use strict';

/* Status Bar — owns tool guidance, project/save summaries, and temporary
   announcements without taking ownership of project or autosave state. */
(function initStatusBarModule(root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root) root.UMLStatusBar = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function createStatusBarModule() {
  const REQUIRED_FUNCTIONS = Object.freeze([
    'clearTimeout',
    'dg',
    'diagramKindLabel',
    'isCommMsg',
    'isMsg',
    'setTimeout',
  ]);
  const REQUIRED_VALUES = Object.freeze([
    'ACTIVITY_PIN_KINDS',
    'DIAGRAM_META',
    'KIND_META',
    'REL_STYLE',
    'REQUIREMENT_RELATION_KINDS',
    'state',
    'statusLeft',
    'statusRight',
  ]);
  const FLASH_DURATION_MS = 1800;

  function create(dependencies) {
    const deps = dependencies || {};
    const missing = REQUIRED_FUNCTIONS.filter(name => typeof deps[name] !== 'function');
    REQUIRED_VALUES.forEach(name => {
      if (deps[name] == null) missing.push(name);
    });
    for (const name of ['ACTIVITY_PIN_KINDS', 'REQUIREMENT_RELATION_KINDS']) {
      if (deps[name] && typeof deps[name].has !== 'function') missing.push(`${name}.has`);
    }
    for (const name of ['DIAGRAM_META', 'KIND_META', 'REL_STYLE', 'state', 'statusLeft', 'statusRight']) {
      if (deps[name] != null && typeof deps[name] !== 'object') missing.push(name);
    }
    if (missing.length) {
      throw new TypeError(`Status Bar 의존성이 없습니다: ${[...new Set(missing)].join(', ')}`);
    }

    const {
      ACTIVITY_PIN_KINDS,
      DIAGRAM_META,
      KIND_META,
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
    } = deps;
    let flashTimer = null;

    function toolInstruction() {
      const diagram = dg();
      const tool = state.tool;
      if (tool === 'select') {
        return '선택 후 Enter 편집 · Ctrl/Cmd+Enter 멤버 추가 · Ctrl/Cmd+Shift+Enter 연산 추가 · Del 삭제';
      }
      if (REL_STYLE[tool]) {
        if (tool === 'informationflow') {
          return 'Information Flow: 정보 송신 주체를 클릭한 뒤 수신 주체를 클릭하세요 · 전달 정보는 생성 후 속성에서 선택 · Esc 취소';
        }
        if (REQUIREMENT_RELATION_KINDS.has(tool)) {
          return `${KIND_META[tool].label}: 시작 요소를 클릭한 뒤 Requirement 또는 대상 요소를 클릭하세요 · SysML 방향 규칙을 자동 검사합니다 · Esc 취소`;
        }
        if (isCommMsg(tool)) {
          return `${KIND_META[tool].label}: 기존 Connector 선을 클릭해 메시지를 추가하세요 · Esc 취소`;
        }
        if (isMsg(tool)) {
          return `${KIND_META[tool].label}: 시작 라이프라인 클릭 → 대상 라이프라인 클릭 (같은 라이프라인 = self message) · Esc 취소`;
        }
        return `${diagramKindLabel(tool)}: 시작 요소를 클릭한 뒤 대상 요소를 클릭(또는 드래그)하세요 · Esc 취소`;
      }
      if (tool === 'region') {
        return 'Composite State 내부를 클릭해 Region 추가 · 여러 Region은 직교(동시) 영역으로 표시됩니다';
      }
      if (tool === 'connectionpointref') {
        return 'Submachine State의 테두리를 클릭해 Connection Point Reference 추가 · 생성 후 드래그로 테두리를 따라 이동';
      }
      if (tool === 'part' || tool === 'collaborationuse') {
        return diagram.type === 'ibd'
          ? `IBD Frame 또는 Part/Reference 내부를 클릭해 ${KIND_META[tool].label} 추가`
          : `Class 또는 Collaboration 내부를 클릭해 ${KIND_META[tool].label} 추가`;
      }
      if (tool === 'reference' || tool === 'value') {
        return diagram.type === 'parametric'
          ? `Parametric Frame 내부를 클릭해 ${KIND_META[tool].label} Property 추가`
          : `IBD Frame 또는 Part/Reference 내부를 클릭해 ${KIND_META[tool].label} 추가`;
      }
      if (tool === 'constraintproperty') {
        return 'Parametric Frame 내부를 클릭해 Constraint Property 추가';
      }
      if (tool === 'constraintparameter') {
        return 'Parametric Frame 또는 Constraint Property의 테두리를 클릭해 Constraint Parameter 추가';
      }
      if (tool === 'port') {
        if (diagram.type === 'bdd') {
          return 'Block, Interface Block 또는 Constraint Block의 테두리를 클릭해 Port 추가 · 생성 후 드래그로 테두리를 따라 이동';
        }
        return diagram.type === 'ibd'
          ? 'IBD Frame, Part 또는 Reference의 테두리를 클릭해 Port 추가 · 생성 후 드래그로 테두리를 따라 이동'
          : 'Class, Collaboration 또는 Part의 테두리를 클릭해 Port 추가 · 생성 후 드래그로 테두리를 따라 이동';
      }
      if (ACTIVITY_PIN_KINDS.has(tool)) {
        const owner = tool === 'expansioninput' || tool === 'expansionoutput'
          ? 'Expansion Region'
          : 'Action 또는 Signal/Time Event Action';
        return `${owner}의 테두리를 클릭해 ${KIND_META[tool].label} 추가 · 생성 후 드래그로 테두리를 따라 이동`;
      }
      if (tool === 'timingstate') return 'Timing Lifeline 내부를 클릭해 State / Condition 행 추가';
      if (tool === 'timesegment') return 'State / Condition 행을 클릭해 Time Segment 추가 · 생성 후 좌우 이동과 기간 조절 가능';
      if (tool === 'timeconstraint') return 'Time Segment 또는 Timing Message를 클릭해 Time Constraint 부착';
      if (tool === 'timetick') return '시간축 위치를 클릭해 Time Tick 추가';
      return `캔버스를 클릭해 ${KIND_META[tool].label} 생성`;
    }

    /* stays until reload — a flash alone is gone in two seconds, and the point
       is that the user learns something went wrong even if they looked away */
    function runtimeErrorText() {
      const count = state.runtimeErrors?.count;
      return count ? `⚠ 오류 ${count}건 · ` : '';
    }

    function autosaveStatusText() {
      if (state.autosaveStatus === 'saving') return 'DB 저장 중 · ';
      if (state.autosaveStatus === 'error') return 'DB 저장 오류 · ';
      if (state.autosaveStatus === 'fallback') return '비상 저장소 사용 · ';
      if (!state.lastAutosavedAt) return '';
      const savedBackend = state.autosaveBackend === 'sqlite' ? 'SQLite 저장' : 'DB 자동저장';
      const savedAt = new Date(state.lastAutosavedAt).toLocaleTimeString('ko-KR', {
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
      });
      return `${savedBackend} ${savedAt} · `;
    }

    function render() {
      const diagram = dg();
      statusLeft.textContent = toolInstruction();
      statusRight.textContent = `${runtimeErrorText()}${state.dirty ? '● 파일 저장 필요 · ' : ''}${autosaveStatusText()}${state.projectName} · ${DIAGRAM_META[diagram.type].label} · Elements ${diagram.elements.length} · Relations ${diagram.relations.length} · Zoom ${Math.round(state.zoom * 100)}%`;
    }

    function flash(message) {
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
});
