'use strict';

type C4ModelApi = ReturnType<typeof createC4Model>;
declare var UMLC4Model: C4ModelApi;

(function initC4Model(root: typeof globalThis, factory: () => C4ModelApi) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.UMLC4Model = api;
})(globalThis, createC4Model);

function createC4Model() {
  const { text: uiText } = globalThis.UMLLanguage
    ?? require('../editor/language.js') as typeof UMLLanguage;
  const BOUNDARY_PADDING = 24;
  const BOUNDARY_HEADER = 64;
  type JsonRecord = Record<string, unknown>;
  type ContextView = { kind: string; c4ContextFocus?: boolean };

  function systemBoundary<View extends { c4Boundary?: boolean }>(diagram: { type: string; elements: View[] }) {
    return diagram.type === 'c4container'
      ? diagram.elements.find(view => view.c4Boundary === true)
      : undefined;
  }

  function contextSystem<View extends ContextView>(diagram: { elements: View[] }) {
    return diagram.elements.find(view => view.c4ContextFocus)
      || diagram.elements.find(view => view.kind === 'c4system');
  }

  function updateContainerDiagramNames(diagrams: EditorDiagram[]) {
    diagrams.forEach(diagram => {
      if (!diagram.c4AutoName) return;
      const system = systemBoundary(diagram);
      if (system) {
        const name = String(system.name || uiText('(unnamed)', '(이름 없음)')).slice(0, 200);
        diagram.name = uiText('{0} · Containers', '{0} · 컨테이너', name);
      }
    });
  }

  function layoutContainers(diagram: EditorDiagram) {
    const boundary = systemBoundary(diagram);
    if (!boundary) return;
    diagram.elements.forEach(view => {
      if (view.parentId !== boundary.id) return;
      view.x = Math.max(view.x, boundary.x + BOUNDARY_PADDING);
      view.y = Math.max(view.y, boundary.y + BOUNDARY_HEADER);
      boundary.w = Math.max(boundary.w, view.x + view.w - boundary.x + BOUNDARY_PADDING);
      boundary.h = Math.max(boundary.h, view.y + view.h - boundary.y + BOUNDARY_PADDING);
    });
  }

  function isRelationshipEndpoint(kind: unknown, view: { c4Boundary?: unknown } | null | undefined) {
    return !!view && !view.c4Boundary && (kind === 'c4person' || kind === 'c4system' || kind === 'c4container');
  }

  function validateDiagram(
    diagram: { id: string; type: string; elements: JsonRecord[]; relations: JsonRecord[] },
    modelFor: (view: JsonRecord) => JsonRecord | undefined,
  ) {
    if (diagram.type !== 'c4context' && diagram.type !== 'c4container') return;
    const isContainer = diagram.type === 'c4container';
    const boundaries = diagram.elements.filter(view => view.c4Boundary === true);
    if (boundaries.length !== Number(isContainer)) {
      throw new Error(uiText('Invalid C4 system boundary: {0}', 'C4 시스템 경계가 올바르지 않습니다: {0}', diagram.id));
    }
    const boundary = boundaries[0];
    const kinds = ['c4person', 'c4system', 'note'];
    if (isContainer) kinds.push('c4container');
    const views = new Map(diagram.elements.map(view => [view.id, view]));
    let hasFocus = false;
    diagram.elements.forEach(view => {
      const model = modelFor(view);
      const kind = model?.kind;
      if (typeof kind !== 'string' || !kinds.includes(kind)
        || (view.c4Boundary && (view !== boundary || kind !== 'c4system'))) {
        throw new Error(uiText('Unsupported C4 element: {0}', '지원하지 않는 C4 요소: {0}', view.id));
      }
      if (view.c4ContextFocus) {
        if (view.c4ContextFocus !== true || isContainer || kind !== 'c4system' || hasFocus) {
          throw new Error(uiText('Invalid C4 context system: {0}', 'C4 Context의 중심 시스템이 올바르지 않습니다: {0}', view.id));
        }
        hasFocus = true;
      }
      if (kind === 'c4container') {
        if (!boundary || view.parentId !== boundary.id || model?.c4OwnerModelId !== boundary.modelId) {
          throw new Error(uiText('Invalid C4 container owner: {0}', 'C4 Container의 소속 시스템이 올바르지 않습니다: {0}', view.id));
        }
      } else if (view.parentId || (boundary && view !== boundary && view.modelId === boundary.modelId)) {
        throw new Error(uiText('Invalid C4 view placement: {0}', 'C4 시스템 경계의 뷰 배치가 올바르지 않습니다: {0}', view.id));
      }
    });
    diagram.relations.forEach(relation => {
      const kind = modelFor(relation)?.kind;
      if (kind === 'notelink') return;
      const from = views.get(relation.from), to = views.get(relation.to);
      if (kind !== 'c4relationship' || !from || !to || from === to
        || !isRelationshipEndpoint(modelFor(from)?.kind, from)
        || !isRelationshipEndpoint(modelFor(to)?.kind, to)) {
        throw new Error(uiText('Invalid C4 relationship endpoint: {0}', 'C4 관계의 연결 대상이 올바르지 않습니다: {0}', relation.id));
      }
    });
    return typeof boundary?.modelId === 'string' ? boundary.modelId : undefined;
  }

  return { systemBoundary, contextSystem, updateContainerDiagramNames, layoutContainers, isRelationshipEndpoint, validateDiagram };
}
