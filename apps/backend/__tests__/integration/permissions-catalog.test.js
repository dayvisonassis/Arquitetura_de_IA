const {
  setupTestDatabase,
  cleanupTestDatabase
} = require('../utils/test-setup')

const F04_PERMISSION_IDS = [400, 401]

describe('Permission catalog migration', () => {
  let db
  const dbRead = () => db.getDb({ operation: 'read' })

  beforeAll(async () => {
    ;({ db } = await setupTestDatabase())
  })

  afterAll(async () => {
    await cleanupTestDatabase()
  })

  it('should hold the F04 permission rows', async () => {
    const rows = await dbRead()('permissions')
      .select('id', 'area', 'action')
      .whereIn('id', F04_PERMISSION_IDS)
      .orderBy('id')

    expect(rows).toEqual([
      { id: 400, area: 'users', action: 'read' },
      { id: 401, area: 'playground', action: 'read' }
    ])
  })

  it('should map the F04 permissions to the roles', async () => {
    const rows = await dbRead()('role_permissions')
      .select('role', 'permission_id')
      .whereIn('permission_id', F04_PERMISSION_IDS)

    // MySQL sorts an ENUM by its declared position, so the order is set here.
    const pairs = rows.map(row => `${row.role}:${row.permission_id}`).sort()
    expect(pairs).toEqual([
      'domain_admin:400',
      'domain_admin:401',
      'platform_admin:400',
      'user:401'
    ])
  })
})
