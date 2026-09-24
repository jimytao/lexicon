import js from '@eslint/js'
import globals from 'globals'
import tseslint from 'typescript-eslint'
import reactHooks from 'eslint-plugin-react-hooks'

export default tseslint.config(
  // 全局忽略
  {
    ignores: [
      'dist/**',
      'dist-ext/**',
      'dist-dictionaries/**',
      'node_modules/**',
      'public/**',
      'src-tauri/**',
      'android/**',
      'ios/**',
      'scripts/**',
      'tools/**',
      '*.config.ts',
      '*.config.js',
      '*.config.mjs',
    ],
  },

  // JS 基础规则
  js.configs.recommended,

  // TypeScript 规则（宽松模式，仅用 type-checked 之外的静态规则）
  ...tseslint.configs.recommended,

  // React Hooks 规则
  {
    plugins: { 'react-hooks': reactHooks },
    rules: reactHooks.configs.recommended.rules,
  },

  // 全局环境
  {
    languageOptions: {
      globals: {
        ...globals.browser,
        ...globals.es2022,
      },
    },
  },

  // 项目级宽松规则：现有大型代码库，避免过多 noise
  {
    rules: {
      // TS 相关：允许 any（历史代码多处使用）
      '@typescript-eslint/no-explicit-any': 'warn',
      // 允许空函数（callback placeholder 等）
      '@typescript-eslint/no-empty-function': 'off',
      // 允许非空断言（!. 在 DOM 操作中常见）
      '@typescript-eslint/no-non-null-assertion': 'warn',
      // 未使用变量降为 warn，下划线前缀免报
      '@typescript-eslint/no-unused-vars': [
        'warn',
        {
          argsIgnorePattern: '^_',
          varsIgnorePattern: '^_',
          caughtErrorsIgnorePattern: '^_',
        },
      ],
      // 允许 require()（部分 config 文件用）
      '@typescript-eslint/no-require-imports': 'warn',
    },
  },
)
