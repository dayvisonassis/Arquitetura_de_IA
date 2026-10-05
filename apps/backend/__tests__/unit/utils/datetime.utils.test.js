import { formatClockTime } from '../../../src/utils/datetime.utils'

describe('datetime.utils', () => {
  beforeEach(() => {
    jest.clearAllMocks()
  })

  describe('formatClockTime', () => {
    it('should format the unlock time in America/Sao_Paulo', () => {
      expect(formatClockTime(new Date('2026-10-04T17:35:00Z'))).toBe('14:35')
    })

    it('should use the previous local day near midnight UTC', () => {
      expect(formatClockTime(new Date('2026-10-04T02:05:00Z'))).toBe('23:05')
    })

    it('should show local midnight as 00:00', () => {
      expect(formatClockTime(new Date('2026-10-04T03:00:00Z'))).toBe('00:00')
    })

    it('should pad hours and minutes to two digits', () => {
      expect(formatClockTime(new Date('2026-10-04T12:07:59Z'))).toBe('09:07')
    })

    it('should accept a timestamp in milliseconds', () => {
      expect(formatClockTime(Date.parse('2026-10-04T17:35:00Z'))).toBe('14:35')
    })
  })
})
