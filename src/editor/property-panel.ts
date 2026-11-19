'use strict';

type PropertySelection = Pick<CanvasSelectionState, 'selection' | 'selectedId'>;
type PropertyPanelState = PropertySelection & { diagrams: EditorDiagram[]; models: DiagramModels };
type PropertyPanelDependencies = Omit<NonNullable<Parameters<ErdPropertySectionsApi['create']>[0]>,
  'propRow' | 'sectionHeading' | 'renderProps' | 'parseColumn' | 'byId'> & {
  byId(id?: string | null): DiagramElement | null | undefined;
  dg(): EditorDiagram;
  referencedInteraction(element: DiagramElement): EditorDiagram | null;
  relById(id?: string | null): DiagramRelation | null | undefined;
  instanceClassifier(element: DiagramElement): DiagramModel | null | undefined;
  isInteractionMsg(kind: string): boolean;
  parseColumn(raw: string): ErdColumnValue;
  childViews(id: string): DiagramElement[];
  syncConstraintParameters(element: DiagramElement): void;
  unlockBindingRoute(relation: DiagramRelation): void;
  bindingRoute: RelationRendererDependencies['bindingRoute'];
  bindingWaypoints(relation: DiagramRelation): DiagramPoint[];
  relationEndExpression(relation: DiagramRelation, end: RelationEnd): string;
  parseQuickEditExpression(kind: 'name', value: string): AnyParsedExpression | InvalidExpression;
  erdRelationCardinality(relation: DiagramRelation, end: RelationEnd): string;
  relationEndNavigability: RelationRendererDependencies['relationEndNavigability'];
  relationEndAggregation: RelationRendererDependencies['relationEndAggregation'];
  openRelationEndQuickEdit: ReturnType<QuickEditApi['create']>['openRelationEndQuickEdit'];
  switchDiagram(id: string): void;
  parseIconScript: IconScriptApi['parseIconScript'];
  descendantViews(id: string): DiagramElement[];
  constraintPropertyEquations(element: DiagramElement): string[];
  defaultValueUnitCompatibility(value: unknown, type: DiagramModel | null | undefined): { status: string; message: string };
  diagramKindLabel(kind: string): string;
  bindingTypeCompatibility(from: string | undefined, to: string | undefined, models: DiagramModels): { status: string; message: string };
  lockBindingRoute(relation: DiagramRelation): void;
  bindingConnectorStackInfo(relation: DiagramRelation): { index: number; total: number };
  reorderBindingConnector(relation: DiagramRelation, action: BindingStackAction): void;
  addBindingWaypoint(relation: DiagramRelation, point: DiagramPoint, segmentIndex?: number): void;
  isCommMsg(kind: string): boolean;
  relationSupportsEndQuickEdit: RelationRendererDependencies['relationSupportsEndQuickEdit'];
  erdPropertySections: ErdPropertySectionsApi;
  state: PropertyPanelState;
  PACKAGE_CONTAINER_KINDS: ReadonlySet<string>;
  ACTIVITY_PIN_KINDS: ReadonlySet<string>;
  AUTO_LABEL: Partial<Record<string, string>>;
  INFORMATION_FLOW_CONVEYED_KINDS: ReadonlySet<string>;
  ER_RELATION_KINDS: ReadonlySet<string>;
  VISIBILITY_VALUE: Partial<Record<string, string>>;
  ERD_CARDINALITY_OPTIONS: readonly (readonly [string, string])[];
  ASSOCIATION_QUALIFIER_KINDS: ReadonlySet<string>;
  REQUIREMENT_TYPES: readonly string[];
  BDD_CLASSIFIER_KINDS: ReadonlySet<string>;
  ACTIVITY_CONTAINER_KINDS: ReadonlySet<string>;
  INSTANCE_KINDS: ReadonlySet<string>;
  INSTANCE_CLASSIFIER_KINDS: Partial<Record<string, readonly string[]>>;
  REQUIREMENT_RELATION_KINDS: ReadonlySet<string>;
  GRID?: number;
  FILL_DEFAULT?: string;
};
const compatibilityColors: Partial<Record<string, string>> = {
  compatible: '#25713f',
  warning: '#9a6700',
  error: '#b42318',
};

type BindingStackAction = 'backward' | 'forward' | 'back' | 'front';
type StringListField = { [K in keyof ModelFields]-?: ModelFields[K] extends string[] | undefined ? K : never }[keyof ModelFields];
type ModelReferenceField = 'providedInterfaceModelId' | 'requiredInterfaceModelId' | 'collaborationModelId';
type EndSelectField = `${RelationEnd}${'Navigability' | 'Aggregation'}`;
type PropertyControl = HTMLElement & Partial<Pick<HTMLInputElement, 'selectionStart' | 'selectionEnd' | 'setSelectionRange'>>;

type PropertyPanelApi = ReturnType<typeof createPropertyPanelModule>;
declare var UMLPropertyPanel: PropertyPanelApi;

(function initPropertyPanel(root: typeof globalThis, factory: () => PropertyPanelApi) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root) root.UMLPropertyPanel = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, createPropertyPanelModule);

