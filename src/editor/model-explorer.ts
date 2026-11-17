// @ts-nocheck
'use strict';

(function initModelExplorer(root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root) root.UMLModelExplorer = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function createModelExplorerModule() {
  const REQUIRED_FUNCTIONS = Object.freeze([
    'clearLinking',
    'containmentDepth',
    'containmentOrder',
    'diagramKindLabel',
    'parseColumn',
    'renderAll',
    'renderCanvas',
    'renderProps',
    'setSelection',
    'switchDiagram',
  ]);
  const REQUIRED_VALUES = Object.freeze([
    'document',
    'explorer',
    'searchInput',
    'state',
    'DIAGRAM_META',
    'KIND_META',
  ]);

  function create(dependencies) {
    const deps = dependencies || {};
    const missing = REQUIRED_FUNCTIONS.filter(name => typeof deps[name] !== 'function');
    REQUIRED_VALUES.forEach(name => {
      if (deps[name] == null) missing.push(name);
    });
    if (deps.document && typeof deps.document.createElement !== 'function') missing.push('document.createElement');
    if (deps.explorer && typeof deps.explorer.appendChild !== 'function') missing.push('explorer.appendChild');
    if (deps.searchInput && typeof deps.searchInput.addEventListener !== 'function') {
      missing.push('searchInput.addEventListener');
    }
    if (deps.searchInput && typeof deps.searchInput.removeEventListener !== 'function') {
      missing.push('searchInput.removeEventListener');
    }
    if (missing.length) {
      throw new TypeError(`Model Explorer 의존성이 없습니다: ${[...new Set(missing)].join(', ')}`);
    }

    const {
      clearLinking,
      containmentDepth,
      containmentOrder,
      diagramKindLabel,
      parseColumn,
      renderAll,
      renderCanvas,
      renderProps,
      setSelection,
      switchDiagram,
      document,
      explorer,
      searchInput,
      state,
      DIAGRAM_META,
      KIND_META,
    } = deps;

    /* the rendered tree, flattened: the DOM is a list, so ARIA carries the shape */
    let rowNodes = [];
    let renderedRows = [];
    let focusKey = null;

    function rowKey(row) {
      return row.type === 'root' ? `diagram:${row.diagram.id}` : `view:${row.id}`;
    }

    function explorerHasFocus() {
      const active = document.activeElement;
      return Boolean(active) && rowNodes.includes(active);
    }

    /* aria-posinset/aria-setsize per sibling group, derived from the level sequence */
    function annotatePositions(rows) {
      const groupKeys = [];
      const ancestors = [];
      rows.forEach((row, index) => {
        while (ancestors.length && rows[ancestors[ancestors.length - 1]].level >= row.level) ancestors.pop();
        groupKeys[index] = `${ancestors.length ? ancestors[ancestors.length - 1] : -1}:${row.level}`;
        ancestors.push(index);
      });
      const totals = new Map();
      groupKeys.forEach(key => totals.set(key, (totals.get(key) || 0) + 1));
      const seen = new Map();
      rows.forEach((row, index) => {
        const key = groupKeys[index];
        const position = (seen.get(key) || 0) + 1;
        seen.set(key, position);
        row.posinset = position;
        row.setsize = totals.get(key);
      });
    }

    function focusRow(target) {
      if (!rowNodes.length) return false;
      const index = Math.max(0, Math.min(target, rowNodes.length - 1));
      rowNodes.forEach((node, position) => { node.tabIndex = position === index ? 0 : -1; });
      focusKey = rowKey(renderedRows[index]);
      rowNodes[index].focus?.();
      return true;
    }

    function focusMatchingRow(character, from) {
      const needle = character.toLowerCase();
      for (let step = 1; step <= renderedRows.length; step += 1) {
        const candidate = (from + step) % renderedRows.length;
        if ((renderedRows[candidate].typeaheadLabel || '').toLowerCase().startsWith(needle)) {
          focusRow(candidate);
          return true;
        }
      }
      return false;
    }

    function handleRowKeydown(event, index) {
      const row = renderedRows[index];
      if (!row) return;
      const consume = () => { event.preventDefault?.(); event.stopPropagation?.(); };
      const next = renderedRows[index + 1];
      switch (event.key) {
        case 'ArrowDown': consume(); focusRow(index + 1); return;
        case 'ArrowUp': consume(); focusRow(index - 1); return;
        case 'Home': consume(); focusRow(0); return;
        case 'End': consume(); focusRow(renderedRows.length - 1); return;
        case 'ArrowRight':
          consume();
          /* open the node, or step into it when it is already open */
          if (next && next.level > row.level) focusRow(index + 1);
          else if (row.type === 'root' && row.expandable && !row.expanded) row.activate();
          return;
        case 'ArrowLeft':
          consume();
          for (let above = index - 1; above >= 0; above -= 1) {
            if (renderedRows[above].level < row.level) { focusRow(above); return; }
          }
          return;
        case 'Enter':
        case ' ':
          consume();
          focusKey = rowKey(row);
          row.activate();
          return;
        default:
          break;
      }
      if (event.key?.length === 1 && !event.ctrlKey && !event.metaKey && !event.altKey
        && focusMatchingRow(event.key, index)) consume();
    }

    function handleSearchKeydown(event) {
      if (event.key !== 'ArrowDown' || !rowNodes.length) return;
      event.preventDefault?.();
      focusRow(0);
    }

    function applyTreeAttributes(node, row, next) {
      node.setAttribute('role', 'treeitem');
      node.setAttribute('aria-level', String(row.level));
      node.setAttribute('aria-posinset', String(row.posinset));
      node.setAttribute('aria-setsize', String(row.setsize));
      node.dataset.rowKey = rowKey(row);
      node.tabIndex = -1;
      if (row.type === 'root') {
        if (row.expandable) node.setAttribute('aria-expanded', String(row.expanded));
        return;
      }
      node.setAttribute('aria-selected', String(state.selection.includes(row.id)));
      if (next && next.level > row.level) node.setAttribute('aria-expanded', 'true');
    }

    function render() {
      const hadFocus = explorerHasFocus();
      explorer.textContent = '';
      rowNodes = [];
      renderedRows = [];
      const query = (searchInput.value || '').trim().toLowerCase();
      const rows = [];
      state.diagrams.forEach(diagram => {
        const items = [];
        const erdSearchInfo = element => {
          if (diagram.type !== 'erd' || element.kind !== 'entity') return null;
          const model = state.models?.[element.modelId] || element;
          const physical = String(model.name || element.name || '').trim();
          const logical = String(model.logicalName || element.logicalName || '').trim();
          const columns = (Array.isArray(model.columns) ? model.columns : [])
            .map(parseColumn)
            .filter(column => column.phys || column.logical);
          return {
            columns,
            label: [physical || '(unnamed)', logical].filter(Boolean).join(' · '),
            searchText: [physical, logical, ...columns.flatMap(column => [column.phys, column.logical])]
              .filter(Boolean)
              .join(' '),
          };
        };
        const endpointLabel = view => {
          if (!view) return '?';
          if (view.name) return view.name;
          if (view.kind === 'timesegment') {
            const owner = diagram.elements.find(element => element.id === view.parentId);
            return owner?.name || 'Time Segment';
          }
          return KIND_META[view.kind]?.label || '?';
        };
        containmentOrder(diagram).forEach(element => {
          const erdInfo = erdSearchInfo(element);
          items.push({
            id: element.id,
            modelId: element.modelId,
            kind: element.kind,
            label: erdInfo?.label || element.name || '(unnamed)',
            searchText: erdInfo?.searchText || element.name || '',
            searchColumns: erdInfo?.columns || [],
            depth: containmentDepth(element, diagram),
          });
        });
        diagram.relations.forEach(relation => {
          const source = diagram.elements.find(element => element.id === relation.from);
          const target = diagram.elements.find(element => element.id === relation.to);
          const relationName = relation.kind === 'timingmessage' && relation.name ? ` · ${relation.name}` : '';
          items.push({
            id: relation.id,
            modelId: relation.modelId,
            kind: relation.kind,
            label: `${diagramKindLabel(relation.kind, diagram.type)}${relationName} (${endpointLabel(source)} → ${endpointLabel(target)})`,
            searchText: relation.name || '',
          });
        });
        const matches = query
          ? items.filter(item => `${item.label} ${item.searchText} ${diagramKindLabel(item.kind, diagram.type)}`
            .toLowerCase().includes(query))
          : items;
        const diagramMatches = diagram.name.toLowerCase().includes(query);
        if (query && !diagramMatches && !matches.length) return;

        const showChildren = Boolean(query) || diagram.id === state.activeId;
        const visible = query ? matches : items;
        rows.push({
          type: 'root',
          diagram,
          typeaheadLabel: diagram.name,
          level: 1,
          expandable: items.length > 0,
          expanded: showChildren && visible.length > 0,
          activate: () => switchDiagram(diagram.id),
        });
        if (!showChildren) return;
        visible.forEach(item => {
          rows.push({
            ...item,
            type: 'item',
            diagram,
            typeaheadLabel: item.label,
            level: (item.depth || 0) + 2,
            activate() {
              if (state.activeId !== diagram.id) {
                state.activeId = diagram.id;
                state.tool = 'select';
                clearLinking();
                setSelection([item.id]);
                renderAll();
              } else {
                setSelection([item.id]);
                renderCanvas();
                renderProps();
              }
            },
          });
        });
      });
      annotatePositions(rows);
      renderedRows = rows;

      const buildRoot = row => {
        const meta = DIAGRAM_META[row.diagram.type];
        const rootItem = document.createElement('div');
        rootItem.className = 'ex-item root';
        rootItem.style.cursor = 'pointer';
        const rootIcon = document.createElement('span');
        rootIcon.className = 'ex-icon';
        rootIcon.style.background = meta.color;
        rootIcon.textContent = meta.code;
        rootIcon.setAttribute('aria-hidden', 'true');
        rootItem.append(rootIcon, document.createTextNode(row.diagram.name));
        return rootItem;
      };
      const buildItem = row => {
        const kindMeta = KIND_META[row.kind];
        const item = document.createElement('div');
        item.className = 'ex-item' + (state.selection.includes(row.id) ? ' selected' : '');
        item.dataset.viewId = row.id;
        item.dataset.modelId = row.modelId;
        if (row.depth) item.style.paddingLeft = `${10 + row.depth * 14}px`;
        const itemIcon = document.createElement('span');
        itemIcon.className = 'ex-icon';
        itemIcon.style.background = kindMeta.color;
        itemIcon.textContent = kindMeta.icon;
        itemIcon.setAttribute('aria-hidden', 'true');
        const itemLabel = document.createElement('span');
        const matchingColumn = query && (row.searchColumns || []).find(column =>
          `${column.phys} ${column.logical}`.toLowerCase().includes(query));
        const columnLabel = matchingColumn
          ? [matchingColumn.phys, matchingColumn.logical].filter(Boolean).join(' ↔ ')
          : '';
        itemLabel.textContent = [row.label, columnLabel].filter(Boolean).join(' · ');
        item.append(itemIcon, itemLabel);
        return item;
      };

      rows.forEach((row, index) => {
        const node = row.type === 'root' ? buildRoot(row) : buildItem(row);
        applyTreeAttributes(node, row, rows[index + 1]);
        node.addEventListener('click', () => { focusKey = rowKey(row); row.activate(); });
        node.addEventListener('keydown', event => handleRowKeydown(event, index));
        explorer.appendChild(node);
        rowNodes.push(node);
      });

      if (!rows.length) {
        explorer.removeAttribute('role');
        explorer.removeAttribute('aria-label');
        focusKey = null;
        const empty = document.createElement('div');
        empty.className = 'explorer-empty';
        empty.textContent = '검색 결과가 없습니다.';
        explorer.appendChild(empty);
        return;
      }
      explorer.setAttribute('role', 'tree');
      explorer.setAttribute('aria-label', '모델 탐색기');

      const keys = rows.map(rowKey);
      let tabStop = focusKey ? keys.indexOf(focusKey) : -1;
      if (tabStop < 0) tabStop = rows.findIndex(row => row.type === 'item' && state.selection.includes(row.id));
      if (tabStop < 0) tabStop = rows.findIndex(row => row.type === 'root' && row.diagram.id === state.activeId);
      if (tabStop < 0) tabStop = 0;
      focusKey = keys[tabStop];
      rowNodes[tabStop].tabIndex = 0;
      if (hadFocus) rowNodes[tabStop].focus?.();
    }

    function focus() {
      searchInput.focus();
      searchInput.select();
    }

    let attached = false;
    function attach() {
      if (attached) return;
      searchInput.addEventListener('input', render);
      searchInput.addEventListener('keydown', handleSearchKeydown);
      attached = true;
    }
    function detach() {
      if (!attached) return;
      searchInput.removeEventListener('input', render);
      searchInput.removeEventListener('keydown', handleSearchKeydown);
      attached = false;
    }

    return Object.freeze({ render, focus, attach, detach });
  }

  return Object.freeze({ REQUIRED_FUNCTIONS, REQUIRED_VALUES, create });
});
