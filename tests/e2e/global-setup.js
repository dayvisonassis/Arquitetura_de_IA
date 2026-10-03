const { PROFILES, sessionIsValid } = require('./sessions')

module.exports = async function globalSetup() {
  const missing = PROFILES.filter(profile => !sessionIsValid(profile))
  if (missing.length === 0) {
    return
  }
  throw new Error(
    `No valid stored session for: ${missing.join(', ')}. ` +
      'The sign-in flow arrives with F04; until then the e2e harness cannot ' +
      'authenticate (GATES.md, e2e-frontend).'
  )
}
