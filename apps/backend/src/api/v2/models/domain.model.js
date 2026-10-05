import db from '../../../../database'
import { binToUuid, uuidToBin } from '../../../utils/uuid.utils'

const TABLE = 'dr_domain'

const reader = trx => trx ?? db.getDb({ operation: 'read' })

class DomainModel {
  async findById(domainId, trx) {
    const row = await reader(trx)(TABLE)
      .select('id', 'name', 'status')
      .where('id', uuidToBin(domainId))
      .first()
    return row
      ? { id: binToUuid(row.id), name: row.name, status: row.status }
      : null
  }
}

export default new DomainModel()
