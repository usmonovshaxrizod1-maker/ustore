const fs = require('node:fs');
const vm = require('node:vm');

/**
 * Load one of UStorE's browser-first UMD scripts while package.json uses
 * `type: module`. Requiring a `.js` file directly from a CommonJS test would
 * otherwise return an empty ESM namespace instead of the window export.
 */
function loadBrowserUmd(filePath, exportName, extraGlobals = {}) {
  const code = fs.readFileSync(filePath, 'utf8');
  const touched = new Map();
  const setTemporaryGlobal = (key, value) => {
    touched.set(key, Object.prototype.hasOwnProperty.call(global, key)
      ? { exists: true, value: global[key] }
      : { exists: false });
    global[key] = value;
  };

  setTemporaryGlobal('window', global);
  setTemporaryGlobal('self', global);
  for (const [key, value] of Object.entries(extraGlobals)) setTemporaryGlobal(key, value);
  const previousExport = Object.prototype.hasOwnProperty.call(global, exportName)
    ? { exists: true, value: global[exportName] }
    : { exists: false };
  delete global[exportName];

  // Execute in this realm so assert.deepStrictEqual sees ordinary Node
  // arrays/objects. Hide CommonJS/AMD hooks so the browser branch is used.
  vm.runInThisContext(
    `(function(module,exports,define,require){\n${code}\n}).call(globalThis, undefined, undefined, undefined, undefined);`,
    { filename: filePath },
  );

  const api = global[exportName];
  if (previousExport.exists) global[exportName] = previousExport.value;
  else delete global[exportName];
  for (const [key, previous] of touched) {
    if (previous.exists) global[key] = previous.value;
    else delete global[key];
  }
  if (!api) throw new Error(`Browser export ${exportName} was not created by ${filePath}`);
  return api;
}

module.exports = { loadBrowserUmd };
