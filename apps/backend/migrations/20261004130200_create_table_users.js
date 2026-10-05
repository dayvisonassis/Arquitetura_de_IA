const TABLE = 'users'

exports.up = async knex => {
  if (await knex.schema.hasTable(TABLE)) {
    return
  }
  await knex.schema.createTable(TABLE, table => {
    table.specificType('id', 'BINARY(16)').notNullable().primary()
    table.specificType('dr_domain_id', 'BINARY(16)').notNullable()
    table.string('name', 100).notNullable()
    table.string('email', 254).notNullable()
    table.specificType('password_hash', 'CHAR(60)').notNullable()
    table.enu('role', ['domain_admin', 'user']).notNullable()
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
    table.unique(['email'], { indexName: 'uq_users_email' })
    table.index(['dr_domain_id'], 'ix_users_dr_domain_id')
    table
      .foreign('dr_domain_id', 'fk_users_dr_domain')
      .references('id')
      .inTable('dr_domain')
      .onDelete('RESTRICT')
  })
}

exports.down = async knex => {
  await knex.schema.dropTableIfExists(TABLE)
}
