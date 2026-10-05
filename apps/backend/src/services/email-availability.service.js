import PlatformUserModel from '../models/platform-user.model'
import UserModel from '../api/v2/models/user.model'
import { normalizeEmail } from '../utils/email.utils'

export const isEmailTaken = async (email, { trx } = {}) => {
  const normalized = normalizeEmail(email)
  const [inPlatform, inDomains] = await Promise.all([
    PlatformUserModel.emailExists(normalized, trx),
    UserModel.emailExists(normalized, trx)
  ])
  return inPlatform || inDomains
}
