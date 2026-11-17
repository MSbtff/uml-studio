import js from '@eslint/js';
import globals from 'globals';

const umlGlobals = Object.fromEntries(
  [
    'UMLCanvasGeometry',
    'UMLCanvasInteraction',
    'UMLCanvasKeyboard',
    'UMLCanvasRenderer',
    'UMLCommandRouter',
    'UMLContainmentLayout',
    'UMLDiagramExport',
    'UMLDiagramRegistry',
    'UMLDiagramTabs',
    'UMLDdlImporter',
    'UMLDrawioImporter',
    'UMLElementFactory',
    'UMLElementMeasure',
    'UMLElementPlacement',
    'UMLElementRenderer',
    'UMLErdCardinality',
    'UMLErdColumn',
    'UMLErdColumnEditor',
    'UMLErdNameTools',
    'UMLErdPropertySections',
    'UMLErdSchema',
    'UMLExporters',
    'UMLExpressionParser',
    'UMLHitTesting',
    'UMLHistoryController',
    'UMLIconScript',
    'UMLProjectImport',
    'UMLImportPreview',
    'UMLInteractionLayout',
    'UMLMemberLists',
    'UMLModelCore',
    'UMLModelExplorer',
    'UMLModelRepository',
    'UMLModalFocus',
    'UMLOrthogonalRouter',
    'UMLParametricBinding',
    'UMLPersistence',
    'UMLPresentationRegistry',
    'UMLProjectDocument',
    'UMLProjectStore',
    'UMLPropertyPanel',
    'UMLQuickEdit',
    'UMLRelationCreation',
    'UMLRelationEnd',
    'UMLRelationEndEditor',
    'UMLRelationRenderer',
    'UMLRelationRules',
    'UMLRuntimeErrors',
    'UMLSampleDiagrams',
    'UMLSelectionEditing',
    'UMLSequenceLayout',
    'UMLStatusBar',
    'UMLToolbox',
    'UMLValidation',
    'UMLValidationPanel',
    'UMLViewportController',
  ].map((name) => [name, 'readonly']),
);

const commonRules = {
  // ESLint 10에서 추가된 동작 추론 규칙은 레거시 모듈을 책임 단위로 옮길 때 별도 적용한다.
  'no-empty-pattern': 'off',
  'no-regex-spaces': 'off',
  'no-useless-assignment': 'off',
  'no-useless-escape': 'off',
  'preserve-caught-error': 'off',
  'no-unused-vars': [
    'warn',
    {
      argsIgnorePattern: '^_',
      caughtErrorsIgnorePattern: '^_',
      varsIgnorePattern: '^_',
      // `const { json, ...metadata } = record` 처럼 키 하나를 빼는 관용구를 허용한다.
      ignoreRestSiblings: true,
    },
  ],
};

export default [
  {
    name: 'project/ignores',
    ignores: [
      'node_modules/**',
      'playwright-report/**',
      'test-results/**',
      'tests/.runtime/**',
      '**/__pycache__/**',
      'packages/ddl-to-mermaid/dist/**',
    ],
  },
  js.configs.recommended,
  {
    name: 'project/legacy-browser-modules',
    files: ['*.js'],
    languageOptions: {
      ecmaVersion: 'latest',
      sourceType: 'script',
      globals: {
        ...globals.browser,
        ...globals.commonjs,
        Buffer: 'readonly',
        ...umlGlobals,
      },
    },
    rules: commonRules,
  },
  {
    name: 'project/node-unit-tests',
    files: ['tests/**/*.js'],
    languageOptions: {
      ecmaVersion: 'latest',
      sourceType: 'commonjs',
      globals: {
        ...globals.node,
        ...globals.browser,
      },
    },
    rules: commonRules,
  },
  {
    name: 'project/node',
    files: ['**/*.mjs', 'packages/ddl-to-mermaid/*.cjs'],
    languageOptions: {
      ecmaVersion: 'latest',
      globals: {
        ...globals.node,
        ...globals.browser,
      },
    },
    rules: commonRules,
  },
];
