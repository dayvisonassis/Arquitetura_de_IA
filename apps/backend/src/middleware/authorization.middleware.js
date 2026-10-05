import DomainModel from '../api/v2/models/domain.model'
import { AppError, MESSAGES, forbidden } from '../utils/app-error.utils'
import { isUuid, uuidToBin } from '../utils/uuid.utils'

const domainNotFound = () => new AppError(404, MESSAGES.domainNotFound)

const selectDomain = async req => {
  const requested = req.get('x-domain-id')
  if (!requested) {
    throw new AppError(400, MESSAGES.domainRequired)
  }
  if (!isUuid(requested)) {
    throw domainNotFound()
  }
  const domain = await DomainModel.findById(requested)
  if (!domain || domain.status === 'removed') {
    throw domainNotFound()
  }
  req.domainId = domain.id
  req.domainInBinary = uuidToBin(domain.id)
}

export const checkPermission = (area, action) => async (req, _res, next) => {
  try {
    if (!req.permissions?.has(`${area}.${action}`)) {
      throw forbidden()
    }
    if (req.identityType === 'platform') {
      await selectDomain(req)
    }
    next()
  } catch (error) {
    next(error)
  }
}

export const requirePlatformAdmin = (req, _res, next) => {
  next(req.identityType === 'platform' ? undefined : forbidden())
}
