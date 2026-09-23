// Orquestrador dos quality gates.
//   node scripts/runGate.mjs            -> todos, na ordem abaixo
//   node scripts/runGate.mjs lint arch  -> só os ids pedidos (sempre na ordem do registro)
// Para na primeira falha e sai com código 1.
import { spawnSync } from 'node:child_process';

const sh = (command) => () => {
  console.log(`$ ${command}`);
  return spawnSync(command, { stdio: 'inherit', shell: true }).status === 0;
};

const all = (...steps) => () => steps.every((step) => step());

// Do mais barato ao mais caro.
const GATES = [
  { id: 'typecheck', label: 'Tipos (tsc --noEmit)', run: sh('npx tsc --noEmit') },
  { id: 'lint', label: 'Lint, zero warnings', run: sh('npx eslint . --max-warnings=0') },
  { id: 'build', label: 'Build (tsc)', run: sh('npx tsc -p tsconfig.build.json') },
  {
    id: 'arch',
    label: 'Arquitetura MVC',
    run: all(sh('npx depcruise src --config .dependency-cruiser.cjs'), sh('node scripts/check-architecture.mjs')),
  },
  { id: 'tests', label: 'Testes + cobertura mínima', run: sh('npx jest --coverage') },
  { id: 'deadcode', label: 'Código morto (knip)', run: sh('npx knip') },
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
  const ok = gate.run();
  results.push({ id: gate.id, ok, ms: Date.now() - started });
  if (!ok) break;
}

console.log('\n━━ Resultado');
for (const { id, ok, ms } of results) console.log(`${ok ? '✓' : '✗'} [${id}] ${(ms / 1000).toFixed(1)}s`);
const skipped = selected.slice(results.length).map((gate) => gate.id);
if (skipped.length > 0) console.log(`- não executados: ${skipped.join(', ')}`);

process.exit(results.every((r) => r.ok) && skipped.length === 0 ? 0 : 1);
