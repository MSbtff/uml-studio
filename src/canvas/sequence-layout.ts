'use strict';

type SequenceLayoutApi = ReturnType<typeof createSequenceLayout>;
declare var UMLSequenceLayout: SequenceLayoutApi;

(function initSequenceLayout(root: typeof globalThis & { UMLSequenceLayout?: SequenceLayoutApi }, factory: () => SequenceLayoutApi) {
  const api = factory();
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  if (root) root.UMLSequenceLayout = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, createSequenceLayout);

function createSequenceLayout() {
  interface LifelineLayout {
    elements?: readonly { kind: string; y: number }[];
  }
  interface TemporalInterval {
    id?: string;
    el: string;
    y0: number;
    y1: number;
    depth?: number;
  }
  type PositionedInterval = Omit<TemporalInterval, 'depth'> & { depth: number };

  const DEFAULT_SEQUENCE_TOP = 32;

  function sequenceLifelineTop(diagram: LifelineLayout) {
    return diagram.elements?.find(view => view.kind === 'lifeline')?.y ?? DEFAULT_SEQUENCE_TOP;
  }

  function sequenceMessageMinY(diagram: LifelineLayout) {
    return sequenceLifelineTop(diagram) + 64;
  }

  function fragmentOperandLayout(view: Pick<DiagramBounds, "y" | "h"> & { operands?: string[]; operandDividers?: number[] }) {
    const top = view.y + 21;
    const bottom = Math.max(top, view.y + view.h);
    const count = view.operands?.length || 0;
    const height = bottom - top;
    const minHeight = Math.min(24, height / Math.max(count, 1));
    const saved = Array.isArray(view.operandDividers) && view.operandDividers.length === count - 1
      ? view.operandDividers : [];
    const boundaries = [top];
    for (let index = 1; index < count; index++) {
      const fraction = Number.isFinite(saved[index - 1]) ? saved[index - 1] : index / count;
      const earliest = boundaries[boundaries.length - 1] + minHeight;
      const latest = bottom - (count - index) * minHeight;
      boundaries.push(Math.min(latest, Math.max(earliest, top + fraction * height)));
    }
    boundaries.push(bottom);
    return { boundaries, minHeight };
  }

  /*
   * Assign the smallest available depth to time intervals that overlap on the
   * same lifeline. Longer intervals win the outer slot when start times match.
   */
  function assignTemporalDepths<Interval extends TemporalInterval>(items: Interval[]): (Interval & PositionedInterval)[] {
    const groups = new Map<string, Interval[]>();
    items.forEach(item => {
      const key = item.el;
      const group = groups.get(key);
      if (group) group.push(item);
      else groups.set(key, [item]);
    });
    groups.forEach(group => {
      const sorted = group.slice().sort((a, b) =>
        a.y0 - b.y0 || b.y1 - a.y1 || String(a.id || '').localeCompare(String(b.id || '')));
      let active: Interval[] = [];
      sorted.forEach(item => {
        active = active.filter(x => x.y1 > item.y0);
        const used = new Set(active.map(x => x.depth));
        let depth = 0;
        while (used.has(depth)) depth++;
        item.depth = depth;
        active.push(item);
      });
    });
    return items as (Interval & PositionedInterval)[];
  }

  function activeAt<Interval extends PositionedInterval>(items: readonly Interval[], lifelineId: string, y: number) {
    return items
      .filter(item => item.el === lifelineId && y >= item.y0 - 1 && y <= item.y1 + 1)
      .sort((a, b) => b.depth - a.depth || b.y0 - a.y0);
  }

  return {
    DEFAULT_SEQUENCE_TOP, sequenceLifelineTop, sequenceMessageMinY, fragmentOperandLayout, assignTemporalDepths, activeAt,
  };
}
