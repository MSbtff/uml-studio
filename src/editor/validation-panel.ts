'use strict';

/* Validation Panel — owns validation result state, rendering, navigation and
   panel event lifecycle while validation rules remain in validation.js. */
type ValidationPanelApi = ReturnType<typeof createValidationPanelModule>;
declare var UMLValidationPanel: ValidationPanelApi;

(function initValidationPanelModule(root: typeof globalThis & { UMLValidationPanel?: ValidationPanelApi }, factory: () => ValidationPanelApi) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root) root.UMLValidationPanel = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, createValidationPanelModule);

function createValidationPanelModule() {
  const REQUIRED_FUNCTIONS = Object.freeze([
    'bindingRoute',
    'byId',
    'clearLinking',
    'communicationMessagePoints',
    'flashStatus',
    'isCommMsg',
    'isMsg',
    'msgPoints',
    'polylineMidpoint',
    'relById',
    'relEndpoints',
    'renderAll',
    'setSelection',
    'validateProject',
  ] as const);
  const REQUIRED_VALUES = Object.freeze([
    'closeButton',
    'document',
    'rerunButton',
    'state',
    'validationPanel',
    'validationResults',
    'validationSummary',
    'wrap',
  ] as const);

  interface Issue {
    severity: 'error' | 'warning' | 'info';
    code: string;
    message: string;
    diagramId: string;
    viewId: string;
    diagramName?: string;
    modelName?: string;
  }
  interface RelationRef { id: string; kind: string }
  interface Endpoints { p1: DiagramPoint; p2: DiagramPoint; self?: boolean }
  interface ValidationPanelState {
    diagrams: { id: string; elements: { id: string }[]; relations: RelationRef[] }[];
    models: Record<string, unknown>;
    activeId: string;
    tool: string;
    validationStale: boolean;
    zoom: number;
  }
  interface ValidationPanelDependencies {
    bindingRoute(relation: RelationRef): { points: DiagramPoint[] } | null;
    byId(id: string): DiagramBounds | null | undefined;
    clearLinking(): void;
    communicationMessagePoints(relation: RelationRef): Endpoints | null;
    flashStatus(message: string): void;
    isCommMsg(kind: string): boolean;
    isMsg(kind: string): boolean;
    msgPoints(relation: RelationRef): Endpoints | null;
    polylineMidpoint(points: DiagramPoint[]): DiagramPoint;
    relById(id: string): RelationRef | null | undefined;
    relEndpoints(relation: RelationRef): Endpoints | null;
    renderAll(): void;
    setSelection(ids: string[]): void;
    validateProject(project: Pick<ValidationPanelState, 'models' | 'diagrams'>): Issue[];
    closeButton: HTMLElement;
    document: Document;
    rerunButton: HTMLElement;
    state: ValidationPanelState;
    validationPanel: HTMLElement;
    validationResults: HTMLElement;
    validationSummary: HTMLElement;
    wrap: HTMLElement;
  }

  function create(dependencies?: ValidationPanelDependencies) {
    const deps: Partial<ValidationPanelDependencies> = dependencies || {};
    const missing: string[] = REQUIRED_FUNCTIONS.filter(name => typeof deps[name] !== 'function');
    REQUIRED_VALUES.forEach(name => {
      if (deps[name] == null) missing.push(name);
    });
    if (deps.document && typeof deps.document.createElement !== 'function') {
      missing.push('document.createElement');
    }
    (['closeButton', 'rerunButton'] as const).forEach(name => {
      const target = deps[name];
      if (target && typeof target.addEventListener !== 'function') missing.push(`${name}.addEventListener`);
      if (target && typeof target.removeEventListener !== 'function') missing.push(`${name}.removeEventListener`);
    });
    if (deps.validationResults && typeof deps.validationResults.appendChild !== 'function') {
      missing.push('validationResults.appendChild');
    }
    if (deps.validationSummary && typeof deps.validationSummary.classList?.toggle !== 'function') {
      missing.push('validationSummary.classList.toggle');
    }
    if (deps.state != null && typeof deps.state !== 'object') missing.push('state.object');
    if (missing.length) {
      throw new TypeError(`Validation Panel 의존성이 없습니다: ${[...new Set(missing)].join(', ')}`);
    }

    const {
      bindingRoute,
      byId,
      clearLinking,
      communicationMessagePoints,
      flashStatus,
      isCommMsg,
      isMsg,
      msgPoints,
      polylineMidpoint,
      relById,
      relEndpoints,
      renderAll,
      setSelection,
      validateProject,
      closeButton,
      document,
      rerunButton,
      state,
      validationPanel,
      validationResults,
      validationSummary,
      wrap,
    } = deps as ValidationPanelDependencies;

    let issues: Issue[] = [];
    let attached = false;

    const issueCounts = () => ({
      errors: issues.filter(item => item.severity === 'error').length,
      warnings: issues.filter(item => item.severity === 'warning').length,
      info: issues.filter(item => item.severity === 'info').length,
    });

    function updateSummary() {
      const { errors, warnings, info } = issueCounts();
      validationSummary.textContent = issues.length
        ? `${errors} errors · ${warnings} warnings · ${info} info${state.validationStale ? ' · 결과가 오래됨' : ''}`
        : (state.validationStale ? '프로젝트가 변경되었습니다. 다시 검사하세요.' : '문제가 없습니다.');
      validationSummary.classList.toggle('validation-stale', state.validationStale);
    }

    function navigateToIssue(item: Issue) {
      const diagram = state.diagrams.find(candidate => candidate.id === item.diagramId);
      if (!diagram) return false;
      state.activeId = diagram.id;
      state.tool = 'select';
      clearLinking();
      const exists = [...diagram.elements, ...diagram.relations].some(view => view.id === item.viewId);
      setSelection(exists ? [item.viewId] : []);
      renderAll();

      const element = byId(item.viewId);
      if (element) {
        wrap.scrollLeft = Math.max(0, (element.x + element.w / 2) * state.zoom - wrap.clientWidth / 2);
        wrap.scrollTop = Math.max(0, (element.y + element.h / 2) * state.zoom - wrap.clientHeight / 2);
        return true;
      }

      const relation = relById(item.viewId);
      if (relation?.kind === 'bindingconnector') {
        const route = bindingRoute(relation);
        if (route) {
          const midpoint = polylineMidpoint(route.points);
          wrap.scrollLeft = Math.max(0, midpoint.x * state.zoom - wrap.clientWidth / 2);
          wrap.scrollTop = Math.max(0, midpoint.y * state.zoom - wrap.clientHeight / 2);
          return true;
        }
      }
      const endpoints = relation && (isCommMsg(relation.kind)
        ? communicationMessagePoints(relation)
        : (isMsg(relation.kind) ? msgPoints(relation) : relEndpoints(relation)));
      if (endpoints && !endpoints.self) {
        wrap.scrollLeft = Math.max(0, ((endpoints.p1.x + endpoints.p2.x) / 2) * state.zoom - wrap.clientWidth / 2);
        wrap.scrollTop = Math.max(0, ((endpoints.p1.y + endpoints.p2.y) / 2) * state.zoom - wrap.clientHeight / 2);
      }
      return true;
    }

    function render() {
      validationResults.textContent = '';
      updateSummary();
      if (!issues.length) {
        const empty = document.createElement('div');
        empty.className = 'validation-empty';
        empty.textContent = '✓ UML 검증 규칙을 모두 통과했습니다.';
        validationResults.appendChild(empty);
        return;
      }
      issues.forEach(item => {
        const row = document.createElement('div');
        row.className = 'validation-row';
        row.tabIndex = 0;
        row.setAttribute('role', 'button');
        row.setAttribute('aria-label', `${item.code} ${item.message}`);
        const severity = document.createElement('span');
        severity.className = `validation-severity ${item.severity}`;
        severity.textContent = item.severity === 'info' ? 'i' : '!';
        const code = document.createElement('span');
        code.className = 'validation-code';
        code.textContent = item.code;
        const message = document.createElement('span');
        message.textContent = item.message;
        const location = document.createElement('span');
        location.className = 'validation-location';
        location.textContent = [item.diagramName, item.modelName].filter(Boolean).join(' · ');
        row.append(severity, code, message, location);
        const navigate = () => navigateToIssue(item);
        row.addEventListener('click', navigate);
        row.addEventListener('keydown', event => {
          if (event.key !== 'Enter' && event.key !== ' ') return;
          event.preventDefault();
          navigate();
        });
        validationResults.appendChild(row);
      });
    }

    function run() {
      issues = validateProject({ models: state.models, diagrams: state.diagrams });
      state.validationStale = false;
      validationPanel.hidden = false;
      render();
      const { errors, warnings } = issueCounts();
      flashStatus(issues.length
        ? `검증 완료 · 오류 ${errors} · 경고 ${warnings}`
        : '검증 완료 · 문제가 없습니다');
      return getIssues();
    }

    function clear() {
      issues = [];
      state.validationStale = false;
      validationResults.textContent = '';
      validationPanel.hidden = true;
      updateSummary();
    }

    function close() {
      validationPanel.hidden = true;
    }

    function toggle() {
      if (validationPanel.hidden && !issues.length) run();
      else validationPanel.hidden = !validationPanel.hidden;
    }

    function getIssues() {
      return issues.map(item => ({ ...item }));
    }

    function hasIssues() {
      return issues.length > 0;
    }

    function isVisible() {
      return !validationPanel.hidden;
    }

    function attach() {
      if (attached) return;
      rerunButton.addEventListener('click', run);
      closeButton.addEventListener('click', close);
      attached = true;
    }

    function detach() {
      if (!attached) return;
      rerunButton.removeEventListener('click', run);
      closeButton.removeEventListener('click', close);
      attached = false;
    }

    return Object.freeze({
      attach,
      clear,
      detach,
      getIssues,
      hasIssues,
      isVisible,
      navigateToIssue,
      render,
      run,
      toggle,
      updateSummary,
    });
  }

  return Object.freeze({ REQUIRED_FUNCTIONS, REQUIRED_VALUES, create });
}
