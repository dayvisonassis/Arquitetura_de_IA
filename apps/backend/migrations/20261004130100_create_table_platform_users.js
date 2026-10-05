const TABLE = 'platform_users'

exports.up = async knex => {
  if (await knex.schema.hasTable(TABLE)) {
    return
  }
  await knex.schema.createTable(TABLE, table => {
    table.specificType('id', 'BINARY(16)').notNullable().primary()
    table.string('name', 100).notNullable()
    table.string('email', 254).notNullable()
    table.specificType('password_hash', 'CHAR(60)').notNullable()
    table
      .enu('role', ['platform_admin'])
      .notNullable()
      .defaultTo('platform_admin')
    table.tinyint('failed_attempts').unsigned().notNullable().defaultTo(0)
    table.datetime('locked_until', { precision: 3 }).nullable()
    table.datetime('last_login_at', { precision: 3 }).nullable()
    table
      .datetime('created_at', { precision: 3 })
      .notNullable()
      .defaultTo(knex.fn.now(3))
    table
      .datetime('updated_at', { precision: 3 })
      .notNullable()
      .defaultTo(knex.fn.now(3))
    table.unique(['email'], { indexName: 'uq_platform_users_email' })
  })
}

exports.down = async knex => {
  await knex.schema.dropTableIfExists(TABLE)
}
