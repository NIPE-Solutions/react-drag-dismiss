import {
  forwardRef,
  useCallback,
  useEffect,
  useImperativeHandle,
  useRef,
  useState,
  type CSSProperties,
  type HTMLAttributes,
  type PointerEvent as ReactPointerEvent,
} from 'react'
import {
  applyResistance,
  decideDismiss,
  getAxis,
  getPhysicalSign,
  getRecentVelocity,
  getSettleDuration,
  resolveIntent,
  updateArmed,
  type Axis,
  type DragDismissDirection,
  type PointerSample,
  type WritingDirection,
} from './gesture'

export interface DragDismissEvent {
  direction: DragDismissDirection
}

export interface DragDismissEndEvent {
  dismissed: boolean
  direction?: DragDismissDirection
}

type NativePointerProps =
  | 'onPointerDown'
  | 'onPointerMove'
  | 'onPointerUp'
  | 'onPointerCancel'
  | 'onLostPointerCapture'
  | 'onDragStart'
  | 'onDragEnd'

export interface DragDismissProps extends Omit<
  HTMLAttributes<HTMLDivElement>,
  NativePointerProps
> {
  directions?: readonly DragDismissDirection[]
  threshold?: number
  disabled?: boolean
  onDragStart?: () => void
  onDragEnd?: (event: DragDismissEndEvent) => void
  onDismiss?: (event: DragDismissEvent) => void
  onDismissComplete?: (event: DragDismissEvent) => void
}

interface GestureConfig {
  axis: Axis
  directions: readonly DragDismissDirection[]
  signs: readonly number[]
  writingDirection: WritingDirection
  threshold: number
  size: number
  onDragStart: (() => void) | undefined
  onDragEnd: ((event: DragDismissEndEvent) => void) | undefined
  onDismiss: ((event: DragDismissEvent) => void) | undefined
  onDismissComplete: ((event: DragDismissEvent) => void) | undefined
}

interface Session extends GestureConfig {
  pointerId: number
  startX: number
  startY: number
  startOffset: number
  status: 'pending' | 'claimed'
  samples: PointerSample[]
  blurHandler: () => void
  interruptedReturn: boolean
}

interface Motion extends GestureConfig {
  kind: 'return' | 'departure'
  direction: DragDismissDirection | undefined
  frame: number | null
}

const DEFAULT_DIRECTIONS = ['end'] as const
const editingSelector =
  'input, select, textarea, [contenteditable]:not([contenteditable="false"]), [data-drag-dismiss-ignore]'

function validateConfiguration(
  directions: readonly DragDismissDirection[],
  threshold: number,
): Axis {
  if (directions.length === 0)
    throw new Error('`directions` must contain at least one direction.')
  const first = directions[0] as DragDismissDirection
  const axis = getAxis(first)
  const differentAxis = directions.find(
    (direction) => getAxis(direction) !== axis,
  )
  if (differentAxis) {
    throw new Error(
      `\`directions\` must belong to one axis. Received "${first}" and "${differentAxis}".`,
    )
  }
  if (!Number.isFinite(threshold) || threshold <= 0 || threshold > 1) {
    throw new Error(
      '`threshold` must be a finite number greater than 0 and less than or equal to 1.',
    )
  }
  return axis
}

function resolveWritingDirection(element: HTMLElement): WritingDirection {
  const explicit = element.closest('[dir]')?.getAttribute('dir')
  if (explicit === 'rtl') return 'rtl'
  if (explicit === 'ltr') return 'ltr'
  return getComputedStyle(element).direction === 'rtl' ? 'rtl' : 'ltr'
}

function directionForSign(
  directions: readonly DragDismissDirection[],
  direction: WritingDirection,
  sign: number,
): DragDismissDirection | undefined {
  return directions.find(
    (candidate) => getPhysicalSign(candidate, direction) === sign,
  )
}

function initializeContinuousStyles(node: HTMLElement) {
  node.style.translate = '0px 0px'
  node.style.setProperty('--drag-dismiss-offset', '0px')
  node.style.setProperty('--drag-dismiss-progress', '0')
}

