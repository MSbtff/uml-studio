'use strict';

/* Import preview dialogs — the draw.io and DDL confirmation sheets that show
   what a file will add before anything is written. They only read the parsed
   import and return the user's decision, so they touch no project state; the
   import module owns everything that happens after the decision. */
type ImportPreviewApi = ReturnType<typeof createImportPreviewModule>;
declare var UMLImportPreview: ImportPreviewApi;

(function initImportPreview(root: typeof globalThis & { UMLImportPreview?: ImportPreviewApi }, factory: () => ImportPreviewApi) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root) root.UMLImportPreview = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, createImportPreviewModule);

function createImportPreviewModule() {
  const REQUIRED_FUNCTIONS = Object.freeze([
    'projectActionButton',
    'projectModal',
  ] as const);
  const REQUIRED_VALUES = Object.freeze([
    'document',
    'drawioImporter',
    'DIAGRAM_META',
    'DRAWIO_IMPORT_POLICIES',
    'KIND_META',
  ] as const);

  interface PreviewOptions { filename?: string; append?: boolean }

  interface ImportPreviewDependencies {
    projectActionButton: (label: string, action: () => void) => HTMLButtonElement;
    projectModal: (title: string, id: string) => {
      dialog: HTMLElement;
      header: HTMLElement;
      modal: {
        close: () => void;
        setRequestCloseHandler: (handler: () => void) => void;
        focusInitial: (element: HTMLElement) => void;
      };
    };
    document: Document;
    drawioImporter: {
      filterImportConflicts: (conflicts: DrawioConflict[], policies: ReadonlyMap<string, DrawioPolicy>, query: string, filter: string) => DrawioConflict[];
      paginateImportConflicts: (conflicts: DrawioConflict[], page: number, pageSize: number) => {
        items: DrawioConflict[];
        page: number;
        pageCount: number;
        total: number;
        start: number;
        end: number;
      };
    };
    DIAGRAM_META: Partial<Record<string, { label: string }>>;
    DRAWIO_IMPORT_POLICIES: readonly (readonly [DrawioPolicy, string])[];
    KIND_META: Partial<Record<string, { label: string }>>;
  }

  function create(dependencies?: ImportPreviewDependencies) {
    const deps: Partial<ImportPreviewDependencies> = dependencies || {};
    const missing: string[] = REQUIRED_FUNCTIONS.filter(name => typeof deps[name] !== 'function');
    REQUIRED_VALUES.forEach(name => {
      if (deps[name] == null) missing.push(name);
    });
    if (deps.document && typeof deps.document.createElement !== 'function') {
      missing.push('document.createElement');
    }
    (['filterImportConflicts', 'paginateImportConflicts'] as const).forEach(name => {
      if (deps.drawioImporter && typeof deps.drawioImporter[name] !== 'function') {
        missing.push(`drawioImporter.${name}`);
      }
    });
    if (missing.length) {
      throw new TypeError(`가져오기 미리보기 의존성이 없습니다: ${[...new Set(missing)].join(', ')}`);
    }

    const {
      projectActionButton,
      projectModal,
      document,
      drawioImporter,
      DIAGRAM_META,
      DRAWIO_IMPORT_POLICIES,
      KIND_META,
    } = deps as ImportPreviewDependencies;

    function appendDrawioPolicyOptions(select: HTMLSelectElement, recommended = false) {
      DRAWIO_IMPORT_POLICIES.forEach(([value, text]) => {
        const option = document.createElement('option'); option.value = value;
        option.textContent = recommended && value === 'keepBoth' ? `${text} (권장)` : text;
        select.appendChild(option);
      });
    }

    function openDrawioImportPreview(_imported: object, analysis: DrawioImportAnalysis, options: PreviewOptions = {}) {
      const append = !!options.append;
      const { dialog, header, modal } = projectModal('draw.io Import Preview', 'drawio-import-preview-modal');
      dialog.classList.add('drawio-import-dialog');
      dialog.setAttribute('role', 'dialog');
      dialog.setAttribute('aria-modal', 'true');
      const title = header.querySelector('strong');
      if (title) {
        title.id = 'drawio-import-preview-title';
        dialog.setAttribute('aria-labelledby', title.id);
      }

      const body = document.createElement('div'); body.className = 'drawio-import-preview';
      const intro = document.createElement('div'); intro.className = 'drawio-import-intro';
      intro.textContent = `${options.filename || 'draw.io'} · ${append ? '현재 프로젝트에 다이어그램 추가' : '새 프로젝트로 열기'}`;
      body.appendChild(intro);

      const summary = document.createElement('div'); summary.className = 'drawio-import-summary';
      [
        ['다이어그램', analysis.diagrams], ['모델', analysis.models],
        ['요소 뷰', analysis.elementViews], ['관계 뷰', analysis.relationViews],
        ['호환 충돌', analysis.compatibleConflicts],
      ].forEach(([label, value]) => {
        const card = document.createElement('div'); card.className = 'drawio-import-stat';
        const count = document.createElement('strong'); count.textContent = String(value);
        const caption = document.createElement('span'); caption.textContent = String(label);
        card.append(count, caption); summary.appendChild(card);
      });
      body.appendChild(summary);

      const diagramSection = document.createElement('section'); diagramSection.className = 'drawio-import-section';
      const diagramTitle = document.createElement('h3'); diagramTitle.textContent = '가져올 다이어그램';
      const diagramList = document.createElement('div'); diagramList.className = 'drawio-diagram-list';
      analysis.diagramDetails.forEach(item => {
        const row = document.createElement('div'); row.className = 'drawio-diagram-row';
        const name = document.createElement('strong'); name.textContent = item.name;
        const meta = document.createElement('span');
        meta.textContent = `${DIAGRAM_META[item.type]?.label || item.type || 'Unknown'} · 요소 ${item.elements} · 관계 ${item.relations}`;
        row.append(name, meta);
        if (append && item.nameConflict) {
          const badge = document.createElement('em'); badge.textContent = '이름 자동 변경'; row.appendChild(badge);
        }
        diagramList.appendChild(row);
      });
      diagramSection.append(diagramTitle, diagramList); body.appendChild(diagramSection);

      const perModelPolicies = new Map<string, DrawioPolicy>();
      const conflictPolicySelects = new Map<string, HTMLSelectElement>();
      let syncPolicyControls = () => {};
      let confirmImportButton: HTMLButtonElement | null = null;
      let conflictPage = 0;
      let conflictSearchInput: HTMLInputElement | null = null;
      let conflictFilterSelect: HTMLSelectElement | null = null;
      let renderConflictRows = () => {};
      const filteredConflicts = () => drawioImporter.filterImportConflicts(
        analysis.conflicts,
        perModelPolicies,
        conflictSearchInput?.value || '',
        conflictFilterSelect?.value || 'all',
      );
      analysis.conflicts.filter(conflict => conflict.compatible).forEach(conflict => {
        perModelPolicies.set(conflict.importedModelId, 'keepBoth');
      });
      if (append) {
        const conflictSection = document.createElement('section'); conflictSection.className = 'drawio-import-section';
        const conflictTitle = document.createElement('h3');
        conflictTitle.textContent = `모델 충돌 ${analysis.conflicts.length}건`;
        conflictSection.appendChild(conflictTitle);
        if (analysis.conflicts.length) {
          const controls = document.createElement('div'); controls.className = 'drawio-conflict-controls';
          const searchInput = document.createElement('input');
          conflictSearchInput = searchInput;
          searchInput.id = 'drawio-conflict-search'; searchInput.type = 'search';
          searchInput.maxLength = 200; searchInput.placeholder = '모델명·종류·변경 필드 검색';
          searchInput.setAttribute('aria-label', 'draw.io 모델 충돌 검색');
          const filterSelect = document.createElement('select');
          conflictFilterSelect = filterSelect;
          filterSelect.id = 'drawio-conflict-filter'; filterSelect.setAttribute('aria-label', 'draw.io 모델 충돌 필터');
          [
            ['all', '전체 충돌'], ['compatible', '호환 가능'], ['changed', '변경 필드 있음'],
            ['exact', '원본 ID 일치'], ['semantic', '종류·이름 일치'], ['incompatible', '종류 불일치'],
            ['keepBoth', '새 모델 선택'], ['reuse', '기존 재사용 선택'], ['replace', '덮어쓰기 선택'],
          ].forEach(([value, text]) => {
            const option = document.createElement('option'); option.value = value; option.textContent = text;
            filterSelect.appendChild(option);
          });
          const resetFilters = document.createElement('button'); resetFilters.type = 'button';
          resetFilters.className = 'drawio-conflict-reset'; resetFilters.textContent = '필터 초기화';
          resetFilters.title = '검색어와 충돌 필터 초기화';
          const resultMeta = document.createElement('span'); resultMeta.className = 'drawio-conflict-result-meta';
          resultMeta.setAttribute('aria-live', 'polite');
          controls.append(searchInput, filterSelect, resetFilters, resultMeta); conflictSection.appendChild(controls);

          const tableWrap = document.createElement('div'); tableWrap.className = 'drawio-conflict-wrap';
          const table = document.createElement('table'); table.className = 'drawio-conflict-table';
          table.setAttribute('aria-label', `모델 충돌 ${analysis.conflicts.length}건`);
          const head = document.createElement('thead');
          const headRow = document.createElement('tr');
          ['가져올 모델', '기존 모델', '판정', '변경 필드', '처리'].forEach(label => {
            const cell = document.createElement('th'); cell.textContent = label;
            /* without a scope a screen reader cannot pair a cell with its header */
            cell.setAttribute('scope', 'col');
            headRow.appendChild(cell);
          });
          head.appendChild(headRow); table.appendChild(head);
          const tbody = document.createElement('tbody');
          table.appendChild(tbody); tableWrap.appendChild(table); conflictSection.appendChild(tableWrap);
          const pager = document.createElement('div'); pager.className = 'drawio-conflict-pager';
          pager.setAttribute('role', 'group');
          pager.setAttribute('aria-label', '모델 충돌 페이지 이동');
          const previous = document.createElement('button'); previous.type = 'button'; previous.textContent = '이전'; previous.title = '이전 충돌 페이지';
          const pageText = document.createElement('span'); pageText.setAttribute('aria-live', 'polite');
          const next = document.createElement('button'); next.type = 'button'; next.textContent = '다음'; next.title = '다음 충돌 페이지';
          pager.append(previous, pageText, next); conflictSection.appendChild(pager);

          renderConflictRows = () => {
            const page = drawioImporter.paginateImportConflicts(filteredConflicts(), conflictPage, 50);
            conflictPage = page.page;
            tbody.textContent = ''; conflictPolicySelects.clear();
            if (!page.items.length) {
              const row = document.createElement('tr'); const cell = document.createElement('td');
              cell.colSpan = 5; cell.className = 'drawio-conflict-empty'; cell.textContent = '검색 조건에 맞는 충돌이 없습니다.';
              row.appendChild(cell); tbody.appendChild(row);
            }
            page.items.forEach((conflict, index) => {
              const row = document.createElement('tr');
              const importedCell = document.createElement('td');
              importedCell.textContent = `${conflict.importedName || '(이름 없음)'} · ${KIND_META[conflict.importedKind]?.label || conflict.importedKind}`;
              const existingCell = document.createElement('td'); existingCell.textContent = conflict.matchName || conflict.matchModelId;
              const typeCell = document.createElement('td');
              typeCell.textContent = conflict.type === 'exact' ? '원본 ID 일치' : conflict.type === 'semantic' ? '종류·이름 일치' : '종류 불일치';
              if (!conflict.compatible) typeCell.className = 'drawio-conflict-danger';
              const fieldsCell = document.createElement('td');
              fieldsCell.textContent = conflict.changedFields.length ? conflict.changedFields.join(', ') : '변경 없음';
              const policyCell = document.createElement('td');
              if (conflict.compatible) {
                const rowSelect = document.createElement('select');
                rowSelect.className = 'drawio-row-policy'; rowSelect.id = `drawio-model-policy-${page.start + index}`;
                rowSelect.setAttribute('aria-label', `${conflict.importedName || conflict.importedModelId} 충돌 처리`);
                appendDrawioPolicyOptions(rowSelect); rowSelect.value = perModelPolicies.get(conflict.importedModelId) || 'keepBoth';
                conflictPolicySelects.set(conflict.importedModelId, rowSelect);
                rowSelect.addEventListener('change', () => {
                  const rowPolicy = DRAWIO_IMPORT_POLICIES.find(([value]) => value === rowSelect.value)?.[0];
                  if (rowPolicy) perModelPolicies.set(conflict.importedModelId, rowPolicy);
                  if (['keepBoth', 'reuse', 'replace'].includes(filterSelect.value)) renderConflictRows();
                  else syncPolicyControls();
                });
                policyCell.appendChild(rowSelect);
              } else {
                const fixed = document.createElement('span'); fixed.className = 'drawio-policy-fixed';
                fixed.textContent = '새 모델 (고정)'; policyCell.appendChild(fixed);
              }
              row.append(importedCell, existingCell, typeCell, fieldsCell, policyCell); tbody.appendChild(row);
            });
            resultMeta.textContent = page.total
              ? `${page.total}/${analysis.conflicts.length}건 · ${page.start + 1}-${page.end}`
              : `0/${analysis.conflicts.length}건`;
            pageText.textContent = `${page.page + 1} / ${page.pageCount}`;
            previous.disabled = page.page === 0; next.disabled = page.page >= page.pageCount - 1;
            pager.hidden = page.pageCount <= 1;
            resetFilters.disabled = !searchInput.value && filterSelect.value === 'all';
            syncPolicyControls();
          };
          searchInput.addEventListener('input', () => { conflictPage = 0; renderConflictRows(); });
          filterSelect.addEventListener('change', () => { conflictPage = 0; renderConflictRows(); });
          resetFilters.addEventListener('click', () => {
            searchInput.value = ''; filterSelect.value = 'all'; conflictPage = 0;
            renderConflictRows(); searchInput.focus();
          });
          previous.addEventListener('click', () => { conflictPage -= 1; renderConflictRows(); });
          next.addEventListener('click', () => { conflictPage += 1; renderConflictRows(); });
          renderConflictRows();
        } else {
          const empty = document.createElement('p'); empty.className = 'drawio-import-note';
          empty.textContent = '현재 프로젝트와 충돌하는 요소 모델이 없습니다.'; conflictSection.appendChild(empty);
        }
        body.appendChild(conflictSection);
      }

      let policy: DrawioPolicy = 'keepBoth';
      if (append && analysis.compatibleConflicts) {
        const policySection = document.createElement('section'); policySection.className = 'drawio-import-policy';
        const label = document.createElement('label'); label.htmlFor = 'drawio-conflict-policy'; label.textContent = '검색 결과 일괄 처리';
        const select = document.createElement('select'); select.id = 'drawio-conflict-policy';
        appendDrawioPolicyOptions(select, true);
        const mixed = document.createElement('option'); mixed.value = 'mixed'; mixed.textContent = '개별 설정 (혼합)'; mixed.disabled = true;
        select.appendChild(mixed);
        const policySummary = document.createElement('p'); policySummary.className = 'drawio-policy-summary';
        policySummary.setAttribute('aria-live', 'polite');
        const help = document.createElement('p'); help.id = 'drawio-policy-help'; select.setAttribute('aria-describedby', help.id);
        syncPolicyControls = () => {
          const values = [...perModelPolicies.values()];
          const counts = values.reduce((result, value) => {
            result[value] = (result[value] || 0) + 1; return result;
          }, { keepBoth: 0, reuse: 0, replace: 0 });
          const unique = new Set(values);
          policy = unique.size === 1 ? values[0] : 'keepBoth';
          const filteredCompatible = filteredConflicts().filter(conflict => conflict.compatible);
          const filteredValues = filteredCompatible.map(conflict => perModelPolicies.get(conflict.importedModelId) || 'keepBoth');
          const filteredUnique = new Set(filteredValues);
          select.disabled = filteredValues.length === 0;
          select.value = filteredUnique.size === 1 ? filteredValues[0] : 'mixed';
          policySummary.textContent = `전체 · 새 모델 ${counts.keepBoth} · 기존 재사용 ${counts.reuse} · 덮어쓰기 ${counts.replace} · 검색 결과 호환 ${filteredCompatible.length}`;
          conflictPolicySelects.forEach(rowSelect => {
            rowSelect.closest('tr')?.classList.toggle('drawio-conflict-replace', rowSelect.value === 'replace');
          });
          if (confirmImportButton) {
            confirmImportButton.textContent = counts.replace
              ? `가져오기 (${analysis.diagrams}) · 덮어쓰기 ${counts.replace}`
              : `가져오기 (${analysis.diagrams})`;
          }
          help.className = `drawio-import-note${counts.replace ? ' danger' : ''}`;
          help.textContent = counts.replace
            ? `덮어쓰기 ${counts.replace}건은 기존 모델의 속성과 연결된 모든 뷰를 변경합니다. 가져오기 후 Undo로 되돌릴 수 있습니다.`
            : `각 충돌 행에서 처리 방식을 변경하거나, 현재 검색 결과의 호환 충돌 ${filteredCompatible.length}건에 같은 방식을 적용할 수 있습니다.`;
        };
        select.addEventListener('change', () => {
          const selectedPolicy = DRAWIO_IMPORT_POLICIES.find(([value]) => value === select.value)?.[0];
          if (!selectedPolicy) return;
          filteredConflicts().filter(conflict => conflict.compatible).forEach(conflict => {
            perModelPolicies.set(conflict.importedModelId, selectedPolicy);
          });
          renderConflictRows();
        });
        syncPolicyControls();
        policySection.append(label, select, policySummary, help);
        if (analysis.incompatibleConflicts) {
          const warning = document.createElement('p'); warning.className = 'drawio-import-note danger';
          warning.textContent = `종류가 다른 ${analysis.incompatibleConflicts}건은 선택한 방식과 관계없이 새 모델로 가져옵니다.`;
          policySection.appendChild(warning);
        }
        body.appendChild(policySection);
      }

      const footer = document.createElement('div'); footer.className = 'project-dialog-footer';
      dialog.append(body, footer);
      return new Promise<DrawioPreviewDecision | null>(resolve => {
        let settled = false;
        const finish = (result: DrawioPreviewDecision | null) => {
          if (settled) return;
          settled = true;
          modal.close(); resolve(result);
        };
        const cancel = projectActionButton('취소', () => finish(null));
        const confirmImport = projectActionButton(append ? `가져오기 (${analysis.diagrams})` : '새 프로젝트로 열기', () => finish({
          policy,
          modelPolicies: Object.fromEntries(perModelPolicies),
        }));
        confirmImportButton = confirmImport;
        if (append && analysis.compatibleConflicts) syncPolicyControls();
        confirmImport.classList.add('project-primary'); footer.append(cancel, confirmImport);
        modal.setRequestCloseHandler(() => finish(null));
        modal.focusInitial(confirmImport);
      });
    }

    function openDdlImportPreview(imported: DdlImportSummary, options: PreviewOptions = {}) {
      const meta = imported.importMeta || {};
      const { dialog, header, modal } = projectModal('DDL Import Preview', 'ddl-import-preview-modal');
      dialog.classList.add('ddl-import-dialog');
      dialog.setAttribute('role', 'dialog');
      dialog.setAttribute('aria-modal', 'true');
      const title = header.querySelector('strong');
      if (title) {
        title.id = 'ddl-import-preview-title';
        dialog.setAttribute('aria-labelledby', title.id);
      }

      const body = document.createElement('div');
      body.className = 'ddl-import-preview';
      const intro = document.createElement('p');
      intro.className = 'ddl-import-intro';
      intro.textContent = `${options.filename || 'DDL'} · ${meta.dialect || '자동 판별'} · 현재 프로젝트에 새 ER Diagram으로 추가`;
      body.appendChild(intro);

      const summary = document.createElement('div');
      summary.className = 'ddl-import-summary';
      [
        ['테이블', meta.tables || 0], ['컬럼', meta.columns || 0],
        ['FK', meta.foreignKeys || 0], ['연결 관계', meta.linkedForeignKeys || 0],
        ['CHECK', meta.checks || 0], ['인덱스', meta.indexes || 0],
      ].forEach(([label, value]) => {
        const card = document.createElement('div'); card.className = 'ddl-import-stat';
        const count = document.createElement('strong'); count.textContent = String(value);
        const caption = document.createElement('span'); caption.textContent = String(label);
        card.append(count, caption); summary.appendChild(card);
      });
      body.appendChild(summary);

      const tableSection = document.createElement('section');
      tableSection.className = 'ddl-import-section';
      const tableTitle = document.createElement('h3'); tableTitle.textContent = '가져올 테이블';
      const tableList = document.createElement('div'); tableList.className = 'ddl-import-table-list';
      const diagram = imported.diagrams?.[0];
      (diagram?.elements || []).forEach(view => {
        const model = view.modelId ? imported.models?.[view.modelId] : undefined;
        const row = document.createElement('div'); row.className = 'ddl-import-table-row';
        const name = document.createElement('strong'); name.textContent = model?.name || '(이름 없음)';
        const detail = document.createElement('span'); detail.textContent = `컬럼 ${(model?.columns || []).length}`;
        row.append(name, detail); tableList.appendChild(row);
      });
      tableSection.append(tableTitle, tableList); body.appendChild(tableSection);

      if (meta.warnings?.length) {
        const warningSection = document.createElement('section');
        warningSection.className = 'ddl-import-section ddl-import-warnings';
        const warningTitle = document.createElement('h3');
        warningTitle.textContent = `저장하지 않는 항목 (${meta.warnings.length})`;
        const warningList = document.createElement('ul');
        meta.warnings.forEach(message => {
          const item = document.createElement('li'); item.textContent = message; warningList.appendChild(item);
        });
        warningSection.append(warningTitle, warningList); body.appendChild(warningSection);
      }

      const footer = document.createElement('div'); footer.className = 'project-dialog-footer';
      dialog.append(body, footer);
      return new Promise<boolean>(resolve => {
        let settled = false;
        const finish = (result: boolean) => {
          if (settled) return;
          settled = true;
          modal.close(); resolve(result);
        };
        const cancel = projectActionButton('취소', () => finish(false));
        const confirm = projectActionButton(`가져오기 (${meta.tables || 0})`, () => finish(true));
        confirm.classList.add('project-primary'); footer.append(cancel, confirm);
        modal.setRequestCloseHandler(() => finish(false));
        modal.focusInitial(confirm);
      });
    }

    return Object.freeze({
      openDdlImportPreview,
      openDrawioImportPreview,
    });
  }

  return Object.freeze({ REQUIRED_FUNCTIONS, REQUIRED_VALUES, create });
}
