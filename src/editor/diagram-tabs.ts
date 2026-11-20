'use strict';

type DiagramTabsApi = ReturnType<typeof createDiagramTabsModule>;
declare var UMLDiagramTabs: DiagramTabsApi;

(function initDiagramTabs(root: typeof globalThis & { UMLDiagramTabs?: DiagramTabsApi }, factory: () => DiagramTabsApi) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root) root.UMLDiagramTabs = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, createDiagramTabsModule);

function createDiagramTabsModule() {
  const c4Model = globalThis.UMLC4Model
    ?? require('../model/c4-model.js') as C4ModelApi;
  const { displayLabel, text: uiText } = globalThis.UMLLanguage
    ?? require('./language.js') as typeof UMLLanguage;

  const REQUIRED_FUNCTIONS = Object.freeze([
    'adoptView',
    'clearLinking',
    'confirmAction',
    'createElement',
    'normalizeSize',
    'renderAll',
    'renderExplorer',
    'setSelection',
    'setTimeout',
    'snapshot',
    'uid',
  ] as const);
  const REQUIRED_VALUES = Object.freeze([
    'document',
    'state',
    'tabs',
    'viewport',
    'DIAGRAM_META',
  ] as const);

  interface DiagramTabsDependencies {
    adoptView: (view: DiagramElement) => DiagramElement;
    clearLinking: () => void;
    confirmAction: (message: string) => boolean;
    createElement: (kind: string, x: number, y: number) => DiagramElement;
    normalizeSize: (view: DiagramElement) => void;
    renderAll: () => void;
    renderExplorer: () => void;
    setSelection: (ids: string[]) => void;
    setTimeout: (callback: () => void, delay: number) => unknown;
    snapshot: () => void;
    uid: () => string;
    document: Document;
    state: { diagrams: EditorDiagram[]; models: DiagramModels; activeId: string; tool: string };
    tabs: HTMLElement;
    viewport: Pick<Window, 'innerWidth' | 'innerHeight'>;
    DIAGRAM_META: Record<string, { label: string; labelKo?: string; color: string; code: string; fromContext?: boolean }>;
  }

  function create(dependencies?: DiagramTabsDependencies) {
    const deps: Partial<DiagramTabsDependencies> = dependencies || {};
    const missing: string[] = REQUIRED_FUNCTIONS.filter(name => typeof deps[name] !== 'function');
    REQUIRED_VALUES.forEach(name => {
      if (deps[name] == null) missing.push(name);
    });
    if (deps.document && typeof deps.document.createElement !== 'function') missing.push('document.createElement');
    if (deps.tabs && typeof deps.tabs.appendChild !== 'function') missing.push('tabs.appendChild');
    if (missing.length) {
      throw new TypeError(`Diagram Tabs 의존성이 없습니다: ${[...new Set(missing)].join(', ')}`);
    }

    const {
      adoptView,
      clearLinking,
      confirmAction,
      createElement,
      normalizeSize,
      renderAll,
      renderExplorer,
      setSelection,
      setTimeout,
      snapshot,
      uid,
      document,
      state,
      tabs,
      viewport,
      DIAGRAM_META,
    } = deps as DiagramTabsDependencies;

    function addDiagram(type: string, system?: DiagramElement) {
      const systemId = system?.modelId;
      if (type === 'c4container' && (!systemId || state.models[systemId]?.kind !== 'c4system')) return null;
      snapshot();
      const count = state.diagrams.filter(diagram => diagram.type === type).length;
      const diagram: EditorDiagram = {
        id: uid(),
        type,
        name: DIAGRAM_META[type].label + (count ? ` ${count + 1}` : ''),
        elements: [],
        relations: [],
      };
      state.diagrams.push(diagram);
      state.activeId = diagram.id;
      setSelection([]);
      state.tool = 'select';
      clearLinking();
      if (type === 'ibd' || type === 'parametric') {
        const frame = adoptView(createElement(type === 'ibd' ? 'ibdframe' : 'parametricframe', 48, 48));
        normalizeSize(frame);
        diagram.elements.push(frame);
        setSelection([frame.id]);
      }
      if (type === 'c4container') {
        const boundary = adoptView({
          id: uid(), kind: 'c4system', modelId: systemId, c4Boundary: true,
          x: 192, y: 72, w: 560, h: 360,
        });
        diagram.c4AutoName = true;
        diagram.elements.push(boundary);
        setSelection([boundary.id]);
      }
      renderAll();
      return diagram;
    }

    function switchDiagram(id: string, selection: string[] = []) {
      if (state.activeId === id) return false;
      state.activeId = id;
      setSelection(selection);
      state.tool = 'select';
      clearLinking();
      renderAll();
      return true;
    }

    function openC4Container(system: DiagramElement) {
      if (!system.modelId) return;
      for (const diagram of state.diagrams) {
        const boundary = c4Model.systemBoundary(diagram);
        if (boundary?.modelId === system.modelId) {
          switchDiagram(diagram.id, [boundary.id]);
          focusRenderedTab(diagram.id);
          return;
        }
      }
      const diagram = addDiagram('c4container', system);
      if (diagram) focusRenderedTab(diagram.id);
    }

    function c4ContextFor(system: DiagramElement) {
      const contexts = state.diagrams.filter(diagram => diagram.type === 'c4context');
      const diagram = contexts.find(candidate => c4Model.contextSystem(candidate)?.modelId === system.modelId)
        || contexts.find(candidate => candidate.elements.some(view => view.modelId === system.modelId));
      const view = diagram?.elements.find(candidate => candidate.modelId === system.modelId);
      return diagram && view ? { diagram, view } : undefined;
    }

    function deleteDiagram(diagram: EditorDiagram) {
      if (state.diagrams.length <= 1) return false;
      const interactionReferences = diagram.type === 'sequence'
        ? Object.values(state.models).filter(model =>
          (model.kind === 'interactionuse' || model.kind === 'interactioninline')
          && model.interactionDiagramId === diagram.id)
        : [];
      const referenceWarning = interactionReferences.length
        ? uiText(
          '\n\nThis removes references from {0} interactions that use the sequence.',
          '\n\n이 Sequence를 참조하는 Interaction {0}개의 참조는 안전하게 해제됩니다.',
          interactionReferences.length,
        )
        : '';
      if (!confirmAction(uiText('Delete the diagram "{0}"?{1}', '"{0}" 다이어그램을 삭제할까요?{1}', diagram.name, referenceWarning))) return false;
      snapshot();
      interactionReferences.forEach(model => { model.interactionDiagramId = ''; });
      state.diagrams = state.diagrams.filter(candidate => candidate.id !== diagram.id);
      if (state.activeId === diagram.id) state.activeId = state.diagrams[0].id;
      setSelection([]);
      renderAll();
      return true;
    }

    function renderedTab(diagramId: string) {
      for (const shell of tabs.children || []) {
        const tab = shell.querySelector?.<HTMLButtonElement>('.tab');
        if (tab?.dataset.diagramId === diagramId) return tab;
      }
      return null;
    }

    function focusRenderedTab(diagramId: string) {
      const tab = renderedTab(diagramId);
      if (tab && typeof tab.focus === 'function') tab.focus();
      return Boolean(tab);
    }

    function activateTab(diagramId: string, moveFocus = false) {
      const changed = switchDiagram(diagramId);
      if (moveFocus) focusRenderedTab(diagramId);
      return changed;
    }

    function startRename(shell: HTMLElement, tab: HTMLButtonElement, diagram: EditorDiagram) {
      const input = document.createElement('input');
      input.className = 'tab-rename';
      input.value = diagram.name;
      input.setAttribute('aria-label', uiText('Rename {0} diagram', '{0} 다이어그램 이름 변경', diagram.name));
      tab.replaceWith(input);
      input.focus();
      input.select();
      let committed = false;
      const commit = (cancelled: boolean) => {
        if (committed) return;
        committed = true;
        const nextName = cancelled ? diagram.name : input.value.trim();
        if (nextName && nextName !== diagram.name) {
          snapshot();
          diagram.name = nextName;
          delete diagram.c4AutoName;
          if (diagram.type === 'sequence') {
            Object.values(state.models)
              .filter(model =>
                (model.kind === 'interactionuse' || model.kind === 'interactioninline')
                && model.interactionDiagramId === diagram.id)
              .forEach(model => { model.name = diagram.name; });
          }
        }
        render();
        renderExplorer();
        focusRenderedTab(diagram.id);
      };
      input.addEventListener('blur', () => commit(false));
      input.addEventListener('keydown', event => {
        if (event.key === 'Enter') { event.preventDefault(); input.blur(); }
        if (event.key === 'Escape') { event.preventDefault(); commit(true); }
        event.stopPropagation();
      });
      return shell;
    }

    function handleTabKeydown(event: KeyboardEvent, diagram: EditorDiagram, index: number, shell: HTMLElement, tab: HTMLButtonElement) {
      const lastIndex = state.diagrams.length - 1;
      let targetIndex = -1;
      if (event.key === 'ArrowLeft') targetIndex = index === 0 ? lastIndex : index - 1;
      if (event.key === 'ArrowRight') targetIndex = index === lastIndex ? 0 : index + 1;
      if (event.key === 'Home') targetIndex = 0;
      if (event.key === 'End') targetIndex = lastIndex;
      if (targetIndex >= 0) {
        event.preventDefault(); event.stopPropagation();
        activateTab(state.diagrams[targetIndex].id, true);
        return;
      }
      if (event.key === 'F2') {
        event.preventDefault(); event.stopPropagation();
        startRename(shell, tab, diagram);
        return;
      }
      if (event.key === 'Delete' && state.diagrams.length > 1) {
        event.preventDefault(); event.stopPropagation();
        if (deleteDiagram(diagram)) focusRenderedTab(state.activeId);
      }
    }

    function render() {
      tabs.textContent = '';
      tabs.setAttribute('role', 'tablist');
      tabs.setAttribute('aria-label', uiText('Diagram tabs', '다이어그램 탭'));
      tabs.setAttribute('aria-orientation', 'horizontal');
      state.diagrams.forEach((diagram, index) => {
        const meta = DIAGRAM_META[diagram.type];
        const active = diagram.id === state.activeId;
        const shell = document.createElement('div');
        shell.className = 'tab-shell' + (active ? ' active' : '');
        const tab = document.createElement('button');
        tab.type = 'button';
        tab.className = 'tab' + (active ? ' active' : '');
        tab.dataset.diagramId = diagram.id;
        tab.id = `diagram-tab-${diagram.id}`;
        tab.tabIndex = active ? 0 : -1;
        tab.setAttribute('role', 'tab');
        tab.setAttribute('aria-selected', String(active));
        tab.setAttribute('aria-controls', 'canvas-wrap');
        tab.setAttribute('aria-keyshortcuts', 'F2 Delete');
        tab.title = uiText(
          '{0} · Arrow keys to navigate · F2 to rename · Delete to close',
          '{0} · 방향키 이동 · F2 이름 변경 · Delete 닫기',
          diagram.name,
        );
        const icon = document.createElement('span');
        icon.className = 'tab-icon';
        icon.style.background = meta.color;
        icon.textContent = meta.code;
        icon.setAttribute('aria-hidden', 'true');
        const tabName = document.createElement('span');
        tabName.className = 'tab-name';
        tabName.textContent = diagram.name;
        tab.append(icon, tabName);
        tab.addEventListener('click', () => activateTab(diagram.id, true));
        tab.addEventListener('dblclick', event => {
          event.preventDefault();
          startRename(shell, tab, diagram);
        });
        tab.addEventListener('keydown', event => handleTabKeydown(event, diagram, index, shell, tab));
        shell.appendChild(tab);
        if (state.diagrams.length > 1) {
          const close = document.createElement('button');
          close.type = 'button';
          close.className = 'tab-close';
          close.textContent = '×';
          close.title = uiText('Close {0}', '{0} 닫기', diagram.name);
          close.setAttribute('aria-label', uiText('Close {0} diagram', '{0} 다이어그램 닫기', diagram.name));
          close.addEventListener('click', event => {
            event.stopPropagation();
            deleteDiagram(diagram);
          });
          shell.appendChild(close);
        }
        tabs.appendChild(shell);
      });
      const add = document.createElement('button');
      add.type = 'button';
      add.className = 'tab-add';
      add.textContent = '+';
      add.title = uiText('Add Diagram', '새 다이어그램 추가');
      add.setAttribute('aria-label', uiText('Add Diagram', '새 다이어그램 추가'));
      add.setAttribute('aria-haspopup', 'true');
      add.setAttribute('aria-expanded', 'false');
      add.addEventListener('click', () => openMenu(add));
      tabs.appendChild(add);
    }

    let menuAnchor: HTMLElement | null = null;
    function openMenu(anchor: HTMLElement) {
      closeMenu(false);
      menuAnchor = anchor;
      anchor.setAttribute('aria-expanded', 'true');
      const menu = document.createElement('div');
      menu.id = 'tab-menu';
      menu.setAttribute('aria-label', uiText('New diagram type', '새 다이어그램 종류'));
      const rect = anchor.getBoundingClientRect();
      menu.style.left = `${rect.left}px`;
      menu.style.top = `${rect.bottom + 4}px`;
      Object.keys(DIAGRAM_META).forEach(type => {
        const meta = DIAGRAM_META[type];
        if (meta.fromContext) return;
        const item = document.createElement('button');
        item.type = 'button';
        item.className = 'tm-item';
        item.innerHTML = `<span class="tab-icon" style="background:${meta.color}">${meta.code}</span><span>${displayLabel(meta)}</span>`;
        item.addEventListener('click', () => { closeMenu(false); addDiagram(type); });
        menu.appendChild(item);
      });
      document.body.appendChild(menu);
      const menuRect = menu.getBoundingClientRect();
      menu.style.left = `${Math.max(8, Math.min(rect.left, viewport.innerWidth - menuRect.width - 8))}px`;
      menu.style.top = `${Math.max(8, Math.min(rect.bottom + 4, viewport.innerHeight - menuRect.height - 8))}px`;
      menu.querySelector<HTMLButtonElement>('.tm-item')?.focus();
      setTimeout(() => document.addEventListener('mousedown', closeMenuOnOutside), 0);
    }

    function closeMenu(restoreFocus = true) {
      const menu = document.getElementById('tab-menu');
      if (menu) menu.remove();
      document.removeEventListener('mousedown', closeMenuOnOutside);
      if (menuAnchor) {
        menuAnchor.setAttribute('aria-expanded', 'false');
        if (restoreFocus && typeof menuAnchor.focus === 'function') menuAnchor.focus();
        menuAnchor = null;
      }
      return Boolean(menu);
    }

    function closeMenuOnOutside(event: MouseEvent) {
      const menu = document.getElementById('tab-menu');
      if (menu && !menu.contains(event.target as Node | null)) closeMenu(false);
    }

    return Object.freeze({
      addDiagram,
      switchDiagram,
      openC4Container,
      c4ContextFor,
      deleteDiagram,
      focusRenderedTab,
      render,
      openMenu,
      closeMenu,
    });
  }

  return Object.freeze({ REQUIRED_FUNCTIONS, REQUIRED_VALUES, create });
}
