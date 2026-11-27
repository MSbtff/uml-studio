'use strict';

type PresentationRegistryApi = ReturnType<typeof createPresentationRegistry>;
declare var UMLPresentationRegistry: PresentationRegistryApi;

(function initPresentationRegistry(root: typeof globalThis & { UMLPresentationRegistry?: PresentationRegistryApi }, factory: () => PresentationRegistryApi) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root) root.UMLPresentationRegistry = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, createPresentationRegistry);

function createPresentationRegistry() {
  const DASH_PATTERNS = {
    relation: '6 4',
    lifeline: '6 4',
    note: '3 3',
    selection: '3 2',
  };

  const REL_STYLE = {
    association:    { dash: null,                   head: null },
    directed:       { dash: null,                   head: 'open' },
    c4relationship: { dash: DASH_PATTERNS.relation, head: 'filled' },
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
    class:        { label: 'Class', labelKo: '클래스', icon: 'C',  color: '#c98f2c' },
    interface:    { label: 'Interface', labelKo: '인터페이스', icon: 'I',  color: '#2e9e5b' },
    enumeration:  { label: 'Enumeration', labelKo: '열거형', icon: 'E',  color: '#7b46d3' },
    package:      { label: 'Package', labelKo: '패키지', icon: 'P',  color: '#b0763a' },
    model:        { label: 'Model', labelKo: '모델', icon: 'M',  color: '#b0763a' },
    subsystem:    { label: 'Subsystem', labelKo: '하위 시스템', icon: 'S',  color: '#b0763a' },
    metaclass:    { label: 'MetaClass', labelKo: '메타클래스', icon: 'MC', color: '#76508f' },
    stereotype:   { label: 'Stereotype', labelKo: '스테레오타입', icon: 'ST', color: '#76508f' },
    note:         { label: 'Note', labelKo: '메모', icon: 'N',  color: '#8a8f66' },
    actor:        { label: 'Actor', labelKo: '액터', icon: 'A',  color: '#2e9e5b' },
    usecase:      { label: 'Use Case', labelKo: '유스케이스', icon: 'U',  color: '#2e9e5b' },
    boundary:     { label: 'System Boundary', labelKo: '시스템 경계', icon: 'B',  color: '#2e9e5b' },
    c4person:     { label: 'Person', labelKo: '사용자', icon: 'P', color: '#225085' },
    c4system:     { label: 'Software System', labelKo: '소프트웨어 시스템', icon: 'S', color: '#225085' },
    c4container:  { label: 'Container', labelKo: '컨테이너', icon: 'C', color: '#35739c' },
    action:       { label: 'Action', labelKo: '동작', icon: 'A',  color: '#d1583a' },
    initial:      { label: 'Initial Node', labelKo: '시작 노드', icon: '●',  color: '#d1583a' },
    final:        { label: 'Final Node', labelKo: '종료 노드', icon: '◉',  color: '#d1583a' },
    flowfinal:    { label: 'Flow Final', labelKo: '흐름 종료', icon: '⊗',  color: '#d1583a' },
    decision:     { label: 'Decision', labelKo: '분기', icon: '◇',  color: '#d1583a' },
    merge:        { label: 'Merge', labelKo: '병합', icon: '◇',  color: '#d1583a' },
    forkbar:      { label: 'Fork', labelKo: '병렬 분기', icon: '▬',  color: '#d1583a' },
    joinbar:      { label: 'Join', labelKo: '병렬 합류', icon: '▬',  color: '#d1583a' },
    swimlanev:    { label: 'Swimlane (Vertical)', labelKo: '스윔레인 (세로)', icon: 'SV', color: '#d1583a' },
    swimlaneh:    { label: 'Swimlane (Horizontal)', labelKo: '스윔레인 (가로)', icon: 'SH', color: '#d1583a' },
    interruptibleregion:{ label: 'Interruptible Activity Region', labelKo: '중단 가능 활동 영역', icon: 'IR', color: '#d1583a' },
    structuredactivity:{ label: 'Structured Activity Node', labelKo: '구조화 활동 노드', icon: 'SA', color: '#d1583a' },
    inputpin:     { label: 'Input Pin', labelKo: '입력 핀', icon: '□',  color: '#d1583a' },
    outputpin:    { label: 'Output Pin', labelKo: '출력 핀', icon: '■',  color: '#d1583a' },
    sendsignal:   { label: 'Send Signal Action', labelKo: '신호 송신 동작', icon: 'SS', color: '#d1583a' },
    acceptsignal: { label: 'Accept Signal Action', labelKo: '신호 수신 동작', icon: 'AS', color: '#d1583a' },
    timeevent:    { label: 'Accept Time Event Action', labelKo: '시간 이벤트 수신 동작', icon: 'T', color: '#d1583a' },
    objectnode:   { label: 'Object Node', labelKo: '객체 노드', icon: 'O',  color: '#d1583a' },
    centralbuffer:{ label: 'Central Buffer', labelKo: '중앙 버퍼', icon: 'CB', color: '#d1583a' },
    activitydatastore:{ label: 'Data Store', labelKo: '데이터 저장소', icon: 'DS', color: '#d1583a' },
    activityparameter:{ label: 'Activity Parameter Node', labelKo: '활동 매개변수 노드', icon: 'AP', color: '#d1583a' },
    expansionregion:{ label: 'Expansion Region', labelKo: '확장 영역', icon: 'ER', color: '#d1583a' },
    expansioninput:{ label: 'Input Expansion Node', labelKo: '입력 확장 노드', icon: 'EI', color: '#d1583a' },
    expansionoutput:{ label: 'Output Expansion Node', labelKo: '출력 확장 노드', icon: 'EO', color: '#d1583a' },
    lifeline:     { label: 'Lifeline', labelKo: '라이프라인', icon: 'L',  color: '#1a73e8' },
    seqactor:     { label: 'Actor', labelKo: '액터', icon: 'A',  color: '#1a73e8' },
    execution:    { label: 'Execution', labelKo: '실행 구간', icon: 'E',  color: '#1a73e8' },
    interactionuse:{ label: 'Interaction Use', labelKo: '상호작용 참조', icon: 'ref', color: '#1a73e8' },
    interactioninline:{ label: 'Interaction (inline)', labelKo: '인라인 상호작용', icon: 'sd', color: '#3b6fb6' },
    informationitem:{ label: 'Information Item', labelKo: '정보 항목', icon: 'II', color: '#397d8c' },
    requirement:  { label: 'Requirement', labelKo: '요구사항', icon: 'R', color: '#4f6f8f' },
    block:        { label: 'Block', labelKo: '블록', icon: 'B', color: '#516f86' },
    valuetype:    { label: 'Value Type', labelKo: '값 유형', icon: 'VT', color: '#516f86' },
    interfaceblock:{ label: 'Interface Block', labelKo: '인터페이스 블록', icon: 'IB', color: '#516f86' },
    constraintblock:{ label: 'Constraint Block', labelKo: '제약 블록', icon: 'CB', color: '#516f86' },
    ibdframe:     { label: 'IBD Frame', labelKo: '내부 블록 프레임', icon: 'ibd', color: '#3f7583' },
    parametricframe:{ label: 'Parametric Frame', labelKo: '파라메트릭 프레임', icon: 'par', color: '#765f91' },
    constraintproperty:{ label: 'Constraint Property', labelKo: '제약 속성', icon: 'CP', color: '#765f91' },
    constraintparameter:{ label: 'Constraint Parameter', labelKo: '제약 매개변수', icon: '□', color: '#765f91' },
    reference:    { label: 'Reference', labelKo: '참조', icon: 'RF', color: '#3f7583' },
    value:        { label: 'Value', labelKo: '값', icon: 'V', color: '#3f7583' },
    stateinvariant:{ label: 'State Invariant', labelKo: '상태 불변 조건', icon: 'S',  color: '#1a73e8' },
    continuation: { label: 'Continuation', labelKo: '연속 지점', icon: 'C',  color: '#1a73e8' },
    frame:        { label: 'Frame', labelKo: '프레임', icon: 'sd', color: '#1a73e8' },
    fragment:     { label: 'Combined Fragment', labelKo: '결합 프래그먼트', icon: 'F', color: '#1a73e8' },
    component:    { label: 'Component', labelKo: '컴포넌트', icon: 'C',  color: '#7b46d3' },
    interfaceball:{ label: 'Interface (ball)', labelKo: '인터페이스 (원형)', icon: 'O', color: '#7b46d3' },
    artifact:     { label: 'Artifact', labelKo: '아티팩트', icon: 'A',  color: '#3f7f7f' },
    node:         { label: 'Node', labelKo: '노드', icon: 'N',  color: '#3f7f7f' },
    database:     { label: 'Database', labelKo: '데이터베이스', icon: 'DB', color: '#3f7f7f' },
    entity:       { label: 'Entity', labelKo: '엔티티', icon: 'E',  color: '#b3417a' },
    process:      { label: 'Process', labelKo: '프로세스', icon: 'P',  color: '#3a8fb0' },
    external:     { label: 'External Entity', labelKo: '외부 엔티티', icon: 'X',  color: '#3a8fb0' },
    datastore:    { label: 'Data Store', labelKo: '데이터 저장소', icon: 'D',  color: '#3a8fb0' },
    mindnode:     { label: 'Topic', labelKo: '주제', icon: 'T',  color: '#d1863a' },
    state:        { label: 'State', labelKo: '상태', icon: 'S',  color: '#5b72b2' },
    compositestate:{ label: 'Composite State', labelKo: '복합 상태', icon: 'CS', color: '#445d9c' },
    submachinestate:{ label: 'Submachine State', labelKo: '하위 상태 머신', icon: 'SS', color: '#5268a5' },
    region:       { label: 'Region', labelKo: '영역', icon: 'R',  color: '#7788b8' },
    stateinitial: { label: 'Initial State', labelKo: '초기 상태', icon: '●',  color: '#5b72b2' },
    statefinal:   { label: 'Final State', labelKo: '종료 상태', icon: '◉',  color: '#5b72b2' },
    choice:       { label: 'Choice', labelKo: '선택 분기', icon: '◇',  color: '#5b72b2' },
    junction:     { label: 'Junction', labelKo: '접합점', icon: '●',  color: '#5b72b2' },
    statefork:    { label: 'Fork / Join', labelKo: '병렬 분기·합류', icon: '▬',  color: '#5b72b2' },
    shallowhistory:{ label: 'Shallow History', labelKo: '얕은 이력', icon: 'H', color: '#5b72b2' },
    deephistory:  { label: 'Deep History', labelKo: '깊은 이력', icon: 'H*', color: '#5b72b2' },
    entrypoint:   { label: 'Entry Point', labelKo: '진입점', icon: '○', color: '#5b72b2' },
    exitpoint:    { label: 'Exit Point', labelKo: '종료점', icon: '⊗', color: '#5b72b2' },
    terminate:    { label: 'Terminate', labelKo: '실행 종료', icon: '×', color: '#5b72b2' },
    connectionpointref:{ label: 'Connection Point Reference', labelKo: '접점 참조', icon: 'CP', color: '#5268a5' },
    object:       { label: 'Object', labelKo: '객체', icon: 'O',  color: '#8a5f9e' },
    artifactinstance:{ label: 'Artifact Instance', labelKo: '아티팩트 인스턴스', icon: 'AI', color: '#6f6298' },
    componentinstance:{ label: 'Component Instance', labelKo: '컴포넌트 인스턴스', icon: 'CI', color: '#6f6298' },
    nodeinstance: { label: 'Node Instance', labelKo: '노드 인스턴스', icon: 'NI', color: '#6f6298' },
    collaboration:{ label: 'Collaboration', labelKo: '협업', icon: 'COL', color: '#5f6fa3' },
    part:         { label: 'Part', labelKo: '파트', icon: 'PT', color: '#5f6fa3' },
    port:         { label: 'Port', labelKo: '포트', icon: '□',  color: '#5f6fa3' },
    collaborationuse:{ label: 'Collaboration Use', labelKo: '협업 참조', icon: 'CU', color: '#5f6fa3' },
    timingstate:  { label: 'State / Condition', labelKo: '상태·조건', icon: 'SC', color: '#ad6b3d' },
    timesegment:  { label: 'Time Segment', labelKo: '시간 구간', icon: 'TS', color: '#ad6b3d' },
    timetick:     { label: 'Time Tick', labelKo: '시간 눈금', icon: 'TT', color: '#ad6b3d' },
    timeconstraint:{ label: 'Time Constraint', labelKo: '시간 제약', icon: 'TC', color: '#ad6b3d' },
    durationconstraint:{ label: 'Duration Constraint', labelKo: '기간 제약', icon: 'DC', color: '#ad6b3d' },
    association:  { label: 'Association', labelKo: '연관', icon: '—',  color: '#5a7ba6' },
    directed:     { label: 'Directed Association', labelKo: '방향성 연관', icon: '→', color: '#5a7ba6' },
    c4relationship:{ label: 'Relationship', labelKo: '관계', icon: '→', color: '#35739c' },
    generalization:{ label: 'Generalization', labelKo: '일반화', icon: '▷',  color: '#5a7ba6' },
    realization:  { label: 'Realization', labelKo: '실현', icon: '⇢',  color: '#5a7ba6' },
    dependency:   { label: 'Dependency', labelKo: '의존', icon: '⤳',  color: '#5a7ba6' },
    aggregation:  { label: 'Aggregation', labelKo: '집합', icon: '◇',  color: '#5a7ba6' },
    composition:  { label: 'Composition', labelKo: '합성', icon: '◆',  color: '#5a7ba6' },
    containment:  { label: 'Containment', labelKo: '포함', icon: '⊕',  color: '#b0763a' },
    extension:    { label: 'Extension', labelKo: '확장', icon: '▶',  color: '#76508f' },
    notelink:     { label: 'Note Link', labelKo: '메모 연결', icon: '┄',  color: '#8a8f66' },
    include:      { label: 'Include', labelKo: '포함', icon: '⤳',  color: '#2e9e5b' },
    extend:       { label: 'Extend', labelKo: '확장', icon: '⤳',  color: '#2e9e5b' },
    controlflow:  { label: 'Control Flow', labelKo: '제어 흐름', icon: '→',  color: '#d1583a' },
    objectflow:   { label: 'Object Flow', labelKo: '객체 흐름', icon: '⇢',  color: '#d1583a' },
    exceptionhandler:{ label: 'Exception Handler', labelKo: '예외 처리', icon: '⤳', color: '#d1583a' },
    activityinterrupt:{ label: 'Activity Interrupt', labelKo: '활동 중단', icon: '↯', color: '#d1583a' },
    connector:    { label: 'Assembly Connector', labelKo: '조립 커넥터', icon: '—', color: '#7b46d3' },
    bindingconnector:{ label: 'Binding Connector', labelKo: '바인딩 커넥터', icon: '—', color: '#765f91' },
    commpath:     { label: 'Communication Path', labelKo: '통신 경로', icon: '—', color: '#3f7f7f' },
    deploy:       { label: 'Deploy', labelKo: '배치', icon: '⤳',  color: '#3f7f7f' },
    'msg-sync':   { label: 'Message (sync)', labelKo: '동기 메시지', icon: '→',  color: '#1a73e8' },
    'msg-async':  { label: 'Message (async)', labelKo: '비동기 메시지', icon: '↗',  color: '#1a73e8' },
    'msg-reply':  { label: 'Reply Message', labelKo: '응답 메시지', icon: '⇠',  color: '#1a73e8' },
    'msg-create': { label: 'Create Message', labelKo: '생성 메시지', icon: '⤳',  color: '#1a73e8' },
    'msg-destroy':{ label: 'Destroy Message', labelKo: '삭제 메시지', icon: '✕', color: '#1a73e8' },
    'erd-11':     { label: 'One to One (1..1)', labelKo: '일대일 (1..1)', icon: '1', color: '#b3417a' },
    'erd-1n':     { label: 'One to Many (1..N)', labelKo: '일대다 (1..N)', icon: 'N', color: '#b3417a' },
    'erd-nm':     { label: 'Many to Many (N:M)', labelKo: '다대다 (N:M)', icon: 'M', color: '#b3417a' },
    dataflow:     { label: 'Data Flow', labelKo: '데이터 흐름', icon: '→',  color: '#3a8fb0' },
    mindbranch:   { label: 'Branch', labelKo: '가지', icon: '~',  color: '#d1863a' },
    transition:   { label: 'Transition', labelKo: '전이', icon: '→',  color: '#5b72b2' },
    link:         { label: 'Link', labelKo: '링크', icon: '—',  color: '#8a5f9e' },
    directedlink: { label: 'Directed Link', labelKo: '방향성 링크', icon: '→',  color: '#8a5f9e' },
    commconnector:{ label: 'Connector', labelKo: '커넥터', icon: '—', color: '#2c7a8b' },
    'comm-forward':{ label: 'Forward Message', labelKo: '정방향 메시지', icon: '→', color: '#2c7a8b' },
    'comm-reverse':{ label: 'Reverse Message', labelKo: '역방향 메시지', icon: '←', color: '#2c7a8b' },
    csconnector: { label: 'Connector', labelKo: '커넥터', icon: '—', color: '#5f6fa3' },
    rolebinding: { label: 'Role Binding', labelKo: '역할 바인딩', icon: '┄', color: '#5f6fa3' },
    timingmessage:{ label: 'Message', labelKo: '메시지', icon: '→', color: '#ad6b3d' },
    informationflow:{ label: 'Information Flow', labelKo: '정보 흐름', icon: '⇢', color: '#397d8c' },
    reqcontainment:{ label: 'Containment', labelKo: '포함', icon: '⊕', color: '#4f6f8f' },
    reqcopy:      { label: 'Copy', labelKo: '복사', icon: '⤳', color: '#4f6f8f' },
    derivereqt:   { label: 'DeriveReqt', labelKo: '요구사항 도출', icon: '⤳', color: '#4f6f8f' },
    verify:       { label: 'Verify', labelKo: '검증', icon: '⤳', color: '#4f6f8f' },
    satisfy:      { label: 'Satisfy', labelKo: '충족', icon: '⤳', color: '#4f6f8f' },
    refine:       { label: 'Refine', labelKo: '구체화', icon: '⤳', color: '#4f6f8f' },
    trace:        { label: 'Trace', labelKo: '추적', icon: '⤳', color: '#4f6f8f' },
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
}
