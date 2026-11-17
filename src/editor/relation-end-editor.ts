// @ts-nocheck
'use strict';

/* Relation end QuickEdit — the floating sheet that edits one end of an
   association / ER relationship (이름·다중도·탐색 가능성·집합·한정자, and the ER
   cardinality). QuickEdit builds it and hands over `selectQuickEditTarget` plus
   a callback that closes its other editors, so only one sheet is ever open. */
(function initRelationEndEditor(root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root) root.UMLRelationEndEditor = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function createRelationEndEditorModule() {
  const REQUIRED_FUNCTIONS = Object.freeze([
    'byId',
    'closeOtherQuickEditors',
    'erdRelationCardinality',
    'flashStatus',
    'nextFieldSequence',
    'parseQuickEditExpression',
    'relEndpoints',
    'relationEndAggregation',
    'relationEndExpression',
    'relationEndMultiplicity',
    'relationEndNavigability',
    'relationSupportsEndQuickEdit',
    'render',
    'renderProps',
    'requestAnimationFrame',
    'selectQuickEditTarget',
    'setTimeout',
    'snapshot',
    'validRelationEndMultiplicity',
  ]);
  const REQUIRED_VALUES = Object.freeze([
    'document',
    'state',
    'wrap',
    'ASSOCIATION_QUALIFIER_KINDS',
    'ERD_CARDINALITY_OPTIONS',
    'ER_RELATION_KINDS',
    'VISIBILITY_VALUE',
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
      throw new TypeError(`관계 끝점 편집기 의존성이 없습니다: ${[...new Set(missing)].join(', ')}`);
    }

    const {
      byId,
      closeOtherQuickEditors,
      erdRelationCardinality,
      flashStatus,
      nextFieldSequence,
      parseQuickEditExpression,
      relEndpoints,
      relationEndAggregation,
      relationEndExpression,
      relationEndMultiplicity,
      relationEndNavigability,
      relationSupportsEndQuickEdit,
      render,
      renderProps,
      requestAnimationFrame,
      selectQuickEditTarget,
      setTimeout,
      snapshot,
      validRelationEndMultiplicity,
      document,
      state,
      wrap,
      ASSOCIATION_QUALIFIER_KINDS,
      ERD_CARDINALITY_OPTIONS,
      ER_RELATION_KINDS,
      VISIBILITY_VALUE,
    } = deps;

    let relationEndEditor = null;
    function closeRelationEndEditor() {
      if (!relationEndEditor) return;
      relationEndEditor._cleanup?.();
      relationEndEditor.remove();
      relationEndEditor = null;
    }

    function openRelationEndQuickEdit(r, end, point = null) {
      if (!relationSupportsEndQuickEdit(r)) return false;
      selectQuickEditTarget(r.id);
      closeOtherQuickEditors();
      closeRelationEndEditor();

      const endpoints = relEndpoints(r);
      if (!endpoints) return false;
      const anchor = point || (end === 'source' ? endpoints.p1 : endpoints.p2);
      const prefix = end === 'source' ? 'source' : 'target';
      const endpoint = byId(end === 'source' ? r.from : r.to);
      const erd = ER_RELATION_KINDS.has(r.kind);
      const editor = document.createElement('div');
      editor.className = 'relation-end-editor';
      editor.dataset.quickEdit = 'relation-end';
      editor.dataset.end = end;
      editor.setAttribute('role', 'dialog');
      editor.style.left = `${anchor.x * state.zoom + 12}px`;
      editor.style.top = `${anchor.y * state.zoom + 12}px`;

      const title = document.createElement('div');
      title.className = 'relation-end-editor-title';
      title.id = `uml-quickedit-title-${nextFieldSequence()}`;
      title.textContent = erd
        ? `${end === 'source' ? '출발' : '도착'} 엔티티 · ${endpoint?.name || '(이름 없음)'}`
        : `${end === 'source' ? 'Source' : 'Target'} End · ${endpoint?.name || '(unnamed)'}`;
      /* the visible heading already says which end this is */
      editor.setAttribute('aria-labelledby', title.id);
      editor.appendChild(title);

      const fields = {};
      const addField = (label, control, hint = '') => {
        const row = document.createElement('label');
        row.className = 'relation-end-editor-row';
        const caption = document.createElement('span');
        caption.id = `uml-quickedit-field-${nextFieldSequence()}`;
        caption.textContent = label;
        /* the row itself is the <label>, so name the control from the caption
           alone and leave the hint as a description */
        control.setAttribute('aria-labelledby', caption.id);
        row.append(caption, control);
        if (hint) {
          const small = document.createElement('small');
          small.id = `${caption.id}-hint`;
          small.textContent = hint;
          control.setAttribute('aria-describedby', small.id);
          row.appendChild(small);
        }
        editor.appendChild(row);
        return control;
      };
      const input = (name, value) => {
        const node = document.createElement('input');
        node.type = 'text'; node.name = name; node.value = value || '';
        fields[name] = node;
        return node;
      };
      const select = (name, value, choices) => {
        const node = document.createElement('select');
        node.name = name;
        choices.forEach(([optionValue, label]) => {
          const option = document.createElement('option');
          option.value = optionValue; option.textContent = label;
          option.selected = optionValue === value;
          node.appendChild(option);
        });
        fields[name] = node;
        return node;
      };

      const expression = erd ? (r[`${prefix}EndName`] || '') : relationEndExpression(r, end);
      addField(erd ? 'End Name' : 'Name Expression',
        input('expression', expression),
        erd ? '관계 끝점 역할 이름' : '예: «role» + owner');
      if (erd) {
        const cardinality = select('multiplicity', erdRelationCardinality(r, end),
          ERD_CARDINALITY_OPTIONS);
        addField('참여 개수 (Cardinality)', cardinality,
          '○는 0(선택), |는 1(필수), 까마귀발은 여러 개를 뜻합니다.');
      } else {
        const multiplicity = input('multiplicity', relationEndMultiplicity(r, end));
        addField('Multiplicity', multiplicity, '예: 1, *, 0..1, 0..*');
      }

      if (!erd) {
        addField('Navigability', select('navigability', relationEndNavigability(r, end), [
          ['unspecified', 'Unspecified'], ['navigable', 'Navigable'], ['notNavigable', 'Not Navigable'],
        ]));
        addField('Aggregation', select('aggregation', relationEndAggregation(r, end), [
          ['none', 'None'], ['shared', 'Shared'], ['composite', 'Composite'],
        ]));
        if (ASSOCIATION_QUALIFIER_KINDS.has(r.kind)) {
          const qualifiers = document.createElement('textarea');
          qualifiers.name = 'qualifiers';
          qualifiers.value = Array.isArray(r[`${prefix}Qualifiers`]) ? r[`${prefix}Qualifiers`].join('\n') : '';
          fields.qualifiers = qualifiers;
          addField('Qualifiers', qualifiers, '한 줄에 하나씩 입력');
        }
      }

      const error = document.createElement('div');
      error.className = 'relation-end-editor-error';
      error.setAttribute('aria-live', 'polite');
      editor.appendChild(error);
      const actions = document.createElement('div');
      actions.className = 'relation-end-editor-actions';
      const cancel = document.createElement('button');
      cancel.type = 'button'; cancel.textContent = 'Cancel';
      const apply = document.createElement('button');
      apply.type = 'button'; apply.className = 'primary'; apply.textContent = 'Apply';
      actions.append(cancel, apply); editor.appendChild(actions);

      const commit = () => {
        error.textContent = '';
        const rawExpression = fields.expression.value.trim();
        let parsed = null;
        if (!erd && rawExpression) {
          parsed = parseQuickEditExpression('name', rawExpression);
          if (!parsed.valid) {
            fields.expression.setCustomValidity(parsed.error || '이름 표현식이 올바르지 않습니다.');
            fields.expression.reportValidity();
            fields.expression.focus();
            return;
          }
        }
        const multiplicityValue = fields.multiplicity.value.trim();
        if (!validRelationEndMultiplicity(multiplicityValue, erd)) {
          const message = erd
            ? 'Cardinality는 0..1, 1, 0..N, 1..N 중에서 선택하세요.'
            : 'Multiplicity는 1, *, 0..1, 0..* 형식으로 입력하세요.';
          fields.multiplicity.setCustomValidity(message);
          fields.multiplicity.reportValidity();
          fields.multiplicity.focus();
          error.textContent = message;
          return;
        }
        const updates = {
          [`${prefix}EndName`]: erd ? rawExpression : (parsed?.name || ''),
          [prefix === 'source' ? 'sourceLabel' : 'targetLabel']: multiplicityValue,
        };
        if (!erd) {
          updates[`${prefix}EndStereotype`] = parsed?.stereotype || undefined;
          updates[`${prefix}EndVisibility`] = parsed?.visibility ? VISIBILITY_VALUE[parsed.visibility] : undefined;
          updates[`${prefix}Navigability`] = fields.navigability.value;
          updates[`${prefix}Aggregation`] = fields.aggregation.value;
          if (fields.qualifiers) {
            updates[`${prefix}Qualifiers`] = fields.qualifiers.value.split(/\r?\n/)
              .map(value => value.trim()).filter(Boolean).slice(0, 50);
          }
        }
        const changed = Object.entries(updates).some(([field, value]) =>
          JSON.stringify(r[field]) !== JSON.stringify(value));
        if (changed) {
          snapshot();
          Object.entries(updates).forEach(([field, value]) => { r[field] = value; });
          render(); renderProps();
          flashStatus(`${end === 'source' ? 'Source' : 'Target'} End를 수정했습니다`);
        }
        closeRelationEndEditor();
      };
      apply.addEventListener('click', commit);
      cancel.addEventListener('click', closeRelationEndEditor);
      editor.addEventListener('input', event => {
        event.target.setCustomValidity?.('');
        error.textContent = '';
      });
      editor.addEventListener('keydown', event => {
        if (event.key === 'Escape') { event.preventDefault(); closeRelationEndEditor(); }
        if (event.key === 'Enter' && event.target.tagName !== 'TEXTAREA') { event.preventDefault(); commit(); }
        event.stopPropagation();
      });
      const outside = event => {
        if (!editor.contains(event.target)) closeRelationEndEditor();
      };
      editor._cleanup = () => document.removeEventListener('mousedown', outside, true);
      wrap.appendChild(editor);
      relationEndEditor = editor;
      /* Keep the editor inside the currently visible canvas viewport, even when
         the relationship end is close to the right or bottom panel. */
      const positionEditor = () => {
        if (!editor.isConnected) return;
        const minLeft = wrap.scrollLeft + 8;
        const maxLeft = Math.max(minLeft, wrap.scrollLeft + wrap.clientWidth - editor.offsetWidth - 8);
        const minTop = wrap.scrollTop + 8;
        /* Some platform fonts settle after the first layout pass. Reserve one
           text row of growth so a late reflow cannot push the actions off-screen. */
        const reservedHeight = Math.min(Math.max(0, wrap.clientHeight - 16), editor.offsetHeight + 64);
        const maxTop = Math.max(minTop, wrap.scrollTop + wrap.clientHeight - reservedHeight - 8);
        editor.style.left = `${Math.max(minLeft, Math.min(anchor.x * state.zoom + 12, maxLeft))}px`;
        editor.style.top = `${Math.max(minTop, Math.min(anchor.y * state.zoom + 12, maxTop))}px`;
      };
      positionEditor();
      requestAnimationFrame(positionEditor); // webfont/layout 확정 후 한 번 더 보정
      setTimeout(() => {
        positionEditor();
        document.addEventListener('mousedown', outside, true);
      }, 0);
      fields.expression.focus(); fields.expression.select();
      return true;
    }

    return Object.freeze({
      closeRelationEndEditor,
      openRelationEndQuickEdit,
    });
  }

  return Object.freeze({ REQUIRED_FUNCTIONS, REQUIRED_VALUES, create });
});
