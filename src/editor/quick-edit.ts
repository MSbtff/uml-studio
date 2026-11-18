'use strict';

type QuickEditMemberKind = 'attribute' | 'operation' | 'literal' | 'reception' | 'column' | 'slot';
interface QuickEditLabelHit {
  r: DiagramRelation;
  field: 'name' | 'sourceLabel' | 'targetLabel' | 'sourceEndName' | 'targetEndName';
  bx: number;
  by: number;
  bw: number;
}
interface AnyParsedExpression {
  valid: true;
  normalized: string;
  name?: string;
  stereotype?: string;
  visibility?: string;
  selector?: string;
  type?: string;
}
type InvalidExpression = { valid: false; error: string };
type PreparedExpression = { valid: true; value: string } | InvalidExpression;
interface InlineEditorOptions {
  align?: 'left' | 'center';
  ariaLabel?: string;
  height?: number;
  multiline?: boolean;
  size?: number;
  prepare?(value: string): PreparedExpression;
  onAddBelow?(value: string): void;
  onDelete?(): void;
  onMove?(direction: number, value: string): void;
}
type QuickEditChildDependencies = 'closeOtherQuickEditors' | 'selectQuickEditTarget' | 'nextFieldSequence';
type QuickEditDependencies = Omit<ErdColumnEditorDependencies, QuickEditChildDependencies | 'state'>
  & Omit<NonNullable<Parameters<RelationEndEditorApi['create']>[0]>, QuickEditChildDependencies | 'state'>
  & {
    addBindingWaypoint(relation: DiagramRelation, point: DiagramPoint): void;
    bindingRoute(relation: DiagramRelation): BindingRoute | null;
    bindingWaypoints(relation: DiagramRelation): DiagramPoint[];
    byId(id: string | null): DiagramElement | null | undefined;
    communicationMessagePoints(relation: DiagramRelation): CommunicationMessagePoints | null;
    dg(): EditorDiagram;
    elementAt(point: DiagramPoint): DiagramElement | null | undefined;
    focusProps(): void;
    isCommMsg(kind: string): boolean;
    isInteractionMsg(kind: string): boolean;
    isMsg(kind: string): boolean;
    memberListByKind(element: DiagramElement, kind: QuickEditMemberKind): { top: number; arr: string[] } | null;
    memberRowAt(element: DiagramElement, point: DiagramPoint): { kind: QuickEditMemberKind; index: number } | null;
    msgPoints(relation: DiagramRelation): MessagePoints | null;
    parseQuickEditExpression(kind: string, value: string): AnyParsedExpression | InvalidExpression;
    polylineMidpoint(points: DiagramPoint[]): DiagramPoint;
    referencedInteraction(element: DiagramElement): EditorDiagram | null;
    relById(id: string | null): DiagramRelation | null | undefined;
    relationAt(point: DiagramPoint): DiagramRelation | null | undefined;
    relationEndAt(point: DiagramPoint): { r: DiagramRelation; end: RelationEnd } | null;
    relationLabelAt(point: DiagramPoint): QuickEditLabelHit | null;
    setSelection(ids: string[]): void;
    svgPoint(event: MouseEvent): DiagramPoint;
    switchDiagram(id: string): void;
    tw(text: string, font: string): number;
    state: ErdColumnEditorDependencies['state'] & { selection: string[]; selectedId: string | null };
    erdColumnEditor: ErdColumnEditorApi;
    relationEndEditor: RelationEndEditorApi;
    FONT13B: string;
    LINE_H: number;
    PACKAGE_CONTAINER_KINDS: ReadonlySet<string>;
    PAD: number;
    VISIBILITY_SYMBOL: Partial<Record<string, string>>;
  };

type QuickEditApi = ReturnType<typeof createQuickEditModule>;
declare var UMLQuickEdit: QuickEditApi;

(function initQuickEdit(root: typeof globalThis, factory: () => QuickEditApi) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root) root.UMLQuickEdit = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, createQuickEditModule);

