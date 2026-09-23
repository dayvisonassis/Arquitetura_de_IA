// Gate `arch` (parte 2) — regras de projeto que o dependency-cruiser não expressa.
import { readdirSync, readFileSync } from 'node:fs';
import { join, relative, sep } from 'node:path';

const SRC = 'src';

const RULES = [
  {
    id: 'env-only-in-config',
    pattern: /\bprocess\.env\b/,
    allowed: ['src/config/env.ts'],
    fix: 'leia a variável em src/config/env.ts e importe `env` de lá',
  },
  {
    id: 'listen-only-in-server',
    pattern: /\.listen\s*\(/,
    allowed: ['src/server.ts'],
    fix: 'suba o servidor apenas em src/server.ts; app.ts deve só montar e retornar o app',
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

const violations = [];
for (const file of listTs(SRC)) {
  const rel = relative('.', file).split(sep).join('/');
  const lines = readFileSync(file, 'utf8').split(/\r?\n/);
  for (const rule of RULES) {
    if (rule.allowed.includes(rel)) continue;
    lines.forEach((line, i) => {
      if (rule.pattern.test(stripComments(line))) {
        violations.push(`${rel}:${i + 1}  [${rule.id}]  ${line.trim()}\n    correção: ${rule.fix}`);
      }
    });
  }
}

if (violations.length > 0) {
  console.error(`check-architecture: ${violations.length} violação(ões)\n`);
  console.error(violations.join('\n'));
  process.exit(1);
}
console.log(`check-architecture: ok (${RULES.length} regras)`);
