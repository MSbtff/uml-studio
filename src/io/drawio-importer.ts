'use strict';

type DrawioImporterApi = ReturnType<typeof createDrawioImporter>;
declare var UMLDrawioImporter: DrawioImporterApi;

(function initDrawioImporter(root: typeof globalThis & { UMLDrawioImporter?: DrawioImporterApi }, factory: () => DrawioImporterApi) {
  const api = factory();
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  if (root) root.UMLDrawioImporter = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, createDrawioImporter);

function createDrawioImporter() {
  const { text: uiText } = globalThis.UMLLanguage
    ?? require('../editor/language.js') as typeof UMLLanguage;

  interface XmlNode {
    name: string;
    attrs: Record<string, string>;
    children: XmlNode[];
    text: string;
  }

  interface DrawioOptions {
    inflateRaw?: (bytes: Uint8Array) => ReadableStream<Uint8Array>;
    projectName?: string;
    defaultDiagramName?: string;
    allowedElementKinds?: Iterable<string>;
    allowedRelationKinds?: Iterable<string>;
    resolveDiagramType?: (elements: DiagramModel[], relations: DiagramModel[], requestedType: string) => string;
  }

  interface InflationBudget {
    remainingBytes: number;
  }

  interface ImportContext {
    models: DiagramModels;
    modelByKey: Map<string, string>;
    originalModelMap: Map<string, string>;
    modelOrigins: Record<string, string>;
    modelRoles: Record<string, 'element' | 'relation'>;
    usedModelIds: Set<string>;
    usedViewIds: Set<string>;
    usedDiagramIds: Set<string>;
  }

  const MAX_XML_BYTES = 10 * 1024 * 1024;
  const MAX_NODES = 50000;
  const MAX_DEPTH = 64;
  const MAX_PAGES = 100;
  const MAX_CELLS = 20000;
  const MAX_ATTRIBUTE_LENGTH = 500000;
  const ID_PATTERN = /^[A-Za-z0-9._:-]{1,256}$/;
  const END_NAVIGABILITY = new Set(['unspecified', 'navigable', 'notNavigable']);
  const END_AGGREGATION = new Set(['none', 'shared', 'composite']);
  const DRAWIO_DIRECTIONAL_MARKERS = new Set([
    'open', 'openThin', 'classic', 'classicThin', 'block', 'blockThin', 'async', 'openAsync', 'doubleBlock',
  ]);
  const VISIBILITY = new Set(['public', 'protected', 'private', 'package']);
  const REFERENTIAL_ACTIONS = new Set(['NO ACTION', 'RESTRICT', 'CASCADE', 'SET NULL', 'SET DEFAULT']);
  const CONFLICT_REFERENCE_FIELDS = new Set([
    'id', 'classifierModelId', 'collaborationModelId', 'providedInterfaceModelId',
    'requiredInterfaceModelId', 'fromModelId', 'toModelId', 'conveyedModelIds',
    'itemFlowModelIds', 'submachineDiagramId', 'interactionDiagramId',
  ]);

  const own = (value: object, key: PropertyKey) => Object.prototype.hasOwnProperty.call(value, key);

  function decodeEntities(value: unknown) {
    return String(value || '').replace(/&(#x[0-9a-f]+|#\d+|amp|lt|gt|quot|apos);/gi, (_match, entity: string) => {
      const named: Partial<Record<string, string>> = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'" };
      if (named[entity]) return named[entity];
      const codePoint = entity[0] === '#'
        ? Number.parseInt(entity[1].toLowerCase() === 'x' ? entity.slice(2) : entity.slice(1), entity[1].toLowerCase() === 'x' ? 16 : 10)
        : NaN;
      if (!Number.isInteger(codePoint) || codePoint < 0 || codePoint > 0x10ffff) {
        throw new Error(uiText('Invalid XML character entity.', 'XML 문자 엔티티가 올바르지 않습니다.'));
      }
      return String.fromCodePoint(codePoint);
    });
  }

  function parseAttributes(source: string) {
    const attributes: Record<string, string> = Object.create(null);
    let index = 0;
    while (index < source.length) {
      while (/\s/.test(source[index] || '')) index++;
      if (index >= source.length) break;
      const nameMatch = source.slice(index).match(/^([A-Za-z_][A-Za-z0-9_.:-]*)/);
      if (!nameMatch) throw new Error(uiText('Invalid XML attribute name.', 'XML 속성 이름이 올바르지 않습니다.'));
      const name = nameMatch[1];
      index += name.length;
      while (/\s/.test(source[index] || '')) index++;
      if (source[index++] !== '=') throw new Error(uiText('Missing XML attribute value: {0}', 'XML 속성 값이 없습니다: {0}', name));
      while (/\s/.test(source[index] || '')) index++;
      const quote = source[index++];
      if (quote !== '"' && quote !== "'") throw new Error(uiText('Missing quote around XML attribute: {0}', 'XML 속성 따옴표가 없습니다: {0}', name));
      const end = source.indexOf(quote, index);
      if (end < 0) throw new Error(uiText('Unclosed XML attribute quote: {0}', 'XML 속성 따옴표가 닫히지 않았습니다: {0}', name));
      const raw = source.slice(index, end);
      if (raw.length > MAX_ATTRIBUTE_LENGTH) throw new Error(uiText('XML attribute exceeds the size limit: {0}', 'XML 속성이 너무 큽니다: {0}', name));
      if (own(attributes, name)) throw new Error(uiText('Duplicate XML attribute: {0}', '중복된 XML 속성입니다: {0}', name));
      attributes[name] = decodeEntities(raw);
      index = end + 1;
    }
    return attributes;
  }

  function findTagEnd(xml: string, start: number) {
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

  function parseXml(xml: unknown) {
    const source = String(xml || '').replace(/^\uFEFF/, '');
    if (!source.trim()) throw new Error(uiText('The draw.io XML is empty.', 'draw.io XML 내용이 없습니다.'));
    if (source.length > MAX_XML_BYTES) throw new Error(uiText('The draw.io file exceeds the 10 MB limit.', 'draw.io 파일이 10MB 제한을 초과합니다.'));
    if (/<!DOCTYPE|<!ENTITY/i.test(source)) throw new Error(uiText(
      'DOCTYPE and external entities are prohibited.',
      'DOCTYPE과 외부 엔티티는 허용하지 않습니다.',
    ));
    const documentNode: XmlNode = { name: '#document', attrs: {}, children: [], text: '' };
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
        if (end < 0) throw new Error(uiText('Unclosed XML comment.', 'XML 주석이 닫히지 않았습니다.'));
        index = end + 3;
        continue;
      }
      if (source.startsWith('<?', index)) {
        const end = source.indexOf('?>', index + 2);
        if (end < 0) throw new Error(uiText('Unclosed XML declaration.', 'XML 선언이 닫히지 않았습니다.'));
        index = end + 2;
        continue;
      }
      if (source.startsWith('<![CDATA[', index)) {
        const end = source.indexOf(']]>', index + 9);
        if (end < 0) throw new Error(uiText('Unclosed CDATA section.', 'CDATA가 닫히지 않았습니다.'));
        stack[stack.length - 1].text += source.slice(index + 9, end);
        index = end + 3;
        continue;
      }
      const end = findTagEnd(source, index);
      if (end < 0) throw new Error(uiText('Unclosed XML tag.', 'XML 태그가 닫히지 않았습니다.'));
      let body = source.slice(index + 1, end).trim();
      if (!body) throw new Error(uiText('Empty XML tag.', '빈 XML 태그입니다.'));
      if (body[0] === '!') throw new Error(uiText('Unsupported XML declaration.', '지원하지 않는 XML 선언입니다.'));
      if (body[0] === '/') {
        const name = body.slice(1).trim();
        if (stack.length === 1 || stack[stack.length - 1].name !== name) {
          throw new Error(uiText('Mismatched XML closing tag: {0}', 'XML 닫기 태그가 일치하지 않습니다: {0}', name));
        }
        stack.pop();
        index = end + 1;
        continue;
      }
      const selfClosing = /\/\s*$/.test(body);
      if (selfClosing) body = body.replace(/\/\s*$/, '').trimEnd();
      const nameMatch = body.match(/^([A-Za-z_][A-Za-z0-9_.:-]*)/);
      if (!nameMatch) throw new Error(uiText('Invalid XML tag name.', 'XML 태그 이름이 올바르지 않습니다.'));
      const node: XmlNode = {
        name: nameMatch[1],
        attrs: parseAttributes(body.slice(nameMatch[1].length)),
        children: [],
        text: '',
      };
      if (++nodeCount > MAX_NODES) throw new Error(uiText('The draw.io XML exceeds the node limit.', 'draw.io XML 노드 수가 제한을 초과합니다.'));
      stack[stack.length - 1].children.push(node);
      if (!selfClosing) {
        stack.push(node);
        if (stack.length > MAX_DEPTH) throw new Error(uiText('The draw.io XML exceeds the nesting limit.', 'draw.io XML 중첩 깊이가 제한을 초과합니다.'));
      }
      index = end + 1;
    }
    if (stack.length !== 1) throw new Error(uiText('Unclosed XML tag: {0}', 'XML 태그가 닫히지 않았습니다: {0}', stack[stack.length - 1].name));
    const roots = documentNode.children.filter(node => node.name !== '#text');
    if (roots.length !== 1) throw new Error(uiText('The draw.io XML must have one root element.', 'draw.io XML 루트가 하나가 아닙니다.'));
    return roots[0];
  }

  function child(node: XmlNode | null, name: string) {
    return node?.children?.find(value => value.name === name) || null;
  }

  function descendants(node: XmlNode, name: string, output: XmlNode[] = []) {
    (node?.children || []).forEach(value => {
      if (value.name === name) output.push(value);
      descendants(value, name, output);
    });
    return output;
  }

  function decodeBase64(payload: string) {
    const text = String(payload || '').replace(/\s+/g, '');
    if (!text || text.length > MAX_XML_BYTES || !/^[A-Za-z0-9+/]*={0,2}$/.test(text)) {
      throw new Error(uiText('Invalid compressed draw.io data.', '압축 draw.io 데이터가 올바르지 않습니다.'));
    }
    const binary = typeof atob === 'function'
      ? atob(text)
      : typeof Buffer !== 'undefined' ? Buffer.from(text, 'base64').toString('binary') : null;
    if (binary == null) throw new Error(uiText('Base64 decoder is unavailable.', 'Base64 디코더를 사용할 수 없습니다.'));
    const bytes = new Uint8Array(binary.length);
    for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index);
    return bytes;
  }

  function inflateRaw(bytes: Uint8Array<ArrayBuffer>) {
    if (typeof DecompressionStream === 'undefined') {
      throw new Error(uiText(
        'This browser cannot decompress draw.io files. Save the file as uncompressed XML.',
        '이 브라우저는 압축 draw.io 파일 해제를 지원하지 않습니다. 비압축 XML로 저장해 주세요.',
      ));
    }
    const chunkSize = 4 * 1024;
    let offset = 0;
    const compressed = new ReadableStream<Uint8Array<ArrayBuffer>>({
      pull(controller) {
        const end = Math.min(offset + chunkSize, bytes.length);
        controller.enqueue(bytes.subarray(offset, end));
        offset = end;
        if (offset === bytes.length) controller.close();
      },
    });
    return compressed.pipeThrough(new DecompressionStream('deflate-raw'));
  }

  async function readInflatedText(stream: ReadableStream<Uint8Array>, budget: InflationBudget) {
    const reader = stream.getReader();
    const decoder = new TextDecoder('utf-8', { fatal: true });
    let text = '';
    try {
      for (;;) {
        const { value, done } = await reader.read();
        if (done) return text + decoder.decode();
        budget.remainingBytes -= value.byteLength;
        if (budget.remainingBytes < 0) {
          throw new Error(uiText(
            'The decompressed draw.io data exceeds the 10 MB limit.',
            '압축 해제된 draw.io 데이터가 10MB 제한을 초과합니다.',
          ));
        }
        text += decoder.decode(value, { stream: true });
      }
    } catch (error) {
      await reader.cancel().catch(() => {});
      throw error;
    } finally {
      reader.releaseLock();
    }
  }

  async function graphModelFromDiagram(diagram: XmlNode, options: DrawioOptions, budget: InflationBudget) {
    const direct = child(diagram, 'mxGraphModel');
    if (direct) return direct;
    const payload = diagram.text.trim();
    if (!payload) throw new Error(uiText('The draw.io page is missing mxGraphModel.', 'draw.io 페이지에 mxGraphModel이 없습니다.'));
    const stream = (options.inflateRaw ?? inflateRaw)(decodeBase64(payload));
    let encoded = await readInflatedText(stream, budget);
    try { encoded = decodeURIComponent(encoded); }
    catch (_) { throw new Error(uiText('Invalid URL encoding in a compressed draw.io file.', '압축 draw.io URL 인코딩이 올바르지 않습니다.')); }
    const root = parseXml(encoded);
    if (root.name !== 'mxGraphModel') throw new Error(uiText(
      'Invalid graph model in a compressed draw.io page.',
      '압축 draw.io 페이지의 그래프 모델이 올바르지 않습니다.',
    ));
    return root;
  }

  function numberAttribute(node: XmlNode | null, name: string, fallback: number, min = -1000000, max = 1000000) {
    if (!node || !own(node.attrs, name) || node.attrs[name] === '') return fallback;
    const value = Number(node.attrs[name]);
    if (!Number.isFinite(value) || value < min || value > max) {
      throw new Error(uiText('Invalid draw.io coordinate: {0}', 'draw.io 좌표가 올바르지 않습니다: {0}', name));
    }
    return value;
  }

  function booleanAttribute(node: XmlNode, name: string) {
    return node?.attrs?.[name] === 'true' || node?.attrs?.[name] === '1';
  }

  function stringAttribute(node: XmlNode | null, name: string, fallback = '') {
    const value = node?.attrs?.[name];
    if (value === undefined) return fallback;
    if (value.length > 100000) throw new Error(uiText('draw.io UML attribute exceeds the size limit: {0}', 'draw.io UML 속성이 너무 큽니다: {0}', name));
    return value;
  }

  function jsonArrayAttribute(node: XmlNode, name: string): string[] | undefined {
    const source = stringAttribute(node, name, '');
    if (!source) return undefined;
    let parsed: unknown;
    try { parsed = JSON.parse(source); }
    catch (_) { throw new Error(uiText('Invalid draw.io array attribute: {0}', 'draw.io 배열 속성이 올바르지 않습니다: {0}', name)); }
    if (!Array.isArray(parsed) || parsed.length > 1000
      || parsed.some(value => typeof value !== 'string' || value.length > 10000)) {
      throw new Error(uiText('Invalid draw.io array attribute: {0}', 'draw.io 배열 속성이 올바르지 않습니다: {0}', name));
    }
    return parsed;
  }

  function jsonSchemaAttribute(node: XmlNode, name: string, expected: 'array' | 'object'): unknown {
    const source = stringAttribute(node, name, '');
    if (!source) return undefined;
    let parsed: unknown;
    try { parsed = JSON.parse(source); }
    catch (_) { throw new Error(uiText('Invalid draw.io ERD schema attribute: {0}', 'draw.io ERD 스키마 속성이 올바르지 않습니다: {0}', name)); }
    const valid = expected === 'array'
      ? Array.isArray(parsed) && parsed.length <= 500
      : parsed && typeof parsed === 'object' && !Array.isArray(parsed)
        && Object.keys(parsed).length <= 500;
    if (!valid) throw new Error(uiText('Invalid draw.io ERD schema attribute: {0}', 'draw.io ERD 스키마 속성이 올바르지 않습니다: {0}', name));
    return parsed;
  }

  function fallbackName(cell: XmlNode) {
    return stringAttribute(cell, 'value', '')
      .replace(/<br\s*\/?>/gi, '\n')
      .replace(/<hr\s*\/?>/gi, '\n')
      .replace(/<[^>]*>/g, '')
      .split(/\r?\n/).map(value => value.trim()).filter(Boolean)[0] || '';
  }

  function safeIdentifier(value: string | number, prefix: string, used: Set<string>) {
    const base = `${prefix}_${String(value || '')}`.replace(/[^A-Za-z0-9._-]+/g, '_').replace(/^_+|_+$/g, '') || prefix;
    let id = base.slice(0, 120), suffix = 2;
    while (used.has(id)) id = `${base.slice(0, 110)}_${suffix++}`;
    used.add(id);
    return id;
  }

  function inferDiagramType(elements: readonly { kind: string }[], relations: readonly { kind: string }[]) {
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

  function commonElementModel(cell: XmlNode, kind: string) {
    const model: Omit<DiagramModel, 'id'> = {
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
    } as const;
    Object.entries(strings).forEach(([attribute, field]) => {
      if (own(cell.attrs, attribute) && cell.attrs[attribute] !== '') model[field] = stringAttribute(cell, attribute);
    });
    const arrays = {
      umlAttributes: 'attributes', umlOperations: 'operations', umlReceptions: 'receptions',
      umlLiterals: 'literals', umlColumns: 'columns', umlParts: 'parts',
      umlReferences: 'references', umlValues: 'values', umlFlowProperties: 'flowProperties',
      umlConstraintProperties: 'constraintProperties', umlProperties: 'properties',
      umlConstraints: 'constraints', umlConstraintParameters: 'constraintParameters',
    } as const;
    Object.entries(arrays).forEach(([attribute, field]) => {
      const value = jsonArrayAttribute(cell, attribute);
      if (value !== undefined) model[field] = value;
    });
    if (kind === 'entity') {
      const details = jsonSchemaAttribute(cell, 'umlErdColumnDetails', 'object') as ModelFields['erdColumnDetails'];
      const checks = jsonSchemaAttribute(cell, 'umlErdChecks', 'array') as ModelFields['erdChecks'];
      const indexes = jsonSchemaAttribute(cell, 'umlErdIndexes', 'array') as ModelFields['erdIndexes'];
      if (details !== undefined) model.erdColumnDetails = details;
      if (checks !== undefined) model.erdChecks = checks;
      if (indexes !== undefined) model.erdIndexes = indexes;
    }
    if (own(cell.attrs, 'umlVisibility')) {
      if (!VISIBILITY.has(cell.attrs.umlVisibility)) throw new Error(uiText(
        'Invalid UML visibility in draw.io.',
        'draw.io UML 가시성이 올바르지 않습니다.',
      ));
      model.visibility = cell.attrs.umlVisibility;
    }
    if (own(cell.attrs, 'umlAbstract')) model.isAbstract = booleanAttribute(cell, 'umlAbstract');
    if (own(cell.attrs, 'umlIsActor')) model.isActor = booleanAttribute(cell, 'umlIsActor');
    return model;
  }

  function applyCommunicationPathMarkers(style: string, model: Omit<DiagramModel, 'id'>) {
    const properties = new Map<string, string>();
    for (const entry of style.split(';')) {
      const separator = entry.indexOf('=');
      if (separator < 0) continue;
      const key = entry.slice(0, separator).trim();
      if (key === 'startArrow' || key === 'endArrow' || key === 'startFill' || key === 'endFill') {
        properties.set(key, entry.slice(separator + 1).trim());
      }
    }
    for (const [end, marker] of [['source', 'start'], ['target', 'end']] as const) {
      const arrow = properties.get(`${marker}Arrow`);
      const aggregation = `${end}Aggregation` as const;
      const navigability = `${end}Navigability` as const;
      const currentAggregation = model[aggregation] ?? 'none';
      if (arrow === 'diamond' || arrow === 'diamondThin') {
        const value = properties.get(`${marker}Fill`) === '0' ? 'shared' : 'composite';
        if (value !== currentAggregation) model[aggregation] = value;
        continue;
      }
      const value = arrow === 'none' ? 'unspecified' : arrow === 'cross' ? 'notNavigable'
        : arrow && DRAWIO_DIRECTIONAL_MARKERS.has(arrow) ? 'navigable' : undefined;
      if (value === undefined) continue;
      if (currentAggregation !== 'none') model[aggregation] = 'none';
      if (value !== (model[navigability] ?? 'unspecified')) model[navigability] = value;
    }
  }

  function relationModel(cell: XmlNode, kind: string) {
    const model: Omit<DiagramModel, 'id'> = {
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
    } as const;
    Object.entries(mapping).forEach(([attribute, field]) => {
      if (own(cell.attrs, attribute) && cell.attrs[attribute] !== '') model[field] = stringAttribute(cell, attribute);
    });
    if (model.foreignKeyEnd && !['source', 'target'].includes(model.foreignKeyEnd)) {
      throw new Error(uiText('Invalid draw.io ERD foreign key owner.', 'draw.io ERD FK 보유 끝점이 올바르지 않습니다.'));
    }
    for (const field of ['foreignKeyOnDelete', 'foreignKeyOnUpdate'] as const) {
      if (model[field]) {
        model[field] = model[field].trim().replace(/\s+/g, ' ').toUpperCase();
        if (!REFERENTIAL_ACTIONS.has(model[field])) {
          throw new Error(uiText(
            'Invalid draw.io ERD {0} action.',
            'draw.io ERD {0} 동작이 올바르지 않습니다.',
            field === 'foreignKeyOnDelete' ? 'ON DELETE' : 'ON UPDATE',
          ));
        }
      }
    }
    (['source', 'target'] as const).forEach(end => {
      const nav = model[`${end}Navigability`];
      const aggregation = model[`${end}Aggregation`];
      const visibility = model[`${end}EndVisibility`];
      if (nav && !END_NAVIGABILITY.has(nav)) throw new Error(uiText(
        'Invalid draw.io {0} navigability.',
        'draw.io {0} Navigability가 올바르지 않습니다.',
        end,
      ));
      if (aggregation && !END_AGGREGATION.has(aggregation)) throw new Error(uiText(
        'Invalid draw.io {0} aggregation.',
        'draw.io {0} Aggregation이 올바르지 않습니다.',
        end,
      ));
      if (visibility && !VISIBILITY.has(visibility)) throw new Error(uiText(
        'Invalid draw.io {0} end visibility.',
        'draw.io {0} End Visibility가 올바르지 않습니다.',
        end,
      ));
      const qualifierText = stringAttribute(cell, `uml${end[0].toUpperCase()}${end.slice(1)}Qualifiers`, '');
      if (qualifierText) model[`${end}Qualifiers`] = qualifierText.split(/\r?\n/).map(value => value.trim()).filter(Boolean).slice(0, 50);
    });
    if (kind === 'commpath' && cell.attrs.style) applyCommunicationPathMarkers(cell.attrs.style, model);
    if (own(cell.attrs, 'umlRequired')) model.isRequired = booleanAttribute(cell, 'umlRequired');
    if (cell.attrs.umlConveyedModelIds) model.conveyedModelIds = cell.attrs.umlConveyedModelIds.split(',').filter(Boolean);
    if (cell.attrs.umlItemFlowModelIds) model.itemFlowModelIds = cell.attrs.umlItemFlowModelIds.split(',').filter(Boolean);
    return model;
  }

  function geometryOf(cell: XmlNode) {
    const geometry = child(cell, 'mxGeometry');
    if (!geometry) throw new Error(uiText(
      'Missing mxGeometry for draw.io shape: {0}',
      'draw.io 도형의 mxGeometry가 없습니다: {0}',
      cell.attrs.id || '?',
    ));
    return {
      x: numberAttribute(geometry, 'x', 0), y: numberAttribute(geometry, 'y', 0),
      w: numberAttribute(geometry, 'width', 120, 1, 1000000),
      h: numberAttribute(geometry, 'height', 48, 1, 1000000),
    };
  }

  function manualPoints(cell: XmlNode) {
    const geometry = child(cell, 'mxGeometry');
    const array = child(geometry, 'Array');
    if (!array) return [];
    return array.children.filter(node => node.name === 'mxPoint').slice(0, 200).map(node => ({
      x: numberAttribute(node, 'x', 0), y: numberAttribute(node, 'y', 0),
    }));
  }

  function resolveReferences(models: DiagramModels, originalModelMap: ReadonlyMap<string, string>) {
    Object.values(models).forEach(model => {
      for (const field of ['classifierModelId', 'providedInterfaceModelId', 'requiredInterfaceModelId'] as const) {
        const id = model[field];
        if (id) model[field] = originalModelMap.get(id);
      }
      for (const field of ['conveyedModelIds', 'itemFlowModelIds'] as const) {
        if (!Array.isArray(model[field])) continue;
        model[field] = model[field].map(value => originalModelMap.get(value)).filter((id): id is string => Boolean(id));
      }
    });
  }

  function diagramFromGraph(graph: XmlNode, diagramNode: XmlNode, context: ImportContext, options: DrawioOptions, index: number): ImportedDiagram {
    const root = child(graph, 'root');
    if (!root) throw new Error(uiText('Missing root in draw.io mxGraphModel.', 'draw.io mxGraphModel의 root가 없습니다.'));
    const cells = descendants(root, 'mxCell').filter(node => node.attrs.id);
    if (cells.length > MAX_CELLS) throw new Error(uiText('The draw.io file exceeds the cell limit.', 'draw.io 셀 수가 제한을 초과합니다.'));
    const unsupportedCells = cells.filter(node => (node.attrs.vertex === '1' || node.attrs.edge === '1') && !node.attrs.umlKind);
    if (unsupportedCells.length) {
      throw new Error(uiText(
        'Could not preserve the meaning of {0} draw.io shapes or relationships without umlKind metadata.',
        'umlKind 메타데이터가 없는 draw.io 도형/관계 {0}개는 의미를 보존해 가져올 수 없습니다.',
        unsupportedCells.length,
      ));
    }
    const vertices = cells.filter(node => node.attrs.vertex === '1' && node.attrs.umlKind);
    const edges = cells.filter(node => node.attrs.edge === '1' && node.attrs.umlKind);
    if (!vertices.length) throw new Error(uiText(
      'No shapes with UML Studio umlKind metadata found.',
      'UML Studio umlKind 메타데이터가 있는 도형을 찾을 수 없습니다.',
    ));
    const allowedElements = options.allowedElementKinds ? new Set(options.allowedElementKinds) : null;
    const allowedRelations = options.allowedRelationKinds ? new Set(options.allowedRelationKinds) : null;
    vertices.forEach(cell => {
      if (allowedElements && !allowedElements.has(cell.attrs.umlKind)) throw new Error(uiText(
        'Unsupported UML element type: {0}',
        '지원하지 않는 UML 요소 종류입니다: {0}',
        cell.attrs.umlKind,
      ));
    });
    edges.forEach(cell => {
      if (allowedRelations && !allowedRelations.has(cell.attrs.umlKind)) throw new Error(uiText(
        'Unsupported UML relationship type: {0}',
        '지원하지 않는 UML 관계 종류입니다: {0}',
        cell.attrs.umlKind,
      ));
    });

    const vertexById = new Map(vertices.map(cell => [cell.attrs.id, cell]));
    const viewIdByCell = new Map(vertices.map(cell => [cell.attrs.id, safeIdentifier(cell.attrs.id, 'view', context.usedViewIds)]));
    const localGeometry = new Map(vertices.map(cell => [cell.attrs.id, geometryOf(cell)]));
    const absoluteGeometry = new Map<string, DiagramBounds>();
    const absolute = (cellId: string, path = new Set<string>()): DiagramBounds => {
      const cached = absoluteGeometry.get(cellId);
      if (cached) return cached;
      if (path.has(cellId)) throw new Error(uiText('The draw.io shape hierarchy contains a cycle.', 'draw.io 도형의 부모 관계가 순환합니다.'));
      path.add(cellId);
      const cell = vertexById.get(cellId);
      const local = localGeometry.get(cellId);
      if (!local) throw new Error(uiText('Missing draw.io shape coordinates: {0}', 'draw.io 도형의 좌표를 찾을 수 없습니다: {0}', cellId));
      const parent = cell?.attrs?.parent && vertexById.get(cell.attrs.parent);
      const parentGeometry = parent ? absolute(parent.attrs.id, path) : { x: 0, y: 0 };
      const result = { x: parentGeometry.x + local.x, y: parentGeometry.y + local.y, w: local.w, h: local.h };
      absoluteGeometry.set(cellId, result); path.delete(cellId); return result;
    };
    const modelFor = (cell: XmlNode, kind: string, relation = false) => {
      const original = ID_PATTERN.test(cell.attrs.umlModelId || '') ? cell.attrs.umlModelId : '';
      const pathModel = relation && kind === 'commpath' ? relationModel(cell, kind) : undefined;
      const pathEnds = pathModel ? `|${pathModel.sourceNavigability ?? 'unspecified'}|${pathModel.targetNavigability ?? 'unspecified'}`
        + `|${pathModel.sourceAggregation ?? 'none'}|${pathModel.targetAggregation ?? 'none'}` : '';
      const key = original ? `${kind}|${original}${pathEnds}` : `${kind}|cell:${cell.attrs.id}`;
      const existingId = context.modelByKey.get(key);
      if (existingId) return existingId;
      const id = safeIdentifier(original || cell.attrs.id, 'model', context.usedModelIds);
      const model = pathModel ?? (relation ? relationModel(cell, kind) : commonElementModel(cell, kind));
      context.models[id] = { ...model, id }; context.modelByKey.set(key, id);
      context.modelOrigins[id] = original;
      context.modelRoles[id] = relation ? 'relation' : 'element';
      if (original && !context.originalModelMap.has(original)) context.originalModelMap.set(original, id);
      return id;
    };
    const elements = vertices.map(cell => {
      const geometry = absolute(cell.attrs.id);
      const id = viewIdByCell.get(cell.attrs.id);
      if (!id) throw new Error(uiText('Missing draw.io shape ID: {0}', 'draw.io 도형의 ID를 찾을 수 없습니다: {0}', cell.attrs.id));
      const view: ImportedElement & { modelId: string } = {
        id, modelId: modelFor(cell, cell.attrs.umlKind),
        x: geometry.x, y: geometry.y, w: geometry.w, h: geometry.h,
      };
      if (cell.attrs.parent && vertexById.has(cell.attrs.parent)) view.parentId = viewIdByCell.get(cell.attrs.parent);
      const fill = stringAttribute(cell, 'umlFill', '');
      if (fill && /^#[0-9a-f]{6}$/i.test(fill)) view.fill = fill;
      return view;
    });
    const relations = edges.map(cell => {
      const from = viewIdByCell.get(cell.attrs.source), to = viewIdByCell.get(cell.attrs.target);
      if (!from || !to) throw new Error(uiText(
        'Missing draw.io relationship endpoint: {0}',
        'draw.io 관계의 연결 대상을 찾을 수 없습니다: {0}',
        cell.attrs.id,
      ));
      const view: ImportedRelation & { modelId: string } = {
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
    if (!diagramType) throw new Error(uiText('Could not determine the draw.io diagram type.', 'draw.io 다이어그램 종류를 결정할 수 없습니다.'));
    return {
      id: safeIdentifier(diagramNode.attrs.id || index + 1, 'diagram', context.usedDiagramIds),
      type: diagramType,
      name: stringAttribute(diagramNode, 'name', `Imported draw.io ${index + 1}`),
      elements, relations,
      ...(diagramType === 'erd' ? { erdMode: 'both' } : {}),
    };
  }

  function stableValue(value: unknown) {
    if (Array.isArray(value)) return JSON.stringify(value);
    if (value && typeof value === 'object') {
      const ordered = Object.fromEntries(Object.entries(value).sort(([a], [b]) => a < b ? -1 : a === b ? 0 : 1));
      return JSON.stringify(ordered);
    }
    return JSON.stringify(value);
  }

  function changedSemanticFields(importedModel: DiagramModel, existingModel: DiagramModel) {
    const fields = new Set([...Object.keys(importedModel || {}), ...Object.keys(existingModel || {})]);
    return [...fields]
      .filter(field => !CONFLICT_REFERENCE_FIELDS.has(field))
      .filter(field => stableValue(Reflect.get(importedModel, field)) !== stableValue(Reflect.get(existingModel, field)))
      .sort();
  }

  function semanticKey(model: DiagramModel) {
    const kind = String(model?.kind || '').trim().toLocaleLowerCase();
    const name = String(model?.name || '').trim().toLocaleLowerCase();
    return kind && name ? `${kind}\u0000${name}` : '';
  }

  function analyzeImport(imported?: DrawioProject | null, existingModels: DiagramModels = {}, existingDiagrams: readonly Pick<EditorDiagram, 'name'>[] = []): DrawioImportAnalysis {
    const models = imported?.models && typeof imported.models === 'object' ? imported.models : {};
    const diagrams = Array.isArray(imported?.diagrams) ? imported.diagrams : [];
    const relationModelIds = new Set(diagrams.flatMap(diagram => (diagram.relations || []).map(view => view.modelId)));
    const elementModels = Object.entries(models).filter(([id]) => {
      const role = imported?.importMeta?.modelRoles?.[id];
      return role ? role === 'element' : !relationModelIds.has(id);
    });
    const importedKeyCounts = new Map<string, number>();
    elementModels.forEach(([, model]) => {
      const key = semanticKey(model);
      if (key) importedKeyCounts.set(key, (importedKeyCounts.get(key) || 0) + 1);
    });
    const existingByKey = new Map<string, DiagramModel[]>();
    Object.values(existingModels || {}).forEach(model => {
      const key = semanticKey(model);
      if (!key) return;
      const group = existingByKey.get(key);
      if (group) group.push(model);
      else existingByKey.set(key, [model]);
    });

    const conflicts: DrawioConflict[] = [];
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

  function filterImportConflicts(conflicts: DrawioConflict[], policies: Map<string, DrawioPolicy> | Partial<Record<string, DrawioPolicy>> = {}, query = '', filter = 'all') {
    const source = Array.isArray(conflicts) ? conflicts : [];
    const normalizedQuery = String(query || '').trim().toLocaleLowerCase();
    const allowedFilters = new Set([
      'all', 'compatible', 'changed', 'exact', 'semantic', 'incompatible',
      'keepBoth', 'reuse', 'replace',
    ]);
    const selectedFilter = allowedFilters.has(filter) ? filter : 'all';
    const policyFor = (modelId: string) => {
      const value = policies instanceof Map ? policies.get(modelId) : policies?.[modelId];
      return value && ['keepBoth', 'reuse', 'replace'].includes(value) ? value : 'keepBoth';
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

  function paginateImportConflicts(conflicts: DrawioConflict[], page = 0, pageSize = 50) {
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

  async function importDrawio(xml: unknown, options: DrawioOptions = {}): Promise<DrawioProject> {
    const source = String(xml || '');
    const parsed = parseXml(source);
    let pageNodes: XmlNode[];
    if (parsed.name === 'mxGraphModel') {
      pageNodes = [{ name: 'diagram', attrs: { id: 'page-1', name: options.defaultDiagramName || 'Imported draw.io' }, children: [parsed], text: '' }];
    } else if (parsed.name === 'mxfile') {
      pageNodes = parsed.children.filter(node => node.name === 'diagram');
    } else {
      throw new Error(uiText('The draw.io XML must have an mxfile or mxGraphModel root.', 'draw.io XML은 mxfile 또는 mxGraphModel 루트여야 합니다.'));
    }
    if (!pageNodes.length || pageNodes.length > MAX_PAGES) throw new Error(uiText(
      'Invalid number of draw.io pages.',
      'draw.io 페이지 수가 올바르지 않습니다.',
    ));
    const context: ImportContext = {
      models: {}, modelByKey: new Map(), originalModelMap: new Map(),
      modelOrigins: {}, modelRoles: {},
      usedModelIds: new Set(), usedViewIds: new Set(), usedDiagramIds: new Set(),
    };
    const diagrams = [];
    const budget = { remainingBytes: MAX_XML_BYTES };
    for (let index = 0; index < pageNodes.length; index++) {
      const graph = await graphModelFromDiagram(pageNodes[index], options, budget);
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
}
