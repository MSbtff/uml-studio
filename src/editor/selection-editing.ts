'use strict';

/* Selection editing — the clipboard and the commands that act on whatever the
   user has selected: copy/cut/paste/duplicate (carrying the semantic models the
   copied views depend on), delete from view or from the model repository,
   auto-size, keyboard nudge, and z-order. */
type SelectionEditingApi = ReturnType<typeof createSelectionEditingModule>;
declare var UMLSelectionEditing: SelectionEditingApi;

(function initSelectionEditingModule(root: typeof globalThis & { UMLSelectionEditing?: SelectionEditingApi }, factory: () => SelectionEditingApi) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root) root.UMLSelectionEditing = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, createSelectionEditingModule);

function createSelectionEditingModule() {
  const c4Model = globalThis.UMLC4Model
    ?? require('../model/c4-model.js') as C4ModelApi;
  const { text: uiText } = globalThis.UMLLanguage
    ?? require('./language.js') as typeof UMLLanguage;

  const REQUIRED_FUNCTIONS = Object.freeze([
    'adoptView',
    'byId',
    'descendantViews',
    'dg',
    'diagramAllowsElementKind',
    'flashStatus',
    'isMsg',
    'modelUid',
    'moveViewTree',
    'relById',
    'render',
    'renderAll',
    'renderProps',
    'rootViews',
    'sequenceLifelineTop',
    'setSelection',
    'snap',
    'snapshot',
    'syncRelationModel',
    'uid',
  ] as const);
  const REQUIRED_VALUES = Object.freeze([
    'state',
    'GRID',
  ] as const);
  /* 붙여넣을 때 복사본이 원본과 배열을 공유하지 않도록 떼어낼 모델 필드 */
  const CLONED_MODEL_LIST_FIELDS = Object.freeze([
    'attributes', 'operations', 'literals', 'columns', 'operands', 'internalTransitions', 'slots',
    'parts', 'references', 'values', 'flowProperties', 'constraintProperties',
    'properties', 'constraints', 'constraintParameters', 'receptions',
  ] as const);
  const CLONED_MODEL_STRUCTURED_FIELDS = Object.freeze([
    'erdColumnDetails', 'erdChecks', 'erdIndexes',
  ] as const);
  const MODEL_REFERENCE_FIELDS = Object.freeze([
    'classifierModelId', 'collaborationModelId', 'providedInterfaceModelId', 'requiredInterfaceModelId',
  ] as const);
  /* Views whose copy is a new thing rather than a second view of the same thing:
     a pasted table is a new table and a pasted lifeline is a new participant.
     Abstract classifiers — Class, Interface, Enumeration — keep the shared-model
     behaviour on purpose: a Class shown in two diagrams is one Class, and
     `Delete Model` is expected to remove every view of it. The label names the
     kind in the paste message; kinds sharing a label are counted together. */
  const INDEPENDENT_COPY_KINDS: Readonly<Partial<Record<string, string>>> = Object.freeze({
    entity: uiText('table', '테이블'),
    c4container: uiText('C4 Container', 'C4 컨테이너'),
    lifeline: uiText('lifeline', '라이프라인'),
    fragment: uiText('combined fragment', '결합 프래그먼트'),
    object: uiText('instance', '인스턴스'),
    artifactinstance: uiText('instance', '인스턴스'),
    componentinstance: uiText('instance', '인스턴스'),
    nodeinstance: uiText('instance', '인스턴스'),
    /* deployment and component diagrams draw physical things — a copied machine
       or component is a second machine, not a second picture of the same one */
    node: uiText('node', '노드'),
    component: uiText('component', '컴포넌트'),
    artifact: uiText('artifact', '아티팩트'),
  });
  const PASTE_OFFSET = 24;

  interface ClipboardData {
    elements: ImportedElement[];
    relations: (Omit<DiagramRelation, 'kind'> & { kind?: string })[];
    models?: DiagramModels;
  }
  interface Clipboard {
    data: string;
    count: number;
    sourceRepository: DiagramModels;
    cloneModels: boolean;
  }

  interface SelectionDependencies {
    adoptView: {
      (view: ImportedElement): DiagramElement;
      (view: ImportedRelation): DiagramRelation;
    };
    byId: (id: string | null | undefined) => DiagramElement | null | undefined;
    descendantViews: (id: string, diagram?: EditorDiagram) => DiagramElement[];
    dg: () => EditorDiagram;
    diagramAllowsElementKind: (type: string, kind: string | undefined) => boolean;
    flashStatus: (message: string) => void;
    isMsg: (kind: string) => boolean;
    modelUid: () => string;
    moveViewTree: (view: DiagramElement, dx: number, dy: number, origins: ReadonlyMap<string, DiagramPoint>, step: number) => void;
    relById: (id: string | null | undefined) => DiagramRelation | null | undefined;
    render: () => void;
    renderAll: () => void;
    renderProps: () => void;
    rootViews: (views: DiagramElement[]) => DiagramElement[];
    sequenceLifelineTop: (diagram: EditorDiagram) => number;
    setSelection: (ids: string[]) => void;
    snap: (value: number) => number;
    snapshot: () => void;
    syncRelationModel: (relation: DiagramRelation, diagram: EditorDiagram) => void;
    uid: () => string;
    state: { selection: string[]; selectedId: string | null; diagrams: EditorDiagram[]; models: DiagramModels };
    GRID: number;
  }

  function present<T>(value: T | null | undefined): value is T {
    return value != null;
  }

  function create(dependencies?: SelectionDependencies) {
    const deps: Partial<SelectionDependencies> = dependencies || {};
    const missing: string[] = REQUIRED_FUNCTIONS.filter(name => typeof deps[name] !== 'function');
    REQUIRED_VALUES.forEach(name => {
      if (deps[name] == null) missing.push(name);
    });
    if (deps.state && !Array.isArray(deps.state.selection)) missing.push('state.selection');
    if (missing.length) {
      throw new TypeError(`Selection Editing 의존성이 없습니다: ${[...new Set(missing)].join(', ')}`);
    }

    const {
      adoptView,
      byId,
      descendantViews,
      dg,
      diagramAllowsElementKind,
      flashStatus,
      isMsg,
      modelUid,
      moveViewTree,
      relById,
      render,
      renderAll,
      renderProps,
      rootViews,
      sequenceLifelineTop,
      setSelection,
      snap,
      snapshot,
      syncRelationModel,
      uid,
      state,
      GRID,
    } = deps as SelectionDependencies;

    let clipboard: Clipboard | null = null;

    function selectAllViews() {
      const diagram = dg();
      const ids = diagram.elements.map(element => element.id);
      if (diagram.type === 'sequence') {
        ids.push(...diagram.relations.filter(relation => isMsg(relation.kind)).map(relation => relation.id));
      }
      setSelection(ids);
      render();
      renderProps();
    }

    function moveSelectionByKey(key: string, coarse: boolean) {
      const selected = state.selection.map(byId).filter(present);
      if (!selected.length) return false;
      snapshot();
      /* Shift nudges by a whole grid cell, a bare arrow by one pixel — the fine
         step has to carry its own grid or snapping rounds the move away */
      const step = coarse ? GRID : 1;
      const dx = key === 'ArrowLeft' ? -step : key === 'ArrowRight' ? step : 0;
      const dy = key === 'ArrowUp' ? -step : key === 'ArrowDown' ? step : 0;
      rootViews(selected).forEach(root => {
        const tree = [root, ...descendantViews(root.id)];
        const origins = new Map(tree.map(view => [view.id, { x: view.x, y: view.y }]));
        moveViewTree(root, dx, dy, origins, step);
      });
      render();
      renderProps();
      return true;
    }

    function expandedElementSelection() {
      const base = state.selection.map(byId).filter(present).filter(view => !view.c4Boundary);
      const roots = base.map(e => e.kind === 'region' ? byId(e.parentId) : e).filter(present);
      return [...new Map(roots.flatMap(root => [root, ...descendantViews(root.id)]).map(e => [e.id, e])).values()];
    }
    function copySelection(options: { cloneModels?: boolean } = {}) {
      let els = expandedElementSelection();
      if (!els.length) {
        if (relById(state.selectedId)) flashStatus(uiText(
          'Select both endpoints to copy a relationship.',
          '관계(선)는 단독으로 복사할 수 없습니다 — 양 끝 요소를 함께 선택하세요',
        ));
        return false;
      }
      let ids = new Set(els.map(e => e.id));
      /* relations whose both ends are inside the copied set travel with it */
      let rels = dg().relations.filter(r => ids.has(r.from) && ids.has(r.to));
      const attachedConstraints = dg().elements.filter(e => e.kind === 'timeconstraint'
        && (ids.has(e.constrainedViewId || '') || rels.some(relation => relation.id === e.constrainedViewId)));
      if (attachedConstraints.length) {
        els = [...new Map([...els, ...attachedConstraints].map(e => [e.id, e])).values()];
        ids = new Set(els.map(e => e.id));
        rels = dg().relations.filter(r => ids.has(r.from) && ids.has(r.to));
      }
      const modelIds = new Set([...els, ...rels].map(v => v.modelId).filter(present));
      [...els, ...rels].forEach(view => {
        const model = view.modelId ? state.models[view.modelId] : undefined;
        MODEL_REFERENCE_FIELDS.forEach(field => {
          const id = model?.[field];
          if (id) modelIds.add(id);
        });
        (model?.conveyedModelIds || []).forEach(id => modelIds.add(id));
        (model?.itemFlowModelIds || []).forEach(id => modelIds.add(id));
      });
      const models: DiagramModels = {};
      modelIds.forEach(id => { if (state.models[id]) models[id] = state.models[id]; });
      /* A copied table or lifeline must be safe to rename, edit, or delete from the
         model without affecting its source — see INDEPENDENT_COPY_KINDS. */
      const cloneModels = options.cloneModels ?? els.some(view => view.kind in INDEPENDENT_COPY_KINDS);
      clipboard = {
        data: JSON.stringify({
          elements: els.map(e => { const c = { ...e }; delete c._m; return c; }),
          relations: rels,
          models,
        }),
        count: 0,
        sourceRepository: state.models,
        cloneModels,
      };
      flashStatus(els.length === 1
        ? uiText(
          'Copied "{0}"{1} · Ctrl+V to paste',
          '"{0}" 복사됨{1} — Ctrl+V로 붙여넣기',
          els[0].name,
          cloneModels ? uiText(' · Independent model', ' · 독립 모델') : '',
        )
        : uiText(
          'Copied {0} elements with {1} relationships · Ctrl+V to paste',
          '요소 {0}개 (관계 {1}개 포함) 복사됨 — Ctrl+V로 붙여넣기',
          els.length,
          rels.length,
        ));
      return true;
    }
    function pasteClipboard() {
      if (!clipboard) { flashStatus(uiText('The clipboard is empty.', '클립보드가 비어 있습니다')); return; }
      const currentClipboard = clipboard;
      const src: ClipboardData = JSON.parse(currentClipboard.data);
      const sourceModels = src.models || {};
      const kindOf = (view: ImportedElement) => (view.modelId && sourceModels[view.modelId]?.kind) || view.kind;
      const d = dg();
      const boundary = c4Model.systemBoundary(d);
      const sameProject = currentClipboard.sourceRepository === state.models;
      const usable = src.elements.filter(view => {
        const kind = kindOf(view);
        return !view.c4Boundary && diagramAllowsElementKind(d.type, kind)
          && (kind !== 'c4container' || !!boundary)
          && !(boundary && sameProject && view.modelId === boundary.modelId);
      });
      if (!usable.length) {
        flashStatus(uiText('The copied elements cannot be pasted into this diagram.', '복사한 요소를 이 다이어그램에 붙여넣을 수 없습니다'));
        return;
      }
      snapshot();
      currentClipboard.count++;
      const off = PASTE_OFFSET * currentClipboard.count;
      const idMap: Record<string, string> = Object.create(null);
      const modelIdMap: Record<string, string> = Object.create(null);
      /* `viaReference` marks a model the copied view only points at — a lifeline's
         classifier, a component's interface. Cloning those too would duplicate the
         classifier itself, so within the same project they stay shared. */
      const targetModelId = (sourceId: string | undefined, viaReference = false): string => {
        const oldId = sourceId || String(sourceId);
        const source: Omit<DiagramModel, 'id'> = sourceModels[oldId] || { kind: 'note', name: 'Imported Element' };
        const changesC4Owner = source.kind === 'c4container' && source.c4OwnerModelId !== boundary?.modelId;
        const reuseModel = !currentClipboard.cloneModels || viaReference || source.kind === 'c4system';
        if (sameProject && state.models[oldId] && reuseModel && !changesC4Owner) return oldId;
        if (!modelIdMap[oldId]) {
          const nextId = modelUid();
          modelIdMap[oldId] = nextId;
          state.models[nextId] = { ...source, id: nextId };
          if (source.kind === 'c4container') state.models[nextId].c4OwnerModelId = boundary?.modelId;
          CLONED_MODEL_LIST_FIELDS.forEach(k => {
            const list = state.models[nextId][k];
            if (list) state.models[nextId][k] = [...list];
          });
          CLONED_MODEL_STRUCTURED_FIELDS.forEach(k => {
            if (state.models[nextId][k]) {
              Object.assign(state.models[nextId], { [k]: structuredClone(state.models[nextId][k]) });
            }
          });
          MODEL_REFERENCE_FIELDS.forEach(field => {
            const reference = source[field];
            if (reference && sourceModels[reference]) state.models[nextId][field] = targetModelId(reference, true);
          });
          if (Array.isArray(source.conveyedModelIds)) {
            state.models[nextId].conveyedModelIds = source.conveyedModelIds
              .filter(id => sourceModels[id])
              .map(id => targetModelId(id, true));
          }
          if (Array.isArray(source.itemFlowModelIds)) {
            state.models[nextId].itemFlowModelIds = source.itemFlowModelIds
              .filter(id => sourceModels[id])
              .map(id => targetModelId(id, true));
          }
        }
        return modelIdMap[oldId];
      };
      const newEls = usable.map(s => {
        const e = adoptView({
          ...s, id: uid(), modelId: targetModelId(s.modelId), x: snap(s.x + off),
          y: dg().type === 'sequence' && kindOf(s) === 'lifeline' ? sequenceLifelineTop(dg()) : snap(s.y + off),
        });
        idMap[s.id] = e.id;
        return e;
      });
      usable.forEach((source, index) => {
        const pasted = newEls[index];
        delete pasted.c4ContextFocus;
        if (pasted.kind === 'c4container') pasted.parentId = boundary?.id;
        else if (source.parentId && idMap[source.parentId]) pasted.parentId = idMap[source.parentId];
        else delete pasted.parentId;
      });
      const relationIdMap: Record<string, string> = Object.create(null);
      const sourceRelations = (src.relations || []).filter(r => idMap[r.from] && idMap[r.to]);
      const newRels = sourceRelations.map(r => {
        const id = uid();
        relationIdMap[r.id] = id;
        const pasted = {
          ...r, id, modelId: targetModelId(r.modelId), from: idMap[r.from], to: idMap[r.to],
        };
        if (Array.isArray(r.manualPoints)) {
          pasted.manualPoints = r.manualPoints
            .map(point => ({ x: snap(point.x + off), y: snap(point.y + off) }));
        }
        return adoptView(pasted);
      });
      newRels.forEach((relation, index) => {
        const sourceConnectorId = sourceRelations[index].connectorId;
        if (sourceConnectorId && relationIdMap[sourceConnectorId]) relation.connectorId = relationIdMap[sourceConnectorId];
        else if (sourceConnectorId) delete relation.connectorId;
      });
      usable.forEach((source, index) => {
        if (!source.constrainedViewId) return;
        const mapped = idMap[source.constrainedViewId] || relationIdMap[source.constrainedViewId];
        if (mapped) newEls[index].constrainedViewId = mapped;
        else delete newEls[index].constrainedViewId;
      });
      d.elements.push(...newEls);
      d.relations.push(...newRels);
      newRels.forEach(r => syncRelationModel(r, d));
      if (usable.length < src.elements.length) flashStatus(uiText(
        'Skipped elements that are incompatible with this diagram type.',
        '일부 요소는 이 다이어그램 타입에 맞지 않아 제외되었습니다',
      ));
      setSelection(newEls.map(e => e.id));
      render(); renderProps();
      if (currentClipboard.cloneModels) {
        /* several kinds share one label (four instance kinds are all 인스턴스), so
           count by label rather than by kind */
        const copied = new Map<string, number>();
        newEls.forEach(view => {
          const label = INDEPENDENT_COPY_KINDS[view.kind];
          if (label) copied.set(label, (copied.get(label) || 0) + 1);
        });
        const summary = [...copied].map(([label, count]) => uiText('{0}: {1}', '{0} {1}개', label, count)).join(', ');
        if (summary) flashStatus(uiText('Pasted as independent models: {0}.', '{0}를 독립 모델로 붙여넣었습니다', summary));
      }
    }
    function cutSelection() {
      if (!copySelection({ cloneModels: false })) return;
      // The clipboard carries only relations between the copied elements.
      deleteSelection(state.selection.filter(id => byId(id)));
      flashStatus(uiText('Cut selection · Ctrl+V to paste', '잘라내기 완료 — Ctrl+V로 붙여넣기'));
    }
    function duplicateSelection() {
      const prev = clipboard;
      if (copySelection()) pasteClipboard();
      clipboard = prev; // Ctrl+D는 클립보드를 건드리지 않음
    }

    function deleteSelection(selectedIds = state.selection) {
      const boundary = c4Model.systemBoundary(dg());
      const deletable = selectedIds.filter(id => id !== boundary?.id);
      const ids = new Set(deletable);
      deletable.map(byId).filter(present).forEach(root => descendantViews(root.id).forEach(child => ids.add(child.id)));
      if (!ids.size && boundary && selectedIds.includes(boundary.id)) {
        flashStatus(uiText(
          'Close the C4 Container diagram to remove its system boundary.',
          '시스템 경계를 삭제하려면 C4 컨테이너 다이어그램을 닫으세요',
        ));
      }
      if (!ids.size) return;
      snapshot();
      const d = dg();
      const removedConnectorIds = new Set(d.relations.filter(r => ids.has(r.id) && r.kind === 'commconnector').map(r => r.id));
      d.elements = d.elements.filter(e => !ids.has(e.id) && !(e.kind === 'timeconstraint' && ids.has(e.constrainedViewId || '')));
      d.relations = d.relations.filter(r => !ids.has(r.id) && !ids.has(r.from) && !ids.has(r.to) && !removedConnectorIds.has(r.connectorId || ''));
      setSelection([]);
      render(); renderProps();
    }

    function deleteFromModel() {
      const selectedViews = state.diagrams
        .flatMap(d => [...d.elements, ...d.relations])
        .filter(v => state.selection.includes(v.id));
      const modelIds = new Set(selectedViews.map(v => v.modelId).filter(present));
      if (!modelIds.size) return;
      if (state.diagrams.some(diagram => {
        const systemId = c4Model.systemBoundary(diagram)?.modelId;
        return systemId && modelIds.has(systemId);
      })) {
        flashStatus(uiText(
          'Close the linked C4 Container diagram before deleting its system model.',
          '시스템 모델을 삭제하려면 연결된 C4 컨테이너 다이어그램을 먼저 닫으세요',
        ));
        return;
      }
      Object.values(state.models).forEach(model => {
        if (model.kind === 'c4container' && model.c4OwnerModelId && modelIds.has(model.c4OwnerModelId)) {
          modelIds.add(model.id);
        }
      });
      snapshot();
      const relationModelIds = new Set<string>();
      state.diagrams.forEach(d => {
        const removedViewIds = new Set<string>();
        d.elements.filter(e => modelIds.has(e.modelId || '')).forEach(root => {
          removedViewIds.add(root.id);
          descendantViews(root.id, d).forEach(child => removedViewIds.add(child.id));
        });
        d.elements.filter(e => e.kind === 'timeconstraint' && removedViewIds.has(e.constrainedViewId || ''))
          .forEach(e => removedViewIds.add(e.id));
        d.elements = d.elements.filter(e => !removedViewIds.has(e.id));
        const removedConnectorIds = new Set(d.relations
          .filter(r => r.kind === 'commconnector' && (modelIds.has(r.modelId || '') || removedViewIds.has(r.from) || removedViewIds.has(r.to)))
          .map(r => r.id));
        d.relations = d.relations.filter(r => {
          const remove = modelIds.has(r.modelId || '') || removedViewIds.has(r.from) || removedViewIds.has(r.to)
            || removedConnectorIds.has(r.connectorId || '');
          if (remove && r.modelId) relationModelIds.add(r.modelId);
          return !remove;
        });
      });
      [...modelIds, ...relationModelIds].forEach(id => delete state.models[id]);
      setSelection([]);
      renderAll();
      flashStatus(uiText('Deleted {0} models and their linked views from all diagrams.', '모델 {0}개와 모든 다이어그램의 연결된 뷰를 삭제했습니다', modelIds.size));
    }

    function autoSizeSelection() {
      const selected = state.selection.map(byId).filter(present);
      if (!selected.length) { flashStatus(uiText('Select elements to resize automatically.', '자동 크기를 적용할 요소를 선택하세요')); return; }
      snapshot();
      selected.forEach(e => { e.w = 0; e.h = 0; });
      render(); renderProps();
    }

    function bindingConnectorStackInfo(relation: DiagramRelation | null | undefined, diagram = dg()) {
      const connectors = diagram.relations.filter(item => item.kind === 'bindingconnector');
      return {
        connectors,
        index: connectors.findIndex(item => item.id === relation?.id),
        total: connectors.length,
      };
    }

    function reorderBindingConnector(relation: DiagramRelation, action: 'backward' | 'forward' | 'back' | 'front') {
      const diagram = dg();
      const { connectors, index, total } = bindingConnectorStackInfo(relation, diagram);
      if (index < 0 || total < 2) return false;
      const nextIndex = ({
        backward: Math.max(0, index - 1),
        forward: Math.min(total - 1, index + 1),
        back: 0,
        front: total - 1,
      })[action];
      if (!Number.isInteger(nextIndex) || nextIndex === index) return false;

      snapshot();
      const slots = diagram.relations
        .map((item, slot) => item.kind === 'bindingconnector' ? slot : -1)
        .filter(slot => slot >= 0);
      const ordered = connectors.slice();
      const [moved] = ordered.splice(index, 1);
      ordered.splice(nextIndex, 0, moved);
      slots.forEach((slot, order) => { diagram.relations[slot] = ordered[order]; });
      render(); renderProps();

      const position = nextIndex + 1;
      flashStatus(uiText('Changed binding connector order to {0}/{1}.', 'Binding Connector 순서를 {0}/{1}(으)로 변경했습니다', position, total));
      return true;
    }

    function canReorderSelection(toFront: boolean) {
      if (state.selection.some(byId)) return true;
      const relation = relById(state.selectedId);
      if (relation?.kind !== 'bindingconnector') return false;
      const stack = bindingConnectorStackInfo(relation);
      return toFront
        ? stack.index >= 0 && stack.index < stack.total - 1
        : stack.index > 0;
    }

    function reorderSelection(toFront: boolean) {
      const ids = new Set(state.selection);
      const d = dg();
      const selected = d.elements.filter(e => ids.has(e.id));
      if (!selected.length) {
        const relation = relById(state.selectedId);
        if (relation?.kind === 'bindingconnector') {
          if (!reorderBindingConnector(relation, toFront ? 'front' : 'back')) {
            flashStatus(toFront ? uiText('This connector is already at the front.', '이미 맨 앞의 커넥터입니다') : uiText('This connector is already at the back.', '이미 맨 뒤의 커넥터입니다'));
          }
          return;
        }
        flashStatus(uiText('Select an element or binding connector to reorder.', '순서를 변경할 요소 또는 Binding Connector를 선택하세요'));
        return;
      }
      snapshot();
      const rest = d.elements.filter(e => !ids.has(e.id));
      d.elements = toFront ? [...rest, ...selected] : [...selected, ...rest];
      render(); renderProps();
    }

    function hasClipboard() {
      return !!clipboard;
    }

    return Object.freeze({
      autoSizeSelection,
      bindingConnectorStackInfo,
      canReorderSelection,
      copySelection,
      cutSelection,
      deleteFromModel,
      deleteSelection,
      duplicateSelection,
      expandedElementSelection,
      hasClipboard,
      moveSelectionByKey,
      pasteClipboard,
      reorderBindingConnector,
      reorderSelection,
      selectAllViews,
    });
  }

  return Object.freeze({
    REQUIRED_FUNCTIONS,
    REQUIRED_VALUES,
    CLONED_MODEL_LIST_FIELDS,
    CLONED_MODEL_STRUCTURED_FIELDS,
    MODEL_REFERENCE_FIELDS,
    PASTE_OFFSET,
    create,
  });
}
