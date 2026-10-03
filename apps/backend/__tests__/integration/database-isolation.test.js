const {
  setupTestDatabase,
  cleanupTestDatabase
} = require('../utils/test-setup')

const ACCESS_DENIED = { code: 'ER_DBACCESS_DENIED_ERROR', errno: 1044 }

describe('MySQL isolation of the web_app user', () => {
  let db
  const dbRead = () => db.getDb({ operation: 'read' })
  const dbWrite = () => db.getDb({ operation: 'write' })

  beforeAll(async () => {
    ;({ db } = await setupTestDatabase())
  })

  afterAll(async () => {
    await cleanupTestDatabase()
  })

  it('web_app should read its own test schema', async () => {
    const [rows] = await dbRead().raw('SHOW TABLES FROM ??', ['web_test'])

    expect(rows.map(row => Object.values(row)[0])).toContain('knex_migrations')
  })

  it('web_app should not read the gateway schema', async () => {
    await expect(
      dbRead().raw('SHOW TABLES FROM ??', ['gateway'])
    ).rejects.toMatchObject(ACCESS_DENIED)
  })

  it('web_app should not read the gateway_test schema', async () => {
    await expect(
      dbWrite().raw('SHOW TABLES FROM ??', ['gateway_test'])
    ).rejects.toMatchObject(ACCESS_DENIED)
  })

  it('web_app should hold no global privilege', async () => {
    const [rows] = await dbRead().raw('SHOW GRANTS FOR CURRENT_USER()')
    const grants = rows.map(row => Object.values(row)[0])

    expect(grants).toHaveLength(3)
    expect(grants).toContain('GRANT USAGE ON *.* TO `web_app`@`%`')
    expect(grants).toContain('GRANT ALL PRIVILEGES ON `web`.* TO `web_app`@`%`')
    expect(grants).toContain(
      'GRANT ALL PRIVILEGES ON `web_test`.* TO `web_app`@`%`'
    )
  })
})
