'use strict';

/*
 * UML Studio model core
 *
 * Diagram entries are view objects (geometry/style) that reference semantic
 * model objects by modelId. Accessors keep the existing editor API compatible
 * while a single model can be rendered by multiple views.
 */
(function initModelCore(root, factory) {
  const commonJs = typeof module !== 'undefined' && module.exports;
  const erdSchema = commonJs ? require('./erd-schema.js') : root.UMLErdSchema;
  const api = factory(erdSchema);
  if (commonJs) module.exports = api;
  else root.UMLModelCore = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function createModelCore(erdSchema) {
  if (!erdSchema || typeof erdSchema.validateEntitySchema !== 'function'
    || typeof erdSchema.validateReferentialActions !== 'function') {
    throw new TypeError('Model Core에는 UMLErdSchema 스키마·FK 검증 API가 필요합니다.');
  }
  const { validateEntitySchema, validateReferentialActions } = erdSchema;
  const MODEL_FIELDS = Object.freeze([
    'kind', 'name', 'stereotype', 'isAbstract', 'attributes', 'operations', 'receptions',
    'literals', 'text', 'logicalName', 'columns', 'erdColumnDetails', 'erdChecks', 'erdIndexes',
    'isActor', 'operator',
    'condition', 'operands', 'seqNo', 'sourceLabel', 'targetLabel',
    'foreignKeyEnd', 'sourceColumnName', 'targetColumnName',
    'foreignKeyOnDelete', 'foreignKeyOnUpdate',
    'sourceEndName', 'targetEndName', 'sourceEndVisibility', 'targetEndVisibility',
    'sourceEndStereotype', 'targetEndStereotype',
    'sourceNavigability', 'targetNavigability', 'sourceAggregation', 'targetAggregation',
    'sourceQualifiers', 'targetQualifiers',
    'messageSort',
    'entry', 'doActivity', 'exit', 'internalTransitions', 'trigger', 'guard', 'effect',
    'submachineDiagramId', 'interactionDiagramId', 'referenceKind', 'classifierModelId', 'slots',
    'collaborationModelId', 'providedInterfaceModelId', 'requiredInterfaceModelId',
    'startTime', 'endTime', 'timeValue', 'constraint', 'defaultValue', 'expansionMode', 'visibility',
    'iconContent', 'isRequired', 'conveyedModelIds', 'itemFlowModelIds',
    'requirementType', 'requirementId', 'requirementText', 'risk', 'verificationMethod',
    'parts', 'references', 'values', 'flowProperties', 'constraintProperties',
    'properties', 'constraints', 'constraintParameters', 'valueTypeUnit', 'quantityKind',
  ]);

  const isObject = value => value !== null && typeof value === 'object' && !Array.isArray(value);
  const own = (value, key) => Object.prototype.hasOwnProperty.call(value, key);

  function hydrateView(view, models, idFactory) {
    if (!isObject(view)) throw new Error('뷰 데이터가 객체가 아닙니다.');
    let modelId = typeof view.modelId === 'string' && view.modelId ? view.modelId : '';
    let model = modelId ? models[modelId] : null;
    if (!isObject(model)) {
      modelId = idFactory();
      model = { id: modelId };
      models[modelId] = model;
    }
    view.modelId = modelId;

    MODEL_FIELDS.forEach(field => {
      if (own(view, field)) {
        if (model[field] === undefined) model[field] = view[field];
        delete view[field];
      }
      Object.defineProperty(view, field, {
        configurable: true,
        enumerable: false,
        get() { return models[this.modelId] ? models[this.modelId][field] : undefined; },
        set(value) {
          const target = models[this.modelId];
          if (!target) throw new Error(`모델을 찾을 수 없습니다: ${this.modelId}`);
          target[field] = value;
        },
      });
    });
    if (own(view, '_m')) delete view._m;
    if (own(view, '_depth')) delete view._depth;
    return view;
  }

  function hydrateProject(diagrams, sourceModels, idFactory) {
    const models = isObject(sourceModels) ? sourceModels : {};
    if (!Array.isArray(diagrams)) throw new Error('다이어그램 목록이 없습니다.');
    diagrams.forEach(diagram => {
      const fragmentModels = new Set();
      (diagram.elements || []).forEach(view => {
        hydrateView(view, models, idFactory);
        if (view.kind !== 'fragment') return;
        /* Older clipboard copies in the same diagram shared a fragment model. */
        if (fragmentModels.has(view.modelId)) {
          const id = idFactory();
          models[id] = { ...structuredClone(models[view.modelId]), id };
          view.modelId = id;
        }
        fragmentModels.add(view.modelId);
      });
      (diagram.relations || []).forEach(view => hydrateView(view, models, idFactory));
    });
    return models;
  }

  function modelKindOf(view, models) {
    if (typeof view.kind === 'string') return view.kind;
    return view.modelId && models[view.modelId] ? models[view.modelId].kind : undefined;
  }

  function validateProjectData(data, options) {
    const opt = options || {};
    const diagramTypes = new Set(opt.diagramTypes || []);
    const elementKinds = new Set(opt.elementKinds || []);
    const relationKinds = new Set(opt.relationKinds || []);
    const maxDiagrams = opt.maxDiagrams || 500;
    const maxViews = opt.maxViews || 20000;
    if (!isObject(data)) throw new Error('프로젝트 루트가 객체가 아닙니다.');
    if (data.version !== undefined && (!Number.isInteger(data.version) || data.version < 1 || data.version > 30)) {
      throw new Error(`지원하지 않는 프로젝트 버전: ${data.version}`);
    }
    if (data.projectId !== undefined
      && (typeof data.projectId !== 'string' || !/^[A-Za-z0-9._-]{1,128}$/.test(data.projectId))) {
      throw new Error('프로젝트 ID가 올바르지 않습니다.');
    }
    if (data.projectName !== undefined
      && (typeof data.projectName !== 'string' || !data.projectName.trim() || data.projectName.length > 200)) {
      throw new Error('프로젝트 이름이 올바르지 않습니다.');
    }

    const diagrams = Array.isArray(data.diagrams)
      ? data.diagrams
      : (Array.isArray(data.elements) && Array.isArray(data.relations)
        ? [{ id: 'legacy', type: 'class', elements: data.elements, relations: data.relations }]
        : null);
    if (!diagrams || !diagrams.length) throw new Error('프로젝트에 다이어그램이 없습니다.');
    if (diagrams.length > maxDiagrams) throw new Error(`다이어그램 수가 제한(${maxDiagrams})을 초과합니다.`);

    const models = isObject(data.models) ? data.models : {};
    if ((data.version || 0) >= 11 && !isObject(data.models)) {
      throw new Error('v11 프로젝트의 모델 저장소가 올바르지 않습니다.');
    }
    Object.entries(models).forEach(([id, model]) => {
      if (!isObject(model) || model.id !== id) throw new Error(`잘못된 모델 항목: ${id}`);
      if (typeof model.kind !== 'string') throw new Error(`모델 종류가 없습니다: ${id}`);
      for (const field of [
        'name', 'text', 'logicalName', 'stereotype', 'entry', 'doActivity', 'exit',
        'trigger', 'guard', 'effect', 'iconContent', 'requirementType',
        'requirementId', 'requirementText', 'risk', 'verificationMethod',
        'valueTypeUnit', 'quantityKind', 'defaultValue',
        'sourceEndName', 'targetEndName', 'sourceEndStereotype', 'targetEndStereotype',
        'sourceColumnName', 'targetColumnName',
      ]) {
        if (typeof model[field] === 'string' && model[field].length > 100000) {
          throw new Error(`모델 텍스트가 너무 깁니다: ${id}.${field}`);
        }
      }
      if (model.foreignKeyEnd !== undefined
        && !['', 'source', 'target'].includes(model.foreignKeyEnd)) {
        throw new Error(`ERD FK 보유 끝점이 올바르지 않습니다: ${id}.foreignKeyEnd`);
      }
      for (const field of ['sourceColumnName', 'targetColumnName']) {
        if (model[field] !== undefined && typeof model[field] !== 'string') {
          throw new Error(`ERD FK 컬럼 이름이 올바르지 않습니다: ${id}.${field}`);
        }
      }
      if (model.foreignKeyOnDelete !== undefined || model.foreignKeyOnUpdate !== undefined) {
        try {
          validateReferentialActions(model);
        } catch (error) {
          throw new Error(`ERD FK 참조 동작이 올바르지 않습니다: ${id} · ${error.message}`);
        }
      }
      if (model.kind === 'entity') validateEntitySchema(model, []);
      for (const field of ['sourceEndVisibility', 'targetEndVisibility']) {
        if (model[field] !== undefined
          && !['public', 'protected', 'private', 'package'].includes(model[field])) {
          throw new Error(`관계 끝점 가시성이 올바르지 않습니다: ${id}.${field}`);
        }
      }
      for (const field of ['sourceNavigability', 'targetNavigability']) {
        if (model[field] !== undefined
          && !['unspecified', 'navigable', 'notNavigable'].includes(model[field])) {
          throw new Error(`관계 끝점 탐색 방향이 올바르지 않습니다: ${id}.${field}`);
        }
      }
      for (const field of ['sourceAggregation', 'targetAggregation']) {
        if (model[field] !== undefined && !['none', 'shared', 'composite'].includes(model[field])) {
          throw new Error(`관계 끝점 집합 종류가 올바르지 않습니다: ${id}.${field}`);
        }
      }
      for (const field of ['sourceQualifiers', 'targetQualifiers']) {
        if (model[field] !== undefined
          && (!Array.isArray(model[field]) || model[field].length > 50
            || model[field].some(value => typeof value !== 'string' || value.length > 1000))) {
          throw new Error(`관계 끝점 한정자가 올바르지 않습니다: ${id}.${field}`);
        }
      }
    });

    let viewCount = 0;
    const diagramIds = new Set();
    diagrams.forEach((diagram, index) => {
      if (!isObject(diagram)) throw new Error(`다이어그램 ${index + 1} 데이터가 올바르지 않습니다.`);
      if (typeof diagram.id !== 'string' || !diagram.id) throw new Error(`다이어그램 ID가 올바르지 않습니다: ${index + 1}`);
      if (diagramIds.has(diagram.id)) throw new Error(`중복된 다이어그램 ID: ${diagram.id}`);
      diagramIds.add(diagram.id);
      if (diagram.name !== undefined && (typeof diagram.name !== 'string' || diagram.name.length > 10000)) {
        throw new Error(`다이어그램 이름이 올바르지 않습니다: ${diagram.id}`);
      }
      if (typeof diagram.type !== 'string' || (diagramTypes.size && !diagramTypes.has(diagram.type))) {
        throw new Error(`지원하지 않는 다이어그램 종류: ${diagram.type || '(없음)'}`);
      }
      if (!Array.isArray(diagram.elements) || !Array.isArray(diagram.relations)) {
        throw new Error(`다이어그램의 요소 목록이 올바르지 않습니다: ${diagram.name || index + 1}`);
      }
      viewCount += diagram.elements.length + diagram.relations.length;
      if (viewCount > maxViews) throw new Error(`전체 요소 수가 제한(${maxViews})을 초과합니다.`);

      const ids = new Set();
      diagram.elements.forEach(view => {
        if (!isObject(view) || typeof view.id !== 'string' || !view.id) throw new Error('요소 ID가 올바르지 않습니다.');
        if (ids.has(view.id)) throw new Error(`중복된 뷰 ID: ${view.id}`);
        ids.add(view.id);
        const kind = modelKindOf(view, models);
        if (!elementKinds.has(kind)) throw new Error(`지원하지 않는 요소 종류: ${kind || '(없음)'}`);
        for (const key of ['x', 'y', 'w', 'h']) {
          if (view[key] !== undefined && (!Number.isFinite(view[key]) || Math.abs(view[key]) > 1000000)) {
            throw new Error(`잘못된 요소 좌표: ${view.id}.${key}`);
          }
        }
        if ((data.version || 0) >= 11 && !models[view.modelId]) throw new Error(`요소 모델을 찾을 수 없습니다: ${view.modelId}`);
      });
      diagram.elements.forEach(view => {
        if (view.parentId === undefined || view.parentId === null || view.parentId === '') return;
        if (typeof view.parentId !== 'string' || view.parentId === view.id || !ids.has(view.parentId)) {
          throw new Error(`요소의 포함 부모를 찾을 수 없습니다: ${view.id}`);
        }
        const visited = new Set([view.id]);
        let current = view;
        while (current.parentId) {
          if (visited.has(current.parentId)) throw new Error(`요소 포함 관계가 순환합니다: ${view.id}`);
          visited.add(current.parentId);
          current = diagram.elements.find(x => x.id === current.parentId);
          if (!current) break;
        }
      });
      diagram.relations.forEach(view => {
        if (!isObject(view) || typeof view.id !== 'string' || !view.id) throw new Error('관계 ID가 올바르지 않습니다.');
        if (ids.has(view.id)) throw new Error(`중복된 뷰 ID: ${view.id}`);
        ids.add(view.id);
        const kind = modelKindOf(view, models);
        if (!relationKinds.has(kind)) throw new Error(`지원하지 않는 관계 종류: ${kind || '(없음)'}`);
        if (typeof view.from !== 'string' || typeof view.to !== 'string' || !ids.has(view.from) || !ids.has(view.to)) {
          throw new Error(`관계의 연결 대상을 찾을 수 없습니다: ${view.id}`);
        }
        if ((data.version || 0) >= 11 && !models[view.modelId]) throw new Error(`관계 모델을 찾을 수 없습니다: ${view.modelId}`);
        const routeKind = modelKindOf(view, models);
        if (view.routeMode !== undefined && !['auto', 'manual'].includes(view.routeMode)) {
          throw new Error(`관계 라우팅 모드가 올바르지 않습니다: ${view.id}`);
        }
        if (view.manualPoints !== undefined) {
          if (routeKind !== 'bindingconnector'
            || !Array.isArray(view.manualPoints)
            || view.manualPoints.length > 200
            || view.manualPoints.some(point =>
              !isObject(point)
              || !Number.isFinite(point.x) || !Number.isFinite(point.y)
              || Math.abs(point.x) > 1000000 || Math.abs(point.y) > 1000000)) {
            throw new Error(`수동 라우팅 굴곡점이 올바르지 않습니다: ${view.id}`);
          }
        }
        if (view.routeMode === 'manual' && !Array.isArray(view.manualPoints)) {
          throw new Error(`수동 라우팅 굴곡점이 없습니다: ${view.id}`);
        }
        if (view.jumpStyle !== undefined
          && (routeKind !== 'bindingconnector' || !['arc', 'gap', 'none'].includes(view.jumpStyle))) {
          throw new Error(`관계 Line Jump 스타일이 올바르지 않습니다: ${view.id}`);
        }
      });
      if ((data.version || 0) >= 16) {
        const relationIds = new Set(diagram.relations.map(view => view.id));
        diagram.relations.forEach(view => {
          if (view.connectorId !== undefined
            && (typeof view.connectorId !== 'string' || !relationIds.has(view.connectorId))) {
            throw new Error(`Communication Message의 Connector를 찾을 수 없습니다: ${view.id}`);
          }
        });
      }
      if ((data.version || 0) >= 19) {
        diagram.elements.filter(view => modelKindOf(view, models) === 'timeconstraint').forEach(view => {
          if (typeof view.constrainedViewId !== 'string' || !ids.has(view.constrainedViewId)) {
            throw new Error(`Time Constraint의 연결 대상을 찾을 수 없습니다: ${view.id}`);
          }
        });
      }
    });
    if ((data.version || 0) >= 23) {
      const diagramById = new Map(diagrams.map(diagram => [diagram.id, diagram]));
      diagrams.forEach(diagram => {
        diagram.elements.forEach(view => {
          const kind = modelKindOf(view, models);
          if (kind !== 'interactionuse' && kind !== 'interactioninline') return;
          const model = models[view.modelId] || view;
          const referenceId = model.interactionDiagramId;
          if (referenceId === undefined || referenceId === null || referenceId === '') return;
          const referenced = diagramById.get(referenceId);
          if (typeof referenceId !== 'string' || !referenced || referenced.type !== 'sequence') {
            throw new Error(`Interaction의 Sequence Diagram 참조가 올바르지 않습니다: ${view.id}`);
          }
        });
      });
    }
    if ((data.version || 0) >= 24) {
      Object.values(models).filter(model => model.kind === 'informationflow').forEach(model => {
        if (model.conveyedModelIds === undefined) return;
        if (!Array.isArray(model.conveyedModelIds)
          || model.conveyedModelIds.some(id => typeof id !== 'string' || !models[id])) {
          throw new Error(`Information Flow의 conveyed 참조가 올바르지 않습니다: ${model.id}`);
        }
      });
    }
    if ((data.version || 0) >= 27) {
      Object.values(models).filter(model => model.kind === 'connector').forEach(model => {
        if (model.itemFlowModelIds === undefined) return;
        if (!Array.isArray(model.itemFlowModelIds)
          || model.itemFlowModelIds.some(id => typeof id !== 'string' || !models[id])) {
          throw new Error(`Connector의 Item Flow 참조가 올바르지 않습니다: ${model.id}`);
        }
      });
    }
    if (data.activeId !== undefined && !diagramIds.has(data.activeId)) throw new Error(`활성 다이어그램을 찾을 수 없습니다: ${data.activeId}`);
    return true;
  }

  function stringifyProject(data, pretty) {
    return JSON.stringify(data, (key, value) => (key === '_m' || key === '_depth') ? undefined : value, pretty ? 2 : 0);
  }

  return { MODEL_FIELDS, hydrateView, hydrateProject, validateProjectData, stringifyProject };
});
