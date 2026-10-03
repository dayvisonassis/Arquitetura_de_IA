import { cleanupTestDatabase, setupTestDatabase } from '../utils/test-setup'

type Db = Awaited<ReturnType<typeof setupTestDatabase>>['db']

const ACCESS_DENIED = { code: 'ER_DBACCESS_DENIED_ERROR', errno: 1044 }

const firstColumn = (rows: Record<string, string>[]): string[] =>
  rows.map(row => Object.values(row)[0])

describe('MySQL isolation of the gateway_app user', () => {
  let db: Db
  const dbRead = () => db.getDb({ operation: 'read' })
  const dbWrite = () => db.getDb({ operation: 'write' })

  beforeAll(async () => {
    ;({ db } = await setupTestDatabase())
  })

  afterAll(async () => {
    await cleanupTestDatabase()
  })

  it('gateway_app should read its own test schema', async () => {
    const [rows] = await dbRead().raw('SHOW TABLES FROM ??', ['gateway_test'])

    expect(firstColumn(rows)).toContain('knex_migrations')
  })

  it('gateway_app should not read the web schema', async () => {
    await expect(
      dbRead().raw('SHOW TABLES FROM ??', ['web'])
    ).rejects.toMatchObject(ACCESS_DENIED)
  })

  it('gateway_app should not read the web_test schema', async () => {
    await expect(
      dbWrite().raw('SHOW TABLES FROM ??', ['web_test'])
    ).rejects.toMatchObject(ACCESS_DENIED)
  })

  it('gateway_app should hold no global privilege', async () => {
    const [rows] = await dbRead().raw('SHOW GRANTS FOR CURRENT_USER()')
    const grants = firstColumn(rows)

    expect(grants).toHaveLength(3)
    expect(grants).toContain('GRANT USAGE ON *.* TO `gateway_app`@`%`')
    expect(grants).toContain(
      'GRANT ALL PRIVILEGES ON `gateway`.* TO `gateway_app`@`%`'
    )
    expect(grants).toContain(
      'GRANT ALL PRIVILEGES ON `gateway_test`.* TO `gateway_app`@`%`'
    )
  })
})
