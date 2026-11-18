'use strict';

/* ERD property sections — the Entity/relation property blocks that only ER
   diagrams use (표시 방식, Columns, DDL 제약조건과 인덱스, FK 보유 엔티티).
   The property panel owns the panel shell and hands this module its row and
   heading primitives, so the ERD-only markup lives in one place. */
type ErdPropertySectionsApi = ReturnType<typeof createErdPropertySectionsModule>;
declare var UMLErdPropertySections: ErdPropertySectionsApi;

(function initErdPropertySections(root: typeof globalThis, factory: () => ErdPropertySectionsApi) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root) root.UMLErdPropertySections = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, createErdPropertySectionsModule);

function createErdPropertySectionsModule() {
  const REQUIRED_FUNCTIONS = Object.freeze([
    'byId',
    'copyErdColumn',
    'deleteErdColumn',
    'ensureMemberArray',
    'erdMode',
    'flashStatus',
    'getErdColumnClipboard',
    'moveErdColumn',
    'moveErdColumnTo',
    'normalizeErdChecks',
    'normalizeErdIndexes',
    'openErdColumnEditor',
    'parseColumn',
    'pasteErdColumn',
    'propRow',
    'render',
    'renderProps',
    'replaceErdColumns',
    'safeSqlFragment',
    'sectionHeading',
    'setErdMode',
    'snapshot',
  ] as const);
  const REQUIRED_VALUES = Object.freeze([
    'document',
    'ERD_REFERENTIAL_ACTION_OPTIONS',
    'ERD_VIEW_MODES',
  ] as const);

  interface ErdPropertyDependencies {
    byId: (id: string) => DiagramElement | null | undefined;
    copyErdColumn: (entity: DiagramElement, index: number) => boolean;
    deleteErdColumn: (entity: DiagramElement, index: number) => boolean;
    ensureMemberArray: (entity: DiagramElement, field: 'columns') => string[];
    erdMode: () => string;
    flashStatus: (message: string) => void;
    getErdColumnClipboard: () => Pick<ErdColumnClipboard, 'raw' | 'sourceIndex' | 'sourceModelId'> | null;
    moveErdColumn: (entity: DiagramElement, index: number, direction: number) => boolean;
    moveErdColumnTo: (entity: DiagramElement, from: number, to: number) => boolean;
    normalizeErdChecks: (checks: unknown, columns: string[]) => ErdSchemaCheck[];
    normalizeErdIndexes: (indexes: unknown, columns: string[]) => ErdSchemaIndex[];
    openErdColumnEditor: (entity: DiagramElement, index: number, options?: { insert?: boolean }) => boolean;
    parseColumn: (raw: string) => ValidationColumn;
    pasteErdColumn: (entity: DiagramElement, index: number) => boolean;
    propRow: (label: string, control: HTMLElement, hint: string) => HTMLElement;
    render: () => void;
    renderProps: () => void;
    replaceErdColumns: (entity: DiagramElement, raw: string[]) => boolean;
    safeSqlFragment: (value: string, label: string) => string;
    sectionHeading: (text: string) => HTMLElement;
    setErdMode: (mode: string) => unknown;
    snapshot: () => void;
    document: Document;
    ERD_REFERENTIAL_ACTION_OPTIONS: readonly (readonly [string, string])[];
    ERD_VIEW_MODES: readonly (readonly [string, string])[];
  }

  function create(dependencies?: ErdPropertyDependencies) {
    const deps: Partial<ErdPropertyDependencies> = dependencies || {};
    const missing: string[] = REQUIRED_FUNCTIONS.filter(name => typeof deps[name] !== 'function');
    REQUIRED_VALUES.forEach(name => {
      if (deps[name] == null) missing.push(name);
    });
    if (deps.document && typeof deps.document.createElement !== 'function') {
      missing.push('document.createElement');
    }
    if (missing.length) {
      throw new TypeError(`ERD 속성 섹션 의존성이 없습니다: ${[...new Set(missing)].join(', ')}`);
    }

    const {
      byId,
      copyErdColumn,
      deleteErdColumn,
      ensureMemberArray,
      erdMode,
      flashStatus,
      getErdColumnClipboard,
      moveErdColumn,
      moveErdColumnTo,
      normalizeErdChecks,
      normalizeErdIndexes,
      openErdColumnEditor,
      parseColumn,
      pasteErdColumn,
      propRow,
      render,
      renderProps,
      replaceErdColumns,
      safeSqlFragment,
      sectionHeading,
      setErdMode,
      snapshot,
      document,
      ERD_REFERENTIAL_ACTION_OPTIONS,
      ERD_VIEW_MODES,
    } = deps as ErdPropertyDependencies;

    function erdDisplayModeProperty() {
      const section = document.createElement('section');
      section.className = 'erd-display-property';
      const title = sectionHeading('표시 방식');
      section.setAttribute('role', 'group');
      section.setAttribute('aria-labelledby', title.id);
      const group = document.createElement('div');
      group.className = 'erd-display-selector';
      group.setAttribute('role', 'group'); group.setAttribute('aria-label', 'ERD 표시 방식');
      ERD_VIEW_MODES.forEach(([mode, label]) => {
        const button = document.createElement('button');
        button.type = 'button'; button.textContent = label;
        button.dataset.erdMode = mode;
        button.setAttribute('aria-pressed', erdMode() === mode ? 'true' : 'false');
        if (erdMode() === mode) button.className = 'active';
        button.addEventListener('click', () => setErdMode(mode));
        group.appendChild(button);
      });
      const hint = document.createElement('div'); hint.className = 'prop-hint';
      hint.textContent = '현재 ER 다이어그램 전체의 엔티티·컬럼 표시를 전환합니다.';
      section.append(title, group, hint);
      return section;
    }

    function erdColumnsProperty(entity: DiagramElement) {
      const columns = ensureMemberArray(entity, 'columns');
      const section = document.createElement('section');
      section.className = 'erd-columns-property';
      const header = document.createElement('div');
      header.className = 'erd-columns-property-header';
      const title = sectionHeading(`Columns (${columns.length})`);
      section.setAttribute('role', 'group');
      section.setAttribute('aria-labelledby', title.id);
      const paste = document.createElement('button');
      paste.type = 'button'; paste.className = 'erd-column-paste';
      paste.textContent = '붙여넣기'; paste.disabled = !getErdColumnClipboard();
      paste.title = getErdColumnClipboard() ? '복사한 컬럼을 이 테이블 끝에 붙여넣기' : '먼저 컬럼 행의 복사 버튼을 누르세요';
      paste.setAttribute('aria-label', '복사한 ERD 컬럼 붙여넣기');
      paste.addEventListener('click', () => pasteErdColumn(entity, ensureMemberArray(entity, 'columns').length));
      const add = document.createElement('button');
      add.type = 'button'; add.className = 'erd-column-add';
      add.textContent = '+ 컬럼 추가';
      add.title = '새 컬럼 추가 (Ctrl/Cmd+Enter)';
      add.setAttribute('aria-label', 'ERD 컬럼 추가');
      add.addEventListener('click', () => {
        const currentColumns = ensureMemberArray(entity, 'columns');
        openErdColumnEditor(entity, currentColumns.length, { insert: true });
      });
      header.append(title, paste, add); section.appendChild(header);
    
      const list = document.createElement('div');
      list.className = 'erd-column-property-list';
      if (!columns.length) {
        const empty = document.createElement('button');
        empty.type = 'button'; empty.className = 'erd-column-property-empty';
        empty.textContent = '컬럼이 없습니다 · 클릭해서 첫 컬럼 추가';
        empty.addEventListener('click', () => openErdColumnEditor(entity, 0));
        list.appendChild(empty);
      } else {
        list.setAttribute('role', 'list');
        let propertyDragIndex = -1;
        const clearPropertyDrag = () => {
          list.querySelectorAll('.dragging, .drag-target').forEach(node =>
            node.classList.remove('dragging', 'drag-target'));
          propertyDragIndex = -1;
        };
        columns.forEach((raw, index) => {
          const column = parseColumn(raw);
          const row = document.createElement('div');
          row.className = 'erd-column-property-row'; row.dataset.columnIndex = String(index);
          row.setAttribute('role', 'listitem');
          const copied = getErdColumnClipboard();
          if (copied && copied.sourceModelId === entity.modelId
            && copied.sourceIndex === index && copied.raw === raw) row.classList.add('copied');
          const dragHandle = document.createElement('span');
          dragHandle.className = 'erd-column-drag-handle';
          dragHandle.textContent = '⋮⋮'; dragHandle.draggable = true;
          dragHandle.title = '드래그하여 컬럼 순서 변경';
          dragHandle.setAttribute('role', 'button'); dragHandle.setAttribute('tabindex', '0');
          dragHandle.setAttribute('aria-label', `${column.phys || '컬럼'} 순서 드래그 이동`);
          dragHandle.addEventListener('dragstart', event => {
            propertyDragIndex = index;
            row.classList.add('dragging');
            if (event.dataTransfer) {
              event.dataTransfer.effectAllowed = 'move';
              event.dataTransfer.setData('text/plain', String(index));
            }
          });
          dragHandle.addEventListener('dragend', clearPropertyDrag);
          dragHandle.addEventListener('keydown', event => {
            if (event.key !== 'ArrowUp' && event.key !== 'ArrowDown') return;
            event.preventDefault();
            moveErdColumn(entity, index, event.key === 'ArrowUp' ? -1 : 1);
          });
          row.addEventListener('dragover', event => {
            if (propertyDragIndex < 0 || propertyDragIndex === index) return;
            event.preventDefault();
            if (event.dataTransfer) event.dataTransfer.dropEffect = 'move';
            list.querySelectorAll('.drag-target').forEach(node => node.classList.remove('drag-target'));
            row.classList.add('drag-target');
          });
          row.addEventListener('dragleave', event => {
            if (!row.contains(event.relatedTarget as Node | null)) row.classList.remove('drag-target');
          });
          row.addEventListener('drop', event => {
            if (propertyDragIndex < 0) return;
            event.preventDefault();
            const fromIndex = propertyDragIndex;
            clearPropertyDrag();
            if (fromIndex !== index) moveErdColumnTo(entity, fromIndex, index);
          });
          const main = document.createElement('button');
          main.type = 'button'; main.className = 'erd-column-property-main';
          main.setAttribute('aria-label', `컬럼 ${column.phys || index + 1} 편집`);
          const badges = document.createElement('span'); badges.className = 'erd-column-badges';
          column.flags.forEach(flag => {
            const badge = document.createElement('span'); badge.className = `erd-column-badge ${flag.toLowerCase()}`;
            badge.textContent = flag; badges.appendChild(badge);
          });
          const names = document.createElement('span'); names.className = 'erd-column-property-names';
          const physical = document.createElement('strong'); physical.textContent = column.phys || '(이름 없음)';
          const detail = document.createElement('small');
          detail.textContent = [column.logical, column.type].filter(Boolean).join(' · ') || '타입 미지정';
          names.append(physical, detail); main.append(badges, names);
          main.addEventListener('click', () => openErdColumnEditor(entity, index));
    
          const controls = document.createElement('span'); controls.className = 'erd-column-property-controls';
          const actionButton = (text: string, label: string, disabled: boolean, handler: () => unknown) => {
            const button = document.createElement('button');
            button.type = 'button'; button.textContent = text; button.title = label;
            button.setAttribute('aria-label', `${column.phys || '컬럼'} ${label}`);
            button.disabled = disabled; button.addEventListener('click', handler);
            controls.appendChild(button);
          };
          actionButton('⧉', '컬럼 복사', false, () => copyErdColumn(entity, index));
          actionButton('+', '아래에 컬럼 추가', false,
            () => openErdColumnEditor(entity, index + 1, { insert: true }));
          actionButton('↑', '위로 이동', index === 0, () => moveErdColumn(entity, index, -1));
          actionButton('↓', '아래로 이동', index === columns.length - 1, () => moveErdColumn(entity, index, 1));
          actionButton('×', '삭제', false, () => deleteErdColumn(entity, index));
          row.append(dragHandle, main, controls); list.appendChild(row);
        });
      }
      section.appendChild(list);
    
      const clipboard = getErdColumnClipboard();
      if (clipboard) {
        const clipboardHint = document.createElement('div');
        clipboardHint.className = 'erd-column-clipboard-hint';
        clipboardHint.textContent = `복사됨: ${parseColumn(clipboard.raw).phys} · 다른 테이블을 선택해 붙여넣을 수 있습니다.`;
        section.appendChild(clipboardHint);
      }
    
      const hint = document.createElement('div');
      hint.className = 'prop-hint erd-column-shortcut-hint';
      hint.textContent = '캔버스 행 또는 ⋮⋮를 드래그해 정렬 · 행 더블클릭으로 바로 편집 · Ctrl/Cmd+Enter는 연속 추가';
      section.appendChild(hint);
      const advanced = document.createElement('details');
      advanced.className = 'erd-columns-advanced';
      const summary = document.createElement('summary'); summary.textContent = '텍스트로 일괄 편집 (고급)';
      const rawArea = document.createElement('textarea');
      rawArea.value = columns.join('\n');
      rawArea.setAttribute('aria-label', 'ERD 컬럼 텍스트 일괄 편집');
      rawArea.addEventListener('change', () => {
        const next = rawArea.value.split(/\r?\n/).map(line => line.trim()).filter(Boolean);
        if (!replaceErdColumns(entity, next)) rawArea.value = ensureMemberArray(entity, 'columns').join('\n');
      });
      advanced.append(summary, rawArea);
      const rawHint = document.createElement('div');
      rawHint.className = 'prop-hint';
      rawHint.textContent = '형식: PK/FK/NN 물리명 <논리명>: 타입 · 기존 텍스트 형식과 호환됩니다.';
      advanced.appendChild(rawHint); section.appendChild(advanced);
      return section;
    }

    function erdSchemaProperty(entity: DiagramElement) {
      const columnNames = ensureMemberArray(entity, 'columns')
        .map(raw => parseColumn(raw).phys).filter(Boolean);
      const section = document.createElement('section');
      section.className = 'erd-schema-property';
      const title = sectionHeading('DDL 제약조건과 인덱스');
      section.setAttribute('role', 'group');
      section.setAttribute('aria-labelledby', title.id);
      section.appendChild(title);

      const error = document.createElement('div');
      error.className = 'erd-schema-error';
      error.setAttribute('aria-live', 'polite');
      const reportError = (input: HTMLInputElement | HTMLSelectElement, problem: unknown) => {
        const message = problem instanceof Error ? problem.message : String(problem);
        input?.setCustomValidity?.(message);
        input?.reportValidity?.();
        error.textContent = message;
        flashStatus(`ERD 스키마 오류: ${message}`);
      };
      const clearError = (input: HTMLInputElement | HTMLSelectElement) => {
        input?.setCustomValidity?.('');
        error.textContent = '';
      };
      const changeInput = (value: string, onChange: (input: HTMLInputElement) => void, ariaLabel: string) => {
        const input = document.createElement('input');
        input.type = 'text'; input.value = value || '';
        input.setAttribute('aria-label', ariaLabel);
        input.addEventListener('focus', () => snapshot());
        input.addEventListener('change', () => onChange(input));
        return input;
      };

      let checks;
      let indexes;
      try {
        checks = normalizeErdChecks(entity.erdChecks, columnNames);
        indexes = normalizeErdIndexes(entity.erdIndexes, columnNames);
      } catch (problem) {
        error.textContent = problem instanceof Error ? problem.message : String(problem);
        section.appendChild(error);
        return section;
      }

      const checkHeader = document.createElement('div');
      checkHeader.className = 'erd-schema-subheader';
      const checkTitle = document.createElement('span'); checkTitle.textContent = `CHECK (${checks.length})`;
      const addCheck = document.createElement('button');
      addCheck.type = 'button'; addCheck.textContent = '+ CHECK';
      addCheck.addEventListener('click', () => {
        snapshot();
        entity.erdChecks = [...normalizeErdChecks(entity.erdChecks, columnNames),
          { name: '', expression: '1 = 1', column: '' }];
        render(); renderProps();
      });
      checkHeader.append(checkTitle, addCheck); section.appendChild(checkHeader);

      const checkList = document.createElement('div'); checkList.className = 'erd-schema-list';
      checks.forEach((check, index) => {
        const row = document.createElement('div'); row.className = 'erd-schema-row erd-check-row';
        const scope = document.createElement('select');
        scope.setAttribute('aria-label', `CHECK ${index + 1} 적용 범위`);
        [['', '테이블 전체'], ...columnNames.map(name => [name, `컬럼 · ${name}`])].forEach(([value, label]) => {
          const option = document.createElement('option'); option.value = value; option.textContent = label;
          if (value === check.column) option.selected = true;
          scope.appendChild(option);
        });
        scope.value = check.column;
        scope.addEventListener('change', () => {
          snapshot();
          entity.erdChecks = normalizeErdChecks(entity.erdChecks, columnNames).map((value, itemIndex) =>
            itemIndex === index ? { ...value, column: scope.value } : value);
          render(); renderProps();
        });
        const name = changeInput(check.name, input => {
          try {
            const next = normalizeErdChecks(entity.erdChecks, columnNames).map((value, itemIndex) =>
              itemIndex === index ? { ...value, name: input.value.trim() } : value);
            entity.erdChecks = normalizeErdChecks(next, columnNames); clearError(input); render();
          } catch (problem) { reportError(input, problem); }
        }, `CHECK ${index + 1} 이름`);
        name.placeholder = '선택 이름';
        const expression = changeInput(check.expression, input => {
          try {
            const value = safeSqlFragment(input.value, `CHECK ${check.name || index + 1}`);
            entity.erdChecks = normalizeErdChecks(entity.erdChecks, columnNames).map((item, itemIndex) =>
              itemIndex === index ? { ...item, expression: value } : item);
            clearError(input); render();
          } catch (problem) { reportError(input, problem); }
        }, `CHECK ${index + 1} 표현식`);
        expression.placeholder = '예: price >= 0';
        const remove = document.createElement('button');
        remove.type = 'button'; remove.textContent = '×'; remove.title = 'CHECK 삭제';
        remove.setAttribute('aria-label', `CHECK ${check.name || index + 1} 삭제`);
        remove.addEventListener('click', () => {
          snapshot();
          const next = normalizeErdChecks(entity.erdChecks, columnNames)
            .filter((_, itemIndex) => itemIndex !== index);
          if (next.length) entity.erdChecks = next; else delete entity.erdChecks;
          render(); renderProps();
        });
        row.append(scope, name, expression, remove); checkList.appendChild(row);
      });
      if (!checks.length) {
        const empty = document.createElement('div'); empty.className = 'prop-hint';
        empty.textContent = '테이블 또는 특정 컬럼의 CHECK 표현식이 없습니다.';
        checkList.appendChild(empty);
      }
      section.appendChild(checkList);

      const indexHeader = document.createElement('div');
      indexHeader.className = 'erd-schema-subheader';
      const indexTitle = document.createElement('span'); indexTitle.textContent = `Indexes (${indexes.length})`;
      const addIndex = document.createElement('button');
      addIndex.type = 'button'; addIndex.textContent = '+ 인덱스'; addIndex.disabled = !columnNames.length;
      addIndex.addEventListener('click', () => {
        if (!columnNames.length) return;
        snapshot();
        entity.erdIndexes = [...normalizeErdIndexes(entity.erdIndexes, columnNames), {
          kind: 'index', name: `${entity.name || 'table'}_${columnNames[0]}_idx`,
          unique: false, columns: [{ name: columnNames[0], order: '' }], where: '',
        }];
        render(); renderProps();
      });
      indexHeader.append(indexTitle, addIndex); section.appendChild(indexHeader);

      const indexList = document.createElement('div'); indexList.className = 'erd-schema-list';
      const commitIndex = (index: number, nextValue: Partial<ErdSchemaIndex>, input: HTMLInputElement | HTMLSelectElement) => {
        try {
          const next = normalizeErdIndexes(entity.erdIndexes, columnNames)
            .map((value, itemIndex) => itemIndex === index ? { ...value, ...nextValue } : value);
          entity.erdIndexes = normalizeErdIndexes(next, columnNames);
          clearError(input); render();
        } catch (problem) { reportError(input, problem); }
      };
      indexes.forEach((schemaIndex, index) => {
        const row = document.createElement('div'); row.className = 'erd-schema-row erd-index-row';
        const kind = document.createElement('select'); kind.setAttribute('aria-label', `인덱스 ${index + 1} 종류`);
        [['index', 'INDEX'], ['unique', 'UNIQUE 제약']].forEach(([value, label]) => {
          const option = document.createElement('option'); option.value = value; option.textContent = label;
          if (schemaIndex.kind === value) option.selected = true;
          kind.appendChild(option);
        });
        kind.value = schemaIndex.kind;
        kind.addEventListener('change', () => {
          snapshot();
          const selected = kind.value === 'unique' ? 'unique' : 'index';
          commitIndex(index, { kind: selected, unique: selected === 'unique' || schemaIndex.unique }, kind);
          renderProps();
        });
        const name = changeInput(schemaIndex.name, input =>
          commitIndex(index, { name: input.value.trim() }, input), `인덱스 ${index + 1} 이름`);
        name.placeholder = schemaIndex.kind === 'unique' ? '선택 제약 이름' : '비우면 자동 생성';
        const columns = changeInput(schemaIndex.columns.map(column =>
          `${column.name}${column.order ? ` ${column.order}` : ''}`).join(', '), input => {
          const parsed: ErdSchemaIndex['columns'] = input.value.split(',').map(value => value.trim()).filter(Boolean).map(value => {
            const match = value.match(/^(.*?)(?:\s+(ASC|DESC))?$/i);
            const order = match?.[2]?.toUpperCase();
            return { name: (match?.[1] ?? value).trim(), order: order === 'ASC' || order === 'DESC' ? order : '' };
          });
          commitIndex(index, { columns: parsed }, input);
        }, `인덱스 ${index + 1} 컬럼`);
        columns.placeholder = 'email, created_at DESC';
        const where = changeInput(schemaIndex.where, input =>
          commitIndex(index, { where: input.value.trim() }, input), `인덱스 ${index + 1} WHERE`);
        where.placeholder = '선택 WHERE';
        const unique = document.createElement('label'); unique.className = 'prop-check erd-index-unique';
        const uniqueInput = document.createElement('input'); uniqueInput.type = 'checkbox';
        uniqueInput.checked = schemaIndex.unique; uniqueInput.disabled = schemaIndex.kind === 'unique';
        uniqueInput.addEventListener('change', () => {
          snapshot(); commitIndex(index, { unique: uniqueInput.checked }, uniqueInput); renderProps();
        });
        unique.append(uniqueInput, document.createTextNode('Unique'));
        const remove = document.createElement('button');
        remove.type = 'button'; remove.textContent = '×'; remove.title = '인덱스 삭제';
        remove.setAttribute('aria-label', `인덱스 ${schemaIndex.name || index + 1} 삭제`);
        remove.addEventListener('click', () => {
          snapshot();
          const next = normalizeErdIndexes(entity.erdIndexes, columnNames)
            .filter((_, itemIndex) => itemIndex !== index);
          if (next.length) entity.erdIndexes = next; else delete entity.erdIndexes;
          render(); renderProps();
        });
        row.append(kind, name, columns, where, unique, remove); indexList.appendChild(row);
      });
      if (!indexes.length) {
        const empty = document.createElement('div'); empty.className = 'prop-hint';
        empty.textContent = '복합 UNIQUE 또는 보조 인덱스가 없습니다.';
        indexList.appendChild(empty);
      }
      section.append(indexList, error);
      const hint = document.createElement('div'); hint.className = 'prop-hint';
      hint.textContent = '컬럼 편집기의 UQ는 단일 UNIQUE · 여기서는 복합 UNIQUE와 일반/고유 인덱스를 관리합니다.';
      section.appendChild(hint);
      return section;
    }

    function erdForeignKeyProperty(box: HTMLElement, r: DiagramRelation) {
      const source = byId(r.from);
      const target = byId(r.to);
      const owner = document.createElement('select');
      owner.className = 'erd-foreign-key-owner-select';
      [
        ['', '(FK 제약 연결 안 함)'],
        ['source', `출발 · ${source?.name || '엔티티'}`],
        ['target', `도착 · ${target?.name || '엔티티'}`],
      ].forEach(([value, label]) => {
        const option = document.createElement('option');
        option.value = value; option.textContent = label;
        option.selected = value === (r.foreignKeyEnd || '');
        owner.appendChild(option);
      });
      owner.value = r.foreignKeyEnd || '';
      owner.addEventListener('change', () => {
        snapshot(); r.foreignKeyEnd = owner.value;
        if (!owner.value) {
          r.foreignKeyOnDelete = '';
          r.foreignKeyOnUpdate = '';
        }
        render(); renderProps();
        flashStatus(owner.value
          ? `${owner.value === 'source' ? '출발' : '도착'} 엔티티를 FK 보유 테이블로 지정했습니다`
          : '외래키 제약 연결을 해제했습니다');
      });
      box.appendChild(propRow('FK 보유 엔티티', owner,
        'FK 컬럼이 있는 쪽을 선택한 뒤, 아래 양끝에서 FK 컬럼과 참조 컬럼을 각각 지정하세요.'));

      const actionSelect = (field: 'foreignKeyOnDelete' | 'foreignKeyOnUpdate', label: string) => {
        const select = document.createElement('select');
        select.className = `erd-foreign-key-${field === 'foreignKeyOnDelete' ? 'on-delete' : 'on-update'}-select`;
        ERD_REFERENTIAL_ACTION_OPTIONS.forEach(([value, text]) => {
          const option = document.createElement('option');
          option.value = value; option.textContent = text;
          option.selected = value === (r[field] || '');
          select.appendChild(option);
        });
        select.value = r[field] || '';
        select.disabled = !r.foreignKeyEnd;
        select.addEventListener('change', () => {
          snapshot(); r[field] = select.value; render(); renderProps();
          flashStatus(`${label} 동작을 ${select.value || 'DB 기본값'}(으)로 변경했습니다`);
        });
        return propRow(label, select,
          `${label}은 부모 키가 변경될 때 FK 행에 적용됩니다. SET DEFAULT는 MySQL InnoDB 내보내기에서 지원되지 않습니다.`);
      };
      box.appendChild(actionSelect('foreignKeyOnDelete', 'ON DELETE'));
      box.appendChild(actionSelect('foreignKeyOnUpdate', 'ON UPDATE'));
    }

    return Object.freeze({
      erdColumnsProperty,
      erdDisplayModeProperty,
      erdForeignKeyProperty,
      erdSchemaProperty,
    });
  }

  return Object.freeze({ REQUIRED_FUNCTIONS, REQUIRED_VALUES, create });
}
