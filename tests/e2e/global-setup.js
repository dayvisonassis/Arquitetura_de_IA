const {
  API_URL,
  PROFILES,
  credentials,
  envPrefix,
  readToken,
  tokenIsFresh,
  writeSession
} = require('./sessions')

const HINTS = {
  404: 'The sign-in endpoint arrives with F04.',
  401: 'Check the credentials in .env.e2e. The setup never retries, so a wrong password is sent once per run (5 in a row lock the account for 15 minutes).',
  403: 'The domain of this account is not active in the backend copy of the domains.',
  423: 'The account is locked for 15 minutes (README, "Autenticação").',
  429: 'The IP login limit was reached: in development, LOGIN_RATE_LIMIT_MAX should be 200 in apps/backend/.env.development (GATES.md, e2e-frontend).',
  503: 'The backend could not reach MySQL or Redis: check ./dev.sh.'
}

async function storedSessionWorks(profile) {
  const token = readToken(profile)
  if (!tokenIsFresh(token)) {
    return false
  }
  const response = await fetch(`${API_URL}/v2/me`, {
    headers: { Authorization: `Bearer ${token}` }
  })
  return response.status === 200
}

async function signIn(profile) {
  const { login, password } = credentials(profile)
  const prefix = envPrefix(profile)
  if (!login || !password) {
    throw new Error(
      `Missing ${prefix}_LOGIN or ${prefix}_PASSWORD. Copy config/.env.e2e.example ` +
        'to .env.e2e at the repository root and fill it in (GATES.md, e2e-frontend).'
    )
  }
  const response = await fetch(`${API_URL}/v2/auth/login`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ email: login, password })
  })
  const body = await response.json().catch(() => ({}))
  if (response.status !== 200 || !body.token || !body.expires_at) {
    const reason = body.message ? ` ("${body.message}")` : ''
    throw new Error(
      `Sign-in of the ${profile} profile (${login}) answered ${response.status}${reason}. ` +
        (HINTS[response.status] || '')
    )
  }
  writeSession(profile, { token: body.token, expires_at: body.expires_at })
}

module.exports = async function globalSetup() {
  for (const profile of PROFILES) {
    if (!(await storedSessionWorks(profile))) {
      await signIn(profile)
    }
  }
}
