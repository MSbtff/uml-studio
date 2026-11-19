declare var UMLLanguageSettings: ReturnType<typeof createLanguageSettings>;

(function initLanguageSettings(root: typeof globalThis) {
  root.UMLLanguageSettings = createLanguageSettings();
})(globalThis);

function createLanguageSettings() {
  type SettingsProjectStore = Pick<
    ReturnType<ProjectStoreApi['create']>,
    'projectModal' | 'projectActionButton' | 'flushRecovery' | 'detach'
  >;

  function attach(button: HTMLButtonElement, projectStore: SettingsProjectStore, projectReady: Promise<boolean>) {
    void projectReady.then(() => { button.disabled = false; });
    button.addEventListener('click', () => {
      const { label: uiLabel } = UMLLanguage;
      const { dialog, modal } = projectStore.projectModal(uiLabel('Settings', '설정'), 'language-settings-modal');
      const field = document.createElement('div');
      field.className = 'language-settings-field';
      const label = document.createElement('label');
      label.htmlFor = 'editor-language';
      label.textContent = uiLabel('Editor language', '편집기 언어');
      const select = document.createElement('select');
      select.id = label.htmlFor;
      select.className = 'project-name-input';
      select.append(new Option('English', 'en'), new Option('한국어', 'ko'));
      select.options[0].lang = 'en';
      select.options[1].lang = 'ko';
      select.value = UMLLanguage.current;
      const hint = document.createElement('p');
      hint.className = 'project-dialog-hint';
      hint.textContent = uiLabel('Applying a language saves your work and reloads the editor.', '언어를 적용하면 작업을 저장하고 편집기를 다시 로드합니다.');
      const error = document.createElement('p');
      error.className = 'project-dialog-hint';
      error.setAttribute('role', 'alert');
      const footer = document.createElement('div');
      footer.className = 'project-dialog-footer';
      const cancel = projectStore.projectActionButton(uiLabel('Cancel', '취소'), () => modal.close());
      const apply = projectStore.projectActionButton(uiLabel('Apply', '적용'), async () => {
        const language = select.value === 'ko' ? 'ko' : 'en';
        apply.disabled = cancel.disabled = select.disabled = true;
        error.textContent = '';
        const enableControls = () => { apply.disabled = cancel.disabled = select.disabled = false; };
        if (!(await projectStore.flushRecovery())) {
          error.textContent = uiLabel('Save the project before changing the language.', '프로젝트를 저장한 뒤 다시 시도하세요.');
          enableControls();
          return;
        }
        try {
          UMLLanguage.save(language);
        } catch {
          error.textContent = uiLabel('The browser could not save your language preference.', '브라우저에 언어 설정을 저장할 수 없습니다.');
          enableControls();
          return;
        }
        projectStore.detach();
        location.reload();
      }, true);
      apply.classList.add('project-primary');
      select.addEventListener('change', () => { apply.disabled = select.value === UMLLanguage.current; });
      modal.setRequestCloseHandler(() => { if (!cancel.disabled) modal.close(); });
      field.append(label, select);
      footer.append(cancel, apply);
      dialog.append(field, hint, error, footer);
      modal.focusInitial(select);
    });
  }

  return Object.freeze({ attach });
}
