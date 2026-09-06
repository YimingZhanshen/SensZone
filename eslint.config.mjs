import js from '@eslint/js';
import globals from 'globals';

export default [
  js.configs.recommended,
  {
    files: ['src/**/*.js'],
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: 'script',
      globals: { ...globals.browser, SZ: 'readonly' }
    },
    rules: {
      // 经典 script：跨文件共享全局 SZ 由运行时装配
      // 空 catch（catch (_){}）是既定风格：localStorage/PointerLock 失败必须静默降级
      'no-empty': 'off',
      'no-unused-vars': ['error', { args: 'none', caughtErrors: 'none', varsIgnorePattern: '^_$' }]
    }
  },
  {
    files: ['test/**/*.cjs', 'scripts/**/*.mjs'],
    languageOptions: {
      ecmaVersion: 2022,
      globals: { ...globals.node }
    }
  },
  {
    files: ['sw.js'],
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: 'script',
      globals: { ...globals.serviceworker }
    }
  }
];
