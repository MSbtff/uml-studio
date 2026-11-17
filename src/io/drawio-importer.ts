// @ts-nocheck
'use strict';

/*
 * Safe, dependency-free draw.io importer for UML Studio.
 *
 * It accepts the native uncompressed mxGraph XML emitted by exporters.js and
 * draw.io's standard compressed <diagram> payload.  Only cells carrying
 * UML Studio's explicit umlKind metadata are converted; arbitrary draw.io
 * shapes are never guessed into UML semantics.
 */
(function initDrawioImporter(root, factory) {
  const api = factory();
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  if (root) root.UMLDrawioImporter = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function createDrawioImporter() {
  const MAX_XML_BYTES = 10 * 1024 * 1024;
  const MAX_NODES = 50000;
  const MAX_DEPTH = 64;
  const MAX_PAGES = 100;
  const MAX_CELLS = 20000;
  const MAX_ATTRIBUTE_LENGTH = 500000;
  const ID_PATTERN = /^[A-Za-z0-9._:-]{1,256}$/;
  const END_NAVIGABILITY = new Set(['unspecified', 'navigable', 'notNavigable']);
  const END_AGGREGATION = new Set(['none', 'shared', 'composite']);
  const VISIBILITY = new Set(['public', 'protected', 'private', 'package']);
  const REFERENTIAL_ACTIONS = new Set(['NO ACTION', 'RESTRICT', 'CASCADE', 'SET NULL', 'SET DEFAULT']);
  const CONFLICT_REFERENCE_FIELDS = new Set([
    'id', 'classifierModelId', 'collaborationModelId', 'providedInterfaceModelId',
    'requiredInterfaceModelId', 'fromModelId', 'toModelId', 'conveyedModelIds',
    'itemFlowModelIds', 'submachineDiagramId', 'interactionDiagramId',
  ]);

  const own = (value, key) => Object.prototype.hasOwnProperty.call(value, key);

  function decodeEntities(value) {
    return String(value || '').replace(/&(#x[0-9a-f]+|#\d+|amp|lt|gt|quot|apos);/gi, (match, entity) => {
      const named = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'" };
      if (named[entity]) return named[entity];
      const codePoint = entity[0] === '#'
        ? Number.parseInt(entity[1].toLowerCase() === 'x' ? entity.slice(2) : entity.slice(1), entity[1].toLowerCase() === 'x' ? 16 : 10)
        : NaN;
      if (!Number.isInteger(codePoint) || codePoint < 0 || codePoint > 0x10ffff) {
        throw new Error('XML 문자 엔티티가 올바르지 않습니다.');
      }
      return String.fromCodePoint(codePoint);
    });
  }

  function parseAttributes(source) {
    const attributes = {};
    let index = 0;
    while (index < source.length) {
      while (/\s/.test(source[index] || '')) index++;
      if (index >= source.length) break;
      const nameMatch = source.slice(index).match(/^([A-Za-z_][A-Za-z0-9_.:-]*)/);
      if (!nameMatch) throw new Error('XML 속성 이름이 올바르지 않습니다.');
      const name = nameMatch[1];
      index += name.length;
      while (/\s/.test(source[index] || '')) index++;
      if (source[index++] !== '=') throw new Error(`XML 속성 값이 없습니다: ${name}`);
      while (/\s/.test(source[index] || '')) index++;
      const quote = source[index++];
      if (quote !== '"' && quote !== "'") throw new Error(`XML 속성 따옴표가 없습니다: ${name}`);
      const end = source.indexOf(quote, index);
      if (end < 0) throw new Error(`XML 속성 따옴표가 닫히지 않았습니다: ${name}`);
      const raw = source.slice(index, end);
      if (raw.length > MAX_ATTRIBUTE_LENGTH) throw new Error(`XML 속성이 너무 큽니다: ${name}`);
      if (own(attributes, name)) throw new Error(`중복된 XML 속성입니다: ${name}`);
      attributes[name] = decodeEntities(raw);
      index = end + 1;
    }
    return attributes;
  }

  function findTagEnd(xml, start) {
    let quote = '';
    for (let index = start + 1; index < xml.length; index++) {
      const char = xml[index];
      if (quote) {
        if (char === quote) quote = '';
      } else if (char === '"' || char === "'") quote = char;
      else if (char === '>') return index;
    }
    return -1;
  }

  function parseXml(xml) {
    const source = String(xml || '').replace(/^\uFEFF/, '');
    if (!source.trim()) throw new Error('draw.io XML 내용이 없습니다.');
    if (source.length > MAX_XML_BYTES) throw new Error('draw.io 파일이 10MB 제한을 초과합니다.');
    if (/<!DOCTYPE|<!ENTITY/i.test(source)) throw new Error('DOCTYPE과 외부 엔티티는 허용하지 않습니다.');
    const documentNode = { name: '#document', attrs: {}, children: [], text: '' };
    const stack = [documentNode];
    let index = 0, nodeCount = 0;
    while (index < source.length) {
      if (source[index] !== '<') {
        const next = source.indexOf('<', index);
        const end = next < 0 ? source.length : next;
        stack[stack.length - 1].text += decodeEntities(source.slice(index, end));
        index = end;
        continue;
      }
      if (source.startsWith('<!--', index)) {
        const end = source.indexOf('-->', index + 4);
        if (end < 0) throw new Error('XML 주석이 닫히지 않았습니다.');
        index = end + 3;
        continue;
      }
      if (source.startsWith('<?', index)) {
        const end = source.indexOf('?>', index + 2);
        if (end < 0) throw new Error('XML 선언이 닫히지 않았습니다.');
        index = end + 2;
        continue;
      }
      if (source.startsWith('<![CDATA[', index)) {
        const end = source.indexOf(']]>', index + 9);
        if (end < 0) throw new Error('CDATA가 닫히지 않았습니다.');
        stack[stack.length - 1].text += source.slice(index + 9, end);
        index = end + 3;
        continue;
      }
      const end = findTagEnd(source, index);
      if (end < 0) throw new Error('XML 태그가 닫히지 않았습니다.');
      let body = source.slice(index + 1, end).trim();
      if (!body) throw new Error('빈 XML 태그입니다.');
      if (body[0] === '!') throw new Error('지원하지 않는 XML 선언입니다.');
      if (body[0] === '/') {
        const name = body.slice(1).trim();
        if (stack.length === 1 || stack[stack.length - 1].name !== name) {
          throw new Error(`XML 닫기 태그가 일치하지 않습니다: ${name}`);
        }
        stack.pop();
        index = end + 1;
        continue;
      }
      const selfClosing = /\/\s*$/.test(body);
      if (selfClosing) body = body.replace(/\/\s*$/, '').trimEnd();
      const nameMatch = body.match(/^([A-Za-z_][A-Za-z0-9_.:-]*)/);
      if (!nameMatch) throw new Error('XML 태그 이름이 올바르지 않습니다.');
      const node = {
        name: nameMatch[1],
        attrs: parseAttributes(body.slice(nameMatch[1].length)),
        children: [],
        text: '',
      };
      if (++nodeCount > MAX_NODES) throw new Error('draw.io XML 노드 수가 제한을 초과합니다.');
      stack[stack.length - 1].children.push(node);
      if (!selfClosing) {
        stack.push(node);
        if (stack.length > MAX_DEPTH) throw new Error('draw.io XML 중첩 깊이가 제한을 초과합니다.');
      }
      index = end + 1;
    }
    if (stack.length !== 1) throw new Error(`XML 태그가 닫히지 않았습니다: ${stack[stack.length - 1].name}`);
    const roots = documentNode.children.filter(node => node.name !== '#text');
    if (roots.length !== 1) throw new Error('draw.io XML 루트가 하나가 아닙니다.');
    return roots[0];
  }

  function child(node, name) {
    return node?.children?.find(value => value.name === name) || null;
  }

  function descendants(node, name, output = []) {
    (node?.children || []).forEach(value => {
      if (value.name === name) output.push(value);
      descendants(value, name, output);
    });
    return output;
  }

  function decodeBase64(payload) {
    const text = String(payload || '').replace(/\s+/g, '');
    if (!text || text.length > MAX_XML_BYTES || !/^[A-Za-z0-9+/]*={0,2}$/.test(text)) {
      throw new Error('압축 draw.io 데이터가 올바르지 않습니다.');
    }
    const binary = typeof atob === 'function'
      ? atob(text)
      : typeof Buffer !== 'undefined' ? Buffer.from(text, 'base64').toString('binary') : null;
    if (binary == null) throw new Error('Base64 디코더를 사용할 수 없습니다.');
    return Uint8Array.from(binary, char => char.charCodeAt(0));
  }

  async function inflateRaw(bytes, options) {
    if (typeof options?.inflateRaw === 'function') return options.inflateRaw(bytes);
    if (typeof DecompressionStream !== 'undefined') {
      const stream = new Blob([bytes]).stream().pipeThrough(new DecompressionStream('deflate-raw'));
      return new Uint8Array(await new Response(stream).arrayBuffer());
    }
    throw new Error('이 브라우저는 압축 draw.io 파일 해제를 지원하지 않습니다. 비압축 XML로 저장해 주세요.');
  }

  function bytesToText(bytes) {
    return new TextDecoder('utf-8', { fatal: true }).decode(bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes));
  }

  async function graphModelFromDiagram(diagram, options) {
    const direct = child(diagram, 'mxGraphModel');
    if (direct) return direct;
    const payload = diagram.text.trim();
    if (!payload) throw new Error('draw.io 페이지에 mxGraphModel이 없습니다.');
    const inflated = await inflateRaw(decodeBase64(payload), options);
    let encoded = bytesToText(inflated);
    try { encoded = decodeURIComponent(encoded); }
    catch (_) { throw new Error('압축 draw.io URL 인코딩이 올바르지 않습니다.'); }
    const root = parseXml(encoded);
    if (root.name !== 'mxGraphModel') throw new Error('압축 draw.io 페이지의 그래프 모델이 올바르지 않습니다.');
    return root;
  }

  function numberAttribute(node, name, fallback, min = -1000000, max = 1000000) {
    if (!node || !own(node.attrs, name) || node.attrs[name] === '') return fallback;
    const value = Number(node.attrs[name]);
    if (!Number.isFinite(value) || value < min || value > max) {
      throw new Error(`draw.io 좌표가 올바르지 않습니다: ${name}`);
    }
    return value;
  }

  function booleanAttribute(node, name) {
    return node?.attrs?.[name] === 'true' || node?.attrs?.[name] === '1';
  }

  function stringAttribute(node, name, fallback = '') {
    const value = node?.attrs?.[name];
    if (value === undefined) return fallback;
    if (value.length > 100000) throw new Error(`draw.io UML 속성이 너무 큽니다: ${name}`);
    return value;
  }

  function jsonArrayAttribute(node, name) {
    const source = stringAttribute(node, name, '');
    if (!source) return undefined;
    let parsed;
    try { parsed = JSON.parse(source); }
    catch (_) { throw new Error(`draw.io 배열 속성이 올바르지 않습니다: ${name}`); }
    if (!Array.isArray(parsed) || parsed.length > 1000
      || parsed.some(value => typeof value !== 'string' || value.length > 10000)) {
      throw new Error(`draw.io 배열 속성이 올바르지 않습니다: ${name}`);
    }
    return parsed;
  }

  function jsonSchemaAttribute(node, name, expected) {
    const source = stringAttribute(node, name, '');
    if (!source) return undefined;
    let parsed;
    try { parsed = JSON.parse(source); }
    catch (_) { throw new Error(`draw.io ERD 스키마 속성이 올바르지 않습니다: ${name}`); }
    const valid = expected === 'array'
      ? Array.isArray(parsed) && parsed.length <= 500
      : parsed && typeof parsed === 'object' && !Array.isArray(parsed)
        && Object.keys(parsed).length <= 500;
    if (!valid) throw new Error(`draw.io ERD 스키마 속성이 올바르지 않습니다: ${name}`);
    return parsed;
  }

  function fallbackName(cell) {
    return stringAttribute(cell, 'value', '')
      .replace(/<br\s*\/?>/gi, '\n')
      .replace(/<hr\s*\/?>/gi, '\n')
      .replace(/<[^>]*>/g, '')
      .split(/\r?\n/).map(value => value.trim()).filter(Boolean)[0] || '';
  }

  function safeIdentifier(value, prefix, used) {
    const base = `${prefix}_${String(value || '')}`.replace(/[^A-Za-z0-9._-]+/g, '_').replace(/^_+|_+$/g, '') || prefix;
    let id = base.slice(0, 120), suffix = 2;
    while (used.has(id)) id = `${base.slice(0, 110)}_${suffix++}`;
    used.add(id);
    return id;
  }

  function inferDiagramType(elements, relations) {
    const kinds = new Set(elements.map(value => value.kind));
    const relationKinds = new Set(relations.map(value => value.kind));
    if ([...kinds].some(kind => ['lifeline', 'seqactor', 'fragment', 'execution'].includes(kind))) return 'sequence';
    if ([...kinds].some(kind => ['entity'].includes(kind)) || [...relationKinds].some(kind => kind.startsWith('erd-'))) return 'erd';
    if ([...kinds].some(kind => ['requirement'].includes(kind))) return 'requirement';
    if ([...kinds].some(kind => ['ibdframe', 'part', 'reference', 'port'].includes(kind))) return 'ibd';
    if ([...kinds].some(kind => ['parametricframe', 'constraintproperty', 'constraintparameter', 'value'].includes(kind))) return 'parametric';
    if ([...kinds].some(kind => ['block', 'valuetype', 'interfaceblock', 'constraintblock'].includes(kind))) return 'bdd';
    if ([...kinds].some(kind => ['state', 'compositestate', 'submachinestate', 'stateinitial', 'statefinal'].includes(kind))) return 'state';
    if ([...kinds].some(kind => ['object', 'artifactinstance', 'componentinstance', 'nodeinstance'].includes(kind))) return 'object';
    if ([...kinds].some(kind => ['actor', 'usecase', 'boundary'].includes(kind))) return 'usecase';
    if ([...kinds].some(kind => ['action', 'initial', 'final', 'decision', 'merge'].includes(kind))) return 'activity';
    if ([...kinds].some(kind => ['component', 'interfaceball'].includes(kind))) return 'component';
    if ([...kinds].some(kind => ['node', 'artifact'].includes(kind))) return 'deployment';
    if ([...kinds].some(kind => ['metaclass', 'stereotype'].includes(kind))) return 'profile';
    if ([...kinds].some(kind => ['model', 'subsystem'].includes(kind))) return 'package';
    return 'class';
  }

  function commonElementModel(cell, kind) {
    const model = {
      kind,
      name: own(cell.attrs, 'umlName') ? stringAttribute(cell, 'umlName') : fallbackName(cell),
    };
    const strings = {
      umlStereotype: 'stereotype', umlText: 'text', umlLogicalName: 'logicalName',
      umlIconScript: 'iconContent', umlInteractionDiagramId: 'interactionDiagramId',
      umlRequirementType: 'requirementType', umlRequirementId: 'requirementId',
      umlRequirementText: 'requirementText', umlRisk: 'risk',
      umlVerificationMethod: 'verificationMethod', umlValueTypeUnit: 'valueTypeUnit',
      umlQuantityKind: 'quantityKind', umlClassifierModelId: 'classifierModelId',
      umlProvidedInterfaceModelId: 'providedInterfaceModelId',
      umlRequiredInterfaceModelId: 'requiredInterfaceModelId', umlDefaultValue: 'defaultValue',
    };
    Object.entries(strings).forEach(([attribute, field]) => {
      if (own(cell.attrs, attribute) && cell.attrs[attribute] !== '') model[field] = stringAttribute(cell, attribute);
    });
    const arrays = {
      umlAttributes: 'attributes', umlOperations: 'operations', umlReceptions: 'receptions',
      umlLiterals: 'literals', umlColumns: 'columns', umlParts: 'parts',
      umlReferences: 'references', umlValues: 'values', umlFlowProperties: 'flowProperties',
      umlConstraintProperties: 'constraintProperties', umlProperties: 'properties',
      umlConstraints: 'constraints', umlConstraintParameters: 'constraintParameters',
    };
    Object.entries(arrays).forEach(([attribute, field]) => {
      const value = jsonArrayAttribute(cell, attribute);
      if (value !== undefined) model[field] = value;
    });
    if (kind === 'entity') {
      const schemaFields = {
        umlErdColumnDetails: ['erdColumnDetails', 'object'],
        umlErdChecks: ['erdChecks', 'array'],
        umlErdIndexes: ['erdIndexes', 'array'],
      };
      Object.entries(schemaFields).forEach(([attribute, [field, expected]]) => {
        const value = jsonSchemaAttribute(cell, attribute, expected);
        if (value !== undefined) model[field] = value;
      });
    }
    if (own(cell.attrs, 'umlVisibility')) {
      if (!VISIBILITY.has(cell.attrs.umlVisibility)) throw new Error('draw.io UML 가시성이 올바르지 않습니다.');
      model.visibility = cell.attrs.umlVisibility;
    }
    if (own(cell.attrs, 'umlAbstract')) model.isAbstract = booleanAttribute(cell, 'umlAbstract');
    if (own(cell.attrs, 'umlIsActor')) model.isActor = booleanAttribute(cell, 'umlIsActor');
    return model;
  }

  function relationModel(cell, kind) {
    const model = {
      kind,
      name: own(cell.attrs, 'umlName') ? stringAttribute(cell, 'umlName') : stringAttribute(cell, 'value', ''),
    };
    const mapping = {
      umlSourceEndName: 'sourceEndName', umlSourceEndVisibility: 'sourceEndVisibility',
      umlSourceEndStereotype: 'sourceEndStereotype', umlSourceMultiplicity: 'sourceLabel',
      umlSourceNavigability: 'sourceNavigability', umlSourceAggregation: 'sourceAggregation',
      umlTargetEndName: 'targetEndName', umlTargetEndVisibility: 'targetEndVisibility',
      umlTargetEndStereotype: 'targetEndStereotype', umlTargetMultiplicity: 'targetLabel',
      umlTargetNavigability: 'targetNavigability', umlTargetAggregation: 'targetAggregation',
      umlForeignKeyEnd: 'foreignKeyEnd', umlSourceColumnName: 'sourceColumnName',
      umlTargetColumnName: 'targetColumnName', umlForeignKeyOnDelete: 'foreignKeyOnDelete',
      umlForeignKeyOnUpdate: 'foreignKeyOnUpdate',
    };
    Object.entries(mapping).forEach(([attribute, field]) => {
      if (own(cell.attrs, attribute) && cell.attrs[attribute] !== '') model[field] = stringAttribute(cell, attribute);
    });
    if (model.foreignKeyEnd && !['source', 'target'].includes(model.foreignKeyEnd)) {
      throw new Error('draw.io ERD FK 보유 끝점이 올바르지 않습니다.');
    }
    for (const field of ['foreignKeyOnDelete', 'foreignKeyOnUpdate']) {
      if (model[field]) {
        model[field] = model[field].trim().replace(/\s+/g, ' ').toUpperCase();
        if (!REFERENTIAL_ACTIONS.has(model[field])) {
          throw new Error(`draw.io ERD ${field === 'foreignKeyOnDelete' ? 'ON DELETE' : 'ON UPDATE'} 동작이 올바르지 않습니다.`);
        }
      }
    }
    ['source', 'target'].forEach(end => {
      const nav = model[`${end}Navigability`];
      const aggregation = model[`${end}Aggregation`];
      const visibility = model[`${end}EndVisibility`];
      if (nav && !END_NAVIGABILITY.has(nav)) throw new Error(`draw.io ${end} Navigability가 올바르지 않습니다.`);
      if (aggregation && !END_AGGREGATION.has(aggregation)) throw new Error(`draw.io ${end} Aggregation이 올바르지 않습니다.`);
      if (visibility && !VISIBILITY.has(visibility)) throw new Error(`draw.io ${end} End Visibility가 올바르지 않습니다.`);
      const qualifierText = stringAttribute(cell, `uml${end[0].toUpperCase()}${end.slice(1)}Qualifiers`, '');
      if (qualifierText) model[`${end}Qualifiers`] = qualifierText.split(/\r?\n/).map(value => value.trim()).filter(Boolean).slice(0, 50);
    });
    if (own(cell.attrs, 'umlRequired')) model.isRequired = booleanAttribute(cell, 'umlRequired');
    if (cell.attrs.umlConveyedModelIds) model.conveyedModelIds = cell.attrs.umlConveyedModelIds.split(',').filter(Boolean);
    if (cell.attrs.umlItemFlowModelIds) model.itemFlowModelIds = cell.attrs.umlItemFlowModelIds.split(',').filter(Boolean);
    return model;
  }

  function geometryOf(cell) {
    const geometry = child(cell, 'mxGeometry');
    if (!geometry) throw new Error(`draw.io 도형의 mxGeometry가 없습니다: ${cell.attrs.id || '?'}`);
    return {
      x: numberAttribute(geometry, 'x', 0), y: numberAttribute(geometry, 'y', 0),
      w: numberAttribute(geometry, 'width', 120, 1, 1000000),
      h: numberAttribute(geometry, 'height', 48, 1, 1000000),
    };
  }

  function manualPoints(cell) {
    const geometry = child(cell, 'mxGeometry');
    const array = child(geometry, 'Array');
    if (!array) return [];
    return array.children.filter(node => node.name === 'mxPoint').slice(0, 200).map(node => ({
      x: numberAttribute(node, 'x', 0), y: numberAttribute(node, 'y', 0),
    }));
  }

  function resolveReferences(models, originalModelMap) {
    Object.values(models).forEach(model => {
      for (const field of ['classifierModelId', 'providedInterfaceModelId', 'requiredInterfaceModelId']) {
        if (!model[field]) continue;
        model[field] = originalModelMap.get(model[field]) || undefined;
      }
      for (const field of ['conveyedModelIds', 'itemFlowModelIds']) {
        if (!Array.isArray(model[field])) continue;
        model[field] = model[field].map(value => originalModelMap.get(value)).filter(Boolean);
      }
    });
  }

  function diagramFromGraph(graph, diagramNode, context, options, index) {
    const root = child(graph, 'root');
    if (!root) throw new Error('draw.io mxGraphModel의 root가 없습니다.');
    const cells = descendants(root, 'mxCell').filter(node => node.attrs.id);
    if (cells.length > MAX_CELLS) throw new Error('draw.io 셀 수가 제한을 초과합니다.');
    const unsupportedCells = cells.filter(node => (node.attrs.vertex === '1' || node.attrs.edge === '1') && !node.attrs.umlKind);
    if (unsupportedCells.length) {
      throw new Error(`umlKind 메타데이터가 없는 draw.io 도형/관계 ${unsupportedCells.length}개는 의미를 보존해 가져올 수 없습니다.`);
    }
    const vertices = cells.filter(node => node.attrs.vertex === '1' && node.attrs.umlKind);
    const edges = cells.filter(node => node.attrs.edge === '1' && node.attrs.umlKind);
    if (!vertices.length) throw new Error('UML Studio umlKind 메타데이터가 있는 도형을 찾을 수 없습니다.');
    const allowedElements = options.allowedElementKinds ? new Set(options.allowedElementKinds) : null;
    const allowedRelations = options.allowedRelationKinds ? new Set(options.allowedRelationKinds) : null;
    vertices.forEach(cell => {
      if (allowedElements && !allowedElements.has(cell.attrs.umlKind)) throw new Error(`지원하지 않는 UML 요소 종류입니다: ${cell.attrs.umlKind}`);
    });
    edges.forEach(cell => {
      if (allowedRelations && !allowedRelations.has(cell.attrs.umlKind)) throw new Error(`지원하지 않는 UML 관계 종류입니다: ${cell.attrs.umlKind}`);
    });

    const vertexById = new Map(vertices.map(cell => [cell.attrs.id, cell]));
    const viewIdByCell = new Map(vertices.map(cell => [cell.attrs.id, safeIdentifier(cell.attrs.id, 'view', context.usedViewIds)]));
    const localGeometry = new Map(vertices.map(cell => [cell.attrs.id, geometryOf(cell)]));
    const absoluteGeometry = new Map();
    const absolute = (cellId, path = new Set()) => {
      if (absoluteGeometry.has(cellId)) return absoluteGeometry.get(cellId);
      if (path.has(cellId)) throw new Error('draw.io 도형의 부모 관계가 순환합니다.');
      path.add(cellId);
      const cell = vertexById.get(cellId);
      const local = localGeometry.get(cellId);
      const parent = cell?.attrs?.parent && vertexById.get(cell.attrs.parent);
      const parentGeometry = parent ? absolute(parent.attrs.id, path) : { x: 0, y: 0 };
      const result = { x: parentGeometry.x + local.x, y: parentGeometry.y + local.y, w: local.w, h: local.h };
      absoluteGeometry.set(cellId, result); path.delete(cellId); return result;
    };
    const modelFor = (cell, kind, relation = false) => {
      const original = ID_PATTERN.test(cell.attrs.umlModelId || '') ? cell.attrs.umlModelId : '';
      const key = original ? `${kind}|${original}` : `${kind}|cell:${cell.attrs.id}`;
      if (context.modelByKey.has(key)) return context.modelByKey.get(key);
      const id = safeIdentifier(original || cell.attrs.id, 'model', context.usedModelIds);
      const model = relation ? relationModel(cell, kind) : commonElementModel(cell, kind);
      model.id = id; context.models[id] = model; context.modelByKey.set(key, id);
      context.modelOrigins[id] = original;
      context.modelRoles[id] = relation ? 'relation' : 'element';
      if (original && !context.originalModelMap.has(original)) context.originalModelMap.set(original, id);
      return id;
    };
    const elements = vertices.map(cell => {
      const geometry = absolute(cell.attrs.id);
      const view = {
        id: viewIdByCell.get(cell.attrs.id), modelId: modelFor(cell, cell.attrs.umlKind),
        x: geometry.x, y: geometry.y, w: geometry.w, h: geometry.h,
      };
      if (cell.attrs.parent && vertexById.has(cell.attrs.parent)) view.parentId = viewIdByCell.get(cell.attrs.parent);
      const fill = stringAttribute(cell, 'umlFill', '');
      if (fill && /^#[0-9a-f]{6}$/i.test(fill)) view.fill = fill;
      return view;
    });
    const relations = edges.map(cell => {
      const from = viewIdByCell.get(cell.attrs.source), to = viewIdByCell.get(cell.attrs.target);
      if (!from || !to) throw new Error(`draw.io 관계의 연결 대상을 찾을 수 없습니다: ${cell.attrs.id}`);
      const view = {
        id: safeIdentifier(cell.attrs.id, 'relation', context.usedViewIds),
        modelId: modelFor(cell, cell.attrs.umlKind, true), from, to,
      };
      if (cell.attrs.umlRouteMode === 'manual') {
        view.routeMode = 'manual'; view.manualPoints = manualPoints(cell);
      }
      if (cell.attrs.umlJumpStyle && ['arc', 'gap', 'none'].includes(cell.attrs.umlJumpStyle)) view.jumpStyle = cell.attrs.umlJumpStyle;
      return view;
    });
    const requestedType = stringAttribute(diagramNode, 'umlDiagramType', '');
    const diagramType = typeof options.resolveDiagramType === 'function'
      ? options.resolveDiagramType(elements.map(view => context.models[view.modelId]), relations.map(view => context.models[view.modelId]), requestedType)
      : requestedType || inferDiagramType(elements.map(view => context.models[view.modelId]), relations.map(view => context.models[view.modelId]));
    if (!diagramType) throw new Error('draw.io 다이어그램 종류를 결정할 수 없습니다.');
    return {
      id: safeIdentifier(diagramNode.attrs.id || index + 1, 'diagram', context.usedDiagramIds),
      type: diagramType,
      name: stringAttribute(diagramNode, 'name', `Imported draw.io ${index + 1}`),
      elements, relations,
      ...(diagramType === 'erd' ? { erdMode: 'both' } : {}),
    };
  }

  function stableValue(value) {
    if (Array.isArray(value)) return JSON.stringify(value);
    if (value && typeof value === 'object') {
      const ordered = Object.keys(value).sort().reduce((result, key) => {
        result[key] = value[key]; return result;
      }, {});
      return JSON.stringify(ordered);
    }
    return JSON.stringify(value);
  }

  function changedSemanticFields(importedModel, existingModel) {
    const fields = new Set([...Object.keys(importedModel || {}), ...Object.keys(existingModel || {})]);
    return [...fields]
      .filter(field => !CONFLICT_REFERENCE_FIELDS.has(field))
      .filter(field => stableValue(importedModel?.[field]) !== stableValue(existingModel?.[field]))
      .sort();
  }

  function semanticKey(model) {
    const kind = String(model?.kind || '').trim().toLocaleLowerCase();
    const name = String(model?.name || '').trim().toLocaleLowerCase();
    return kind && name ? `${kind}\u0000${name}` : '';
  }

  function analyzeImport(imported, existingModels = {}, existingDiagrams = []) {
    const models = imported?.models && typeof imported.models === 'object' ? imported.models : {};
    const diagrams = Array.isArray(imported?.diagrams) ? imported.diagrams : [];
    const relationModelIds = new Set(diagrams.flatMap(diagram => (diagram.relations || []).map(view => view.modelId)));
    const elementModels = Object.entries(models).filter(([id]) => {
      const role = imported?.importMeta?.modelRoles?.[id];
      return role ? role === 'element' : !relationModelIds.has(id);
    });
    const importedKeyCounts = new Map();
    elementModels.forEach(([, model]) => {
      const key = semanticKey(model);
      if (key) importedKeyCounts.set(key, (importedKeyCounts.get(key) || 0) + 1);
    });
    const existingByKey = new Map();
    Object.values(existingModels || {}).forEach(model => {
      const key = semanticKey(model);
      if (!key) return;
      if (!existingByKey.has(key)) existingByKey.set(key, []);
      existingByKey.get(key).push(model);
    });

    const conflicts = [];
    elementModels.forEach(([importedModelId, model]) => {
      const originalModelId = imported?.importMeta?.modelOrigins?.[importedModelId] || '';
      const exact = originalModelId ? existingModels?.[originalModelId] : null;
      if (exact) {
        const compatible = exact.kind === model.kind;
        conflicts.push({
          importedModelId, originalModelId, importedKind: model.kind,
          importedName: model.name || '', matchModelId: exact.id,
          matchName: exact.name || '', type: compatible ? 'exact' : 'incompatible',
          compatible, changedFields: compatible ? changedSemanticFields(model, exact) : ['kind'],
        });
        return;
      }
      const key = semanticKey(model);
      const candidates = key ? existingByKey.get(key) || [] : [];
      if (key && importedKeyCounts.get(key) === 1 && candidates.length === 1) {
        const match = candidates[0];
        conflicts.push({
          importedModelId, originalModelId, importedKind: model.kind,
          importedName: model.name || '', matchModelId: match.id,
          matchName: match.name || '', type: 'semantic', compatible: true,
          changedFields: changedSemanticFields(model, match),
        });
      }
    });

    const existingDiagramNames = new Set((existingDiagrams || [])
      .map(diagram => String(diagram?.name || '').trim().toLocaleLowerCase()).filter(Boolean));
    const diagramDetails = diagrams.map(diagram => ({
      id: diagram.id, name: diagram.name || 'Untitled Diagram', type: diagram.type || '',
      elements: (diagram.elements || []).length, relations: (diagram.relations || []).length,
      nameConflict: existingDiagramNames.has(String(diagram.name || '').trim().toLocaleLowerCase()),
    }));
    return {
      diagrams: diagrams.length,
      models: Object.keys(models).length,
      elementViews: diagramDetails.reduce((sum, diagram) => sum + diagram.elements, 0),
      relationViews: diagramDetails.reduce((sum, diagram) => sum + diagram.relations, 0),
      conflicts,
      compatibleConflicts: conflicts.filter(conflict => conflict.compatible).length,
      incompatibleConflicts: conflicts.filter(conflict => !conflict.compatible).length,
      diagramNameConflicts: diagramDetails.filter(diagram => diagram.nameConflict).length,
      diagramDetails,
    };
  }

  function filterImportConflicts(conflicts, policies = {}, query = '', filter = 'all') {
    const source = Array.isArray(conflicts) ? conflicts : [];
    const normalizedQuery = String(query || '').trim().toLocaleLowerCase();
    const allowedFilters = new Set([
      'all', 'compatible', 'changed', 'exact', 'semantic', 'incompatible',
      'keepBoth', 'reuse', 'replace',
    ]);
    const selectedFilter = allowedFilters.has(filter) ? filter : 'all';
    const policyFor = modelId => {
      const value = policies instanceof Map ? policies.get(modelId) : policies?.[modelId];
      return ['keepBoth', 'reuse', 'replace'].includes(value) ? value : 'keepBoth';
    };
    return source.filter(conflict => {
      const policy = policyFor(conflict?.importedModelId);
      const matchesFilter = selectedFilter === 'all'
        || (selectedFilter === 'compatible' && !!conflict?.compatible)
        || (selectedFilter === 'changed' && (conflict?.changedFields || []).length > 0)
        || (selectedFilter === 'exact' && conflict?.type === 'exact')
        || (selectedFilter === 'semantic' && conflict?.type === 'semantic')
        || (selectedFilter === 'incompatible' && !conflict?.compatible)
        || (['keepBoth', 'reuse', 'replace'].includes(selectedFilter)
          && !!conflict?.compatible && policy === selectedFilter);
      if (!matchesFilter) return false;
      if (!normalizedQuery) return true;
      const searchable = [
        conflict?.importedName, conflict?.matchName, conflict?.importedKind,
        conflict?.type, conflict?.importedModelId, conflict?.originalModelId,
        conflict?.matchModelId, ...(conflict?.changedFields || []),
      ].filter(Boolean).join(' ').toLocaleLowerCase();
      return searchable.includes(normalizedQuery);
    });
  }

  function paginateImportConflicts(conflicts, page = 0, pageSize = 50) {
    const source = Array.isArray(conflicts) ? conflicts : [];
    const size = Number.isInteger(pageSize) ? Math.min(200, Math.max(1, pageSize)) : 50;
    const pageCount = Math.max(1, Math.ceil(source.length / size));
    const currentPage = Math.min(pageCount - 1, Math.max(0, Number.isInteger(page) ? page : 0));
    const start = currentPage * size;
    const end = Math.min(source.length, start + size);
    return {
      items: source.slice(start, end), page: currentPage, pageSize: size,
      pageCount, total: source.length, start, end,
    };
  }

  async function importDrawio(xml, options = {}) {
    const source = String(xml || '');
    const parsed = parseXml(source);
    let pageNodes;
    if (parsed.name === 'mxGraphModel') {
      pageNodes = [{ name: 'diagram', attrs: { id: 'page-1', name: options.defaultDiagramName || 'Imported draw.io' }, children: [parsed], text: '' }];
    } else if (parsed.name === 'mxfile') {
      pageNodes = parsed.children.filter(node => node.name === 'diagram');
    } else {
      throw new Error('draw.io XML은 mxfile 또는 mxGraphModel 루트여야 합니다.');
    }
    if (!pageNodes.length || pageNodes.length > MAX_PAGES) throw new Error('draw.io 페이지 수가 올바르지 않습니다.');
    const context = {
      models: {}, modelByKey: new Map(), originalModelMap: new Map(),
      modelOrigins: {}, modelRoles: {},
      usedModelIds: new Set(), usedViewIds: new Set(), usedDiagramIds: new Set(),
    };
    const diagrams = [];
    for (let index = 0; index < pageNodes.length; index++) {
      const graph = await graphModelFromDiagram(pageNodes[index], options);
      diagrams.push(diagramFromGraph(graph, pageNodes[index], context, options, index));
    }
    resolveReferences(context.models, context.originalModelMap);
    return {
      version: 30,
      projectName: options.projectName || 'Imported draw.io',
      models: context.models,
      diagrams,
      activeId: diagrams[0].id,
      idSeq: 1,
      counters: {},
      importMeta: {
        modelOrigins: context.modelOrigins,
        modelRoles: context.modelRoles,
      },
    };
  }

  return {
    importDrawio, parseXml, inferDiagramType, analyzeImport,
    filterImportConflicts, paginateImportConflicts,
  };
});
