import Joi from 'joi'
import * as authService from '../../../services/auth.service'
import { AppError, MESSAGES } from '../../../utils/app-error.utils'

const loginSchema = Joi.object({
  email: Joi.string().trim().min(1).max(254).required(),
  password: Joi.string().min(1).required()
})

export const login = async (req, res, next) => {
  try {
    const { error, value } = loginSchema.validate(req.body ?? {})
    if (error) {
      throw new AppError(400, MESSAGES.badLoginRequest)
    }
    const session = await authService.login({
      email: value.email,
      password: value.password,
      ipAddress: req.ip,
      userAgent: req.get('user-agent')
    })
    res.set('Cache-Control', 'no-store').status(200).json(session)
  } catch (error) {
    next(error)
  }
}

export const logout = async (req, res, next) => {
  try {
    await authService.logout(req.sessionId)
    res.status(204).end()
  } catch (error) {
    next(error)
  }
}
