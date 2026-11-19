type StudioLanguage = 'en' | 'ko';

declare var UMLLanguage: ReturnType<typeof createStudioLanguage>;

(function initStudioLanguage(root: typeof globalThis) {
  const language = createStudioLanguage();
  if (typeof module === 'object' && module.exports) module.exports = language;
  else root.UMLLanguage = language;
})(globalThis);

function createStudioLanguage() {
  const storageKey = 'uml-studio-language';

  function storedLanguage(): StudioLanguage {
    try {
      return localStorage.getItem(storageKey) === 'ko' ? 'ko' : 'en';
    } catch {
      return 'en';
    }
  }

  // CommonJS consumers retain the diagnostics provided by the existing parser APIs.
  const browser = !(typeof module === 'object' && module.exports);
  const current = browser ? storedLanguage() : 'ko';
  const locale = current === 'ko' ? 'ko-KR' : 'en-US';

  function interpolate(message: string, values: unknown[]) {
    return values.length ? message.replace(/\{(\d+)\}/g, (_, index: string) => String(values[Number(index)])) : message;
  }

  function text(english: string, korean: string, ...values: unknown[]): string {
    return interpolate(current === 'ko' ? korean : english, values);
  }

  function label(english: string, korean: string, ...values: unknown[]): string {
    return interpolate(browser && current === 'ko' ? korean : english, values);
  }

  // Registry labels are also used as default names in project data.
  function displayLabel(meta: { label: string; labelKo?: string } | undefined, fallback = ''): string {
    if (!meta) return fallback;
    return label(meta.label, meta.labelKo ?? meta.label);
  }

  function applyStaticLabels(root: Document) {
    root.documentElement.lang = current;
    if (current !== 'ko') return;

    root.querySelectorAll<HTMLElement>('[data-ko]').forEach(element => {
      element.textContent = element.dataset.ko ?? '';
    });
    const attributes = {
      'data-ko-title': 'title',
      'data-ko-label': 'aria-label',
      'data-ko-placeholder': 'placeholder',
    };
    Object.entries(attributes).forEach(([source, target]) => {
      root.querySelectorAll(`[${source}]`).forEach(element => {
        element.setAttribute(target, element.getAttribute(source) ?? '');
      });
    });
  }

  function save(language: StudioLanguage) {
    localStorage.setItem(storageKey, language);
  }

  return Object.freeze({ current, locale, text, label, displayLabel, applyStaticLabels, save });
}
