'use strict';

/*
 * UML Studio model core
 *
 * Diagram entries are view objects (geometry/style) that reference semantic
 * model objects by modelId. Accessors keep the existing editor API compatible
 * while a single model can be rendered by multiple views.
 */
interface ModelSchemaValidation {
  validateEntitySchema(entity: Record<string, unknown>, columns: string[]): unknown;
  validateReferentialActions(relation: Record<string, unknown>): unknown;
}

type ModelCoreApi = ReturnType<typeof createModelCore>;
declare var UMLModelCore: ModelCoreApi;

(function initModelCore(
  root: typeof globalThis & { UMLErdSchema?: ModelSchemaValidation; UMLModelCore?: ModelCoreApi },
  factory: (erdSchema?: ModelSchemaValidation) => ModelCoreApi,
) {
  const commonJs = typeof module !== 'undefined' && module.exports;
  const erdSchema = commonJs ? require('./erd-schema.js') : root.UMLErdSchema;
  const api = factory(erdSchema);
  if (commonJs) module.exports = api;
  else root.UMLModelCore = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, createModelCore);

function createModelCore(erdSchema?: ModelSchemaValidation) {
  const c4Model = globalThis.UMLC4Model
    ?? require('./c4-model.js') as C4ModelApi;
  const { text: uiText } = globalThis.UMLLanguage
    ?? require('../editor/language.js') as typeof UMLLanguage;

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
    'c4Description', 'c4Technology', 'c4ContainerType', 'c4OwnerModelId',
  ]);

  type ProjectObject = Record<string, unknown>;
  type Models = Record<string, ProjectObject>;
  type ValidatedDiagram = { type: string; elements: ProjectObject[] };
  interface ProjectValidationOptions {
    diagramTypes?: Iterable<string>;
    elementKinds?: Iterable<string>;
    relationKinds?: Iterable<string>;
    maxDiagrams?: number;
    maxViews?: number;
  }

  const isObject = (value: unknown): value is ProjectObject => value !== null && typeof value === 'object' && !Array.isArray(value);
  const own = (value: object, key: PropertyKey) => Object.prototype.hasOwnProperty.call(value, key);

  function hydrateView<View extends DiagramElement | DiagramRelation>(view: View, models: DiagramModels, idFactory: () => string): View & { modelId: string };
  function hydrateView(view: unknown, models: Record<string, object>, idFactory: () => string): ProjectObject & { modelId: string };
  function hydrateView(view: unknown, models: Record<string, object>, idFactory: () => string) {
    if (!isObject(view)) throw new Error(uiText('View data must be an object.', '뷰 데이터가 객체가 아닙니다.'));
    let modelId = typeof view.modelId === 'string' && view.modelId ? view.modelId : '';
    let model = modelId ? models[modelId] : null;
    if (!isObject(model)) {
      modelId = idFactory();
      model = { id: modelId };
      models[modelId] = model;
    }
    view.modelId = modelId;

    const targetModel = model as ProjectObject;
    MODEL_FIELDS.forEach(field => {
      if (own(view, field)) {
        if (targetModel[field] === undefined) targetModel[field] = view[field];
        delete view[field];
      }
      Object.defineProperty(view, field, {
        configurable: true,
        enumerable: false,
        get(this: { modelId: string }) { return (models[this.modelId] as ProjectObject | undefined)?.[field]; },
        set(this: { modelId: string }, value: unknown) {
          const target = models[this.modelId];
          if (!target) throw new Error(uiText('Model not found: {0}', '모델을 찾을 수 없습니다: {0}', this.modelId));
          (target as ProjectObject)[field] = value;
        },
      });
    });
    if (own(view, '_m')) delete view._m;
    if (own(view, '_depth')) delete view._depth;
    return view as ProjectObject & { modelId: string };
  }

  function hydrateProject(diagrams: EditorDiagram[], sourceModels: DiagramModels, idFactory: () => string): DiagramModels;
  function hydrateProject(diagrams: { elements?: unknown[]; relations?: unknown[] }[], sourceModels: unknown, idFactory: () => string): Models;
  function hydrateProject(diagrams: { elements?: unknown[]; relations?: unknown[] }[], sourceModels: unknown, idFactory: () => string): Models | DiagramModels {
    const models = (isObject(sourceModels) ? sourceModels : {}) as Models;
    if (!Array.isArray(diagrams)) throw new Error(uiText('Missing diagram list.', '다이어그램 목록이 없습니다.'));
    diagrams.forEach(diagram => {
      const fragmentModels = new Set();
      (diagram.elements || []).forEach(view => {
        const hydrated = hydrateView(view, models, idFactory);
        if (hydrated.kind !== 'fragment') return;
        /* Older clipboard copies in the same diagram shared a fragment model. */
        if (fragmentModels.has(hydrated.modelId)) {
          const id = idFactory();
          models[id] = { ...structuredClone(models[hydrated.modelId]), id };
          hydrated.modelId = id;
        }
        fragmentModels.add(hydrated.modelId);
      });
      (diagram.relations || []).forEach(view => hydrateView(view, models, idFactory));
    });
    return models;
  }

  function referencedModel(view: ProjectObject, models: Models) {
    return typeof view.modelId === 'string' ? models[view.modelId] : undefined;
  }

  function modelKindOf(view: ProjectObject, models: Models): string | undefined {
    if (typeof view.kind === 'string') return view.kind;
    const kind = referencedModel(view, models)?.kind;
    return typeof kind === 'string' ? kind : undefined;
  }

  function matchesOneOf(value: unknown, allowed: readonly string[]) {
    return typeof value === 'string' && allowed.includes(value);
  }

  function validCoordinate(value: unknown) {
    return typeof value === 'number' && Number.isFinite(value) && Math.abs(value) <= 1000000;
  }

  function validateProjectData(data: unknown, options?: ProjectValidationOptions | null) {
    const opt = options || {};
    const diagramTypes = new Set(opt.diagramTypes || []);
    const elementKinds = new Set(opt.elementKinds || []);
    const relationKinds = new Set(opt.relationKinds || []);
    const maxDiagrams = opt.maxDiagrams || 500;
    const maxViews = opt.maxViews || 20000;
    if (!isObject(data)) throw new Error(uiText('The project root must be an object.', '프로젝트 루트가 객체가 아닙니다.'));
    const version = data.version;
    if (version !== undefined && (typeof version !== 'number' || !Number.isInteger(version) || version < 1 || version > 30)) {
      throw new Error(uiText('Unsupported project version: {0}', '지원하지 않는 프로젝트 버전: {0}', data.version));
    }
    if (data.projectId !== undefined
      && (typeof data.projectId !== 'string' || !/^[A-Za-z0-9._-]{1,128}$/.test(data.projectId))) {
      throw new Error(uiText('Invalid project ID.', '프로젝트 ID가 올바르지 않습니다.'));
    }
    if (data.projectName !== undefined
      && (typeof data.projectName !== 'string' || !data.projectName.trim() || data.projectName.length > 200)) {
      throw new Error(uiText('Invalid project name.', '프로젝트 이름이 올바르지 않습니다.'));
    }

    const diagrams: unknown[] | null = Array.isArray(data.diagrams)
      ? data.diagrams
      : (Array.isArray(data.elements) && Array.isArray(data.relations)
        ? [{ id: 'legacy', type: 'class', elements: data.elements, relations: data.relations }]
        : null);
    if (!diagrams || !diagrams.length) throw new Error(uiText('The project has no diagrams.', '프로젝트에 다이어그램이 없습니다.'));
    if (diagrams.length > maxDiagrams) throw new Error(uiText(
      'The project exceeds the limit of {0} diagrams.',
      '다이어그램 수가 제한({0})을 초과합니다.',
      maxDiagrams,
    ));

    const rawModels = isObject(data.models) ? data.models : {};
    if ((version || 0) >= 11 && !isObject(data.models)) {
      throw new Error(uiText('Invalid model store for a v11 project.', 'v11 프로젝트의 모델 저장소가 올바르지 않습니다.'));
    }
    Object.entries(rawModels).forEach(([id, model]) => {
      if (!isObject(model) || model.id !== id) throw new Error(uiText('Invalid model entry: {0}', '잘못된 모델 항목: {0}', id));
      if (typeof model.kind !== 'string') throw new Error(uiText('Missing model type: {0}', '모델 종류가 없습니다: {0}', id));
      for (const field of [
        'name', 'text', 'logicalName', 'stereotype', 'entry', 'doActivity', 'exit',
        'trigger', 'guard', 'effect', 'iconContent', 'requirementType',
        'requirementId', 'requirementText', 'risk', 'verificationMethod',
        'valueTypeUnit', 'quantityKind', 'defaultValue',
        'sourceEndName', 'targetEndName', 'sourceEndStereotype', 'targetEndStereotype',
        'sourceColumnName', 'targetColumnName',
      ]) {
        const value = model[field];
        if (typeof value === 'string' && value.length > 100000) {
          throw new Error(uiText('Model text exceeds the length limit: {0}.{1}', '모델 텍스트가 너무 깁니다: {0}.{1}', id, field));
        }
      }
      if (model.foreignKeyEnd !== undefined
        && !matchesOneOf(model.foreignKeyEnd, ['', 'source', 'target'])) {
        throw new Error(uiText('Invalid ERD foreign key owner: {0}.foreignKeyEnd', 'ERD FK 보유 끝점이 올바르지 않습니다: {0}.foreignKeyEnd', id));
      }
      for (const field of ['sourceColumnName', 'targetColumnName']) {
        if (model[field] !== undefined && typeof model[field] !== 'string') {
          throw new Error(uiText('Invalid ERD foreign key column name: {0}.{1}', 'ERD FK 컬럼 이름이 올바르지 않습니다: {0}.{1}', id, field));
        }
      }
      if (model.foreignKeyOnDelete !== undefined || model.foreignKeyOnUpdate !== undefined) {
        try {
          validateReferentialActions(model);
        } catch (error) {
          throw new Error(uiText(
            'Invalid ERD foreign key action: {0} · {1}',
            'ERD FK 참조 동작이 올바르지 않습니다: {0} · {1}',
            id,
            error instanceof Error ? error.message : String(error),
          ));
        }
      }
      if (model.kind === 'entity') validateEntitySchema(model, []);
      for (const field of ['sourceEndVisibility', 'targetEndVisibility']) {
        if (model[field] !== undefined
          && !matchesOneOf(model[field], ['public', 'protected', 'private', 'package'])) {
          throw new Error(uiText('Invalid relationship end visibility: {0}.{1}', '관계 끝점 가시성이 올바르지 않습니다: {0}.{1}', id, field));
        }
      }
      for (const field of ['c4Description', 'c4Technology']) {
        const value = model[field];
        if (value !== undefined && (typeof value !== 'string' || value.length > 100000)) {
          throw new Error(uiText('Invalid C4 text: {0}.{1}', 'C4 텍스트가 올바르지 않습니다: {0}.{1}', id, field));
        }
      }
      for (const field of ['sourceNavigability', 'targetNavigability']) {
        if (model[field] !== undefined
          && !matchesOneOf(model[field], ['unspecified', 'navigable', 'notNavigable'])) {
          throw new Error(uiText('Invalid relationship end navigability: {0}.{1}', '관계 끝점 탐색 방향이 올바르지 않습니다: {0}.{1}', id, field));
        }
      }
      for (const field of ['sourceAggregation', 'targetAggregation']) {
        if (model[field] !== undefined && !matchesOneOf(model[field], ['none', 'shared', 'composite'])) {
          throw new Error(uiText('Invalid relationship end aggregation: {0}.{1}', '관계 끝점 집합 종류가 올바르지 않습니다: {0}.{1}', id, field));
        }
      }
      for (const field of ['sourceQualifiers', 'targetQualifiers']) {
        const qualifiers = model[field];
        if (qualifiers !== undefined
          && (!Array.isArray(qualifiers) || qualifiers.length > 50
            || qualifiers.some((value: unknown) => typeof value !== 'string' || value.length > 1000))) {
          throw new Error(uiText('Invalid relationship end qualifier: {0}.{1}', '관계 끝점 한정자가 올바르지 않습니다: {0}.{1}', id, field));
        }
      }
    });

    const models = rawModels as Models;
    Object.values(models).forEach(model => {
      if (model.kind !== 'c4container') return;
      const ownerId = model.c4OwnerModelId;
      if (typeof ownerId !== 'string' || models[ownerId]?.kind !== 'c4system'
        || !matchesOneOf(model.c4ContainerType, ['application', 'database'])) {
        throw new Error(uiText('Invalid C4 container model: {0}', 'C4 Container 모델이 올바르지 않습니다: {0}', model.id));
      }
    });
    let viewCount = 0;
    const diagramIds = new Set<string>();
    const c4ContainerSystems = new Set<string>();
    const diagramById = new Map<string, ValidatedDiagram>();
    diagrams.forEach((diagram, index) => {
      if (!isObject(diagram)) throw new Error(uiText('Invalid data for diagram {0}.', '다이어그램 {0} 데이터가 올바르지 않습니다.', index + 1));
      if (typeof diagram.id !== 'string' || !diagram.id) throw new Error(uiText(
        'Invalid diagram ID: {0}',
        '다이어그램 ID가 올바르지 않습니다: {0}',
        index + 1,
      ));
      if (diagramIds.has(diagram.id)) throw new Error(uiText('Duplicate diagram ID: {0}', '중복된 다이어그램 ID: {0}', diagram.id));
      diagramIds.add(diagram.id);
      if (diagram.name !== undefined && (typeof diagram.name !== 'string' || diagram.name.length > 10000)) {
        throw new Error(uiText('Invalid diagram name: {0}', '다이어그램 이름이 올바르지 않습니다: {0}', diagram.id));
      }
      if (typeof diagram.type !== 'string' || (diagramTypes.size && !diagramTypes.has(diagram.type))) {
        throw new Error(uiText('Unsupported diagram type: {0}', '지원하지 않는 다이어그램 종류: {0}', diagram.type || uiText('(none)', '(없음)')));
      }
      if (!Array.isArray(diagram.elements) || !Array.isArray(diagram.relations)) {
        throw new Error(uiText('Invalid diagram element list: {0}', '다이어그램의 요소 목록이 올바르지 않습니다: {0}', diagram.name || index + 1));
      }
      viewCount += diagram.elements.length + diagram.relations.length;
      if (viewCount > maxViews) throw new Error(uiText('The project exceeds the limit of {0} elements.', '전체 요소 수가 제한({0})을 초과합니다.', maxViews));

      const ids = new Set<string>();
      const elements: ProjectObject[] = [];
      const relations: ProjectObject[] = [];
      diagram.elements.forEach((view: unknown) => {
        if (!isObject(view) || typeof view.id !== 'string' || !view.id) throw new Error(uiText('Invalid element ID.', '요소 ID가 올바르지 않습니다.'));
        if (ids.has(view.id)) throw new Error(uiText('Duplicate view ID: {0}', '중복된 뷰 ID: {0}', view.id));
        ids.add(view.id);
        elements.push(view);
        const kind = modelKindOf(view, models);
        if (!kind || !elementKinds.has(kind)) throw new Error(uiText(
          'Unsupported element type: {0}',
          '지원하지 않는 요소 종류: {0}',
          kind || uiText('(none)', '(없음)'),
        ));
        for (const key of ['x', 'y', 'w', 'h']) {
          if (view[key] !== undefined && !validCoordinate(view[key])) {
            throw new Error(uiText('Invalid element coordinate: {0}.{1}', '잘못된 요소 좌표: {0}.{1}', view.id, key));
          }
        }
        if (kind === 'boundary' && view.borderStyle !== undefined
          && !matchesOneOf(view.borderStyle, ['solid', 'dashed'])) {
          throw new Error(uiText('Invalid boundary border style: {0}', '경계 테두리 스타일이 올바르지 않습니다: {0}', view.id));
        }
        if ((version || 0) >= 11 && !referencedModel(view, models)) throw new Error(uiText(
          'Element model not found: {0}',
          '요소 모델을 찾을 수 없습니다: {0}',
          view.modelId,
        ));
      });
      elements.forEach(view => {
        if (view.parentId === undefined || view.parentId === null || view.parentId === '') return;
        if (typeof view.parentId !== 'string' || view.parentId === view.id || !ids.has(view.parentId)) {
          throw new Error(uiText('Parent element not found: {0}', '요소의 포함 부모를 찾을 수 없습니다: {0}', view.id));
        }
        const visited = new Set<unknown>([view.id]);
        let current: ProjectObject | undefined = view;
        while (current?.parentId) {
          if (visited.has(current.parentId)) throw new Error(uiText(
            'Element containment contains a cycle: {0}',
            '요소 포함 관계가 순환합니다: {0}',
            view.id,
          ));
          visited.add(current.parentId);
          const parentId: unknown = current.parentId;
          current = elements.find(x => x.id === parentId);
          if (!current) break;
        }
      });
      diagram.relations.forEach((view: unknown) => {
        if (!isObject(view) || typeof view.id !== 'string' || !view.id) throw new Error(uiText('Invalid relationship ID.', '관계 ID가 올바르지 않습니다.'));
        if (ids.has(view.id)) throw new Error(uiText('Duplicate view ID: {0}', '중복된 뷰 ID: {0}', view.id));
        ids.add(view.id);
        relations.push(view);
        const kind = modelKindOf(view, models);
        if (!kind || !relationKinds.has(kind)) throw new Error(uiText(
          'Unsupported relationship type: {0}',
          '지원하지 않는 관계 종류: {0}',
          kind || uiText('(none)', '(없음)'),
        ));
        if (typeof view.from !== 'string' || typeof view.to !== 'string' || !ids.has(view.from) || !ids.has(view.to)) {
          throw new Error(uiText('Relationship endpoint not found: {0}', '관계의 연결 대상을 찾을 수 없습니다: {0}', view.id));
        }
        if ((version || 0) >= 11 && !referencedModel(view, models)) throw new Error(uiText(
          'Relationship model not found: {0}',
          '관계 모델을 찾을 수 없습니다: {0}',
          view.modelId,
        ));
        const routeKind = modelKindOf(view, models);
        if (view.routeMode !== undefined && !matchesOneOf(view.routeMode, ['auto', 'manual'])) {
          throw new Error(uiText('Invalid relationship routing mode: {0}', '관계 라우팅 모드가 올바르지 않습니다: {0}', view.id));
        }
        if (view.manualPoints !== undefined) {
          if (routeKind !== 'bindingconnector'
            || !Array.isArray(view.manualPoints)
            || view.manualPoints.length > 200
            || view.manualPoints.some((point: unknown) =>
              !isObject(point) || !validCoordinate(point.x) || !validCoordinate(point.y))) {
            throw new Error(uiText('Invalid manual routing waypoint: {0}', '수동 라우팅 굴곡점이 올바르지 않습니다: {0}', view.id));
          }
        }
        if (view.routeMode === 'manual' && !Array.isArray(view.manualPoints)) {
          throw new Error(uiText('Missing manual routing waypoints: {0}', '수동 라우팅 굴곡점이 없습니다: {0}', view.id));
        }
        if (view.jumpStyle !== undefined
          && (routeKind !== 'bindingconnector' || !matchesOneOf(view.jumpStyle, ['arc', 'gap', 'none']))) {
          throw new Error(uiText('Invalid line jump style: {0}', '관계 Line Jump 스타일이 올바르지 않습니다: {0}', view.id));
        }
      });
      if ((version || 0) >= 16) {
        const relationIds = new Set(relations.map(view => view.id));
        relations.forEach(view => {
          if (view.connectorId !== undefined
            && (typeof view.connectorId !== 'string' || !relationIds.has(view.connectorId))) {
            throw new Error(uiText(
              'Connector for communication message not found: {0}',
              'Communication Message의 Connector를 찾을 수 없습니다: {0}',
              view.id,
            ));
          }
        });
      }
      if ((version || 0) >= 19) {
        elements.filter(view => modelKindOf(view, models) === 'timeconstraint').forEach(view => {
          if (typeof view.constrainedViewId !== 'string' || !ids.has(view.constrainedViewId)) {
            throw new Error(uiText('Time constraint target not found: {0}', 'Time Constraint의 연결 대상을 찾을 수 없습니다: {0}', view.id));
          }
        });
      }
      const systemId = c4Model.validateDiagram(
        { id: diagram.id, type: diagram.type, elements, relations },
        view => referencedModel(view, models),
      );
      if (systemId) {
        if (c4ContainerSystems.has(systemId)) throw new Error(uiText(
          'A C4 Container diagram already exists for this system: {0}',
          '같은 시스템의 C4 Container 다이어그램이 중복되었습니다: {0}',
          diagram.id,
        ));
        c4ContainerSystems.add(systemId);
      }
      diagramById.set(diagram.id, { type: diagram.type, elements });
    });
    if ((version || 0) >= 23) {
      diagramById.forEach(diagram => {
        diagram.elements.forEach(view => {
          const kind = modelKindOf(view, models);
          if (kind !== 'interactionuse' && kind !== 'interactioninline') return;
          const model = referencedModel(view, models) || view;
          const referenceId = model.interactionDiagramId;
          if (referenceId === undefined || referenceId === null || referenceId === '') return;
          const referenced = typeof referenceId === 'string' ? diagramById.get(referenceId) : undefined;
          if (typeof referenceId !== 'string' || !referenced || referenced.type !== 'sequence') {
            throw new Error(uiText(
              'Invalid sequence diagram reference on interaction: {0}',
              'Interaction의 Sequence Diagram 참조가 올바르지 않습니다: {0}',
              view.id,
            ));
          }
        });
      });
    }
    if ((version || 0) >= 24) {
      Object.values(models).filter(model => model.kind === 'informationflow').forEach(model => {
        if (model.conveyedModelIds === undefined) return;
        if (!Array.isArray(model.conveyedModelIds)
          || model.conveyedModelIds.some(id => typeof id !== 'string' || !models[id])) {
          throw new Error(uiText('Invalid conveyed information reference: {0}', 'Information Flow의 conveyed 참조가 올바르지 않습니다: {0}', model.id));
        }
      });
    }
    if ((version || 0) >= 27) {
      Object.values(models).filter(model => model.kind === 'connector').forEach(model => {
        if (model.itemFlowModelIds === undefined) return;
        if (!Array.isArray(model.itemFlowModelIds)
          || model.itemFlowModelIds.some(id => typeof id !== 'string' || !models[id])) {
          throw new Error(uiText('Invalid connector item flow reference: {0}', 'Connector의 Item Flow 참조가 올바르지 않습니다: {0}', model.id));
        }
      });
    }
    if (data.activeId !== undefined && (typeof data.activeId !== 'string' || !diagramIds.has(data.activeId))) throw new Error(uiText(
      'Active diagram not found: {0}',
      '활성 다이어그램을 찾을 수 없습니다: {0}',
      data.activeId,
    ));
    return true;
  }

  function stringifyProject(data: unknown, pretty?: boolean) {
    return JSON.stringify(data, (key, value) => (key === '_m' || key === '_depth') ? undefined : value, pretty ? 2 : 0);
  }

  return { MODEL_FIELDS, hydrateView, hydrateProject, validateProjectData, stringifyProject };
}
