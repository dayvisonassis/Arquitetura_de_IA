// Gate `arch` (parte 2) — regras de projeto que o dependency-cruiser não expressa.
import { readdirSync, readFileSync } from 'node:fs';
import { join, relative, sep } from 'node:path';
import { hasSources, workspaces } from './workspaces.mjs';

// Apps e serviços leem o ambiente num único módulo e sobem o servidor num único arquivo.
// Um pacote compartilhado (packages/*) não faz nenhuma das duas coisas.
const isPackage = (workspace) => workspace.startsWith('packages/');

const RULES = [
  {
    id: 'env-only-in-config',
    pattern: /\bprocess\.env\b/,
    allowed: (ws) => (isPackage(ws) ? [] : [`${ws}/src/config/env.ts`]),
    fix: (ws) =>
      isPackage(ws)
        ? 'um pacote compartilhado não lê o ambiente: receba o valor por parâmetro'
        : `leia a variável em ${ws}/src/config/env.ts e importe \`env\` de lá`,
  },
  {
    id: 'listen-only-in-server',
    pattern: /\.listen\s*\(/,
    allowed: (ws) => (isPackage(ws) ? [] : [`${ws}/src/server.ts`]),
    fix: (ws) =>
      isPackage(ws)
        ? 'um pacote compartilhado não sobe servidor'
        : `suba o servidor apenas em ${ws}/src/server.ts; app.ts deve só montar e retornar o app`,
  },
];

function listTs(dir) {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) return listTs(path);
    return entry.name.endsWith('.ts') ? [path] : [];
  });
}

const stripComments = (line) => line.replace(/\/\/.*$/, '');

const checked = workspaces.filter(hasSources);
const violations = [];
for (const workspace of checked) {
  for (const file of listTs(join(workspace, 'src'))) {
    const rel = relative('.', file).split(sep).join('/');
    const lines = readFileSync(file, 'utf8').split(/\r?\n/);
    for (const rule of RULES) {
      if (rule.allowed(workspace).includes(rel)) continue;
      lines.forEach((line, i) => {
        if (rule.pattern.test(stripComments(line))) {
          violations.push(`${rel}:${i + 1}  [${rule.id}]  ${line.trim()}\n    correção: ${rule.fix(workspace)}`);
        }
      });
    }
  }
}

if (violations.length > 0) {
  console.error(`check-architecture: ${violations.length} violação(ões)\n`);
  console.error(violations.join('\n'));
  process.exit(1);
}
console.log(`check-architecture: ok (${RULES.length} regras em ${checked.length} workspace(s): ${checked.join(', ')})`);
