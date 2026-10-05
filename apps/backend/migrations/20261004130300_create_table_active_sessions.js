const TABLE = 'active_sessions'

exports.up = async knex => {
  if (await knex.schema.hasTable(TABLE)) {
    return
  }
  await knex.schema.createTable(TABLE, table => {
    table.specificType('id', 'BINARY(16)').notNullable().primary()
    table.specificType('platform_user_id', 'BINARY(16)').nullable()
    table.specificType('user_id', 'BINARY(16)').nullable()
    table
      .datetime('created_at', { precision: 3 })
      .notNullable()
      .defaultTo(knex.fn.now(3))
    table.datetime('expires_at', { precision: 3 }).notNullable()
    table.datetime('revoked_at', { precision: 3 }).nullable()
    table.string('revoked_reason', 40).nullable()
    table.string('ip_address', 45).nullable()
    table.string('user_agent', 255).nullable()
    table.index(['user_id', 'revoked_at'], 'ix_active_sessions_user_id')
    table.index(
      ['platform_user_id', 'revoked_at'],
      'ix_active_sessions_platform_user_id'
    )
    table
      .foreign('platform_user_id', 'fk_active_sessions_platform_user')
      .references('id')
      .inTable('platform_users')
      .onDelete('CASCADE')
    table
      .foreign('user_id', 'fk_active_sessions_user')
      .references('id')
      .inTable('users')
      .onDelete('CASCADE')
    table.check(
      '(?? IS NULL) <> (?? IS NULL)',
      ['platform_user_id', 'user_id'],
      'ck_active_sessions_owner'
    )
  })
}

exports.down = async knex => {
  await knex.schema.dropTableIfExists(TABLE)
}
