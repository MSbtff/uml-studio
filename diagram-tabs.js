'use strict';

(function initDiagramTabs(root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root) root.UMLDiagramTabs = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function createDiagramTabsModule() {
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
  ]);
  const REQUIRED_VALUES = Object.freeze([
    'document',
    'state',
    'tabs',
    'viewport',
    'DIAGRAM_META',
  ]);

  function create(dependencies) {
    const deps = dependencies || {};
    const missing = REQUIRED_FUNCTIONS.filter(name => typeof deps[name] !== 'function');
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
    } = deps;

    function addDiagram(type) {
      snapshot();
      const count = state.diagrams.filter(diagram => diagram.type === type).length;
      const diagram = {
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
      renderAll();
      return diagram;
    }

    function switchDiagram(id) {
      if (state.activeId === id) return false;
      state.activeId = id;
      setSelection([]);
      state.tool = 'select';
      clearLinking();
      renderAll();
      return true;
    }

    function deleteDiagram(diagram) {
      if (state.diagrams.length <= 1) return false;
      const interactionReferences = diagram.type === 'sequence'
        ? Object.values(state.models).filter(model =>
          (model.kind === 'interactionuse' || model.kind === 'interactioninline')
          && model.interactionDiagramId === diagram.id)
        : [];
      const referenceWarning = interactionReferences.length
        ? `\n\n이 Sequence를 참조하는 Interaction ${interactionReferences.length}개의 참조는 안전하게 해제됩니다.`
        : '';
      if (!confirmAction(`"${diagram.name}" 다이어그램을 삭제할까요?${referenceWarning}`)) return false;
      snapshot();
      interactionReferences.forEach(model => { model.interactionDiagramId = ''; });
      state.diagrams = state.diagrams.filter(candidate => candidate.id !== diagram.id);
      if (state.activeId === diagram.id) state.activeId = state.diagrams[0].id;
      setSelection([]);
      renderAll();
      return true;
    }

    function renderedTab(diagramId) {
      for (const shell of tabs.children || []) {
        const tab = shell.querySelector?.('.tab');
        if (tab?.dataset.diagramId === diagramId) return tab;
      }
      return null;
    }

    function focusRenderedTab(diagramId) {
      const tab = renderedTab(diagramId);
      if (tab && typeof tab.focus === 'function') tab.focus();
      return Boolean(tab);
    }

    function activateTab(diagramId, moveFocus = false) {
      const changed = switchDiagram(diagramId);
      if (moveFocus) focusRenderedTab(diagramId);
      return changed;
    }

    function startRename(shell, tab, diagram) {
      const input = document.createElement('input');
      input.className = 'tab-rename';
      input.value = diagram.name;
      input.setAttribute('aria-label', `${diagram.name} 다이어그램 이름 변경`);
      tab.replaceWith(input);
      input.focus();
      input.select();
      let committed = false;
      const commit = cancelled => {
        if (committed) return;
        committed = true;
        const nextName = cancelled ? diagram.name : input.value.trim();
        if (nextName && nextName !== diagram.name) {
          snapshot();
          diagram.name = nextName;
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

    function handleTabKeydown(event, diagram, index, shell, tab) {
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
      tabs.setAttribute('aria-label', '다이어그램 탭');
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
        tab.title = `${diagram.name} · 방향키 이동 · F2 이름 변경 · Delete 닫기`;
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
          close.title = `${diagram.name} 닫기`;
          close.setAttribute('aria-label', `${diagram.name} 다이어그램 닫기`);
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
      add.title = '새 다이어그램 추가';
      add.setAttribute('aria-label', '새 다이어그램 추가');
      add.setAttribute('aria-haspopup', 'true');
      add.setAttribute('aria-expanded', 'false');
      add.addEventListener('click', event => openMenu(event.currentTarget));
      tabs.appendChild(add);
    }

    let menuAnchor = null;
    function openMenu(anchor) {
      closeMenu(false);
      menuAnchor = anchor;
      anchor.setAttribute('aria-expanded', 'true');
      const menu = document.createElement('div');
      menu.id = 'tab-menu';
      menu.setAttribute('aria-label', '새 다이어그램 종류');
      const rect = anchor.getBoundingClientRect();
      menu.style.left = `${rect.left}px`;
      menu.style.top = `${rect.bottom + 4}px`;
      let firstItem = null;
      Object.keys(DIAGRAM_META).forEach(type => {
        const meta = DIAGRAM_META[type];
        const item = document.createElement('button');
        item.type = 'button';
        item.className = 'tm-item';
        item.innerHTML = `<span class="tab-icon" style="background:${meta.color}">${meta.code}</span><span>${meta.label}</span>`;
        item.addEventListener('click', () => { closeMenu(false); addDiagram(type); });
        if (!firstItem) firstItem = item;
        menu.appendChild(item);
      });
      document.body.appendChild(menu);
      const menuRect = menu.getBoundingClientRect();
      menu.style.left = `${Math.max(8, Math.min(rect.left, viewport.innerWidth - menuRect.width - 8))}px`;
      menu.style.top = `${Math.max(8, Math.min(rect.bottom + 4, viewport.innerHeight - menuRect.height - 8))}px`;
      firstItem?.focus();
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

    function closeMenuOnOutside(event) {
      const menu = document.getElementById('tab-menu');
      if (menu && !menu.contains(event.target)) closeMenu(false);
    }

    return Object.freeze({
      addDiagram,
      switchDiagram,
      deleteDiagram,
      focusRenderedTab,
      render,
      openMenu,
      closeMenu,
    });
  }

  return Object.freeze({ REQUIRED_FUNCTIONS, REQUIRED_VALUES, create });
});
