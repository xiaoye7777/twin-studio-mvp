import js from '@eslint/js'
import prettier from 'eslint-config-prettier'
import vue from 'eslint-plugin-vue'
import globals from 'globals'
import tseslint from 'typescript-eslint'

export default tseslint.config(
  { ignores: ['**/dist/**', '**/node_modules/**', 'vendor/**', 'release/**', '**/public/**'] },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  ...vue.configs['flat/recommended'],
  {
    files: ['**/*.vue'],
    languageOptions: { parserOptions: { parser: tseslint.parser, extraFileExtensions: ['.vue'] } },
  },
  {
    languageOptions: { globals: { ...globals.browser, ...globals.node } },
    rules: {
      // vue-tsc already reports unused symbols with the project's own settings.
      '@typescript-eslint/no-unused-vars': 'off',
      // Route views (App, Login) and panels are single-word by design.
      'vue/multi-word-component-names': 'off',
    },
  },
  // Formatting belongs to Prettier.
  prettier,
)
