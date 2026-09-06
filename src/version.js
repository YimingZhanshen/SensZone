(function (SZ) {
  'use strict';

  // 产品版本号单源。scripts/bump-version.mjs 负责统一改写此处与 index.html ?v=、README 标题。
  SZ.VERSION = '1.4';
})(
  typeof window !== 'undefined'
    ? (window.SZ = window.SZ || {})
    : (globalThis.SZ = globalThis.SZ || {}),
);
