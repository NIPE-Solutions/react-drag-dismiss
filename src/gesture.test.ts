import { describe, expect, test } from 'vitest'
import {
  applyResistance,
  getSettleDuration,
  decideDismiss,
  getAxis,
  getPhysicalSign,
  getRecentVelocity,
  resolveIntent,
  updateArmed,
} from './gesture'

describe('direction model', () => {
  test.each([
    ['start', 'ltr', -1],
    ['end', 'ltr', 1],
    ['start', 'rtl', 1],
    ['end', 'rtl', -1],
    ['up', 'ltr', -1],
    ['down', 'rtl', 1],
  ] as const)(
    '%s in %s maps to sign %i',
    (direction, writingDirection, sign) => {
      expect(getPhysicalSign(direction, writingDirection)).toBe(sign)
    },
  )

  test('maps directions to an axis', () => {
    expect(getAxis('start')).toBe('x')
    expect(getAxis('down')).toBe('y')
  })
})

describe('intent and resistance', () => {
  test('keeps small movement pending', () =>
    expect(resolveIntent(5, 2, 'x')).toBe('pending'))
  test('claims a dominant allowed axis', () =>
    expect(resolveIntent(12, 3, 'x')).toBe('claim'))
  test('abandons when the other axis wins', () =>
    expect(resolveIntent(3, 12, 'x')).toBe('abandon'))
  test('resists unsupported travel', () =>
    expect(applyResistance(-100, [1])).toBeCloseTo(-24))
  test('resists supported travel beyond the element size', () => {
    expect(applyResistance(400, [1], 200)).toBeCloseTo(233.94, 1)
  })
})

describe('velocity and commitment', () => {
  test('keeps armed intent through small threshold chatter', () => {
    expect(updateArmed(false, 1)).toBe(true)
    expect(updateArmed(true, 0.96)).toBe(true)
    expect(updateArmed(true, 0.9)).toBe(false)
  })
  test('uses recent samples and follows a reversal', () => {
    const samples = [
      { position: 0, time: 0 },
      { position: 90, time: 50 },
      { position: 80, time: 100 },
      { position: 55, time: 130 },
    ]
    expect(getRecentVelocity(samples, 130)).toBeLessThan(0)
  })

  test('a pause expires stale velocity', () => {
    const samples = [
      { position: 0, time: 0 },
      { position: 100, time: 40 },
    ]
    expect(getRecentVelocity(samples, 220)).toBe(0)
  })

  test('commits by distance', () => {
    expect(
      decideDismiss({
        offset: 81,
        size: 200,
        velocity: 0,
        allowedSigns: [1],
        threshold: 0.4,
      }),
    ).toBe(1)
  })

  test('requires meaningful flick distance', () => {
    expect(
      decideDismiss({
        offset: 5,
        size: 200,
        velocity: 1.2,
        allowedSigns: [1],
        threshold: 0.4,
      }),
    ).toBeNull()
    expect(
      decideDismiss({
        offset: 30,
        size: 200,
        velocity: 1.2,
        allowedSigns: [1],
        threshold: 0.4,
      }),
    ).toBe(1)
  })
})

describe('settle motion', () => {
  test('release velocity makes the same remaining distance settle faster within bounds', () => {
    expect(getSettleDuration(180, 0)).toBe(266)
    expect(getSettleDuration(180, 1.5)).toBeLessThan(266)
    expect(getSettleDuration(180, -1.5)).toBe(266)
    expect(getSettleDuration(180, 100)).toBeGreaterThanOrEqual(110)
    expect(getSettleDuration(2_000, 0)).toBeLessThanOrEqual(320)
  })
})
