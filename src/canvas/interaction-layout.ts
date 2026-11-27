'use strict';

type InteractionLayoutApi = ReturnType<typeof createInteractionLayoutModule>;
declare var UMLInteractionLayout: InteractionLayoutApi;

(function initInteractionLayoutModule(root: typeof globalThis & { UMLInteractionLayout?: InteractionLayoutApi }, factory: () => InteractionLayoutApi) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root) root.UMLInteractionLayout = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, createInteractionLayoutModule);

function createInteractionLayoutModule() {
  const REQUIRED_FUNCTIONS = Object.freeze([
    'activeAt',
    'assignTemporalDepths',
    'byId',
    'dg',
    'isCommMsg',
    'isMsg',
    'relById',
    'relEndpoints',
    'relLabel',
    'sequenceLifelineTop',
    'syncRelationModel',
  ] as const);
  const REQUIRED_VALUES = Object.freeze([
    'DEFAULT_SEQUENCE_TOP',
    'EXEC_NEST_OFFSET',
    'EXEC_WIDTH',
    'GRID',
  ] as const);
  const DEFAULT_SEQUENCE_BOTTOM = 520;
  const EMPTY_BARS = Object.freeze([]);

  type SequenceMessage = DiagramRelation & { y: number };
  interface ActivationBar {
    id: string;
    el: string;
    y0: number;
    y1: number;
    depth?: number;
    manual?: boolean;
  }
  type PositionedBar = ActivationBar & { depth: number };

  interface InteractionLayoutDependencies {
    activeAt: (bars: readonly PositionedBar[], id: string, y: number) => PositionedBar[];
    assignTemporalDepths: (bars: ActivationBar[]) => PositionedBar[];
    byId: (id: string) => DiagramElement | undefined | null;
    dg: () => EditorDiagram;
    isCommMsg: (kind: string) => boolean;
    isMsg: (kind: string) => boolean;
    relById: (id?: string) => DiagramRelation | undefined | null;
    relEndpoints: (relation: DiagramRelation) => DiagramEndpoints | null;
    relLabel: (relation: DiagramRelation) => string;
    sequenceLifelineTop: (diagram: EditorDiagram) => number;
    syncRelationModel: (relation: DiagramRelation, diagram: EditorDiagram) => void;
    DEFAULT_SEQUENCE_TOP: number;
    EXEC_NEST_OFFSET: number;
    EXEC_WIDTH: number;
    GRID: number;
  }

  function create(dependencies?: InteractionLayoutDependencies) {
    const deps: Partial<InteractionLayoutDependencies> = dependencies || {};
    const missing: string[] = REQUIRED_FUNCTIONS.filter(name => typeof deps[name] !== 'function');
    REQUIRED_VALUES.forEach(name => {
      if (!Number.isFinite(deps[name])) missing.push(`${name}.number`);
    });
    if (missing.length) {
      throw new TypeError(`Interaction Layout 의존성이 없습니다: ${[...new Set(missing)].join(', ')}`);
    }

    const {
      activeAt,
      assignTemporalDepths,
      byId,
      dg,
      isCommMsg,
      isMsg,
      relById,
      relEndpoints,
      relLabel,
      sequenceLifelineTop,
      syncRelationModel,
      DEFAULT_SEQUENCE_TOP,
      EXEC_NEST_OFFSET,
      EXEC_WIDTH,
      GRID,
    } = deps as InteractionLayoutDependencies;

    let sequenceBars: readonly PositionedBar[] = EMPTY_BARS;
    let sequenceBottom = DEFAULT_SEQUENCE_BOTTOM;
    let sequenceNumbers: Readonly<Partial<Record<string, string>>> = Object.freeze({});

    function computeSeqNumbers(diagram: EditorDiagram) {
      const messages = diagram.type === 'communication'
        ? diagram.relations.filter(relation => isCommMsg(relation.kind))
        : diagram.relations
          .filter(relation => isMsg(relation.kind))
          .slice()
          .sort((a, b) => Number(a.y) - Number(b.y));
      const nextNumbers: Record<string, string> = {};
      messages.forEach((message, index) => {
        nextNumbers[message.id] = message.seqNo != null && message.seqNo !== ''
          ? String(message.seqNo)
          : String(index + 1);
      });
      sequenceNumbers = Object.freeze(nextNumbers);
    }

    function computeSequenceLayout(diagram: EditorDiagram) {
      const messages = diagram.relations.filter(
        (relation): relation is SequenceMessage => isMsg(relation.kind) && typeof relation.y === 'number',
      );
      const maxY = messages.reduce((value, relation) => Math.max(value, relation.y || 0), 0);
      const executions = diagram.elements.filter((element): element is DiagramElement & { lifeId: string } =>
        element.kind === 'execution' && typeof element.lifeId === 'string');
      const executionMaxY = executions.reduce(
        (value, element) => Math.max(value, element.y + element.h),
        0,
      );
      const defaultBottom = DEFAULT_SEQUENCE_BOTTOM + sequenceLifelineTop(diagram) - DEFAULT_SEQUENCE_TOP;
      const nextBottom = Math.max(defaultBottom, maxY + 72, executionMaxY + 48);
      const manualLifelines = new Set(executions.map(element => element.lifeId));
      const stacks: Partial<Record<string, { y: number; id: string }[]>> = {};
      const bars: ActivationBar[] = [];

      messages.slice().sort((a, b) => a.y - b.y).forEach(message => {
        if (message.from === message.to) {
          if (message.kind === 'msg-sync' && !manualLifelines.has(message.from)) {
            bars.push({
              id: `auto-${message.id}`,
              el: message.from,
              y0: message.y,
              y1: message.y + 28,
            });
          }
          return;
        }
        if (message.kind === 'msg-sync') {
          if (!manualLifelines.has(message.to)) {
            (stacks[message.to] = stacks[message.to] || []).push({ y: message.y, id: message.id });
          }
        } else if (message.kind === 'msg-reply') {
          const stack = stacks[message.from];
          if (stack && stack.length) {
            const start = stack.pop();
            if (!start) return;
            bars.push({
              id: `auto-${start.id}-${message.id}`,
              el: message.from,
              y0: start.y,
              y1: message.y,
            });
          }
        }
      });
      Object.keys(stacks).forEach(id => {
        stacks[id]?.forEach(start => bars.push({
          id: `auto-${start.id}`,
          el: id,
          y0: start.y,
          y1: Math.min(start.y + 48, nextBottom - 24),
        }));
      });
      executions.forEach(element => bars.push({
        id: element.id,
        el: element.lifeId,
        y0: element.y,
        y1: element.y + element.h,
        depth: element._depth || 0,
        manual: true,
      }));

      const assignedBars = assignTemporalDepths(bars);
      sequenceBottom = nextBottom;
      sequenceBars = Object.freeze(assignedBars.map(bar => Object.freeze(bar)));
    }

    const barsAt = (id: string, y: number) => activeAt(sequenceBars, id, y);
    const deepestBarAt = (id: string, y: number) => barsAt(id, y)[0] || null;

    function msgDisplayLabel(relation: DiagramRelation) {
      const base = relLabel(relation);
      const diagram = dg();
      if (!['sequence', 'communication'].includes(diagram.type) || diagram.seqNumbers === false) return base;
      const number = sequenceNumbers[relation.id];
      if (!number) return base;
      return base ? `${number}: ${base}` : number;
    }

    function msgPoints(relation: DiagramRelation) {
      const source = byId(relation.from);
      const target = byId(relation.to);
      if (!source || !target) return null;
      const sourceCenter = source.x + source.w / 2;
      const targetCenter = target.x + target.w / 2;
      const y = relation.y;
      if (typeof y !== 'number') return null;
      if (relation.from === relation.to) {
        const active = barsAt(relation.from, y);
        const deepest = active[0];
        const started = active
          .filter(bar => Math.abs(bar.y0 - y) <= GRID)
          .sort((a, b) => b.depth - a.depth)[0];
        const childDepth = started ? started.depth : deepest ? deepest.depth : -1;
        const parentDepth = started && childDepth > 0 ? childDepth - 1 : childDepth;
        const edgeAt = (depth: number) => depth < 0
          ? sourceCenter
          : sourceCenter + depth * EXEC_NEST_OFFSET + EXEC_WIDTH / 2;
        return {
          self: true as const,
          cx: sourceCenter,
          startX: edgeAt(parentDepth),
          endX: edgeAt(childDepth),
          depth: childDepth,
          y,
          width: 44,
          height: 20,
        };
      }
      const direction = targetCenter > sourceCenter ? 1 : -1;
      const sourceBar = deepestBarAt(source.id, y);
      const targetBar = deepestBarAt(target.id, y);
      const sourceBarCenter = sourceCenter + (sourceBar ? sourceBar.depth * EXEC_NEST_OFFSET : 0);
      const targetBarCenter = targetCenter + (targetBar ? targetBar.depth * EXEC_NEST_OFFSET : 0);
      const sourceOffset = sourceBar ? EXEC_WIDTH / 2 : 0;
      const targetOffset = targetBar ? EXEC_WIDTH / 2 : 0;
      return {
        p1: { x: sourceBarCenter + direction * sourceOffset, y },
        p2: { x: targetBarCenter - direction * targetOffset, y },
      };
    }

    function communicationSelfConnectorGeom(relation: DiagramRelation | null | undefined) {
      if (!relation || relation.kind !== 'commconnector' || relation.from !== relation.to) return null;
      const host = byId(relation.from);
      if (!host) return null;
      const p1 = { x: host.x + host.w, y: host.y + host.h * 0.35 };
      const p2 = { x: host.x + host.w, y: host.y + host.h * 0.72 };
      const lift = Math.max(48, Math.min(72, host.w * 0.45));
      const c1 = { x: p1.x + lift, y: p1.y };
      const c2 = { x: p2.x + lift, y: p2.y };
      return { p1, p2, c1, c2, label: { x: p2.x + lift, y: p2.y + 16 } };
    }

    function communicationMessagePoints(relation: DiagramRelation) {
      if (!isCommMsg(relation.kind)) return null;
      const connector = relById(relation.connectorId);
      if (!connector || connector.kind !== 'commconnector') return null;
      const peers = dg().relations.filter(candidate =>
        isCommMsg(candidate.kind)
        && candidate.connectorId === connector.id
        && candidate.kind === relation.kind);
      const index = Math.max(0, peers.findIndex(candidate => candidate.id === relation.id));
      if (connector.from === connector.to) {
        const host = byId(connector.from);
        if (!host) return null;
        return {
          self: true as const,
          startX: host.x + host.w,
          endX: host.x + host.w,
          y: host.y + host.h * 0.2 + index * 18,
          width: 44 + index * 8,
          height: 20,
        };
      }
      const endpoints = relEndpoints(connector);
      if (!endpoints) return null;
      let source = endpoints.p1;
      let target = endpoints.p2;
      if (relation.kind === 'comm-reverse') [source, target] = [target, source];
      const dx = target.x - source.x;
      const dy = target.y - source.y;
      const length = Math.hypot(dx, dy) || 1;
      const normalX = -dy / length;
      const normalY = dx / length;
      const offset = 28 + index * 20;
      return {
        p1: {
          x: source.x + dx * 0.12 + normalX * offset,
          y: source.y + dy * 0.12 + normalY * offset,
        },
        p2: {
          x: source.x + dx * 0.88 + normalX * offset,
          y: source.y + dy * 0.88 + normalY * offset,
        },
        normal: { x: normalX, y: normalY },
      };
    }

    function syncCommunicationMessages(connector: DiagramRelation | null | undefined, diagram = dg()) {
      if (!connector || connector.kind !== 'commconnector') return;
      diagram.relations
        .filter(relation => isCommMsg(relation.kind) && relation.connectorId === connector.id)
        .forEach(message => {
          message.from = message.kind === 'comm-reverse' ? connector.to : connector.from;
          message.to = message.kind === 'comm-reverse' ? connector.from : connector.to;
          syncRelationModel(message, diagram);
        });
    }

    function clearSequenceBars() {
      sequenceBars = EMPTY_BARS;
    }

    function clearSequenceNumbers() {
      sequenceNumbers = Object.freeze({});
    }

    function getSequenceBars() {
      return sequenceBars;
    }

    function getSequenceBottom() {
      return sequenceBottom;
    }

    return Object.freeze({
      clearSequenceBars,
      clearSequenceNumbers,
      communicationMessagePoints,
      communicationSelfConnectorGeom,
      computeSeqNumbers,
      computeSequenceLayout,
      getSequenceBars,
      getSequenceBottom,
      msgDisplayLabel,
      msgPoints,
      syncCommunicationMessages,
    });
  }

  return Object.freeze({
    DEFAULT_SEQUENCE_BOTTOM,
    REQUIRED_FUNCTIONS,
    REQUIRED_VALUES,
    create,
  });
}
