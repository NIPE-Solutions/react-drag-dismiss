import {
  forwardRef,
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
}

interface Session {
  pointerId: number
  startX: number
  startY: number
  startOffset: number
  size: number
  status: 'pending' | 'claimed' | 'abandoned'
  samples: PointerSample[]
}

type DragStyle = CSSProperties & {
  '--drag-dismiss-offset'?: string
  '--drag-dismiss-progress'?: number
}

const interactiveSelector =
  'button, a[href], input, select, textarea, [contenteditable="true"]'

function writingDirection(element: HTMLElement): WritingDirection {
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

export const DragDismiss = forwardRef<HTMLDivElement, DragDismissProps>(
  function DragDismiss(
    {
      children,
      directions = ['end'],
      threshold = 0.4,
      disabled = false,
      onDragStart,
      onDragEnd,
      onDismiss,
      onClickCapture,
      style,
      ...props
    },
    forwardedRef,
  ) {
    const nodeRef = useRef<HTMLDivElement>(null)
    const sessionRef = useRef<Session | null>(null)
    const frameRef = useRef<number | null>(null)
    const offsetRef = useRef(0)
    const suppressClickRef = useRef(false)
    const committedRef = useRef(false)
    const armedRef = useRef(false)
    const [state, setState] = useState<
      'idle' | 'dragging' | 'settling' | 'dismissed'
    >('idle')

    useImperativeHandle(forwardedRef, () => nodeRef.current as HTMLDivElement)

    const axis: Axis = getAxis(directions[0] ?? 'end')
    const activeDirections = directions.filter(
      (direction) => getAxis(direction) === axis,
    )

    function renderOffset(offset: number, size: number) {
      const node = nodeRef.current
      if (!node) return
      offsetRef.current = offset
      const x = axis === 'x' ? offset : 0
      const y = axis === 'y' ? offset : 0
      node.style.transform = `translate3d(${x}px, ${y}px, 0)`
      node.style.setProperty('--drag-dismiss-offset', `${offset}px`)
      node.style.setProperty(
        '--drag-dismiss-progress',
        String(size > 0 ? offset / (size * threshold) : 0),
      )
      const dir = writingDirection(node)
      const allowedSigns = activeDirections.map((candidate) =>
        getPhysicalSign(candidate, dir),
      )
      const activeDirection = directionForSign(
        activeDirections,
        dir,
        Math.sign(offset),
      )
      if (activeDirection) node.setAttribute('data-direction', activeDirection)
      else node.removeAttribute('data-direction')
      const supported = allowedSigns.some((sign) => sign === Math.sign(offset))
      const armed = supported
        ? updateArmed(armedRef.current, Math.abs(offset) / (size * threshold))
        : false
      armedRef.current = armed
      if (armed) node.setAttribute('data-dismiss-intent', 'true')
      else node.removeAttribute('data-dismiss-intent')
    }

    function stopMotion() {
      if (frameRef.current !== null) cancelAnimationFrame(frameRef.current)
      frameRef.current = null
    }

    function settleTo(target: number, finalState: 'idle' | 'dismissed') {
      stopMotion()
      const node = nodeRef.current
      if (!node) return
      const reduceMotion = window.matchMedia?.(
        '(prefers-reduced-motion: reduce)',
      ).matches
      const start = offsetRef.current
      const distance = target - start
      if (reduceMotion || Math.abs(distance) < 0.5) {
        renderOffset(
          target,
          Math.max(1, axis === 'x' ? node.clientWidth : node.clientHeight),
        )
        setState(finalState)
        return
      }
      setState(finalState === 'idle' ? 'settling' : 'dismissed')
      const began = performance.now()
      const duration = Math.min(280, Math.max(140, Math.abs(distance) * 0.7))
      const tick = (now: number) => {
        const progress = Math.min(1, (now - began) / duration)
        const eased = 1 - Math.pow(1 - progress, 3)
        renderOffset(
          start + distance * eased,
          Math.max(1, axis === 'x' ? node.clientWidth : node.clientHeight),
        )
        if (progress < 1) frameRef.current = requestAnimationFrame(tick)
        else {
          frameRef.current = null
          setState(finalState)
        }
      }
      frameRef.current = requestAnimationFrame(tick)
    }

    function clearSession() {
      sessionRef.current = null
    }

    function cancelGesture() {
      const session = sessionRef.current
      if (!session) return
      const claimed = session.status === 'claimed'
      clearSession()
      if (claimed) {
        onDragEnd?.({ dismissed: false })
        settleTo(0, 'idle')
      } else setState('idle')
    }

    function handlePointerDown(event: ReactPointerEvent<HTMLDivElement>) {
      if (
        disabled ||
        committedRef.current ||
        !event.isPrimary ||
        event.button !== 0
      )
        return
      suppressClickRef.current = false
      if (
        event.pointerType === 'mouse' &&
        event.target instanceof Element &&
        event.target.closest(interactiveSelector)
      )
        return
      stopMotion()
      const node = nodeRef.current
      if (!node) return
      const rect = node.getBoundingClientRect()
      sessionRef.current = {
        pointerId: event.pointerId,
        startX: event.clientX,
        startY: event.clientY,
        startOffset: offsetRef.current,
        size: Math.max(1, axis === 'x' ? rect.width : rect.height),
        status: 'pending',
        samples: [{ position: offsetRef.current, time: event.timeStamp }],
      }
      setState('idle')
    }

    function handlePointerMove(event: ReactPointerEvent<HTMLDivElement>) {
      const session = sessionRef.current
      if (
        !session ||
        session.pointerId !== event.pointerId ||
        session.status === 'abandoned'
      )
        return
      const movementX = event.clientX - session.startX
      const movementY = event.clientY - session.startY
      if (session.status === 'pending') {
        const intent = resolveIntent(movementX, movementY, axis)
        if (intent === 'pending') return
        if (intent === 'abandon') {
          session.status = 'abandoned'
          setState('idle')
          return
        }
        session.status = 'claimed'
        event.currentTarget.setPointerCapture?.(event.pointerId)
        setState('dragging')
        onDragStart?.()
      }
      event.preventDefault()
      const rawOffset =
        session.startOffset + (axis === 'x' ? movementX : movementY)
      const direction = writingDirection(event.currentTarget)
      const signs = activeDirections.map((candidate) =>
        getPhysicalSign(candidate, direction),
      )
      const offset = applyResistance(rawOffset, signs)
      renderOffset(offset, session.size)
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
      clearSession()
      if (session.status !== 'claimed') {
        setState('idle')
        return
      }
      event.currentTarget.releasePointerCapture?.(event.pointerId)
      suppressClickRef.current = true
      const direction = writingDirection(event.currentTarget)
      const signs = activeDirections.map((candidate) =>
        getPhysicalSign(candidate, direction),
      )
      const velocity = canceled
        ? 0
        : getRecentVelocity(session.samples, event.timeStamp)
      const sign = canceled
        ? null
        : decideDismiss({
            offset: offsetRef.current,
            size: session.size,
            velocity,
            allowedSigns: signs,
            threshold,
          })
      const dismissedDirection =
        sign === null
          ? undefined
          : directionForSign(activeDirections, direction, sign)
      if (sign === null || !dismissedDirection) {
        onDragEnd?.({ dismissed: false })
        settleTo(0, 'idle')
        return
      }
      committedRef.current = true
      setState('dismissed')
      onDragEnd?.({ dismissed: true, direction: dismissedDirection })
      onDismiss?.({ direction: dismissedDirection })
      const margin = 16
      settleTo(sign * (session.size + margin), 'dismissed')
    }

    useEffect(() => {
      const cancel = () => cancelGesture()
      window.addEventListener('blur', cancel)
      return () => {
        window.removeEventListener('blur', cancel)
        stopMotion()
        sessionRef.current = null
      }
    }, [])

    useEffect(() => {
      if (disabled) cancelGesture()
    }, [disabled])

    const mechanicalStyle: DragStyle = {
      ...style,
      '--drag-dismiss-offset': `${offsetRef.current}px`,
      '--drag-dismiss-progress': 0,
      transform: `translate3d(${axis === 'x' ? offsetRef.current : 0}px, ${axis === 'y' ? offsetRef.current : 0}px, 0)`,
      touchAction: disabled
        ? style?.touchAction
        : axis === 'x'
          ? 'pan-y'
          : 'pan-x',
    }

    return (
      <div
        {...props}
        ref={nodeRef}
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