function createPropertyPanelModule() {
  const { label: uiLabel, text: uiText } = globalThis.UMLLanguage
    ?? require('./language.js') as typeof UMLLanguage;

  const REQUIRED_FUNCTIONS = Object.freeze([
  "snapshot",
  "render",
  "byId",
  "dg",
  "openErdColumnEditor",
  "flashStatus",
  "ensureMemberArray",
  "moveErdColumn",
  "referencedInteraction",
  "relById",
  "instanceClassifier",
  "isInteractionMsg",
  "erdMode",
  "parseColumn",
  "childViews",
  "syncConstraintParameters",
  "unlockBindingRoute",
  "bindingRoute",
  "bindingWaypoints",
  "setErdMode",
  "pasteErdColumn",
  "replaceErdColumns",
  "moveErdColumnTo",
  "copyErdColumn",
  "deleteErdColumn",
  "relationEndExpression",
  "parseQuickEditExpression",
  "erdRelationCardinality",
  "relationEndNavigability",
  "relationEndAggregation",
  "openRelationEndQuickEdit",
  "switchDiagram",
  "parseIconScript",
  "descendantViews",
  "constraintPropertyEquations",
  "defaultValueUnitCompatibility",
  "normalizeErdChecks",
  "normalizeErdIndexes",
  "safeSqlFragment",
  "diagramKindLabel",
  "bindingTypeCompatibility",
  "lockBindingRoute",
  "bindingConnectorStackInfo",
  "reorderBindingConnector",
  "addBindingWaypoint",
  "isCommMsg",
  "relationSupportsEndQuickEdit",
  "getErdColumnClipboard"
] as const);
  const REQUIRED_VALUES = Object.freeze([
  "document",
  "erdPropertySections",
  "state",
  "PACKAGE_CONTAINER_KINDS",
  "ACTIVITY_PIN_KINDS",
  "AUTO_LABEL",
  "INFORMATION_FLOW_CONVEYED_KINDS",
  "ERD_VIEW_MODES",
  "ER_RELATION_KINDS",
  "VISIBILITY_VALUE",
  "ERD_CARDINALITY_OPTIONS",
  "ERD_REFERENTIAL_ACTION_OPTIONS",
  "ASSOCIATION_QUALIFIER_KINDS",
  "REQUIREMENT_TYPES",
  "BDD_CLASSIFIER_KINDS",
  "ACTIVITY_CONTAINER_KINDS",
  "INSTANCE_KINDS",
  "INSTANCE_CLASSIFIER_KINDS",
  "REQUIREMENT_RELATION_KINDS"
] as const);

  function selectionMode(panelState?: Partial<PropertySelection> | null) {
    if ((panelState?.selection || []).length > 1) return 'multiple';
    return panelState?.selectedId ? 'selected' : 'empty';
  }

  function create(dependencies?: PropertyPanelDependencies) {
    const provided: Partial<PropertyPanelDependencies> = dependencies || {};
    const missing: string[] = REQUIRED_FUNCTIONS.filter(name => typeof provided[name] !== 'function');
    REQUIRED_VALUES.forEach(name => {
      if (provided[name] == null) missing.push(name);
    });
    if (typeof provided.erdPropertySections?.create !== 'function') {
      missing.push('erdPropertySections.create');
    }
    if (missing.length) {
      throw new TypeError(`속성 패널 의존성이 없습니다: ${missing.join(', ')}`);
    }

    /* names this panel only forwards to erdPropertySections stay in the REQUIRED
       lists above — app.js provides by declared name — but are not destructured */
    const deps = provided as PropertyPanelDependencies;
    const {
      snapshot,
      render,
      byId,
      dg,
      flashStatus,
      referencedInteraction,
      relById,
      instanceClassifier,
      isInteractionMsg,
      parseColumn,
      childViews,
      syncConstraintParameters,
      unlockBindingRoute,
      bindingRoute,
      bindingWaypoints,
      relationEndExpression,
      parseQuickEditExpression,
      erdRelationCardinality,
      relationEndNavigability,
      relationEndAggregation,
      openRelationEndQuickEdit,
      switchDiagram,
      parseIconScript,
      descendantViews,
      constraintPropertyEquations,
      defaultValueUnitCompatibility,
      diagramKindLabel,
      bindingTypeCompatibility,
      lockBindingRoute,
      bindingConnectorStackInfo,
      reorderBindingConnector,
      addBindingWaypoint,
      isCommMsg,
      relationSupportsEndQuickEdit,
      document,
      erdPropertySections,
      state,
      PACKAGE_CONTAINER_KINDS,
      ACTIVITY_PIN_KINDS,
      AUTO_LABEL,
      INFORMATION_FLOW_CONVEYED_KINDS,
      ER_RELATION_KINDS,
      VISIBILITY_VALUE,
      ERD_CARDINALITY_OPTIONS,
      ASSOCIATION_QUALIFIER_KINDS,
      REQUIREMENT_TYPES,
      BDD_CLASSIFIER_KINDS,
      ACTIVITY_CONTAINER_KINDS,
      INSTANCE_KINDS,
      INSTANCE_CLASSIFIER_KINDS,
      REQUIREMENT_RELATION_KINDS,
    } = deps;
    const GRID = typeof deps.GRID === 'number' && Number.isFinite(deps.GRID) ? deps.GRID : 8;
    const FILL_DEFAULT = deps.FILL_DEFAULT || '#fffbd8';

    const PROPERTY_CONTROL_SELECTOR = 'input, select, textarea, button, [tabindex]:not([tabindex="-1"])';
    function propertyControls(box: HTMLElement) {
      return [...box.querySelectorAll<PropertyControl>(PROPERTY_CONTROL_SELECTOR)];
    }

    /* the panel is rebuilt whole whenever a control changes the model, so the
       control the user was on has to be found again by its place in the rebuilt
       panel — the same selection always produces the same order */
    function selectionFingerprint() {
      return `${state.selectedId || ''}|${(state.selection || []).join(',')}`;
    }
    function capturePropertyFocus(box: HTMLElement) {
      const active = document.activeElement as PropertyControl | null;
      if (!active || box.contains?.(active) !== true) return null;
      const index = propertyControls(box).indexOf(active);
      if (index < 0) return null;
      return {
        index,
        fingerprint: selectionFingerprint(),
        start: typeof active.selectionStart === 'number' ? active.selectionStart : null,
        end: typeof active.selectionEnd === 'number' ? active.selectionEnd : null,
      };
    }
    function restorePropertyFocus(box: HTMLElement, captured: ReturnType<typeof capturePropertyFocus>) {
      if (!captured || captured.fingerprint !== selectionFingerprint()) return false;
      const target = propertyControls(box)[captured.index];
      if (typeof target?.focus !== 'function') return false;
      target.focus();
      if (captured.start === null || typeof target.setSelectionRange !== 'function') return true;
      try {
        target.setSelectionRange(captured.start, captured.end ?? captured.start);
      } catch {
        /* 캐럿을 지원하지 않는 입력 형식 */
      }
      return true;
    }

    let fieldSequence = 0;
    function sectionHeading(text: string) {
      const title = document.createElement('strong');
      title.textContent = text;
      title.id = `uml-property-section-${++fieldSequence}`;
      title.setAttribute('role', 'heading');
      title.setAttribute('aria-level', '3');
      return title;
    }
    function propRow(labelText: string, node: HTMLElement, hint?: string) {
      const row = document.createElement('div');
      row.className = 'prop-row';
      const l = document.createElement('label');
      l.textContent = labelText;
      const tagName = String(node?.tagName || '').toUpperCase();
      if (['INPUT', 'SELECT', 'TEXTAREA'].includes(tagName)) {
        if (!node.id) node.id = `uml-property-field-${++fieldSequence}`;
        l.htmlFor = node.id;
      }
      row.appendChild(l); row.appendChild(node);
      if (hint) {
        const h = document.createElement('div');
        h.className = 'prop-hint'; h.textContent = hint;
        row.appendChild(h);
      }
      return row;
    }
    function textInput(value: string | undefined, oninput: (value: string) => void) {
      const i = document.createElement('input');
      i.type = 'text'; i.value = value || '';
      i.addEventListener('focus', () => snapshot());
      i.addEventListener('input', () => { oninput(i.value); render(); });
      return i;
    }
    function textArea(value: string | undefined, oninput: (value: string) => void) {
      const t = document.createElement('textarea');
      t.value = value || '';
      t.addEventListener('focus', () => snapshot());
      t.addEventListener('input', () => { oninput(t.value); render(); });
      return t;
    }
    
    /* ER-only property blocks live in their own module. It needs this panel's
       own row/heading primitives, so it is created here and not wired from
       app.js; everything else it declares arrives through the forwarded deps. */
    const {
      erdColumnsProperty,
      erdDisplayModeProperty,
      erdForeignKeyProperty,
      erdSchemaProperty,
    } = erdPropertySections.create({ ...deps, propRow, sectionHeading, renderProps });

    /* source and target repeat the same field labels, so each end needs its own
       named group for the labels to mean anything out of context */
    function relationEndPropertySection(outerBox: HTMLElement, r: DiagramRelation, end: RelationEnd) {
      const prefix = end === 'source' ? 'source' : 'target';
      const erd = ER_RELATION_KINDS.has(r.kind);
      const endpoint = byId(end === 'source' ? r.from : r.to);
      const box = document.createElement('section');
      box.className = 'relation-end-prop-group';
      box.setAttribute('role', 'group');
      outerBox.appendChild(box);
      const title = document.createElement('div');
      title.className = 'relation-end-prop-title';
      title.id = `uml-relation-end-${end}-${++fieldSequence}`;
      title.setAttribute('role', 'heading');
      title.setAttribute('aria-level', '3');
      title.textContent = erd
        ? uiText(
          '{0} · {1}',
          '{0} · {1} 참여 조건',
          end === 'source' ? uiText('Source', '출발') : uiText('Target', '도착'),
          endpoint?.name || uiText('Entity', '엔티티'),
        )
        : end === 'source' ? uiLabel('Source End', '출발점') : uiLabel('Target End', '도착점');
      title.dataset.relationEnd = end;
      box.setAttribute('aria-labelledby', title.id);
      box.appendChild(title);
    
      const expression = document.createElement('input');
      expression.type = 'text';
      expression.value = erd ? (r[`${prefix}EndName`] || '') : relationEndExpression(r, end);
      expression.addEventListener('focus', () => snapshot());
      expression.addEventListener('input', () => {
        const value = expression.value.trim();
        expression.setCustomValidity('');
        if (erd) {
          r[`${prefix}EndName`] = value;
        } else if (!value) {
          r[`${prefix}EndName`] = '';
          r[`${prefix}EndStereotype`] = undefined;
          r[`${prefix}EndVisibility`] = undefined;
        } else {
          const parsed = parseQuickEditExpression('name', value);
          if (!parsed.valid) {
            expression.setCustomValidity(parsed.error || uiText('Invalid name expression.', '이름 표현식이 올바르지 않습니다.'));
            return;
          }
          r[`${prefix}EndName`] = parsed.name;
          r[`${prefix}EndStereotype`] = parsed.stereotype || undefined;
          r[`${prefix}EndVisibility`] = parsed.visibility ? VISIBILITY_VALUE[parsed.visibility] : undefined;
        }
        render();
      });
      box.appendChild(propRow(erd ? uiLabel('End Name', '끝점 이름') : uiLabel('Name Expression', '이름 표현식'), expression,
        erd ? uiText('Role at this end of the relationship.', '관계 끝점 역할 이름') : uiText('Example: «role» + owner', '예: «role» + owner')));
    
      const multiplicityField = prefix === 'source' ? 'sourceLabel' : 'targetLabel';
      if (erd) {
        const cardinality = document.createElement('select');
        cardinality.className = 'erd-cardinality-select';
        ERD_CARDINALITY_OPTIONS.forEach(([value, label]) => {
          const option = document.createElement('option');
          option.value = value; option.textContent = label;
          option.selected = value === erdRelationCardinality(r, end);
          cardinality.appendChild(option);
        });
        cardinality.addEventListener('change', () => {
          snapshot(); r[multiplicityField] = cardinality.value; render(); renderProps();
          flashStatus(uiText(
            'Changed the {0} entity cardinality to {1}.',
            '{0} 엔티티 참여 조건을 {1}(으)로 변경했습니다',
            end === 'source' ? uiText('Source', '출발') : uiText('Target', '도착'),
            cardinality.value,
          ));
        });
        box.appendChild(propRow(uiText('Cardinality', '참여 개수'), cardinality,
          uiText(
            '0..1 zero or one · 1 exactly one · 0..N zero or more · 1..N one or more',
            '0..1 선택 한 개 · 1 필수 한 개 · 0..N 선택 여러 개 · 1..N 필수 여러 개',
          )));

        const columnField = `${prefix}ColumnName` as const;
        const columnSelect = document.createElement('select');
        columnSelect.className = 'erd-relation-column-select';
        columnSelect.dataset.relationColumnEnd = end;
        const none = document.createElement('option');
        none.value = ''; none.textContent = uiText('(No column selected)', '(컬럼 선택 안 함)');
        columnSelect.appendChild(none);
        const selectedColumn = String(r[columnField] || '');
        const availableColumns = new Set();
        const rawColumns = Array.isArray(endpoint?.columns) ? endpoint.columns : [];
        rawColumns.forEach(raw => {
          const column = parseColumn(raw);
          const physicalName = String(column.phys || '').trim();
          if (!physicalName) return;
          availableColumns.add(physicalName.toLocaleLowerCase());
          const option = document.createElement('option');
          option.value = physicalName;
          option.textContent = [
            physicalName,
            column.logical ? `· ${column.logical}` : '',
            column.type ? `: ${column.type}` : '',
            Array.isArray(column.flags) && column.flags.length ? `[${column.flags.join(', ')}]` : '',
          ].filter(Boolean).join(' ');
          option.selected = physicalName.toLocaleLowerCase() === selectedColumn.toLocaleLowerCase();
          columnSelect.appendChild(option);
        });
        if (selectedColumn && !availableColumns.has(selectedColumn.toLocaleLowerCase())) {
          const missing = document.createElement('option');
          missing.value = selectedColumn;
          missing.textContent = uiText('⚠ Missing column · {0}', '⚠ 존재하지 않는 컬럼 · {0}', selectedColumn);
          missing.selected = true;
          columnSelect.appendChild(missing);
        }
        columnSelect.value = selectedColumn;
        columnSelect.addEventListener('change', () => {
          snapshot(); r[columnField] = columnSelect.value; render(); renderProps();
          flashStatus(uiText(
            'Updated the linked column at the {0} end: {1}',
            '{0} 엔티티의 관계 컬럼을 {1}했습니다',
            end === 'source' ? uiText('Source', '출발') : uiText('Target', '도착'),
            columnSelect.value || uiText('cleared', '선택 해제'),
          ));
        });
        box.appendChild(propRow(uiText('Linked Column', '연결 컬럼'), columnSelect,
          uiText('A warning appears if the linked column is renamed or deleted.', '컬럼 이름 변경·삭제로 연결이 끊기면 경고가 표시됩니다.')));
      } else {
        box.appendChild(propRow(uiLabel('Multiplicity', '다중성'),
          textInput(r[multiplicityField], value => { r[multiplicityField] = value; }),
          uiText('Example: 1, *, 0..1, 0..*', '예: 1, *, 0..1, 0..*')));
      }
    
      const addSelect = (label: string, field: EndSelectField, value: string, choices: readonly (readonly [string, string])[], hint: string) => {
        const node = document.createElement('select');
        choices.forEach(([optionValue, optionLabel]) => {
          const option = document.createElement('option');
          option.value = optionValue; option.textContent = optionLabel;
          option.selected = optionValue === value;
          node.appendChild(option);
        });
        node.addEventListener('change', () => {
          snapshot(); r[field] = node.value; render(); renderProps();
        });
        box.appendChild(propRow(label, node, hint));
      };
      if (!erd) {
        addSelect(uiLabel('Navigability', '탐색 가능성'), `${prefix}Navigability`, relationEndNavigability(r, end), [
          ['unspecified', uiLabel('Unspecified', '미지정')], ['navigable', uiLabel('Navigable', '탐색 가능')], ['notNavigable', uiLabel('Not Navigable', '탐색 불가')],
        ], uiText('Arrows and crosses show navigability.', '화살표/금지 표기로 탐색 가능성을 표시합니다.'));
        addSelect(uiLabel('Aggregation', '집합 관계'), `${prefix}Aggregation`, relationEndAggregation(r, end), [
          ['none', uiLabel('None', '없음')], ['shared', uiLabel('Shared', '공유')], ['composite', uiLabel('Composite', '합성')],
        ], uiText('Shared uses an open diamond. Composite uses a filled diamond.', '공유는 빈 마름모, 합성은 채운 마름모입니다.'));
        if (ASSOCIATION_QUALIFIER_KINDS.has(r.kind)) {
          box.appendChild(propRow(uiLabel('Qualifiers', '한정자'), textArea(
            (r[`${prefix}Qualifiers`] || []).join('\n'),
            value => { r[`${prefix}Qualifiers`] = value.split(/\r?\n/).map(x => x.trim()).filter(Boolean).slice(0, 50); },
          ), uiText('Enter one item per line.', '한 줄에 하나씩 입력합니다.')));
        }
      }
      const quickEdit = document.createElement('button');
      quickEdit.type = 'button'; quickEdit.className = 'prop-btn';
      quickEdit.textContent = end === 'source' ? uiLabel('Source End QuickEdit…', '출발점 빠른 편집…') : uiLabel('Target End QuickEdit…', '도착점 빠른 편집…');
      quickEdit.addEventListener('click', () => openRelationEndQuickEdit(r, end));
      const actions = document.createElement('div'); actions.className = 'prop-row'; actions.appendChild(quickEdit);
      box.appendChild(actions);
    }

    const NO_NAME_RENDER = new Set([
      'initial', 'final', 'flowfinal', 'forkbar', 'joinbar', 'fragment', 'note', 'execution',
      'timesegment', 'timetick', 'timeconstraint', 'durationconstraint',
    ]);
    
    function classifierProperty(e: DiagramElement, label: string, allowedKinds: readonly string[]) {
      const select = document.createElement('select');
      const none = document.createElement('option');
      none.value = ''; none.textContent = uiText('(No classifier selected)', '(분류자 선택 안 함)');
      select.appendChild(none);
      Object.values(state.models)
        .filter(model => allowedKinds.includes(model.kind))
        .sort((a, b) => String(a.name || '').localeCompare(String(b.name || '')))
        .forEach(model => {
          const option = document.createElement('option');
          option.value = model.id;
          option.textContent = `${diagramKindLabel(model.kind)} · ${model.name || uiLabel('(unnamed)', '(이름 없음)')}`;
          if (e.classifierModelId === model.id) option.selected = true;
          select.appendChild(option);
        });
      select.addEventListener('change', () => {
        snapshot();
        e.classifierModelId = select.value;
        e.w = 0; e.h = 0;
        render(); renderProps();
      });
      return propRow(label, select, uiText(
        'Uses a classifier from the project. Renaming the classifier updates this view.',
        '프로젝트 모델 저장소의 실제 분류자를 참조하며 이름 변경도 표기에 동기화됩니다.',
      ));
    }
    
    function modelReferenceProperty(e: DiagramElement, field: ModelReferenceField, label: string, allowedKinds: readonly string[], emptyLabel: string, hint: string) {
      const select = document.createElement('select');
      const none = document.createElement('option');
      none.value = ''; none.textContent = emptyLabel || uiText('(None)', '(선택 안 함)');
      select.appendChild(none);
      Object.values(state.models)
        .filter(model => allowedKinds.includes(model.kind) && model.id !== e.modelId)
        .sort((a, b) => String(a.name || '').localeCompare(String(b.name || '')))
        .forEach(model => {
          const option = document.createElement('option');
          option.value = model.id;
          option.textContent = `${diagramKindLabel(model.kind)} · ${model.name || uiLabel('(unnamed)', '(이름 없음)')}`;
          if (e[field] === model.id) option.selected = true;
          select.appendChild(option);
        });
      select.addEventListener('change', () => {
        snapshot();
        e[field] = select.value;
        e.w = 0; e.h = 0;
        render(); renderProps();
      });
      return propRow(label, select, hint);
    }
    
    function interactionDiagramProperty(e: DiagramElement) {
      const select = document.createElement('select');
      const none = document.createElement('option');
      none.value = ''; none.textContent = uiText('(Select a sequence diagram)', '(시퀀스 다이어그램 선택)');
      select.appendChild(none);
      state.diagrams
        .filter(diagram => diagram.type === 'sequence')
        .sort((a, b) => String(a.name || '').localeCompare(String(b.name || '')))
        .forEach(diagram => {
          const option = document.createElement('option');
          option.value = diagram.id;
          option.textContent = diagram.name;
          if (e.interactionDiagramId === diagram.id) option.selected = true;
          select.appendChild(option);
        });
      select.addEventListener('change', () => {
        snapshot();
        e.interactionDiagramId = select.value;
        const diagram = referencedInteraction(e);
        if (diagram) e.name = diagram.name;
        e.w = 0; e.h = 0;
        render(); renderProps();
      });
      const row = propRow(uiLabel('Referenced Sequence', '참조 시퀀스'), select,
        e.kind === 'interactioninline'
          ? uiText(
            'Shows a compact sequence in the frame. Adding an inline interaction creates a sequence diagram.',
            '프레임 안에 축약된 시퀀스를 표시합니다. 새 인라인 요소를 만들면 시퀀스 다이어그램도 자동 생성됩니다.',
          )
          : uiText(
            'References the interaction to run. Interaction overviews show it as a ref frame.',
            '실행할 상호작용을 참조합니다. 상호작용 개요에서는 ref 프레임으로 표시됩니다.',
          ));
      const open = document.createElement('button');
      open.type = 'button';
      open.className = 'prop-action';
      open.textContent = uiLabel('Open Sequence Diagram', '시퀀스 다이어그램 열기');
      open.disabled = !referencedInteraction(e);
      open.addEventListener('click', () => {
        const diagram = referencedInteraction(e);
        if (diagram) switchDiagram(diagram.id);
      });
      row.appendChild(open);
      return row;
    }
    
    
    function renderSelectionState(box: HTMLElement) {
      if (state.selection.length > 1) {
        box.innerHTML = uiText(
          '<div class="prop-kind">Selected elements: {0}</div>\n          <div class="prop-hint">Drag to move together · Ctrl+C to copy including internal relationships · Del to delete<br>Shift+click to toggle selection</div>',
          '<div class="prop-kind">요소 {0}개 선택됨</div>\n          <div class="prop-hint">드래그로 함께 이동 · Ctrl+C 복사(내부 관계 포함) · Del 일괄 삭제<br>Shift+클릭으로 선택 추가/해제</div>',
          state.selection.length,
        );
        return true;
      }
      const id = state.selectedId;
      if (!id) {
        box.innerHTML = uiText(
          '<div class="prop-empty">Nothing selected.<br>Drag on the canvas to select multiple elements.</div>',
          '<div class="prop-empty">선택된 요소가 없습니다.<br>빈 캔버스를 드래그하면 사각형으로<br>여러 요소를 한 번에 선택할 수 있습니다.</div>',
        );
        return true;
      }
      return false;
    }
    
    function renderElementProperties(box: HTMLElement, e: DiagramElement) {
        const kind = document.createElement('span');
        kind.className = 'prop-kind';
        kind.textContent = diagramKindLabel(e.kind === 'lifeline' && e.isActor ? 'actor' : e.kind);
        box.appendChild(kind);
        const usage = document.createElement('div');
        usage.className = 'prop-hint model-usage';
        const viewCount = state.diagrams.reduce((n, d) => n + d.elements.filter(v => v.modelId === e.modelId).length, 0);
        usage.textContent = uiLabel('Model {0} · {1} view{2}', '모델 {0} · 뷰 {1}개', e.modelId, viewCount, viewCount === 1 ? '' : 's');
        box.appendChild(usage);
    
        if (!NO_NAME_RENDER.has(e.kind) || e.kind === 'initial' || e.kind === 'final' || e.kind === 'forkbar') {
          box.appendChild(propRow(uiLabel('Name', '이름'), textInput(e.name, v => e.name = v)));
        }
        if (dg().type === 'package' && PACKAGE_CONTAINER_KINDS.has(e.kind)) {
          const visibility = document.createElement('select');
          [
            ['public', uiLabel('Public (+)', '공개 (+)')], ['protected', uiLabel('Protected (#)', '보호 (#)')],
            ['private', uiLabel('Private (-)', '비공개 (-)')], ['package', uiLabel('Package (~)', '패키지 (~)')],
          ].forEach(([value, label]) => {
            const option = document.createElement('option');
            option.value = value; option.textContent = label;
            if ((e.visibility || 'public') === value) option.selected = true;
            visibility.appendChild(option);
          });
          visibility.addEventListener('change', () => {
            snapshot(); e.visibility = visibility.value; render(); renderProps();
          });
          box.appendChild(propRow(uiLabel('Visibility', '가시성'), visibility, uiText(
            'UML name expressions use +, #, -, or ~ for visibility.',
            'UML 이름 표현식에 +, #, -, ~ 기호로 표시됩니다.',
          )));
          if (e.kind === 'package') {
            box.appendChild(propRow(uiLabel('Stereotype', '스테레오타입'), textInput(e.stereotype, value => e.stereotype = value), uiText(
              'Optional, e.g. layer',
              '선택 사항 · 예: layer',
            )));
          }
          const owner = byId(e.parentId);
          const children = childViews(e.id).filter(child => PACKAGE_CONTAINER_KINDS.has(child.kind));
          const hint = document.createElement('div');
          hint.className = 'prop-hint';
          hint.textContent = uiText(
            'Owner: {0} · Contained elements: {1} · Place or drop elements inside to nest them.',
            '소유 요소: {0} · 포함 요소 {1}개 · 내부에 생성하거나 드롭하면 자동으로 중첩됩니다.',
            owner ? owner.name : uiLabel('(root)', '(최상위)'),
            children.length,
          );
          box.appendChild(hint);
        }
        if (dg().type === 'profile' && (e.kind === 'metaclass' || e.kind === 'stereotype')) {
          const visibility = document.createElement('select');
          [
            ['public', uiLabel('Public (+)', '공개 (+)')], ['protected', uiLabel('Protected (#)', '보호 (#)')],
            ['private', uiLabel('Private (-)', '비공개 (-)')], ['package', uiLabel('Package (~)', '패키지 (~)')],
          ].forEach(([value, label]) => {
            const option = document.createElement('option');
            option.value = value; option.textContent = label;
            if ((e.visibility || 'public') === value) option.selected = true;
            visibility.appendChild(option);
          });
          visibility.addEventListener('change', () => {
            snapshot(); e.visibility = visibility.value; render(); renderProps();
          });
          box.appendChild(propRow(uiLabel('Visibility', '가시성'), visibility, uiText(
            'UML name expressions use +, #, -, or ~ for visibility.',
            'UML 이름 표현식에 +, #, -, ~ 기호로 표시됩니다.',
          )));
          if (e.kind === 'metaclass') {
            const extensionCount = dg().relations.filter(relation =>
              relation.kind === 'extension' && relation.to === e.id).length;
            const hint = document.createElement('div');
            hint.className = 'prop-hint';
            hint.textContent = uiText('Stereotypes extending this UML metaclass: {0}', '이 UML 메타클래스를 확장하는 스테레오타입 {0}개', extensionCount);
            box.appendChild(hint);
          } else {
            box.appendChild(propRow(uiLabel('Attributes', '속성'), textArea((e.attributes || []).join('\n'), value => {
              e.attributes = value.split('\n').filter(line => line.trim() !== '');
            }), uiText('Stereotype tag definition, e.g. + tableName: String', '스테레오타입의 태그 정의 · 예: + tableName: String')));
            box.appendChild(propRow(uiLabel('Operations', '연산'), textArea((e.operations || []).join('\n'), value => {
              e.operations = value.split('\n').filter(line => line.trim() !== '');
            }), uiText('One per line, e.g. + validate(): Boolean', '한 줄에 하나씩 · 예: + validate(): Boolean')));
            const iconArea = textArea(e.iconContent || '', value => {
              e.iconContent = value;
            });
            const iconRow = propRow(uiLabel('Icon Script', '아이콘 스크립트'), iconArea);
            const iconHint = document.createElement('div');
            iconHint.className = 'prop-hint';
            const updateIconHint = () => {
              const parsed = parseIconScript(iconArea.value);
              iconHint.textContent = parsed.valid
                ? uiText(
                  'Shape commands: {0} · Coordinate space: {1}×{2}',
                  '안전한 도형 명령 {0}개 · 좌표계 {1}×{2}',
                  parsed.commands.length,
                  parsed.width,
                  parsed.height,
                )
                : uiText('Error: {0}', '오류: {0}', parsed.errors[0]);
              iconHint.style.color = parsed.valid ? '' : '#a93226';
            };
            iconArea.addEventListener('input', updateIconHint);
            updateIconHint();
            iconRow.appendChild(iconHint);
            box.appendChild(iconRow);
          }
        }
        if (e.kind === 'informationitem') {
          const visibility = document.createElement('select');
          [
            ['public', uiLabel('Public (+)', '공개 (+)')], ['protected', uiLabel('Protected (#)', '보호 (#)')],
            ['private', uiLabel('Private (-)', '비공개 (-)')], ['package', uiLabel('Package (~)', '패키지 (~)')],
          ].forEach(([value, label]) => {
            const option = document.createElement('option');
            option.value = value; option.textContent = label;
            if ((e.visibility || 'public') === value) option.selected = true;
            visibility.appendChild(option);
          });
          visibility.addEventListener('change', () => {
            snapshot(); e.visibility = visibility.value; e.w = 0; e.h = 0; render(); renderProps();
          });
          box.appendChild(propRow(uiLabel('Visibility', '가시성'), visibility, uiText(
            'Prefix the name with +, #, -, or ~ to show visibility.',
            '이름 앞에 +, #, -, ~ 기호로 표시됩니다.',
          )));
          box.appendChild(propRow(uiLabel('Stereotype', '스테레오타입'), textInput(e.stereotype || 'information', value => {
            e.stereotype = value || 'information'; e.w = 0; e.h = 0;
          }), uiText('Default: information', '기본값: information')));
          box.appendChild(propRow(uiLabel('Attributes', '속성'), textArea((e.attributes || []).join('\n'), value => {
            e.attributes = value.split('\n').filter(line => line.trim() !== '');
          }), uiText('One per line, e.g. + format: String', '한 줄에 하나씩 · 예: + format: String')));
          box.appendChild(propRow(uiLabel('Operations', '연산'), textArea((e.operations || []).join('\n'), value => {
            e.operations = value.split('\n').filter(line => line.trim() !== '');
          }), uiText('One per line, e.g. + serialize(): String', '한 줄에 하나씩 · 예: + serialize(): String')));
          box.appendChild(propRow(uiLabel('Receptions', '수신 신호'), textArea((e.receptions || []).join('\n'), value => {
            e.receptions = value.split('\n').filter(line => line.trim() !== '');
          }), uiText('Accepted signals, one per line.', '수신 가능한 Signal · 한 줄에 하나씩')));
        }
        if (e.kind === 'requirement') {
          const visibility = document.createElement('select');
          [
            ['public', uiLabel('Public (+)', '공개 (+)')], ['protected', uiLabel('Protected (#)', '보호 (#)')],
            ['private', uiLabel('Private (-)', '비공개 (-)')], ['package', uiLabel('Package (~)', '패키지 (~)')],
          ].forEach(([value, label]) => {
            const option = document.createElement('option');
            option.value = value; option.textContent = label;
            if ((e.visibility || 'public') === value) option.selected = true;
            visibility.appendChild(option);
          });
          visibility.addEventListener('change', () => {
            snapshot(); e.visibility = visibility.value; e.w = 0; e.h = 0; render(); renderProps();
          });
          box.appendChild(propRow(uiLabel('Visibility', '가시성'), visibility, uiText(
            'Prefix the name with +, #, -, or ~ to show visibility.',
            '이름 앞에 +, #, -, ~ 기호로 표시됩니다.',
          )));
    
          const type = document.createElement('select');
          const requirementLabels: Record<string, string> = {
            requirement: '요구사항',
            functionalRequirement: '기능 요구사항',
            interfaceRequirement: '인터페이스 요구사항',
            performanceRequirement: '성능 요구사항',
            physicalRequirement: '물리 요구사항',
            designConstraint: '설계 제약',
          };
          REQUIREMENT_TYPES.forEach(value => {
            const option = document.createElement('option');
            option.value = value; option.textContent = uiLabel(value, requirementLabels[value] ?? value);
            if ((e.requirementType || 'requirement') === value) option.selected = true;
            type.appendChild(option);
          });
          type.addEventListener('change', () => {
            snapshot(); e.requirementType = type.value; e.w = 0; e.h = 0; render(); renderProps();
          });
          box.appendChild(propRow(uiLabel('Requirement Type', '요구사항 종류'), type,
            uiText(
              'SysML requirement type, e.g. functional, interface, performance, physical, design constraint',
              'SysML 요구사항의 종류를 선택하세요.',
            )));
          box.appendChild(propRow('ID', textInput(e.requirementId, value => {
            e.requirementId = value; e.w = 0; e.h = 0;
          }), uiText('Use a project-wide unique ID, e.g. REQ-RND-001.', '프로젝트 전체에서 고유해야 합니다 · 예: REQ-RND-001')));
          box.appendChild(propRow(uiLabel('Text', '내용'), textArea(e.requirementText, value => {
            e.requirementText = value; e.h = 0;
          }), uiText('Write a verifiable shall statement.', '검증 가능한 shall 문장으로 작성합니다.')));
    
          const risk = document.createElement('select');
          [
            ['Low', uiLabel('Low', '낮음')],
            ['Medium', uiLabel('Medium', '보통')],
            ['High', uiLabel('High', '높음')],
          ].forEach(([value, label]) => {
            const option = document.createElement('option');
            option.value = value; option.textContent = label;
            if ((e.risk || 'Medium') === value) option.selected = true;
            risk.appendChild(option);
          });
          risk.addEventListener('change', () => {
            snapshot(); e.risk = risk.value; render(); renderProps();
          });
          box.appendChild(propRow(uiLabel('Risk', '위험도'), risk));
    
          const method = document.createElement('select');
          [
            ['Analysis', uiLabel('Analysis', '분석')],
            ['Inspection', uiLabel('Inspection', '검사')],
            ['Test', uiLabel('Test', '시험')],
            ['Demonstration', uiLabel('Demonstration', '시연')],
          ].forEach(([value, label]) => {
            const option = document.createElement('option');
            option.value = value; option.textContent = label;
            if ((e.verificationMethod || 'Analysis') === value) option.selected = true;
            method.appendChild(option);
          });
          method.addEventListener('change', () => {
            snapshot(); e.verificationMethod = method.value; render(); renderProps();
          });
          box.appendChild(propRow(uiLabel('Verification Method', '검증 방법'), method,
            uiText(
              'Uses the Mermaid requirement values Analysis, Inspection, Test, and Demonstration.',
              'Mermaid 요구사항 다이어그램과 같은 검증 방법을 사용합니다.',
            )));
        }
        if (BDD_CLASSIFIER_KINDS.has(e.kind)) {
          const visibility = document.createElement('select');
          [
            ['public', uiLabel('Public (+)', '공개 (+)')], ['protected', uiLabel('Protected (#)', '보호 (#)')],
            ['private', uiLabel('Private (-)', '비공개 (-)')], ['package', uiLabel('Package (~)', '패키지 (~)')],
          ].forEach(([value, label]) => {
            const option = document.createElement('option');
            option.value = value; option.textContent = label;
            if ((e.visibility || 'public') === value) option.selected = true;
            visibility.appendChild(option);
          });
          visibility.addEventListener('change', () => {
            snapshot(); e.visibility = visibility.value; e.w = 0; e.h = 0; render(); renderProps();
          });
          box.appendChild(propRow(uiLabel('Visibility', '가시성'), visibility, uiText(
            'Prefix the name with +, #, -, or ~ to show visibility.',
            '이름 앞에 +, #, -, ~ 기호로 표시됩니다.',
          )));
    
          const abstract = document.createElement('label');
          abstract.className = 'prop-check';
          const abstractCheck = document.createElement('input');
          abstractCheck.type = 'checkbox'; abstractCheck.checked = !!e.isAbstract;
          abstractCheck.addEventListener('change', () => {
            snapshot(); e.isAbstract = abstractCheck.checked; render(); renderProps();
          });
          abstract.append(abstractCheck, document.createTextNode(uiText('Abstract (italic name)', '추상 (이탤릭체 이름)')));
          const abstractRow = document.createElement('div');
          abstractRow.className = 'prop-row'; abstractRow.appendChild(abstract);
          box.appendChild(abstractRow);
    
          const listArea = (label: string, field: StringListField, hint: string) => {
            box.appendChild(propRow(label, textArea((e[field] || []).join('\n'), value => {
              e[field] = value.split('\n').filter(line => line.trim() !== '');
              e.w = 0; e.h = 0;
            }), hint));
          };
          listArea(uiLabel('Constraints', '제약'), 'constraints', uiText(
            'One per line, e.g. { renderTime <= frameBudget }',
            '한 줄에 하나씩 · 예: { renderTime <= frameBudget }',
          ));
          if (e.kind === 'valuetype') {
            box.appendChild(propRow(uiLabel('Unit', '단위'), textInput(e.valueTypeUnit, value => {
              e.valueTypeUnit = value; e.w = 0; e.h = 0;
            }), uiText('Examples: ms, kg, V', '예: ms, kg, V')));
            box.appendChild(propRow(uiLabel('Quantity Kind', '물리량 종류'), textInput(e.quantityKind, value => {
              e.quantityKind = value; e.w = 0; e.h = 0;
            }), uiText('Examples: Time, Mass, Voltage', '예: Time, Mass, Voltage')));
            listArea(uiLabel('Attributes', '속성'), 'properties', uiText(
              'Value type attribute, e.g. + magnitude: Real',
              '값 유형의 속성 · 예: + magnitude: Real',
            ));
          } else if (e.kind === 'constraintblock') {
            listArea(uiLabel('Parameters', '매개변수'), 'constraintParameters', uiText(
              'Constraint parameter, e.g. renderTime: Milliseconds',
              '제약 매개변수 · 예: renderTime: Milliseconds',
            ));
            listArea(uiLabel('Properties', '속성'), 'properties', uiText('General properties, one per line.', '일반 속성 · 한 줄에 하나씩'));
          } else {
            listArea(uiLabel('Parts', '파트'), 'parts', uiText(
              'Composite part property, e.g. canvas: CanvasSubsystem [1]',
              '합성 파트 속성 · 예: canvas: CanvasSubsystem [1]',
            ));
            listArea(uiLabel('References', '참조'), 'references', uiText(
              'Reference property, e.g. metrics: MetricsService [0..1]',
              '참조 속성 · 예: metrics: MetricsService [0..1]',
            ));
            listArea(uiLabel('Values', '값'), 'values', uiText(
              'Value property, e.g. frameBudget: Milliseconds = 100',
              '값 속성 · 예: frameBudget: Milliseconds = 100',
            ));
            listArea(uiLabel('Flow Properties', '흐름 속성'), 'flowProperties', uiText(
              'Include the direction, e.g. in document: DiagramDocument',
              '방향 포함 · 예: in document: DiagramDocument',
            ));
            listArea(uiLabel('Constraint Properties', '제약 속성'), 'constraintProperties', uiText('Example: budget: RenderBudget', '예: budget: RenderBudget'));
            listArea(uiLabel('Properties', '속성'), 'properties', uiText('Other properties, one per line.', '기타 속성 · 한 줄에 하나씩'));
          }
          listArea(uiLabel('Operations', '연산'), 'operations', uiText(
            'Example: + render(document: DiagramDocument): RenderedFrame',
            '예: + render(document: DiagramDocument): RenderedFrame',
          ));
          if (e.kind !== 'constraintblock') {
            listArea(uiLabel('Receptions', '수신 신호'), 'receptions', uiText('Accepted signals, one per line.', '수신 가능한 Signal · 한 줄에 하나씩'));
          }
        }
        if (e.kind === 'lifeline') {
          if (dg().type === 'sequence') {
            const chk = document.createElement('label');
            chk.className = 'prop-check';
            const c = document.createElement('input');
            c.type = 'checkbox'; c.checked = !!e.isActor;
            c.addEventListener('change', () => {
              snapshot();
              e.isActor = c.checked;
              e.w = 0; e.h = 0;           // re-fit to the new representation
              render(); renderProps();
            });
            chk.appendChild(c); chk.appendChild(document.createTextNode(uiText('Show as an actor icon', '액터로 표기 (사람 모양)')));
            const row = document.createElement('div'); row.className = 'prop-row'; row.appendChild(chk);
            box.appendChild(row);
          }
          box.appendChild(propRow(uiLabel('Stereotype («»)', '스테레오타입 («»)'), textInput(e.stereotype, v => { e.stereotype = v; e.w = 0; e.h = 0; }),
            uiText('Stereotype label, e.g. boundary, control, entity', '<< >> 주석 · 예: boundary, control, entity')));
          if (dg().type === 'communication' || dg().type === 'timing') {
            box.appendChild(classifierProperty(e, uiLabel('Classifier', '분류자'),
              ['class', 'interface', 'enumeration', 'component', 'artifact', 'node']));
          }
        }
        if (e.kind === 'stateinvariant') {
          const hint = document.createElement('div');
          hint.className = 'prop-hint';
          hint.textContent = uiText('Shown inside braces, e.g. user.authenticated == true', '{ } 안에 표시됩니다 · 예: user.authenticated == true');
          box.appendChild(hint);
        }
        if (e.kind === 'interactionuse' || e.kind === 'interactioninline') {
          box.appendChild(interactionDiagramProperty(e));
          const hint = document.createElement('div');
          hint.className = 'prop-hint';
          hint.textContent = uiText(
            'Once a sequence is linked, double-click the frame to open it.',
            '참조가 설정되면 프레임을 더블클릭해서 해당 시퀀스 다이어그램을 열 수 있습니다.',
          );
          box.appendChild(hint);
        }
        if (e.kind === 'execution') {
          const hint = document.createElement('div');
          hint.className = 'prop-hint';
          hint.textContent = uiText(
            'Execution specification. Overlapping executions on a lifeline stack to the right. Drag to move vertically or use the lower handle to resize.',
            '실행 사양(execution) 박스 · 같은 라이프라인에서 시간 구간이 겹치면 오른쪽으로 자동 중첩 · 위/아래 이동 · 아래 핸들로 길이 조정',
          );
          box.appendChild(hint);
        }
        if (e.kind === 'class') {
          box.appendChild(propRow(uiLabel('Stereotype', '스테레오타입'), textInput(e.stereotype, v => e.stereotype = v)));
          const chk = document.createElement('label');
          chk.className = 'prop-check';
          const c = document.createElement('input');
          c.type = 'checkbox'; c.checked = !!e.isAbstract;
          c.addEventListener('change', () => { snapshot(); e.isAbstract = c.checked; render(); });
          chk.appendChild(c); chk.appendChild(document.createTextNode(uiText('Abstract (italic name)', '추상 (이탤릭체 이름)')));
          const row = document.createElement('div'); row.className = 'prop-row'; row.appendChild(chk);
          box.appendChild(row);
          box.appendChild(propRow(uiLabel('Attributes', '속성'), textArea((e.attributes || []).join('\n'), v => {
            e.attributes = v.split('\n').filter(s => s.trim() !== '');
          }), uiText('One per line, e.g. + name: String', '한 줄에 하나씩 · 예: + name: String')));
          box.appendChild(propRow(uiLabel('Operations', '연산'), textArea((e.operations || []).join('\n'), v => {
            e.operations = v.split('\n').filter(s => s.trim() !== '');
          }), uiText('Example: + getName(): String', '예: + getName(): String')));
        }
        if (e.kind === 'interface') {
          box.appendChild(propRow(uiLabel('Attributes', '속성'), textArea((e.attributes || []).join('\n'), v => {
            e.attributes = v.split('\n').filter(s => s.trim() !== '');
          }), uiText('Ctrl/Cmd+Enter to add, e.g. + id: String', 'Ctrl/Cmd+Enter로 빠르게 추가 · 예: + id: String')));
          box.appendChild(propRow(uiLabel('Operations', '연산'), textArea((e.operations || []).join('\n'), v => {
            e.operations = v.split('\n').filter(s => s.trim() !== '');
          }), uiText('Example: + draw(ctx: Context): void', '예: + draw(ctx: Context): void')));
        }
        if (e.kind === 'enumeration') {
          box.appendChild(propRow(uiLabel('Literals', '리터럴'), textArea((e.literals || []).join('\n'), v => {
            e.literals = v.split('\n').filter(s => s.trim() !== '');
          }), uiText('One per line, e.g. RED', '한 줄에 하나씩 · 예: RED')));
          box.appendChild(propRow(uiLabel('Operations', '연산'), textArea((e.operations || []).join('\n'), v => {
            e.operations = v.split('\n').filter(s => s.trim() !== '');
          }), uiText('Ctrl/Cmd+Shift+Enter to add, e.g. + fromCode(): Color', 'Ctrl/Cmd+Shift+Enter로 빠르게 추가 · 예: + fromCode(): Color')));
        }
        if (e.kind === 'note') {
          box.appendChild(propRow(uiLabel('Text', '내용'), textArea(e.text, v => e.text = v)));
        }
        if (e.kind === 'entity') {
          box.appendChild(erdDisplayModeProperty());
          box.appendChild(propRow(uiText('Logical Name', '논리명'), textInput(e.logicalName, v => e.logicalName = v), uiText(
            'Name shown in the logical model, e.g. Member',
            '논리 모델 보기에서 표시되는 이름 · 예: 회원',
          )));
          box.appendChild(erdColumnsProperty(e));
          box.appendChild(erdSchemaProperty(e));
        }
        if (e.kind === 'node') {
          box.appendChild(propRow(uiLabel('Stereotype', '스테레오타입'), textInput(e.stereotype, v => e.stereotype = v), uiText(
            'Example: device, executionEnvironment',
            '예: device, executionEnvironment',
          )));
        }
        if (e.kind === 'database') {
          box.appendChild(propRow(uiLabel('Database Type', '데이터베이스 종류'), textInput(e.stereotype, v => e.stereotype = v),
            uiText('Optional label, such as SQLite or PostgreSQL.', '선택 항목입니다. 예: SQLite, PostgreSQL')));
        }
        const deploymentBoundary = e.kind === 'boundary' && dg().type === 'deployment';
        if (deploymentBoundary) {
          const dashed = document.createElement('input');
          dashed.type = 'checkbox';
          dashed.checked = e.borderStyle === 'dashed';
          dashed.addEventListener('change', () => {
            snapshot();
            e.borderStyle = dashed.checked ? 'dashed' : 'solid';
            render();
          });
          box.appendChild(propRow(uiLabel('Dashed Border', '점선 테두리'), dashed));
        }
        if (e.kind === 'timingstate') {
          const owner = byId(e.parentId);
          const hint = document.createElement('div');
          hint.className = 'prop-hint';
          hint.textContent = uiText(
            'Owner: {0} · Click this row to add a time segment.',
            '소유 요소: {0} · 이 행을 클릭해 시간 구간을 추가할 수 있습니다.',
            owner ? owner.name : uiLabel('(missing)', '(찾을 수 없음)'),
          );
          box.appendChild(hint);
        }
        if (e.kind === 'timesegment') {
          box.appendChild(propRow(uiLabel('Start Time', '시작 시각'), textInput(e.startTime, value => e.startTime = value), uiText('Example: 10 ms', '예: 10 ms')));
          box.appendChild(propRow(uiLabel('End Time', '종료 시각'), textInput(e.endTime, value => e.endTime = value), uiText('Example: 40 ms', '예: 40 ms')));
          const owner = byId(e.parentId);
          const hint = document.createElement('div');
          hint.className = 'prop-hint';
          hint.textContent = uiText(
            'State / Condition: {0} · Drag horizontally to move or use the end handles to resize.',
            '상태·조건: {0} · 좌우로 이동하거나 양 끝 핸들로 기간을 조절합니다.',
            owner ? owner.name : uiLabel('(missing)', '(찾을 수 없음)'),
          );
          box.appendChild(hint);
        }
        if (ACTIVITY_CONTAINER_KINDS.has(e.kind)) {
          const childCount = descendantViews(e.id).filter(child => !ACTIVITY_PIN_KINDS.has(child.kind)).length;
          const hint = document.createElement('div');
          hint.className = 'prop-hint';
          hint.textContent = uiText(
            'Contained activity elements: {0} · Place or drop elements inside to move them together.',
            '포함된 활동 요소 {0}개 · 내부에 요소를 만들거나 드롭하면 함께 이동합니다.',
            childCount,
          );
          box.appendChild(hint);
        }
        if (e.kind === 'expansionregion') {
          const select = document.createElement('select');
          [['parallel', uiLabel('Parallel', '병렬')], ['iterative', uiLabel('Iterative', '반복')], ['stream', uiLabel('Stream', '스트림')]].forEach(([value, label]) => {
            const option = document.createElement('option');
            option.value = value; option.textContent = label;
            if ((e.expansionMode || 'parallel') === value) option.selected = true;
            select.appendChild(option);
          });
          select.addEventListener('change', () => {
            snapshot(); e.expansionMode = select.value; render(); renderProps();
          });
          box.appendChild(propRow(uiLabel('Expansion Mode', '확장 모드'), select, uiText(
            'Choose parallel, iterative, or stream execution.',
            'parallel · iterative · stream 실행 모드를 선택합니다.',
          )));
        }
        if (ACTIVITY_PIN_KINDS.has(e.kind)) {
          const owner = byId(e.parentId);
          const hint = document.createElement('div');
          hint.className = 'prop-hint';
          hint.textContent = uiText(
            'Owner: {0} · Drag along the owner\'s border.',
            '소유 요소: {0} · 드래그하면 소유 요소의 테두리를 따라 이동합니다.',
            owner ? owner.name : uiLabel('(missing)', '(찾을 수 없음)'),
          );
          box.appendChild(hint);
        }
        if (e.kind === 'timetick') {
          box.appendChild(propRow(uiLabel('Time Value', '시간 값'), textInput(e.timeValue, value => e.timeValue = value), uiText(
            'Value shown on the time axis, e.g. 20 ms',
            '시간축 눈금에 표시할 값 · 예: 20 ms',
          )));
        }
        if (e.kind === 'timeconstraint' || e.kind === 'durationconstraint') {
          box.appendChild(propRow(uiLabel('Constraint', '제약'), textInput(e.constraint, value => {
            e.constraint = value; e.w = 0; e.h = 0;
          }), e.kind === 'timeconstraint' ? uiText('Example: {t = 20 ms}', '예: {t = 20 ms}') : uiText('Example: {20 ms..60 ms}', '예: {20 ms..60 ms}')));
          if (e.kind === 'timeconstraint') {
            const target = byId(e.constrainedViewId) || relById(e.constrainedViewId);
            const hint = document.createElement('div');
            hint.className = 'prop-hint';
            hint.textContent = uiLabel('Attached to: {0}', '연결 대상: {0}', target ? diagramKindLabel(target.kind) : uiLabel('(missing)', '(찾을 수 없음)'));
            box.appendChild(hint);
          }
        }
        if (e.kind === 'ibdframe') {
          box.appendChild(classifierProperty(e, uiLabel('Owning Block', '소유 블록'), ['block']));
          const hint = document.createElement('div');
          hint.className = 'prop-hint';
          hint.textContent = uiText(
            'The internal block diagram shows the selected block\'s internal structure.',
            '내부 블록 다이어그램은 선택한 블록의 내부 구조를 나타냅니다.',
          );
          box.appendChild(hint);
        }
        if (e.kind === 'parametricframe') {
          box.appendChild(classifierProperty(e, uiLabel('Owning Constraint Block', '소유 제약 블록'), ['constraintblock']));
          const hint = document.createElement('div');
          hint.className = 'prop-hint';
          hint.textContent = uiText(
            'The parametric diagram shows equations and parameters for the selected constraint block.',
            '파라메트릭 다이어그램은 선택한 제약 블록의 수식과 매개변수 관계를 분석합니다.',
          );
          box.appendChild(hint);
          const sync = document.createElement('button');
          sync.type = 'button'; sync.className = 'prop-btn';
          sync.textContent = uiText('Sync Constraint Parameters', '제약 매개변수 동기화');
          sync.disabled = instanceClassifier(e)?.kind !== 'constraintblock';
          sync.addEventListener('click', () => syncConstraintParameters(e));
          box.appendChild(sync);
        }
        if (e.kind === 'constraintproperty') {
          box.appendChild(classifierProperty(e, uiLabel('Constraint Block Type', '제약 블록 유형'), ['constraintblock']));
          const equations = constraintPropertyEquations(e);
          const hint = document.createElement('div');
          hint.className = 'prop-hint';
          hint.textContent = equations.length
            ? uiLabel('Equation: {0}', '수식: {0}', equations.join(' · '))
            : uiText('Select a constraint block type to show its equations.', '제약 블록 유형을 선택하면 정의된 수식이 자동 표시됩니다.');
          box.appendChild(hint);
          const sync = document.createElement('button');
          sync.type = 'button'; sync.className = 'prop-btn';
          sync.textContent = uiText('Sync Constraint Parameters', '제약 매개변수 동기화');
          sync.disabled = instanceClassifier(e)?.kind !== 'constraintblock';
          sync.addEventListener('click', () => syncConstraintParameters(e));
          box.appendChild(sync);
        }
        if (e.kind === 'constraintparameter') {
          box.appendChild(classifierProperty(e, uiLabel('Type', '유형'), ['block', 'valuetype']));
          const owner = byId(e.parentId);
          const hint = document.createElement('div');
          hint.className = 'prop-hint';
          hint.textContent = uiText(
            'Owner: {0} · Drag along the owner\'s border.',
            '소유 요소: {0} · 드래그하면 소유 요소의 테두리를 따라 이동합니다.',
            owner ? owner.name : uiLabel('(missing)', '(찾을 수 없음)'),
          );
          box.appendChild(hint);
        }
        if (e.kind === 'part' || e.kind === 'reference' || e.kind === 'value' || e.kind === 'port') {
          const allowedKinds = dg().type === 'ibd'
            ? (e.kind === 'value' ? ['valuetype'] : ['block', 'valuetype', 'interfaceblock'])
            : dg().type === 'parametric'
              ? ['block', 'valuetype']
            : dg().type === 'bdd'
              ? ['block', 'valuetype', 'interfaceblock', 'constraintblock']
              : ['class', 'interface', 'enumeration', 'component', 'artifact', 'node'];
          box.appendChild(classifierProperty(e, uiLabel('Type', '유형'),
            allowedKinds));
          const owner = byId(e.parentId);
          const hint = document.createElement('div');
          hint.className = 'prop-hint';
          hint.textContent = uiLabel('Owner: {0}', '소유 요소: {0}', owner ? owner.name : uiLabel('(missing)', '(찾을 수 없음)')) + (e.kind === 'port' ? uiText(
            ' · Drag along the owner\'s border.',
            ' · 드래그하면 소유 요소의 테두리를 따라 이동합니다.',
          ) : '');
          box.appendChild(hint);
        }
        if (e.kind === 'value' && dg().type === 'parametric') {
          const defaultInput = textInput(e.defaultValue, value => {
            e.defaultValue = value; e.w = 0; e.h = 0;
          });
          const defaultRow = propRow(uiLabel('Default Value', '기본값'), defaultInput,
            uiText('Initial analysis input, with optional units, e.g. 100 ms', '분석 입력의 초기값 또는 단위 포함 값 · 예: 100 ms'));
          const unitHint = document.createElement('div');
          unitHint.className = 'prop-hint';
          const updateUnitHint = () => {
            const compatibility = defaultValueUnitCompatibility(e.defaultValue, instanceClassifier(e));
            unitHint.dataset.compatibility = compatibility.status;
            unitHint.textContent = uiLabel('Default Unit · {0}', '기본 단위 · {0}', compatibility.message);
            unitHint.style.color = (compatibilityColors[compatibility.status] || '');
          };
          defaultInput.addEventListener('input', updateUnitHint);
          updateUnitHint();
          defaultRow.appendChild(unitHint);
          box.appendChild(defaultRow);
        }
        if (e.kind === 'port') {
          box.appendChild(modelReferenceProperty(e, 'providedInterfaceModelId', uiLabel('Provided Interface', '제공 인터페이스'), ['interface', 'interfaceblock'],
            uiText('(No provided interface)', '(제공 인터페이스 없음)'), uiText('A provided interface displays a lollipop outside the port.', '선택하면 포트 바깥쪽에 막대 끝에 원형 표기가 나타납니다.')));
          box.appendChild(modelReferenceProperty(e, 'requiredInterfaceModelId', uiLabel('Required Interface', '요구 인터페이스'), ['interface', 'interfaceblock'],
            uiText('(No required interface)', '(요구 인터페이스 없음)'), uiText('A required interface displays a socket outside the port.', '선택하면 포트 바깥쪽에 반원형 표기가 나타납니다.')));
        }
        if (e.kind === 'collaborationuse') {
          box.appendChild(modelReferenceProperty(e, 'collaborationModelId', uiLabel('Collaboration', '협업'), ['collaboration'],
            uiText('(Select a collaboration)', '(협업 선택)'), uiText('References a collaboration from the project model.', '프로젝트 모델 저장소의 실제 협업을 참조합니다.')));
          const owner = byId(e.parentId);
          const hint = document.createElement('div');
          hint.className = 'prop-hint';
          hint.textContent = uiText(
            'Owner: {0} · Connect part roles with role bindings.',
            '소유 요소: {0} · 역할 바인딩으로 파트 역할을 연결하세요.',
            owner ? owner.name : uiLabel('(missing)', '(찾을 수 없음)'),
          );
          box.appendChild(hint);
        }
        if (INSTANCE_KINDS.has(e.kind)) {
          const select = document.createElement('select');
          const none = document.createElement('option');
          none.value = ''; none.textContent = uiText('(No classifier selected)', '(분류자 선택 안 함)');
          select.appendChild(none);
          const allowedKinds = INSTANCE_CLASSIFIER_KINDS[e.kind] || [];
          Object.values(state.models)
            .filter(model => allowedKinds.includes(model.kind))
            .sort((a, b) => String(a.name || '').localeCompare(String(b.name || '')))
            .forEach(model => {
              const option = document.createElement('option');
              option.value = model.id;
              option.textContent = `${diagramKindLabel(model.kind)} · ${model.name || uiLabel('(unnamed)', '(이름 없음)')}`;
              if (e.classifierModelId === model.id) option.selected = true;
              select.appendChild(option);
            });
          select.addEventListener('change', () => {
            snapshot();
            e.classifierModelId = select.value;
            render(); renderProps();
          });
          box.appendChild(propRow(e.kind === 'object' ? uiLabel('Classifier', '분류자') : uiLabel('Type', '유형'), select,
            uiText(
              'References a classifier from the project model. Renaming it updates the instance label.',
              '프로젝트 모델 저장소의 실제 분류자를 참조합니다. 이름 변경도 인스턴스 표기에 동기화됩니다.',
            )));
          if (e.kind === 'object') {
            box.appendChild(propRow(uiLabel('Slots', '슬롯'), textArea((e.slots || []).join('\n'), value => {
              e.slots = value.split('\n').filter(line => line.trim() !== '');
            }), uiText(
              'One per line, e.g. + visible: boolean = true (visibility name: type = value)',
              '한 줄에 하나씩 · 형식: visibility name: type = value · 예: + visible: boolean = true',
            )));
          }
        }
        if (e.kind === 'state' || e.kind === 'compositestate' || e.kind === 'submachinestate') {
          box.appendChild(propRow(uiLabel('Entry', '진입 동작'), textInput(e.entry, v => e.entry = v), uiText(
            'Runs on entry. Display: entry / action',
            '상태에 진입할 때 수행 · 표기: entry / 동작',
          )));
          box.appendChild(propRow(uiLabel('Do Activity', '실행 동작'), textInput(e.doActivity, v => e.doActivity = v), uiText(
            'Runs while in the state. Display: do / action',
            '상태에 머무는 동안 수행 · 표기: do / 동작',
          )));
          box.appendChild(propRow(uiLabel('Exit', '종료 동작'), textInput(e.exit, v => e.exit = v), uiText(
            'Runs on exit. Display: exit / action',
            '상태에서 나갈 때 수행 · 표기: exit / 동작',
          )));
          box.appendChild(propRow(uiLabel('Internal Transitions', '내부 전이'), textArea((e.internalTransitions || []).join('\n'), v => {
            e.internalTransitions = v.split('\n').filter(s => s.trim() !== '');
          }), uiText('One per line, e.g. retry [count < 3] / reconnect()', '한 줄에 하나씩 · 예: retry [count < 3] / reconnect()')));
          if (e.kind === 'compositestate') {
            const regionCount = childViews(e.id).filter(x => x.kind === 'region').length;
            const hint = document.createElement('div');
            hint.className = 'prop-hint';
            hint.textContent = regionCount > 1
              ? uiText(
                'Orthogonal composite state · {0} regions can be active in parallel.',
                '직교 복합 상태 · 영역 {0}개가 동시에 활성화될 수 있습니다.',
                regionCount,
              )
              : uiText(
                'Composite state · {0} regions · Use the Region tool to add orthogonal regions.',
                '복합 상태 · 영역 {0}개 · 도구 모음에서 영역을 선택해 직교 영역을 추가할 수 있습니다.',
                regionCount,
              );
            box.appendChild(hint);
          }
          if (e.kind === 'submachinestate') {
            const select = document.createElement('select');
            const none = document.createElement('option');
            none.value = ''; none.textContent = uiText('(Select a state machine)', '(상태 머신 선택)');
            select.appendChild(none);
            state.diagrams.filter(diagram => diagram.type === 'state').forEach(diagram => {
              const option = document.createElement('option');
              option.value = diagram.id; option.textContent = diagram.name;
              if (e.submachineDiagramId === diagram.id) option.selected = true;
              select.appendChild(option);
            });
            select.addEventListener('change', () => {
              snapshot();
              e.submachineDiagramId = select.value;
              render(); renderProps();
            });
            box.appendChild(propRow(uiLabel('Referenced State Machine', '참조 상태 머신'), select,
              uiText(
                'Select the state machine to call. Attach connection point references to this state\'s border.',
                '이 상태가 호출할 상태 머신을 지정합니다. 접점 참조는 이 상태의 테두리에만 부착됩니다.',
              )));
          }
        }
        if (e.kind === 'region') {
          const owner = byId(e.parentId);
          const hint = document.createElement('div');
          hint.className = 'prop-hint';
          hint.textContent = uiText(
            'Owner: {0} · Place or drop states inside the region to nest them.',
            '소유 요소: {0} · 영역 안에 상태를 생성하거나 드롭하면 자동으로 포함됩니다.',
            owner ? owner.name : uiLabel('(missing)', '(찾을 수 없음)'),
          );
          box.appendChild(hint);
        }
        if (e.kind === 'connectionpointref') {
          const select = document.createElement('select');
          [['entry', uiLabel('Entry reference', '진입 참조')], ['exit', uiLabel('Exit reference', '종료 참조')]].forEach(([value, label]) => {
            const option = document.createElement('option');
            option.value = value; option.textContent = label;
            if ((e.referenceKind || 'entry') === value) option.selected = true;
            select.appendChild(option);
          });
          select.addEventListener('change', () => { snapshot(); e.referenceKind = select.value; render(); renderProps(); });
          box.appendChild(propRow(uiLabel('Reference kind', '참조 종류'), select,
            uiText(
              'Entry accepts incoming transitions into the submachine. Exit returns from it and triggers the outgoing transition.',
              '진입 참조는 하위 상태 머신으로 들어가는 전이에, 종료 참조는 하위 상태 머신에서 나오는 전이에 사용합니다.',
            )));
          const owner = byId(e.parentId);
          const hint = document.createElement('div');
          hint.className = 'prop-hint';
          hint.textContent = uiText(
            'Owner: {0} · Drag along the state border.',
            '소유 요소: {0} · 드래그하면 상태 테두리를 따라 이동합니다.',
            owner ? owner.name : uiLabel('(missing)', '(찾을 수 없음)'),
          );
          box.appendChild(hint);
        }
        if (e.kind === 'entrypoint' || e.kind === 'exitpoint') {
          const hint = document.createElement('div');
          hint.className = 'prop-hint';
          hint.textContent = e.kind === 'entrypoint'
            ? uiText('Entry point into the state machine.', '상태 머신으로 들어오는 연결점입니다.')
            : uiText('Exit point that returns control to the calling state.', '상태 머신에서 호출한 상태로 돌아가는 연결점입니다.');
          box.appendChild(hint);
        }
        if (e.kind === 'terminate') {
          const hint = document.createElement('div');
          hint.className = 'prop-hint';
          hint.textContent = uiText(
            'Terminates the entire state machine execution. Outgoing transitions are prohibited.',
            '도달하면 현재 상태 머신의 실행 컨텍스트 전체를 종료합니다. 나가는 전이는 허용되지 않습니다.',
          );
          box.appendChild(hint);
        }
        if (e.kind === 'fragment') {
          const sel = document.createElement('select');
          ['alt', 'opt', 'loop', 'par', 'break', 'critical', 'ref', 'seq', 'strict', 'neg'].forEach(op => {
            const o = document.createElement('option');
            o.value = op; o.textContent = op;
            if ((e.operator || 'alt') === op) o.selected = true;
            sel.appendChild(o);
          });
          sel.addEventListener('change', () => { snapshot(); e.operator = sel.value; render(); });
          box.appendChild(propRow(uiLabel('Operator', '연산자'), sel));
          box.appendChild(propRow(uiLabel('Condition', '조건'), textInput(e.condition, v => e.condition = v), uiText(
            'Shown when there are no operands, e.g. [for each layer]',
            '피연산자가 없을 때 표시 · 예: [for each layer]',
          )));
          box.appendChild(propRow(uiText('Interaction Operands', '상호작용 피연산자'), textArea((e.operands || []).join('\n'), v => {
            e.operands = v.split('\n').filter(s => s.trim() !== '');
          }), uiText(
            'Enter one guard per line. Drag the dashed divider to resize the operands.',
            '한 줄에 하나씩 가드 조건을 입력하세요. 프레임 안의 점선을 위아래로 드래그해 구역 높이를 조절합니다.',
          )));
        }
        if (deploymentBoundary || !['fragment', 'actor', 'initial', 'final', 'flowfinal', 'forkbar', 'joinbar', 'inputpin', 'outputpin',
          'expansioninput', 'expansionoutput', 'boundary', 'entity', 'frame', 'stateinvariant', 'execution',
          'stateinitial', 'statefinal', 'choice', 'junction', 'statefork', 'shallowhistory', 'deephistory', 'region',
          'entrypoint', 'exitpoint', 'terminate', 'connectionpointref', 'timingstate', 'timetick',
          'timeconstraint', 'durationconstraint'].includes(e.kind)) {
          const color = document.createElement('input');
          color.type = 'color'; color.value = e.fill || FILL_DEFAULT;
          color.addEventListener('change', () => { snapshot(); e.fill = color.value; render(); });
          box.appendChild(propRow(uiLabel('Fill Color', '채우기 색'), color));
        }
    }
    
    function renderRelationProperties(box: HTMLElement, r: DiagramRelation) {
        const kind = document.createElement('span');
        kind.className = 'prop-kind';
        const a = byId(r.from), b = byId(r.to);
        kind.textContent = `${diagramKindLabel(r.kind)} · ${a ? a.name : '?'} → ${b ? b.name : '?'}`;
        box.appendChild(kind);
        const usage = document.createElement('div');
        usage.className = 'prop-hint model-usage';
        const viewCount = state.diagrams.reduce((n, d) => n + d.relations.filter(v => v.modelId === r.modelId).length, 0);
        usage.textContent = uiLabel('Model {0} · {1} view{2}', '모델 {0} · 뷰 {1}개', r.modelId, viewCount, viewCount === 1 ? '' : 's');
        box.appendChild(usage);
        if (r.kind === 'transition') {
          box.appendChild(propRow(uiLabel('Name (model)', '모델 이름'), textInput(r.name, v => r.name = v), uiText(
            'Transition name. The canvas shows the signature when it is set below.',
            '전이 모델 이름 · 아래 서명이 있으면 캔버스에는 서명이 표시됩니다',
          )));
          box.appendChild(propRow(uiLabel('Trigger (event)', '트리거 (이벤트)'), textInput(r.trigger, v => r.trigger = v), uiText(
            'Examples: submit, after(5s)',
            '예: submit, after(5s)',
          )));
          box.appendChild(propRow(uiLabel('Guard', '가드 조건'), textInput(r.guard, v => r.guard = v), uiText(
            'Brackets are added automatically, e.g. isValid.',
            '대괄호는 자동으로 붙습니다 · 예: isValid',
          )));
          box.appendChild(propRow(uiLabel('Effect', '효과'), textInput(r.effect, v => r.effect = v), uiText(
            'Runs on transition, e.g. save()',
            '전이 시 수행 · 예: save()',
          )));
        } else {
          box.appendChild(propRow(uiLabel('Name', '이름'), textInput(r.name, v => r.name = v),
            AUTO_LABEL[r.kind] ? uiText('The {0} label is shown automatically.', '{0} 라벨은 자동 표시됩니다', AUTO_LABEL[r.kind]) : undefined));
        }
        if (r.kind === 'extension') {
          const required = document.createElement('label');
          required.className = 'prop-check';
          const checkbox = document.createElement('input');
          checkbox.type = 'checkbox'; checkbox.checked = !!r.isRequired;
          checkbox.addEventListener('change', () => {
            snapshot(); r.isRequired = checkbox.checked; render(); renderProps();
          });
          required.appendChild(checkbox);
          required.appendChild(document.createTextNode('Required Extension (1)'));
          const row = document.createElement('div'); row.className = 'prop-row'; row.appendChild(required);
          box.appendChild(row);
        }
        if (r.kind === 'informationflow') {
          const conveyed = document.createElement('select');
          conveyed.multiple = true;
          conveyed.size = Math.min(7, Math.max(3, Object.values(state.models)
            .filter(model => INFORMATION_FLOW_CONVEYED_KINDS.has(model.kind)).length));
          Object.values(state.models)
            .filter(model => INFORMATION_FLOW_CONVEYED_KINDS.has(model.kind))
            .sort((a, b) => String(a.name || '').localeCompare(String(b.name || '')))
            .forEach(model => {
              const option = document.createElement('option');
              option.value = model.id;
              option.textContent = `${diagramKindLabel(model.kind)} · ${model.name || uiLabel('(unnamed)', '(이름 없음)')}`;
              option.selected = (r.conveyedModelIds || []).includes(model.id);
              conveyed.appendChild(option);
            });
          conveyed.addEventListener('change', () => {
            snapshot();
            r.conveyedModelIds = Array.from(conveyed.selectedOptions).map(option => option.value);
            render(); renderProps();
          });
          box.appendChild(propRow(uiLabel('Conveyed Information', '전달 정보'), conveyed,
            uiText(
              'Hold Ctrl/Cmd or Shift to select multiple information items or classifiers.',
              'Ctrl/⌘ 또는 Shift로 여러 정보 항목·분류자를 선택할 수 있습니다.',
            )));
        }
        if (r.kind === 'connector' && dg().type === 'ibd') {
          const itemFlows = document.createElement('select');
          itemFlows.multiple = true;
          const allowedItemKinds = new Set(['informationitem', 'block', 'valuetype', 'interfaceblock']);
          const candidates = Object.values(state.models)
            .filter(model => allowedItemKinds.has(model.kind))
            .sort((a, b) => String(a.name || '').localeCompare(String(b.name || '')));
          itemFlows.size = Math.min(8, Math.max(3, candidates.length));
          candidates.forEach(model => {
            const option = document.createElement('option');
            option.value = model.id;
            option.textContent = `${diagramKindLabel(model.kind)} · ${model.name || uiLabel('(unnamed)', '(이름 없음)')}`;
            option.selected = (r.itemFlowModelIds || []).includes(model.id);
            itemFlows.appendChild(option);
          });
          itemFlows.addEventListener('change', () => {
            snapshot();
            r.itemFlowModelIds = Array.from(itemFlows.selectedOptions).map(option => option.value);
            render(); renderProps();
          });
          box.appendChild(propRow(uiLabel('Item Flow', '항목 흐름'), itemFlows,
            uiText(
              'Select the information items, blocks or value types conveyed by the connector.',
              '커넥터로 전달되는 정보 항목 또는 블록/값 유형을 여러 개 지정할 수 있습니다.',
            )));
        }
        if (r.kind === 'bindingconnector') {
          const from = byId(r.from), to = byId(r.to);
          const compatibility = bindingTypeCompatibility(
            from?.classifierModelId,
            to?.classifierModelId,
            state.models,
          );
          const hint = document.createElement('div');
          hint.className = 'prop-hint';
          hint.dataset.compatibility = compatibility.status;
          hint.textContent = uiLabel('Type Compatibility · {0}', '유형 호환성 · {0}', compatibility.message);
          hint.style.color = compatibilityColors[compatibility.status] || '';
          box.appendChild(hint);
    
          const routingMode = document.createElement('select');
          [
            ['auto', uiLabel('Automatic', '자동')],
            ['manual', uiLabel('Manual · Locked', '수동 · 잠김')],
          ].forEach(([value, label]) => {
            const option = document.createElement('option');
            option.value = value;
            option.textContent = label;
            option.selected = (r.routeMode === 'manual' ? 'manual' : 'auto') === value;
            routingMode.appendChild(option);
          });
          routingMode.addEventListener('change', () => {
            snapshot();
            if (routingMode.value === 'manual') lockBindingRoute(r);
            else unlockBindingRoute(r);
            render(); renderProps();
          });
          box.appendChild(propRow(uiLabel('Routing Mode', '경로 모드'), routingMode,
            uiText('Manual routing keeps waypoints when elements move.', '수동 모드는 중간 굴곡점을 저장하여 요소가 움직여도 사용자가 만든 경로를 유지합니다.')));
    
          const jumpStyle = document.createElement('select');
          [
            ['arc', uiLabel('Arc Bridge', '호형 브리지')],
            ['gap', uiLabel('Gap', '간격')],
            ['none', uiLabel('None', '없음')],
          ].forEach(([value, label]) => {
            const option = document.createElement('option');
            option.value = value;
            option.textContent = label;
            option.selected = (r.jumpStyle || 'arc') === value;
            jumpStyle.appendChild(option);
          });
          jumpStyle.addEventListener('change', () => {
            snapshot();
            if (jumpStyle.value === 'arc') delete r.jumpStyle;
            else r.jumpStyle = jumpStyle.value;
            render(); renderProps();
          });
          box.appendChild(propRow(uiLabel('Line Jumps', '교차선 표시'), jumpStyle,
            uiText(
              'Choose an arc or a gap when a binding connector crosses an earlier one.',
              '뒤에 그려진 바인딩 커넥터가 앞선 커넥터와 교차할 때 호형 브리지 또는 간격으로 구분합니다.',
            )));
    
          const stack = bindingConnectorStackInfo(r);
          const stackHint = document.createElement('div');
          stackHint.className = 'prop-hint';
          stackHint.dataset.connectorStack = `${stack.index + 1}/${stack.total}`;
          stackHint.textContent = uiLabel('Connector Layer · {0}/{1}', '커넥터 순서 · {0}/{1}', stack.index + 1, stack.total)
            + uiText(' · Higher numbers draw in front and receive crossing bridges.', ' · 숫자가 높을수록 앞에 그려지고 교차 브리지를 가집니다.');
          box.appendChild(stackHint);
    
          const stackButton = (label: string, action: BindingStackAction, disabled: boolean) => {
            const button = document.createElement('button');
            button.type = 'button';
            button.className = 'prop-btn';
            button.textContent = label;
            button.disabled = disabled;
            button.addEventListener('click', () => reorderBindingConnector(r, action));
            return button;
          };
          const stackStepButtons = document.createElement('div');
          stackStepButtons.className = 'prop-row connector-order-actions';
          stackStepButtons.append(
            stackButton(uiText('Move Backward', '한 단계 뒤로'), 'backward', stack.index <= 0),
            stackButton(uiText('Move Forward', '한 단계 앞으로'), 'forward', stack.index >= stack.total - 1),
          );
          box.appendChild(stackStepButtons);
          const stackEdgeButtons = document.createElement('div');
          stackEdgeButtons.className = 'prop-row connector-order-actions';
          stackEdgeButtons.append(
            stackButton(uiText('Send to Back', '맨 뒤로'), 'back', stack.index <= 0),
            stackButton(uiText('Bring to Front', '맨 앞으로'), 'front', stack.index >= stack.total - 1),
          );
          box.appendChild(stackEdgeButtons);
    
          const route = bindingRoute(r);
          const routeHint = document.createElement('div');
          routeHint.className = 'prop-hint';
          routeHint.dataset.route = 'orthogonal';
          routeHint.textContent = (r.routeMode === 'manual'
            ? uiLabel('Orthogonal Manual Route · Locked', '수동 직교 경로 · 잠김')
            : uiLabel('Orthogonal Auto Route', '자동 직교 경로'))
            + uiText(' · Bends {0} · Crossings {1}', ' · 굴곡 {0} · 교차 {1}', route?.bends || 0, route?.crossings || 0)
            + (r.routeMode === 'manual' ? uiText(' · Waypoints {0}', ' · 제어점 {0}', bindingWaypoints(r).length) : '')
            + ((r.jumpStyle || 'arc') !== 'none' ? uiText(' · Bridges {0}', ' · 브리지 {0}', route?.jumpCount || 0) : '')
            + (route?.obstacleHits ? uiText(' · Obstacle collisions {0}', ' · 장애물 충돌 {0}', route.obstacleHits) : '');
          routeHint.style.color = route?.obstacleHits ? '#b42318' : '#52606d';
          box.appendChild(routeHint);
    
          const addPoint = document.createElement('button');
          addPoint.className = 'prop-btn';
          addPoint.textContent = uiText('Add Waypoint', '굴곡점 추가');
          addPoint.addEventListener('click', () => {
            const current = bindingRoute(r);
            if (!current?.points || current.points.length < 2) return;
            if (bindingWaypoints(r).length >= 200) {
              flashStatus(uiText('You can add up to 200 manual waypoints.', '수동 굴곡점은 최대 200개까지 추가할 수 있습니다'));
              return;
            }
            let segmentIndex = 0, longest = -1;
            for (let index = 1; index < current.points.length; index++) {
              const a = current.points[index - 1], b = current.points[index];
              const length = Math.abs(b.x - a.x) + Math.abs(b.y - a.y);
              if (length > longest) { longest = length; segmentIndex = index - 1; }
            }
            const a = current.points[segmentIndex], b = current.points[segmentIndex + 1];
            const point = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
            if (Math.abs(a.y - b.y) < 0.001) point.y += GRID * 4;
            else point.x += GRID * 4;
            snapshot();
            addBindingWaypoint(r, point, segmentIndex);
            render(); renderProps();
            flashStatus(uiText('Added a waypoint and locked the route.', '굴곡점을 추가하고 수동 경로를 잠갔습니다'));
          });
          const resetRoute = document.createElement('button');
          resetRoute.className = 'prop-btn';
          resetRoute.textContent = uiText('Reset to Automatic Routing', '자동 경로로 재설정');
          resetRoute.disabled = r.routeMode !== 'manual';
          resetRoute.addEventListener('click', () => {
            snapshot();
            unlockBindingRoute(r);
            render(); renderProps();
            flashStatus(uiText('Switched to automatic orthogonal routing.', '자동 직교 라우팅으로 전환했습니다'));
          });
          const routeButtons = document.createElement('div');
          routeButtons.className = 'prop-row';
          routeButtons.append(addPoint, resetRoute);
          box.appendChild(routeButtons);
    
          const editHint = document.createElement('div');
          editHint.className = 'prop-hint';
          editHint.textContent = uiText(
            'Drag a blue waypoint to move it. Double-click it to remove it. Alt/Option+double-click the line to add one.',
            '파란 굴곡점을 드래그해 이동 · 굴곡점을 더블클릭해 삭제 · 선을 Option/Alt+더블클릭해 해당 위치에 추가',
          );
          box.appendChild(editHint);
        }
        if (isInteractionMsg(r.kind)) {
          box.appendChild(propRow(uiText('Sequence Number', '시퀀스 번호'), textInput(r.seqNo != null ? String(r.seqNo) : '', v => {
            r.seqNo = v.trim();
          }), uiText('Leave blank for automatic numbering or enter a fixed number, e.g. 1.1.', '비우면 자동 번호 · 값을 넣으면 고정 번호 사용 (예: 1.1)')));
        }
        if (isCommMsg(r.kind) || r.kind === 'timingmessage') {
          const sort = document.createElement('select');
          [
            ['synchCall', uiLabel('Synchronous Call', '동기 호출')],
            ['asynchCall', uiLabel('Asynchronous Call', '비동기 호출')],
            ['asynchSignal', uiLabel('Asynchronous Signal', '비동기 신호')],
            ['reply', uiLabel('Reply', '응답')],
            ['createMessage', uiLabel('Create Message', '생성 메시지')],
            ['deleteMessage', uiLabel('Delete Message', '삭제 메시지')],
          ].forEach(([value, label]) => {
            const option = document.createElement('option');
            option.value = value; option.textContent = label;
            if ((r.messageSort || 'synchCall') === value) option.selected = true;
            sort.appendChild(option);
          });
          sort.addEventListener('change', () => {
            snapshot();
            r.messageSort = sort.value;
            render(); renderProps();
          });
          box.appendChild(propRow(uiLabel('Message Sort', '메시지 종류'), sort, uiText(
            'Choose a synchronous, asynchronous, reply, create, or delete message arrow.',
            '동기·비동기·응답·생성·삭제 메시지 화살표를 선택합니다.',
          )));
          const connector = r.kind === 'timingmessage' ? null : relById(r.connectorId);
          if (connector) {
            const hint = document.createElement('div');
            hint.className = 'prop-hint';
            hint.textContent = uiText(
              'Attached to connector {0}. The message moves when the connector moves or is reconnected.',
              '커넥터 {0}에 종속 · 커넥터 이동/재연결 시 메시지도 함께 이동합니다.',
              connector.id,
            );
            box.appendChild(hint);
          }
        }
        if (ER_RELATION_KINDS.has(r.kind)) erdForeignKeyProperty(box, r);
        if (relationSupportsEndQuickEdit(r)) {
          relationEndPropertySection(box, r, 'source');
          relationEndPropertySection(box, r, 'target');
        } else if (!isInteractionMsg(r.kind) && r.kind !== 'notelink' && r.kind !== 'transition'
          && r.kind !== 'timingmessage' && r.kind !== 'informationflow'
          && r.kind !== 'bindingconnector'
          && !REQUIREMENT_RELATION_KINDS.has(r.kind)) {
          box.appendChild(propRow(uiLabel('Source label (multiplicity)', '출발 라벨 (다중성)'), textInput(r.sourceLabel, v => r.sourceLabel = v), uiText(
            'Examples: 1, 0..*, owner',
            '예: 1, 0..*, owner',
          )));
          box.appendChild(propRow(uiLabel('Target label (multiplicity)', '도착 라벨 (다중성)'), textInput(r.targetLabel, v => r.targetLabel = v)));
        }
        if (!isInteractionMsg(r.kind)) {
          const hint = document.createElement('div');
          hint.className = 'prop-hint';
          hint.textContent = uiText(
            'Select the line and drag an end handle to move the endpoint, or drop it on another element to reconnect.',
            '선을 선택하면 나타나는 양 끝 사각 핸들을 드래그해 연결 위치를 바꾸거나, 다른 요소 위에 놓아 재연결할 수 있습니다.',
          );
          box.appendChild(hint);
          if (r.srcAnchor || r.dstAnchor) {
            const btn = document.createElement('button');
            btn.className = 'prop-btn';
            btn.textContent = uiText('Reset Endpoints (Automatic)', '선 연결점 초기화 (자동 배치)');
            btn.addEventListener('click', () => {
              snapshot();
              delete r.srcAnchor; delete r.dstAnchor;
              render(); renderProps();
            });
            const row = document.createElement('div');
            row.className = 'prop-row';
            row.appendChild(btn);
            box.appendChild(row);
          }
        }
    }
    
    function renderProps() {
      const box = document.getElementById('props');
      if (!box) return undefined;
      const captured = capturePropertyFocus(box);
      box.innerHTML = '';
      if (!renderSelectionState(box)) {
        const id = state.selectedId;
        const element = byId(id);
        if (element) {
          renderElementProperties(box, element);
        } else {
          const relation = relById(id);
          if (relation) renderRelationProperties(box, relation);
        }
      }
      restorePropertyFocus(box, captured);
      return box;
    }

    return Object.freeze({
      render: renderProps,
      renderSelectionState,
      renderElementProperties,
      renderRelationProperties,
    });
  }

  return Object.freeze({ REQUIRED_FUNCTIONS, REQUIRED_VALUES, selectionMode, create });
}
