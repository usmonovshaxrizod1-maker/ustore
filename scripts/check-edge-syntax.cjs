const fs = require('node:fs');
const path = require('node:path');
const ts = require('typescript');

const root = path.resolve(__dirname, '..', 'supabase', 'functions');
const files = [];

function walk(dir) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const absolute = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(absolute);
    else if (entry.isFile() && entry.name.endsWith('.ts')) files.push(absolute);
  }
}

walk(root);
let failed = false;
for (const file of files) {
  const source = fs.readFileSync(file, 'utf8');
  const result = ts.transpileModule(source, {
    fileName: file,
    reportDiagnostics: true,
    compilerOptions: {
      target: ts.ScriptTarget.ES2022,
      module: ts.ModuleKind.ESNext,
    },
  });
  for (const diagnostic of result.diagnostics || []) {
    if (diagnostic.category !== ts.DiagnosticCategory.Error) continue;
    failed = true;
    const pos = diagnostic.start == null
      ? { line: 0, character: 0 }
      : ts.getLineAndCharacterOfPosition(ts.createSourceFile(file, source, ts.ScriptTarget.ES2022), diagnostic.start);
    const message = ts.flattenDiagnosticMessageText(diagnostic.messageText, '\n');
    console.error(`${path.relative(process.cwd(), file)}:${pos.line + 1}:${pos.character + 1} ${message}`);
  }
}

if (failed) process.exit(1);
console.log(`Edge TypeScript syntax OK: ${files.length} file`);
