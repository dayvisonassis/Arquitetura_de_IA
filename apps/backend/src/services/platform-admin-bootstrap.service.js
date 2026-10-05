import bcrypt from 'bcrypt'
import logger from '../logger'
import PlatformUserModel from '../models/platform-user.model'
import UserModel from '../api/v2/models/user.model'
import { normalizeEmail } from '../utils/email.utils'
import { BCRYPT_COST } from '../utils/password.utils'

const PLATFORM_ADMIN_NAME = 'Administrador da plataforma'

export const ensurePlatformAdmin = async ({ email, password }) => {
  if (await PlatformUserModel.existsAny()) {
    logger.info('Platform admin already present')
    return { created: false }
  }
  const normalized = normalizeEmail(email)
  if (await UserModel.emailExists(normalized)) {
    throw new Error('PLATFORM_ADMIN_EMAIL is already used by a domain user')
  }
  const passwordHash = await bcrypt.hash(password, BCRYPT_COST)
  const id = await PlatformUserModel.create({
    name: PLATFORM_ADMIN_NAME,
    email: normalized,
    passwordHash
  })
  logger.info({ platformUserId: id }, 'Platform admin created')
  return { created: true, id }
}
