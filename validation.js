'use strict';

(function initValidation(root, factory) {
  let iconScript = root && root.UMLIconScript;
  let erdColumn = root && root.UMLErdColumn;
  let erdSchema = root && root.UMLErdSchema;
  if (!iconScript && typeof module !== 'undefined' && module.exports && typeof require === 'function') {
    iconScript = require('./icon-script.js');
  }
  if (!erdColumn && typeof module !== 'undefined' && module.exports && typeof require === 'function') {
    erdColumn = require('./erd-column.js');
  }
  if (!erdSchema && typeof module !== 'undefined' && module.exports && typeof require === 'function') {
    erdSchema = require('./erd-schema.js');
  }
  const api = factory(iconScript, erdColumn, erdSchema);
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  if (root) root.UMLValidation = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function createValidation(iconScript, erdColumn, erdSchema) {
  const parseIconScript = iconScript && iconScript.parseIconScript
    ? iconScript.parseIconScript
    : () => ({ valid: true, errors: [] });
  const parseErdColumn = erdColumn && erdColumn.parseColumn
    ? erdColumn.parseColumn
    : raw => ({ flags: [], phys: String(raw || '').trim(), logical: '', type: '' });
  const validateErdColumn = erdColumn && erdColumn.validateColumn
    ? erdColumn.validateColumn
    : column => ({ valid: !!column.phys, error: '물리명을 입력하세요.' });
  const validateErdSchema = erdSchema && erdSchema.validateEntitySchema
    ? erdSchema.validateEntitySchema
    : () => ({ columnDetails: {}, checks: [], indexes: [] });
  const validateReferentialActions = erdSchema && erdSchema.validateReferentialActions
    ? erdSchema.validateReferentialActions
    : () => ({ onDelete: '', onUpdate: '' });
  const ER_RELATION_KINDS = new Set(['erd-11', 'erd-1n', 'erd-nm']);
  const NAME_REQUIRED = new Set([
    'class', 'interface', 'enumeration', 'package', 'model', 'subsystem', 'metaclass', 'stereotype', 'actor', 'usecase', 'boundary',
    'lifeline', 'component', 'interfaceball', 'artifact', 'node', 'entity',
    'process', 'external', 'datastore', 'mindnode', 'stateinvariant', 'continuation', 'state', 'compositestate', 'submachinestate',
    'object', 'artifactinstance', 'componentinstance', 'nodeinstance',
    'collaboration', 'part', 'reference', 'value', 'port', 'collaborationuse',
    'constraintproperty', 'constraintparameter',
    'timingstate', 'interactionuse', 'interactioninline',
    'informationitem',
    'requirement',
    'block', 'valuetype', 'interfaceblock', 'constraintblock',
  ]);

  const UNIT_INDEX = new Map();
  [
    ['time', [
      ['ns', ['nanosecond', 'nanoseconds']],
      ['us', ['µs', 'μs', 'microsecond', 'microseconds']],
      ['ms', ['millisecond', 'milliseconds']],
      ['s', ['sec', 'second', 'seconds']],
      ['min', ['minute', 'minutes']],
      ['h', ['hr', 'hour', 'hours']],
    ]],
    ['length', [
      ['mm', ['millimeter', 'millimeters', 'millimetre', 'millimetres']],
      ['cm', ['centimeter', 'centimeters', 'centimetre', 'centimetres']],
      ['m', ['meter', 'meters', 'metre', 'metres']],
      ['km', ['kilometer', 'kilometers', 'kilometre', 'kilometres']],
      ['in', ['inch', 'inches']],
      ['ft', ['foot', 'feet']],
    ]],
    ['mass', [
      ['mg', ['milligram', 'milligrams']],
      ['g', ['gram', 'grams']],
      ['kg', ['kilogram', 'kilograms']],
      ['t', ['tonne', 'tonnes']],
      ['lb', ['pound', 'pounds']],
    ]],
    ['temperature', [
      ['K', ['kelvin']],
      ['degC', ['°C', 'celsius']],
      ['degF', ['°F', 'fahrenheit']],
    ]],
    ['angle', [
      ['rad', ['radian', 'radians']],
      ['deg', ['°', 'degree', 'degrees']],
    ]],
    ['electric current', [
      ['uA', ['µA', 'μA', 'microampere', 'microamperes']],
      ['mA', ['milliampere', 'milliamperes']],
      ['A', ['ampere', 'amperes']],
      ['kA', ['kiloampere', 'kiloamperes']],
    ]],
    ['voltage', [
      ['uV', ['µV', 'μV', 'microvolt', 'microvolts']],
      ['mV', ['millivolt', 'millivolts']],
      ['V', ['volt', 'volts']],
      ['kV', ['kilovolt', 'kilovolts']],
    ]],
  ].forEach(([family, definitions]) => {
    definitions.forEach(([canonical, aliases]) => {
      [canonical, ...aliases].forEach(alias => {
        const raw = String(alias).replace(/[µμ]/g, 'u').replace(/\s+/g, '');
        UNIT_INDEX.set(raw, { family, canonical });
        if (raw.length > 2) UNIT_INDEX.set(raw.toLowerCase(), { family, canonical });
      });
    });
  });

  const semanticToken = value => String(value || '').trim().toLowerCase().replace(/\s+/g, ' ');
  const unitInfo = value => {
    const raw = String(value || '').trim().replace(/[µμ]/g, 'u').replace(/\s+/g, '');
    if (!raw) return { raw: '', canonical: '', family: '' };
    const indexed = UNIT_INDEX.get(raw) || (raw.length > 2 ? UNIT_INDEX.get(raw.toLowerCase()) : null);
    return indexed ? { raw, ...indexed } : { raw, canonical: raw, family: '' };
  };
  const typeDescription = type => {
    if (!type) return '(missing type)';
    if (type.kind !== 'valuetype') return type.name || type.kind || '(unnamed type)';
    const details = [
      type.quantityKind ? `quantityKind=${type.quantityKind}` : '',
      type.valueTypeUnit ? `unit=${type.valueTypeUnit}` : '',
    ].filter(Boolean);
    return `${type.name || 'ValueType'}${details.length ? ` (${details.join(', ')})` : ''}`;
  };
  const modelConformsTo = (childId, parentId, models) => {
    const pending = [childId], visited = new Set();
    while (pending.length) {
      const current = pending.pop();
      if (current === parentId) return true;
      if (!current || visited.has(current)) continue;
      visited.add(current);
      Object.values(models || {})
        .filter(model => model.kind === 'generalization' && model.fromModelId === current)
        .forEach(model => pending.push(model.toModelId));
    }
    return false;
  };

  function bindingTypeCompatibility(fromTypeId, toTypeId, models) {
    const result = (status, code, message) => ({ status, code, message });
    if (!fromTypeId || !toTypeId) {
      return result('unknown', '', 'Binding Connector 양 끝의 Type을 모두 지정하면 호환성을 검사할 수 있습니다.');
    }
    const fromType = models && models[fromTypeId];
    const toType = models && models[toTypeId];
    if (!fromType || !toType) {
      return result('error', 'PAR024', 'Binding Connector가 존재하지 않는 Type을 참조합니다.');
    }
    if (fromTypeId === toTypeId) {
      return result('compatible', '', `호환됨 · ${typeDescription(fromType)}`);
    }
    if (fromType.kind !== toType.kind) {
      return result('error', 'PAR024',
        `Binding Connector의 Type 종류가 호환되지 않습니다: ${typeDescription(fromType)} ↔ ${typeDescription(toType)}`);
    }
    const conforms = modelConformsTo(fromTypeId, toTypeId, models)
      || modelConformsTo(toTypeId, fromTypeId, models);
    if (fromType.kind !== 'valuetype') {
      return conforms
        ? result('compatible', '', `호환되는 일반화 Type · ${typeDescription(fromType)} ↔ ${typeDescription(toType)}`)
        : result('error', 'PAR024',
          `서로 다른 ${fromType.kind} Type은 Binding할 수 없습니다: ${typeDescription(fromType)} ↔ ${typeDescription(toType)}`);
    }

    const fromQuantity = semanticToken(fromType.quantityKind);
    const toQuantity = semanticToken(toType.quantityKind);
    const fromUnit = unitInfo(fromType.valueTypeUnit);
    const toUnit = unitInfo(toType.valueTypeUnit);
    if (fromQuantity && toQuantity && fromQuantity !== toQuantity) {
      return result('error', 'PAR024',
        `Quantity Kind가 호환되지 않습니다: ${typeDescription(fromType)} ↔ ${typeDescription(toType)}`);
    }
    if (fromUnit.family && toUnit.family && fromUnit.family !== toUnit.family) {
      return result('error', 'PAR024',
        `Unit 차원이 호환되지 않습니다: ${typeDescription(fromType)} ↔ ${typeDescription(toType)}`);
    }
    const sameUnit = fromUnit.canonical && fromUnit.canonical === toUnit.canonical;
    const sameQuantity = fromQuantity && fromQuantity === toQuantity;
    if (fromUnit.raw && toUnit.raw && !sameUnit) {
      if (sameQuantity || (fromUnit.family && fromUnit.family === toUnit.family)) {
        return result('warning', 'PAR025',
          `호환 가능한 Quantity지만 Unit 환산이 필요합니다: ${typeDescription(fromType)} ↔ ${typeDescription(toType)}`);
      }
      return conforms
        ? result('compatible', '', `호환되는 일반화 Value Type · ${typeDescription(fromType)} ↔ ${typeDescription(toType)}`)
        : result('warning', 'PAR021',
          `서로 다른 Value Type의 동등성을 확인할 수 없습니다: ${typeDescription(fromType)} ↔ ${typeDescription(toType)}`);
    }
    if (!!fromQuantity !== !!toQuantity || (!!fromUnit.raw !== !!toUnit.raw)) {
      return result('warning', 'PAR026',
        `Unit/Quantity Kind 메타데이터가 한쪽 Type에만 정의되어 있습니다: ${typeDescription(fromType)} ↔ ${typeDescription(toType)}`);
    }
    if (sameQuantity || sameUnit || conforms) {
      return result('compatible', '', `호환됨 · ${typeDescription(fromType)} ↔ ${typeDescription(toType)}`);
    }
    return result('warning', 'PAR021',
      `서로 다른 Value Type의 동등성을 확인할 수 없습니다: ${typeDescription(fromType)} ↔ ${typeDescription(toType)}`);
  }

  function defaultValueUnitCompatibility(defaultValue, valueType) {
    const result = (status, code, message) => ({ status, code, message });
    const rawValue = String(defaultValue || '').trim();
    if (!rawValue || !valueType || valueType.kind !== 'valuetype') {
      return result('unknown', '', 'Value Type과 숫자 기본값이 있으면 Unit을 검사할 수 있습니다.');
    }
    const match = rawValue.match(/^[+\-]?(?:\d+(?:\.\d*)?|\.\d+)(?:e[+\-]?\d+)?\s*(.*?)\s*$/i);
    if (!match) {
      return result('unknown', '', '수식 기본값은 실행 시점에 Unit을 확인해야 합니다.');
    }
    const expected = unitInfo(valueType.valueTypeUnit);
    const actual = unitInfo(match[1]);
    if (!expected.raw && !actual.raw) return result('compatible', '', '단위 없는 숫자 기본값');
    if (expected.raw && !actual.raw) {
      return result('warning', 'PAR027',
        `기본값에 Unit이 없습니다: ${rawValue} · Type ${typeDescription(valueType)}`);
    }
    if (!expected.raw && actual.raw) {
      return result('warning', 'PAR027',
        `기본값에는 Unit이 있지만 Value Type에는 Unit이 없습니다: ${rawValue} · Type ${typeDescription(valueType)}`);
    }
    if (expected.canonical === actual.canonical) {
      return result('compatible', '', `기본값 Unit 호환됨 · ${rawValue}`);
    }
    if (expected.family && actual.family && expected.family !== actual.family) {
      return result('error', 'PAR029',
        `기본값 Unit이 Value Type과 호환되지 않습니다: ${rawValue} · Type ${typeDescription(valueType)}`);
    }
    return result('warning', 'PAR028',
      `기본값 Unit을 Value Type의 Unit으로 환산하거나 확인해야 합니다: ${rawValue} · Type ${typeDescription(valueType)}`);
  }

  function validateProject(project) {
    const issues = [];
    const models = project.models || {};
    const diagrams = project.diagrams || [];
    const modelOf = view => models[view.modelId] || view;
    const kindOf = view => modelOf(view).kind;
    const nameOf = view => modelOf(view).name || '';
    const issue = (severity, code, message, diagram, view, extra) => issues.push({
      severity, code, message,
      diagramId: diagram && diagram.id,
      diagramName: diagram && diagram.name,
      viewId: view && view.id,
      modelId: view && view.modelId,
      modelName: view ? nameOf(view) : '',
      ...(extra || {}),
    });

    const uniqueRelations = new Map();
    const requirementIds = new Map();
    const validatedRequirementModels = new Set();
    diagrams.forEach(diagram => {
      if (!diagram.elements.length && !diagram.relations.length) {
        issue('info', 'PRJ001', '다이어그램이 비어 있습니다.', diagram, null);
      }
      const elementIds = new Set(diagram.elements.map(x => x.id));
      const names = new Map();
      diagram.elements.forEach(view => {
        const model = modelOf(view), kind = model.kind, name = String(model.name || '').trim();
        if (view.modelId && !models[view.modelId]) issue('error', 'PRJ002', '참조하는 모델을 찾을 수 없습니다.', diagram, view);
        if (NAME_REQUIRED.has(kind) && !name) issue('error', 'UML001', '이름이 필요합니다.', diagram, view);
        if (name && kind !== 'interactionuse' && kind !== 'interactioninline') {
          const key = `${kind}\u0000${name.toLowerCase()}`;
          const previous = names.get(key);
          if (previous && previous.modelId !== view.modelId) {
            issue('warning', 'UML002', `같은 다이어그램에 ${kind} 이름 '${name}'이(가) 중복됩니다.`, diagram, view);
          } else names.set(key, view);
        }
        if (kind === 'interface') {
          (model.operations || []).forEach(op => {
            if (/^\s*[-#~]/.test(op)) issue('error', 'UML011', `인터페이스 연산은 public이어야 합니다: ${op}`, diagram, view);
          });
        }
        if (kind === 'entity') validateEntity(model, diagram, view, issue);
        if (kind === 'execution') {
          const life = diagram.elements.find(x => x.id === view.lifeId);
          if (!life || kindOf(life) !== 'lifeline') issue('error', 'SEQ001', '실행 사양이 유효한 Lifeline에 연결되지 않았습니다.', diagram, view);
          if (!Number.isFinite(view.h) || view.h < 20) issue('warning', 'SEQ002', '실행 사양의 높이는 20 이상이어야 합니다.', diagram, view);
        }
      });

      diagram.relations.forEach(view => {
        const model = modelOf(view), kind = model.kind;
        if (view.modelId && !models[view.modelId]) issue('error', 'PRJ002', '참조하는 관계 모델을 찾을 수 없습니다.', diagram, view);
        const from = diagram.elements.find(x => x.id === view.from);
        const to = diagram.elements.find(x => x.id === view.to);
        if (!from || !to || !elementIds.has(view.from) || !elementIds.has(view.to)) {
          issue('error', 'PRJ003', '관계의 연결 대상을 찾을 수 없습니다.', diagram, view); return;
        }
        if (view.modelId && !uniqueRelations.has(view.modelId)) uniqueRelations.set(view.modelId, { view, diagram, model, from, to });
        if (!view.modelId) uniqueRelations.set(`${diagram.id}:${view.id}`, { view, diagram, model, from, to });
        if (kind && kind.startsWith('msg-') && (kindOf(from) !== 'lifeline' || kindOf(to) !== 'lifeline')) {
          issue('error', 'SEQ003', 'Sequence Message는 Lifeline 사이에만 연결할 수 있습니다.', diagram, view);
        }
        if (kind === 'transition' && (!STATE_VERTEX_KINDS.has(kindOf(from)) || !STATE_VERTEX_KINDS.has(kindOf(to)))) {
          issue('error', 'STM007', 'Transition은 State 또는 Pseudostate 사이에만 연결할 수 있습니다.', diagram, view);
        }
        if (kind === 'association') validateActorAssociation(from, to, diagram, view, kindOf, issue);
        if (ER_RELATION_KINDS.has(kind)) {
          validateErdForeignKey(model, diagram, view, from, to, modelOf, kindOf, issue);
        }
      });

      validateActivity(diagram, kindOf, modelOf, issue);
      validateInteractionOverview(diagram, kindOf, modelOf, issue, diagrams);
      validatePackageDiagram(diagram, kindOf, modelOf, issue);
      validateProfileDiagram(diagram, kindOf, modelOf, issue);
      validateStateMachine(diagram, kindOf, modelOf, issue, diagrams);
      validateObjectDiagram(diagram, kindOf, modelOf, issue, models);
      validateCommunicationDiagram(diagram, kindOf, modelOf, issue);
      validateCompositeStructureDiagram(diagram, kindOf, modelOf, issue, models);
      validateTimingDiagram(diagram, kindOf, modelOf, issue, models);
      validateInformationFlowDiagram(diagram, kindOf, modelOf, issue, models);
      validateRequirementDiagram(
        diagram, kindOf, modelOf, issue,
        requirementIds, validatedRequirementModels,
      );
      validateBlockDefinitionDiagram(diagram, kindOf, modelOf, issue, models);
      validateInternalBlockDiagram(diagram, kindOf, modelOf, issue, models);
      validateParametricDiagram(diagram, kindOf, modelOf, issue, models);
    });

    const relations = [...uniqueRelations.values()];
    validateDuplicateRelations(relations, 'generalization', 'UML007', issue);
    validateDuplicateRelations(relations, 'realization', 'UML009', issue);
    validateCycles(relations, 'generalization', 'UML008', '순환 Generalization이 발견되었습니다.', issue);
    validateCycles(relations, 'include', 'UML020', 'Use Case include 관계가 순환합니다.', issue);
    return issues.sort((a, b) => severityOrder(a.severity) - severityOrder(b.severity) || a.code.localeCompare(b.code));
  }

  function severityOrder(value) { return value === 'error' ? 0 : value === 'warning' ? 1 : 2; }

  function validateActorAssociation(from, to, diagram, relation, kindOf, issue) {
    const allowed = new Set(['actor', 'usecase', 'component', 'class']);
    if (kindOf(from) === 'actor' && !allowed.has(kindOf(to))) issue('error', 'UML019', 'Actor는 Use Case, Component 또는 Class와만 연결할 수 있습니다.', diagram, relation);
    if (kindOf(to) === 'actor' && !allowed.has(kindOf(from))) issue('error', 'UML019', 'Actor는 Use Case, Component 또는 Class와만 연결할 수 있습니다.', diagram, relation);
  }

  function validateDuplicateRelations(relations, kind, code, issue) {
    const seen = new Map();
    relations.filter(x => x.model.kind === kind).forEach(entry => {
      const key = `${entry.from.modelId}->${entry.to.modelId}`;
      if (seen.has(key)) issue('error', code, `중복 ${kind} 관계가 있습니다.`, entry.diagram, entry.view);
      else seen.set(key, entry);
    });
  }

  function validateCycles(relations, kind, code, message, issue) {
    const edges = relations.filter(x => x.model.kind === kind);
    const graph = new Map();
    edges.forEach(x => {
      if (!graph.has(x.from.modelId)) graph.set(x.from.modelId, []);
      graph.get(x.from.modelId).push({ to: x.to.modelId, entry: x });
    });
    const visiting = new Set(), visited = new Set(), reported = new Set();
    function walk(node) {
      if (visiting.has(node)) return true;
      if (visited.has(node)) return false;
      visiting.add(node);
      for (const edge of graph.get(node) || []) {
        if (walk(edge.to) && !reported.has(edge.entry.view.modelId || edge.entry.view.id)) {
          reported.add(edge.entry.view.modelId || edge.entry.view.id);
          issue('error', code, message, edge.entry.diagram, edge.entry.view);
        }
      }
      visiting.delete(node); visited.add(node); return false;
    }
    [...graph.keys()].forEach(walk);
  }

  function validateActivity(diagram, kindOf, modelOf, issue) {
    if (diagram.type !== 'activity' && diagram.type !== 'interactionoverview') return;
    const interactionOverview = diagram.type === 'interactionoverview';
    const elements = new Map(diagram.elements.map(view => [view.id, view]));
    const flowKinds = interactionOverview
      ? new Set(['controlflow'])
      : new Set(['controlflow', 'objectflow', 'exceptionhandler', 'activityinterrupt']);
    const objectKinds = new Set([
      'objectnode', 'centralbuffer', 'activitydatastore', 'activityparameter',
      'inputpin', 'outputpin', 'expansioninput', 'expansionoutput',
    ]);
    const actionKinds = new Set(['action', 'sendsignal', 'acceptsignal', 'timeevent']);
    const vertexKinds = new Set([
      ...actionKinds, 'initial', 'final', 'flowfinal', 'decision', 'merge', 'forkbar', 'joinbar',
      'structuredactivity', 'interactionuse', 'interactioninline', ...objectKinds,
    ]);
    const controlFlows = diagram.relations.filter(r => modelOf(r).kind === 'controlflow');
    const allFlows = diagram.relations.filter(r => flowKinds.has(modelOf(r).kind));
    const ancestor = (view, expectedKind) => {
      let current = view;
      const seen = new Set();
      while (current && current.parentId && !seen.has(current.parentId)) {
        seen.add(current.parentId);
        current = elements.get(current.parentId);
        if (current && kindOf(current) === expectedKind) return current;
      }
      return null;
    };
    const validBorderAnchor = view => {
      const anchor = view.borderAnchor;
      return anchor && Number.isFinite(anchor.fx) && Number.isFinite(anchor.fy)
        && anchor.fx >= 0 && anchor.fx <= 1 && anchor.fy >= 0 && anchor.fy <= 1
        && (anchor.fx === 0 || anchor.fx === 1 || anchor.fy === 0 || anchor.fy === 1);
    };

    diagram.elements.forEach(view => {
      const incoming = controlFlows.filter(r => r.to === view.id);
      const outgoing = controlFlows.filter(r => r.from === view.id);
      const allOutgoing = allFlows.filter(r => r.from === view.id);
      const kind = kindOf(view);
      if (kind === 'initial') {
        if (incoming.length) issue('error', 'UML048', 'Initial Node에는 들어오는 흐름이 없어야 합니다.', diagram, view);
        if (outgoing.length > 1) issue('error', 'UML021', 'Initial Node에는 나가는 흐름이 최대 하나만 허용됩니다.', diagram, view);
        if (outgoing.some(r => String(modelOf(r).name || '').trim())) issue('warning', 'UML022', 'Initial Node의 나가는 흐름에는 Guard를 사용할 수 없습니다.', diagram, view);
      }
      if ((kind === 'final' || kind === 'flowfinal') && allOutgoing.length) {
        issue('error', 'UML050', `${kind === 'final' ? 'Activity Final' : 'Flow Final'} Node에는 나가는 흐름이 없어야 합니다.`, diagram, view);
      }
      if (kind === 'decision' && (incoming.length < 1 || incoming.length > 2 || outgoing.length < 1)) {
        issue('error', 'UML045', 'Decision Node는 1~2개의 입력과 하나 이상의 출력을 가져야 합니다.', diagram, view);
      }
      if (kind === 'merge' && (incoming.length < 1 || outgoing.length !== 1)) {
        issue('error', 'ACT001', 'Merge Node는 하나 이상의 입력과 정확히 하나의 출력을 가져야 합니다.', diagram, view);
      }
      if (kind === 'forkbar') {
        if (incoming.length !== 1 || outgoing.length < 2) issue('error', 'UML051', 'Fork Node는 정확히 하나의 입력과 둘 이상의 출력을 가져야 합니다.', diagram, view);
      }
      if (kind === 'joinbar' && (incoming.length < 2 || outgoing.length !== 1)) {
        issue('error', 'UML053', 'Join Node는 둘 이상의 입력과 정확히 하나의 출력을 가져야 합니다.', diagram, view);
      }
      if (kind === 'inputpin' || kind === 'outputpin') {
        const owner = elements.get(view.parentId);
        if (!owner || !actionKinds.has(kindOf(owner))) {
          issue('error', 'ACT002', 'Input/Output Pin은 Action 또는 Signal/Time Event Action에 부착되어야 합니다.', diagram, view);
        }
        if (!validBorderAnchor(view)) issue('error', 'ACT003', 'Pin은 소유 Action의 테두리에 고정되어야 합니다.', diagram, view);
      }
      if (kind === 'expansioninput' || kind === 'expansionoutput') {
        const owner = elements.get(view.parentId);
        if (!owner || kindOf(owner) !== 'expansionregion') {
          issue('error', 'ACT004', 'Expansion Node는 Expansion Region에 부착되어야 합니다.', diagram, view);
        }
        if (!validBorderAnchor(view)) issue('error', 'ACT005', 'Expansion Node는 Expansion Region의 테두리에 고정되어야 합니다.', diagram, view);
      }
      if (kind === 'expansionregion' && !['parallel', 'iterative', 'stream'].includes(modelOf(view).expansionMode || 'parallel')) {
        issue('error', 'ACT006', 'Expansion Region 모드는 parallel, iterative 또는 stream이어야 합니다.', diagram, view);
      }
    });

    allFlows.forEach(flow => {
      const kind = modelOf(flow).kind;
      const from = elements.get(flow.from), to = elements.get(flow.to);
      if (!from || !to) return;
      if (!vertexKinds.has(kindOf(from)) || !vertexKinds.has(kindOf(to))) {
        issue('error', 'ACT007', `${kind}는 Activity Node 사이에만 연결할 수 있습니다.`, diagram, flow);
        return;
      }
      if (flow.from === flow.to) issue('error', 'ACT008', 'Activity Flow는 같은 요소에 다시 연결할 수 없습니다.', diagram, flow);
      if (kindOf(to) === 'initial') issue('error', 'ACT009', 'Initial Node에는 들어오는 흐름을 연결할 수 없습니다.', diagram, flow);
      if (kind === 'controlflow' && (objectKinds.has(kindOf(from)) || objectKinds.has(kindOf(to)))) {
        issue('error', 'ACT010', 'Object Node와 Pin에는 Control Flow 대신 Object Flow를 사용해야 합니다.', diagram, flow);
      }
      if (kind === 'objectflow') {
        const allowed = view => objectKinds.has(kindOf(view)) || actionKinds.has(kindOf(view)) || kindOf(view) === 'structuredactivity';
        if (!allowed(from) || !allowed(to)) issue('error', 'ACT011', 'Object Flow의 연결 대상이 올바르지 않습니다.', diagram, flow);
        if (kindOf(from) === 'inputpin' || kindOf(from) === 'expansioninput') {
          issue('error', 'ACT015', 'Input Pin/Expansion Node는 외부 Object Flow의 도착점이어야 합니다.', diagram, flow);
        }
        if (kindOf(to) === 'outputpin' || kindOf(to) === 'expansionoutput') {
          issue('error', 'ACT016', 'Output Pin/Expansion Node는 외부 Object Flow의 시작점이어야 합니다.', diagram, flow);
        }
      }
      if (kind === 'exceptionhandler') {
        const actionLike = view => actionKinds.has(kindOf(view)) || kindOf(view) === 'structuredactivity';
        if (!actionLike(from) || !actionLike(to)) issue('error', 'ACT012', 'Exception Handler는 Action 또는 Structured Activity Node 사이에 연결해야 합니다.', diagram, flow);
      }
      if (kind === 'activityinterrupt') {
        const region = ancestor(from, 'interruptibleregion');
        if (!region) issue('error', 'ACT013', 'Activity Interrupt는 Interruptible Activity Region 내부에서 시작해야 합니다.', diagram, flow);
        else if (ancestor(to, 'interruptibleregion')?.id === region.id) {
          issue('error', 'ACT014', 'Activity Interrupt는 같은 Interruptible Activity Region 밖으로 나가야 합니다.', diagram, flow);
        }
      }
    });
  }

  function validateInteractionOverview(diagram, kindOf, modelOf, issue, diagrams) {
    if (diagram.type !== 'interactionoverview') return;
    const allowedElements = new Set([
      'interactionuse', 'interactioninline', 'initial', 'final', 'forkbar', 'joinbar', 'merge', 'decision', 'note',
    ]);
    const allowedRelations = new Set(['controlflow', 'notelink']);
    diagram.elements.forEach(view => {
      const kind = kindOf(view);
      if (!allowedElements.has(kind)) {
        issue('error', 'IOV002', 'Interaction Overview Diagram에서 지원하지 않는 노드입니다.', diagram, view);
        return;
      }
      if (kind !== 'interactionuse' && kind !== 'interactioninline') return;
      const referenceId = modelOf(view).interactionDiagramId;
      const referenced = diagrams.find(candidate => candidate.id === referenceId);
      if (!referenceId || !referenced || referenced.type !== 'sequence') {
        issue('error', 'IOV001', `${kind === 'interactioninline' ? 'Interaction (inline)' : 'Interaction Use'}에 유효한 Sequence Diagram 참조가 필요합니다.`, diagram, view);
      }
    });
    diagram.relations.forEach(view => {
      if (!allowedRelations.has(modelOf(view).kind)) {
        issue('error', 'IOV003', 'Interaction Overview Diagram에서는 Control Flow와 Note Link만 사용할 수 있습니다.', diagram, view);
      }
    });
  }

  function validatePackageDiagram(diagram, kindOf, modelOf, issue) {
    if (diagram.type !== 'package') return;
    const containerKinds = new Set(['package', 'model', 'subsystem']);
    const elements = new Map(diagram.elements.map(view => [view.id, view]));
    const containmentBySource = new Map();
    const hasAncestor = (view, candidateId) => {
      let current = view;
      const seen = new Set();
      while (current && current.parentId && !seen.has(current.parentId)) {
        if (current.parentId === candidateId) return true;
        seen.add(current.parentId);
        current = elements.get(current.parentId);
      }
      return false;
    };

    diagram.elements.forEach(view => {
      const kind = kindOf(view);
      if (!containerKinds.has(kind)) return;
      if (view.parentId) {
        const owner = elements.get(view.parentId);
        if (!owner || !containerKinds.has(kindOf(owner))) {
          issue('error', 'PKG001', 'Package, Model, Subsystem은 Package 컨테이너에만 포함될 수 있습니다.', diagram, view);
        }
      }
      if (!['public', 'protected', 'private', 'package'].includes(modelOf(view).visibility || 'public')) {
        issue('error', 'PKG002', 'Package 요소의 Visibility 값이 올바르지 않습니다.', diagram, view);
      }
    });

    diagram.relations.forEach(relation => {
      const kind = kindOf(relation);
      if (kind !== 'containment' && kind !== 'dependency') return;
      const from = elements.get(relation.from), to = elements.get(relation.to);
      if (!from || !to) return;
      if (!containerKinds.has(kindOf(from)) || !containerKinds.has(kindOf(to))) {
        issue('error', 'PKG003', `${kind === 'containment' ? 'Containment' : 'Dependency'}는 Package, Model, Subsystem 사이에 연결해야 합니다.`, diagram, relation);
        return;
      }
      if (relation.from === relation.to) {
        issue('error', 'PKG004', 'Package 관계는 자기 자신을 대상으로 할 수 없습니다.', diagram, relation);
      }
      if (kind === 'containment') {
        if (containmentBySource.has(relation.from)) {
          issue('error', 'PKG005', '한 Package 요소에는 하나의 Containment 관계만 허용됩니다.', diagram, relation);
        } else containmentBySource.set(relation.from, relation);
        if (from.parentId !== to.id) {
          issue('error', 'PKG006', 'Containment 관계와 실제 Package 포함 부모가 일치하지 않습니다.', diagram, relation);
        }
        if (hasAncestor(to, from.id)) {
          issue('error', 'PKG007', 'Package 포함 관계가 순환합니다.', diagram, relation);
        }
      }
    });
  }

  function validateProfileDiagram(diagram, kindOf, modelOf, issue) {
    if (diagram.type !== 'profile') return;
    const elements = new Map(diagram.elements.map(view => [view.id, view]));
    const validVisibility = new Set(['public', 'protected', 'private', 'package']);
    diagram.elements.forEach(view => {
      const kind = kindOf(view), model = modelOf(view);
      if (kind !== 'metaclass' && kind !== 'stereotype') return;
      if (!validVisibility.has(model.visibility || 'public')) {
        issue('error', 'PROF001', 'Profile 요소의 Visibility 값이 올바르지 않습니다.', diagram, view);
      }
      if (kind === 'stereotype' && String(model.iconContent || '').trim()) {
        const parsed = parseIconScript(model.iconContent);
        if (!parsed.valid) {
          issue('error', 'PROF002', `Stereotype Icon Script가 올바르지 않습니다: ${parsed.errors[0]}`, diagram, view);
        }
      }
    });

    const extensionPairs = new Set();
    const generalizations = [];
    diagram.relations.forEach(relation => {
      const kind = kindOf(relation);
      const from = elements.get(relation.from), to = elements.get(relation.to);
      if (!from || !to) return;
      if (kind === 'extension') {
        if (kindOf(from) !== 'stereotype' || kindOf(to) !== 'metaclass') {
          issue('error', 'PROF003', 'Extension은 Stereotype에서 MetaClass 방향으로 연결되어야 합니다.', diagram, relation);
          return;
        }
        const key = `${relation.from}->${relation.to}`;
        if (extensionPairs.has(key)) {
          issue('error', 'PROF004', '같은 Stereotype과 MetaClass 사이에 중복 Extension이 있습니다.', diagram, relation);
        } else extensionPairs.add(key);
        if (modelOf(relation).isRequired !== undefined && typeof modelOf(relation).isRequired !== 'boolean') {
          issue('error', 'PROF005', 'Extension의 isRequired 값은 boolean이어야 합니다.', diagram, relation);
        }
      }
      if (kind === 'generalization') {
        if (kindOf(from) !== 'stereotype' || kindOf(to) !== 'stereotype') {
          issue('error', 'PROF006', 'Profile Diagram의 Generalization은 Stereotype 사이에만 연결되어야 합니다.', diagram, relation);
        } else generalizations.push(relation);
      }
    });

    const graph = new Map();
    generalizations.forEach(relation => {
      if (!graph.has(relation.from)) graph.set(relation.from, []);
      graph.get(relation.from).push({ to: relation.to, relation });
    });
    const visiting = new Set(), visited = new Set(), reported = new Set();
    const walk = id => {
      if (visiting.has(id)) return true;
      if (visited.has(id)) return false;
      visiting.add(id);
      for (const edge of graph.get(id) || []) {
        if (walk(edge.to) && !reported.has(edge.relation.id)) {
          reported.add(edge.relation.id);
          issue('error', 'PROF007', 'Stereotype Generalization이 순환합니다.', diagram, edge.relation);
        }
      }
      visiting.delete(id); visited.add(id);
      return false;
    };
    [...graph.keys()].forEach(walk);
  }

  const STATE_VERTEX_KINDS = new Set([
    'state', 'compositestate', 'submachinestate', 'stateinitial', 'statefinal', 'choice', 'junction', 'statefork',
    'shallowhistory', 'deephistory', 'entrypoint', 'exitpoint', 'terminate', 'connectionpointref',
  ]);

  function validateStateMachine(diagram, kindOf, modelOf, issue, diagrams) {
    if (diagram.type !== 'state') return;
    const transitions = diagram.relations.filter(r => modelOf(r).kind === 'transition');
    const elementById = new Map(diagram.elements.map(e => [e.id, e]));
    const regions = diagram.elements.filter(e => kindOf(e) === 'region');

    regions.forEach(region => {
      const owner = elementById.get(region.parentId);
      if (!owner || kindOf(owner) !== 'compositestate') {
        issue('error', 'STM011', 'Region은 Composite State에 포함되어야 합니다.', diagram, region);
      }
      const members = diagram.elements.filter(e => e.parentId === region.id);
      const countKind = kind => members.filter(e => kindOf(e) === kind).length;
      if (countKind('stateinitial') > 1) issue('error', 'STM014', '한 Region에는 Initial Pseudostate를 최대 하나만 둘 수 있습니다.', diagram, region);
      if (countKind('shallowhistory') > 1) issue('error', 'STM015', '한 Region에는 Shallow History를 최대 하나만 둘 수 있습니다.', diagram, region);
      if (countKind('deephistory') > 1) issue('error', 'STM016', '한 Region에는 Deep History를 최대 하나만 둘 수 있습니다.', diagram, region);
    });

    diagram.elements.forEach(view => {
      const incoming = transitions.filter(r => r.to === view.id);
      const outgoing = transitions.filter(r => r.from === view.id);
      const kind = kindOf(view);
      if (kind === 'compositestate' && !regions.some(region => region.parentId === view.id)) {
        issue('error', 'STM012', 'Composite State에는 하나 이상의 Region이 필요합니다.', diagram, view);
      }
      if (kind === 'submachinestate') {
        const referenced = diagrams.find(candidate => candidate.id === modelOf(view).submachineDiagramId);
        if (!referenced || referenced.type !== 'state') {
          issue('error', 'STM018', 'Submachine State는 유효한 State Machine을 참조해야 합니다.', diagram, view);
        }
      }
      if (kind === 'connectionpointref') {
        const owner = elementById.get(view.parentId);
        if (!owner || kindOf(owner) !== 'submachinestate') {
          issue('error', 'STM017', 'Connection Point Reference는 Submachine State에 포함되어야 합니다.', diagram, view);
        } else {
          const referenceKind = modelOf(view).referenceKind || 'entry';
          if (referenceKind !== 'entry' && referenceKind !== 'exit') {
            issue('error', 'STM024', 'Connection Point Reference 종류는 entry 또는 exit여야 합니다.', diagram, view);
          }
          const referenced = diagrams.find(candidate => candidate.id === modelOf(owner).submachineDiagramId && candidate.type === 'state');
          if (referenced && !referenced.elements.some(candidate => kindOf(candidate) === `${referenceKind}point`)) {
            issue('warning', referenceKind === 'entry' ? 'STM022' : 'STM023',
              `참조한 State Machine에 ${referenceKind === 'entry' ? 'Entry' : 'Exit'} Point가 없습니다.`, diagram, view);
          }
          if (referenceKind === 'entry' && outgoing.length) {
            issue('error', 'STM020', 'Entry Connection Point Reference에는 나가는 Transition을 연결할 수 없습니다.', diagram, view);
          }
          if (referenceKind === 'exit' && incoming.length) {
            issue('error', 'STM021', 'Exit Connection Point Reference에는 들어오는 Transition을 연결할 수 없습니다.', diagram, view);
          }
        }
      }
      if (STATE_VERTEX_KINDS.has(kind) && kind !== 'connectionpointref' && view.parentId) {
        const parent = elementById.get(view.parentId);
        if (!parent || kindOf(parent) !== 'region') {
          issue('error', 'STM013', '중첩된 State 또는 Pseudostate는 Region에 포함되어야 합니다.', diagram, view);
        }
      }
      if (kind === 'stateinitial') {
        if (incoming.length) issue('error', 'STM001', 'Initial Pseudostate에는 들어오는 Transition이 없어야 합니다.', diagram, view);
        if (outgoing.length > 1) issue('error', 'STM002', 'Initial Pseudostate에는 나가는 Transition이 최대 하나만 허용됩니다.', diagram, view);
        if (outgoing.some(r => String(modelOf(r).trigger || '').trim() || String(modelOf(r).guard || '').trim())) {
          issue('error', 'STM003', 'Initial Pseudostate의 나가는 Transition에는 Trigger 또는 Guard를 사용할 수 없습니다.', diagram, view);
        }
      }
      if (kind === 'statefinal' && outgoing.length) {
        issue('error', 'STM004', 'Final State에는 나가는 Transition이 없어야 합니다.', diagram, view);
      }
      if (kind === 'entrypoint' && incoming.length) {
        issue('error', 'STM025', 'Entry Point에는 들어오는 Transition이 없어야 합니다.', diagram, view);
      }
      if (kind === 'exitpoint' && outgoing.length) {
        issue('error', 'STM026', 'Exit Point에는 나가는 Transition이 없어야 합니다.', diagram, view);
      }
      if (kind === 'terminate' && outgoing.length) {
        issue('error', 'STM019', 'Terminate Pseudostate에는 나가는 Transition이 없어야 합니다.', diagram, view);
      }
      if ((kind === 'choice' || kind === 'junction') && (!incoming.length || !outgoing.length)) {
        issue('error', 'STM005', `${kind === 'choice' ? 'Choice' : 'Junction'} Pseudostate에는 들어오는 전이와 나가는 전이가 모두 필요합니다.`, diagram, view);
      }
      if (kind === 'choice' && outgoing.length > 1) {
        const unguarded = outgoing.filter(r => !String(modelOf(r).guard || '').trim());
        if (unguarded.length > 1) issue('warning', 'STM006', 'Choice의 여러 출력 중 Guard가 없는 전이는 최대 하나(else 경로)만 권장됩니다.', diagram, view);
      }
      if (kind === 'statefork') {
        if (outgoing.length > 1 && incoming.length !== 1) {
          issue('error', 'STM008', 'Fork Pseudostate는 정확히 하나의 입력 Transition을 가져야 합니다.', diagram, view);
        } else if (incoming.length > 1 && outgoing.length !== 1) {
          issue('error', 'STM009', 'Join Pseudostate는 정확히 하나의 출력 Transition을 가져야 합니다.', diagram, view);
        } else if (incoming.length <= 1 && outgoing.length <= 1) {
          issue('warning', 'STM010', 'Fork/Join Pseudostate에는 분기 또는 병합 Transition이 더 필요합니다.', diagram, view);
        }
      }
    });
  }

  const INSTANCE_KINDS = new Set(['object', 'artifactinstance', 'componentinstance', 'nodeinstance']);
  const INSTANCE_TYPES = {
    object: new Set([
      'class', 'interface', 'enumeration', 'component', 'artifact', 'node',
      'block', 'valuetype', 'interfaceblock', 'constraintblock',
    ]),
    artifactinstance: new Set(['artifact']),
    componentinstance: new Set(['component']),
    nodeinstance: new Set(['node']),
  };

  function validateObjectDiagram(diagram, kindOf, modelOf, issue, models) {
    if (diagram.type !== 'object') return;
    const elementById = new Map(diagram.elements.map(element => [element.id, element]));
    diagram.elements.forEach(view => {
      const kind = kindOf(view);
      if (!INSTANCE_KINDS.has(kind)) return;
      const model = modelOf(view);
      const classifierId = model.classifierModelId;
      if (!classifierId) {
        issue('warning', 'OBJ001', 'Instance에 Classifier 타입이 지정되지 않았습니다.', diagram, view);
      } else {
        const classifier = models[classifierId];
        if (!classifier) {
          issue('error', 'OBJ002', 'Instance가 참조하는 Classifier 모델을 찾을 수 없습니다.', diagram, view);
        } else if (!INSTANCE_TYPES[kind].has(classifier.kind)) {
          const codes = { artifactinstance: 'UML013', componentinstance: 'UML014', nodeinstance: 'UML015' };
          issue('error', codes[kind] || 'OBJ003',
            `${kind === 'object' ? 'Object' : 'Instance'} 타입으로 ${classifier.kind}을(를) 사용할 수 없습니다.`, diagram, view);
        }
      }
      if (kind === 'object') {
        const names = new Set();
        (model.slots || []).forEach((raw, index) => {
          const core = String(raw).replace(/^\s*«[^»]+»\s*/, '').replace(/^\s*[+\-#~]\s*/, '');
          const name = core.split(/[:=]/)[0].trim().toLowerCase();
          if (!name) issue('error', 'OBJ004', `Slot ${index + 1}의 이름이 필요합니다.`, diagram, view);
          else if (names.has(name)) issue('error', 'OBJ005', `중복된 Slot 이름이 있습니다: ${name}`, diagram, view);
          else names.add(name);
        });
      }
    });
    diagram.relations.forEach(relation => {
      const kind = modelOf(relation).kind;
      if (kind !== 'link' && kind !== 'directedlink') return;
      const from = elementById.get(relation.from), to = elementById.get(relation.to);
      if (!from || !to || !INSTANCE_KINDS.has(kindOf(from)) || !INSTANCE_KINDS.has(kindOf(to))) {
        issue('error', 'OBJ006', 'Link는 Object 또는 Instance 사이에만 연결할 수 있습니다.', diagram, relation);
      }
    });
  }

  function validateCommunicationDiagram(diagram, kindOf, modelOf, issue) {
    if (diagram.type !== 'communication') return;
    const elements = new Map(diagram.elements.map(element => [element.id, element]));
    const connectors = new Map(diagram.relations
      .filter(relation => kindOf(relation) === 'commconnector')
      .map(relation => [relation.id, relation]));
    const sequenceNumbers = new Map();

    connectors.forEach(connector => {
      const from = elements.get(connector.from), to = elements.get(connector.to);
      if (!from || !to || kindOf(from) !== 'lifeline' || kindOf(to) !== 'lifeline') {
        issue('error', 'COM001', 'Communication Connector는 Lifeline 사이에만 연결할 수 있습니다.', diagram, connector);
      }
    });

    diagram.relations.filter(relation => ['comm-forward', 'comm-reverse'].includes(kindOf(relation))).forEach(message => {
      const model = modelOf(message);
      const connector = connectors.get(message.connectorId);
      if (!String(model.name || '').trim()) {
        issue('error', 'UML001', 'Communication Message에 이름이 필요합니다.', diagram, message);
      }
      if (!connector) {
        issue('error', 'COM002', 'Communication Message가 참조하는 Connector를 찾을 수 없습니다.', diagram, message);
      } else {
        const reverse = kindOf(message) === 'comm-reverse';
        const expectedFrom = reverse ? connector.to : connector.from;
        const expectedTo = reverse ? connector.from : connector.to;
        if (message.from !== expectedFrom || message.to !== expectedTo) {
          issue('error', 'COM003', 'Message 방향이 소유 Connector의 Forward/Reverse 방향과 일치하지 않습니다.', diagram, message);
        }
      }
      const sequenceNo = String(model.seqNo || '').trim();
      if (sequenceNo) {
        if (sequenceNumbers.has(sequenceNo)) {
          issue('error', 'COM004', `중복된 Message sequenceNumber가 있습니다: ${sequenceNo}`, diagram, message);
        } else sequenceNumbers.set(sequenceNo, message);
      }
      const validSorts = new Set(['synchCall', 'asynchCall', 'asynchSignal', 'reply', 'createMessage', 'deleteMessage']);
      if (!validSorts.has(model.messageSort || 'synchCall')) {
        issue('error', 'COM005', `지원하지 않는 Message Sort입니다: ${model.messageSort}`, diagram, message);
      }
    });
  }

  function validateCompositeStructureDiagram(diagram, kindOf, modelOf, issue, models) {
    if (diagram.type !== 'composite') return;
    const elements = new Map(diagram.elements.map(element => [element.id, element]));
    const rootOf = view => {
      let current = view;
      const visited = new Set();
      while (current && current.parentId && !visited.has(current.id)) {
        visited.add(current.id);
        current = elements.get(current.parentId) || current;
        if (visited.has(current.id)) break;
      }
      return current;
    };
    const typeKinds = new Set(['class', 'interface', 'enumeration', 'component', 'artifact', 'node']);
    const validTypedReference = (view, field) => {
      const referenceId = modelOf(view)[field];
      if (!referenceId) return null;
      return models[referenceId] || false;
    };

    diagram.elements.forEach(view => {
      const kind = kindOf(view);
      const model = modelOf(view);
      const owner = elements.get(view.parentId);
      if (kind === 'part') {
        if (!owner || !['class', 'collaboration'].includes(kindOf(owner))) {
          issue('error', 'CS001', 'Part는 Class 또는 Collaboration에 포함되어야 합니다.', diagram, view);
        }
      }
      if (kind === 'port') {
        if (!owner || !['class', 'collaboration', 'part'].includes(kindOf(owner))) {
          issue('error', 'CS002', 'Port는 Class, Collaboration 또는 Part에 포함되어야 합니다.', diagram, view);
        }
        const anchor = view.borderAnchor;
        const onBorder = anchor && Number.isFinite(anchor.fx) && Number.isFinite(anchor.fy)
          && anchor.fx >= 0 && anchor.fx <= 1 && anchor.fy >= 0 && anchor.fy <= 1
          && (anchor.fx === 0 || anchor.fx === 1 || anchor.fy === 0 || anchor.fy === 1);
        if (!onBorder) issue('error', 'CS003', 'Port는 소유 요소의 테두리에 고정되어야 합니다.', diagram, view);
      }
      if (kind === 'collaborationuse') {
        if (!owner || !['class', 'collaboration'].includes(kindOf(owner))) {
          issue('error', 'CS004', 'Collaboration Use는 Class 또는 Collaboration에 포함되어야 합니다.', diagram, view);
        }
        const collaboration = model.collaborationModelId && models[model.collaborationModelId];
        if (!collaboration || collaboration.kind !== 'collaboration') {
          issue('error', 'CS005', 'Collaboration Use는 유효한 Collaboration을 참조해야 합니다.', diagram, view);
        }
      }
      if (kind === 'part' || kind === 'port') {
        const classifier = validTypedReference(view, 'classifierModelId');
        if (classifier === null) {
          issue('warning', 'CS006', `${kind === 'part' ? 'Part' : 'Port'}에 Type이 지정되지 않았습니다.`, diagram, view);
        } else if (classifier === false || !typeKinds.has(classifier.kind)) {
          issue('error', 'CS007', `${kind === 'part' ? 'Part' : 'Port'}가 참조하는 Type이 유효하지 않습니다.`, diagram, view);
        }
      }
      if (kind === 'port') {
        ['providedInterfaceModelId', 'requiredInterfaceModelId'].forEach(field => {
          const reference = validTypedReference(view, field);
          if (reference === false || (reference && reference.kind !== 'interface')) {
            issue('error', 'CS008', `${field === 'providedInterfaceModelId' ? 'Provided' : 'Required'} Interface 참조가 유효하지 않습니다.`, diagram, view);
          }
        });
      }
    });

    diagram.relations.forEach(relation => {
      const kind = kindOf(relation);
      const from = elements.get(relation.from), to = elements.get(relation.to);
      if (kind === 'csconnector') {
        if (!from || !to || !['part', 'port'].includes(kindOf(from)) || !['part', 'port'].includes(kindOf(to))) {
          issue('error', 'CS009', 'Connector는 Part 또는 Port 사이에만 연결할 수 있습니다.', diagram, relation);
        } else if (rootOf(from).id !== rootOf(to).id) {
          issue('error', 'CS010', 'Connector의 양 끝은 같은 구조 소유자 안에 있어야 합니다.', diagram, relation);
        }
      }
      if (kind === 'rolebinding') {
        if (!from || !to || kindOf(from) !== 'collaborationuse' || kindOf(to) !== 'part') {
          issue('error', 'CS011', 'Role Binding은 Collaboration Use에서 Part 방향으로 연결되어야 합니다.', diagram, relation);
        } else if (rootOf(from).id !== rootOf(to).id) {
          issue('error', 'CS012', 'Role Binding의 Collaboration Use와 Part는 같은 구조 소유자 안에 있어야 합니다.', diagram, relation);
        }
      }
    });
  }

  function validateTimingDiagram(diagram, kindOf, modelOf, issue, models) {
    if (diagram.type !== 'timing') return;
    const elements = new Map(diagram.elements.map(element => [element.id, element]));
    const relations = new Map(diagram.relations.map(relation => [relation.id, relation]));
    diagram.elements.forEach(view => {
      const kind = kindOf(view);
      const model = modelOf(view);
      if (kind === 'lifeline') {
        const classifier = model.classifierModelId && models[model.classifierModelId];
        if (!model.classifierModelId) {
          issue('warning', 'TIM001', 'Timing Lifeline에 Classifier가 지정되지 않았습니다.', diagram, view);
        } else if (!classifier || !['class', 'interface', 'enumeration', 'component', 'artifact', 'node'].includes(classifier.kind)) {
          issue('error', 'TIM002', 'Timing Lifeline이 참조하는 Classifier가 유효하지 않습니다.', diagram, view);
        }
      }
      if (kind === 'timingstate') {
        const owner = elements.get(view.parentId);
        if (!owner || kindOf(owner) !== 'lifeline') {
          issue('error', 'TIM003', 'State / Condition은 Timing Lifeline에 포함되어야 합니다.', diagram, view);
        }
      }
      if (kind === 'timesegment') {
        const owner = elements.get(view.parentId);
        if (!owner || kindOf(owner) !== 'timingstate') {
          issue('error', 'TIM004', 'Time Segment는 State / Condition에 포함되어야 합니다.', diagram, view);
        }
        const start = String(model.startTime == null ? '' : model.startTime).trim();
        const end = String(model.endTime == null ? '' : model.endTime).trim();
        if (start && end) {
          const startValue = Number.parseFloat(start), endValue = Number.parseFloat(end);
          if (!Number.isFinite(startValue) || !Number.isFinite(endValue) || startValue >= endValue) {
            issue('error', 'TIM005', 'Time Segment의 시작 시간은 종료 시간보다 작아야 합니다.', diagram, view);
          }
        }
      }
      if (kind === 'timetick' && !String(model.timeValue || '').trim()) {
        issue('error', 'TIM006', 'Time Tick에는 표시할 시간 값이 필요합니다.', diagram, view);
      }
      if (kind === 'timeconstraint') {
        const targetElement = elements.get(view.constrainedViewId);
        const targetRelation = relations.get(view.constrainedViewId);
        if ((!targetElement || kindOf(targetElement) !== 'timesegment')
          && (!targetRelation || kindOf(targetRelation) !== 'timingmessage')) {
          issue('error', 'TIM007', 'Time Constraint는 Time Segment 또는 Timing Message에 부착되어야 합니다.', diagram, view);
        }
        if (!String(model.constraint || '').trim()) {
          issue('error', 'TIM008', 'Time Constraint 표현식이 필요합니다.', diagram, view);
        }
      }
      if (kind === 'durationconstraint') {
        if (!String(model.constraint || '').trim()) {
          issue('error', 'TIM009', 'Duration Constraint 표현식이 필요합니다.', diagram, view);
        }
        if (!Number.isFinite(view.w) || view.w <= 0) {
          issue('error', 'TIM010', 'Duration Constraint의 기간 폭은 0보다 커야 합니다.', diagram, view);
        }
      }
    });
    diagram.relations.forEach(relation => {
      if (kindOf(relation) !== 'timingmessage') return;
      const from = elements.get(relation.from), to = elements.get(relation.to);
      if (!from || !to || kindOf(from) !== 'timesegment' || kindOf(to) !== 'timesegment') {
        issue('error', 'TIM011', 'Timing Message는 Time Segment 사이에만 연결할 수 있습니다.', diagram, relation);
      }
      if (!String(modelOf(relation).name || '').trim()) {
        issue('error', 'TIM012', 'Timing Message에 이름이 필요합니다.', diagram, relation);
      }
      const validSorts = new Set(['synchCall', 'asynchCall', 'asynchSignal', 'reply', 'createMessage', 'deleteMessage']);
      if (!validSorts.has(modelOf(relation).messageSort || 'synchCall')) {
        issue('error', 'TIM013', `지원하지 않는 Timing Message Sort입니다: ${modelOf(relation).messageSort}`, diagram, relation);
      }
    });
  }

  function validateInformationFlowDiagram(diagram, kindOf, modelOf, issue, models) {
    if (diagram.type !== 'informationflow') return;
    const endpoints = new Set([
      'actor', 'usecase', 'node', 'artifact', 'class', 'component', 'interface',
      'package', 'model', 'subsystem', 'action', 'sendsignal', 'acceptsignal',
      'timeevent', 'objectnode', 'activityparameter', 'object',
      'artifactinstance', 'componentinstance', 'nodeinstance',
    ]);
    const conveyedKinds = new Set(['informationitem', 'class', 'interface', 'component']);
    const allowedElements = new Set([...endpoints, 'informationitem', 'note']);
    const allowedRelations = new Set(['informationflow', 'notelink']);
    const elements = new Map(diagram.elements.map(element => [element.id, element]));

    diagram.elements.forEach(element => {
      const kind = kindOf(element);
      const model = modelOf(element);
      if (!allowedElements.has(kind)) {
        issue('error', 'INF001', `Information Flow Diagram에서 지원하지 않는 요소입니다: ${kind}`, diagram, element);
      }
      if (kind !== 'informationitem') return;
      if (!['public', 'protected', 'private', 'package'].includes(model.visibility || 'public')) {
        issue('error', 'INF008', `Information Item의 visibility가 올바르지 않습니다: ${model.visibility}`, diagram, element);
      }
      for (const field of ['attributes', 'operations', 'receptions']) {
        if (model[field] !== undefined && !Array.isArray(model[field])) {
          issue('error', 'INF009', `Information Item의 ${field} 목록이 올바르지 않습니다.`, diagram, element);
        }
      }
    });

    const seen = new Set();
    diagram.relations.forEach(relation => {
      const kind = kindOf(relation);
      if (!allowedRelations.has(kind)) {
        issue('error', 'INF007', `Information Flow Diagram에서 지원하지 않는 관계입니다: ${kind}`, diagram, relation);
        return;
      }
      if (kind !== 'informationflow') return;
      const from = elements.get(relation.from);
      const to = elements.get(relation.to);
      if (!from || !to || !endpoints.has(kindOf(from)) || !endpoints.has(kindOf(to))) {
        issue('error', 'INF002', 'Information Flow는 정보 송수신이 가능한 주체 사이에 연결되어야 합니다.', diagram, relation);
      }
      if (relation.from === relation.to) {
        issue('error', 'INF005', 'Information Flow는 같은 요소로 되돌아갈 수 없습니다.', diagram, relation);
      }
      const conveyedIds = modelOf(relation).conveyedModelIds;
      if (!Array.isArray(conveyedIds) || !conveyedIds.length) {
        issue('warning', 'INF003', 'Information Flow에 Conveyed Information이 지정되지 않았습니다.', diagram, relation);
        return;
      }
      const invalid = conveyedIds.find(id =>
        typeof id !== 'string' || !models[id] || !conveyedKinds.has(models[id].kind));
      if (invalid) {
        issue('error', 'INF004', 'Information Flow가 참조하는 Conveyed Information이 올바르지 않습니다.', diagram, relation);
      }
      const key = `${relation.from}->${relation.to}:${[...conveyedIds].sort().join(',')}`;
      if (seen.has(key)) {
        issue('warning', 'INF006', '같은 방향과 전달 항목을 가진 Information Flow가 중복됩니다.', diagram, relation);
      } else {
        seen.add(key);
      }
    });
  }

  function validateBlockDefinitionDiagram(diagram, kindOf, modelOf, issue, models) {
    if (diagram.type !== 'bdd') return;
    const classifierKinds = new Set(['block', 'valuetype', 'interfaceblock', 'constraintblock']);
    const elementKinds = new Set([...classifierKinds, 'port', 'object', 'note']);
    const relationKinds = new Set([
      'association', 'directed', 'generalization', 'dependency',
      'aggregation', 'composition', 'connector', 'notelink',
    ]);
    const listFields = new Set([
      'parts', 'references', 'values', 'flowProperties', 'constraintProperties',
      'properties', 'constraints', 'constraintParameters', 'operations', 'receptions',
    ]);
    const elements = new Map(diagram.elements.map(element => [element.id, element]));
    const validBorderAnchor = view => {
      const anchor = view.borderAnchor;
      return anchor && Number.isFinite(anchor.fx) && Number.isFinite(anchor.fy)
        && anchor.fx >= 0 && anchor.fx <= 1 && anchor.fy >= 0 && anchor.fy <= 1
        && (anchor.fx === 0 || anchor.fx === 1 || anchor.fy === 0 || anchor.fy === 1);
    };
    const propertyName = raw => String(raw || '')
      .replace(/^\s*«[^»]+»\s*/, '')
      .replace(/^\s*(?:inout|in|out)\s+/i, '')
      .replace(/^\s*[+\-#~]\s*/, '')
      .split(/[:=]/)[0].trim().toLowerCase();

    diagram.elements.forEach(element => {
      const kind = kindOf(element);
      const model = modelOf(element);
      if (!elementKinds.has(kind)) {
        issue('error', 'BDD001', `Block Definition Diagram에서 지원하지 않는 요소입니다: ${kind}`, diagram, element);
        return;
      }
      if (classifierKinds.has(kind)) {
        if (!['public', 'protected', 'private', 'package'].includes(model.visibility || 'public')) {
          issue('error', 'BDD002', `Block Classifier의 visibility가 올바르지 않습니다: ${model.visibility}`, diagram, element);
        }
        listFields.forEach(field => {
          if (model[field] !== undefined && !Array.isArray(model[field])) {
            issue('error', 'BDD003', `${field} 목록이 올바르지 않습니다.`, diagram, element);
          }
        });
        if (kind === 'valuetype' && !String(model.valueTypeUnit || '').trim()) {
          issue('warning', 'BDD004', 'Value Type에 Unit이 지정되지 않았습니다.', diagram, element);
        }
        if (kind === 'valuetype' && !String(model.quantityKind || '').trim()) {
          issue('warning', 'BDD005', 'Value Type에 Quantity Kind가 지정되지 않았습니다.', diagram, element);
        }
        const names = new Map();
        [
          'parts', 'references', 'values', 'flowProperties',
          'constraintProperties', 'properties', 'constraintParameters',
        ].forEach(field => {
          (Array.isArray(model[field]) ? model[field] : []).forEach(raw => {
            const name = propertyName(raw);
            if (!name) {
              issue('error', 'BDD006', `${field} 항목에 이름이 필요합니다.`, diagram, element);
            } else if (names.has(name)) {
              issue('error', 'BDD007', `Block Property 이름이 중복됩니다: ${name}`, diagram, element);
            } else {
              names.set(name, field);
            }
          });
        });
      }
      if (kind === 'port') {
        const owner = elements.get(element.parentId);
        if (!owner || !new Set(['block', 'interfaceblock', 'constraintblock']).has(kindOf(owner))) {
          issue('error', 'BDD008', 'Port는 Block, Interface Block 또는 Constraint Block에 포함되어야 합니다.', diagram, element);
        }
        if (!validBorderAnchor(element)) {
          issue('error', 'BDD009', 'Port는 소유 Block의 테두리에 고정되어야 합니다.', diagram, element);
        }
        const classifierId = model.classifierModelId;
        if (!classifierId) {
          issue('warning', 'BDD010', 'Port에 Type이 지정되지 않았습니다.', diagram, element);
        } else if (!models[classifierId] || !classifierKinds.has(models[classifierId].kind)) {
          issue('error', 'BDD011', 'Port가 참조하는 Block Classifier Type이 올바르지 않습니다.', diagram, element);
        }
        ['providedInterfaceModelId', 'requiredInterfaceModelId'].forEach(field => {
          const interfaceId = model[field];
          if (interfaceId && (!models[interfaceId] || !['interface', 'interfaceblock'].includes(models[interfaceId].kind))) {
            issue('error', 'BDD012', 'Port가 참조하는 Provided/Required Interface가 올바르지 않습니다.', diagram, element);
          }
        });
      }
      if (kind === 'object') {
        const classifierId = model.classifierModelId;
        if (!classifierId) {
          issue('warning', 'BDD013', 'BDD Object에 Block Classifier가 지정되지 않았습니다.', diagram, element);
        } else if (!models[classifierId] || !classifierKinds.has(models[classifierId].kind)) {
          issue('error', 'BDD014', 'BDD Object가 참조하는 Block Classifier가 올바르지 않습니다.', diagram, element);
        }
      }
    });

    const seen = new Set();
    const generalizations = [];
    const compositions = [];
    diagram.relations.forEach(relation => {
      const kind = kindOf(relation);
      if (!relationKinds.has(kind)) {
        issue('error', 'BDD015', `Block Definition Diagram에서 지원하지 않는 관계입니다: ${kind}`, diagram, relation);
        return;
      }
      const from = elements.get(relation.from), to = elements.get(relation.to);
      if (!from || !to) return;
      if (kind === 'notelink') {
        if (kindOf(from) !== 'note' && kindOf(to) !== 'note') {
          issue('error', 'BDD016', 'Note Link의 한쪽 끝은 Note여야 합니다.', diagram, relation);
        }
        return;
      }
      if (relation.from === relation.to) {
        issue('error', 'BDD017', 'BDD 관계는 같은 요소로 되돌아갈 수 없습니다.', diagram, relation);
      }
      if (kind === 'connector') {
        if (kindOf(from) !== 'port' || kindOf(to) !== 'port') {
          issue('error', 'BDD018', 'BDD Connector는 Port 사이에 연결해야 합니다.', diagram, relation);
        }
      } else if (kind === 'generalization') {
        if (!classifierKinds.has(kindOf(from)) || kindOf(from) !== kindOf(to)) {
          issue('error', 'BDD019', 'BDD Generalization은 같은 종류의 Block Classifier 사이에 연결해야 합니다.', diagram, relation);
        } else {
          generalizations.push(relation);
        }
      } else if (kind === 'composition' || kind === 'aggregation') {
        if (!classifierKinds.has(kindOf(from)) || !classifierKinds.has(kindOf(to))) {
          issue('error', 'BDD020', `${kind}은 Block Classifier 사이에 연결해야 합니다.`, diagram, relation);
        }
        if (kind === 'composition') compositions.push(relation);
      } else {
        const structural = view => classifierKinds.has(kindOf(view)) || kindOf(view) === 'object';
        if (!structural(from) || !structural(to)) {
          issue('error', 'BDD021', `${kind}의 연결 대상이 올바르지 않습니다.`, diagram, relation);
        }
      }
      const key = `${kind}:${from.modelId || from.id}->${to.modelId || to.id}`;
      if (seen.has(key)) {
        issue('warning', 'BDD022', `같은 BDD 관계가 중복됩니다: ${kind}`, diagram, relation);
      } else {
        seen.add(key);
      }
    });

    const validateCycle = (relations, code, message) => {
      const graph = new Map();
      relations.forEach(relation => {
        if (!graph.has(relation.from)) graph.set(relation.from, []);
        graph.get(relation.from).push({ to: relation.to, relation });
      });
      const visiting = new Set(), visited = new Set(), reported = new Set();
      const walk = id => {
        if (visiting.has(id)) return true;
        if (visited.has(id)) return false;
        visiting.add(id);
        for (const edge of graph.get(id) || []) {
          if (walk(edge.to) && !reported.has(edge.relation.id)) {
            reported.add(edge.relation.id);
            issue('error', code, message, diagram, edge.relation);
          }
        }
        visiting.delete(id); visited.add(id);
        return false;
      };
      [...graph.keys()].forEach(walk);
    };
    validateCycle(generalizations, 'BDD023', 'BDD Generalization이 순환합니다.');
    validateCycle(compositions, 'BDD024', 'Block Composition 계층이 순환합니다.');
  }

  function validateInternalBlockDiagram(diagram, kindOf, modelOf, issue, models) {
    if (diagram.type !== 'ibd') return;
    const allowedElements = new Set(['ibdframe', 'part', 'reference', 'value', 'port', 'note']);
    const containerKinds = new Set(['ibdframe', 'part', 'reference']);
    const typedKinds = new Set(['part', 'reference', 'value']);
    const connectableKinds = new Set(['part', 'reference', 'port']);
    const structuralTypes = new Set(['block', 'valuetype', 'interfaceblock']);
    const itemFlowKinds = new Set(['informationitem', 'block', 'valuetype', 'interfaceblock']);
    const elements = new Map(diagram.elements.map(element => [element.id, element]));
    const frames = diagram.elements.filter(element => kindOf(element) === 'ibdframe');
    const validBorderAnchor = view => {
      const anchor = view.borderAnchor;
      return anchor && Number.isFinite(anchor.fx) && Number.isFinite(anchor.fy)
        && anchor.fx >= 0 && anchor.fx <= 1 && anchor.fy >= 0 && anchor.fy <= 1
        && (anchor.fx === 0 || anchor.fx === 1 || anchor.fy === 0 || anchor.fy === 1);
    };

    if (frames.length !== 1) {
      issue('error', 'IBD001', 'Internal Block Diagram에는 정확히 하나의 IBD Frame이 필요합니다.', diagram, frames[0] || null);
    }
    diagram.elements.forEach(element => {
      const kind = kindOf(element);
      const model = modelOf(element);
      if (!allowedElements.has(kind)) {
        issue('error', 'IBD002', `Internal Block Diagram에서 지원하지 않는 요소입니다: ${kind}`, diagram, element);
        return;
      }
      if (kind === 'ibdframe') {
        if (!model.classifierModelId) {
          issue('error', 'IBD003', 'IBD Frame에 내부 구조를 정의할 Block을 지정해야 합니다.', diagram, element);
        } else if (!models[model.classifierModelId] || models[model.classifierModelId].kind !== 'block') {
          issue('error', 'IBD004', 'IBD Frame은 BDD의 Block을 참조해야 합니다.', diagram, element);
        }
        if (element.parentId) issue('error', 'IBD005', 'IBD Frame은 다른 요소에 포함될 수 없습니다.', diagram, element);
        return;
      }
      if (kind === 'note') return;
      const owner = elements.get(element.parentId);
      if (!owner || !containerKinds.has(kindOf(owner))) {
        issue('error', 'IBD006', `${kind}은 IBD Frame, Part 또는 Reference에 포함되어야 합니다.`, diagram, element);
      }
      if (typedKinds.has(kind)) {
        const classifier = model.classifierModelId && models[model.classifierModelId];
        if (!classifier) {
          issue('warning', 'IBD007', `${kind}에 Type이 지정되지 않았습니다.`, diagram, element);
        } else if (kind === 'value' ? classifier.kind !== 'valuetype' : !structuralTypes.has(classifier.kind)) {
          issue('error', 'IBD008', `${kind}이 참조하는 Type이 올바르지 않습니다.`, diagram, element);
        }
      }
      if (kind === 'port') {
        if (!validBorderAnchor(element)) {
          issue('error', 'IBD009', 'Port는 소유 요소의 테두리에 고정되어야 합니다.', diagram, element);
        }
        const classifier = model.classifierModelId && models[model.classifierModelId];
        if (!classifier) {
          issue('warning', 'IBD010', 'Port에 Type이 지정되지 않았습니다.', diagram, element);
        } else if (!structuralTypes.has(classifier.kind)) {
          issue('error', 'IBD011', 'Port가 참조하는 Type이 올바르지 않습니다.', diagram, element);
        }
        ['providedInterfaceModelId', 'requiredInterfaceModelId'].forEach(field => {
          const interfaceId = model[field];
          if (interfaceId && (!models[interfaceId] || !['interface', 'interfaceblock'].includes(models[interfaceId].kind))) {
            issue('error', 'IBD012', 'Port가 참조하는 Provided/Required Interface가 올바르지 않습니다.', diagram, element);
          }
        });
      }
    });

    const seen = new Set();
    diagram.relations.forEach(relation => {
      const kind = kindOf(relation);
      const from = elements.get(relation.from), to = elements.get(relation.to);
      if (!['connector', 'notelink'].includes(kind)) {
        issue('error', 'IBD013', `Internal Block Diagram에서 지원하지 않는 관계입니다: ${kind}`, diagram, relation);
        return;
      }
      if (!from || !to) return;
      if (kind === 'notelink') {
        if (kindOf(from) !== 'note' && kindOf(to) !== 'note') {
          issue('error', 'IBD014', 'Note Link의 한쪽 끝은 Note여야 합니다.', diagram, relation);
        }
        return;
      }
      if (!connectableKinds.has(kindOf(from)) || !connectableKinds.has(kindOf(to))) {
        issue('error', 'IBD015', 'IBD Connector는 Part, Reference 또는 Port 사이에 연결해야 합니다.', diagram, relation);
      }
      if (relation.from === relation.to) {
        issue('error', 'IBD016', 'IBD Connector는 같은 요소로 되돌아갈 수 없습니다.', diagram, relation);
      }
      const itemFlowIds = modelOf(relation).itemFlowModelIds;
      if (itemFlowIds !== undefined && (!Array.isArray(itemFlowIds)
        || itemFlowIds.some(id => typeof id !== 'string' || !models[id] || !itemFlowKinds.has(models[id].kind)))) {
        issue('error', 'IBD017', 'Connector의 Item Flow 참조가 올바르지 않습니다.', diagram, relation);
      }
      if (Array.isArray(itemFlowIds) && itemFlowIds.length) {
        const endpointTyped = view => !!modelOf(view).classifierModelId;
        if (!endpointTyped(from) || !endpointTyped(to)) {
          issue('warning', 'IBD018', 'Item Flow가 있는 Connector의 양 끝에는 Type을 지정하는 것이 좋습니다.', diagram, relation);
        }
      }
      const key = [relation.from, relation.to].sort().join('::');
      if (seen.has(key)) {
        issue('warning', 'IBD019', '같은 IBD 요소 사이의 Connector가 중복됩니다.', diagram, relation);
      } else {
        seen.add(key);
      }
    });
  }

  function validateParametricDiagram(diagram, kindOf, modelOf, issue, models) {
    if (diagram.type !== 'parametric') return;
    const allowedElements = new Set([
      'parametricframe', 'constraintproperty', 'constraintparameter', 'value', 'note',
    ]);
    const typeKinds = new Set(['block', 'valuetype']);
    const connectableKinds = new Set(['constraintparameter', 'value']);
    const elements = new Map(diagram.elements.map(element => [element.id, element]));
    const frames = diagram.elements.filter(element => kindOf(element) === 'parametricframe');
    const validBorderAnchor = view => {
      const anchor = view.borderAnchor;
      return anchor && Number.isFinite(anchor.fx) && Number.isFinite(anchor.fy)
        && anchor.fx >= 0 && anchor.fx <= 1 && anchor.fy >= 0 && anchor.fy <= 1
        && (anchor.fx === 0 || anchor.fx === 1 || anchor.fy === 0 || anchor.fy === 1);
    };
    const parameterName = raw => String(raw || '')
      .replace(/^\s*[+\-#~]\s*/, '')
      .split(/[:=]/)[0].trim().toLowerCase();

    if (frames.length !== 1) {
      issue('error', 'PAR001', 'Parametric Diagram에는 정확히 하나의 Parametric Frame이 필요합니다.', diagram, frames[0] || null);
    }
    diagram.elements.forEach(element => {
      const kind = kindOf(element);
      const model = modelOf(element);
      if (!allowedElements.has(kind)) {
        issue('error', 'PAR002', `Parametric Diagram에서 지원하지 않는 요소입니다: ${kind}`, diagram, element);
        return;
      }
      if (kind === 'parametricframe') {
        const classifier = model.classifierModelId && models[model.classifierModelId];
        if (!classifier) {
          issue('error', 'PAR003', 'Parametric Frame에 소유 Constraint Block을 지정해야 합니다.', diagram, element);
        } else if (classifier.kind !== 'constraintblock') {
          issue('error', 'PAR004', 'Parametric Frame은 BDD의 Constraint Block을 참조해야 합니다.', diagram, element);
        }
        if (element.parentId) issue('error', 'PAR005', 'Parametric Frame은 다른 요소에 포함될 수 없습니다.', diagram, element);
        return;
      }
      if (kind === 'note') return;
      const owner = elements.get(element.parentId);
      if (kind === 'constraintproperty' || kind === 'value') {
        if (!owner || kindOf(owner) !== 'parametricframe') {
          issue('error', 'PAR006', `${kind}은 Parametric Frame에 포함되어야 합니다.`, diagram, element);
        }
      }
      if (kind === 'constraintproperty') {
        const classifier = model.classifierModelId && models[model.classifierModelId];
        if (!classifier) {
          issue('warning', 'PAR007', 'Constraint Property에 Constraint Block Type이 지정되지 않았습니다.', diagram, element);
        } else if (classifier.kind !== 'constraintblock') {
          issue('error', 'PAR008', 'Constraint Property는 Constraint Block을 Type으로 참조해야 합니다.', diagram, element);
        } else {
          const declared = new Set((classifier.constraintParameters || []).map(parameterName).filter(Boolean));
          const attached = diagram.elements
            .filter(child => child.parentId === element.id && kindOf(child) === 'constraintparameter');
          if (!attached.length) {
            issue('warning', 'PAR009', 'Constraint Property에 Constraint Parameter가 없습니다.', diagram, element);
          }
          attached.forEach(parameter => {
            if (declared.size && !declared.has(String(modelOf(parameter).name || '').trim().toLowerCase())) {
              issue('warning', 'PAR010', `Constraint Block에 정의되지 않은 Parameter입니다: ${modelOf(parameter).name}`, diagram, parameter);
            }
          });
        }
      }
      if (kind === 'value') {
        const classifier = model.classifierModelId && models[model.classifierModelId];
        if (!classifier) {
          issue('warning', 'PAR011', 'Value Property에 Type이 지정되지 않았습니다.', diagram, element);
        } else if (!typeKinds.has(classifier.kind)) {
          issue('error', 'PAR012', 'Value Property는 Block 또는 Value Type을 참조해야 합니다.', diagram, element);
        } else if (classifier.kind === 'valuetype') {
          const compatibility = defaultValueUnitCompatibility(model.defaultValue, classifier);
          if (compatibility.code) {
            issue(compatibility.status, compatibility.code, compatibility.message, diagram, element);
          }
        }
      }
      if (kind === 'constraintparameter') {
        if (!owner || !['parametricframe', 'constraintproperty'].includes(kindOf(owner))) {
          issue('error', 'PAR013', 'Constraint Parameter는 Parametric Frame 또는 Constraint Property에 포함되어야 합니다.', diagram, element);
        }
        if (!validBorderAnchor(element)) {
          issue('error', 'PAR014', 'Constraint Parameter는 소유 요소의 테두리에 고정되어야 합니다.', diagram, element);
        }
        const classifier = model.classifierModelId && models[model.classifierModelId];
        if (!classifier) {
          issue('warning', 'PAR015', 'Constraint Parameter에 Type이 지정되지 않았습니다.', diagram, element);
        } else if (!typeKinds.has(classifier.kind)) {
          issue('error', 'PAR016', 'Constraint Parameter는 Block 또는 Value Type을 참조해야 합니다.', diagram, element);
        }
      }
    });

    const seen = new Set();
    const boundIds = new Set();
    diagram.relations.forEach(relation => {
      const kind = kindOf(relation);
      const from = elements.get(relation.from), to = elements.get(relation.to);
      if (!['bindingconnector', 'notelink'].includes(kind)) {
        issue('error', 'PAR017', `Parametric Diagram에서 지원하지 않는 관계입니다: ${kind}`, diagram, relation);
        return;
      }
      if (!from || !to) return;
      if (kind === 'notelink') {
        if (kindOf(from) !== 'note' && kindOf(to) !== 'note') {
          issue('error', 'PAR018', 'Note Link의 한쪽 끝은 Note여야 합니다.', diagram, relation);
        }
        return;
      }
      if (!connectableKinds.has(kindOf(from)) || !connectableKinds.has(kindOf(to))) {
        issue('error', 'PAR019', 'Binding Connector는 Constraint Parameter 또는 Value Property 사이에 연결해야 합니다.', diagram, relation);
      }
      if (relation.from === relation.to) {
        issue('error', 'PAR020', 'Binding Connector는 같은 요소로 되돌아갈 수 없습니다.', diagram, relation);
      }
      boundIds.add(relation.from); boundIds.add(relation.to);
      const fromType = modelOf(from).classifierModelId;
      const toType = modelOf(to).classifierModelId;
      const compatibility = bindingTypeCompatibility(fromType, toType, models);
      if (compatibility.code) {
        issue(compatibility.status, compatibility.code, compatibility.message, diagram, relation);
      }
      const key = [relation.from, relation.to].sort().join('::');
      if (seen.has(key)) {
        issue('warning', 'PAR022', '같은 Parameter/Value 사이의 Binding Connector가 중복됩니다.', diagram, relation);
      } else {
        seen.add(key);
      }
    });
    diagram.elements.filter(element => kindOf(element) === 'constraintparameter').forEach(parameter => {
      if (!boundIds.has(parameter.id)) {
        issue('warning', 'PAR023', 'Constraint Parameter가 Binding Connector에 연결되지 않았습니다.', diagram, parameter);
      }
    });
  }

  function validateRequirementDiagram(
    diagram, kindOf, modelOf, issue,
    requirementIds, validatedRequirementModels,
  ) {
    if (diagram.type !== 'requirement') return;
    const endpointKinds = new Set([
      'requirement', 'actor', 'usecase', 'node', 'artifact', 'class', 'component', 'interface',
      'package', 'model', 'subsystem', 'action', 'sendsignal', 'acceptsignal',
      'timeevent', 'objectnode', 'activityparameter', 'object',
      'artifactinstance', 'componentinstance', 'nodeinstance', 'informationitem',
    ]);
    const requirementTypes = new Set([
      'requirement', 'functionalRequirement', 'interfaceRequirement',
      'performanceRequirement', 'physicalRequirement', 'designConstraint',
    ]);
    const relationKinds = new Set([
      'reqcontainment', 'reqcopy', 'derivereqt', 'verify', 'satisfy', 'refine', 'trace',
    ]);
    const allowedRelations = new Set([...relationKinds, 'notelink']);
    const elements = new Map(diagram.elements.map(element => [element.id, element]));

    diagram.elements.forEach(element => {
      const kind = kindOf(element);
      const model = modelOf(element);
      if (!endpointKinds.has(kind) && kind !== 'note') {
        issue('error', 'REQ008', `Requirement Diagram에서 지원하지 않는 요소입니다: ${kind}`, diagram, element);
      }
      if (kind !== 'requirement' || validatedRequirementModels.has(element.modelId || element.id)) return;
      validatedRequirementModels.add(element.modelId || element.id);
      const requirementId = String(model.requirementId || '').trim();
      if (!requirementId) {
        issue('error', 'REQ001', 'Requirement에 ID가 필요합니다.', diagram, element);
      } else {
        const previous = requirementIds.get(requirementId.toLowerCase());
        if (previous && previous.modelId !== element.modelId) {
          issue('error', 'REQ002', `Requirement ID가 중복됩니다: ${requirementId}`, diagram, element);
        } else {
          requirementIds.set(requirementId.toLowerCase(), element);
        }
      }
      if (!String(model.requirementText || '').trim()) {
        issue('error', 'REQ003', 'Requirement에 요구사항 Text가 필요합니다.', diagram, element);
      }
      if (!requirementTypes.has(model.requirementType || 'requirement')) {
        issue('error', 'REQ004', `Requirement Type이 올바르지 않습니다: ${model.requirementType}`, diagram, element);
      }
      if (!['public', 'protected', 'private', 'package'].includes(model.visibility || 'public')) {
        issue('error', 'REQ005', `Requirement visibility가 올바르지 않습니다: ${model.visibility}`, diagram, element);
      }
      if (!['Low', 'Medium', 'High'].includes(model.risk || 'Medium')) {
        issue('error', 'REQ006', `Requirement risk가 올바르지 않습니다: ${model.risk}`, diagram, element);
      }
      if (!['Analysis', 'Inspection', 'Test', 'Demonstration'].includes(model.verificationMethod || 'Analysis')) {
        issue('error', 'REQ007', `Requirement verification method가 올바르지 않습니다: ${model.verificationMethod}`, diagram, element);
      }
    });

    const seen = new Set();
    diagram.relations.forEach(relation => {
      const kind = kindOf(relation);
      if (!allowedRelations.has(kind)) {
        issue('error', 'REQ009', `Requirement Diagram에서 지원하지 않는 관계입니다: ${kind}`, diagram, relation);
        return;
      }
      if (!relationKinds.has(kind)) return;
      const from = elements.get(relation.from);
      const to = elements.get(relation.to);
      if (!from || !to || !endpointKinds.has(kindOf(from)) || !endpointKinds.has(kindOf(to))) {
        issue('error', 'REQ010', 'Requirement 관계의 연결 대상이 올바르지 않습니다.', diagram, relation);
        return;
      }
      if (relation.from === relation.to) {
        issue('error', 'REQ011', 'Requirement 관계는 같은 요소로 되돌아갈 수 없습니다.', diagram, relation);
      }
      if (['reqcontainment', 'reqcopy', 'derivereqt'].includes(kind)
        && (kindOf(from) !== 'requirement' || kindOf(to) !== 'requirement')) {
        issue('error', 'REQ012', `${kind}는 Requirement 사이에만 연결해야 합니다.`, diagram, relation);
      }
      if (['verify', 'satisfy', 'refine'].includes(kind) && kindOf(to) !== 'requirement') {
        issue('error', 'REQ013', `${kind}는 모델 요소에서 Requirement 방향으로 연결해야 합니다.`, diagram, relation);
      }
      const key = `${kind}:${from.modelId || from.id}->${to.modelId || to.id}`;
      if (seen.has(key)) {
        issue('warning', 'REQ014', `같은 Requirement 관계가 중복됩니다: ${kind}`, diagram, relation);
      } else {
        seen.add(key);
      }
      if (kind === 'reqcopy' && kindOf(from) === 'requirement' && kindOf(to) === 'requirement'
        && String(modelOf(from).requirementText || '').trim()
          !== String(modelOf(to).requirementText || '').trim()) {
        issue('warning', 'REQ015', 'Copy 관계의 두 Requirement Text가 서로 다릅니다.', diagram, relation);
      }
    });

    const validateLocalCycle = (kind, code, message) => {
      const graph = new Map();
      diagram.relations.filter(relation => kindOf(relation) === kind).forEach(relation => {
        if (!graph.has(relation.from)) graph.set(relation.from, []);
        graph.get(relation.from).push({ to: relation.to, relation });
      });
      const visiting = new Set(), visited = new Set(), reported = new Set();
      const walk = node => {
        if (visiting.has(node)) return true;
        if (visited.has(node)) return false;
        visiting.add(node);
        for (const edge of graph.get(node) || []) {
          if (walk(edge.to) && !reported.has(edge.relation.id)) {
            reported.add(edge.relation.id);
            issue('error', code, message, diagram, edge.relation);
          }
        }
        visiting.delete(node);
        visited.add(node);
        return false;
      };
      [...graph.keys()].forEach(walk);
    };
    validateLocalCycle('reqcontainment', 'REQ016', 'Requirement Containment 관계가 순환합니다.');
    validateLocalCycle('derivereqt', 'REQ017', 'Requirement DeriveReqt 관계가 순환합니다.');
  }

  function validateEntity(model, diagram, view, issue) {
    if (!Array.isArray(model.columns)) {
      issue('error', 'ERD003', 'Entity의 컬럼 목록 형식이 올바르지 않습니다.', diagram, view);
      return;
    }
    const columns = model.columns;
    const parsed = columns.map(parseErdColumn);
    if (!parsed.some(column => column.flags.includes('PK'))) {
      issue('warning', 'ERD001', 'Entity에 Primary Key가 없습니다.', diagram, view);
    }
    const seen = new Set();
    parsed.forEach((column, index) => {
      const result = validateErdColumn(column);
      if (!result.valid) {
        issue('error', 'ERD003', `컬럼 ${index + 1} 형식이 올바르지 않습니다: ${result.error}`, diagram, view);
      }
      const physical = String(column.phys || '').trim().toLowerCase();
      if (!physical) return;
      if (seen.has(physical)) issue('error', 'ERD002', `중복된 컬럼 이름이 있습니다: ${physical}`, diagram, view);
      seen.add(physical);
    });
    try {
      validateErdSchema(model, parsed.map(column => column.phys).filter(Boolean));
    } catch (error) {
      issue('error', 'ERD009', `DDL 제약조건 또는 인덱스가 올바르지 않습니다: ${error.message}`, diagram, view);
    }
  }

  function validateErdForeignKey(model, diagram, relation, from, to, modelOf, kindOf, issue) {
    const foreignKeyEnd = String(model.foreignKeyEnd || '');
    const sourceColumnName = String(model.sourceColumnName || '').trim();
    const targetColumnName = String(model.targetColumnName || '').trim();
    let actions;
    try {
      actions = validateReferentialActions(model);
    } catch (error) {
      issue('error', 'ERD010', `FK 참조 동작이 올바르지 않습니다: ${error.message}`, diagram, relation);
      return;
    }
    if (!foreignKeyEnd && !sourceColumnName && !targetColumnName && !actions.onDelete && !actions.onUpdate) return;
    if (!['source', 'target'].includes(foreignKeyEnd) || !sourceColumnName || !targetColumnName) {
      issue('error', 'ERD004', 'FK 연결에는 FK 보유 엔티티와 양끝 컬럼이 모두 필요합니다.', diagram, relation);
      return;
    }
    if (kindOf(from) !== 'entity' || kindOf(to) !== 'entity') {
      issue('error', 'ERD004', 'FK 연결의 양끝은 Entity여야 합니다.', diagram, relation);
      return;
    }
    const columnAt = (entity, name) => {
      const columns = modelOf(entity).columns;
      if (!Array.isArray(columns)) return null;
      const key = name.toLocaleLowerCase();
      return columns.map(parseErdColumn)
        .find(column => String(column.phys || '').trim().toLocaleLowerCase() === key) || null;
    };
    const sourceColumn = columnAt(from, sourceColumnName);
    const targetColumn = columnAt(to, targetColumnName);
    if (!sourceColumn) {
      issue('error', 'ERD005', `출발 Entity에서 연결 컬럼을 찾을 수 없습니다: ${sourceColumnName}`, diagram, relation);
    }
    if (!targetColumn) {
      issue('error', 'ERD005', `도착 Entity에서 연결 컬럼을 찾을 수 없습니다: ${targetColumnName}`, diagram, relation);
    }
    if (!sourceColumn || !targetColumn) return;
    const foreignKeyColumn = foreignKeyEnd === 'source' ? sourceColumn : targetColumn;
    const referencedColumn = foreignKeyEnd === 'source' ? targetColumn : sourceColumn;
    const foreignKeyEntity = foreignKeyEnd === 'source' ? from : to;
    const referencedEntity = foreignKeyEnd === 'source' ? to : from;
    if (!foreignKeyColumn.flags.includes('FK')) {
      issue('warning', 'ERD006', `FK 보유 컬럼에 FK 플래그가 없습니다: ${foreignKeyColumn.phys}`, diagram, relation);
    }
    const referencedPrimaryKeys = (modelOf(referencedEntity).columns || []).map(parseErdColumn)
      .filter(column => column.flags.includes('PK'));
    if (!referencedColumn.flags.includes('PK') || referencedPrimaryKeys.length !== 1) {
      issue('error', 'ERD007',
        `단일 컬럼 FK의 참조 대상은 단일 PK여야 합니다: ${referencedColumn.phys}`,
        diagram, relation);
    }
    const normalizeType = value => String(value || '').trim().replace(/\s+/g, ' ').toLocaleUpperCase();
    if (normalizeType(foreignKeyColumn.type) !== normalizeType(referencedColumn.type)) {
      issue('warning', 'ERD008',
        `FK와 참조 컬럼의 타입이 다릅니다: ${foreignKeyColumn.type || '(없음)'} ↔ ${referencedColumn.type || '(없음)'}`,
        diagram, relation);
    }
    if ((actions.onDelete === 'SET NULL' || actions.onUpdate === 'SET NULL')
      && foreignKeyColumn.flags.includes('NN')) {
      issue('error', 'ERD010',
        `SET NULL 동작에는 nullable FK 컬럼이 필요합니다: ${foreignKeyColumn.phys}`,
        diagram, relation);
    }
    if (actions.onDelete === 'SET DEFAULT' || actions.onUpdate === 'SET DEFAULT') {
      let hasDefault = false;
      try {
        const foreignKeyColumns = (modelOf(foreignKeyEntity).columns || []).map(parseErdColumn)
          .map(column => column.phys).filter(Boolean);
        const details = validateErdSchema(modelOf(foreignKeyEntity), foreignKeyColumns).columnDetails;
        const key = Object.keys(details).find(name => name.toLocaleLowerCase()
          === foreignKeyColumn.phys.toLocaleLowerCase());
        hasDefault = !!(key && details[key].defaultValue);
      } catch (_) { /* ERD009 reports malformed schema separately. */ }
      if (foreignKeyColumn.flags.includes('NN') && !hasDefault) {
        issue('error', 'ERD010',
          `SET DEFAULT 동작의 NOT NULL FK 컬럼에는 DEFAULT가 필요합니다: ${foreignKeyColumn.phys}`,
          diagram, relation);
      }
      issue('warning', 'ERD011', 'SET DEFAULT FK 동작은 MySQL InnoDB에서 지원되지 않습니다.', diagram, relation);
    }
  }

  return {
    validateProject,
    bindingTypeCompatibility,
    defaultValueUnitCompatibility,
    severityOrder,
  };
});
