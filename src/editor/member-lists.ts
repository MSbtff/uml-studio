'use strict';

type MemberListsApi = ReturnType<typeof createMemberListsModule>;
declare var UMLMemberLists: MemberListsApi;

(function initMemberListsModule(root: typeof globalThis & { UMLMemberLists?: MemberListsApi }, factory: () => MemberListsApi) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root) root.UMLMemberLists = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, createMemberListsModule);

function createMemberListsModule() {
  const REQUIRED_FUNCTIONS = Object.freeze([]);
  const REQUIRED_VALUES = Object.freeze([]);
  const MEMBER_FIELDS = Object.freeze({
    attribute: 'attributes',
    column: 'columns',
    literal: 'literals',
    operation: 'operations',
    reception: 'receptions',
    slot: 'slots',
  });

  type MemberKind = keyof typeof MEMBER_FIELDS;
  type MemberField = typeof MEMBER_FIELDS[MemberKind];
  type MemberArrays = Partial<Record<MemberField, unknown[]>>;
  interface MemberMetrics {
    headH: number;
    aH: number;
    slotH: number;
    oH: number;
    rH: number;
    showAttrs?: boolean;
    showOps?: boolean;
    showReceptions?: boolean;
  }
  type MeasuredElement = MemberArrays & { kind: string; _m?: MemberMetrics | null };

  function create() {
    function ensureMemberArray(element: MemberArrays, field: MemberField) {
      if (!Array.isArray(element[field])) element[field] = [];
      return element[field];
    }

    const describe = (element: MeasuredElement, kind: MemberKind, top: number, height: number) => ({
      kind,
      arr: ensureMemberArray(element, MEMBER_FIELDS[kind]),
      top,
      h: height,
    });

    function memberLists(element: MeasuredElement) {
      const metrics = element._m;
      if (!metrics) return [];
      if (element.kind === 'entity') {
        return [describe(element, 'column', metrics.headH, metrics.aH)];
      }
      if (element.kind === 'object') {
        return [describe(element, 'slot', metrics.headH, metrics.slotH)];
      }

      const lists = [];
      let top = metrics.headH;
      if (metrics.showAttrs) {
        const kind = element.kind === 'enumeration' ? 'literal' : 'attribute';
        lists.push(describe(element, kind, top, metrics.aH));
        top += metrics.aH;
      }
      if (metrics.showOps) {
        lists.push(describe(element, 'operation', top, metrics.oH));
        top += metrics.oH;
      }
      if (metrics.showReceptions) {
        lists.push(describe(element, 'reception', top, metrics.rH));
      }
      return lists;
    }

    function memberListByKind(element: MeasuredElement, kind: MemberKind) {
      return memberLists(element).find(list => list.kind === kind) || null;
    }

    return Object.freeze({ ensureMemberArray, memberListByKind, memberLists });
  }

  return Object.freeze({
    MEMBER_FIELDS,
    REQUIRED_FUNCTIONS,
    REQUIRED_VALUES,
    create,
  });
}
