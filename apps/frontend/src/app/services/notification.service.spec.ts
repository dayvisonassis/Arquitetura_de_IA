import { MatSnackBar } from '@angular/material/snack-bar'

import { NotificationService } from './notification.service'

const UNAVAILABLE =
  'Serviço temporariamente indisponível. Tente novamente em instantes.'

describe('NotificationService', () => {
  let service: NotificationService
  let snackBarMock: { open: jest.Mock }

  beforeEach(() => {
    jest.clearAllMocks()
    snackBarMock = { open: jest.fn() }
    service = new NotificationService(snackBarMock as unknown as MatSnackBar)
  })

  it('should open the snackbar with the unavailability message', () => {
    service.showUnavailable()

    expect(snackBarMock.open).toHaveBeenCalledTimes(1)
    expect(snackBarMock.open).toHaveBeenCalledWith(UNAVAILABLE, 'Fechar', {
      duration: 6000
    })
  })

  it('should open one snackbar per call', () => {
    service.showUnavailable()
    service.showUnavailable()

    expect(snackBarMock.open).toHaveBeenCalledTimes(2)
  })
})
