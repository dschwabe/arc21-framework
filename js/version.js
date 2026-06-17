/**
 * js/version.js
 * Single source of truth for the framework's cache-busting version.
 *
 * ES module `import ... from "...?v=N"` specifiers must be string literals,
 * so static imports can't reference this constant directly — but they should
 * all use the SAME number as ARC21_VERSION below.
 *
 * When bumping the version:
 *   1. Update ARC21_VERSION here.
 *   2. Find/replace `?v=<old>` -> `?v=<new>` across app.js, js/**\/*.js,
 *      index.html and mgmt.html (script/link tags).
 *
 * Runtime-constructed paths (js/skin/loader.js) import ARC21_VERSION
 * directly and don't need step 2.
 */
export const ARC21_VERSION = 14;
