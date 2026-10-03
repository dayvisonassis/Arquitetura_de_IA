const fs = require('fs')
const path = require('path')

// PactV3 merges new interactions into an existing pact file, so the backend
// pacts are removed once per run, before the whole contracts suite.
const CONSUMER = 'ai-gateway-backend'
const PACT_DIR =
  process.env.PACT_DIR ||
  path.resolve(__dirname, '..', '..', '..', '..', 'contracts', 'pacts')

function resetPacts(dir = PACT_DIR) {
  if (!fs.existsSync(dir)) {
    return []
  }
  const removed = fs
    .readdirSync(dir)
    .filter(name => name.endsWith('.json'))
    .filter(name => {
      const pact = JSON.parse(fs.readFileSync(path.join(dir, name), 'utf8'))
      return pact.consumer?.name === CONSUMER
    })
  for (const name of removed) {
    fs.rmSync(path.join(dir, name))
  }
  return removed
}

if (require.main === module) {
  const removed = resetPacts()
  process.stdout.write(
    `reset-pacts: removed ${removed.length} pact(s) from ${PACT_DIR}\n`
  )
}

module.exports = { CONSUMER, PACT_DIR, resetPacts }
