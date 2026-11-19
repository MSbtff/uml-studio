'use strict';

/* Project-wide ERD logical/physical name search and safe bulk replacement.
   The pure preview step validates every candidate before the controller takes
   one Undo snapshot and applies the prepared semantic-model changes. */
interface ErdNameColumnApi extends ValidationColumnApi {
  formatColumn: (column: ValidationColumn) => string;
}

interface ErdNameSchemaApi {
  foreignKeyColumnImpacts: (models: DiagramModels, entityId: string, name: string) => { relationModelId: string }[];
  renameColumnSchema: (entity: DiagramModel, before: string, after: string) => unknown;
  renameForeignKeyColumnReferences: (models: DiagramModels, entityId: string, before: string, after: string) => unknown;
}

type ErdNameToolsApi = ReturnType<typeof createErdNameToolsModule>;
declare var UMLErdNameTools: ErdNameToolsApi;

(function initErdNameTools(
  root: typeof globalThis & { UMLErdColumn?: ErdNameColumnApi; UMLErdSchema?: ErdNameSchemaApi; UMLErdNameTools?: ErdNameToolsApi },
  factory: (column?: ErdNameColumnApi | null, schema?: ErdNameSchemaApi | null) => ErdNameToolsApi,
) {
  const erdColumn = (root && root.UMLErdColumn)
    || (typeof require === 'function' ? require('../model/erd-column.js') : null);
  const erdSchema = (root && root.UMLErdSchema)
    || (typeof require === 'function' ? require('../model/erd-schema.js') : null);
  const api = factory(erdColumn, erdSchema);
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root) root.UMLErdNameTools = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, createErdNameToolsModule);

