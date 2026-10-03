// Orquestrador dos quality gates.
//   node scripts/runGate.mjs            -> todos, na ordem abaixo
//   node scripts/runGate.mjs lint arch  -> só os ids pedidos (sempre na ordem do registro)
// Para na primeira falha e sai com código 1.
import { spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { hasSources, workspaces } from './workspaces.mjs';

const sh = (command) => () => {
  console.log(`$ ${command}`);
  return spawnSync(command, { stdio: 'inherit', shell: true }).status === 0;
};

const all = (...steps) => async () => {
  for (const step of steps) if (!(await step())) return false;
  return true;
};

// Roda o comando em cada workspace que já tem src/; os vazios são anunciados, não checados.
const eachWorkspace = (command) => () =>
  workspaces.every((workspace) => {
    if (!hasSources(workspace)) {
      console.log(`- ${workspace}: sem src/ ainda, nada a checar`);
      return true;
    }
    return sh(command(workspace))();
  });

const sourceDirs = () =>
  workspaces
    .filter(hasSources)
    .flatMap((workspace) => [`${workspace}/src`, `${workspace}/tests`])
    .filter((dir) => existsSync(dir));

// ── e2e ──────────────────────────────────────────────────────────────────────
// Precisa do app no ar e roda headless. Só roda quando muda algo que afeta um fluxo.
const E2E_BASE_URL = process.env.E2E_BASE_URL ?? 'http://127.0.0.1:3000';
const E2E_SCOPE = [...workspaces.map((workspace) => `${workspace}/`), 'tests/e2e/', 'playwright.e2e.config.ts', 'package-lock.json'];

const git = (...args) => spawnSync('git', args, { encoding: 'utf8' });

function changedFiles() {
  const base = git('rev-parse', '--verify', '--quiet', 'origin/main').status === 0 ? 'origin/main' : 'HEAD';
  const diff = git('diff', '--name-only', base).stdout;
  const untracked = git('ls-files', '--others', '--exclude-standard').stdout;
  return { base, files: `${diff}\n${untracked}`.split('\n').filter(Boolean) };
}

async function e2eGate() {
  if (process.env.E2E_SKIP === '1') {
    console.warn(
      [
        '!'.repeat(64),
        '!! E2E_SKIP=1: o gate e2e NÃO rodou.',
        '!! Nenhum fluxo de usuário foi verificado nesta execução.',
        '!'.repeat(64),
      ].join('\n'),
    );
    return true;
  }

  if (process.env.E2E_FORCE !== '1') {
    const { base, files } = changedFiles();
    const relevant = files.filter((file) => E2E_SCOPE.some((scope) => file === scope || file.startsWith(scope)));
    if (relevant.length === 0) {
      console.log(`- nada que afete um fluxo mudou desde ${base}; nada a rodar (E2E_FORCE=1 roda mesmo assim)`);
      return true;
    }
    console.log(`- ${relevant.length} arquivo(s) que afetam fluxos mudaram desde ${base}`);
  }

  try {
    await fetch(E2E_BASE_URL, { redirect: 'manual', signal: AbortSignal.timeout(5000) });
  } catch {
    console.error(
      [
        `✗ O app não responde em ${E2E_BASE_URL}.`,
        '  O gate e2e roda contra o app no ar. Suba-o em outro terminal e rode o gate de novo:',
        '    npm run dev',
        '  App em outro endereço: E2E_BASE_URL=<url>.',
        '  Pular conscientemente: E2E_SKIP=1 (a execução fica marcada como não verificada).',
      ].join('\n'),
    );
    return false;
  }

  return sh('npx playwright test --config playwright.e2e.config.ts')();
}

// Do mais barato ao mais caro; os que precisam do app no ar vêm por último.
const GATES = [
  {
    id: 'typecheck',
    label: 'Tipos (tsc --noEmit)',
    run: all(sh('npx tsc -p tsconfig.json --noEmit'), eachWorkspace((ws) => `npx tsc -p ${ws}/tsconfig.json --noEmit`)),
  },
  { id: 'lint', label: 'Lint, zero warnings', run: sh('npx eslint . --max-warnings=0') },
  { id: 'build', label: 'Build (tsc)', run: eachWorkspace((ws) => `npx tsc -p ${ws}/tsconfig.build.json`) },
  {
    id: 'arch',
    label: 'Arquitetura: fronteiras entre workspaces e camadas MVC',
    run: all(
      () => sh(`npx depcruise ${sourceDirs().join(' ')} --config .dependency-cruiser.cjs`)(),
      sh('node scripts/check-architecture.mjs'),
    ),
  },
  { id: 'tests', label: 'Testes + cobertura mínima', run: eachWorkspace((ws) => `npx jest --coverage -c ${ws}/jest.config.js`) },
  { id: 'deadcode', label: 'Código morto (knip)', run: sh('npx knip') },
  { id: 'e2e', label: 'Fluxos e2e (Playwright, headless)', run: e2eGate },
];

const requested = process.argv.slice(2);
const unknown = requested.filter((id) => !GATES.some((gate) => gate.id === id));
if (unknown.length > 0) {
  console.error(`Gate desconhecido: ${unknown.join(', ')}. Disponíveis: ${GATES.map((g) => g.id).join(', ')}`);
  process.exit(2);
}

const selected = requested.length > 0 ? GATES.filter((gate) => requested.includes(gate.id)) : GATES;
const results = [];

for (const gate of selected) {
  console.log(`\n━━ [${gate.id}] ${gate.label}`);
  const started = Date.now();
  const ok = await gate.run();
  results.push({ id: gate.id, ok, ms: Date.now() - started });
  if (!ok) break;
}

console.log('\n━━ Resultado');
for (const { id, ok, ms } of results) console.log(`${ok ? '✓' : '✗'} [${id}] ${(ms / 1000).toFixed(1)}s`);
const skipped = selected.slice(results.length).map((gate) => gate.id);
if (skipped.length > 0) console.log(`- não executados: ${skipped.join(', ')}`);

process.exit(results.every((r) => r.ok) && skipped.length === 0 ? 0 : 1);
