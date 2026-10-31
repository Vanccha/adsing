import js from '@eslint/js';
import tseslint from 'typescript-eslint';
import globals from 'globals';

// Motor (engine/) saf olmalı: React/ui/DOM yok, Math.random ve Date.now yasak.
const enginePure = {
  'no-restricted-imports': [
    'error',
    {
      patterns: [
        { group: ['react', 'react-dom', 'react-dom/*', 'react/*', 'react-i18next', 'i18next'], message: 'engine/ React veya i18n kütüphanesi kullanamaz.' },
        { group: ['**/ui/*', '**/ui', '@ui/*'], message: 'engine/ ui/ klasörünü import edemez.' },
      ],
    },
  ],
  'no-restricted-properties': [
    'error',
    { object: 'Math', property: 'random', message: 'Tohumlu RNG kullanın (engine/rng).' },
    { object: 'Date', property: 'now', message: 'Motor zamanı okumaz.' },
    { object: 'performance', property: 'now', message: 'Motor zamanı okumaz.' },
  ],
  'no-restricted-syntax': [
    'error',
    { selector: "NewExpression[callee.name='Date'][arguments.length=0]", message: 'Motor sistem saatini okumaz.' },
  ],
};

export default tseslint.config(
  { ignores: ['dist', 'node_modules', 'coverage'] },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    languageOptions: { globals: { ...globals.node, ...globals.browser } },
    rules: {
      '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_', varsIgnorePattern: '^_' }],
      '@typescript-eslint/no-explicit-any': 'error',
    },
  },
  { files: ['engine/**/*.ts'], rules: enginePure },
);
