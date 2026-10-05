const PERMISSIONS = 'permissions'
const ROLE_PERMISSIONS = 'role_permissions'

const F04_PERMISSIONS = [
  { id: 400, area: 'users', action: 'read' },
  { id: 401, area: 'playground', action: 'read' }
]

const F04_ROLE_PERMISSIONS = [
  { role: 'domain_admin', permission_id: 400 },
  { role: 'platform_admin', permission_id: 400 },
  { role: 'domain_admin', permission_id: 401 },
  { role: 'user', permission_id: 401 }
]

exports.up = async knex => {
  if (!(await knex.schema.hasTable(PERMISSIONS))) {
    await knex.schema.createTable(PERMISSIONS, table => {
      table.integer('id').unsigned().notNullable().primary()
      table.string('area', 40).notNullable()
      table.enu('action', ['read', 'add', 'edit', 'remove']).notNullable()
      table.unique(['area', 'action'], {
        indexName: 'uq_permissions_area_action'
      })
    })
  }
  if (!(await knex.schema.hasTable(ROLE_PERMISSIONS))) {
    await knex.schema.createTable(ROLE_PERMISSIONS, table => {
      table
        .enu('role', ['platform_admin', 'domain_admin', 'user'])
        .notNullable()
      table.integer('permission_id').unsigned().notNullable()
      table.primary(['role', 'permission_id'])
      table
        .foreign('permission_id', 'fk_role_permissions_permission')
        .references('id')
        .inTable(PERMISSIONS)
    })
  }
  await knex(PERMISSIONS).insert(F04_PERMISSIONS).onConflict().ignore()
  await knex(ROLE_PERMISSIONS)
    .insert(F04_ROLE_PERMISSIONS)
    .onConflict()
    .ignore()
}

exports.down = async knex => {
  await knex.schema.dropTableIfExists(ROLE_PERMISSIONS)
  await knex.schema.dropTableIfExists(PERMISSIONS)
}
