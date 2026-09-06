export type DragDismissDirection = 'start' | 'end' | 'up' | 'down'
export type WritingDirection = 'ltr' | 'rtl'
export type Axis = 'x' | 'y'
export type GestureIntent = 'pending' | 'claim' | 'abandon'

export interface PointerSample {
  position: number
  time: number
}

export function getAxis(direction: DragDismissDirection): Axis {
  return direction === 'start' || direction === 'end' ? 'x' : 'y'
}

export function getPhysicalSign(
  direction: DragDismissDirection,
  writingDirection: WritingDirection,
): -1 | 1 {
  if (direction === 'up') return -1
  if (direction === 'down') return 1
  if (direction === 'start') return writingDirection === 'rtl' ? 1 : -1
  return writingDirection === 'rtl' ? -1 : 1
}

export function resolveIntent(
  movementX: number,
  movementY: number,
  axis: Axis,
  deadZone = 8,
  dominance = 1.2,
): GestureIntent {
  const primary = Math.abs(axis === 'x' ? movementX : movementY)
  const secondary = Math.abs(axis === 'x' ? movementY : movementX)
  if (Math.hypot(movementX, movementY) < deadZone) return 'pending'
  if (primary > secondary * dominance) return 'claim'
  if (secondary > primary * dominance) return 'abandon'
  return 'pending'
}

export function applyResistance(
  offset: number,
  allowedSigns: readonly number[],
  limit = Number.POSITIVE_INFINITY,
): number {
  const sign = Math.sign(offset)
  if (offset === 0) return offset
  if (!allowedSigns.includes(sign))
    return sign * Math.sqrt(Math.abs(offset)) * 2.4
  const absoluteOffset = Math.abs(offset)
  if (absoluteOffset <= limit) return offset
  return sign * (limit + Math.sqrt(absoluteOffset - limit) * 2.4)
}

export function updateArmed(
  previouslyArmed: boolean,
  absoluteProgress: number,
  hysteresis = 0.08,
): boolean {
  return previouslyArmed
    ? absoluteProgress >= 1 - hysteresis
    : absoluteProgress >= 1
}

export function getRecentVelocity(
  samples: readonly PointerSample[],
  now: number,
  windowMs = 100,
): number {
  const recent = samples.filter((sample) => now - sample.time <= windowMs)
  if (recent.length < 2) return 0
  const first = recent[0]
  const last = recent.at(-1)
  if (!first || !last || last.time === first.time) return 0

  const meanTime =
    recent.reduce((sum, sample) => sum + sample.time, 0) / recent.length
  const meanPosition =
    recent.reduce((sum, sample) => sum + sample.position, 0) / recent.length
  let numerator = 0
  let denominator = 0
  for (const sample of recent) {
    const deltaTime = sample.time - meanTime
    numerator += deltaTime * (sample.position - meanPosition)
    denominator += deltaTime * deltaTime
  }
  return denominator === 0 ? 0 : numerator / denominator
}

export function getSettleDuration(
  distance: number,
  initialVelocity: number,
): number {
  const absoluteDistance = Math.abs(distance)
  const base = Math.min(320, Math.max(160, 140 + absoluteDistance * 0.7))
  const alignedVelocity = Math.max(
    0,
    Math.sign(distance) *
      (Number.isFinite(initialVelocity) ? initialVelocity : 0),
  )
  const velocityFactor = 1 - Math.min(0.58, alignedVelocity * 0.28)
  return Math.round(Math.min(320, Math.max(110, base * velocityFactor)))
}

export interface DismissDecision {
  offset: number
  size: number
  velocity: number
  allowedSigns: readonly number[]
  threshold: number
  flickVelocity?: number
  minimumFlickDistance?: number
}

export function decideDismiss({
  offset,
  size,
  velocity,
  allowedSigns,
  threshold,
  flickVelocity = 0.65,
  minimumFlickDistance = 20,
}: DismissDecision): -1 | 1 | null {
  const sign = Math.sign(offset) as -1 | 0 | 1
  if (sign === 0 || !allowedSigns.includes(sign)) return null
  if (Math.abs(offset) >= size * threshold) return sign
  if (
    Math.abs(offset) >= minimumFlickDistance &&
    Math.abs(velocity) >= flickVelocity &&
    Math.sign(velocity) === sign
  ) {
    return sign
  }
  return null
}
