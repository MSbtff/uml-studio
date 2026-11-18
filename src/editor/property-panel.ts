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
  KIND_META: Partial<Record<string, { label: string }>>;
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
  "KIND_META",
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
      KIND_META,
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
        ? `${end === 'source' ? '출발' : '도착'} · ${endpoint?.name || '엔티티'} 참여 조건`
        : `${end === 'source' ? 'Source' : 'Target'} End`;
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
            expression.setCustomValidity(parsed.error || '이름 표현식이 올바르지 않습니다.');
            return;
          }
          r[`${prefix}EndName`] = parsed.name;
          r[`${prefix}EndStereotype`] = parsed.stereotype || undefined;
          r[`${prefix}EndVisibility`] = parsed.visibility ? VISIBILITY_VALUE[parsed.visibility] : undefined;
        }
        render();
      });
      box.appendChild(propRow(erd ? 'End Name' : 'Name Expression', expression,
        erd ? '관계 끝점 역할 이름' : '예: «role» + owner'));
    
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
          flashStatus(`${end === 'source' ? '출발' : '도착'} 엔티티 참여 조건을 ${cardinality.value}(으)로 변경했습니다`);
        });
        box.appendChild(propRow('참여 개수', cardinality,
          '0..1 선택 한 개 · 1 필수 한 개 · 0..N 선택 여러 개 · 1..N 필수 여러 개'));

        const columnField = `${prefix}ColumnName` as const;
        const columnSelect = document.createElement('select');
        columnSelect.className = 'erd-relation-column-select';
        columnSelect.dataset.relationColumnEnd = end;
        const none = document.createElement('option');
        none.value = ''; none.textContent = '(컬럼 선택 안 함)';
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
          missing.textContent = `⚠ 존재하지 않는 컬럼 · ${selectedColumn}`;
          missing.selected = true;
          columnSelect.appendChild(missing);
        }
        columnSelect.value = selectedColumn;
        columnSelect.addEventListener('change', () => {
          snapshot(); r[columnField] = columnSelect.value; render(); renderProps();
          flashStatus(`${end === 'source' ? '출발' : '도착'} 엔티티의 관계 컬럼을 ${columnSelect.value || '선택 해제'}했습니다`);
        });
        box.appendChild(propRow('연결 컬럼', columnSelect,
          '컬럼 이름 변경·삭제로 연결이 끊기면 경고가 표시됩니다.'));
      } else {
        box.appendChild(propRow('Multiplicity',
          textInput(r[multiplicityField], value => { r[multiplicityField] = value; }),
          '예: 1, *, 0..1, 0..*'));
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
        addSelect('Navigability', `${prefix}Navigability`, relationEndNavigability(r, end), [
          ['unspecified', 'Unspecified'], ['navigable', 'Navigable'], ['notNavigable', 'Not Navigable'],
        ], '화살표/금지 표기로 탐색 가능성을 표시합니다.');
        addSelect('Aggregation', `${prefix}Aggregation`, relationEndAggregation(r, end), [
          ['none', 'None'], ['shared', 'Shared'], ['composite', 'Composite'],
        ], 'Shared는 빈 마름모, Composite는 채운 마름모입니다.');
        if (ASSOCIATION_QUALIFIER_KINDS.has(r.kind)) {
          box.appendChild(propRow('Qualifiers', textArea(
            (r[`${prefix}Qualifiers`] || []).join('\n'),
            value => { r[`${prefix}Qualifiers`] = value.split(/\r?\n/).map(x => x.trim()).filter(Boolean).slice(0, 50); },
          ), '한 줄에 하나씩 입력합니다.'));
        }
      }
      const quickEdit = document.createElement('button');
      quickEdit.type = 'button'; quickEdit.className = 'prop-btn';
      quickEdit.textContent = `${end === 'source' ? 'Source' : 'Target'} End QuickEdit…`;
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
      none.value = ''; none.textContent = '(Classifier 선택 안 함)';
      select.appendChild(none);
      Object.values(state.models)
        .filter(model => allowedKinds.includes(model.kind))
        .sort((a, b) => String(a.name || '').localeCompare(String(b.name || '')))
        .forEach(model => {
          const option = document.createElement('option');
          option.value = model.id;
          option.textContent = `${KIND_META[model.kind]?.label || model.kind} · ${model.name || '(unnamed)'}`;
          if (e.classifierModelId === model.id) option.selected = true;
          select.appendChild(option);
        });
      select.addEventListener('change', () => {
        snapshot();
        e.classifierModelId = select.value;
        e.w = 0; e.h = 0;
        render(); renderProps();
      });
      return propRow(label, select, '프로젝트 모델 저장소의 실제 Classifier를 참조하며 이름 변경도 표기에 동기화됩니다.');
    }
    
    function modelReferenceProperty(e: DiagramElement, field: ModelReferenceField, label: string, allowedKinds: readonly string[], emptyLabel: string, hint: string) {
      const select = document.createElement('select');
      const none = document.createElement('option');
      none.value = ''; none.textContent = emptyLabel || '(선택 안 함)';
      select.appendChild(none);
      Object.values(state.models)
        .filter(model => allowedKinds.includes(model.kind) && model.id !== e.modelId)
        .sort((a, b) => String(a.name || '').localeCompare(String(b.name || '')))
        .forEach(model => {
          const option = document.createElement('option');
          option.value = model.id;
          option.textContent = `${KIND_META[model.kind]?.label || model.kind} · ${model.name || '(unnamed)'}`;
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
      none.value = ''; none.textContent = '(Sequence Diagram 선택)';
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
      const row = propRow('Referenced Sequence', select,
        e.kind === 'interactioninline'
          ? '프레임 안에 축약된 Sequence를 표시합니다. 새 inline 요소를 만들면 Sequence Diagram도 자동 생성됩니다.'
          : '실행할 Interaction을 참조합니다. Interaction Overview에서는 ref 프레임으로 표시됩니다.');
      const open = document.createElement('button');
      open.type = 'button';
      open.className = 'prop-action';
      open.textContent = 'Open Sequence Diagram';
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
        box.innerHTML = `<div class="prop-kind">요소 ${state.selection.length}개 선택됨</div>
          <div class="prop-hint">드래그로 함께 이동 · Ctrl+C 복사(내부 관계 포함) · Del 일괄 삭제<br>Shift+클릭으로 선택 추가/해제</div>`;
        return true;
      }
      const id = state.selectedId;
      if (!id) {
        box.innerHTML = `<div class="prop-empty">선택된 요소가 없습니다.<br>빈 캔버스를 드래그하면 사각형으로<br>여러 요소를 한 번에 선택할 수 있습니다.</div>`;
        return true;
      }
      return false;
    }
    
    function renderElementProperties(box: HTMLElement, e: DiagramElement) {
        const kind = document.createElement('span');
        kind.className = 'prop-kind';
        kind.textContent = (e.kind === 'lifeline' && e.isActor) ? 'Actor' : KIND_META[e.kind]?.label || e.kind;
        box.appendChild(kind);
        const usage = document.createElement('div');
        usage.className = 'prop-hint model-usage';
        const viewCount = state.diagrams.reduce((n, d) => n + d.elements.filter(v => v.modelId === e.modelId).length, 0);
        usage.textContent = `Model ${e.modelId} · ${viewCount} view${viewCount === 1 ? '' : 's'}`;
        box.appendChild(usage);
    
        if (!NO_NAME_RENDER.has(e.kind) || e.kind === 'initial' || e.kind === 'final' || e.kind === 'forkbar') {
          box.appendChild(propRow('Name', textInput(e.name, v => e.name = v)));
        }
        if (dg().type === 'package' && PACKAGE_CONTAINER_KINDS.has(e.kind)) {
          const visibility = document.createElement('select');
          [
            ['public', 'Public (+)'], ['protected', 'Protected (#)'],
            ['private', 'Private (-)'], ['package', 'Package (~)'],
          ].forEach(([value, label]) => {
            const option = document.createElement('option');
            option.value = value; option.textContent = label;
            if ((e.visibility || 'public') === value) option.selected = true;
            visibility.appendChild(option);
          });
          visibility.addEventListener('change', () => {
            snapshot(); e.visibility = visibility.value; render(); renderProps();
          });
          box.appendChild(propRow('Visibility', visibility, 'UML 이름 표현식에 +, #, -, ~ 기호로 표시됩니다.'));
          if (e.kind === 'package') {
            box.appendChild(propRow('Stereotype', textInput(e.stereotype, value => e.stereotype = value), '선택 사항 · 예: layer'));
          }
          const owner = byId(e.parentId);
          const children = childViews(e.id).filter(child => PACKAGE_CONTAINER_KINDS.has(child.kind));
          const hint = document.createElement('div');
          hint.className = 'prop-hint';
          hint.textContent = `Owner: ${owner ? owner.name : '(root)'} · 포함 요소 ${children.length}개 · 내부에 생성하거나 드롭하면 자동으로 중첩됩니다.`;
          box.appendChild(hint);
        }
        if (dg().type === 'profile' && (e.kind === 'metaclass' || e.kind === 'stereotype')) {
          const visibility = document.createElement('select');
          [
            ['public', 'Public (+)'], ['protected', 'Protected (#)'],
            ['private', 'Private (-)'], ['package', 'Package (~)'],
          ].forEach(([value, label]) => {
            const option = document.createElement('option');
            option.value = value; option.textContent = label;
            if ((e.visibility || 'public') === value) option.selected = true;
            visibility.appendChild(option);
          });
          visibility.addEventListener('change', () => {
            snapshot(); e.visibility = visibility.value; render(); renderProps();
          });
          box.appendChild(propRow('Visibility', visibility, 'UML 이름 표현식에 +, #, -, ~ 기호로 표시됩니다.'));
          if (e.kind === 'metaclass') {
            const extensionCount = dg().relations.filter(relation =>
              relation.kind === 'extension' && relation.to === e.id).length;
            const hint = document.createElement('div');
            hint.className = 'prop-hint';
            hint.textContent = `이 UML MetaClass를 확장하는 Stereotype ${extensionCount}개`;
            box.appendChild(hint);
          } else {
            box.appendChild(propRow('Attributes', textArea((e.attributes || []).join('\n'), value => {
              e.attributes = value.split('\n').filter(line => line.trim() !== '');
            }), 'Stereotype의 tag definition · 예: + tableName: String'));
            box.appendChild(propRow('Operations', textArea((e.operations || []).join('\n'), value => {
              e.operations = value.split('\n').filter(line => line.trim() !== '');
            }), '한 줄에 하나씩 · 예: + validate(): Boolean'));
            const iconArea = textArea(e.iconContent || '', value => {
              e.iconContent = value;
            });
            const iconRow = propRow('Icon Script', iconArea);
            const iconHint = document.createElement('div');
            iconHint.className = 'prop-hint';
            const updateIconHint = () => {
              const parsed = parseIconScript(iconArea.value);
              iconHint.textContent = parsed.valid
                ? `안전한 도형 명령 ${parsed.commands.length}개 · 좌표계 ${parsed.width}×${parsed.height}`
                : `오류: ${parsed.errors[0]}`;
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
            ['public', 'Public (+)'], ['protected', 'Protected (#)'],
            ['private', 'Private (-)'], ['package', 'Package (~)'],
          ].forEach(([value, label]) => {
            const option = document.createElement('option');
            option.value = value; option.textContent = label;
            if ((e.visibility || 'public') === value) option.selected = true;
            visibility.appendChild(option);
          });
          visibility.addEventListener('change', () => {
            snapshot(); e.visibility = visibility.value; e.w = 0; e.h = 0; render(); renderProps();
          });
          box.appendChild(propRow('Visibility', visibility, '이름 앞에 +, #, -, ~ 기호로 표시됩니다.'));
          box.appendChild(propRow('Stereotype', textInput(e.stereotype || 'information', value => {
            e.stereotype = value || 'information'; e.w = 0; e.h = 0;
          }), '기본값: information'));
          box.appendChild(propRow('Attributes', textArea((e.attributes || []).join('\n'), value => {
            e.attributes = value.split('\n').filter(line => line.trim() !== '');
          }), '한 줄에 하나씩 · 예: + format: String'));
          box.appendChild(propRow('Operations', textArea((e.operations || []).join('\n'), value => {
            e.operations = value.split('\n').filter(line => line.trim() !== '');
          }), '한 줄에 하나씩 · 예: + serialize(): String'));
          box.appendChild(propRow('Receptions', textArea((e.receptions || []).join('\n'), value => {
            e.receptions = value.split('\n').filter(line => line.trim() !== '');
          }), '수신 가능한 Signal · 한 줄에 하나씩'));
        }
        if (e.kind === 'requirement') {
          const visibility = document.createElement('select');
          [
            ['public', 'Public (+)'], ['protected', 'Protected (#)'],
            ['private', 'Private (-)'], ['package', 'Package (~)'],
          ].forEach(([value, label]) => {
            const option = document.createElement('option');
            option.value = value; option.textContent = label;
            if ((e.visibility || 'public') === value) option.selected = true;
            visibility.appendChild(option);
          });
          visibility.addEventListener('change', () => {
            snapshot(); e.visibility = visibility.value; e.w = 0; e.h = 0; render(); renderProps();
          });
          box.appendChild(propRow('Visibility', visibility, '이름 앞에 +, #, -, ~ 기호로 표시됩니다.'));
    
          const type = document.createElement('select');
          REQUIREMENT_TYPES.forEach(value => {
            const option = document.createElement('option');
            option.value = value; option.textContent = value;
            if ((e.requirementType || 'requirement') === value) option.selected = true;
            type.appendChild(option);
          });
          type.addEventListener('change', () => {
            snapshot(); e.requirementType = type.value; e.w = 0; e.h = 0; render(); renderProps();
          });
          box.appendChild(propRow('Requirement Type', type,
            'SysML Requirement 종류 · functional, interface, performance, physical, design constraint'));
          box.appendChild(propRow('ID', textInput(e.requirementId, value => {
            e.requirementId = value; e.w = 0; e.h = 0;
          }), '프로젝트 전체에서 고유해야 합니다 · 예: REQ-RND-001'));
          box.appendChild(propRow('Text', textArea(e.requirementText, value => {
            e.requirementText = value; e.h = 0;
          }), '검증 가능한 shall 문장으로 작성합니다.'));
    
          const risk = document.createElement('select');
          ['Low', 'Medium', 'High'].forEach(value => {
            const option = document.createElement('option');
            option.value = value; option.textContent = value;
            if ((e.risk || 'Medium') === value) option.selected = true;
            risk.appendChild(option);
          });
          risk.addEventListener('change', () => {
            snapshot(); e.risk = risk.value; render(); renderProps();
          });
          box.appendChild(propRow('Risk', risk));
    
          const method = document.createElement('select');
          ['Analysis', 'Inspection', 'Test', 'Demonstration'].forEach(value => {
            const option = document.createElement('option');
            option.value = value; option.textContent = value;
            if ((e.verificationMethod || 'Analysis') === value) option.selected = true;
            method.appendChild(option);
          });
          method.addEventListener('change', () => {
            snapshot(); e.verificationMethod = method.value; render(); renderProps();
          });
          box.appendChild(propRow('Verification Method', method,
            'Mermaid Requirement Diagram과 동일한 Analysis · Inspection · Test · Demonstration 값입니다.'));
        }
        if (BDD_CLASSIFIER_KINDS.has(e.kind)) {
          const visibility = document.createElement('select');
          [
            ['public', 'Public (+)'], ['protected', 'Protected (#)'],
            ['private', 'Private (-)'], ['package', 'Package (~)'],
          ].forEach(([value, label]) => {
            const option = document.createElement('option');
            option.value = value; option.textContent = label;
            if ((e.visibility || 'public') === value) option.selected = true;
            visibility.appendChild(option);
          });
          visibility.addEventListener('change', () => {
            snapshot(); e.visibility = visibility.value; e.w = 0; e.h = 0; render(); renderProps();
          });
          box.appendChild(propRow('Visibility', visibility, '이름 앞에 +, #, -, ~ 기호로 표시됩니다.'));
    
          const abstract = document.createElement('label');
          abstract.className = 'prop-check';
          const abstractCheck = document.createElement('input');
          abstractCheck.type = 'checkbox'; abstractCheck.checked = !!e.isAbstract;
          abstractCheck.addEventListener('change', () => {
            snapshot(); e.isAbstract = abstractCheck.checked; render(); renderProps();
          });
          abstract.append(abstractCheck, document.createTextNode('Abstract (이탤릭 이름)'));
          const abstractRow = document.createElement('div');
          abstractRow.className = 'prop-row'; abstractRow.appendChild(abstract);
          box.appendChild(abstractRow);
    
          const listArea = (label: string, field: StringListField, hint: string) => {
            box.appendChild(propRow(label, textArea((e[field] || []).join('\n'), value => {
              e[field] = value.split('\n').filter(line => line.trim() !== '');
              e.w = 0; e.h = 0;
            }), hint));
          };
          listArea('Constraints', 'constraints', '한 줄에 하나씩 · 예: { renderTime <= frameBudget }');
          if (e.kind === 'valuetype') {
            box.appendChild(propRow('Unit', textInput(e.valueTypeUnit, value => {
              e.valueTypeUnit = value; e.w = 0; e.h = 0;
            }), '예: ms, kg, V'));
            box.appendChild(propRow('Quantity Kind', textInput(e.quantityKind, value => {
              e.quantityKind = value; e.w = 0; e.h = 0;
            }), '예: Time, Mass, Voltage'));
            listArea('Attributes', 'properties', 'Value Type의 속성 · 예: + magnitude: Real');
          } else if (e.kind === 'constraintblock') {
            listArea('Parameters', 'constraintParameters', 'Constraint Parameter · 예: renderTime: Milliseconds');
            listArea('Properties', 'properties', '일반 Property · 한 줄에 하나씩');
          } else {
            listArea('Parts', 'parts', '합성 Part Property · 예: canvas: CanvasSubsystem [1]');
            listArea('References', 'references', 'Reference Property · 예: metrics: MetricsService [0..1]');
            listArea('Values', 'values', 'Value Property · 예: frameBudget: Milliseconds = 100');
            listArea('Flow Properties', 'flowProperties', '방향 포함 · 예: in document: DiagramDocument');
            listArea('Constraint Properties', 'constraintProperties', '예: budget: RenderBudget');
            listArea('Properties', 'properties', '기타 Property · 한 줄에 하나씩');
          }
          listArea('Operations', 'operations', '예: + render(document: DiagramDocument): RenderedFrame');
          if (e.kind !== 'constraintblock') {
            listArea('Receptions', 'receptions', '수신 가능한 Signal · 한 줄에 하나씩');
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
            chk.appendChild(c); chk.appendChild(document.createTextNode('액터로 표기 (사람 모양)'));
            const row = document.createElement('div'); row.className = 'prop-row'; row.appendChild(chk);
            box.appendChild(row);
          }
          box.appendChild(propRow('Stereotype («»)', textInput(e.stereotype, v => { e.stereotype = v; e.w = 0; e.h = 0; }),
            '<< >> 주석 · 예: boundary, control, entity'));
          if (dg().type === 'communication' || dg().type === 'timing') {
            box.appendChild(classifierProperty(e, 'Classifier',
              ['class', 'interface', 'enumeration', 'component', 'artifact', 'node']));
          }
        }
        if (e.kind === 'stateinvariant') {
          const hint = document.createElement('div');
          hint.className = 'prop-hint';
          hint.textContent = '{ } 안에 표시됩니다 · 예: user.authenticated == true';
          box.appendChild(hint);
        }
        if (e.kind === 'interactionuse' || e.kind === 'interactioninline') {
          box.appendChild(interactionDiagramProperty(e));
          const hint = document.createElement('div');
          hint.className = 'prop-hint';
          hint.textContent = '참조가 설정되면 프레임을 더블클릭해서 해당 Sequence Diagram을 열 수 있습니다.';
          box.appendChild(hint);
        }
        if (e.kind === 'execution') {
          const hint = document.createElement('div');
          hint.className = 'prop-hint';
          hint.textContent = '실행 사양(execution) 박스 · 같은 라이프라인에서 시간 구간이 겹치면 오른쪽으로 자동 중첩 · 위/아래 이동 · 아래 핸들로 길이 조정';
          box.appendChild(hint);
        }
        if (e.kind === 'class') {
          box.appendChild(propRow('Stereotype', textInput(e.stereotype, v => e.stereotype = v)));
          const chk = document.createElement('label');
          chk.className = 'prop-check';
          const c = document.createElement('input');
          c.type = 'checkbox'; c.checked = !!e.isAbstract;
          c.addEventListener('change', () => { snapshot(); e.isAbstract = c.checked; render(); });
          chk.appendChild(c); chk.appendChild(document.createTextNode('Abstract (이탤릭 이름)'));
          const row = document.createElement('div'); row.className = 'prop-row'; row.appendChild(chk);
          box.appendChild(row);
          box.appendChild(propRow('Attributes', textArea((e.attributes || []).join('\n'), v => {
            e.attributes = v.split('\n').filter(s => s.trim() !== '');
          }), '한 줄에 하나씩 · 예: + name: String'));
          box.appendChild(propRow('Operations', textArea((e.operations || []).join('\n'), v => {
            e.operations = v.split('\n').filter(s => s.trim() !== '');
          }), '예: + getName(): String'));
        }
        if (e.kind === 'interface') {
          box.appendChild(propRow('Attributes', textArea((e.attributes || []).join('\n'), v => {
            e.attributes = v.split('\n').filter(s => s.trim() !== '');
          }), 'Ctrl/Cmd+Enter로 빠르게 추가 · 예: + id: String'));
          box.appendChild(propRow('Operations', textArea((e.operations || []).join('\n'), v => {
            e.operations = v.split('\n').filter(s => s.trim() !== '');
          }), '예: + draw(ctx: Context): void'));
        }
        if (e.kind === 'enumeration') {
          box.appendChild(propRow('Literals', textArea((e.literals || []).join('\n'), v => {
            e.literals = v.split('\n').filter(s => s.trim() !== '');
          }), '한 줄에 하나씩 · 예: RED'));
          box.appendChild(propRow('Operations', textArea((e.operations || []).join('\n'), v => {
            e.operations = v.split('\n').filter(s => s.trim() !== '');
          }), 'Ctrl/Cmd+Shift+Enter로 빠르게 추가 · 예: + fromCode(): Color'));
        }
        if (e.kind === 'note') {
          box.appendChild(propRow('Text', textArea(e.text, v => e.text = v)));
        }
        if (e.kind === 'entity') {
          box.appendChild(erdDisplayModeProperty());
          box.appendChild(propRow('Logical Name (논리명)', textInput(e.logicalName, v => e.logicalName = v), '논리 모델 보기에서 표시되는 이름 · 예: 회원'));
          box.appendChild(erdColumnsProperty(e));
          box.appendChild(erdSchemaProperty(e));
        }
        if (e.kind === 'node') {
          box.appendChild(propRow('Stereotype', textInput(e.stereotype, v => e.stereotype = v), '예: device, executionEnvironment'));
        }
        if (e.kind === 'timingstate') {
          const owner = byId(e.parentId);
          const hint = document.createElement('div');
          hint.className = 'prop-hint';
          hint.textContent = `Owner: ${owner ? owner.name : '(missing)'} · 이 행을 클릭해 Time Segment를 추가할 수 있습니다.`;
          box.appendChild(hint);
        }
        if (e.kind === 'timesegment') {
          box.appendChild(propRow('Start Time', textInput(e.startTime, value => e.startTime = value), '예: 10 ms'));
          box.appendChild(propRow('End Time', textInput(e.endTime, value => e.endTime = value), '예: 40 ms'));
          const owner = byId(e.parentId);
          const hint = document.createElement('div');
          hint.className = 'prop-hint';
          hint.textContent = `State / Condition: ${owner ? owner.name : '(missing)'} · 좌우로 이동하거나 양 끝 핸들로 기간을 조절합니다.`;
          box.appendChild(hint);
        }
        if (ACTIVITY_CONTAINER_KINDS.has(e.kind)) {
          const childCount = descendantViews(e.id).filter(child => !ACTIVITY_PIN_KINDS.has(child.kind)).length;
          const hint = document.createElement('div');
          hint.className = 'prop-hint';
          hint.textContent = `포함된 Activity 요소 ${childCount}개 · 내부에 요소를 만들거나 드롭하면 함께 이동합니다.`;
          box.appendChild(hint);
        }
        if (e.kind === 'expansionregion') {
          const select = document.createElement('select');
          [['parallel', 'Parallel'], ['iterative', 'Iterative'], ['stream', 'Stream']].forEach(([value, label]) => {
            const option = document.createElement('option');
            option.value = value; option.textContent = label;
            if ((e.expansionMode || 'parallel') === value) option.selected = true;
            select.appendChild(option);
          });
          select.addEventListener('change', () => {
            snapshot(); e.expansionMode = select.value; render(); renderProps();
          });
          box.appendChild(propRow('Expansion Mode', select, 'parallel · iterative · stream 실행 모드를 선택합니다.'));
        }
        if (ACTIVITY_PIN_KINDS.has(e.kind)) {
          const owner = byId(e.parentId);
          const hint = document.createElement('div');
          hint.className = 'prop-hint';
          hint.textContent = `Owner: ${owner ? owner.name : '(missing)'} · 드래그하면 소유 요소의 테두리를 따라 이동합니다.`;
          box.appendChild(hint);
        }
        if (e.kind === 'timetick') {
          box.appendChild(propRow('Time Value', textInput(e.timeValue, value => e.timeValue = value), '시간축 눈금에 표시할 값 · 예: 20 ms'));
        }
        if (e.kind === 'timeconstraint' || e.kind === 'durationconstraint') {
          box.appendChild(propRow('Constraint', textInput(e.constraint, value => {
            e.constraint = value; e.w = 0; e.h = 0;
          }), e.kind === 'timeconstraint' ? '예: {t = 20 ms}' : '예: {20 ms..60 ms}'));
          if (e.kind === 'timeconstraint') {
            const target = byId(e.constrainedViewId) || relById(e.constrainedViewId);
            const hint = document.createElement('div');
            hint.className = 'prop-hint';
            hint.textContent = `Attached to: ${target ? (KIND_META[target.kind]?.label || target.kind) : '(missing)'}`;
            box.appendChild(hint);
          }
        }
        if (e.kind === 'ibdframe') {
          box.appendChild(classifierProperty(e, 'Owning Block', ['block']));
          const hint = document.createElement('div');
          hint.className = 'prop-hint';
          hint.textContent = 'Internal Block Diagram은 선택한 Block의 내부 구조를 나타냅니다.';
          box.appendChild(hint);
        }
        if (e.kind === 'parametricframe') {
          box.appendChild(classifierProperty(e, 'Owning Constraint Block', ['constraintblock']));
          const hint = document.createElement('div');
          hint.className = 'prop-hint';
          hint.textContent = 'Parametric Diagram은 선택한 Constraint Block의 수식과 매개변수 관계를 분석합니다.';
          box.appendChild(hint);
          const sync = document.createElement('button');
          sync.type = 'button'; sync.className = 'prop-btn';
          sync.textContent = 'Constraint Parameters 동기화';
          sync.disabled = instanceClassifier(e)?.kind !== 'constraintblock';
          sync.addEventListener('click', () => syncConstraintParameters(e));
          box.appendChild(sync);
        }
        if (e.kind === 'constraintproperty') {
          box.appendChild(classifierProperty(e, 'Constraint Block Type', ['constraintblock']));
          const equations = constraintPropertyEquations(e);
          const hint = document.createElement('div');
          hint.className = 'prop-hint';
          hint.textContent = equations.length
            ? `Equation: ${equations.join(' · ')}`
            : 'Constraint Block Type을 선택하면 정의된 수식이 자동 표시됩니다.';
          box.appendChild(hint);
          const sync = document.createElement('button');
          sync.type = 'button'; sync.className = 'prop-btn';
          sync.textContent = 'Constraint Parameters 동기화';
          sync.disabled = instanceClassifier(e)?.kind !== 'constraintblock';
          sync.addEventListener('click', () => syncConstraintParameters(e));
          box.appendChild(sync);
        }
        if (e.kind === 'constraintparameter') {
          box.appendChild(classifierProperty(e, 'Type', ['block', 'valuetype']));
          const owner = byId(e.parentId);
          const hint = document.createElement('div');
          hint.className = 'prop-hint';
          hint.textContent = `Owner: ${owner ? owner.name : '(missing)'} · 드래그하면 소유 요소의 테두리를 따라 이동합니다.`;
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
          box.appendChild(classifierProperty(e, 'Type',
            allowedKinds));
          const owner = byId(e.parentId);
          const hint = document.createElement('div');
          hint.className = 'prop-hint';
          hint.textContent = `Owner: ${owner ? owner.name : '(missing)'}${e.kind === 'port' ? ' · 드래그하면 소유 요소의 테두리를 따라 이동합니다.' : ''}`;
          box.appendChild(hint);
        }
        if (e.kind === 'value' && dg().type === 'parametric') {
          const defaultInput = textInput(e.defaultValue, value => {
            e.defaultValue = value; e.w = 0; e.h = 0;
          });
          const defaultRow = propRow('Default Value', defaultInput,
            '분석 입력의 초기값 또는 단위 포함 값 · 예: 100 ms');
          const unitHint = document.createElement('div');
          unitHint.className = 'prop-hint';
          const updateUnitHint = () => {
            const compatibility = defaultValueUnitCompatibility(e.defaultValue, instanceClassifier(e));
            unitHint.dataset.compatibility = compatibility.status;
            unitHint.textContent = `Default Unit · ${compatibility.message}`;
            unitHint.style.color = (compatibilityColors[compatibility.status] || '');
          };
          defaultInput.addEventListener('input', updateUnitHint);
          updateUnitHint();
          defaultRow.appendChild(unitHint);
          box.appendChild(defaultRow);
        }
        if (e.kind === 'port') {
          box.appendChild(modelReferenceProperty(e, 'providedInterfaceModelId', 'Provided Interface', ['interface', 'interfaceblock'],
            '(제공 인터페이스 없음)', '선택하면 Port 바깥쪽에 lollipop 표기가 나타납니다.'));
          box.appendChild(modelReferenceProperty(e, 'requiredInterfaceModelId', 'Required Interface', ['interface', 'interfaceblock'],
            '(요구 인터페이스 없음)', '선택하면 Port 바깥쪽에 socket 표기가 나타납니다.'));
        }
        if (e.kind === 'collaborationuse') {
          box.appendChild(modelReferenceProperty(e, 'collaborationModelId', 'Collaboration', ['collaboration'],
            '(Collaboration 선택)', '프로젝트 모델 저장소의 실제 Collaboration을 참조합니다.'));
          const owner = byId(e.parentId);
          const hint = document.createElement('div');
          hint.className = 'prop-hint';
          hint.textContent = `Owner: ${owner ? owner.name : '(missing)'} · Role Binding으로 Part 역할을 연결하세요.`;
          box.appendChild(hint);
        }
        if (INSTANCE_KINDS.has(e.kind)) {
          const select = document.createElement('select');
          const none = document.createElement('option');
          none.value = ''; none.textContent = '(Classifier 선택 안 함)';
          select.appendChild(none);
          const allowedKinds = INSTANCE_CLASSIFIER_KINDS[e.kind] || [];
          Object.values(state.models)
            .filter(model => allowedKinds.includes(model.kind))
            .sort((a, b) => String(a.name || '').localeCompare(String(b.name || '')))
            .forEach(model => {
              const option = document.createElement('option');
              option.value = model.id;
              option.textContent = `${KIND_META[model.kind]?.label || model.kind} · ${model.name || '(unnamed)'}`;
              if (e.classifierModelId === model.id) option.selected = true;
              select.appendChild(option);
            });
          select.addEventListener('change', () => {
            snapshot();
            e.classifierModelId = select.value;
            render(); renderProps();
          });
          box.appendChild(propRow(e.kind === 'object' ? 'Classifier' : 'Type', select,
            '프로젝트 모델 저장소의 실제 Classifier를 참조합니다. 이름 변경도 인스턴스 표기에 동기화됩니다.'));
          if (e.kind === 'object') {
            box.appendChild(propRow('Slots', textArea((e.slots || []).join('\n'), value => {
              e.slots = value.split('\n').filter(line => line.trim() !== '');
            }), '한 줄에 하나씩 · 형식: visibility name: type = value · 예: + visible: boolean = true'));
          }
        }
        if (e.kind === 'state' || e.kind === 'compositestate' || e.kind === 'submachinestate') {
          box.appendChild(propRow('Entry', textInput(e.entry, v => e.entry = v), '상태에 진입할 때 수행 · 표기: entry / 동작'));
          box.appendChild(propRow('Do Activity', textInput(e.doActivity, v => e.doActivity = v), '상태에 머무는 동안 수행 · 표기: do / 동작'));
          box.appendChild(propRow('Exit', textInput(e.exit, v => e.exit = v), '상태에서 나갈 때 수행 · 표기: exit / 동작'));
          box.appendChild(propRow('Internal Transitions', textArea((e.internalTransitions || []).join('\n'), v => {
            e.internalTransitions = v.split('\n').filter(s => s.trim() !== '');
          }), '한 줄에 하나씩 · 예: retry [count < 3] / reconnect()'));
          if (e.kind === 'compositestate') {
            const regionCount = childViews(e.id).filter(x => x.kind === 'region').length;
            const hint = document.createElement('div');
            hint.className = 'prop-hint';
            hint.textContent = regionCount > 1
              ? `Orthogonal Composite State · Region ${regionCount}개가 동시에 활성화될 수 있습니다.`
              : `Composite State · Region ${regionCount}개 · Toolbox의 Region으로 직교 영역을 추가할 수 있습니다.`;
            box.appendChild(hint);
          }
          if (e.kind === 'submachinestate') {
            const select = document.createElement('select');
            const none = document.createElement('option');
            none.value = ''; none.textContent = '(State Machine 선택)';
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
            box.appendChild(propRow('Referenced State Machine', select,
              '이 상태가 호출할 State Machine을 지정합니다. Connection Point Reference는 이 상태의 테두리에만 부착됩니다.'));
          }
        }
        if (e.kind === 'region') {
          const owner = byId(e.parentId);
          const hint = document.createElement('div');
          hint.className = 'prop-hint';
          hint.textContent = `Owner: ${owner ? owner.name : '(missing)'} · Region 안에 상태를 생성하거나 드롭하면 자동으로 포함됩니다.`;
          box.appendChild(hint);
        }
        if (e.kind === 'connectionpointref') {
          const select = document.createElement('select');
          [['entry', 'Entry reference'], ['exit', 'Exit reference']].forEach(([value, label]) => {
            const option = document.createElement('option');
            option.value = value; option.textContent = label;
            if ((e.referenceKind || 'entry') === value) option.selected = true;
            select.appendChild(option);
          });
          select.addEventListener('change', () => { snapshot(); e.referenceKind = select.value; render(); renderProps(); });
          box.appendChild(propRow('Reference kind', select,
            'Entry는 호출 전이를 받아 서브머신으로 진입하고, Exit는 서브머신에서 돌아온 뒤 외부 전이를 내보냅니다.'));
          const owner = byId(e.parentId);
          const hint = document.createElement('div');
          hint.className = 'prop-hint';
          hint.textContent = `Owner: ${owner ? owner.name : '(missing)'} · 드래그하면 상태 테두리를 따라 이동합니다.`;
          box.appendChild(hint);
        }
        if (e.kind === 'entrypoint' || e.kind === 'exitpoint') {
          const hint = document.createElement('div');
          hint.className = 'prop-hint';
          hint.textContent = e.kind === 'entrypoint'
            ? 'State Machine으로 들어오는 연결점입니다.'
            : 'State Machine에서 호출한 상태로 돌아가는 연결점입니다.';
          box.appendChild(hint);
        }
        if (e.kind === 'terminate') {
          const hint = document.createElement('div');
          hint.className = 'prop-hint';
          hint.textContent = '도달하면 현재 State Machine의 실행 컨텍스트 전체를 종료합니다. 나가는 Transition은 허용되지 않습니다.';
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
          box.appendChild(propRow('Operator', sel));
          box.appendChild(propRow('Condition', textInput(e.condition, v => e.condition = v), 'operand가 없을 때 표시 · 예: [for each layer]'));
          box.appendChild(propRow('Interaction Operands (구역)', textArea((e.operands || []).join('\n'), v => {
            e.operands = v.split('\n').filter(s => s.trim() !== '');
          }), '한 줄에 하나씩 guard 입력. 프레임 안의 점선을 위아래로 드래그해 구역 높이를 조절합니다.'));
        }
        if (!['fragment', 'actor', 'initial', 'final', 'flowfinal', 'forkbar', 'joinbar', 'inputpin', 'outputpin',
          'expansioninput', 'expansionoutput', 'boundary', 'entity', 'frame', 'stateinvariant', 'execution',
          'stateinitial', 'statefinal', 'choice', 'junction', 'statefork', 'shallowhistory', 'deephistory', 'region',
          'entrypoint', 'exitpoint', 'terminate', 'connectionpointref', 'timingstate', 'timetick',
          'timeconstraint', 'durationconstraint'].includes(e.kind)) {
          const color = document.createElement('input');
          color.type = 'color'; color.value = e.fill || FILL_DEFAULT;
          color.addEventListener('change', () => { snapshot(); e.fill = color.value; render(); });
          box.appendChild(propRow('Fill Color', color));
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
        usage.textContent = `Model ${r.modelId} · ${viewCount} view${viewCount === 1 ? '' : 's'}`;
        box.appendChild(usage);
        if (r.kind === 'transition') {
          box.appendChild(propRow('Name (model)', textInput(r.name, v => r.name = v), '전이 모델 이름 · 아래 서명이 있으면 캔버스에는 서명이 표시됩니다'));
          box.appendChild(propRow('Trigger (event)', textInput(r.trigger, v => r.trigger = v), '예: submit, after(5s)'));
          box.appendChild(propRow('Guard', textInput(r.guard, v => r.guard = v), '대괄호는 자동으로 붙습니다 · 예: isValid'));
          box.appendChild(propRow('Effect', textInput(r.effect, v => r.effect = v), '전이 시 수행 · 예: save()'));
        } else {
          box.appendChild(propRow('Name', textInput(r.name, v => r.name = v),
            AUTO_LABEL[r.kind] ? `${AUTO_LABEL[r.kind]} 라벨은 자동 표시됩니다` : undefined));
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
              option.textContent = `${KIND_META[model.kind]?.label || model.kind} · ${model.name || '(unnamed)'}`;
              option.selected = (r.conveyedModelIds || []).includes(model.id);
              conveyed.appendChild(option);
            });
          conveyed.addEventListener('change', () => {
            snapshot();
            r.conveyedModelIds = Array.from(conveyed.selectedOptions).map(option => option.value);
            render(); renderProps();
          });
          box.appendChild(propRow('Conveyed Information', conveyed,
            'Ctrl/⌘ 또는 Shift로 여러 Information Item·Classifier를 선택할 수 있습니다.'));
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
            option.textContent = `${KIND_META[model.kind]?.label || model.kind} · ${model.name || '(unnamed)'}`;
            option.selected = (r.itemFlowModelIds || []).includes(model.id);
            itemFlows.appendChild(option);
          });
          itemFlows.addEventListener('change', () => {
            snapshot();
            r.itemFlowModelIds = Array.from(itemFlows.selectedOptions).map(option => option.value);
            render(); renderProps();
          });
          box.appendChild(propRow('Item Flow', itemFlows,
            'Connector로 전달되는 Information Item 또는 Block/Value Type을 여러 개 지정할 수 있습니다.'));
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
          hint.textContent = `Type Compatibility · ${compatibility.message}`;
          hint.style.color = compatibilityColors[compatibility.status] || '';
          box.appendChild(hint);
    
          const routingMode = document.createElement('select');
          [
            ['auto', 'Automatic'],
            ['manual', 'Manual · Locked'],
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
          box.appendChild(propRow('Routing Mode', routingMode,
            'Manual 모드는 중간 굴곡점을 저장하여 요소가 움직여도 사용자가 만든 경로를 유지합니다.'));
    
          const jumpStyle = document.createElement('select');
          [
            ['arc', 'Arc Bridge'],
            ['gap', 'Gap'],
            ['none', 'None'],
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
          box.appendChild(propRow('Line Jumps', jumpStyle,
            '뒤에 그려진 Binding Connector가 앞선 커넥터와 교차할 때 Arc 또는 Gap으로 구분합니다.'));
    
          const stack = bindingConnectorStackInfo(r);
          const stackHint = document.createElement('div');
          stackHint.className = 'prop-hint';
          stackHint.dataset.connectorStack = `${stack.index + 1}/${stack.total}`;
          stackHint.textContent = `Connector Layer · ${stack.index + 1}/${stack.total}`
            + ' · 숫자가 높을수록 앞에 그려지고 교차 브리지를 가집니다.';
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
            stackButton('한 단계 뒤로', 'backward', stack.index <= 0),
            stackButton('한 단계 앞으로', 'forward', stack.index >= stack.total - 1),
          );
          box.appendChild(stackStepButtons);
          const stackEdgeButtons = document.createElement('div');
          stackEdgeButtons.className = 'prop-row connector-order-actions';
          stackEdgeButtons.append(
            stackButton('맨 뒤로', 'back', stack.index <= 0),
            stackButton('맨 앞으로', 'front', stack.index >= stack.total - 1),
          );
          box.appendChild(stackEdgeButtons);
    
          const route = bindingRoute(r);
          const routeHint = document.createElement('div');
          routeHint.className = 'prop-hint';
          routeHint.dataset.route = 'orthogonal';
          routeHint.textContent = `Orthogonal ${r.routeMode === 'manual' ? 'Manual Route · 잠김' : 'Auto Route'}`
            + ` · 굴곡 ${route?.bends || 0} · 교차 ${route?.crossings || 0}`
            + (r.routeMode === 'manual' ? ` · 제어점 ${bindingWaypoints(r).length}` : '')
            + ((r.jumpStyle || 'arc') !== 'none' ? ` · 브리지 ${route?.jumpCount || 0}` : '')
            + (route?.obstacleHits ? ` · 장애물 충돌 ${route.obstacleHits}` : '');
          routeHint.style.color = route?.obstacleHits ? '#b42318' : '#52606d';
          box.appendChild(routeHint);
    
          const addPoint = document.createElement('button');
          addPoint.className = 'prop-btn';
          addPoint.textContent = '굴곡점 추가';
          addPoint.addEventListener('click', () => {
            const current = bindingRoute(r);
            if (!current?.points || current.points.length < 2) return;
            if (bindingWaypoints(r).length >= 200) {
              flashStatus('수동 굴곡점은 최대 200개까지 추가할 수 있습니다');
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
            flashStatus('굴곡점을 추가하고 수동 경로를 잠갔습니다');
          });
          const resetRoute = document.createElement('button');
          resetRoute.className = 'prop-btn';
          resetRoute.textContent = '자동 경로로 재설정';
          resetRoute.disabled = r.routeMode !== 'manual';
          resetRoute.addEventListener('click', () => {
            snapshot();
            unlockBindingRoute(r);
            render(); renderProps();
            flashStatus('자동 직교 라우팅으로 전환했습니다');
          });
          const routeButtons = document.createElement('div');
          routeButtons.className = 'prop-row';
          routeButtons.append(addPoint, resetRoute);
          box.appendChild(routeButtons);
    
          const editHint = document.createElement('div');
          editHint.className = 'prop-hint';
          editHint.textContent = '파란 굴곡점을 드래그해 이동 · 굴곡점을 더블클릭해 삭제 · 선을 Option/Alt+더블클릭해 해당 위치에 추가';
          box.appendChild(editHint);
        }
        if (isInteractionMsg(r.kind)) {
          box.appendChild(propRow('Sequence No. (번호)', textInput(r.seqNo != null ? String(r.seqNo) : '', v => {
            r.seqNo = v.trim();
          }), `비우면 자동 번호 · 값을 넣으면 고정 번호 사용 (예: 1.1)`));
        }
        if (isCommMsg(r.kind) || r.kind === 'timingmessage') {
          const sort = document.createElement('select');
          [
            ['synchCall', 'Synchronous Call'],
            ['asynchCall', 'Asynchronous Call'],
            ['asynchSignal', 'Asynchronous Signal'],
            ['reply', 'Reply'],
            ['createMessage', 'Create Message'],
            ['deleteMessage', 'Delete Message'],
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
          box.appendChild(propRow('Message Sort', sort, '동기·비동기·응답·생성·삭제 메시지 화살표를 선택합니다.'));
          const connector = r.kind === 'timingmessage' ? null : relById(r.connectorId);
          if (connector) {
            const hint = document.createElement('div');
            hint.className = 'prop-hint';
            hint.textContent = `Connector ${connector.id}에 종속 · Connector 이동/재연결 시 메시지도 함께 이동합니다.`;
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
          box.appendChild(propRow('Source label (multiplicity)', textInput(r.sourceLabel, v => r.sourceLabel = v), '예: 1, 0..*, owner'));
          box.appendChild(propRow('Target label (multiplicity)', textInput(r.targetLabel, v => r.targetLabel = v)));
        }
        if (!isInteractionMsg(r.kind)) {
          const hint = document.createElement('div');
          hint.className = 'prop-hint';
          hint.textContent = '선을 선택하면 나타나는 양 끝 사각 핸들을 드래그해 연결 위치를 바꾸거나, 다른 요소 위에 놓아 재연결할 수 있습니다.';
          box.appendChild(hint);
          if (r.srcAnchor || r.dstAnchor) {
            const btn = document.createElement('button');
            btn.className = 'prop-btn';
            btn.textContent = '선 연결점 초기화 (자동 배치)';
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
