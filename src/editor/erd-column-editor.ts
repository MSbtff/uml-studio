// @ts-nocheck
'use strict';

/* ERD column editor — the clipboard, the reorder/delete/bulk-replace commands
   and the floating column sheet that ER diagrams use. QuickEdit builds it and
   hands over `selectQuickEditTarget` plus a callback that closes its own two
   editors, so only one QuickEdit surface is ever open. */
(function initErdColumnEditor(root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root) root.UMLErdColumnEditor = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function createErdColumnEditorModule() {
  const REQUIRED_FUNCTIONS = Object.freeze([
    'applyCopiedColumnSchema',
    'closeOtherQuickEditors',
    'columnDetailsFor',
    'confirmAction',
    'copiedColumnValue',
    'copyColumnSchema',
    'deleteColumnSchema',
    'disconnectForeignKeyColumnReferences',
    'ensureMemberArray',
    'flashStatus',
    'foreignKeyColumnImpacts',
    'nextFieldSequence',
    'parseColumn',
    'render',
    'renderProps',
    'renameColumnSchema',
    'renameForeignKeyColumnReferences',
    'reorderColumns',
    'requestAnimationFrame',
    'safeSqlFragment',
    'selectQuickEditTarget',
    'setColumnDetails',
    'setTimeout',
    'snapshot',
    'validateColumn',
  ]);
  const REQUIRED_VALUES = Object.freeze([
    'document',
    'state',
    'wrap',
  ]);

  function create(dependencies) {
    const deps = dependencies || {};
    const missing = REQUIRED_FUNCTIONS.filter(name => typeof deps[name] !== 'function');
    REQUIRED_VALUES.forEach(name => {
      if (deps[name] == null) missing.push(name);
    });
    if (deps.document && typeof deps.document.createElement !== 'function') {
      missing.push('document.createElement');
    }
    if (missing.length) {
      throw new TypeError(`ERD 컬럼 편집기 의존성이 없습니다: ${[...new Set(missing)].join(', ')}`);
    }

    const {
      applyCopiedColumnSchema,
      closeOtherQuickEditors,
      columnDetailsFor,
      confirmAction,
      copiedColumnValue,
      copyColumnSchema,
      deleteColumnSchema,
      disconnectForeignKeyColumnReferences,
      ensureMemberArray,
      flashStatus,
      foreignKeyColumnImpacts,
      nextFieldSequence,
      parseColumn,
      render,
      renderProps,
      renameColumnSchema,
      renameForeignKeyColumnReferences,
      reorderColumns,
      requestAnimationFrame,
      safeSqlFragment,
      selectQuickEditTarget,
      setColumnDetails,
      setTimeout,
      snapshot,
      validateColumn,
      document,
      state,
      wrap,
    } = deps;

    const ERD_DATA_TYPES = [
      'BIGINT', 'INTEGER', 'SMALLINT', 'DECIMAL(10, 2)',
      'VARCHAR(255)', 'CHAR(1)', 'TEXT', 'BOOLEAN',
      'DATE', 'TIME', 'TIMESTAMP', 'JSON', 'UUID', 'BLOB',
    ];

    let erdColumnClipboard = null;

    function copyErdColumn(entity, index) {
      const columns = ensureMemberArray(entity, 'columns');
      if (index < 0 || index >= columns.length) return false;
      const raw = columns[index];
      erdColumnClipboard = {
        raw,
        schema: copyColumnSchema(entity, parseColumn(raw).phys),
        sourceModelId: entity.modelId,
        sourceIndex: index,
      };
      renderProps();
      flashStatus(`컬럼 '${parseColumn(raw).phys}'을(를) 복사했습니다 · 대상 테이블에서 붙여넣으세요`);
      return true;
    }

    function pasteErdColumn(entity, requestedIndex) {
      if (!erdColumnClipboard || !entity || entity.kind !== 'entity') return false;
      const columns = ensureMemberArray(entity, 'columns');
      const numericIndex = Number(requestedIndex);
      const index = Math.max(0, Math.min(Number.isFinite(numericIndex) ? numericIndex : columns.length, columns.length));
      const raw = copiedColumnValue(erdColumnClipboard.raw, columns);
      const sourceName = parseColumn(erdColumnClipboard.raw).phys;
      const pastedName = parseColumn(raw).phys;
      snapshot();
      columns.splice(index, 0, raw);
      applyCopiedColumnSchema(entity, pastedName, erdColumnClipboard.schema);
      render(); renderProps();
      flashStatus(sourceName === pastedName
        ? `컬럼 '${pastedName}'을(를) 붙여넣었습니다`
        : `중복을 피해 컬럼 '${pastedName}'(으)로 붙여넣었습니다`);
      openErdColumnEditor(entity, index);
      return true;
    }

    let erdColumnEditor = null;
    function closeErdColumnEditor() {
      if (!erdColumnEditor) return;
      erdColumnEditor._cleanup?.();
      erdColumnEditor.remove();
      erdColumnEditor = null;
    }

    function deleteErdColumn(entity, index) {
      const columns = ensureMemberArray(entity, 'columns');
      if (index < 0 || index >= columns.length) return false;
      const name = parseColumn(columns[index]).phys || `#${index + 1}`;
      const impacts = foreignKeyColumnImpacts(state.models, entity.modelId, name);
      if (impacts.length) {
        const labels = impacts.slice(0, 5).map(impact =>
          `'${impact.relationName || impact.relationModelId}'`).join(', ');
        const remainder = impacts.length > 5 ? ` 외 ${impacts.length - 5}개` : '';
        const confirmed = confirmAction(
          `컬럼 '${name}'은(는) FK 관계 ${impacts.length}개에서 사용 중입니다: ${labels}${remainder}\n\n`
          + '삭제하면 관계선은 유지되지만 FK 컬럼과 ON DELETE/UPDATE 연결이 해제됩니다. 계속할까요?',
        );
        if (!confirmed) return false;
      }
      snapshot();
      columns.splice(index, 1);
      const removed = deleteColumnSchema(entity, name);
      const disconnected = disconnectForeignKeyColumnReferences(state.models, entity.modelId, name);
      render(); renderProps();
      const affected = removed.checks + removed.indexes;
      flashStatus(`컬럼 '${name}'을(를) 삭제했습니다`
        + `${affected ? ` · 연결된 CHECK/인덱스 ${affected}개도 제거` : ''}`
        + `${disconnected.relations ? ` · FK 연결 ${disconnected.relations}개 해제` : ''}`
        + ' · Undo로 복구할 수 있습니다');
      return true;
    }

    function replaceErdColumns(entity, rawColumns) {
      if (!entity || entity.kind !== 'entity' || !Array.isArray(rawColumns)) return false;
      const normalized = [];
      for (let index = 0; index < rawColumns.length; index++) {
        const result = validateColumn(parseColumn(rawColumns[index]), rawColumns, index);
        if (!result.valid) {
          flashStatus(`컬럼 일괄 편집 오류: ${result.error}`);
          return false;
        }
        normalized.push(result.value);
      }
      const previous = ensureMemberArray(entity, 'columns');
      if (previous.length === normalized.length
        && previous.every((value, index) => value === normalized[index])) return true;
      const previousNames = previous.map(value => parseColumn(value).phys.trim());
      const nextNames = normalized.map(value => parseColumn(value).phys.trim());
      const previousKeys = new Set(previousNames.map(value => value.toLocaleLowerCase()));
      const nextKeys = new Set(nextNames.map(value => value.toLocaleLowerCase()));
      const renames = [];
      for (let index = 0; index < Math.min(previousNames.length, nextNames.length); index++) {
        const oldName = previousNames[index];
        const newName = nextNames[index];
        if (!oldName || !newName || oldName === newName) continue;
        const oldKey = oldName.toLocaleLowerCase();
        const newKey = newName.toLocaleLowerCase();
        if (oldKey === newKey || (!nextKeys.has(oldKey) && !previousKeys.has(newKey))) {
          renames.push({ oldName, newName });
        }
      }
      const renamedKeys = new Set(renames.map(item => item.oldName.toLocaleLowerCase()));
      const deletedNames = previousNames.filter(name => name
        && !nextKeys.has(name.toLocaleLowerCase()) && !renamedKeys.has(name.toLocaleLowerCase()));
      const impactedRelations = new Map();
      deletedNames.forEach(name => {
        foreignKeyColumnImpacts(state.models, entity.modelId, name).forEach(impact => {
          impactedRelations.set(impact.relationModelId, impact);
        });
      });
      if (impactedRelations.size) {
        const labels = [...impactedRelations.values()].slice(0, 5).map(impact =>
          `'${impact.relationName || impact.relationModelId}'`).join(', ');
        const remainder = impactedRelations.size > 5 ? ` 외 ${impactedRelations.size - 5}개` : '';
        if (!confirmAction(
          `일괄 편집에서 삭제되는 컬럼이 FK 관계 ${impactedRelations.size}개에 사용 중입니다: ${labels}${remainder}\n\n`
          + '적용하면 관계선은 유지되지만 해당 FK 컬럼과 ON DELETE/UPDATE 연결이 해제됩니다. 계속할까요?',
        )) return false;
      }
      snapshot();
      let renamedRelations = 0;
      renames.forEach(({ oldName, newName }) => {
        renameColumnSchema(entity, oldName, newName);
        renamedRelations += renameForeignKeyColumnReferences(
          state.models, entity.modelId, oldName, newName,
        ).relations;
      });
      let disconnectedRelations = 0;
      deletedNames.forEach(name => {
        deleteColumnSchema(entity, name);
        disconnectedRelations += disconnectForeignKeyColumnReferences(
          state.models, entity.modelId, name,
        ).relations;
      });
      entity.columns = normalized;
      render(); renderProps();
      flashStatus(`컬럼 일괄 편집을 적용했습니다`
        + `${renamedRelations ? ` · FK 연결 ${renamedRelations}개 갱신` : ''}`
        + `${disconnectedRelations ? ` · FK 연결 ${disconnectedRelations}개 해제` : ''}`
        + ' · Undo로 복구할 수 있습니다');
      return true;
    }

    function moveErdColumn(entity, index, direction) {
      return moveErdColumnTo(entity, index, index + direction);
    }

    function moveErdColumnTo(entity, index, targetIndex) {
      const columns = ensureMemberArray(entity, 'columns');
      if (index < 0 || index >= columns.length || targetIndex < 0 || targetIndex >= columns.length
        || index === targetIndex) return false;
      const column = columns[index];
      snapshot();
      entity.columns = reorderColumns(columns, index, targetIndex);
      render(); renderProps();
      flashStatus(`컬럼 '${parseColumn(column).phys}' 순서를 변경했습니다`);
      return true;
    }

    function openErdColumnEditor(entity, requestedIndex, options = {}) {
      if (!entity || entity.kind !== 'entity') return false;
      selectQuickEditTarget(entity.id);
      closeOtherQuickEditors();
      closeErdColumnEditor();

      const columns = ensureMemberArray(entity, 'columns');
      const numericIndex = Number(requestedIndex);
      const targetIndex = Number.isFinite(numericIndex) ? numericIndex : columns.length;
      const index = Math.max(0, Math.min(targetIndex, columns.length));
      const isNew = options.insert === true || index >= columns.length;
      const original = isNew ? '' : columns[index];
      const value = parseColumn(original);
      const originalDetails = columnDetailsFor(entity, value.phys);
      const metrics = entity._m || { headH: 34, RH: 17 };
      const rowY = entity.y + metrics.headH + Math.min(index, columns.length) * (metrics.RH || 17);

      const editor = document.createElement('div');
      editor.className = 'erd-column-editor';
      editor.dataset.quickEdit = 'erd-column';
      editor.dataset.columnMode = isNew ? 'add' : 'edit';
      editor.setAttribute('role', 'dialog');

      const title = document.createElement('div');
      title.className = 'erd-column-editor-title';
      title.id = `uml-quickedit-title-${nextFieldSequence()}`;
      title.textContent = `${entity.name || 'Entity'} · ${isNew ? '새 컬럼' : `${index + 1}번째 컬럼 편집`}`;
      /* name the dialog with the heading the user can actually see */
      editor.setAttribute('aria-labelledby', title.id);
      editor.appendChild(title);

      const quickActions = document.createElement('div');
      quickActions.className = 'erd-column-editor-quick-actions';
      const copyAction = document.createElement('button');
      copyAction.type = 'button'; copyAction.textContent = '⧉ 컬럼 복사';
      copyAction.title = '현재 컬럼 복사 (Ctrl/Cmd+C)';
      copyAction.setAttribute('aria-label', '현재 ERD 컬럼 복사');
      const pasteAction = document.createElement('button');
      pasteAction.type = 'button'; pasteAction.textContent = '아래 붙여넣기';
      pasteAction.title = '복사한 컬럼을 바로 아래에 붙여넣기 (Ctrl/Cmd+V)';
      pasteAction.setAttribute('aria-label', '복사한 ERD 컬럼을 아래에 붙여넣기');
      pasteAction.disabled = !erdColumnClipboard;
      quickActions.append(copyAction, pasteAction); editor.appendChild(quickActions);

      const fields = {};
      const fieldGrid = document.createElement('div');
      fieldGrid.className = 'erd-column-editor-sheet';
      editor.appendChild(fieldGrid);
      const addField = (labelText, name, fieldValue, placeholder, hint = '') => {
        const row = document.createElement('label');
        row.className = 'erd-column-editor-row';
        const label = document.createElement('span');
        label.id = `uml-quickedit-field-${nextFieldSequence()}`;
        label.textContent = labelText;
        const input = document.createElement('input');
        input.type = 'text'; input.name = name; input.value = fieldValue || '';
        input.placeholder = placeholder; input.autocomplete = 'off';
        /* the row itself is the <label>, so name the control from the caption
           alone and leave the hint as a description */
        input.setAttribute('aria-labelledby', label.id);
        row.append(label, input);
        if (hint) {
          const small = document.createElement('small');
          small.id = `${label.id}-hint`;
          small.textContent = hint;
          input.setAttribute('aria-describedby', small.id);
          row.appendChild(small);
        }
        fieldGrid.appendChild(row); fields[name] = input;
        return input;
      };

      addField('물리명 *', 'phys', value.phys, '예: user_id', '같은 엔티티 안에서 고유해야 합니다.');
      addField('논리명', 'logical', value.logical, '예: 작성자번호', '논리 모델 보기에 표시할 선택 항목입니다.');
      const typeInput = addField('데이터 타입', 'type', value.type, '입력하거나 목록에서 선택', '자주 쓰는 SQL 타입을 바로 선택할 수 있습니다.');
      const listId = `erd-column-types-${entity.id}`;
      typeInput.setAttribute('list', listId);
      const datalist = document.createElement('datalist');
      datalist.id = listId;
      ERD_DATA_TYPES.forEach(type => {
        const option = document.createElement('option'); option.value = type; datalist.appendChild(option);
      });
      editor.appendChild(datalist);
      addField('DEFAULT', 'defaultValue', originalDetails.defaultValue, "예: CURRENT_TIMESTAMP 또는 'draft'",
        'SQL 표현식으로 저장되며 내보내기 전에 안전성을 검사합니다.');

      const flags = document.createElement('fieldset');
      flags.className = 'erd-column-flags';
      const legend = document.createElement('legend'); legend.textContent = '제약조건';
      flags.appendChild(legend);
      ['PK', 'FK', 'UQ', 'NN'].forEach(flag => {
        const label = document.createElement('label');
        const checkbox = document.createElement('input');
        checkbox.type = 'checkbox'; checkbox.name = flag; checkbox.checked = value.flags.includes(flag);
        checkbox.setAttribute('aria-label', flag);
        label.append(checkbox, document.createTextNode(flag)); flags.appendChild(label);
        fields[flag] = checkbox;
      });
      editor.appendChild(flags);

      const shortcut = document.createElement('div');
      shortcut.className = 'erd-column-editor-shortcut';
      shortcut.textContent = isNew
        ? 'Enter 저장 · Ctrl/Cmd+Enter 저장 후 다음 추가 · Esc 취소'
        : 'Delete 컬럼 삭제 · Ctrl/Cmd+C 복사 · Ctrl/Cmd+V 아래 붙여넣기 · Backspace 글자 삭제';
      editor.appendChild(shortcut);
      const error = document.createElement('div');
      error.className = 'erd-column-editor-error'; error.setAttribute('aria-live', 'polite');
      editor.appendChild(error);

      const actions = document.createElement('div');
      actions.className = 'erd-column-editor-actions';
      const remove = document.createElement('button');
      remove.type = 'button'; remove.className = 'danger'; remove.textContent = '삭제';
      remove.hidden = isNew;
      const spacer = document.createElement('span'); spacer.className = 'spacer';
      const cancel = document.createElement('button'); cancel.type = 'button'; cancel.textContent = '취소';
      const saveNext = document.createElement('button'); saveNext.type = 'button'; saveNext.textContent = '저장 후 다음 추가';
      const save = document.createElement('button'); save.type = 'button'; save.className = 'primary'; save.textContent = '저장';
      actions.append(remove, spacer, cancel, saveNext, save); editor.appendChild(actions);

      const readResult = () => {
        const result = validateColumn({
          phys: fields.phys.value,
          logical: fields.logical.value,
          type: fields.type.value,
          flags: ['PK', 'FK', 'UQ', 'NN'].filter(flag => fields[flag].checked),
        }, columns, isNew ? -1 : index);
        if (!result.valid) return result;
        try {
          result.defaultValue = safeSqlFragment(fields.defaultValue.value, 'DEFAULT 값', true);
        } catch (error) {
          return { valid: false, field: 'defaultValue', error: error.message };
        }
        return result;
      };
      const showError = result => {
        error.textContent = result.error;
        const field = fields[result.field] || fields.phys;
        field.setCustomValidity(result.error);
        field.reportValidity(); field.focus();
      };
      let done = false;
      const commit = addNext => {
        if (done) return false;
        const result = readResult();
        if (!result.valid) { showError(result); return false; }
        done = true;
        const changed = isNew || original !== result.value
          || originalDetails.defaultValue !== result.defaultValue;
        let renamedRelations = 0;
        if (changed) {
          snapshot();
          if (isNew) columns.splice(index, 0, result.value);
          else {
            columns[index] = result.value;
            renameColumnSchema(entity, value.phys, result.column.phys);
            renamedRelations = renameForeignKeyColumnReferences(
              state.models, entity.modelId, value.phys, result.column.phys,
            ).relations;
          }
          setColumnDetails(entity, result.column.phys, {
            defaultValue: result.defaultValue,
            uniqueName: result.column.flags.includes('UQ') ? originalDetails.uniqueName : '',
          });
        }
        closeErdColumnEditor();
        if (changed) { render(); renderProps(); }
        flashStatus(`컬럼 '${result.column.phys}'을(를) ${isNew ? '추가' : '저장'}했습니다`
          + `${renamedRelations ? ` · FK 연결 ${renamedRelations}개도 갱신` : ''}`);
        if (addNext) {
          openErdColumnEditor(entity, index + 1, { insert: true });
          flashStatus(`컬럼 '${result.column.phys}' 저장 완료 · 다음 컬럼을 입력하세요`);
        }
        return true;
      };
      const moveCurrent = direction => {
        if (done || isNew) return;
        const targetIndex = index + direction;
        if (targetIndex < 0 || targetIndex >= columns.length) return;
        const result = readResult();
        if (!result.valid) { showError(result); return; }
        done = true;
        snapshot();
        columns[index] = result.value;
        renameColumnSchema(entity, value.phys, result.column.phys);
        const renamed = renameForeignKeyColumnReferences(
          state.models, entity.modelId, value.phys, result.column.phys,
        );
        setColumnDetails(entity, result.column.phys, {
          defaultValue: result.defaultValue,
          uniqueName: result.column.flags.includes('UQ') ? originalDetails.uniqueName : '',
        });
        const [column] = columns.splice(index, 1);
        columns.splice(targetIndex, 0, column);
        closeErdColumnEditor(); render(); renderProps();
        openErdColumnEditor(entity, targetIndex);
        flashStatus(`컬럼 '${result.column.phys}' 순서를 변경했습니다`
          + `${renamed.relations ? ` · FK 연결 ${renamed.relations}개도 갱신` : ''}`);
      };
      const copyCurrent = () => {
        if (done) return false;
        const result = readResult();
        if (!result.valid) { showError(result); return false; }
        erdColumnClipboard = {
          raw: result.value,
          schema: {
            ...copyColumnSchema(entity, value.phys),
            details: {
              defaultValue: result.defaultValue,
              uniqueName: result.column.flags.includes('UQ') ? originalDetails.uniqueName : '',
            },
          },
          sourceModelId: entity.modelId,
          sourceIndex: isNew ? -1 : index,
        };
        pasteAction.disabled = false;
        renderProps();
        flashStatus(`컬럼 '${result.column.phys}'을(를) 복사했습니다 · Ctrl/Cmd+V로 붙여넣으세요`);
        return true;
      };
      const pasteBelow = () => {
        if (done) return false;
        if (!erdColumnClipboard) {
          flashStatus('복사한 컬럼이 없습니다');
          return false;
        }
        if (isNew && !fields.phys.value.trim()) {
          done = true;
          closeErdColumnEditor();
          return pasteErdColumn(entity, index);
        }
        const pasteIndex = index + 1;
        if (!commit(false)) return false;
        return pasteErdColumn(entity, pasteIndex);
      };

      save.addEventListener('click', () => commit(false));
      saveNext.addEventListener('click', () => commit(true));
      copyAction.addEventListener('click', copyCurrent);
      pasteAction.addEventListener('click', pasteBelow);
      cancel.addEventListener('click', closeErdColumnEditor);
      remove.addEventListener('click', () => {
        if (deleteErdColumn(entity, index)) closeErdColumnEditor();
      });
      editor.addEventListener('input', event => {
        event.target.setCustomValidity?.(''); error.textContent = '';
      });
      editor.addEventListener('keydown', event => {
        const mod = event.ctrlKey || event.metaKey;
        const key = event.key.toLowerCase();
        if (event.key === 'Escape') { event.preventDefault(); closeErdColumnEditor(); }
        else if (mod && !event.altKey && key === 'c') {
          event.preventDefault(); copyCurrent();
        } else if (mod && !event.altKey && key === 'v') {
          event.preventDefault(); pasteBelow();
        }
        else if (mod && event.key === 'Enter') { event.preventDefault(); commit(true); }
        else if (event.key === 'Delete' && !isNew) {
          event.preventDefault();
          if (!done) {
            if (deleteErdColumn(entity, index)) {
              done = true;
              closeErdColumnEditor();
            }
          }
        } else if (mod && (event.key === 'ArrowUp' || event.key === 'ArrowDown')) {
          event.preventDefault(); moveCurrent(event.key === 'ArrowUp' ? -1 : 1);
        } else if (event.key === 'Enter' && event.target.matches('input[type="text"]')) {
          event.preventDefault(); commit(false);
        }
        event.stopPropagation();
      });
      const outside = event => {
        if (!editor.contains(event.target)) closeErdColumnEditor();
      };
      editor._cleanup = () => document.removeEventListener('mousedown', outside, true);
      wrap.appendChild(editor); erdColumnEditor = editor;

      const positionEditor = () => {
        if (!editor.isConnected) return;
        const desiredLeft = (entity.x + entity.w + 10) * state.zoom;
        const desiredTop = rowY * state.zoom;
        const minLeft = wrap.scrollLeft + 8;
        const maxLeft = Math.max(minLeft, wrap.scrollLeft + wrap.clientWidth - editor.offsetWidth - 8);
        const minTop = wrap.scrollTop + 8;
        const maxTop = Math.max(minTop, wrap.scrollTop + wrap.clientHeight - editor.offsetHeight - 8);
        editor.style.left = `${Math.max(minLeft, Math.min(desiredLeft, maxLeft))}px`;
        editor.style.top = `${Math.max(minTop, Math.min(desiredTop, maxTop))}px`;
      };
      positionEditor(); requestAnimationFrame(positionEditor);
      setTimeout(() => {
        positionEditor(); document.addEventListener('mousedown', outside, true);
      }, 0);
      fields.phys.focus(); fields.phys.select();
      return true;
    }

    return Object.freeze({
      closeErdColumnEditor,
      copyErdColumn,
      deleteErdColumn,
      getErdColumnClipboard: () => erdColumnClipboard,
      moveErdColumn,
      moveErdColumnTo,
      openErdColumnEditor,
      pasteErdColumn,
      replaceErdColumns,
    });
  }

  return Object.freeze({ REQUIRED_FUNCTIONS, REQUIRED_VALUES, create });
});
