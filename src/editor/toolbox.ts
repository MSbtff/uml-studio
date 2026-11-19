type ToolboxApi = ReturnType<typeof createToolboxModule>;
declare var UMLToolbox: ToolboxApi;

(function initToolboxModule(root: typeof globalThis & { UMLToolbox?: ToolboxApi }, factory: () => ToolboxApi) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root) root.UMLToolbox = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, createToolboxModule);

function createToolboxModule() {
  'use strict';
  const { label: uiLabel, text: uiText } = globalThis.UMLLanguage
    ?? require('./language.js') as typeof UMLLanguage;


  const REQUIRED_FUNCTIONS = Object.freeze(['clearLinking', 'dg', 'diagramKindLabel', 'renderCanvas'] as const);
  const REQUIRED_VALUES = Object.freeze(['document', 'state', 'toolbox', 'DIAGRAM_TOOLS'] as const);

  function toolIcon(id: string) {
    const s = 'class="ic-stroke" stroke="#4a4e57" stroke-width="1.3" fill="none"';
    const icons: Partial<Record<string, string>> = {
      object: `<rect x="3" y="3" width="14" height="14" ${s} fill="#f8f0fb"/><line x1="3" y1="8" x2="17" y2="8" ${s}/><line x1="5" y1="5.5" x2="15" y2="5.5" ${s}/>` ,
      artifactinstance: `<path d="M5 3 L13 3 L16 6 L16 17 L5 17 Z" ${s} fill="#f5f1fb"/><path d="M13 3 L13 6 L16 6" ${s}/><line x1="7" y1="12" x2="14" y2="12" ${s}/>` ,
      componentinstance: `<rect x="5" y="3" width="12" height="14" ${s} fill="#f5f1fb"/><rect x="2.5" y="6" width="6" height="3" ${s}/><rect x="2.5" y="11" width="6" height="3" ${s}/>` ,
      nodeinstance: `<path d="M3 6 L6 3 L17 3 L17 14 L14 17 L3 17 Z" ${s} fill="#f5f1fb"/><path d="M3 6 L14 6 L14 17 M14 6 L17 3" ${s}/>` ,
      link: `<line x1="3" y1="16" x2="17" y2="4" ${s}/>` ,
      directedlink: `<line x1="3" y1="16" x2="16" y2="5" ${s}/><path d="M10.5 5 L16 5 L16 10.5" ${s}/>` ,
      commconnector: `<line x1="3" y1="15" x2="17" y2="5" ${s}/>` ,
      'comm-forward': `<line x1="3" y1="12" x2="14" y2="6" ${s}/><path d="M10 5 L16 5 L14 11" ${s}/>` ,
      'comm-reverse': `<line x1="17" y1="5" x2="6" y2="12" ${s}/><path d="M10 13 L4 13 L6 7" ${s}/>` ,
      collaboration: `<ellipse cx="10" cy="10" rx="7" ry="5" ${s} fill="#f5f6ff" stroke-dasharray="2.5 2"/>`,
      part: `<rect x="3" y="5" width="14" height="10" ${s} fill="#eef1ff"/><line x1="6" y1="11" x2="14" y2="11" ${s}/>`,
      reference: `<rect x="3" y="5" width="14" height="10" ${s} fill="#eef6f8" stroke-dasharray="2.5 2"/><text x="10" y="11.5" text-anchor="middle" font-size="4" fill="#3f7583">ref</text>`,
      value: `<rect x="3" y="5" width="14" height="10" ${s} fill="#f7f4ec"/><text x="10" y="11.5" text-anchor="middle" font-size="4" fill="#3f7583">val</text>`,
      constraintproperty: `<rect x="3" y="3" width="14" height="14" ${s} fill="#f3edf8"/><text x="10" y="8" text-anchor="middle" font-size="3.6" fill="#765f91">constraint</text><line x1="3" y1="10" x2="17" y2="10" ${s}/>`,
      constraintparameter: `<rect x="7" y="7" width="6" height="6" ${s} fill="#fff"/>`,
      port: `<rect x="7" y="7" width="6" height="6" ${s} fill="#fff"/>`,
      collaborationuse: `<ellipse cx="10" cy="10" rx="7" ry="5" ${s} fill="#f7f5ff" stroke-dasharray="2.5 2"/><line x1="6" y1="10" x2="14" y2="10" ${s}/>`,
      csconnector: `<line x1="3" y1="16" x2="17" y2="4" ${s}/>`,
      rolebinding: `<line x1="3" y1="16" x2="17" y2="4" ${s} stroke-dasharray="2.5 2"/>`,
      timingstate: `<rect x="2" y="4" width="16" height="12" ${s} fill="#fff"/><line x1="7" y1="4" x2="7" y2="16" ${s}/><line x1="2" y1="10" x2="18" y2="10" ${s}/>`,
      timesegment: `<line x1="3" y1="10" x2="17" y2="10" stroke="#ad6b3d" stroke-width="3"/><line x1="3" y1="6" x2="3" y2="14" ${s}/><line x1="17" y1="6" x2="17" y2="14" ${s}/>`,
      timetick: `<line x1="10" y1="3" x2="10" y2="17" ${s} stroke-dasharray="2 2"/><line x1="7" y1="15" x2="13" y2="15" ${s}/>`,
      timeconstraint: `<path d="M4 15 L4 6 L16 6 L16 15 M10 15 L10 18" ${s}/>`,
      durationconstraint: `<line x1="3" y1="10" x2="17" y2="10" ${s}/><line x1="3" y1="5" x2="3" y2="15" ${s}/><line x1="17" y1="5" x2="17" y2="15" ${s}/>`,
      timingmessage: `<line x1="3" y1="15" x2="15" y2="5" ${s}/><path d="M10 4 L17 4 L15 10 Z" fill="#4a4e57" class="ic-stroke" stroke="none"/>`,
      select: `<path d="M5 3 L5 15 L8.5 11.5 L11 16 L13 15 L10.5 10.5 L15 10 Z" fill="#4a4e57" stroke="none" class="ic-stroke"/>`,
      class: `<rect x="3" y="3" width="14" height="14" ${s} fill="#fffbd8"/><line x1="3" y1="8" x2="17" y2="8" ${s}/><line x1="3" y1="12" x2="17" y2="12" ${s}/>`,
      interface: `<circle cx="10" cy="8" r="4.5" ${s} fill="#fffbd8"/><line x1="10" y1="12.5" x2="10" y2="17" ${s}/>`,
      enumeration: `<rect x="3" y="3" width="14" height="14" ${s} fill="#fffbd8"/><line x1="3" y1="8" x2="17" y2="8" ${s}/><line x1="5" y1="11" x2="10" y2="11" ${s}/><line x1="5" y1="14" x2="10" y2="14" ${s}/>`,
      package: `<path d="M3 6 L3 4 L9 4 L9 6 M3 6 L17 6 L17 16 L3 16 Z" ${s} fill="#fffbd8"/>`,
      model: `<path d="M3 6 L3 4 L9 4 L9 6 M3 6 L17 6 L17 16 L3 16 Z" ${s} fill="#fff5d6"/><path d="M11 9 L15 11 L11 13 Z" ${s} fill="#fff"/>`,
      subsystem: `<rect x="3" y="4" width="14" height="12" ${s} fill="#fff9e8"/><rect x="2" y="7" width="5" height="3" ${s} fill="#fff"/><rect x="2" y="12" width="5" height="3" ${s} fill="#fff"/>`,
      metaclass: `<rect x="3" y="3" width="14" height="14" ${s} fill="#f5effa"/><text x="10" y="8" text-anchor="middle" font-size="4" fill="#4a4e57">meta</text><line x1="3" y1="10" x2="17" y2="10" ${s}/>`,
      stereotype: `<rect x="3" y="3" width="14" height="14" ${s} fill="#f8f1fc"/><text x="10" y="8" text-anchor="middle" font-size="4" fill="#4a4e57">stereo</text><line x1="3" y1="10" x2="17" y2="10" ${s}/>`,
      note: `<path d="M4 3 L13 3 L16 6 L16 17 L4 17 Z" ${s} fill="#fffbd8"/><path d="M13 3 L13 6 L16 6" ${s}/>`,
      actor: `<circle cx="10" cy="5" r="2.5" ${s}/><path d="M10 7.5 L10 12 M5.5 9.5 L14.5 9.5 M10 12 L6.5 17 M10 12 L13.5 17" ${s}/>`,
      usecase: `<ellipse cx="10" cy="10" rx="7.5" ry="5" ${s} fill="#fffbd8"/>`,
      boundary: `<rect x="3" y="3" width="14" height="14" ${s}/><line x1="3" y1="7" x2="17" y2="7" ${s}/>`,
      action: `<rect x="3" y="5" width="14" height="10" rx="4.5" ${s} fill="#fffbd8"/>`,
      sendsignal: `<path d="M3 5 L14 5 L18 10 L14 15 L3 15 Z" ${s} fill="#fffbd8"/>`,
      acceptsignal: `<path d="M3 5 L17 5 L17 15 L3 15 L7 10 Z" ${s} fill="#fffbd8"/>`,
      timeevent: `<path d="M3 5 L17 5 L17 15 L3 15 L7 10 Z" ${s} fill="#fffbd8"/><circle cx="11.5" cy="10" r="3" ${s}/><path d="M11.5 10 L11.5 8 M11.5 10 L13 11" ${s}/>`,
      initial: `<circle cx="10" cy="10" r="5" fill="#4a4e57" class="ic-stroke" stroke="none"/>`,
      final: `<circle cx="10" cy="10" r="6" ${s}/><circle cx="10" cy="10" r="3" fill="#4a4e57" class="ic-stroke" stroke="none"/>`,
      flowfinal: `<circle cx="10" cy="10" r="6" ${s}/><path d="M6 6 L14 14 M14 6 L6 14" ${s}/>`,
      decision: `<path d="M10 3 L17 10 L10 17 L3 10 Z" ${s} fill="#fffbd8"/>`,
      merge: `<path d="M10 3 L17 10 L10 17 L3 10 Z" ${s} fill="#fffbd8"/>`,
      forkbar: `<rect x="3" y="8" width="14" height="4" rx="1" fill="#4a4e57" class="ic-stroke" stroke="none"/>`,
      joinbar: `<rect x="3" y="8" width="14" height="4" rx="1" fill="#4a4e57" class="ic-stroke" stroke="none"/>`,
      swimlanev: `<rect x="3" y="2" width="14" height="16" ${s}/><line x1="3" y1="6" x2="17" y2="6" ${s}/>`,
      swimlaneh: `<rect x="2" y="3" width="16" height="14" ${s}/><line x1="6" y1="3" x2="6" y2="17" ${s}/>`,
      interruptibleregion: `<rect x="2" y="3" width="16" height="14" rx="2" ${s} stroke-dasharray="2 2"/>`,
      structuredactivity: `<rect x="2" y="3" width="16" height="14" rx="3" ${s} fill="#fffbd8"/><line x1="2" y1="7" x2="18" y2="7" ${s}/>`,
      inputpin: `<rect x="6" y="6" width="8" height="8" ${s} fill="#fff"/>`,
      outputpin: `<rect x="6" y="6" width="8" height="8" ${s} fill="#f2c8b9"/>`,
      objectnode: `<rect x="3" y="5" width="14" height="10" ${s} fill="#fffbd8"/><line x1="6" y1="12" x2="14" y2="12" ${s}/>`,
      centralbuffer: `<rect x="3" y="4" width="14" height="12" ${s} fill="#fffbd8"/><text x="10" y="12.5" text-anchor="middle" font-size="6" fill="#4a4e57">CB</text>`,
      activitydatastore: `<path d="M4 5 C4 2 16 2 16 5 L16 15 C16 18 4 18 4 15 Z" ${s} fill="#fffbd8"/><path d="M4 5 C4 8 16 8 16 5" ${s}/>`,
      activityparameter: `<rect x="3" y="6" width="14" height="8" ${s} fill="#fffbd8"/>`,
      expansionregion: `<rect x="2" y="3" width="16" height="14" rx="2" ${s} stroke-dasharray="2 2"/><line x1="5" y1="3" x2="5" y2="7" ${s}/><line x1="8" y1="3" x2="8" y2="7" ${s}/>`,
      expansioninput: `<rect x="5" y="6" width="10" height="8" ${s} fill="#fff"/><line x1="8" y1="7" x2="8" y2="13" ${s}/><line x1="11" y1="7" x2="11" y2="13" ${s}/>`,
      expansionoutput: `<rect x="5" y="6" width="10" height="8" ${s} fill="#f2c8b9"/><line x1="8" y1="7" x2="8" y2="13" ${s}/><line x1="11" y1="7" x2="11" y2="13" ${s}/>`,
      lifeline: `<rect x="4" y="3" width="12" height="6" ${s} fill="#fffbd8"/><line x1="10" y1="9" x2="10" y2="17" ${s} stroke-dasharray="2.5 2"/>`,
      seqactor: `<circle cx="10" cy="4" r="2" ${s}/><path d="M10 6 L10 10 M6.5 7.5 L13.5 7.5 M10 10 L7.5 13" ${s}/><line x1="10" y1="13" x2="10" y2="18" ${s} stroke-dasharray="2.5 2"/>`,
      execution: `<line x1="10" y1="2" x2="10" y2="18" ${s} stroke-dasharray="2.5 2"/><rect x="7.5" y="5" width="5" height="10" ${s} fill="#fffbd8"/>`,
      frame: `<path d="M3 3 L9 3 L9 6 L7 7.5 L3 7.5 Z" ${s} fill="#f3f3ea"/><rect x="3" y="3" width="14" height="14" ${s}/>`,
      interactionuse: `<rect x="3" y="4" width="14" height="12" ${s} fill="#fffbd8"/><path d="M3 4 L8 4 L8 7 L6.5 8.5 L3 8.5 Z" ${s} fill="#f3f3ea"/>`,
      interactioninline: `<rect x="2" y="3" width="16" height="14" ${s} fill="#fff"/><path d="M2 3 L10 3 L10 6 L8 8 L2 8 Z" ${s} fill="#eef4fb"/><line x1="6" y1="10" x2="6" y2="16" ${s} stroke-dasharray="2 2"/><line x1="14" y1="10" x2="14" y2="16" ${s} stroke-dasharray="2 2"/>`,
      informationitem: `<rect x="3" y="3" width="14" height="14" ${s} fill="#eef8f8"/><text x="10" y="8" text-anchor="middle" font-size="4" fill="#397d8c">info</text><line x1="3" y1="10" x2="17" y2="10" ${s}/>`,
      requirement: `<rect x="3" y="3" width="14" height="14" ${s} fill="#edf4fa"/><text x="10" y="8" text-anchor="middle" font-size="4.5" fill="#4f6f8f">req</text><line x1="3" y1="10" x2="17" y2="10" ${s}/>`,
      block: `<rect x="3" y="3" width="14" height="14" ${s} fill="#edf4f7"/><text x="10" y="8" text-anchor="middle" font-size="4.5" fill="#516f86">blk</text><line x1="3" y1="10" x2="17" y2="10" ${s}/>`,
      valuetype: `<rect x="3" y="3" width="14" height="14" ${s} fill="#edf4f7"/><text x="10" y="8" text-anchor="middle" font-size="4" fill="#516f86">value</text><line x1="3" y1="10" x2="17" y2="10" ${s}/>`,
      interfaceblock: `<rect x="3" y="3" width="14" height="14" ${s} fill="#edf4f7"/><text x="10" y="8" text-anchor="middle" font-size="4" fill="#516f86">Iblk</text><line x1="3" y1="10" x2="17" y2="10" ${s}/>`,
      constraintblock: `<rect x="3" y="3" width="14" height="14" ${s} fill="#edf4f7"/><text x="10" y="8" text-anchor="middle" font-size="3.6" fill="#516f86">Cblk</text><line x1="3" y1="10" x2="17" y2="10" ${s}/>`,
      stateinvariant: `<rect x="3" y="7" width="14" height="6" rx="3" ${s} fill="#fffef2"/>`,
      continuation: `<rect x="3" y="6" width="14" height="8" rx="4" ${s} fill="#fffbd8"/>`,
      fragment: `<rect x="3" y="3" width="14" height="14" ${s}/><path d="M3 3 L10 3 L10 6.5 L8 8.5 L3 8.5 Z" ${s} fill="#f3f3ea"/>`,
      'msg-sync': `<line x1="3" y1="10" x2="13" y2="10" ${s}/><path d="M12 6 L17 10 L12 14 Z" fill="#4a4e57" class="ic-stroke" stroke="none"/>`,
      'msg-async': `<line x1="3" y1="10" x2="16" y2="10" ${s}/><path d="M11.5 6 L16.5 10 L11.5 14" ${s}/>`,
      'msg-reply': `<line x1="17" y1="10" x2="4" y2="10" ${s} stroke-dasharray="2.5 2"/><path d="M8.5 6 L3.5 10 L8.5 14" ${s}/>`,
      'msg-create': `<line x1="3" y1="10" x2="11" y2="10" ${s} stroke-dasharray="2.5 2"/><rect x="12" y="7" width="6" height="6" ${s} fill="#fffbd8"/>`,
      'msg-destroy': `<line x1="3" y1="10" x2="11" y2="10" ${s}/><path d="M12.5 7 L17.5 13 M12.5 13 L17.5 7" ${s} stroke-width="1.6"/>`,
      component: `<rect x="5" y="3" width="12" height="14" ${s} fill="#fffbd8"/><rect x="2.5" y="6" width="6" height="3" ${s} fill="#fff"/><rect x="2.5" y="11" width="6" height="3" ${s} fill="#fff"/>`,
      interfaceball: `<circle cx="8" cy="8" r="4" ${s} fill="#fff"/><line x1="8" y1="12" x2="8" y2="17" ${s}/>`,
      artifact: `<path d="M5 3 L13 3 L15.5 5.5 L15.5 17 L5 17 Z" ${s} fill="#fffbd8"/><path d="M13 3 L13 5.5 L15.5 5.5" ${s}/>`,
      node: `<path d="M3 6 L6 3 L17 3 L17 14 L14 17 L3 17 Z" ${s} fill="#fffbd8"/><path d="M3 6 L14 6 L14 17 M14 6 L17 3" ${s}/>`,
      association: `<line x1="3" y1="16" x2="17" y2="4" ${s}/>`,
      directed: `<line x1="3" y1="16" x2="16" y2="5" ${s}/><path d="M10.5 5 L16 5 L16 10.5" ${s}/>`,
      generalization: `<line x1="3" y1="17" x2="12" y2="8" ${s}/><path d="M11 4 L16 4 L16 9 Z" ${s} fill="#fff"/>`,
      realization: `<line x1="3" y1="17" x2="12" y2="8" ${s} stroke-dasharray="2.5 2"/><path d="M11 4 L16 4 L16 9 Z" ${s} fill="#fff"/>`,
      dependency: `<line x1="3" y1="16" x2="16" y2="5" ${s} stroke-dasharray="2.5 2"/><path d="M10.5 5 L16 5 L16 10.5" ${s}/>`,
      aggregation: `<line x1="3" y1="17" x2="10" y2="10" ${s}/><path d="M10 10 L13.5 6.5 L17 10 L13.5 13.5 Z" ${s} fill="#fff"/>`,
      composition: `<line x1="3" y1="17" x2="10" y2="10" ${s}/><path d="M10 10 L13.5 6.5 L17 10 L13.5 13.5 Z" fill="#4a4e57" class="ic-stroke" stroke="#4a4e57"/>`,
      containment: `<line x1="3" y1="16" x2="12" y2="7" ${s}/><circle cx="14" cy="5" r="3.5" ${s} fill="#fff"/><path d="M14 3 L14 7 M12 5 L16 5" ${s}/>`,
      extension: `<line x1="3" y1="16" x2="12" y2="7" ${s}/><path d="M10 4 L16 4 L16 10 Z" fill="#4a4e57" class="ic-stroke" stroke="none"/>`,
      informationflow: `<line x1="3" y1="16" x2="16" y2="5" ${s} stroke-dasharray="2.5 2"/><path d="M10.5 5 L16 5 L16 10.5" ${s}/><text x="7" y="9" text-anchor="middle" font-size="4" fill="#397d8c">flow</text>`,
      reqcontainment: `<line x1="3" y1="16" x2="12" y2="7" ${s}/><circle cx="14" cy="5" r="3.5" ${s} fill="#fff"/><path d="M14 3 L14 7 M12 5 L16 5" ${s}/>`,
      reqcopy: `<line x1="3" y1="16" x2="16" y2="5" ${s} stroke-dasharray="2.5 2"/><path d="M10.5 5 L16 5 L16 10.5" ${s}/><text x="7" y="9" text-anchor="middle" font-size="4" fill="#4f6f8f">C</text>`,
      derivereqt: `<line x1="3" y1="16" x2="16" y2="5" ${s} stroke-dasharray="2.5 2"/><path d="M10.5 5 L16 5 L16 10.5" ${s}/><text x="7" y="9" text-anchor="middle" font-size="4" fill="#4f6f8f">D</text>`,
      verify: `<line x1="3" y1="16" x2="16" y2="5" ${s} stroke-dasharray="2.5 2"/><path d="M10.5 5 L16 5 L16 10.5" ${s}/><text x="7" y="9" text-anchor="middle" font-size="4" fill="#4f6f8f">V</text>`,
      satisfy: `<line x1="3" y1="16" x2="16" y2="5" ${s} stroke-dasharray="2.5 2"/><path d="M10.5 5 L16 5 L16 10.5" ${s}/><text x="7" y="9" text-anchor="middle" font-size="4" fill="#4f6f8f">S</text>`,
      refine: `<line x1="3" y1="16" x2="16" y2="5" ${s} stroke-dasharray="2.5 2"/><path d="M10.5 5 L16 5 L16 10.5" ${s}/><text x="7" y="9" text-anchor="middle" font-size="4" fill="#4f6f8f">R</text>`,
      trace: `<line x1="3" y1="16" x2="16" y2="5" ${s} stroke-dasharray="2.5 2"/><path d="M10.5 5 L16 5 L16 10.5" ${s}/><text x="7" y="9" text-anchor="middle" font-size="4" fill="#4f6f8f">T</text>`,
      notelink: `<line x1="3" y1="16" x2="17" y2="4" ${s} stroke-dasharray="2.5 2"/>`,
      entity: `<rect x="3" y="3" width="14" height="14" ${s} fill="#fffbd8"/><line x1="3" y1="8" x2="17" y2="8" ${s}/><circle cx="6" cy="11.5" r="1.2" fill="#4a4e57" stroke="none" class="ic-stroke"/><line x1="9" y1="11.5" x2="15" y2="11.5" ${s}/><line x1="5" y1="14.5" x2="15" y2="14.5" ${s}/>`,
      'erd-11': `<line x1="3" y1="10" x2="17" y2="10" ${s}/><line x1="6" y1="6.5" x2="6" y2="13.5" ${s}/><line x1="14" y1="6.5" x2="14" y2="13.5" ${s}/>`,
      'erd-1n': `<line x1="3" y1="10" x2="17" y2="10" ${s}/><line x1="6" y1="6.5" x2="6" y2="13.5" ${s}/><path d="M13 10 L17 6 M13 10 L17 10 M13 10 L17 14" ${s}/>`,
      'erd-nm': `<line x1="3" y1="10" x2="17" y2="10" ${s}/><path d="M7 10 L3 6 M7 10 L3 10 M7 10 L3 14" ${s}/><path d="M13 10 L17 6 M13 10 L17 10 M13 10 L17 14" ${s}/>`,
      process: `<circle cx="10" cy="10" r="7" ${s} fill="#fffbd8"/>`,
      external: `<rect x="3.5" y="4.5" width="13" height="11" ${s} fill="#fffbd8"/>`,
      datastore: `<path d="M17 5.5 L3 5.5 L3 14.5 L17 14.5" ${s}/>`,
      dataflow: `<line x1="3" y1="16" x2="16" y2="5" ${s}/><path d="M10.5 5 L16 5 L16 10.5" ${s}/>`,
      mindnode: `<rect x="3" y="6" width="14" height="8" rx="4" ${s} fill="#fffbd8"/>`,
      mindbranch: `<path d="M3 15 Q 10 13 17 5" ${s}/>`,
      include: `<line x1="3" y1="16" x2="16" y2="5" ${s} stroke-dasharray="2.5 2"/><path d="M10.5 5 L16 5 L16 10.5" ${s}/>`,
      extend: `<line x1="16" y1="16" x2="4" y2="5" ${s} stroke-dasharray="2.5 2"/><path d="M4 10.5 L4 5 L9.5 5" ${s}/>`,
      controlflow: `<line x1="3" y1="16" x2="16" y2="5" ${s}/><path d="M10.5 5 L16 5 L16 10.5" ${s}/>`,
      objectflow: `<line x1="3" y1="16" x2="16" y2="5" ${s}/><path d="M10.5 5 L16 5 L16 10.5" ${s}/><circle cx="5" cy="14" r="1.5" ${s} fill="#fff"/>`,
      exceptionhandler: `<line x1="3" y1="16" x2="16" y2="5" ${s} stroke-dasharray="2.5 2"/><path d="M10.5 5 L16 5 L16 10.5" ${s}/>`,
      activityinterrupt: `<path d="M3 16 L8 11 L6 9 L16 4" ${s}/><path d="M10.5 4 L16 4 L16 9.5" ${s}/>`,
      connector: `<line x1="3" y1="10" x2="8" y2="10" ${s}/><circle cx="11.5" cy="10" r="3" ${s} fill="#fff"/><line x1="14.5" y1="10" x2="17" y2="10" ${s}/>`,
      bindingconnector: `<line x1="3" y1="10" x2="17" y2="10" ${s}/><circle cx="10" cy="10" r="1.8" ${s} fill="#fff"/>`,
      commpath: `<line x1="3" y1="14" x2="17" y2="6" ${s}/>`,
      deploy: `<line x1="3" y1="16" x2="16" y2="5" ${s} stroke-dasharray="2.5 2"/><path d="M10.5 5 L16 5 L16 10.5" ${s}/>`,
    };
    return `<svg width="20" height="20" viewBox="0 0 20 20" aria-hidden="true" focusable="false">${icons[id] || ''}</svg>`;
  }

  interface ToolboxDependencies {
    clearLinking(): void;
    dg(): { type: string };
    diagramKindLabel(kind: string): string;
    renderCanvas(): void;
    document: Document;
    state: { tool: string };
    toolbox: HTMLElement;
    DIAGRAM_TOOLS: Record<string, { elements: string[]; relations: string[]; hiddenElements?: string[] }>;
  }

  function create(deps: Partial<ToolboxDependencies> = {}) {
    REQUIRED_FUNCTIONS.forEach(name => {
      if (typeof deps[name] !== 'function') throw new Error(`UMLToolbox requires ${name}()`);
    });
    REQUIRED_VALUES.forEach(name => {
      if (deps[name] == null) throw new Error(`UMLToolbox requires ${name}`);
    });

    const { clearLinking, dg, diagramKindLabel, renderCanvas, document, state, toolbox, DIAGRAM_TOOLS } = deps as ToolboxDependencies;

    function render() {
      toolbox.innerHTML = '';
      const tools = DIAGRAM_TOOLS[dg().type];
      const groups = [
        { title: uiLabel('Tools', '도구'), items: ['select'] },
        { title: uiLabel('Elements', '요소'), items: tools.elements.filter(id => !(tools.hiddenElements || []).includes(id)) },
        { title: uiLabel('Relationships', '관계'), items: tools.relations },
      ];
      groups.forEach(group => {
        const title = document.createElement('div');
        title.className = 'tb-group';
        title.textContent = group.title;
        toolbox.appendChild(title);
        group.items.forEach(id => {
          const label = id === 'select' ? uiLabel('Select', '선택') : diagramKindLabel(id);
          const tool = document.createElement('button');
          tool.type = 'button';
          tool.className = 'tb-tool' + (state.tool === id ? ' active' : '');
          tool.dataset.toolId = id;
          tool.setAttribute('aria-pressed', String(state.tool === id));
          tool.setAttribute('aria-label', uiText('{0} tool', '{0} 도구', label));
          tool.innerHTML = toolIcon(id) + `<span>${label}</span>`;
          tool.addEventListener('click', () => {
            clearLinking();
            state.tool = id;
            [...toolbox.children].filter(node => node.classList?.contains('tb-tool')).forEach(node => {
              const active = (node as HTMLElement).dataset.toolId === id;
              node.classList.toggle('active', active);
              node.setAttribute('aria-pressed', String(active));
            });
            renderCanvas();
          });
          toolbox.appendChild(tool);
        });
      });
    }

    return Object.freeze({ render, toolIcon });
  }

  return Object.freeze({ REQUIRED_FUNCTIONS, REQUIRED_VALUES, create, toolIcon });
}
