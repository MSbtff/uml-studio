'use strict';

type DiagramExportApi = ReturnType<typeof createDiagramExportModule>;
declare var UMLDiagramExport: DiagramExportApi;

(function initDiagramExport(root: typeof globalThis & { UMLDiagramExport?: DiagramExportApi }, factory: () => DiagramExportApi) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root) root.UMLDiagramExport = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, createDiagramExportModule);

function createDiagramExportModule() {
  const { label: uiLabel, text: uiText } = globalThis.UMLLanguage
    ?? require('../editor/language.js') as typeof UMLLanguage;

  const REQUIRED_FUNCTIONS = Object.freeze([
    'contentBBox',
    'dg',
    'flashStatus',
    'projectActionButton',
    'projectModal',
    'renderAll',
    'renderCanvas',
    'setSelection',
    'setTimeout',
  ] as const);
  const REQUIRED_VALUES = Object.freeze([
    'document',
    'exporters',
    'state',
    'svg',
    'Image',
    'SVGNS',
    'URL',
    'XMLSerializer',
    'alert',
    'btoa',
  ] as const);

  interface ExportDiagram {
    id: string;
    type: string;
    name: string;
    elements: { kind?: string; modelId: string }[];
  }
  type ExportModels = Record<string, { kind?: string }>;
  interface ExportDependencies {
    contentBBox(): DiagramBounds | null | undefined;
    dg(): ExportDiagram;
    flashStatus(message: string): void;
    projectActionButton(label: string, action: () => void): HTMLElement;
    projectModal(title: string, id: string): {
      overlay: HTMLElement;
      dialog: HTMLElement;
      modal: { close(): void; focusInitial(target: Element | undefined): void };
    };
    renderAll(): void;
    renderCanvas(): void;
    setSelection(ids: string[]): void;
    setTimeout(callback: () => void, delay: number): number;
    document: Document;
    exporters: {
      ERD_DDL_DIALECTS: Partial<Record<string, { id: string; label: string; fileTag: string }>>;
      exportMermaid(diagram: ExportDiagram, models: ExportModels, onOmittedMarkers?: (count: number) => void): string;
      exportDrawio(diagram: ExportDiagram, models: ExportModels): string;
      exportErdDdl(diagram: ExportDiagram, models: ExportModels, dialectId: string): string;
    };
    state: { models: ExportModels; diagrams: ExportDiagram[]; activeId: string; selection: string[]; zoom: number };
    svg: SVGSVGElement;
    Image: typeof Image;
    SVGNS: string;
    URL: Pick<typeof URL, 'createObjectURL' | 'revokeObjectURL'>;
    XMLSerializer: typeof XMLSerializer;
    alert(message: string): void;
    btoa(value: string): string;
  }

  function create(dependencies?: ExportDependencies) {
    const deps: Partial<ExportDependencies> = dependencies || {};
    const missing: string[] = REQUIRED_FUNCTIONS.filter(name => typeof deps[name] !== 'function');
    REQUIRED_VALUES.forEach(name => {
      if (deps[name] == null) missing.push(name);
    });
    if (deps.document && typeof deps.document.createElement !== 'function') {
      missing.push('document.createElement');
    }
    (['exportMermaid', 'exportDrawio', 'exportErdDdl'] as const).forEach(name => {
      if (deps.exporters && typeof deps.exporters[name] !== 'function') missing.push(`exporters.${name}`);
    });
    if (deps.exporters && !deps.exporters.ERD_DDL_DIALECTS) missing.push('exporters.ERD_DDL_DIALECTS');
    if (missing.length) {
      throw new TypeError(`다이어그램 내보내기 의존성이 없습니다: ${[...new Set(missing)].join(', ')}`);
    }

    const {
      contentBBox,
      dg,
      flashStatus,
      projectActionButton,
      projectModal,
      renderAll,
      renderCanvas,
      setSelection,
      setTimeout,
      document,
      exporters,
      state,
      svg,
      Image,
      SVGNS,
      URL,
      XMLSerializer,
      alert,
      btoa,
    } = deps as ExportDependencies;

    function download(filename: string, blob: Blob) {
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = filename;
      a.click();
      setTimeout(() => URL.revokeObjectURL(a.href), 5000);
    }

    function exportSvg() {
      const bbox = contentBBox();
      if (!bbox) return null;
      const prevSel = state.selection, prevZoom = state.zoom;
      setSelection([]); state.zoom = 1;
      renderCanvas();
      const clone = svg.cloneNode(true) as SVGSVGElement;
      clone.querySelectorAll('rect[fill="url(#grid)"]').forEach(r => r.remove());
      clone.querySelectorAll('[data-operand-divider]').forEach(handle => handle.remove());
      clone.setAttribute('xmlns', SVGNS);
      clone.setAttribute('viewBox', `${bbox.x} ${bbox.y} ${bbox.w} ${bbox.h}`);
      clone.setAttribute('width', String(bbox.w));
      clone.setAttribute('height', String(bbox.h));
      const data = new XMLSerializer().serializeToString(clone);
      setSelection(prevSel); state.zoom = prevZoom;
      renderCanvas();
      return { data, w: bbox.w, h: bbox.h };
    }

    const exportName = (d: Pick<ExportDiagram, 'name'>) => d.name.replace(/\s+/g, '-').toLowerCase();

    function exportPngActive() {
      return new Promise<boolean>((resolve, reject) => {
        const out = exportSvg();
        if (!out) { resolve(false); return; }
        const img = new Image();
        img.onload = () => {
          const c = document.createElement('canvas');
          c.width = out.w * 2; c.height = out.h * 2;
          const ctx = c.getContext('2d');
          if (!ctx) { resolve(false); return; }
          ctx.fillStyle = '#ffffff';
          ctx.fillRect(0, 0, c.width, c.height);
          ctx.drawImage(img, 0, 0, c.width, c.height);
          c.toBlob(blob => {
            if (blob) download(exportName(dg()) + '.png', blob);
            resolve(!!blob);
          }, 'image/png');
        };
        img.onerror = reject;
        img.src = 'data:image/svg+xml;base64,' + btoa(unescape(encodeURIComponent(out.data)));
      });
    }

    function exportSvgFile() {
      const out = exportSvg();
      if (!out) { alert(uiText('There are no elements to export.', '내보낼 요소가 없습니다.')); return false; }
      download(exportName(dg()) + '.svg', new Blob([out.data], { type: 'image/svg+xml' }));
      return true;
    }

    function exportPngFile() {
      if (!dg().elements.length) { alert(uiText('There are no elements to export.', '내보낼 요소가 없습니다.')); return false; }
      exportPngActive();
      return true;
    }

    function exportMermaidFile() {
      const diagram = dg();
      if (!diagram.elements.length) { alert(uiText('There are no elements to export.', '내보낼 요소가 없습니다.')); return false; }
      let omittedMarkers = 0;
      const source = exporters.exportMermaid(diagram, state.models, count => { omittedMarkers += count; });
      download(exportName(diagram) + '.mmd', new Blob([source], { type: 'text/plain;charset=utf-8' }));
      if (omittedMarkers > 0) {
        flashStatus(uiText(
          'Mermaid export omitted {0} communication path marker{1}. See the file comments.',
          'Mermaid 내보내기에서 통신 경로 끝점 기호 {0}개가 생략됐습니다. 파일 주석을 확인하세요.',
          omittedMarkers, omittedMarkers === 1 ? '' : 's',
        ));
      } else {
        const nativeTypes = new Set(['class', 'sequence', 'state', 'requirement', 'bdd']);
        flashStatus(nativeTypes.has(diagram.type)
          ? uiText('Exported using Mermaid diagram syntax.', 'Mermaid 전용 다이어그램 문법으로 내보냈습니다')
          : uiText('Exported using Mermaid flowchart syntax.', 'Mermaid flowchart 문법으로 내보냈습니다'));
      }
      return true;
    }

    function exportDrawioFile() {
      if (dg().type === 'c4context' || dg().type === 'c4container') {
        flashStatus(uiText('Export C4 diagrams as SVG or save the project as JSON.', 'C4 다이어그램은 SVG로 내보내거나 프로젝트 JSON으로 저장하세요'));
        return false;
      }
      if (!dg().elements.length) { alert(uiText('There are no elements to export.', '내보낼 요소가 없습니다.')); return false; }
      const source = exporters.exportDrawio(dg(), state.models);
      download(exportName(dg()) + '.drawio', new Blob([source], { type: 'application/xml;charset=utf-8' }));
      flashStatus(uiText('Exported editable draw.io XML.', 'draw.io에서 편집 가능한 XML로 내보냈습니다'));
      return true;
    }

    function exportErdDdlFile(dialectId: string) {
      const diagram = dg();
      if (diagram.type !== 'erd') {
        alert(uiText('DDL export is available for ER diagrams.', 'ER Diagram에서만 DDL을 내보낼 수 있습니다.'));
        return false;
      }
      const dialect = exporters.ERD_DDL_DIALECTS[dialectId];
      if (!dialect) {
        alert(uiText('Unsupported DDL dialect: {0}', '지원하지 않는 DDL 방언입니다: {0}', dialectId));
        return false;
      }
      try {
        const source = exporters.exportErdDdl(diagram, state.models, dialectId);
        download(`${exportName(diagram)}.${dialect.fileTag}.sql`, new Blob([source], { type: 'text/sql;charset=utf-8' }));
        flashStatus(uiText('Exported {0} CREATE TABLE DDL.', '{0} CREATE TABLE DDL로 내보냈습니다', dialect.label));
        return true;
      } catch (error) {
        alert(uiText('Could not export DDL: {0}', 'DDL을 내보낼 수 없습니다: {0}', error instanceof Error ? error.message : String(error)));
        return false;
      }
    }

    function openErdDdlExportDialog() {
      const diagram = dg();
      if (diagram.type !== 'erd') {
        alert(uiText('DDL export is available for ER diagrams.', 'ER Diagram에서만 DDL을 내보낼 수 있습니다.'));
        return false;
      }
      const hasEntity = diagram.elements.some(element =>
        (element.kind || state.models[element.modelId]?.kind) === 'entity');
      if (!hasEntity) {
        alert(uiText('No entities to export as DDL.', 'DDL로 내보낼 Entity가 없습니다.'));
        return false;
      }
      const { overlay, dialog, modal } = projectModal(uiLabel('Export ERD DDL', 'ERD DDL 내보내기'), 'erd-ddl-export-modal');
      dialog.classList.add('erd-ddl-export-dialog');
      dialog.setAttribute('role', 'dialog');
      dialog.setAttribute('aria-modal', 'true');
      const body = document.createElement('div');
      body.className = 'erd-ddl-export-body';
      const intro = document.createElement('p');
      intro.textContent = uiText(
        'Choose a target database. CREATE TABLE statements use each entity\'s physical name and column definitions.',
        '대상 데이터베이스를 선택하세요. Entity의 물리명과 컬럼 정의로 CREATE TABLE 문을 생성합니다.',
      );
      const choices = document.createElement('div');
      choices.className = 'erd-ddl-dialect-choices';
      Object.values(exporters.ERD_DDL_DIALECTS).forEach(dialect => {
        if (!dialect) return;
        const button = projectActionButton(dialect.label, () => {
          modal.close();
          exportErdDdlFile(dialect.id);
        });
        button.classList.add('erd-ddl-dialect-button');
        button.dataset.dialect = dialect.id;
        choices.appendChild(button);
      });
      const note = document.createElement('p');
      note.className = 'erd-ddl-export-note';
      note.textContent = uiText(
        'Foreign-key flags with no linked target column appear as comments.',
        'FK 대상 컬럼이 아직 연결되지 않은 FK 플래그는 주석으로 표시하며 제약조건으로 추측하지 않습니다.',
      );
      body.append(intro, choices, note);
      dialog.appendChild(body);
      modal.focusInitial(choices.children[0]);
      return overlay;
    }

    async function exportAllPngFiles() {
      const prev = state.activeId;
      for (const d of state.diagrams) {
        if (!d.elements.length) continue;
        state.activeId = d.id;
        await exportPngActive();
      }
      state.activeId = prev;
      renderAll();
    }

    return Object.freeze({
      download,
      exportAllPngFiles,
      exportPngActive,
      exportSvg,
      exportDrawioFile,
      exportErdDdlFile,
      exportMermaidFile,
      exportPngFile,
      exportSvgFile,
      openErdDdlExportDialog,
    });
  }

  return Object.freeze({ REQUIRED_FUNCTIONS, REQUIRED_VALUES, create });
}