export const DragDismiss = forwardRef<HTMLDivElement, DragDismissProps>(
  function DragDismiss(
    {
      children,
      directions = DEFAULT_DIRECTIONS,
      threshold = 0.4,
      disabled = false,
      onDragStart,
      onDragEnd,
      onDismiss,
      onDismissComplete,
      onClickCapture,
      style,
      ...props
    },
    forwardedRef,
  ) {
    const axis = validateConfiguration(directions, threshold)
    const nodeRef = useRef<HTMLDivElement>(null)
    const sessionRef = useRef<Session | null>(null)
    const motionRef = useRef<Motion | null>(null)
    const offsetRef = useRef(0)
    const suppressClickRef = useRef(false)
    const committedRef = useRef(false)
    const armedRef = useRef(false)
    const mountedRef = useRef(false)
    const [state, setState] = useState<
      'idle' | 'dragging' | 'settling' | 'dismissed'
    >('idle')

    const setNodeRef = useCallback((node: HTMLDivElement | null) => {
      nodeRef.current = node
      if (node) initializeContinuousStyles(node)
    }, [])

    useImperativeHandle(forwardedRef, () => nodeRef.current as HTMLDivElement)

    function writeContinuous(offset: number, config: GestureConfig) {
      const node = nodeRef.current
      if (!node) return
      offsetRef.current = offset
      const x = config.axis === 'x' ? offset : 0
      const y = config.axis === 'y' ? offset : 0
      node.style.translate = `${x}px ${y}px`
      node.style.setProperty('--drag-dismiss-offset', `${offset}px`)
      node.style.setProperty(
        '--drag-dismiss-progress',
        String(offset / (config.size * config.threshold)),
      )
      const activeDirection = directionForSign(
        config.directions,
        config.writingDirection,
        Math.sign(offset),
      )
      if (activeDirection) node.setAttribute('data-direction', activeDirection)
      else node.removeAttribute('data-direction')
      const supported = config.signs.includes(Math.sign(offset))
      const armed = supported
        ? updateArmed(
            armedRef.current,
            Math.abs(offset) / (config.size * config.threshold),
          )
        : false
      armedRef.current = armed
      if (armed) node.setAttribute('data-dismiss-intent', 'true')
      else node.removeAttribute('data-dismiss-intent')
    }

    function detachSession(session: Session | null) {
      if (!session) return
      window.removeEventListener('blur', session.blurHandler)
      if (sessionRef.current === session) sessionRef.current = null
    }

    function stopMotion(allowDeparture = false) {
      const motion = motionRef.current
      if (!motion || (motion.kind === 'departure' && !allowDeparture))
        return false
      if (motion.frame !== null) cancelAnimationFrame(motion.frame)
      motionRef.current = null
      return true
    }

    function finishMotion(motion: Motion, target: number) {
      if (motionRef.current !== motion || !mountedRef.current) return
      writeContinuous(target, motion)
      motionRef.current = null
      if (motion.kind === 'departure' && motion.direction) {
        setState('dismissed')
        motion.onDismissComplete?.({ direction: motion.direction })
      } else {
        setState('idle')
      }
    }

    function settleTo(
      config: GestureConfig,
      target: number,
      initialVelocity: number,
      kind: Motion['kind'],
      direction?: DragDismissDirection,
    ) {
      stopMotion(true)
      if (!nodeRef.current) return
      const motion: Motion = {
        ...config,
        kind,
        direction,
        frame: null,
      }
      motionRef.current = motion
      setState(kind === 'return' ? 'settling' : 'dismissed')
      const start = offsetRef.current
      const distance = target - start
      const reduceMotion = window.matchMedia?.(
        '(prefers-reduced-motion: reduce)',
      ).matches
      if (reduceMotion || Math.abs(distance) < 0.5) {
        queueMicrotask(() => finishMotion(motion, target))
        return
      }
      const began = performance.now()
      const duration = getSettleDuration(distance, initialVelocity)
      const tick = (now: number) => {
        if (motionRef.current !== motion || !mountedRef.current) return
        const progress = Math.min(1, (now - began) / duration)
        const eased = 1 - Math.pow(1 - progress, 3)
        writeContinuous(start + distance * eased, motion)
        if (progress < 1) motion.frame = requestAnimationFrame(tick)
        else finishMotion(motion, target)
      }
      motion.frame = requestAnimationFrame(tick)
    }

    function cancelGesture() {
      const session = sessionRef.current
      if (!session) return
      const claimed = session.status === 'claimed'
      detachSession(session)
      if (claimed) {
        session.onDragEnd?.({ dismissed: false })
        settleTo(session, 0, 0, 'return')
      } else if (session.interruptedReturn && offsetRef.current !== 0) {
        settleTo(session, 0, 0, 'return')
      } else setState('idle')
    }

    function handlePointerDown(event: ReactPointerEvent<HTMLDivElement>) {
      if (
        disabled ||
        committedRef.current ||
        !event.isPrimary ||
        event.button !== 0 ||
        sessionRef.current
      )
        return
      if (
        event.target instanceof Element &&
        event.target.closest(editingSelector)
      )
        return
      suppressClickRef.current = false
      if (motionRef.current?.kind === 'departure') return
      const interruptedReturn = motionRef.current?.kind === 'return'
      stopMotion()
      const node = nodeRef.current
      if (!node) return
      const rect = node.getBoundingClientRect()
      const writingDirection = resolveWritingDirection(node)
      const snapshotDirections = [...directions]
      const snapshotAxis = getAxis(
        snapshotDirections[0] as DragDismissDirection,
      )
      const session: Session = {
        pointerId: event.pointerId,
        startX: event.clientX,
        startY: event.clientY,
        startOffset: offsetRef.current,
        size: Math.max(1, snapshotAxis === 'x' ? rect.width : rect.height),
        status: 'pending',
        samples: [{ position: offsetRef.current, time: event.timeStamp }],
        axis: snapshotAxis,
        directions: snapshotDirections,
        signs: snapshotDirections.map((candidate) =>
          getPhysicalSign(candidate, writingDirection),
        ),
        writingDirection,
        threshold,
        onDragStart,
        onDragEnd,
        onDismiss,
        onDismissComplete,
        blurHandler: () => {},
        interruptedReturn,
      }
      session.blurHandler = () => cancelGesture()
      sessionRef.current = session
      window.addEventListener('blur', session.blurHandler)
    }

    function handlePointerMove(event: ReactPointerEvent<HTMLDivElement>) {
      const session = sessionRef.current
      if (!session || session.pointerId !== event.pointerId) return
      const movementX = event.clientX - session.startX
      const movementY = event.clientY - session.startY
      if (session.status === 'pending') {
        const intent = resolveIntent(movementX, movementY, session.axis)
        if (intent === 'pending') return
        if (intent === 'abandon') {
          detachSession(session)
          if (session.interruptedReturn && offsetRef.current !== 0)
            settleTo(session, 0, 0, 'return')
          else setState('idle')
          return
        }
        session.status = 'claimed'
        event.currentTarget.setPointerCapture?.(event.pointerId)
        setState('dragging')
        session.onDragStart?.()
      }
      event.preventDefault()
      const rawOffset =
        session.startOffset + (session.axis === 'x' ? movementX : movementY)
      const offset = applyResistance(rawOffset, session.signs, session.size)
      writeContinuous(offset, session)
      session.samples.push({ position: offset, time: event.timeStamp })
      session.samples = session.samples.filter(
        (sample) => event.timeStamp - sample.time <= 140,
      )
    }

    function finishGesture(
      event: ReactPointerEvent<HTMLDivElement>,
      canceled = false,
    ) {
      const session = sessionRef.current
      if (!session || session.pointerId !== event.pointerId) return
      detachSession(session)
      if (session.status !== 'claimed') {
        if (session.interruptedReturn && offsetRef.current !== 0)
          settleTo(session, 0, 0, 'return')
        else setState('idle')
        return
      }
      event.currentTarget.releasePointerCapture?.(event.pointerId)
      // A canceled pointer stream does not produce a release click. Keeping
      // suppression armed here would swallow the next unrelated interaction.
      suppressClickRef.current = !canceled
      const velocity = canceled
        ? 0
        : getRecentVelocity(session.samples, event.timeStamp)
      const sign = canceled
        ? null
        : decideDismiss({
            offset: offsetRef.current,
            size: session.size,
            velocity,
            allowedSigns: session.signs,
            threshold: session.threshold,
          })
      const dismissedDirection =
        sign === null
          ? undefined
          : directionForSign(session.directions, session.writingDirection, sign)
      if (sign === null || !dismissedDirection) {
        session.onDragEnd?.({ dismissed: false })
        settleTo(session, 0, velocity, 'return')
        return
      }
      committedRef.current = true
      setState('dismissed')
      session.onDragEnd?.({ dismissed: true, direction: dismissedDirection })
      session.onDismiss?.({ direction: dismissedDirection })
      settleTo(
        session,
        sign * Math.max(session.size + 16, Math.abs(offsetRef.current) + 16),
        velocity,
        'departure',
        dismissedDirection,
      )
    }

    useEffect(() => {
      mountedRef.current = true
      return () => {
        mountedRef.current = false
        detachSession(sessionRef.current)
        stopMotion(true)
      }
    }, [])

    useEffect(() => {
      if (disabled) cancelGesture()
    }, [disabled])

    const mechanicalStyle: CSSProperties = {
      ...style,
      touchAction: disabled
        ? style?.touchAction
        : axis === 'x'
          ? 'pan-y'
          : 'pan-x',
    }

    return (
      <div
        {...props}
        ref={setNodeRef}
        style={mechanicalStyle}
        data-drag-dismiss=""
        data-state={state}
        data-disabled={disabled ? '' : undefined}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={finishGesture}
        onPointerCancel={(event) => finishGesture(event, true)}
        onLostPointerCapture={(event) => {
          if (sessionRef.current?.pointerId === event.pointerId)
            finishGesture(event, true)
        }}
        onClickCapture={(event) => {
          if (suppressClickRef.current && event.detail > 0) {
            suppressClickRef.current = false
            event.preventDefault()
            event.stopPropagation()
            return
          }
          onClickCapture?.(event)
        }}
      >
        {children}
      </div>
    )
  },
)
