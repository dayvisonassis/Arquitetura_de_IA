import type { Knex } from 'knex'

const TABLE = 'catalog_suspensions'

export const up = async (knex: Knex): Promise<void> => {
  if (await knex.schema.hasTable(TABLE)) {
    return
  }
  await knex.schema.createTable(TABLE, table => {
    table
      .string('resource_type', 16)
      .notNullable()
      .checkIn(['capability', 'deployment'], 'ck_catalog_suspensions_type')
    table.string('resource_name', 60).notNullable()
    table.string('reason', 200).notNullable()
    table.string('actor', 254).notNullable()
    table
      .datetime('suspended_at', { precision: 3 })
      .notNullable()
      .defaultTo(knex.fn.now(3))
    table.primary(['resource_type', 'resource_name'], 'pk_catalog_suspensions')
  })
}

export const down = async (knex: Knex): Promise<void> => {
  await knex.schema.dropTableIfExists(TABLE)
}
