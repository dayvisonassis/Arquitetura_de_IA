import db from '../../../../database'

const reader = () => db.getDb({ operation: 'read' })

class PermissionModel {
  async findByRole(role) {
    const rows = await reader()('role_permissions as rp')
      .join('permissions as p', 'p.id', 'rp.permission_id')
      .select('p.area', 'p.action')
      .where('rp.role', role)
      .orderBy([
        { column: 'p.area', order: 'asc' },
        { column: 'p.action', order: 'asc' }
      ])
    return rows.map(row => `${row.area}.${row.action}`)
  }
}

export default new PermissionModel()
