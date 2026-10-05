const TABLE = 'dr_domain'

exports.up = async knex => {
  if (await knex.schema.hasTable(TABLE)) {
    return
  }
  await knex.schema.createTable(TABLE, table => {
    table.specificType('id', 'BINARY(16)').notNullable().primary()
    table.string('name', 60).notNullable()
    table.enu('status', ['active', 'inactive', 'removed']).notNullable()
    table
      .datetime('created_at', { precision: 3 })
      .notNullable()
      .defaultTo(knex.fn.now(3))
    table
      .datetime('updated_at', { precision: 3 })
      .notNullable()
      .defaultTo(knex.fn.now(3))
  })
}

exports.down = async knex => {
  await knex.schema.dropTableIfExists(TABLE)
}
