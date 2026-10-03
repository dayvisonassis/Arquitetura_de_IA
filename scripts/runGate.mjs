import {
  arch,
  buildAngular,
  buildWithNpm,
  buildWithTsc,
  deadcode,
  forApps,
  lint,
  NOOP,
  tests,
  typecheck
} from './gates/code.mjs'
import { dataAccessGate } from './gates/data-access.mjs'
import { e2eGate, SKIPPED } from './gates/e2e.mjs'
import {
  APPS,
  appScope,
  BACKEND,
  createScope,
  FRONTEND,
  GateError,
  MONOREPO_APPS
} from './gates/scope.mjs'
import { stylesGate } from './gates/styles.mjs'

const GATES = [
  {
    id: 'typecheck-frontend',
    label: 'Type contract of the frontend (code and specs)',
    run: scope =>
      forApps(scope, [FRONTEND], target =>
        typecheck(target, 'tsconfig.gate.json')
      )
  },
  {
    id: 'typecheck-monorepo',
    label: 'Type contract of ia and ia_simulator (code and tests)',
    run: scope =>
      forApps(scope, MONOREPO_APPS, target =>
        typecheck(target, 'tsconfig.eslint.json')
      )
  },
  {
    id: 'lint-backend',
    label: 'Backend lint, zero warnings',
    run: scope =>
      forApps(scope, [BACKEND], target => lint(target, { extensions: ['.js'] }))
  },
  {
    id: 'raw-sql-backend',
    label: 'No new knex raw SQL in the backend (no-knex-raw)',
    run: scope =>
      forApps(scope, [BACKEND], target => dataAccessGate(target, 'no-knex-raw'))
  },
  {
    id: 'query-loop-backend',
    label: 'No database call inside a loop in the backend (no-query-in-loop)',
    run: scope =>
      forApps(scope, [BACKEND], target =>
        dataAccessGate(target, 'no-query-in-loop')
      )
  },
  {
    id: 'lint-frontend',
    label: 'Frontend lint, zero warnings',
    run: scope =>
      forApps(scope, [FRONTEND], target =>
        lint(target, { extensions: ['.ts', '.html'], under: 'src/' })
      )
  },
  {
    id: 'lint-monorepo',
    label: 'Lint of ia and ia_simulator, zero warnings',
    run: scope =>
      forApps(scope, MONOREPO_APPS, target =>
        lint(target, { extensions: ['.ts', '.js'] })
      )
  },
  {
    id: 'styles-frontend',
    label: 'Design-system rules: stylelint, template rules, no .component.scss',
    run: scope => forApps(scope, [FRONTEND], stylesGate)
  },
  {
    id: 'build-backend',
    label: 'Backend builds with Babel',
    run: scope => forApps(scope, [BACKEND], buildWithNpm)
  },
  {
    id: 'build-monorepo',
    label: 'ia and ia_simulator build with tsc',
    run: scope => forApps(scope, MONOREPO_APPS, buildWithTsc)
  },
  {
    id: 'build-frontend',
    label: 'Frontend production build (AOT, checks templates)',
    optIn: true,
    run: scope => buildAngular(appScope(scope, FRONTEND))
  },
  {
    id: 'arch',
    label: 'Architecture: app boundaries, layers, env and listen rules',
    run: scope => forApps(scope, APPS, arch)
  },
  {
    id: 'tests-backend',
    label: 'Backend unit tests, coverage >= 80% on changed sources',
    run: scope => forApps(scope, [BACKEND], tests)
  },
  {
    id: 'tests-frontend',
    label: 'Frontend unit tests, coverage >= 80% on changed sources',
    run: scope => forApps(scope, [FRONTEND], tests)
  },
  {
    id: 'tests-monorepo',
    label: 'ia and ia_simulator unit tests, coverage >= 80% on changed sources',
    run: scope => forApps(scope, MONOREPO_APPS, tests)
  },
  {
    id: 'deadcode',
    label: 'Unused files, exports and dependencies (knip)',
    run: scope => forApps(scope, APPS, deadcode)
  },
  {
    id: 'e2e-frontend',
    label: 'User flows in a browser against the running app',
    optIn: true,
    run: e2eGate
  }
]

const STATUS = {
  [NOOP]: 'PASS (nothing to check)',
  [SKIPPED]: 'SKIPPED',
  true: 'PASS',
  false: 'FAIL'
}

function parseArguments(args) {
  const byId = new Map(GATES.map(gate => [gate.id, gate]))
  if (args.length > 0 && byId.has(args[0])) {
    return { gates: [byId.get(args[0])], paths: args.slice(1) }
  }
  return { gates: GATES.filter(gate => !gate.optIn), paths: args }
}

async function runOne(gate, scope) {
  try {
    return await gate.run(scope)
  } catch (error) {
    if (error instanceof GateError) {
      console.error(`  ${error.message}`)
      return false
    }
    throw error
  }
}

async function main() {
  const { gates, paths } = parseArguments(process.argv.slice(2))
  const scope = createScope(paths)
  console.log(`Gate scope: ${scope.description}`)
  const summary = []
  for (const gate of gates) {
    console.log(`\n>> ${gate.id}: ${gate.label}`)
    const outcome = await runOne(gate, scope)
    summary.push([gate.id, STATUS[outcome]])
    if (outcome === false) {
      break
    }
  }
  const notRun = gates.slice(summary.length).map(gate => [gate.id, 'NOT RUN'])
  console.log('\nSummary')
  for (const [id, status] of [...summary, ...notRun]) {
    console.log(`  ${status.padEnd(24)} ${id}`)
  }
  return summary.every(([, status]) => status !== 'FAIL')
}

main()
  .then(passed => process.exit(passed ? 0 : 1))
  .catch(error => {
    if (error instanceof GateError) {
      console.error(error.message)
      process.exit(1)
    }
    throw error
  })