function createErdNameToolsModule(
  erdColumn?: ErdNameColumnApi | null,
  erdSchema?: ErdNameSchemaApi | null,
) {
  const { text: uiText } = globalThis.UMLLanguage
    ?? require('./language.js') as typeof UMLLanguage;

  if (!erdColumn || !(['formatColumn', 'parseColumn', 'validateColumn'] as const)
    .every(name => typeof erdColumn[name] === 'function')) {
    throw new TypeError('ERD Name Tools에는 UMLErdColumn 파서와 검증 API가 필요합니다.');
  }
  if (!erdSchema || !([
    'foreignKeyColumnImpacts',
    'renameColumnSchema',
    'renameForeignKeyColumnReferences',
  ] as const).every(name => typeof erdSchema[name] === 'function')) {
    throw new TypeError('ERD Name Tools에는 UMLErdSchema 이름 변경 API가 필요합니다.');
  }

  const { formatColumn, parseColumn, validateColumn } = erdColumn;
  const {
    foreignKeyColumnImpacts,
    renameColumnSchema,
    renameForeignKeyColumnReferences,
  } = erdSchema;
  const MAX_NAME_LENGTH = 120;
  const MAX_NAME_CHANGES = 5000;
  const SCOPES = Object.freeze(['both', 'physical', 'logical'] as const);
  const MATCH_MODES = Object.freeze(['contains', 'exact'] as const);
  const REQUIRED_FUNCTIONS = Object.freeze([
    'flashStatus',
    'renderAll',
    'rollbackLastSnapshot',
    'snapshot',
  ] as const);
  const REQUIRED_VALUES = Object.freeze(['document', 'modalFocus', 'state', 'triggerButton'] as const);

  interface NameOptions { query?: unknown; replacement?: unknown; scope?: string; matchMode?: string; caseSensitive?: boolean }
  type NameScope = typeof SCOPES[number];
  type NameField = Exclude<NameScope, 'both'>;
  interface NameBase { key: string; modelId: string; modelName: string; field: NameField; before: string }
  type NameEntry = NameBase & (
    { item: 'entity' } | { item: 'column'; columnIndex: number; columnPhysical: string }
  );
  type NameChange = NameEntry & { after: string };

  interface NamePreview {
    options: ReturnType<typeof normalizeOptions>;
    ready: boolean;
    changes: NameChange[];
    errors: string[];
    affectedDiagrams: { id: string; name: string }[];
    modelCount: number;
  }

  const normalizeText = (value: unknown) => String(value == null ? '' : value);
  const folded = (value: unknown) => normalizeText(value).toLocaleLowerCase();
  const escapeRegex = (value: string) => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

  function normalizeOptions(options?: NameOptions) {
    const source = options || {};
    return {
      query: normalizeText(source.query),
      replacement: normalizeText(source.replacement),
      scope: SCOPES.find(scope => scope === source.scope) ?? 'both',
      matchMode: MATCH_MODES.find(mode => mode === source.matchMode) ?? 'contains',
      caseSensitive: Boolean(source.caseSensitive),
    };
  }

  function replaceLiteral(value: unknown, options?: NameOptions) {
    const source = normalizeText(value);
    const opt = normalizeOptions(options);
    if (!opt.query) return source;
    if (opt.matchMode === 'exact') {
      const matches = opt.caseSensitive
        ? source === opt.query
        : folded(source) === folded(opt.query);
      return matches ? opt.replacement : source;
    }
    if (opt.caseSensitive) return source.split(opt.query).join(opt.replacement);
    return source.replace(new RegExp(escapeRegex(opt.query), 'giu'), opt.replacement);
  }

  function erdModels(models: DiagramModels) {
    return Object.values(models || {})
      .filter(model => model && model.kind === 'entity')
      .sort((left, right) => String(left.name || left.id).localeCompare(String(right.name || right.id)));
  }

  function buildErdNameEntries(models: DiagramModels) {
    const entries: NameEntry[] = [];
    erdModels(models).forEach(model => {
      entries.push({
        key: `${model.id}:entity:physical`,
        modelId: model.id,
        modelName: normalizeText(model.name) || '(unnamed)',
        item: 'entity',
        field: 'physical',
        before: normalizeText(model.name),
      });
      entries.push({
        key: `${model.id}:entity:logical`,
        modelId: model.id,
        modelName: normalizeText(model.name) || '(unnamed)',
        item: 'entity',
        field: 'logical',
        before: normalizeText(model.logicalName),
      });
      (Array.isArray(model.columns) ? model.columns : []).forEach((raw, columnIndex) => {
        const column = parseColumn(raw);
        entries.push({
          key: `${model.id}:column:${columnIndex}:physical`,
          modelId: model.id,
          modelName: normalizeText(model.name) || '(unnamed)',
          item: 'column',
          columnIndex,
          columnPhysical: column.phys,
          field: 'physical',
          before: column.phys,
        });
        entries.push({
          key: `${model.id}:column:${columnIndex}:logical`,
          modelId: model.id,
          modelName: normalizeText(model.name) || '(unnamed)',
          item: 'column',
          columnIndex,
          columnPhysical: column.phys,
          field: 'logical',
          before: column.logical,
        });
      });
    });
    return entries;
  }

  function selectedField(field: NameField, scope: NameScope) {
    return scope === 'both' || scope === field;
  }

  function validateEntityName(name: unknown, field: NameField) {
    const value = normalizeText(name).trim();
    if (field === 'physical' && !value) return uiText('An entity\'s physical name cannot be empty.', '엔터티 물리명은 비워둘 수 없습니다.');
    if (value.length > MAX_NAME_LENGTH) return uiText('Names must be at most {0} characters.', '이름은 {0}자 이하여야 합니다.', MAX_NAME_LENGTH);
    if (/\0|[\r\n]/.test(value)) return uiText('Names cannot contain control characters or line breaks.', '이름에 제어 문자나 줄바꿈을 사용할 수 없습니다.');
    return '';
  }

  function changedValue<T extends string | undefined>(changes: NameChange[], modelId: string, item: NameEntry['item'], field: NameField, fallback: T, columnIndex = -1): string | T {
    const change = changes.find(candidate => candidate.modelId === modelId
      && candidate.item === item
      && candidate.field === field
      && (candidate.item !== 'column' || candidate.columnIndex === columnIndex));
    return change ? change.after : fallback;
  }

  function validateChanges(models: DiagramModels, diagrams: EditorDiagram[], changes: NameChange[]) {
    const errors: string[] = [];
    const changedModels = new Set(changes.map(change => change.modelId));
    erdModels(models).filter(model => changedModels.has(model.id)).forEach(model => {
      const entityPhysical = changedValue(changes, model.id, 'entity', 'physical', model.name);
      const entityLogical = changedValue(changes, model.id, 'entity', 'logical', model.logicalName);
      const physicalError = validateEntityName(entityPhysical, 'physical');
      const logicalError = validateEntityName(entityLogical, 'logical');
      if (physicalError) errors.push(uiText('{0} · Physical name: {1}', '{0} · 물리명: {1}', model.name || model.id, physicalError));
      if (logicalError) errors.push(uiText('{0} · Logical name: {1}', '{0} · 논리명: {1}', model.name || model.id, logicalError));

      const originalColumns = Array.isArray(model.columns) ? model.columns : [];
      const finalColumns = originalColumns.map((raw, columnIndex) => {
        const column = parseColumn(raw);
        return formatColumn({
          ...column,
          phys: changedValue(changes, model.id, 'column', 'physical', column.phys, columnIndex),
          logical: changedValue(changes, model.id, 'column', 'logical', column.logical, columnIndex),
        });
      });
      finalColumns.forEach((raw, columnIndex) => {
        const validation = validateColumn(parseColumn(raw), finalColumns, columnIndex);
        if (!validation.valid) {
          errors.push(uiText('{0} · Column {1}: {2}', '{0} · 컬럼 {1}: {2}', model.name || model.id, columnIndex + 1, validation.error));
        }
      });
    });

    const changedPhysicalEntities = new Set(changes
      .filter(change => change.item === 'entity' && change.field === 'physical')
      .map(change => change.modelId));
    (Array.isArray(diagrams) ? diagrams : []).filter(diagram => diagram.type === 'erd').forEach(diagram => {
      const entityIds = [...new Set((diagram.elements || [])
        .map(view => view.modelId)
        .filter((modelId): modelId is string => Boolean(modelId && models?.[modelId]?.kind === 'entity')))];
      const names = new Map<string, string>();
      entityIds.forEach(modelId => {
        const model = models[modelId];
        const name = normalizeText(changedValue(changes, modelId, 'entity', 'physical', model.name)).trim();
        const key = folded(name);
        if (!key) return;
        const existingId = names.get(key);
        if (existingId && (changedPhysicalEntities.has(modelId) || changedPhysicalEntities.has(existingId))) {
          errors.push(uiText('{0} · Duplicate entity physical name: {1}', '{0} · 중복된 엔터티 물리명: {1}', diagram.name || 'ERD', name));
        } else names.set(key, modelId);
      });
    });
    return [...new Set(errors)];
  }

  function affectedDiagrams(diagrams: EditorDiagram[], changes: NameChange[]) {
    const changedModels = new Set(changes.map(change => change.modelId));
    return (Array.isArray(diagrams) ? diagrams : [])
      .filter(diagram => diagram.type === 'erd'
        && (diagram.elements || []).some(view => changedModels.has(view.modelId || '')))
      .map(diagram => ({ id: diagram.id, name: diagram.name || 'ERD' }));
  }

  function previewErdNameChanges(models: DiagramModels, diagrams: EditorDiagram[], options?: NameOptions): NamePreview {
    const opt = normalizeOptions(options);
    if (!opt.query) {
      return { options: opt, ready: false, changes: [], errors: [], affectedDiagrams: [], modelCount: 0 };
    }
    if (opt.query.length > MAX_NAME_LENGTH) {
      return {
        options: opt,
        ready: true,
        changes: [],
        errors: [uiText('The search term must be at most {0} characters.', '찾을 이름은 {0}자 이하여야 합니다.', MAX_NAME_LENGTH)],
        affectedDiagrams: [],
        modelCount: 0,
      };
    }
    const changes = buildErdNameEntries(models)
      .filter(entry => selectedField(entry.field, opt.scope) && entry.before)
      .map(entry => ({ ...entry, after: replaceLiteral(entry.before, opt) }))
      .filter(entry => entry.after !== entry.before);
    const errors: string[] = [];
    if (changes.length > MAX_NAME_CHANGES) {
      errors.push(uiText('You can rename up to {0} items at a time.', '한 번에 변경할 수 있는 이름은 {0}개입니다.', MAX_NAME_CHANGES));
    } else errors.push(...validateChanges(models, diagrams, changes));
    return {
      options: opt,
      ready: true,
      changes,
      errors,
      affectedDiagrams: affectedDiagrams(diagrams, changes),
      modelCount: new Set(changes.map(change => change.modelId)).size,
    };
  }

  function assertFreshChange(model: DiagramModel, columns: ValidationColumn[], change: NameChange) {
    const current = change.item === 'entity'
      ? normalizeText(change.field === 'physical' ? model.name : model.logicalName)
      : normalizeText(change.field === 'physical'
        ? columns[change.columnIndex]?.phys
        : columns[change.columnIndex]?.logical);
    if (current !== change.before) throw new Error(uiText(
      'ERD names changed since the preview. Try again.',
      '미리보기 이후 ERD 이름이 변경되었습니다. 다시 시도하세요.',
    ));
  }

  function temporaryColumnName(usedNames: Set<string>, modelIndex: number, columnIndex: number) {
    let suffix = 0;
    let value;
    do {
      value = `__uml_name_${modelIndex}_${columnIndex}_${suffix++}__`;
    } while (usedNames.has(folded(value)));
    usedNames.add(folded(value));
    return value;
  }

  function applyErdNameChanges(models: DiagramModels, preview?: NamePreview | null) {
    if (!preview || !Array.isArray(preview.changes) || preview.errors?.length) {
      throw new Error(uiText('A validated ERD rename preview is required.', '검증을 통과한 ERD 이름 변경 미리보기가 필요합니다.'));
    }
    const grouped = new Map<string, NameChange[]>();
    preview.changes.forEach(change => {
      const group = grouped.get(change.modelId);
      if (group) group.push(change);
      else grouped.set(change.modelId, [change]);
    });
    const impactedRelations = new Set<string>();
    let renamedColumns = 0;
    let renamedEntities = 0;
    let modelIndex = 0;

    grouped.forEach((changes, modelId) => {
      const model = models?.[modelId];
      if (!model || model.kind !== 'entity') throw new Error(uiText('ERD model not found: {0}', 'ERD 모델을 찾을 수 없습니다: {0}', modelId));
      const originalColumns = (Array.isArray(model.columns) ? model.columns : []).map(parseColumn);
      changes.forEach(change => assertFreshChange(model, originalColumns, change));

      const physicalChanges = changes.filter((change): change is NameChange & { item: 'column' } =>
        change.item === 'column' && change.field === 'physical');
      const usedNames = new Set(originalColumns.map(column => folded(column.phys)));
      changes.filter(change => change.item === 'column').forEach(change => usedNames.add(folded(change.after)));
      const pending = physicalChanges.map(change => {
        foreignKeyColumnImpacts(models, modelId, change.before)
          .forEach(impact => impactedRelations.add(impact.relationModelId));
        const temporary = temporaryColumnName(usedNames, modelIndex, change.columnIndex);
        renameColumnSchema(model, change.before, temporary);
        renameForeignKeyColumnReferences(models, modelId, change.before, temporary);
        return { temporary, after: change.after };
      });
      pending.forEach(({ temporary, after }) => {
        renameColumnSchema(model, temporary, after);
        renameForeignKeyColumnReferences(models, modelId, temporary, after);
        renamedColumns++;
      });

      if (changes.some(change => change.item === 'column')) {
        model.columns = originalColumns.map((column, columnIndex) => formatColumn({
          ...column,
          phys: changedValue(changes, modelId, 'column', 'physical', column.phys, columnIndex),
          logical: changedValue(changes, modelId, 'column', 'logical', column.logical, columnIndex),
        }));
      }
      changes.filter(change => change.item === 'entity').forEach(change => {
        if (change.field === 'physical') model.name = change.after.trim();
        else model.logicalName = change.after.trim();
        renamedEntities++;
      });
      modelIndex++;
    });
    return {
      changes: preview.changes.length,
      entities: renamedEntities,
      columns: renamedColumns,
      relations: impactedRelations.size,
    };
  }

  interface ErdNameDependencies {
    flashStatus: (message: string) => void;
    renderAll: () => void;
    rollbackLastSnapshot: () => void;
    snapshot: () => void;
    document: Document;
    modalFocus: {
      activate: (settings: { overlay: HTMLElement; dialog: HTMLElement; opener: HTMLElement; initialFocus: HTMLElement }) => ErdNameModal;
      closeOverlay: (overlay: HTMLElement, options: { restoreFocus: boolean }) => boolean;
    };
    state: { models: DiagramModels; diagrams: EditorDiagram[] };
    triggerButton: HTMLElement;
  }

  interface ErdNameModal {
    close: (options?: { restoreFocus?: boolean }) => boolean;
    requestClose: (reason: string) => void;
    focusInitial: (node: HTMLElement) => void;
  }

  function create(dependencies?: ErdNameDependencies) {
    const deps: Partial<ErdNameDependencies> = dependencies || {};
    const missing: string[] = REQUIRED_FUNCTIONS.filter(name => typeof deps[name] !== 'function');
    REQUIRED_VALUES.forEach(name => {
      if (deps[name] == null) missing.push(name);
    });
    if (deps.document && typeof deps.document.createElement !== 'function') missing.push('document.createElement');
    if (deps.triggerButton && typeof deps.triggerButton.addEventListener !== 'function') {
      missing.push('triggerButton.addEventListener');
    }
    if (deps.modalFocus) {
      (['activate', 'closeOverlay'] as const).forEach(name => {
        if (typeof deps.modalFocus?.[name] !== 'function') missing.push(`modalFocus.${name}`);
      });
    }
    if (missing.length) {
      throw new TypeError(`ERD Name Tools 의존성이 없습니다: ${[...new Set(missing)].join(', ')}`);
    }

    const {
      flashStatus,
      renderAll,
      rollbackLastSnapshot,
      snapshot,
      document,
      modalFocus,
      state,
      triggerButton,
    } = deps as ErdNameDependencies;
    const MODAL_ID = 'erd-name-tools-modal';

    let activeModal: ErdNameModal | null = null;

    function close(restoreFocus = true) {
      const overlay = document.getElementById(MODAL_ID);
      if (!overlay) { activeModal = null; return false; }
      const closed = activeModal?.close({ restoreFocus })
        || modalFocus.closeOverlay(overlay, { restoreFocus });
      activeModal = null;
      return closed;
    }

    function option(value: string, label: string) {
      const node = document.createElement('option');
      node.value = value; node.textContent = label;
      return node;
    }

    function field(labelText: string, control: HTMLElement) {
      const label = document.createElement('label');
      label.className = 'erd-name-tools-field';
      const text = document.createElement('span'); text.textContent = labelText;
      label.append(text, control);
      return label;
    }

    function open() {
      close(false);
      const overlay = document.createElement('div');
      overlay.id = MODAL_ID; overlay.className = 'modal-overlay';
      const dialog = document.createElement('div');
      dialog.className = 'erd-name-tools-dialog';
      dialog.setAttribute('role', 'dialog');
      dialog.setAttribute('aria-modal', 'true');
      const titleId = 'erd-name-tools-title';
      dialog.setAttribute('aria-labelledby', titleId);

      const header = document.createElement('div'); header.className = 'project-dialog-header';
      const title = document.createElement('strong'); title.id = titleId; title.textContent = uiText('Rename ERD Names', 'ERD 이름 일괄 변환');
      const closeButton = document.createElement('button');
      closeButton.type = 'button'; closeButton.className = 'modal-close'; closeButton.textContent = '×';
      closeButton.title = uiText('Close', '닫기'); closeButton.setAttribute('aria-label', uiText('Close Rename ERD Names', 'ERD 이름 일괄 변환 닫기'));
      header.append(title, closeButton);

      const hint = document.createElement('p'); hint.className = 'erd-name-tools-hint';
      hint.textContent = uiText(
        'Preview and validate changes across the project. Undo reverses the entire rename in one step.',
        '프로젝트 전체의 엔터티와 컬럼을 미리 검증한 뒤 한 번의 Undo 작업으로 변경합니다.',
      );
      const controls = document.createElement('div'); controls.className = 'erd-name-tools-controls';
      const scope = document.createElement('select'); scope.setAttribute('aria-label', uiText('Rename Target', '변환 대상'));
      scope.append(option('both', uiText('Logical and Physical Names', '논리명 + 물리명')), option('logical', uiText('Logical Names Only', '논리명만')), option('physical', uiText('Physical Names Only', '물리명만')));
      const query = document.createElement('input');
      query.type = 'search'; query.maxLength = MAX_NAME_LENGTH; query.setAttribute('aria-label', uiText('Find Name', '찾을 이름'));
      const replacement = document.createElement('input');
      replacement.type = 'text'; replacement.maxLength = MAX_NAME_LENGTH; replacement.setAttribute('aria-label', uiText(
        'Replace With',
        '바꿀 이름',
      ));
      const matchMode = document.createElement('select'); matchMode.setAttribute('aria-label', uiText('Match', '일치 방식'));
      matchMode.append(option('contains', uiText('Contains', '포함된 문자열')), option('exact', uiText('Exact Name', '전체 이름 일치')));
      controls.append(
        field(uiText('Rename Target', '변환 대상'), scope),
        field(uiText('Find Name', '찾을 이름'), query),
        field(uiText('Replace With', '바꿀 이름'), replacement),
        field(uiText('Match', '일치 방식'), matchMode),
      );
      const caseLabel = document.createElement('label'); caseLabel.className = 'erd-name-tools-case';
      const caseSensitive = document.createElement('input'); caseSensitive.type = 'checkbox';
      caseSensitive.setAttribute('aria-label', uiText('Case Sensitive', '대소문자 구분'));
      caseLabel.append(caseSensitive, document.createTextNode(uiText(' Case sensitive', ' 대소문자 구분')));

      const summary = document.createElement('div'); summary.className = 'erd-name-tools-summary';
      summary.setAttribute('aria-live', 'polite');
      const results = document.createElement('div'); results.className = 'erd-name-tools-results';
      const footer = document.createElement('div'); footer.className = 'project-dialog-footer';
      const cancel = document.createElement('button'); cancel.type = 'button'; cancel.className = 'project-action'; cancel.textContent = uiText(
        'Cancel',
        '취소',
      );
      const apply = document.createElement('button');
      apply.type = 'button'; apply.className = 'project-action project-primary'; apply.textContent = uiText('Apply Rename', '변환 적용'); apply.disabled = true;
      footer.append(cancel, apply);
      dialog.append(header, hint, controls, caseLabel, summary, results, footer);
      overlay.appendChild(dialog); document.body.appendChild(overlay);
      const modal = modalFocus.activate({ overlay, dialog, opener: triggerButton, initialFocus: query });
      activeModal = modal;

      const currentOptions = () => ({
        query: query.value,
        replacement: replacement.value,
        scope: scope.value,
        matchMode: matchMode.value,
        caseSensitive: caseSensitive.checked,
      });
      const renderPreview = () => {
        const preview = previewErdNameChanges(state.models, state.diagrams, currentOptions());
        results.textContent = '';
        if (!preview.ready) {
          summary.textContent = uiText('Enter a search term to preview matches.', '찾을 이름을 입력하면 변경 후보를 보여줍니다.');
        } else if (preview.errors.length) {
          summary.textContent = uiText('Cannot rename · Issues: {0}', '변경할 수 없습니다 · {0}개 문제', preview.errors.length);
          preview.errors.slice(0, 20).forEach(message => {
            const error = document.createElement('div'); error.className = 'erd-name-tools-error'; error.textContent = message;
            results.appendChild(error);
          });
        } else if (!preview.changes.length) {
          summary.textContent = uiText('No matching names.', '일치하는 이름이 없습니다.');
        } else {
          summary.textContent = uiText(
            'Matches: {0} · Models: {1} · Diagrams: {2}',
            '변경 후보 {0}개 · 모델 {1}개 · 다이어그램 {2}개',
            preview.changes.length,
            preview.modelCount,
            preview.affectedDiagrams.length,
          );
          preview.changes.slice(0, 100).forEach(change => {
            const row = document.createElement('div'); row.className = 'erd-name-tools-row';
            const context = document.createElement('span'); context.className = 'erd-name-tools-context';
            context.textContent = change.item === 'entity'
              ? uiText(
                '{0} · Entity {1}',
                '{0} · 엔터티 {1}',
                change.modelName,
                change.field === 'physical' ? uiText('Physical Name', '물리명') : uiText('Logical Name', '논리명'),
              )
              : `${change.modelName} · ${change.columnPhysical || uiText('Column {0}', '컬럼 {0}', change.columnIndex + 1)} ${change.field === 'physical' ? uiText(
                'Physical Name',
                '물리명',
              ) : uiText(
                'Logical Name',
                '논리명',
              )}`;
            const names = document.createElement('span'); names.className = 'erd-name-tools-change';
            names.textContent = `${change.before || uiText('(empty)', '(비어 있음)')} → ${change.after || uiText('(clear)', '(비움)')}`;
            row.append(context, names); results.appendChild(row);
          });
          if (preview.changes.length > 100) {
            const more = document.createElement('div'); more.className = 'erd-name-tools-more';
            more.textContent = uiText('and {0} more', '외 {0}개', preview.changes.length - 100);
            results.appendChild(more);
          }
        }
        apply.disabled = !preview.changes.length || Boolean(preview.errors.length);
        return preview;
      };

      [query, replacement].forEach(control => control.addEventListener('input', renderPreview));
      [scope, matchMode, caseSensitive].forEach(control => control.addEventListener('change', renderPreview));
      closeButton.addEventListener('click', () => modal.requestClose('close-button'));
      cancel.addEventListener('click', () => modal.close());
      overlay.addEventListener('mousedown', event => {
        if (event.target === overlay) modal.requestClose('backdrop');
      });
      apply.addEventListener('click', () => {
        const preview = renderPreview();
        if (!preview.changes.length || preview.errors.length) return;
        snapshot();
        try {
          const result = applyErdNameChanges(state.models, preview);
          renderAll();
          const relationNote = result.relations ? uiText(' · Updated foreign key relationships: {0}', ' · FK 관계 {0}개 갱신', result.relations) : '';
          flashStatus(uiText('Renamed {0} ERD names{1}', 'ERD 이름 {0}개를 일괄 변환했습니다{1}', result.changes, relationNote));
          modal.close();
        } catch (error) {
          rollbackLastSnapshot();
          flashStatus(uiText('Could not rename ERD names · {0}', 'ERD 이름 변환 실패 · {0}', error instanceof Error ? error.message : String(error)));
        }
      });
      renderPreview(); modal.focusInitial(query);
      return overlay;
    }

    let attached = false;
    function attach() {
      if (attached) return;
      triggerButton.addEventListener('click', open);
      attached = true;
    }
    function detach() {
      if (!attached) return;
      triggerButton.removeEventListener('click', open);
      close(false);
      attached = false;
    }

    return Object.freeze({ attach, close, detach, open });
  }

  return Object.freeze({
    MATCH_MODES,
    MAX_NAME_CHANGES,
    REQUIRED_FUNCTIONS,
    REQUIRED_VALUES,
    SCOPES,
    applyErdNameChanges,
    buildErdNameEntries,
    create,
    previewErdNameChanges,
    replaceLiteral,
  });
}
