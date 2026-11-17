'use strict';

(function initPresentationRegistry<Api>(root: typeof globalThis & { UMLPresentationRegistry?: Api }, factory: () => Api) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root) root.UMLPresentationRegistry = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function createPresentationRegistry() {
  const DASH_PATTERNS = {
    relation: '6 4',
    lifeline: '6 4',
    note: '3 3',
    selection: '3 2',
  };

  const REL_STYLE = {
    association:    { dash: null,                   head: null },
    directed:       { dash: null,                   head: 'open' },
    generalization: { dash: null,                   head: 'triangle' },
    realization:    { dash: DASH_PATTERNS.relation, head: 'triangle' },
    dependency:     { dash: DASH_PATTERNS.relation, head: 'open' },
    aggregation:    { dash: null,                   head: 'diamond' },
    composition:    { dash: null,                   head: 'diamond-filled' },
    containment:    { dash: null,                   head: 'circle-plus' },
    extension:      { dash: null,                   head: 'filled' },
    notelink:       { dash: DASH_PATTERNS.note,     head: null },
    include:        { dash: DASH_PATTERNS.relation, head: 'open' },
    extend:         { dash: DASH_PATTERNS.relation, head: 'open' },
    controlflow:    { dash: null,                   head: 'open' },
    objectflow:     { dash: null,                   head: 'open' },
    exceptionhandler:{ dash: DASH_PATTERNS.relation, head: 'open' },
    activityinterrupt:{ dash: null,                 head: 'open' },
    connector:      { dash: null,                   head: null },
    bindingconnector:{ dash: null,                  head: null },
    commpath:       { dash: null,                   head: null },
    deploy:         { dash: DASH_PATTERNS.relation, head: 'open' },
    'msg-sync':     { dash: null,                   head: 'filled' },
    'msg-async':    { dash: null,                   head: 'open' },
    'msg-reply':    { dash: DASH_PATTERNS.relation, head: 'open' },
    'msg-create':   { dash: DASH_PATTERNS.relation, head: 'open' },
    'msg-destroy':  { dash: null,                   head: 'x' },
    'erd-11':       { dash: null,                   head: null },
    'erd-1n':       { dash: null,                   head: null },
    'erd-nm':       { dash: null,                   head: null },
    dataflow:       { dash: null,                   head: 'open' },
    mindbranch:     { dash: null,                   head: null },
    transition:     { dash: null,                   head: 'open' },
    link:           { dash: null,                   head: null },
    directedlink:   { dash: null,                   head: 'open' },
    commconnector:  { dash: null,                   head: null },
    'comm-forward': { dash: null,                   head: 'filled' },
    'comm-reverse': { dash: null,                   head: 'filled' },
    csconnector:    { dash: null,                   head: null },
    rolebinding:    { dash: DASH_PATTERNS.relation, head: null },
    timingmessage:  { dash: null,                   head: 'filled' },
    informationflow:{ dash: DASH_PATTERNS.relation, head: 'open' },
    reqcontainment: { dash: null,                   head: 'circle-plus' },
    reqcopy:        { dash: DASH_PATTERNS.relation, head: 'open' },
    derivereqt:     { dash: DASH_PATTERNS.relation, head: 'open' },
    verify:         { dash: DASH_PATTERNS.relation, head: 'open' },
    satisfy:        { dash: DASH_PATTERNS.relation, head: 'open' },
    refine:         { dash: DASH_PATTERNS.relation, head: 'open' },
    trace:          { dash: DASH_PATTERNS.relation, head: 'open' },
  };

  const KIND_META = {
    /* elements */
    class:        { label: 'Class',           icon: 'C',  color: '#c98f2c' },
    interface:    { label: 'Interface',       icon: 'I',  color: '#2e9e5b' },
    enumeration:  { label: 'Enumeration',     icon: 'E',  color: '#7b46d3' },
    package:      { label: 'Package',         icon: 'P',  color: '#b0763a' },
    model:        { label: 'Model',           icon: 'M',  color: '#b0763a' },
    subsystem:    { label: 'Subsystem',       icon: 'S',  color: '#b0763a' },
    metaclass:    { label: 'MetaClass',       icon: 'MC', color: '#76508f' },
    stereotype:   { label: 'Stereotype',      icon: 'ST', color: '#76508f' },
    note:         { label: 'Note',            icon: 'N',  color: '#8a8f66' },
    actor:        { label: 'Actor',           icon: 'A',  color: '#2e9e5b' },
    usecase:      { label: 'Use Case',        icon: 'U',  color: '#2e9e5b' },
    boundary:     { label: 'System Boundary', icon: 'B',  color: '#2e9e5b' },
    action:       { label: 'Action',          icon: 'A',  color: '#d1583a' },
    initial:      { label: 'Initial Node',    icon: '●',  color: '#d1583a' },
    final:        { label: 'Final Node',      icon: '◉',  color: '#d1583a' },
    flowfinal:    { label: 'Flow Final',      icon: '⊗',  color: '#d1583a' },
    decision:     { label: 'Decision',        icon: '◇',  color: '#d1583a' },
    merge:        { label: 'Merge',           icon: '◇',  color: '#d1583a' },
    forkbar:      { label: 'Fork',            icon: '▬',  color: '#d1583a' },
    joinbar:      { label: 'Join',            icon: '▬',  color: '#d1583a' },
    swimlanev:    { label: 'Swimlane (Vertical)', icon: 'SV', color: '#d1583a' },
    swimlaneh:    { label: 'Swimlane (Horizontal)', icon: 'SH', color: '#d1583a' },
    interruptibleregion:{ label: 'Interruptible Activity Region', icon: 'IR', color: '#d1583a' },
    structuredactivity:{ label: 'Structured Activity Node', icon: 'SA', color: '#d1583a' },
    inputpin:     { label: 'Input Pin',       icon: '□',  color: '#d1583a' },
    outputpin:    { label: 'Output Pin',      icon: '■',  color: '#d1583a' },
    sendsignal:   { label: 'Send Signal Action', icon: 'SS', color: '#d1583a' },
    acceptsignal: { label: 'Accept Signal Action', icon: 'AS', color: '#d1583a' },
    timeevent:    { label: 'Accept Time Event Action', icon: 'T', color: '#d1583a' },
    objectnode:   { label: 'Object Node',     icon: 'O',  color: '#d1583a' },
    centralbuffer:{ label: 'Central Buffer',  icon: 'CB', color: '#d1583a' },
    activitydatastore:{ label: 'Data Store',  icon: 'DS', color: '#d1583a' },
    activityparameter:{ label: 'Activity Parameter Node', icon: 'AP', color: '#d1583a' },
    expansionregion:{ label: 'Expansion Region', icon: 'ER', color: '#d1583a' },
    expansioninput:{ label: 'Input Expansion Node', icon: 'EI', color: '#d1583a' },
    expansionoutput:{ label: 'Output Expansion Node', icon: 'EO', color: '#d1583a' },
    lifeline:     { label: 'Lifeline',        icon: 'L',  color: '#1a73e8' },
    seqactor:     { label: 'Actor',           icon: 'A',  color: '#1a73e8' },
    execution:    { label: 'Execution',       icon: 'E',  color: '#1a73e8' },
    interactionuse:{ label: 'Interaction Use', icon: 'ref', color: '#1a73e8' },
    interactioninline:{ label: 'Interaction (inline)', icon: 'sd', color: '#3b6fb6' },
    informationitem:{ label: 'Information Item', icon: 'II', color: '#397d8c' },
    requirement:  { label: 'Requirement', icon: 'R', color: '#4f6f8f' },
    block:        { label: 'Block', icon: 'B', color: '#516f86' },
    valuetype:    { label: 'Value Type', icon: 'VT', color: '#516f86' },
    interfaceblock:{ label: 'Interface Block', icon: 'IB', color: '#516f86' },
    constraintblock:{ label: 'Constraint Block', icon: 'CB', color: '#516f86' },
    ibdframe:     { label: 'IBD Frame', icon: 'ibd', color: '#3f7583' },
    parametricframe:{ label: 'Parametric Frame', icon: 'par', color: '#765f91' },
    constraintproperty:{ label: 'Constraint Property', icon: 'CP', color: '#765f91' },
    constraintparameter:{ label: 'Constraint Parameter', icon: '□', color: '#765f91' },
    reference:    { label: 'Reference', icon: 'RF', color: '#3f7583' },
    value:        { label: 'Value', icon: 'V', color: '#3f7583' },
    stateinvariant:{ label: 'State Invariant', icon: 'S',  color: '#1a73e8' },
    continuation: { label: 'Continuation',    icon: 'C',  color: '#1a73e8' },
    frame:        { label: 'Frame',           icon: 'sd', color: '#1a73e8' },
    fragment:     { label: 'Combined Fragment', icon: 'F', color: '#1a73e8' },
    component:    { label: 'Component',       icon: 'C',  color: '#7b46d3' },
    interfaceball:{ label: 'Interface (ball)', icon: 'O', color: '#7b46d3' },
    artifact:     { label: 'Artifact',        icon: 'A',  color: '#3f7f7f' },
    node:         { label: 'Node',            icon: 'N',  color: '#3f7f7f' },
    entity:       { label: 'Entity',          icon: 'E',  color: '#b3417a' },
    process:      { label: 'Process',         icon: 'P',  color: '#3a8fb0' },
    external:     { label: 'External Entity', icon: 'X',  color: '#3a8fb0' },
    datastore:    { label: 'Data Store',      icon: 'D',  color: '#3a8fb0' },
    mindnode:     { label: 'Topic',           icon: 'T',  color: '#d1863a' },
    state:        { label: 'State',           icon: 'S',  color: '#5b72b2' },
    compositestate:{ label: 'Composite State', icon: 'CS', color: '#445d9c' },
    submachinestate:{ label: 'Submachine State', icon: 'SS', color: '#5268a5' },
    region:       { label: 'Region',          icon: 'R',  color: '#7788b8' },
    stateinitial: { label: 'Initial State',   icon: '●',  color: '#5b72b2' },
    statefinal:   { label: 'Final State',     icon: '◉',  color: '#5b72b2' },
    choice:       { label: 'Choice',          icon: '◇',  color: '#5b72b2' },
    junction:     { label: 'Junction',        icon: '●',  color: '#5b72b2' },
    statefork:    { label: 'Fork / Join',     icon: '▬',  color: '#5b72b2' },
    shallowhistory:{ label: 'Shallow History', icon: 'H', color: '#5b72b2' },
    deephistory:  { label: 'Deep History',    icon: 'H*', color: '#5b72b2' },
    entrypoint:   { label: 'Entry Point',     icon: '○', color: '#5b72b2' },
    exitpoint:    { label: 'Exit Point',      icon: '⊗', color: '#5b72b2' },
    terminate:    { label: 'Terminate',       icon: '×', color: '#5b72b2' },
    connectionpointref:{ label: 'Connection Point Reference', icon: 'CP', color: '#5268a5' },
    object:       { label: 'Object',             icon: 'O',  color: '#8a5f9e' },
    artifactinstance:{ label: 'Artifact Instance', icon: 'AI', color: '#6f6298' },
    componentinstance:{ label: 'Component Instance', icon: 'CI', color: '#6f6298' },
    nodeinstance: { label: 'Node Instance',      icon: 'NI', color: '#6f6298' },
    collaboration:{ label: 'Collaboration',      icon: 'COL', color: '#5f6fa3' },
    part:         { label: 'Part',               icon: 'PT', color: '#5f6fa3' },
    port:         { label: 'Port',               icon: '□',  color: '#5f6fa3' },
    collaborationuse:{ label: 'Collaboration Use', icon: 'CU', color: '#5f6fa3' },
    timingstate:  { label: 'State / Condition', icon: 'SC', color: '#ad6b3d' },
    timesegment:  { label: 'Time Segment',      icon: 'TS', color: '#ad6b3d' },
    timetick:     { label: 'Time Tick',         icon: 'TT', color: '#ad6b3d' },
    timeconstraint:{ label: 'Time Constraint',  icon: 'TC', color: '#ad6b3d' },
    durationconstraint:{ label: 'Duration Constraint', icon: 'DC', color: '#ad6b3d' },
    /* relations */
    association:  { label: 'Association',     icon: '—',  color: '#5a7ba6' },
    directed:     { label: 'Directed Association', icon: '→', color: '#5a7ba6' },
    generalization:{ label: 'Generalization', icon: '▷',  color: '#5a7ba6' },
    realization:  { label: 'Realization',     icon: '⇢',  color: '#5a7ba6' },
    dependency:   { label: 'Dependency',      icon: '⤳',  color: '#5a7ba6' },
    aggregation:  { label: 'Aggregation',     icon: '◇',  color: '#5a7ba6' },
    composition:  { label: 'Composition',     icon: '◆',  color: '#5a7ba6' },
    containment:  { label: 'Containment',     icon: '⊕',  color: '#b0763a' },
    extension:    { label: 'Extension',       icon: '▶',  color: '#76508f' },
    notelink:     { label: 'Note Link',       icon: '┄',  color: '#8a8f66' },
    include:      { label: 'Include',         icon: '⤳',  color: '#2e9e5b' },
    extend:       { label: 'Extend',          icon: '⤳',  color: '#2e9e5b' },
    controlflow:  { label: 'Control Flow',    icon: '→',  color: '#d1583a' },
    objectflow:   { label: 'Object Flow',     icon: '⇢',  color: '#d1583a' },
    exceptionhandler:{ label: 'Exception Handler', icon: '⤳', color: '#d1583a' },
    activityinterrupt:{ label: 'Activity Interrupt', icon: '↯', color: '#d1583a' },
    connector:    { label: 'Assembly Connector', icon: '—', color: '#7b46d3' },
    bindingconnector:{ label: 'Binding Connector', icon: '—', color: '#765f91' },
    commpath:     { label: 'Communication Path', icon: '—', color: '#3f7f7f' },
    deploy:       { label: 'Deploy',          icon: '⤳',  color: '#3f7f7f' },
    'msg-sync':   { label: 'Message (sync)',  icon: '→',  color: '#1a73e8' },
    'msg-async':  { label: 'Message (async)', icon: '↗',  color: '#1a73e8' },
    'msg-reply':  { label: 'Reply Message',   icon: '⇠',  color: '#1a73e8' },
    'msg-create': { label: 'Create Message',  icon: '⤳',  color: '#1a73e8' },
    'msg-destroy':{ label: 'Destroy Message', icon: '✕', color: '#1a73e8' },
    'erd-11':     { label: 'One to One (1..1)', icon: '1', color: '#b3417a' },
    'erd-1n':     { label: 'One to Many (1..N)', icon: 'N', color: '#b3417a' },
    'erd-nm':     { label: 'Many to Many (N:M)', icon: 'M', color: '#b3417a' },
    dataflow:     { label: 'Data Flow',       icon: '→',  color: '#3a8fb0' },
    mindbranch:   { label: 'Branch',          icon: '~',  color: '#d1863a' },
    transition:   { label: 'Transition',      icon: '→',  color: '#5b72b2' },
    link:         { label: 'Link',            icon: '—',  color: '#8a5f9e' },
    directedlink: { label: 'Directed Link',   icon: '→',  color: '#8a5f9e' },
    commconnector:{ label: 'Connector',       icon: '—', color: '#2c7a8b' },
    'comm-forward':{ label: 'Forward Message', icon: '→', color: '#2c7a8b' },
    'comm-reverse':{ label: 'Reverse Message', icon: '←', color: '#2c7a8b' },
    csconnector: { label: 'Connector',         icon: '—', color: '#5f6fa3' },
    rolebinding: { label: 'Role Binding',      icon: '┄', color: '#5f6fa3' },
    timingmessage:{ label: 'Message',           icon: '→', color: '#ad6b3d' },
    informationflow:{ label: 'Information Flow', icon: '⇢', color: '#397d8c' },
    reqcontainment:{ label: 'Containment',      icon: '⊕', color: '#4f6f8f' },
    reqcopy:      { label: 'Copy',              icon: '⤳', color: '#4f6f8f' },
    derivereqt:   { label: 'DeriveReqt',        icon: '⤳', color: '#4f6f8f' },
    verify:       { label: 'Verify',            icon: '⤳', color: '#4f6f8f' },
    satisfy:      { label: 'Satisfy',           icon: '⤳', color: '#4f6f8f' },
    refine:       { label: 'Refine',            icon: '⤳', color: '#4f6f8f' },
    trace:        { label: 'Trace',              icon: '⤳', color: '#4f6f8f' },
  };

  const VALID_RELATION_HEADS = new Set([
    null, 'open', 'triangle', 'diamond', 'diamond-filled', 'circle-plus', 'filled', 'x',
  ]);

  function presentationRegistryProblems(
    kindMeta: Record<string, { label: string; icon: string; color: string }> = KIND_META,
    relationStyles: Record<string, { dash: string | null; head: string | null }> = REL_STYLE,
  ) {
    const problems: string[] = [];
    Object.entries(kindMeta).forEach(([kind, meta]) => {
      if (!meta.label || !meta.icon || !/^#[0-9a-f]{6}$/i.test(meta.color || '')) {
        problems.push(`잘못된 종류 메타데이터: ${kind}`);
      }
    });
    Object.entries(relationStyles).forEach(([kind, style]) => {
      if (!kindMeta[kind]) problems.push(`종류 메타데이터가 없는 관계: ${kind}`);
      if (style.dash !== null && typeof style.dash !== 'string') {
        problems.push(`잘못된 관계 선 스타일: ${kind}`);
      }
      if (!VALID_RELATION_HEADS.has(style.head)) problems.push(`잘못된 관계 끝 모양: ${kind}`);
    });
    return problems;
  }

  const problems = presentationRegistryProblems();
  if (problems.length) throw new Error(`표현 레지스트리가 올바르지 않습니다 · ${problems.join(' · ')}`);

  function deepFreeze<T>(value: T, seen = new WeakSet<object>()): Readonly<T> {
    if (!value || (typeof value !== 'object' && typeof value !== 'function') || seen.has(value)) return value;
    seen.add(value);
    Reflect.ownKeys(value).forEach(key => {
      const child: unknown = Reflect.get(value, key);
      deepFreeze(child, seen);
    });
    return Object.freeze(value);
  }

  return deepFreeze({
    DASH_PATTERNS,
    KIND_META,
    REL_STYLE,
    presentationRegistryProblems,
  });
});