function createQuickEditModule() {
  /* every field caption needs a stable id so its control can point at it */
  let fieldSequence = 0;
  const REQUIRED_FUNCTIONS = Object.freeze([
    'addBindingWaypoint',
    'bindingRoute',
    'bindingWaypoints',
    'byId',
    'communicationMessagePoints',
    'applyCopiedColumnSchema',
    'columnDetailsFor',
    'confirmAction',
    'copiedColumnValue',
    'copyColumnSchema',
    'deleteColumnSchema',
    'disconnectForeignKeyColumnReferences',
    'dg',
    'elementAt',
    'ensureMemberArray',
    'erdRelationCardinality',
    'flashStatus',
    'focusProps',
    'foreignKeyColumnImpacts',
    'isCommMsg',
    'isInteractionMsg',
    'isMsg',
    'memberListByKind',
    'memberRowAt',
    'msgPoints',
    'parseColumn',
    'parseQuickEditExpression',
    'polylineMidpoint',
    'referencedInteraction',
    'relById',
    'relEndpoints',
    'relationAt',
    'relationEndAggregation',
    'relationEndAt',
    'relationEndExpression',
    'relationEndMultiplicity',
    'relationEndNavigability',
    'relationLabelAt',
    'relationSupportsEndQuickEdit',
    'render',
    'renderProps',
    'renameColumnSchema',
    'renameForeignKeyColumnReferences',
    'reorderColumns',
    'requestAnimationFrame',
    'setSelection',
    'setTimeout',
    'snapshot',
    'setColumnDetails',
    'safeSqlFragment',
    'svgPoint',
    'switchDiagram',
    'tw',
    'validRelationEndMultiplicity',
    'validateColumn',
  ] as const);
  const REQUIRED_VALUES = Object.freeze([
    'document',
    'erdColumnEditor',
    'relationEndEditor',
    'state',
    'wrap',
    'ASSOCIATION_QUALIFIER_KINDS',
    'ERD_CARDINALITY_OPTIONS',
    'ER_RELATION_KINDS',
    'FONT13B',
    'LINE_H',
    'PACKAGE_CONTAINER_KINDS',
    'PAD',
    'VISIBILITY_SYMBOL',
    'VISIBILITY_VALUE',
  ] as const);

  function create(deps: QuickEditDependencies) {
    if (!deps || typeof deps !== 'object') {
      throw new TypeError('QuickEdit dependencies are required');
    }

    const missing: string[] = REQUIRED_FUNCTIONS.filter(name => typeof deps[name] !== 'function');
    REQUIRED_VALUES.forEach(name => {
      if (deps[name] == null) missing.push(name);
    });
    if (typeof deps.erdColumnEditor?.create !== 'function') {
      missing.push('erdColumnEditor.create');
    }
    if (typeof deps.relationEndEditor?.create !== 'function') {
      missing.push('relationEndEditor.create');
    }
    if (missing.length) {
      throw new TypeError(`QuickEdit 의존성이 없습니다: ${[...new Set(missing)].join(', ')}`);
    }

    /* names QuickEdit only forwards to erdColumnEditor stay in the REQUIRED
       lists above — app.js provides by declared name — but are not destructured */
    const {
      addBindingWaypoint,
      bindingRoute,
      bindingWaypoints,
      byId,
      communicationMessagePoints,
      dg,
      elementAt,
      flashStatus,
      focusProps,
      isCommMsg,
      isInteractionMsg,
      isMsg,
      memberListByKind,
      memberRowAt,
      msgPoints,
      parseQuickEditExpression,
      polylineMidpoint,
      referencedInteraction,
      relById,
      relEndpoints,
      relationAt,
      relationEndAt,
      relationLabelAt,
      relationSupportsEndQuickEdit,
      render,
      renderProps,
      setSelection,
      snapshot,
      svgPoint,
      switchDiagram,
      tw,
      document,
      erdColumnEditor,
      relationEndEditor,
      state,
      wrap,
      FONT13B,
      LINE_H,
      PACKAGE_CONTAINER_KINDS,
      PAD,
      VISIBILITY_SYMBOL,
      VISIBILITY_VALUE,
    } = deps;

    const MEMBER_QUICK_EDIT_LABELS = {
      attribute: 'Attribute', operation: 'Operation', literal: 'Enumeration Literal',
      reception: 'Reception', column: 'Column', slot: 'Slot',
    };

    function prepareQuickEditExpression(kind: string, value: string): PreparedExpression {
      if (!value || kind === 'column') return { valid: true, value: value || '' };
      const result = parseQuickEditExpression(kind, value);
      if (!result.valid) {
        flashStatus(`QuickEdit 표현식 오류: ${result.error}`);
        return result;
      }
      return { valid: true, value: result.normalized };
    }

    function expressionPrefixFor(e: DiagramElement) {
      return [e.stereotype ? `«${e.stereotype}»` : '', VISIBILITY_SYMBOL[e.visibility || ''] || '']
        .filter(Boolean).join(' ');
    }

    function nameExpressionValue(e: DiagramElement) {
      return [expressionPrefixFor(e), e.name || ''].filter(Boolean).join(' ');
    }

    function lifelineExpressionValue(e: DiagramElement) {
      return [expressionPrefixFor(e), e.name || ''].filter(Boolean).join(' ');
    }

    function applyExpressionPrefix(e: DiagramElement, parsed: Pick<AnyParsedExpression, 'visibility' | 'stereotype'>) {
      if (parsed.stereotype || e.stereotype !== undefined) e.stereotype = parsed.stereotype;
      if (parsed.visibility || e.visibility !== undefined) {
        e.visibility = VISIBILITY_VALUE[parsed.visibility || ''] || 'public';
      }
    }

    function lifelineExpressionCore(parsed: AnyParsedExpression) {
      return `${parsed.name || ''}${parsed.selector ? `[${parsed.selector}]` : ''}${parsed.type ? `: ${parsed.type}` : ''}`;
    }

    function openMemberRowQuickEdit(e: DiagramElement, listKind: QuickEditMemberKind, requestedIndex: number): boolean {
      const list = memberListByKind(e, listKind);
      if (!list) return false;
      if (e.kind === 'entity' && listKind === 'column') {
        return openErdColumnEditor(e, requestedIndex);
      }
      selectQuickEditTarget(e.id);
      const index = Math.max(0, Math.min(requestedIndex, list.arr.length));
      const isNew = index >= list.arr.length;
      const old = isNew ? '' : list.arr[index];
      const rh = e.kind === 'entity' ? ((e._m && e._m.RH) || 17) : LINE_H;
      const rowY = e.y + list.top + Math.min(index, list.arr.length) * rh + 2;
      const label = MEMBER_QUICK_EDIT_LABELS[listKind] || 'Member';
      const reopen = (nextIndex: number) => openMemberRowQuickEdit(e, listKind, nextIndex);

      openInlineEditor(e.x * state.zoom + 4, rowY * state.zoom, (e.w - 8) * state.zoom, old, value => {
        if (value === old) return;
        snapshot();
        if (isNew) {
          if (value) list.arr.push(value);
        } else if (value === '') {
          list.arr.splice(index, 1);
        } else {
          list.arr[index] = value;
        }
        render(); renderProps();
      }, {
        align: 'left',
        size: 12,
        ariaLabel: `${label} QuickEdit`,
        prepare: value => prepareQuickEditExpression(listKind, value),
        onAddBelow(value) {
          const fresh = memberListByKind(e, listKind);
          if (!fresh) return;
          const nextIndex = value ? Math.min(index + 1, fresh.arr.length) : Math.min(index, fresh.arr.length);
          reopen(nextIndex);
          flashStatus(`${label}을(를) 아래에 연속 추가합니다`);
        },
        onDelete() {
          const fresh = memberListByKind(e, listKind);
          if (!fresh || index >= fresh.arr.length) return;
          snapshot();
          fresh.arr.splice(index, 1);
          render(); renderProps();
          flashStatus(`${label}을(를) 삭제했습니다`);
        },
        onMove(direction, value) {
          const fresh = memberListByKind(e, listKind);
          if (!fresh || !value || !fresh.arr.length) return;
          const fromIndex = Math.min(index, fresh.arr.length - 1);
          const targetIndex = fromIndex + direction;
          if (targetIndex < 0 || targetIndex >= fresh.arr.length) {
            reopen(fromIndex);
            return;
          }
          snapshot();
          const [member] = fresh.arr.splice(fromIndex, 1);
          fresh.arr.splice(targetIndex, 0, member);
          render(); renderProps();
          reopen(targetIndex);
          flashStatus(`${label} 순서를 변경했습니다`);
        },
      });
      return true;
    }

    function memberKindForShortcut(e: DiagramElement, operation: boolean): QuickEditMemberKind | null {
      if (operation) {
        return ['class', 'interface', 'enumeration', 'stereotype', 'informationitem'].includes(e.kind)
          ? 'operation' : null;
      }
      if (e.kind === 'enumeration') return 'literal';
      if (e.kind === 'entity') return 'column';
      if (e.kind === 'object') return 'slot';
      return ['class', 'interface', 'stereotype', 'informationitem'].includes(e.kind)
        ? 'attribute' : null;
    }

    function openSelectedMemberQuickEdit(operation = false) {
      if (state.selection.length !== 1) return false;
      const e = byId(state.selectedId);
      if (!e) return false;
      const listKind = memberKindForShortcut(e, operation);
      if (!listKind) return false;
      const list = memberListByKind(e, listKind);
      return list ? openMemberRowQuickEdit(e, listKind, list.arr.length) : false;
    }

    function selectQuickEditTarget(id: string) {
      if (state.selection.length === 1 && state.selectedId === id) return;
      setSelection([id]);
      render(); renderProps();
    }

    /* The ERD column clipboard, commands and sheet are their own module. It
       needs `selectQuickEditTarget` and a way to close the other two editors,
       which are QuickEdit internals, so QuickEdit constructs it here; the
       controller comes back and QuickEdit re-exports it unchanged. */
    const erdColumns = erdColumnEditor.create({
      ...deps,
      closeOtherQuickEditors: () => { closeInlineEditor(); closeRelationEndEditor(); },
      nextFieldSequence: () => ++fieldSequence,
      selectQuickEditTarget,
    });
    const {
      closeErdColumnEditor,
      copyErdColumn,
      deleteErdColumn,
      getErdColumnClipboard,
      moveErdColumn,
      moveErdColumnTo,
      openErdColumnEditor,
      pasteErdColumn,
      replaceErdColumns,
    } = erdColumns;

    /* the relation end sheet is its own module for the same reason — the two
       editors must close each other, and only QuickEdit knows about both */
    const {
      closeRelationEndEditor,
      openRelationEndQuickEdit,
    } = relationEndEditor.create({
      ...deps,
      closeOtherQuickEditors: () => { closeInlineEditor(); closeErdColumnEditor(); },
      nextFieldSequence: () => ++fieldSequence,
      selectQuickEditTarget,
    });

    function openRelationQuickEdit(r: DiagramRelation, labelHit: QuickEditLabelHit | null = null) {
      if (!r) return false;
      selectQuickEditTarget(r.id);
      if (r.kind === 'transition') {
        focusProps();
        return true;
      }
      if (labelHit && relationSupportsEndQuickEdit(r)) {
        const end = labelHit.field.startsWith('source') ? 'source'
          : labelHit.field.startsWith('target') ? 'target' : null;
        if (end) return openRelationEndQuickEdit(r, end);
      }
      const z = state.zoom;
      if (labelHit) {
        const { field, bx, by, bw } = labelHit;
        const expressionKind = field === 'name'
          ? (isInteractionMsg(r.kind) ? 'message' : 'name')
          : null;
        openInlineEditor(bx * z, (by - 4) * z, Math.max(110, bw + 26) * z, r[field] || '', value => {
          if (value !== r[field]) {
            snapshot();
            r[field] = value;
            render(); renderProps();
          }
        }, {
          size: 12,
          ariaLabel: expressionKind === 'message' ? 'Message Expression QuickEdit' : 'Relationship QuickEdit',
          ...(expressionKind ? { prepare: value => prepareQuickEditExpression(expressionKind, value) } : {}),
        });
        return true;
      }

      let lx, ly;
      if (isCommMsg(r.kind)) {
        const points = communicationMessagePoints(r);
        if (!points) return false;
        if (points.self) {
          lx = points.startX + 8;
          ly = points.y - 24;
        } else {
          lx = (points.p1.x + points.p2.x) / 2 - 70;
          ly = (points.p1.y + points.p2.y) / 2 - 24;
        }
      } else if (isMsg(r.kind)) {
        const points = msgPoints(r);
        if (!points) return false;
        if (points.self) {
          lx = points.startX + 8;
          ly = points.y - 24;
        } else {
          lx = (points.p1.x + points.p2.x) / 2 - 70;
          ly = points.p1.y - 24;
        }
      } else if (r.kind === 'bindingconnector') {
        const route = bindingRoute(r);
        if (!route) return false;
        const midpoint = polylineMidpoint(route.points);
        lx = midpoint.x - 70;
        ly = midpoint.y - 24;
      } else {
        const endpoints = relEndpoints(r);
        if (!endpoints) return false;
        lx = (endpoints.p1.x + endpoints.p2.x) / 2 - 70;
        ly = (endpoints.p1.y + endpoints.p2.y) / 2 - 24;
      }
      openInlineEditor(lx * z, ly * z, 140 * z, r.name || '', value => {
        if (value !== r.name) {
          snapshot();
          r.name = value;
          render(); renderProps();
        }
      }, {
        ariaLabel: isInteractionMsg(r.kind) ? 'Message Expression QuickEdit' : 'Relationship QuickEdit',
        prepare: value => prepareQuickEditExpression(isInteractionMsg(r.kind) ? 'message' : 'name', value),
      });
      return true;
    }

    const PROPS_ONLY_QUICK_EDIT_KINDS = new Set([
      'initial', 'final', 'forkbar', 'execution', 'stateinitial', 'statefinal',
      'choice', 'junction', 'statefork', 'shallowhistory', 'deephistory',
      'entrypoint', 'exitpoint', 'terminate', 'connectionpointref', 'timesegment',
      'timetick', 'timeconstraint', 'durationconstraint',
    ]);

    function elementNameEditorY(e: DiagramElement) {
      let nameY = e.y + PAD;
      if (dg().type === 'package' && PACKAGE_CONTAINER_KINDS.has(e.kind)) {
        nameY = e.y + (e.kind === 'subsystem' ? 22 : 30);
      } else if (e.kind === 'package') {
        nameY = e.y + 14;
      } else if (e._m && e._m.stereo) {
        nameY = e.y + PAD + 15;
      } else if (e.kind === 'lifeline' && e.isActor) {
        nameY = e.y + e.h - 16;
      } else if (e.kind === 'frame' || e.kind === 'interactionuse' || e.kind === 'interactioninline') {
        nameY = e.y + e.h / 2 - 9;
      } else if ([
        'usecase', 'action', 'component', 'node', 'artifact', 'componentinstance',
        'nodeinstance', 'artifactinstance', 'decision', 'lifeline', 'process',
        'external', 'datastore', 'mindnode', 'stateinvariant', 'continuation',
      ].includes(e.kind)) {
        nameY = e.y + e.h / 2 - 9;
      } else if (e.kind === 'actor') {
        nameY = e.y + e.h - 16;
      }
      return nameY;
    }

    function openElementQuickEdit(e: DiagramElement, point: DiagramPoint | null = null, options: { keyboard?: boolean } = {}) {
      if (!e) return false;
      selectQuickEditTarget(e.id);
      if ((e.kind === 'interactioninline' || e.kind === 'interactionuse') && e.interactionDiagramId && referencedInteraction(e)) {
        switchDiagram(e.interactionDiagramId);
        flashStatus(`Sequence Diagram '${dg().name}'을 열었습니다`);
        return true;
      }
      if (dg().type === 'sequence' && e.kind === 'lifeline') {
        openLifelineNameEditor(e);
        return true;
      }
      const z = state.zoom;

      /* Pointer QuickEdit can address a concrete member row. Keyboard QuickEdit
         intentionally edits the owning element name instead. */
      const row = !options.keyboard && point ? memberRowAt(e, point) : null;
      if (row) {
        return openMemberRowQuickEdit(e, row.kind, row.index);
      }
      if (e.kind === 'note') {
        openInlineEditor(e.x * z, e.y * z, Math.max(160, e.w * z), e.text, value => {
          if (value !== e.text) {
            snapshot();
            e.text = value;
            render(); renderProps();
          }
        }, { multiline: true, height: e.h * z, align: 'left', size: 12 });
        return true;
      }
      if (e.kind === 'fragment') {
        const labelWidth = Math.max(46, tw(e.operator || 'alt', FONT13B) + 22);
        openInlineEditor((e.x + labelWidth + 4) * z, (e.y + 1) * z, 180, e.condition, value => {
          if (value !== e.condition) {
            snapshot();
            e.condition = value;
            render(); renderProps();
          }
        }, { align: 'left', size: 12 });
        return true;
      }
      if (PROPS_ONLY_QUICK_EDIT_KINDS.has(e.kind)) {
        focusProps();
        return true;
      }

      const expression = nameExpressionValue(e);
      openInlineEditor(e.x * z, elementNameEditorY(e) * z, e.w * z, expression, value => {
        if (value && value !== expression) {
          const parsed = parseQuickEditExpression('name', value);
          if (!parsed.valid) return;
          snapshot();
          applyExpressionPrefix(e, parsed);
          e.name = parsed.name;
          render(); renderProps();
        }
      }, {
        ariaLabel: 'Name Expression QuickEdit',
        prepare: value => prepareQuickEditExpression('name', value),
      });
      return true;
    }

    function handleCanvasQuickEdit(ev: MouseEvent, p = svgPoint(ev)) {
      const routePointIndex = (ev.target as Element | null)?.getAttribute?.('data-route-point');
      if (routePointIndex != null && state.selectedId) {
        const r = relById(state.selectedId);
        const index = Number(routePointIndex);
        const waypoints = r ? bindingWaypoints(r) : [];
        if (r?.kind === 'bindingconnector' && r.routeMode === 'manual'
          && Number.isInteger(index) && waypoints[index]) {
          snapshot();
          waypoints.splice(index, 1);
          r.manualPoints = waypoints;
          render(); renderProps();
          flashStatus('수동 굴곡점을 삭제했습니다');
          return true;
        }
      }

      if (ev.altKey) {
        const r = relationAt(p);
        if (r?.kind === 'bindingconnector') {
          if (bindingWaypoints(r).length >= 200) {
            flashStatus('수동 굴곡점은 최대 200개까지 추가할 수 있습니다');
            return true;
          }
          snapshot();
          addBindingWaypoint(r, p);
          setSelection([r.id]);
          render(); renderProps();
          flashStatus('수동 굴곡점을 추가하고 경로를 잠갔습니다');
          return true;
        }
      }

      /* double-click directly on a label text (name / multiplicity) — labels
         render on top of everything, so check them first */
      const labelHit = relationLabelAt(p);
      if (labelHit) {
        return openRelationQuickEdit(labelHit.r, labelHit);
      }

      /* End handles overlap their owning elements. Resolve them before element
         hit-testing so a border double-click edits the relationship end. */
      const endHit = relationEndAt(p);
      if (endHit) return openRelationEndQuickEdit(endHit.r, endHit.end, p);

      const e = elementAt(p);
      if (!e) {
        const r = relationAt(p);
        return r ? openRelationQuickEdit(r) : false;
      }
      return openElementQuickEdit(e, p);
    }

    function openSelectedQuickEdit() {
      if (state.selection.length !== 1) return false;
      const e = byId(state.selectedId);
      if (e) return openElementQuickEdit(e, null, { keyboard: true });
      const r = relById(state.selectedId);
      return r ? openRelationQuickEdit(r) : false;
    }

    let inlineEditor: HTMLInputElement | HTMLTextAreaElement | null = null;
    function openLifelineNameEditor(lifeline: DiagramElement) {
      const z = state.zoom;
      const expression = lifelineExpressionValue(lifeline);
      const nameY = lifeline.isActor
        ? lifeline.y + lifeline.h - 16
        : lifeline._m?.stereo
          ? lifeline.y + PAD + 15
          : lifeline.y + lifeline.h / 2 - 9;
      openInlineEditor(lifeline.x * z, nameY * z, lifeline.w * z, expression, value => {
        if (!value || value === expression) return;
        const parsed = parseQuickEditExpression('lifeline', value);
        if (!parsed.valid) return;
        snapshot();
        applyExpressionPrefix(lifeline, parsed);
        lifeline.name = lifelineExpressionCore(parsed);
        render(); renderProps();
        flashStatus(`라이프라인 표현식을 '${value}'(으)로 변경했습니다`);
      }, {
        ariaLabel: 'Lifeline Expression QuickEdit',
        prepare: value => prepareQuickEditExpression('lifeline', value),
      });
    }

    function openInlineEditor(x: number, y: number, w: number, value: string | undefined, commit: (value: string) => void, opts: InlineEditorOptions = {}) {
      closeRelationEndEditor();
      closeErdColumnEditor();
      closeInlineEditor();
      const input: HTMLInputElement | HTMLTextAreaElement = document.createElement(opts.multiline ? 'textarea' : 'input');
      input.className = 'inline-editor';
      input.setAttribute('aria-label', opts.ariaLabel || 'QuickEdit');
      input.value = value ?? '';
      input.style.left = (x + 2) + 'px';
      input.style.top = y + 'px';
      input.style.width = Math.max(80, w - 4) + 'px';
      if (opts.multiline) input.style.height = Math.max(40, opts.height || 60) + 'px';
      input.style.fontSize = ((opts.size || 13) * state.zoom) + 'px';
      input.style.textAlign = opts.align || 'center';
      wrap.appendChild(input);
      input.focus(); input.select();
      let done = false;
      const finish = (ok: boolean, validate = true) => {
        if (done) return false; done = true;
        let v = input.value.trim();
        if (ok && validate && opts.prepare) {
          const prepared = opts.prepare(v);
          if (!prepared?.valid) {
            done = false;
            input.setCustomValidity(prepared?.error || '표현식이 올바르지 않습니다.');
            input.reportValidity();
            input.focus();
            return false;
          }
          v = prepared.value;
          input.value = v;
        }
        input.remove(); inlineEditor = null;
        if (ok) commit(v);
        return { value: v };
      };
      input.addEventListener('input', () => input.setCustomValidity(''));
      input.addEventListener('keydown', (event: Event) => {
        const e = event as KeyboardEvent;
        const mod = e.ctrlKey || e.metaKey;
        if (mod && !e.altKey && !e.shiftKey && e.key === 'Enter' && opts.onAddBelow) {
          e.preventDefault();
          const result = finish(true);
          if (result) opts.onAddBelow(result.value);
          e.stopPropagation();
          return;
        }
        if (mod && !e.altKey && (e.key === 'Delete' || e.key === 'Backspace') && opts.onDelete) {
          e.preventDefault();
          if (finish(false)) opts.onDelete();
          e.stopPropagation();
          return;
        }
        if (mod && !e.altKey && (e.key === 'ArrowUp' || e.key === 'ArrowDown') && opts.onMove) {
          e.preventDefault();
          const direction = e.key === 'ArrowUp' ? -1 : 1;
          const result = finish(true);
          if (result) opts.onMove(direction, result.value);
          e.stopPropagation();
          return;
        }
        if (e.key === 'Enter' && (!opts.multiline || e.ctrlKey || e.metaKey)) { e.preventDefault(); finish(true); }
        if (e.key === 'Escape') finish(false);
        e.stopPropagation();
      });
      input.addEventListener('blur', () => finish(true, false));
      inlineEditor = input;
    }
    function closeInlineEditor() { if (inlineEditor) inlineEditor.blur(); }

    return Object.freeze({
      handleCanvasQuickEdit,
      openRelationQuickEdit,
      openSelectedQuickEdit,
      openSelectedMemberQuickEdit,
      openErdColumnEditor,
      openRelationEndQuickEdit,
      closeInlineEditor,
      copyErdColumn,
      pasteErdColumn,
      deleteErdColumn,
      replaceErdColumns,
      moveErdColumn,
      moveErdColumnTo,
      getErdColumnClipboard,
    });
  }

  return Object.freeze({ REQUIRED_FUNCTIONS, REQUIRED_VALUES, create });
}
