import { nextJsConfig } from '@repo/eslint-config/next-js';
import { globalIgnores } from 'eslint/config';
import globals from 'globals';
export default [
  ...nextJsConfig,
  globalIgnores(['.next*/**', 'test-results/**', 'playwright-report/**']),
  { files: ['**/*.{ts,tsx}'], languageOptions: { parserOptions: { babelOptions: { presets: ['@babel/preset-typescript'], parserOpts: { plugins: ['jsx'] } } } }, rules: { 'no-undef': 'off', 'no-unused-vars': 'off' } },
  { files: ['*.js', '*.mjs', 'tests/**'], languageOptions: { globals: globals.node } },
];
